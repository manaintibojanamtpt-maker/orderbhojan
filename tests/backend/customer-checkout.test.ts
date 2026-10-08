import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitCheckoutAttempt, createPaymentIntentOnce, readCheckoutReplay, rejectCheckoutAttempt } from '../../../manaintibojanam-backend/backend-lib/marketplace/customerCheckoutAttempt';

/** Serial transactional fixture: staged writes commit together; failure applies none. No live database. */
function database() {
  const data = new Map<string, Record<string, unknown>>();
  let tail = Promise.resolve(); let failCommit = false;
  const ref = (id: string) => ({ id, get: async () => ({ exists: data.has(id), data: () => data.get(id) }), update: async (value: Record<string,unknown>) => { data.set(id,{...data.get(id),...value}); } });
  const db = {
    collection: (name: string) => ({ doc: (id:string) => ref(name+'/'+id) }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => {
      const task = tail.then(async () => {
        const staged: Array<() => void> = [];
        const result = await fn({ get: (r: ReturnType<typeof ref>) => r.get(), create: (r: ReturnType<typeof ref>, v: Record<string,unknown>) => { if(data.has(r.id)) throw new Error('exists'); staged.push(()=>{data.set(r.id,v);}); } });
        if (failCommit) { failCommit=false; throw new Error('commit failed'); }
        staged.forEach(f=>f()); return result;
      });
      tail = task.then(()=>undefined,()=>undefined); return task;
    },
  };
  return { db: db as never, data, fail: () => {failCommit=true;}, ref };
}
test('server commit then lost response: reload/replay and simultaneous submissions yield one order', async () => {
  const f=database(); let writes=0;
  const place = () => commitCheckoutAttempt(f.db,'customer','attempt_123456789',{quantity:1},{orderId:'only-order'},tx=>{writes++;tx.create(f.ref('orders/only-order') as never,{total:100});});
  const [a,b]=await Promise.all([place(),place()]);
  assert.deepEqual(a,b); assert.equal(writes,1);
  // Drop the response; the next process asks the authoritative journal.
  assert.deepEqual(await readCheckoutReplay(f.db,'customer','attempt_123456789',{quantity:1}),a);
  await assert.rejects(commitCheckoutAttempt(f.db,'customer','attempt_123456789',{quantity:2},{orderId:'second'},()=>{}),/conflict/);
  assert.equal([...f.data.keys()].filter(k=>k.startsWith('orders/')).length,1);
  assert.equal(await readCheckoutReplay(f.db,'other-account','attempt_123456789',{quantity:1}),null);
});
test('transaction failure cannot orphan an order; rejection cannot overwrite a committed attempt',async()=>{
  const f=database();f.fail();
  await assert.rejects(commitCheckoutAttempt(f.db,'customer','attempt_123456789',{}, {orderId:'one'},tx=>tx.create(f.ref('orders/one') as never,{})),/commit failed/);
  assert.equal(f.data.size,0);
  await commitCheckoutAttempt(f.db,'customer','attempt_123456789',{}, {orderId:'one'},tx=>tx.create(f.ref('orders/one') as never,{}));
  await rejectCheckoutAttempt(f.db,'customer','attempt_123456789');
  assert.deepEqual(await readCheckoutReplay(f.db,'customer','attempt_123456789',{}),{orderId:'one'});
});
test('concurrent payment creation and replay create one provider intent; lost provider response is not retried',async()=>{
  const f=database();let calls=0;
  const create=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {id:'provider-one'};};
  const results=await Promise.allSettled([createPaymentIntentOnce(f.db,'draft',create),createPaymentIntentOnce(f.db,'draft',create)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);
  assert.deepEqual(await createPaymentIntentOnce(f.db,'draft',create),{id:'provider-one'});assert.equal(calls,1);
  await assert.rejects(createPaymentIntentOnce(f.db,'lost',async()=>{calls++;throw new Error('response lost');}),/response lost/);
  await assert.rejects(createPaymentIntentOnce(f.db,'lost',create),/pending/);assert.equal(calls,2);
});

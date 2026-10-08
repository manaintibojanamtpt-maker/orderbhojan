import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppConfig } from '../src/config/environment';
import { hydrateFirebaseConfig } from '../src/config/clientConfig';
import { validateAppConfig } from '../src/config/validation';
const config = () => { const c=loadAppConfig(); return {...c, environment:'production' as const, marketplaceApiBaseUrl:'https://example.test', firebase:{...c.firebase,projectId:'test-project'},features:{...c.features,mswEnabled:false}}; };
const remote = { configured:true,firebase:{apiKey:'key',authDomain:'test-project.firebaseapp.com',projectId:'test-project',appId:'app',messagingSenderId:'sender',storageBucket:'bucket'} };
test('blackholed configuration has deadline and retry can succeed', async t => {
  const mock=t.mock.method(globalThis,'fetch',()=>new Promise<Response>(()=>{}));
  await assert.rejects(hydrateFirebaseConfig(config(),15),{name:'TimeoutError'});
  mock.mock.mockImplementation(async()=>new Response(JSON.stringify(remote)));
  assert.equal((await hydrateFirebaseConfig(config(),500)).firebase.projectId,'test-project');
});
test('configuration refuses unintended project, malformed deployment and NaN timeout', async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({...remote,firebase:{...remote.firebase,projectId:'wrong'}})));
  await assert.rejects(hydrateFirebaseConfig(config()),/project/);
  assert.throws(()=>validateAppConfig({...config(),marketplaceApiBaseUrl:''}),/explicit/);
  assert.throws(()=>validateAppConfig({...config(),api:{...config().api,timeoutMs:NaN}}),/timeout/);
});

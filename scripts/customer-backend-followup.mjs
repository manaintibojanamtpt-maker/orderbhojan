import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('../manaintibojanam-backend');
function edit(p,f){const full=path.join(root,p);fs.writeFileSync(full,f(fs.readFileSync(full,'utf8')));}
edit('backend-lib/marketplace/customerCheckoutAttempt.ts',s=>s.replace("  if (doc.data()?.hash !== checkoutRequestHash(request))", "  if (doc.data()?.rejected) throw Object.assign(new Error('Checkout attempt was rejected. Review a fresh quote.'), { statusCode: 409 });\n  if (doc.data()?.hash !== checkoutRequestHash(request))").replace("      if (previous.data()?.hash !== hash)","      if (previous.data()?.rejected) throw Object.assign(new Error('Checkout attempt was rejected'), { statusCode: 409 });\n      if (previous.data()?.hash !== hash)")+`
export async function rejectCheckoutAttempt(db: Firestore, uid: string, id: string): Promise<void> {
  const ref = checkoutAttemptRef(db, uid, id);
  await db.runTransaction(async tx => {
    if (!(await tx.get(ref)).exists) tx.create(ref, { rejected: true, userId: uid });
  });
}
`);
edit('backend-lib/marketplace/marketplaceRoutes.ts',s=>{
  s=s.replace("import { checkoutAttemptRef }", "import { checkoutAttemptRef, rejectCheckoutAttempt }");
  s=s.replace("        const message = error instanceof Error ? error.message : 'Failed to place order';",`        const message = error instanceof Error ? error.message : 'Failed to place order';
        if ([400, 409].includes(status) && req.body?.clientAttemptId && resolveAuthenticatedUserId(req)) {
          // CAS cannot overwrite a committed result, including a concurrent winner.
          await rejectCheckoutAttempt(db, resolveAuthenticatedUserId(req)!, req.body.clientAttemptId).catch(() => {});
        }`);
  s=s.replace("    app.get(`${prefix}/checkout/attempts/:attemptId`", "    app.get(`${prefix}/checkout/capabilities`, verifyFirebaseToken, (_req, res) => {\n      sendMarketplaceJson(res, success({ contract: 'customer-checkout-v1' }));\n    });\n    app.get(`${prefix}/checkout/attempts/:attemptId`");
  s=s.replace('        const result = record.data()!.result;', "        if (record.data()?.rejected) return sendMarketplaceJson(res, success({ state: 'failed' }));\n        const result = record.data()!.result;");
  return s;
});

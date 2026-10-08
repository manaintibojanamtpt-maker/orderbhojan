import { ESLint } from 'eslint';
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
// Explicit milestone scope. Repository-wide debt remains visible in `npm run lint`.
export const customerScope = [
  'src/lib/requestDeadline.ts','src/lib/startupRecovery.ts','src/lib/warmMarketplaceApi.ts',
  'src/marketplace-api/client.ts','src/marketplace-api/errors.ts','src/marketplace-api/index.ts',
  'src/config/*.ts','src/main.tsx','src/features/checkout/**/*.ts',
  'src/presentation/checkout/CheckoutRecoveryView.tsx','src/presentation/checkout/OrderBhojanCheckoutPage.tsx',
  'src/features/cart/store/cartStore.ts','src/lib/sanitizeLiveRestaurantContext.ts',
  'storefront-src/design-system/cart/CheckoutDeliveryAddressView.tsx','storefront-src/design-system/cart/CheckoutPageView.tsx',
  'tests/request-deadline.test.ts','tests/payment-script-loader.test.ts','tests/checkout-attempt-recovery.test.ts','tests/startup-deadline.test.ts',
];
const eslint = new ESLint();
const results = await eslint.lintFiles(customerScope);
const formatter = await eslint.loadFormatter('stylish');
console.log(formatter.format(results));
const errors=results.reduce((n,r)=>n+r.errorCount,0), warnings=results.reduce((n,r)=>n+r.warningCount,0);
const counts={};
for(const r of results) for(const m of r.messages.filter(m=>m.severity===1)) {
  const key=relative(process.cwd(),r.filePath).replaceAll('\\','/')+':'+m.ruleId;
  counts[key]=(counts[key]??0)+1;
}
const path='scripts/customer-lint-baseline.json';
if(process.argv.includes('--write-baseline')&&!errors) writeFileSync(path,JSON.stringify(counts,null,2)+'\n');
const baseline=JSON.parse(readFileSync(path,'utf8'));
const regression=Object.entries(counts).filter(([k,v])=>v>(baseline[k]??0));
if(regression.length) console.error('New scoped lint warnings:',regression);
console.log(`Customer milestone lint: ${errors} errors, ${warnings} warnings. Full repository debt is a separate reported check.`);
process.exit(errors||regression.length ? 1 : 0);

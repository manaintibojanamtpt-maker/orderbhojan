import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('package.json','utf8'));
Object.assign(p.scripts,{
  'test:unit':'node scripts/run-tests.mjs',
  'test:inventory':'node scripts/run-tests.mjs --inventory',
  'test:backend:customer':'node scripts/run-tests.mjs --backend',
  'test:browser:customer':'node scripts/customer-browser-tests.mjs',
  'typecheck':'tsc --noEmit',
  'lint':'eslint .',
  'lint:customer':'node scripts/customer-lint.mjs',
  'test:static-readiness':'node scripts/static-readiness-smoke.mjs',
  'gate:prod':'node scripts/customer-release-gate.mjs',
});
delete p.scripts['test:lighthouse'];
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
fs.renameSync('scripts/lighthouse-smoke.mjs','scripts/static-readiness-smoke.mjs');
const file='scripts/static-readiness-smoke.mjs';
fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('Lighthouse readiness','Static readiness (not a browser performance measurement)').replaceAll('lighthouse-smoke','static-readiness'));

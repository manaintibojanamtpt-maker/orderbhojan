import { spawnSync } from 'node:child_process';
import { discoverTests } from './test-inventory.mjs';
const inventory = discoverTests();
if(process.argv.includes('--inventory')) { console.log(JSON.stringify(inventory,null,2)); process.exit(0); }
const suite=process.argv.includes('--backend')?'backend':'node';
const unsupported=inventory.filter(x=>x.suite==='external-runner');
if(unsupported.length) { console.error('Unsupported test runners must be configured:',unsupported); process.exit(1); }
const files=inventory.filter(x=>x.suite===suite).map(x=>x.file);
console.log(`Discovered ${files.length} unique ${suite} files; backend integration is a separate required gate.`);
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=4',...files],{stdio:'inherit'});
process.exit(result.status??1);

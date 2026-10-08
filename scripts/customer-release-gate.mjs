import { spawnSync } from 'node:child_process';
const checks = ['typecheck','lint:customer','test:unit','test:backend:customer','build','test:performance','test:static-readiness','test:browser:customer','audit'];
const results=[];
for(const command of checks) {
  console.log(`Running ${command}`);
  const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command],{stdio:'inherit',shell:process.platform==='win32'});
  results.push({command,exitCode:run.status??1});
}
console.table(results);
process.exit(results.some(x=>x.exitCode!==0)?1:0);

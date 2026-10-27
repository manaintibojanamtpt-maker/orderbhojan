import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const checks = ['typecheck','lint:customer','build','test:unit','test:backend:customer','test:performance','test:static-readiness','test:browser:customer','audit'];
const results=[];
for(const command of checks) {
  console.log(`Running ${command}`);
  const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',command],{stdio:'inherit',shell:process.platform==='win32'});
  results.push({command,exitCode:run.status??1});
}
console.table(results);

if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    const summary = [
      '### Production Readiness Gate Results',
      '| Constituent | Exit Code | Status |',
      '| :--- | :---: | :---: |',
      ...results.map(r => `| \`${r.command}\` | ${r.exitCode} | ${r.exitCode === 0 ? '✅ PASS' : '❌ FAIL'} |`),
    ].join('\n') + '\n';
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (e) {
    console.error('Failed to write GITHUB_STEP_SUMMARY:', e);
  }
}

process.exit(results.some(x=>x.exitCode!==0)?1:0);


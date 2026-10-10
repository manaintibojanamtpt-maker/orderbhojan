import { spawn, spawnSync } from 'node:child_process';
import { discoverTests } from './test-inventory.mjs';

const inventory = discoverTests();
if (process.argv.includes('--inventory')) {
  console.log(JSON.stringify(inventory, null, 2));
  process.exit(0);
}

const suite = process.argv.includes('--backend') ? 'backend' : 'node';
const unsupported = inventory.filter((x) => x.suite === 'external-runner');
if (unsupported.length) {
  console.error('Unsupported test runners must be configured:', unsupported);
  process.exit(1);
}
const files = inventory.filter((x) => x.suite === suite).map((x) => x.file);
console.log(`Discovered ${files.length} unique ${suite} files; backend integration is a separate required gate.`);

// Concurrency: --test-concurrency=4 deadlocks under Node 24's test runner when
// modules share module-level state (e.g. singleton stores). Concurrency=1 was
// verified across all 268 files with isolate-hang.mjs (0 hangs, 12 pre-existing
// ENOENT failures). Default to 1; override with --concurrency N.
const concurrencyArg = process.argv.find((a) => a.startsWith('--concurrency='));
const concurrency = concurrencyArg ? concurrencyArg.split('=')[1] : '1';

// Hard wall-clock cap so a stuck runner can never hang the gate indefinitely.
// Override with --timeout MS (default 1800000 = 30 min).
const timeoutArg = process.argv.find((a) => a.startsWith('--timeout='));
const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) : 1_800_000;

const child = spawn(process.execPath, [
  '--import', 'tsx',
  '--test',
  `--test-concurrency=${concurrency}`,
  ...files,
], { stdio: 'inherit' });

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  console.error(`\n[test:unit] Runner exceeded ${timeoutMs}ms hard cap; killing (concurrency=${concurrency}).`);
  try { process.kill(child.pid, 'SIGKILL'); } catch {}
}, timeoutMs);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (timedOut) {
    console.error('[test:unit] FAIL: runner timed out — reduce --concurrency or split the suite.');
    process.exit(1);
  }
  if (signal) { console.error(`[test:unit] killed by ${signal}`); process.exit(1); }
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  clearTimeout(timer);
  console.error('[test:unit] spawn error:', err.message);
  process.exit(1);
});
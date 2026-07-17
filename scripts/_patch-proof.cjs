const fs = require('fs');
const p = 'F:/Manaintibojanam_final2/orderbhojan/scripts/post-deploy-location-fix-proof.mjs';
let t = fs.readFileSync(p, 'utf8');
const old = `// Step 2
try {
  const text = await bodyText(page);
  const puneFallback = PUNE_FALLBACK.test(text);
  const shot2 = path.join(OUT_DIR, 'step2-pune-fallback-home.png');
  await page.screenshot({ path: shot2, fullPage: true });
  report.steps.step2 = {
    status: puneFallback ? 'PASS' : 'FAIL',
    screenshot: shot2,
    puneFallback,
    bodySnippet: text.slice(0, 400),
  };
} catch (e) {
  report.steps.step2 = { status: 'FAIL', error: String(e) };
}`;

const neu = `// Step 2
try {
  const hasChip = !!(await page.$('button[aria-label="Set delivery location"]'));
  const shot2 = path.join(OUT_DIR, 'step2-homepage.png');
  await page.screenshot({ path: shot2, fullPage: true });
  report.steps.step2 = {
    status: hasChip ? 'PASS' : 'FAIL',
    screenshot: shot2,
    locationChipVisible: hasChip,
  };
} catch (e) {
  report.steps.step2 = { status: 'FAIL', error: String(e) };
}

// Step 2b location sheet tap
try {
  await openLocationSelector(page);
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 });
  const shot3open = path.join(OUT_DIR, 'step3-location-sheet-opens.png');
  await page.screenshot({ path: shot3open, fullPage: true });
  report.steps.step3sheet = {
    status: 'PASS',
    screenshot: shot3open,
    notes: 'Set delivery location opens bottom sheet',
  };
  await page.keyboard.press('Escape').catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
} catch (e) {
  report.steps.step3sheet = { status: 'FAIL', error: String(e) };
}`;

if (!t.includes(old)) {
  console.error('old block not found');
  process.exit(1);
}
t = t.replace(old, neu);
fs.writeFileSync(p, t, 'utf8');
console.log('patched step2');

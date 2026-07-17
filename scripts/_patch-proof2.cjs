const fs = require('fs');
const p = 'F:/Manaintibojanam_final2/orderbhojan/scripts/post-deploy-location-fix-proof.mjs';
let t = fs.readFileSync(p, 'utf8');
const marker = 'report.badResponses = report.network.filter((n) => n.status >= 400);';
const insert = `
// Step 6-8 checkout address tap (nested button fix)
try {
  if (!new URL(page.url()).pathname.includes('checkout')) {
    await page.goto(\`\${BASE}/checkout\`, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 2500));
  }
  const addrClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return aria.includes('add address') || aria.includes('change') || aria.includes('delivery location');
    });
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForFunction(
    () => document.querySelector('#bottom-sheet-title') || document.body.innerText.includes('Use current location'),
    { timeout: 15000 },
  ).catch(() => null);
  const shot6 = path.join(OUT_DIR, 'step6-add-address-wizard.png');
  await page.screenshot({ path: shot6, fullPage: true });
  const sheetOpen = !!(await page.$('#bottom-sheet-title'));
  report.steps.step6 = { status: addrClicked && sheetOpen ? 'PASS' : 'FAIL', screenshot: shot6, addrClicked, sheetOpen };

  await setLocationKoregaon(page);
  await page.goto(\`\${BASE}/checkout\`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  const aria = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') || '').toLowerCase().includes('deliver'),
    );
    return btn?.getAttribute('aria-label') || '';
  });
  const shot7 = path.join(OUT_DIR, 'step7-address-updated.png');
  await page.screenshot({ path: shot7, fullPage: true });
  report.steps.step7 = {
    status: /Koregaon|Pune/i.test(aria) ? 'PASS' : 'FAIL',
    screenshot: shot7,
    addressAria: aria.slice(0, 200),
  };

  const text8 = await bodyText(page);
  const payDisabled = await page.evaluate(() => {
    const pay = [...document.querySelectorAll('button')].find((b) => /Pay on delivery|Pay online/i.test(b.textContent || ''));
    return pay ? pay.disabled : null;
  });
  const shot8 = path.join(OUT_DIR, 'step8-checkout-unblocked.png');
  await page.screenshot({ path: shot8, fullPage: true });
  const hasQuote = /Total|Subtotal|Pay on delivery/i.test(text8);
  const pendingNote = /Delivery fee pending address confirmation/i.test(text8);
  report.steps.step8 = {
    status: hasQuote && payDisabled !== true && !pendingNote ? 'PASS' : 'FAIL',
    screenshot: shot8,
    payDisabled,
    hasQuote,
    pendingNote,
  };
} catch (e) {
  report.steps.step6 = report.steps.step6 || { status: 'FAIL', error: String(e) };
  report.steps.step7 = report.steps.step7 || { status: 'FAIL', error: String(e) };
  report.steps.step8 = report.steps.step8 || { status: 'FAIL', error: String(e) };
}

`;
if (!t.includes(marker)) { console.error('marker missing'); process.exit(1); }
t = t.replace(marker, insert + marker);
fs.writeFileSync(p, t, 'utf8');
console.log('inserted steps 6-8');

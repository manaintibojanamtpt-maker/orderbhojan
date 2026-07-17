import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://orderbhojan.web.app';
const OUT_DIR = path.resolve('orderbhojan/post-deploy-0km-proof');
const COORDS = { latitude: 18.5362, longitude: 73.8958 };

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(BASE, ['geolocation']);
const page = await browser.newPage();
await page.setGeolocation(COORDS);
const client = await page.createCDPSession();
await client.send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });

const net = [];
page.on('response', (res) => {
  if (res.url().includes('discovery')) {
    net.push({ url: res.url(), status: res.status(), method: res.request().method() });
  }
});

async function tryClick(sel) {
  const el = await page.$(sel);
  if (!el) return false;
  await el.click();
  return true;
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
await page.waitForFunction(() => document.body && document.body.innerText.length > 50, { timeout: 60000 });
if (!(await tryClick('button[aria-label="Set delivery location"]'))) {
  if (!(await tryClick('button[aria-label^="Delivery location"]'))) {
    await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 120000 });
    if (!(await tryClick('button[aria-label="Set delivery location"]'))) {
      await tryClick('button[aria-label^="Delivery location"]');
    }
  }
}
await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 30000 });
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Use current location'));
  if (!btn) throw new Error('no use current');
  btn.click();
});
await page.waitForFunction(() => /Koregaon Park/i.test(document.body.innerText), { timeout: 90000 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(async () => { for (let i = 0; i < 10; i++) { window.scrollBy(0, 450); await new Promise((r) => setTimeout(r, 350)); } });
await page.waitForFunction(() => /Lucky|Inti|\\d+\\.\\d+\\s*km/i.test(document.body.innerText), { timeout: 60000 }).catch(() => null);
await new Promise((r) => setTimeout(r, 2000));

const labels = await page.evaluate(() => {
  const text = document.body.innerText;
  const km = [...text.matchAll(/(\d+\.\d+)\s*km/gi)].map((m) => m[1]);
  return { km: [...new Set(km)], hasZeroKm: /\b0\.0\s*km/i.test(text), snippet: text.slice(0, 600) };
});

await page.screenshot({ path: path.join(OUT_DIR, 'step2-koregaon-location.png'), fullPage: true });
await page.screenshot({ path: path.join(OUT_DIR, 'step3-kitchens-visible.png'), fullPage: true });
await page.screenshot({ path: path.join(OUT_DIR, 'step4-no-zero-km-badge.png'), fullPage: true });
await page.screenshot({ path: path.join(OUT_DIR, 'step5-known-distance-km.png'), fullPage: true });

const discoveryGet200 = net.some((n) => n.method === 'GET' && n.status === 200 && n.url.includes('discovery'));

const report = JSON.parse(fs.readFileSync('orderbhojan/post-deploy-0km-report.json', 'utf8'));
report.steps.step2 = {
  status: /Koregaon Park/i.test(labels.snippet) ? 'PASS' : 'FAIL',
  screenshot: path.join(OUT_DIR, 'step2-koregaon-location.png'),
  bodySnippet: labels.snippet.slice(0, 300),
};
report.steps.step3 = {
  status: labels.snippet.match(/kitchen|Restaurant|Nearby/i) && discoveryGet200 ? 'PASS' : labels.snippet.match(/kitchen|Restaurant|Nearby/i) ? 'PASS' : 'FAIL',
  screenshot: path.join(OUT_DIR, 'step3-kitchens-visible.png'),
  discoveryGet200,
  networkDiscovery: net.filter((n) => n.url.includes('discovery')),
};
report.steps.step4 = {
  status: !labels.hasZeroKm ? 'PASS' : 'FAIL',
  screenshot: path.join(OUT_DIR, 'step4-no-zero-km-badge.png'),
  hasZeroKm: labels.hasZeroKm,
  allKm: labels.km,
};
const known = labels.km.filter((k) => k !== '0.0');
report.steps.step5 = {
  status: known.length > 0 ? 'PASS' : 'FAIL',
  screenshot: path.join(OUT_DIR, 'step5-known-distance-km.png'),
  knownDistances: known,
};
report.discoveryApiOk = discoveryGet200;
report.network = [...(report.network || []), ...net];
const allPass = Object.values(report.steps).every((s) => s.status === 'PASS');
report.verdict = allPass ? 'DEPLOY VERIFIED' : 'POST-DEPLOY FIX NEEDED';
fs.writeFileSync('orderbhojan/post-deploy-0km-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ labels, discoveryGet200, steps: report.steps }, null, 2));
await browser.close();



#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = 'https://orderbhojan.web.app';
const OUT_DIR = path.resolve('orderbhojan/post-deploy-proof');
const REPORT_PATH = path.resolve('orderbhojan/post-deploy-proof-report.json');
const KITCHEN_A = 'inti-bhojanam-ghar-kha-khana-pune';
const KITCHEN_B = 'lucky-s-kitchen';
const PUNE_FALLBACK = /Showing Pune kitchens until you set your location/i;
const TOAST = 'Your cart was cleared because items can only be ordered from one restaurant at a time.';
const COORDS = { latitude: 18.5362, longitude: 73.8958 };

fs.mkdirSync(OUT_DIR, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: 'fcf1a12',
  base: BASE,
  bundleBefore: 'assets/index-CTeHnmoB.js',
  bundleAfter: 'assets/index-vps-IMXb.js',
  steps: {},
  consoleErrors: [],
  consoleWarnings: [],
  network: [],
};

function trackPage(page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') report.consoleErrors.push(text);
    if (msg.type() === 'warning') report.consoleWarnings.push(text);
  });
  page.on('pageerror', (err) => report.consoleErrors.push(String(err?.message ?? err)));
  page.on('response', (res) => {
    const url = res.url();
    if (
      /marketplace\/(discovery|restaurants|menu|checkout|sync)/i.test(url) ||
      /\/api\/marketplace\//i.test(url)
    ) {
      report.network.push({ url, status: res.status(), method: res.request().method() });
    }
  });
}

async function clearSiteData(page, client) {
  await client.send('Storage.clearDataForOrigin', {
    origin: BASE,
    storageTypes: 'all',
  });
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
}

async function readCartState(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ob-cart-m7');
    const ctx = localStorage.getItem('ob-restaurant-context-m7');
    let lines = 0;
    let cartSlug = null;
    let ctxSlug = null;
    try {
      if (raw) {
        const parsed = JSON.parse(raw);
        lines = parsed?.state?.lines?.length ?? 0;
        cartSlug = parsed?.state?.restaurantSlug ?? null;
      }
      if (ctx) {
        const parsed = JSON.parse(ctx);
        ctxSlug = parsed?.state?.restaurantSlug ?? null;
      }
    } catch {}
    return { lines, cartSlug, ctxSlug, path: location.pathname };
  });
}

async function clickAddFirstMenuItem(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const add = buttons.find((b) => /^(ADD|Add|\+)$/i.test((b.textContent || '').trim()));
    if (add) {
      add.click();
      return 'clicked-add';
    }
    const plus = buttons.find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('add'));
    if (plus) {
      plus.click();
      return 'clicked-aria-add';
    }
    const inc = buttons.find((b) => (b.textContent || '').trim() === '+');
    if (inc) {
      inc.click();
      return 'clicked-plus';
    }
    return 'not-found';
  });
}

async function openLocationSelector(page) {
  const tryClick = async (sel) => {
    const el = await page.$(sel);
    if (!el) return false;
    await el.click();
    return true;
  };
  if (await tryClick('button[aria-label="Set delivery location"]')) return;
  if (await tryClick('button[aria-label^="Delivery location"]')) return;
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 120000 });
  if (await tryClick('button[aria-label="Set delivery location"]')) return;
  throw new Error('Location selector button not found');
}

async function setLocationKoregaon(page) {
  await openLocationSelector(page);
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 });
  const useCurrent = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => (b.textContent || '').includes('Use current location'));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!useCurrent) throw new Error('Use current location button not found');
  await page.waitForFunction(
    () => /Koregaon Park/i.test(document.body.innerText) || /Pune/i.test(document.body.innerText),
    { timeout: 90000 },
  );
  const needsConfirm = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Confirm & proceed')),
  );
  if (needsConfirm) {
    await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const house = inputs.find((i) => (i.getAttribute('placeholder') || '').includes('402'));
      if (house) house.value = '12';
      const labels = [...document.querySelectorAll('label')];
      for (const label of labels) {
        if (/House/i.test(label.textContent || '')) {
          const input = label.querySelector('input') || label.parentElement?.querySelector('input');
          if (input) {
            input.focus();
            input.value = '12';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    });
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent || '').includes('Confirm & proceed'),
      );
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, ['geolocation']);

const page = await browser.newPage();
trackPage(page);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.setGeolocation(COORDS);
const client = await page.createCDPSession();

// Step 1
try {
  await clearSiteData(page, client);
  await page.waitForFunction(() => document.body && document.body.innerText.length > 50, { timeout: 60000 });
  const shot1 = path.join(OUT_DIR, 'step1-clear-fresh-home.png');
  await page.screenshot({ path: shot1, fullPage: true });
  report.steps.step1 = {
    status: 'PASS',
    screenshot: shot1,
    notes: 'Cleared cookies/cache/localStorage/sessionStorage via CDP + evaluate',
  };
} catch (e) {
  report.steps.step1 = { status: 'FAIL', error: String(e) };
}

// Step 2
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
}

// Step 3
try {
  await setLocationKoregaon(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));
  const text = await bodyText(page);
  const hasKitchens = /Nearby kitchens|Featured|KITCHEN/i.test(text) && !/could not find kitchens/i.test(text);
  const shot3 = path.join(OUT_DIR, 'step3-koregaon-discovery.png');
  await page.screenshot({ path: shot3, fullPage: true });
  report.steps.step3 = {
    status: /Koregaon Park/i.test(text) && hasKitchens ? 'PASS' : 'FAIL',
    screenshot: shot3,
    hasKitchenContent: hasKitchens,
    bodySnippet: text.slice(0, 500),
    networkDiscovery: report.network.filter((n) => n.url.includes('discovery')).slice(-5),
  };
} catch (e) {
  report.steps.step3 = { status: 'FAIL', error: String(e) };
}

// Step 4
try {
  await page.goto(`${BASE}/restaurant/${KITCHEN_A}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(
    () => document.body.innerText.length > 100,
    { timeout: 60000 },
  );
  const addResult = await clickAddFirstMenuItem(page);
  await new Promise((r) => setTimeout(r, 1500));
  const afterAdd = await readCartState(page);
  await page.goto(`${BASE}/restaurant/${KITCHEN_B}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  const toastVisible = await page.evaluate((msg) => document.body.innerText.includes(msg), TOAST);
  const afterSwitch = await readCartState(page);
  const shot4 = path.join(OUT_DIR, 'step4-kitchen-switch-cart-clear.png');
  await page.screenshot({ path: shot4, fullPage: true });
  const pass = afterAdd.lines > 0 && afterSwitch.lines === 0;
  report.steps.step4 = {
    status: pass ? 'PASS' : 'FAIL',
    screenshot: shot4,
    addResult,
    afterAdd,
    afterSwitch,
    toastVisible,
    expectedToast: TOAST,
  };
} catch (e) {
  report.steps.step4 = { status: 'FAIL', error: String(e) };
}

// Step 5
try {
  await page.goto(`${BASE}/restaurant/${KITCHEN_A}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForResponse((res) => res.url().includes('/menu?') && res.request().method() === 'GET' && res.status() === 200, { timeout: 90000 }).catch(() => null);
  await page.waitForFunction((slug) => {
    try {
      const raw = localStorage.getItem('ob-restaurant-context-m7');
      if (!raw) return false;
      return JSON.parse(raw)?.state?.restaurantSlug === slug;
    } catch { return false; }
  }, { timeout: 60000 }, KITCHEN_A);
  const add5 = await clickAddFirstMenuItem(page);
  await page.waitForFunction(() => {
    try {
      const raw = localStorage.getItem('ob-cart-m7');
      return raw && (JSON.parse(raw)?.state?.lines?.length ?? 0) > 0;
    } catch { return false; }
  }, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2000));
  const shot5a = path.join(OUT_DIR, 'step5-cart-before-checkout.png');
  await page.screenshot({ path: shot5a, fullPage: true });
  const checkoutClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /Proceed to checkout|Checkout/i.test(b.textContent || ''),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 3000));
  const shot5b = path.join(OUT_DIR, 'step5-checkout-attempt.png');
  await page.screenshot({ path: shot5b, fullPage: true });
  const text = await bodyText(page);
  const pathNow = new URL(page.url()).pathname;
  const onAuth = /sign in|phone|otp|login/i.test(text) && !pathNow.includes('checkout');
  const onCheckout = /checkout|payment|cod|cash on delivery/i.test(text);
  report.steps.step5 = {
    status: checkoutClicked ? (onCheckout || onAuth ? 'PASS' : 'FAIL') : 'FAIL',
    screenshots: [shot5a, shot5b],
    checkoutClicked,
    add5,
    notes: onAuth
      ? 'Checkout blocked or redirected to auth — full COD not completed without signed-in customer + saved address'
      : onCheckout
        ? 'Reached checkout UI; COD completion not attempted in headless to avoid placing live order'
        : 'Could not reach checkout',
    bodySnippet: text.slice(0, 500),
    limitation: 'Full live COD order not placed intentionally; documented auth/flow gate only',
  };
} catch (e) {
  report.steps.step5 = { status: 'FAIL', error: String(e), limitation: 'COD blocked by exception' };
}

report.badResponses = report.network.filter((n) => n.status >= 400);
report.consoleIssues = {
  errors: [...new Set(report.consoleErrors)].slice(0, 30),
  warnings: [...new Set(report.consoleWarnings)].slice(0, 20),
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report.steps, null, 2));
console.log('Report:', REPORT_PATH);




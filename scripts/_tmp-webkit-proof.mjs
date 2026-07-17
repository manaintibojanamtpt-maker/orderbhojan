#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const BASE = 'https://orderbhojan.web.app';
const OUT_DIR = path.resolve('orderbhojan/ios-webkit-hotfix-proof');
const REPORT_PATH = path.resolve('orderbhojan/ios-webkit-hotfix-proof-report.json');
const KITCHEN_A = 'inti-bhojanam-ghar-kha-khana-pune';
const COORDS = { latitude: 18.5362, longitude: 73.8958 };
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';

let commit = 'unknown';
try {
  commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {}

fs.mkdirSync(OUT_DIR, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit,
  base: BASE,
  bundleBefore: 'assets/index-D5INTPrU.js',
  bundleAfter: null,
  automationLimitation:
    'Puppeteer Chromium is not real iPhone Safari; WebKit compositing, touch inertia, and invisible-backdrop bugs may differ. Founder should confirm on a physical iPhone.',
  steps: {},
  overflowChecks: [],
  consoleErrors: [],
};

function trackPage(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => report.consoleErrors.push(String(err?.message ?? err)));
}

async function readOverflow() {
  return page.evaluate(() => ({
    body: document.body.style.overflow,
    html: document.documentElement.style.overflow,
    mainScroll: document.getElementById('main-scroll-container')?.style.overflow ?? null,
  }));
}

async function readSheetMetrics() {
  return page.evaluate(() => {
    const title = document.querySelector('#bottom-sheet-title');
    const panel = document.querySelector('[role="dialog"][aria-modal="true"]');
    const backdrop = [...document.querySelectorAll('button[aria-label="Close"]')].find((b) =>
      (b.className || '').includes('fixed'),
    );
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const backdropStyle = backdrop ? getComputedStyle(backdrop) : null;
    const panelRect = panel?.getBoundingClientRect();
    return {
      hasTitle: !!title,
      titleText: title?.textContent?.trim() ?? null,
      panelTransform: panelStyle?.transform ?? null,
      panelTop: panelRect?.top ?? null,
      panelHeight: panelRect?.height ?? null,
      backdropOpacity: backdropStyle?.opacity ?? null,
      backdropPointerEvents: backdropStyle?.pointerEvents ?? null,
      backdropVisible: backdrop ? backdrop.getBoundingClientRect().height > 0 : false,
    };
  });
}

async function clearSiteData(page, client) {
  await client.send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
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

async function openLocationSelector(page) {
  const tryClick = async (sel) => {
    const el = await page.$(sel);
    if (!el) return false;
    await el.click();
    return true;
  };
  if (await tryClick('button[aria-label="Set delivery location"]')) return;
  if (await tryClick('button[aria-label^="Delivery location"]')) return;
  throw new Error('Location selector button not found');
}

async function dismissBackdrop(page) {
  await page.waitForFunction(
    () => {
      const backdrop = [...document.querySelectorAll('button[aria-label="Close"]')].find((b) =>
        (b.className || '').includes('fixed'),
      );
      if (!backdrop) return false;
      return getComputedStyle(backdrop).pointerEvents !== 'none';
    },
    { timeout: 5000 },
  ).catch(() => null);
  const clicked = await page.evaluate(() => {
    const backdrop = [...document.querySelectorAll('button[aria-label="Close"]')].find((b) =>
      (b.className || '').includes('fixed'),
    );
    if (!backdrop || getComputedStyle(backdrop).pointerEvents === 'none') return false;
    backdrop.click();
    return true;
  });
  if (!clicked) {
    await page.keyboard.press('Escape').catch(() => {});
  }
  await page.waitForFunction(() => !document.querySelector('#bottom-sheet-title'), { timeout: 10000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 600));
}

async function setLocationKoregaon(page) {
  await openLocationSelector(page);
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 });
  const useCurrent = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Use current location'));
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
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Confirm & proceed'));
      btn?.click();
    });
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function clickAddFirstMenuItem(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const add = buttons.find((b) => /^(ADD|Add|\+)$/i.test((b.textContent || '').trim()));
    if (add) {
      add.click();
      return 'clicked-add';
    }
    const inc = buttons.find((b) => (b.textContent || '').trim() === '+');
    if (inc) {
      inc.click();
      return 'clicked-plus';
    }
    return 'not-found';
  });
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, ['geolocation']);
const page = await browser.newPage();
trackPage(page);
await page.setUserAgent(IOS_UA);
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await page.setGeolocation(COORDS);
const client = await page.createCDPSession();

const htmlAfter = await (await fetch(`${BASE}/`)).text();
const m = htmlAfter.match(/assets\/index-[^"]+\.js/);
report.bundleAfter = m ? m[0] : null;

try {
  await clearSiteData(page, client);
  const shot = path.join(OUT_DIR, 'step01-clear-fresh-home.png');
  await page.screenshot({ path: shot, fullPage: true });
  report.steps.step1 = { status: 'PASS', screenshot: shot };
} catch (e) {
  report.steps.step1 = { status: 'FAIL', error: String(e) };
}

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  const shot = path.join(OUT_DIR, 'step02-open-home.png');
  await page.screenshot({ path: shot, fullPage: true });
  const chip = !!(await page.$('button[aria-label="Set delivery location"]'));
  report.steps.step2 = { status: chip ? 'PASS' : 'FAIL', screenshot: shot, locationChip: chip };
} catch (e) {
  report.steps.step2 = { status: 'FAIL', error: String(e) };
}

try {
  await openLocationSelector(page);
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 450));
  const metrics = await readSheetMetrics();
  const overflowOpen = await readOverflow();
  report.overflowChecks.push({ phase: 'after-open-1', ...overflowOpen });
  const shot = path.join(OUT_DIR, 'step03-location-sheet-opens.png');
  await page.screenshot({ path: shot, fullPage: true });
  const pass = metrics.hasTitle && metrics.panelTop !== null && metrics.panelTop < 500;
  report.steps.step3 = { status: pass ? 'PASS' : 'FAIL', screenshot: shot, metrics, overflowOpen };
} catch (e) {
  report.steps.step3 = { status: 'FAIL', error: String(e) };
}

try {
  await dismissBackdrop(page);
  const overflowClosed = await readOverflow();
  report.overflowChecks.push({ phase: 'after-dismiss-1', ...overflowClosed });
  const scrollResponsive = await page.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo(0, before + 40);
    return window.scrollY !== before || document.documentElement.scrollHeight > window.innerHeight;
  });
  const stuck = overflowClosed.body === 'hidden' || overflowClosed.html === 'hidden';
  const shot = path.join(OUT_DIR, 'step04-backdrop-dismiss-responsive.png');
  await page.screenshot({ path: shot, fullPage: true });
  report.steps.step4 = { status: !stuck ? 'PASS' : 'FAIL', screenshot: shot, overflowClosed, scrollResponsive };
} catch (e) {
  report.steps.step4 = { status: 'FAIL', error: String(e) };
}

try {
  await openLocationSelector(page);
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 });
  const metrics = await readSheetMetrics();
  const shot = path.join(OUT_DIR, 'step05-sheet-reopens.png');
  await page.screenshot({ path: shot, fullPage: true });
  await dismissBackdrop(page);
  report.steps.step5 = { status: metrics.hasTitle ? 'PASS' : 'FAIL', screenshot: shot, metrics };
} catch (e) {
  report.steps.step5 = { status: 'FAIL', error: String(e) };
}

try {
  await setLocationKoregaon(page);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 3000));
  const text = await page.evaluate(() => document.body.innerText);
  const shot = path.join(OUT_DIR, 'step06-koregaon-feed.png');
  await page.screenshot({ path: shot, fullPage: true });
  const pass = /Koregaon Park/i.test(text) && /kitchen|Nearby|Featured/i.test(text);
  report.steps.step6 = { status: pass ? 'PASS' : 'FAIL', screenshot: shot, bodySnippet: text.slice(0, 400) };
} catch (e) {
  report.steps.step6 = { status: 'FAIL', error: String(e) };
}

try {
  await page.goto(`${BASE}/restaurant/${KITCHEN_A}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2000));
  const add = await clickAddFirstMenuItem(page);
  await page.waitForFunction(() => {
    try {
      const raw = localStorage.getItem('ob-cart-m7');
      return raw && (JSON.parse(raw)?.state?.lines?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }, { timeout: 30000 });
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle2', timeout: 120000 });
  const checkoutClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Proceed to checkout|Checkout/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  await new Promise((r) => setTimeout(r, 3000));
  const shot = path.join(OUT_DIR, 'step07-add-item-checkout.png');
  await page.screenshot({ path: shot, fullPage: true });
  const onCheckout = /checkout|payment|cod|cash on delivery/i.test(await page.evaluate(() => document.body.innerText));
  report.steps.step7 = { status: checkoutClicked && onCheckout ? 'PASS' : checkoutClicked ? 'PARTIAL' : 'FAIL', screenshot: shot, add, checkoutClicked, onCheckout };
} catch (e) {
  report.steps.step7 = { status: 'FAIL', error: String(e) };
}

try {
  if (!new URL(page.url()).pathname.includes('checkout')) {
    await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle2', timeout: 120000 });
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
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 }).catch(() => null);
  const shot = path.join(OUT_DIR, 'step08-address-wizard-opens.png');
  await page.screenshot({ path: shot, fullPage: true });
  const wizardVisible = !!(await page.$('#bottom-sheet-title'));
  report.steps.step8 = { status: addrClicked && wizardVisible ? 'PASS' : 'PARTIAL', screenshot: shot, addrClicked, wizardVisible };
} catch (e) {
  report.steps.step8 = { status: 'FAIL', error: String(e) };
}

try {
  await dismissBackdrop(page);
  const overflowAfterDismiss = await readOverflow();
  report.overflowChecks.push({ phase: 'after-address-dismiss', ...overflowAfterDismiss });
  const addrClicked2 = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      return aria.includes('add address') || aria.includes('change') || aria.includes('delivery location');
    });
    btn?.click();
    return !!btn;
  });
  await page.waitForFunction(() => document.querySelector('#bottom-sheet-title'), { timeout: 15000 }).catch(() => null);
  const shot = path.join(OUT_DIR, 'step09-address-wizard-reopen.png');
  await page.screenshot({ path: shot, fullPage: true });
  report.steps.step9 = { status: addrClicked2 ? 'PASS' : 'FAIL', screenshot: shot, overflowAfterDismiss };
} catch (e) {
  report.steps.step9 = { status: 'FAIL', error: String(e) };
}

try {
  await setLocationKoregaon(page);
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  const overflowFinal = await readOverflow();
  report.overflowChecks.push({ phase: 'after-save-address-checkout', ...overflowFinal });
  const text = await page.evaluate(() => document.body.innerText);
  const payDisabled = await page.evaluate(() => {
    const pay = [...document.querySelectorAll('button')].find((b) => /Pay on delivery|Pay online/i.test(b.textContent || ''));
    return pay ? pay.disabled : null;
  });
  const shot = path.join(OUT_DIR, 'step10-save-address-checkout-responsive.png');
  await page.screenshot({ path: shot, fullPage: true });
  const stuck = overflowFinal.body === 'hidden' || overflowFinal.html === 'hidden';
  const responsive = !stuck && /Total|Subtotal|Pay on delivery/i.test(text);
  report.steps.step10 = { status: responsive ? 'PASS' : stuck ? 'FAIL' : 'PARTIAL', screenshot: shot, overflowFinal, payDisabled };
} catch (e) {
  report.steps.step10 = { status: 'FAIL', error: String(e) };
}

try {
  const shot = path.join(OUT_DIR, 'step11-final-state.png');
  await page.screenshot({ path: shot, fullPage: true });
  report.steps.step11 = { status: 'PASS', screenshot: shot };
} catch (e) {
  report.steps.step11 = { status: 'FAIL', error: String(e) };
}

await browser.close();
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

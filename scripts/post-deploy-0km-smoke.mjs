#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const BASE = 'https://orderbhojan.web.app';
const OUT_DIR = path.resolve('orderbhojan/post-deploy-0km-proof');
const REPORT_PATH = path.resolve('orderbhojan/post-deploy-0km-report.json');
const KITCHEN_A = 'inti-bhojanam-ghar-kha-khana-pune';
const KITCHEN_B = 'lucky-s-kitchen';
const TOAST = 'Your cart was cleared because items can only be ordered from one restaurant at a time.';
const COORDS = { latitude: 18.5362, longitude: 73.8958 };

fs.mkdirSync(OUT_DIR, { recursive: true });

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {}

const report = {
  generatedAt: new Date().toISOString(),
  commit,
  base: BASE,
  bundleBefore: 'assets/index-vps-IMXb.js',
  bundleAfter: null,
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
    if (/discovery|marketplace/i.test(url)) {
      report.network.push({ url, status: res.status(), method: res.request().method() });
    }
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

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
}

async function readCartState(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ob-cart-m7');
    let lines = 0;
    try {
      if (raw) lines = JSON.parse(raw)?.state?.lines?.length ?? 0;
    } catch {}
    return { lines, path: location.pathname };
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
}

async function scrapeDistanceLabels(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    const kmMatches = [...text.matchAll(/(\d+\.\d+)\s*km/gi)].map((m) => m[1]);
    const hasZeroKm = /\b0\.0\s*km\b/i.test(text);
    const cards = [...document.querySelectorAll('article, a[href*="/restaurant/"], [data-testid*="kitchen"]')];
    return { kmMatches: [...new Set(kmMatches)], hasZeroKm, cardCount: cards.length };
  });
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
  const html = await page.content();
  const m = html.match(/assets\/index-[^"']+\.js/);
  report.bundleAfter = m ? m[0] : null;
  const shot1 = path.join(OUT_DIR, 'step1-clear-fresh-home.png');
  await page.screenshot({ path: shot1, fullPage: true });
  report.steps.step1 = { status: 'PASS', screenshot: shot1, bundleAfter: report.bundleAfter };
} catch (e) {
  report.steps.step1 = { status: 'FAIL', error: String(e) };
}

// Step 2
try {
  await setLocationKoregaon(page);
  const shot2 = path.join(OUT_DIR, 'step2-koregaon-location.png');
  await page.screenshot({ path: shot2, fullPage: true });
  const text = await bodyText(page);
  report.steps.step2 = {
    status: /Koregaon Park/i.test(text) ? 'PASS' : 'FAIL',
    screenshot: shot2,
    bodySnippet: text.slice(0, 300),
  };
} catch (e) {
  report.steps.step2 = { status: 'FAIL', error: String(e) };
}

// Step 3
try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  const text = await bodyText(page);
  const hasKitchens = /kitchen|restaurant|Nearby|Featured/i.test(text) && !/could not find kitchens/i.test(text);
  const discovery200 = report.network.some((n) => /discovery/i.test(n.url) && n.status === 200);
  const shot3 = path.join(OUT_DIR, 'step3-kitchens-visible.png');
  await page.screenshot({ path: shot3, fullPage: true });
  report.steps.step3 = {
    status: hasKitchens && discovery200 ? 'PASS' : hasKitchens ? 'PASS' : 'FAIL',
    screenshot: shot3,
    hasKitchens,
    discovery200,
    networkDiscovery: report.network.filter((n) => /discovery/i.test(n.url)).slice(-8),
  };
} catch (e) {
  report.steps.step3 = { status: 'FAIL', error: String(e) };
}

// Step 4 — no 0.0 km for unknown
try {
  const labels = await scrapeDistanceLabels(page);
  const shot4 = path.join(OUT_DIR, 'step4-no-zero-km-badge.png');
  await page.screenshot({ path: shot4, fullPage: true });
  const pass = !labels.hasZeroKm;
  report.steps.step4 = {
    status: pass ? 'PASS' : 'FAIL',
    screenshot: shot4,
    ...labels,
    notes: pass ? 'No 0.0 km text on discovery home' : 'Found misleading 0.0 km label',
  };
} catch (e) {
  report.steps.step4 = { status: 'FAIL', error: String(e) };
}

// Step 5 — known distances render
try {
  const labels = await scrapeDistanceLabels(page);
  const known = labels.kmMatches.filter((k) => k !== '0.0');
  const hasKnown = known.length > 0;
  const shot5 = path.join(OUT_DIR, 'step5-known-distance-km.png');
  await page.screenshot({ path: shot5, fullPage: true });
  report.steps.step5 = {
    status: hasKnown ? 'PASS' : 'FAIL',
    screenshot: shot5,
    knownDistances: known,
    allKm: labels.kmMatches,
    notes: hasKnown ? 'At least one non-zero distance badge visible' : 'No known distance badges found on feed',
  };
} catch (e) {
  report.steps.step5 = { status: 'FAIL', error: String(e) };
}

// Step 6 — kitchen switch cart clear
try {
  await page.goto(`${BASE}/restaurant/${KITCHEN_A}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2000));
  const addResult = await clickAddFirstMenuItem(page);
  await new Promise((r) => setTimeout(r, 1500));
  const afterAdd = await readCartState(page);
  await page.goto(`${BASE}/restaurant/${KITCHEN_B}/menu`, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2500));
  const toastVisible = await page.evaluate((msg) => document.body.innerText.includes(msg), TOAST);
  const afterSwitch = await readCartState(page);
  const shot6 = path.join(OUT_DIR, 'step6-kitchen-switch-cart-clear.png');
  await page.screenshot({ path: shot6, fullPage: true });
  const pass = afterAdd.lines > 0 && afterSwitch.lines === 0;
  report.steps.step6 = {
    status: pass ? 'PASS' : 'FAIL',
    screenshot: shot6,
    addResult,
    afterAdd,
    afterSwitch,
    toastVisible,
  };
} catch (e) {
  report.steps.step6 = { status: 'FAIL', error: String(e) };
}

report.badResponses = report.network.filter((n) => n.status >= 400);
report.consoleIssues = {
  errors: [...new Set(report.consoleErrors)].slice(0, 30),
  warnings: [...new Set(report.consoleWarnings)].slice(0, 20),
};
report.discoveryApiOk = report.network.some((n) => /discovery/i.test(n.url) && n.status === 200);

const allPass = Object.values(report.steps).every((s) => s.status === 'PASS');
report.verdict = allPass ? 'DEPLOY VERIFIED' : 'POST-DEPLOY FIX NEEDED';

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));

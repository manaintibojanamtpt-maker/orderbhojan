import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/browser/reliabilityHarness.tsx"></script></body></html>';
const server=await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true},plugins:[{name:'customer-test-harness',configureServer(s){s.middlewares.use('/__customer_test',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__customer_test',html));});}}]});
let browser;let passed=0;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'msedge'}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:5187/__customer_test');
  await page.getByRole('button',{name:'Check order status'}).waitFor();
  const timed=await page.evaluate(async()=>{
    const {MarketplaceHttpClient}=await import('/src/marketplace-api/client.ts');
    const saved=window.fetch;window.fetch=()=>new Promise(()=>{});
    try {await new MarketplaceHttpClient({baseUrl:location.origin,apiVersion:'1',timeoutMs:30,retryAttempts:2,retryDelayMs:5}).request({path:'/stalled',signal:new AbortController().signal});return false;}
    catch(e){return e.code==='TIMEOUT';}finally{window.fetch=saved;}
  });assert.equal(timed,true);passed++;
  const sdk=await page.evaluate(async()=>{
    const {createPaymentScriptLoader}=await import('/src/features/checkout/infrastructure/paymentScriptLoader.ts');
    const adopted=document.createElement('script');adopted.id='test-payment-sdk';document.head.append(adopted);
    let ready=false;
    const load=createPaymentScriptLoader({id:adopted.id,src:'data:text/javascript,void(0)',document:()=>document,ready:()=>ready,active:()=>false,timeoutMs:30});
    const timedOut=await load();const cleaned=!document.getElementById(adopted.id);
    const a=load(),b=load();ready=true;document.getElementById(adopted.id).dispatchEvent(new Event('load'));
    return {timedOut,cleaned,shared:a===b,recovered:await a};
  });assert.deepEqual(sdk,{timedOut:false,cleaned:true,shared:true,recovered:true});passed++;
  await page.evaluate(async()=>{
    const {beginCheckoutAttempt,recordCheckoutOrder}=await import('/src/features/checkout/infrastructure/checkoutAttempt.ts');
    const a=await beginCheckoutAttempt('browser-customer',{paymentMethod:'upi'},100,new Date(Date.now()+60000).toISOString());recordCheckoutOrder('browser-customer',a.id,'test-order');
  });
  await page.reload();
  assert.equal(await page.getByText('No saved reference').count(),0);
  let state='pending';await page.route('**/api/test/recovery',r=>r.fulfill({json:{state,orderId:'test-order'}}));
  await page.getByRole('button',{name:'Check order status'}).click();
  await page.getByRole('button',{name:'View order'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue shopping'}).count(),0);
  state='confirmed';await page.getByRole('button',{name:'Check order status'}).click();
  await page.getByRole('heading',{name:'Order confirmed'}).waitFor();
  await page.getByRole('button',{name:'Continue shopping'}).click();assert.equal(await page.getAttribute('body','data-continued'),'true');passed++;
  await page.goto('http://127.0.0.1:5187/__customer_test?mode=checkout');
  await page.getByRole('button',{name:'Place test order'}).waitFor();
  await page.addStyleTag({content:'html { font-size: 32px !important; }'});
  await page.getByRole('radio',{name:/Cash on delivery/}).scrollIntoViewIfNeeded();
  await page.getByRole('radio',{name:/Cash on delivery/}).click();
  assert.equal(await page.getByRole('radio',{name:/Cash on delivery/}).getAttribute('aria-checked'),'true');
  await page.getByRole('textbox').first().fill('9876543210');
  await page.getByRole('button',{name:'Place test order'}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Place test order'}).click();
  assert.equal(await page.getAttribute('body','data-placed'),'test');
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
  assert.ok(width.scroll<=width.view+1,JSON.stringify(width));
  const contained=await page.getByRole('radio').evaluateAll(elements=>elements.every(e=>e.getBoundingClientRect().right<=innerWidth));
  assert.equal(contained,true,'Payment controls must not be clipped at enlarged text');
  mkdirSync('docs/customer-milestone-evidence',{recursive:true});
  await page.screenshot({path:'docs/customer-milestone-evidence/checkout-200-percent.png',fullPage:true});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
  assert.equal(await page.evaluate(()=>visualViewport.scale),2);
  const viewport=readFileSync('index.html','utf8').match(/<meta name="viewport"[^>]+>/)?.[0];
  assert.ok(viewport&&!/user-scalable=no|maximum-scale=1/.test(viewport));passed++;
  console.log(`Browser checks: ${passed} passed. Mounted checkout/recovery components, simulated network/provider; no real payment or Android process kill.`);
} finally {await browser?.close();await server.close();}

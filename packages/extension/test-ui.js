const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const extensionPath = path.resolve(__dirname, 'dist');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

  const extensionId = 'ljbjnnpmhdcmbadkcedoenjpkplddfpc';

  const page = await browser.newPage();

  // Log outgoing requests and responses to the local worker
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('127.0.0.1:8787')) {
      console.log(
        `[NETWORK] ${request.method()} ${request.url()} | Origin: ${request.headers().origin}`
      );
    }
    request.continue();
  });
  page.on('response', (response) => {
    if (response.url().includes('127.0.0.1:8787')) {
      console.log(
        `[NETWORK] Response ${response.status()} | ACAO: ${response.headers()['access-control-allow-origin'] || 'none'}`
      );
    }
  });

  // 1. Open popup
  console.log('Navigating to popup...');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // 2. GET /api/status
  await page.waitForSelector('#status-container:not(:empty)');
  const statusHtml = await page.$eval('#status-container', (el) => el.textContent);
  console.log(
    `[PASS] GET Status Rendered: ${statusHtml.includes('likelihood') || statusHtml.includes('Health')}`
  );
  console.log(`[RENDERED TEXT] ${statusHtml}`);

  // 3. POST /api/subscriptions — valid form
  await page.evaluate(() => (document.getElementById('email').value = ''));
  await page.type('#email', 'test@example.com');

  console.log('Submitting valid form...');
  await page.click('#subscribe-btn');

  await page.waitForFunction('document.getElementById("sub-result").textContent.length > 5');
  let subHtml = await page.$eval('#sub-result', (el) => el.textContent);
  console.log(`[PASS] POST Subscription Rendered: ${subHtml.includes('sub_transport_spike')}`);
  console.log(`[RENDERED TEXT] ${subHtml}`);

  // 4. Validation error — uncheck all alert types then submit
  console.log('Testing validation error...');
  await page.click('#alert-70');
  await page.click('#alert-announced');
  await page.click('#subscribe-btn');

  await page.waitForFunction(
    'document.getElementById("sub-result").textContent.includes("Validation")'
  );
  let errorHtml = await page.$eval('#sub-result', (el) => el.textContent);
  console.log(`[PASS] Invalid Request Error Rendered: ${errorHtml.includes('Validation')}`);
  console.log(`[RENDERED TEXT] ${errorHtml}`);

  // 5. Network error — mock fetch to simulate backend unreachable
  console.log('Testing unavailable backend...');
  await page.evaluate(() => {
    window.originalFetch = window.fetch;
    window.fetch = () => Promise.reject(new Error('Failed to fetch'));
  });

  await page.click('#alert-70');
  await page.click('#subscribe-btn');
  await page.waitForFunction(
    'document.getElementById("sub-result").textContent.includes("Failed to fetch")'
  );
  let networkHtml = await page.$eval('#sub-result', (el) => el.textContent);
  console.log(`[PASS] Network Error Rendered: ${networkHtml.includes('Failed to fetch')}`);
  console.log(`[RENDERED TEXT] ${networkHtml}`);

  await browser.close();
})();

/* On-demand math delivery: no engine on ordinary pages, real fixture rendering. */
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'ci/node_modules/playwright'));
const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:8887';

(async () => {
  const browser = await chromium.launch({executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  try {
    for (const route of ['/', '/gallery/', '/blog/2024/09/16/kickoff-meeting/', '/Guidelines/Archive/2024-2025/Rocket-Guide/']) {
      const page = await browser.newPage();
      const engines = [];
      page.on('request', request => {if (request.url().includes('tex-mml-chtml.js')) engines.push(request.url());});
      await page.goto(base + route, {waitUntil: 'domcontentloaded'});
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.arithmatex').count(), 0);
      assert.deepEqual(engines, [], 'Unneeded MathJax engine request: ' + route);
      await page.close();
    }
    for (const nativeObserver of [false, true]) {
      const fixture = await browser.newPage();
      const engines = [];
      const errors = [];
      fixture.on('request', request => {if (request.url().includes('tex-mml-chtml.js')) engines.push(request.url());});
      fixture.on('pageerror', error => errors.push(error.message));
      // Browser-only fixture: never written into the published documentation.
      await fixture.setContent('<html><body><span class="arithmatex">\\(E = mc^2\\)</span><div class="arithmatex">\\[\\frac{a}{b}=c\\]</div></body></html>');
      if (nativeObserver) await fixture.evaluate(() => {window.document$ = {subscribe(callback) {callback();}};});
      await fixture.addScriptTag({path: path.join(root, 'docs/javascripts/mathjax.js')});
      await fixture.waitForFunction(() => document.querySelectorAll('mjx-container').length === 2, null, {timeout: 45000});
      await fixture.addScriptTag({path: path.join(root, 'docs/javascripts/mathjax.js')});
      await fixture.waitForTimeout(100);
      assert.equal(engines.length, 1, 'Math engine must load once');
      assert.deepEqual(errors, []);
      assert.equal(await fixture.locator('mjx-container').count(), 2);
      await fixture.close();
    }
    console.log('MathJax: four ordinary routes make zero engine requests; both positive fixtures render two formulas with one engine load.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});

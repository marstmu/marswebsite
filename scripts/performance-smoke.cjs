/* Delivery regressions: local fonts, real LCP priority, explicit player consent. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'ci/node_modules/playwright'));
const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:8887';
const output = process.env.SITE_TEST_OUTPUT || path.join(root, '.preview/performance-smoke');
fs.mkdirSync(output, {recursive: true});
(async () => {
  const browser = await chromium.launch({executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  const reports = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({viewport: {width, height: 900}, deviceScaleFactor: width === 390 ? 2 : 1});
      const page = await context.newPage();
      const requests = [], pageErrors = [];
      page.on('request', request => requests.push(request.url()));
      page.on('pageerror', error => pageErrors.push(error.message));
      // Keep tests deterministic; verify creation, URL and permissions without
      // downloading a live third-party player or relying on its network state.
      await page.route('https://www.youtube-nocookie.com/embed/**', route => route.fulfill({contentType: 'text/html', body: '<title>Player test</title>'}));
      await page.goto(new URL('/', base).href, {waitUntil: 'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      assert.equal(requests.some(url => /fonts\.(googleapis|gstatic)\.com/.test(url)), false, 'Google font dependency returned');
      assert(requests.some(url => url.endsWith('/assets/fonts/inter-normal-latin.woff2')), 'Local regular Inter not used');
      assert.equal(requests.some(url => /jetbrains-mono|inter-italic/.test(url)), false, 'Unused mono/italic font eagerly fetched on home');
      assert.equal(await page.locator('script[src]:not([defer]):not([async])').count(), 0, 'Parser-blocking external script returned');
      const home = {width, font: await page.evaluate(() => getComputedStyle(document.body).fontFamily)};
      requests.length = 0;
      await page.goto(new URL('/gallery/', base).href, {waitUntil: 'networkidle'});
      const first = page.locator('.mars-gallery img').first();
      assert.equal(await first.getAttribute('loading'), 'eager');
      assert.equal(await first.getAttribute('fetchpriority'), 'high');
      const galleryPhotos = await page.locator('.mars-gallery figure a').evaluateAll(links => links.map(link => link.href));
      require('./gallery-coverage.cjs').assertGalleryCoverage(galleryPhotos);
      assert.equal(await page.locator('.mars-gallery img[loading="lazy"]').count(), galleryPhotos.length - 1, 'Only the first gallery photograph loads eagerly');
      const play = page.getByRole('button', {name: 'Play archived MARS rocket launch video'});
      await play.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.mars-video-facade iframe').count(), 0, 'Iframe exists before activation');
      assert.equal(requests.some(url => /youtube|ytimg|googlevideo/.test(new URL(url).hostname)), false, 'Player contacted before explicit activation');
      assert(await page.getByRole('link', {name: 'Watch the archived launch video on YouTube'}).isVisible(), 'No-JavaScript watch link lost');
      assert.equal(await play.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), true, 'Local facade poster broken');
      await play.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.mars-video-facade iframe');
      const frame = page.locator('.mars-video-facade iframe');
      assert.equal(await frame.count(), 1);
      assert.equal(await frame.getAttribute('src'), 'https://www.youtube-nocookie.com/embed/jFPGU56kXCg?autoplay=1');
      assert.equal(await frame.getAttribute('title'), 'Archived MARS rocket launch video');
      assert((await frame.getAttribute('allow')).includes('autoplay'));
      assert.equal(await frame.evaluate(element => document.activeElement === element), true, 'Player focus not retained');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Gallery overflow');
      assert.deepEqual(pageErrors, []);
      reports.push({...home, requestsBeforeAndAfterClick: requests.length, result: 'pass'});
      await page.screenshot({path: path.join(output, `facade-${width}.png`)});
      await context.close();
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
})().catch(error => {console.error(error); process.exitCode = 1;});

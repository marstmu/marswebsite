/* Optional functional smoke check, using an already installed Playwright. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARS_PREVIEW_BACKEND || 'https://workstation.tailee9084.ts.net:8887';
const publicFormat = process.argv.includes('--public');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MARS_CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, colorScheme: 'light'});
  const page = await context.newPage();
  const failures = [];
  const localHttpErrors = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(base) && response.status() >= 400) localHttpErrors.push(`${response.status()} ${response.url()}`);
  });
  const response = await page.goto(base + '/', {waitUntil: 'networkidle'});
  assert.equal(response.status(), 200);
  if (publicFormat) {
    assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(), 0, 'Public-format output must not inherit preview noindex');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://marstmu.com/');
  } else {
    assert.match(response.headers()['x-robots-tag'], /noindex/);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow, noarchive');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://workstation.tailee9084.ts.net:8887/');
  }
  assert.ok(await page.locator('.mars-hero__logo').evaluate(image => image.complete && image.naturalWidth > 0));
  const heroJoin = page.locator('.mars-hero .mars-button');
  assert.match(await heroJoin.getAttribute('href'), /discord/);
  const navHref = await page.locator('.mars-topnav a').allTextContents();
  assert.ok(navHref.some(text => text.trim() === 'Competition'));
  assert.equal(await page.locator('[data-md-component="search"], .md-search__button').count(), 0);
  assert.equal(await page.locator('[data-md-component="palette"] label:visible').count(), 0);
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForFunction(() => document.body.dataset.mdColorScheme === 'slate');
  await page.emulateMedia({colorScheme: 'light'});
  await page.waitForFunction(() => document.body.dataset.mdColorScheme === 'default');
  for (const shortcut of ['Control+k', '/', 's']) {
    await page.keyboard.press(shortcut);
    await page.waitForTimeout(80);
    assert.equal(await page.getByRole('combobox').count(), 0);
    assert.ok(!(await page.locator('#__search').isChecked()));
  }
  for (let iteration = 0; iteration < 3; iteration++) {
    for (const [name, route] of [['Competition', '/competition/'], ['Gallery', '/gallery/'], ['Home', '/']]) {
      await page.locator('.mars-topnav').getByRole('link', {name, exact: true}).click();
      await page.waitForURL('**' + route);
      await page.waitForFunction(expected => !!document.querySelector('.mars-home') === (expected === '/'), route);
      assert.equal(await page.locator('.mars-topnav [aria-current="page"]').innerText(), name);
      assert.equal(await page.locator('.mars-hero').count(), route === '/' ? 1 : 0, 'Hero must not leak between pages');
      if (route === '/') {
        await page.locator('.mars-hero__background img').evaluate(image => image.decode());
        assert.ok(await page.locator('.mars-hero__background img').evaluate(image => image.naturalWidth > 0));
      }
    }
    await page.goBack({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !document.querySelector('.mars-home'));
    assert.equal(await page.locator('.mars-hero').count(), 0);
    await page.goForward({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!document.querySelector('.mars-home'));
    assert.equal(await page.locator('.mars-hero').count(), 1);
    await page.emulateMedia({colorScheme: 'dark'});
    await page.waitForFunction(() => document.body.dataset.mdColorScheme === 'slate');
    await page.emulateMedia({colorScheme: 'light'});
    await page.waitForFunction(() => document.body.dataset.mdColorScheme === 'default');
  }
  await page.goto(base + '/gallery/', {waitUntil: 'networkidle'});
  const galleryLinks = await page.locator('.mars-gallery figure a').evaluateAll(links => links.map(link => link.href));
  require('./gallery-coverage.cjs').assertGalleryCoverage(galleryLinks);
  for (const url of galleryLinks) {
    const result = await context.request.head(url);
    assert.equal(result.status(), 200, url);
  }
  await page.goto(base + '/blog/', {waitUntil: 'networkidle'});
  assert.match(await page.locator('main').innerText(), /2026/);
  await page.goto(base + '/blog/2024/04/12/avionics-session-on-april-25th/', {waitUntil: 'networkidle'});
  assert.ok((await page.locator('main img').count()) > 0);
  assert.ok(await page.locator('script[src="https://giscus.app/client.js"]').count());
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(base + '/', {waitUntil: 'networkidle'});
  const drawer = page.locator('input#__drawer');
  const menu = page.locator('[data-mars-menu]');
  assert.equal(await page.locator('.mars-header__brand').isVisible(), true);
  await menu.focus();
  await page.keyboard.press('Enter');
  assert.ok(await drawer.isChecked());
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('.md-sidebar--primary').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
  await page.keyboard.press('Escape');
  assert.ok(!(await drawer.isChecked()));
  await menu.focus();
  await page.keyboard.press('Space');
  assert.ok(await drawer.isChecked());
  await menu.click();
  assert.ok(!(await drawer.isChecked()));
  await page.goto(base + '/links-and-resources/', {waitUntil: 'networkidle'});
  assert.equal(await page.locator('[data-md-component="search"], .md-search__button').count(), 0);
  const notion = page.locator('.mars-footer a[title="Notion"]');
  assert.equal(await notion.locator('svg').getAttribute('viewBox'), '0 0 24 24');
  assert.equal(await notion.locator('[data-darkreader-inline-fill]').count(), 0);
  assert.deepEqual(localHttpErrors, [], 'Local network failures');
  assert.deepEqual(failures, [], 'Browser runtime errors');
  console.log(JSON.stringify({homepage: 'ok', repeatedNavigationAndHistory: 'ok', systemThemes: 'both schemes ok', searchAndKeyboardOverlay: 'disabled', galleryOriginals: galleryLinks.length, historicalBlogAndComments: 'ok', keyboardMobileNavigation: 'ok', notionFooter: 'clean vector', localHttpErrors, failures}, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });

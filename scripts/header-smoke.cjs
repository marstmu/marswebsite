/* Focused glass-header regression check with an already installed Playwright. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARS_PREVIEW_BACKEND || 'https://workstation.tailee9084.ts.net:8887';
(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  try {
    const results = [];
    for (const scheme of ['light', 'dark']) {
      for (const width of [390, 768, 1024, 1440]) {
        const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}, colorScheme: scheme, isMobile: width === 390, hasTouch: width === 390});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/', {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => window.__marsShellMounted);
        await page.locator('.mars-hero__background img').evaluate(image => image.decode());
        await page.locator('.mars-header__brand img').evaluate(image => image.decode());
        const geometry = await page.evaluate(() => {
          const header = document.querySelector('.mars-header').getBoundingClientRect();
          const hero = document.querySelector('.mars-hero').getBoundingClientRect();
          const picture = document.querySelector('.mars-hero__background').getBoundingClientRect();
          const image = document.querySelector('.mars-hero__logo').getBoundingClientRect();
          const style = getComputedStyle(document.querySelector('.mars-header'));
          return {headerHeight: header.height, headerTop: header.top, heroTop: hero.top, pictureTop: picture.top, heroBottom: hero.bottom, wordmarkCenter: image.x + image.width * (1205 / 2172), heroCenter: hero.x + hero.width / 2, backdrop: style.backdropFilter, surface: style.backgroundImage, overflow: document.documentElement.scrollWidth > innerWidth + 1};
        });
        assert.equal(geometry.headerHeight, 64);
        assert.equal(geometry.pictureTop, 0, 'Photo must extend behind the glass bar');
        assert.equal(geometry.heroTop, 64, 'Hero content geometry must not move');
        assert.ok(Math.abs(geometry.wordmarkCenter - geometry.heroCenter) < 1);
        assert.equal(geometry.overflow, false);
        assert.match(geometry.backdrop, /blur/);
        assert.match(geometry.surface, /gradient/);
        assert.equal(await page.locator('.mars-header__brand').isVisible(), true);
        assert.equal(await page.locator('.mars-topnav').isVisible(), width >= 1000);
        assert.equal(await page.locator('[data-md-component="search"]').count(), 0);
        assert.equal(await page.locator('.mars-topnav').getByRole('link', {name: 'Learn', exact: true, includeHidden: true}).count(), 0, 'Learn stays available as content, not a top tab');
        assert.equal(await page.locator('.mars-topnav').getByRole('link', {name: 'Guides', exact: true, includeHidden: true}).count(), 0, 'Guides is absent from the top navigation');
        assert.equal(await page.locator('#mars-site-navigation').getByText('Guides', {exact: true}).count(), 0, 'Guides is absent from mobile navigation');
        assert.equal(await page.locator('.mars-community__copy > p').innerText(), 'Applications are open to every TMU student.');
        assert.equal(await page.locator('.mars-story--learn h2').innerText(), 'Guides');
        assert.equal(await page.locator('.mars-story--learn').getAttribute('href'), './learn/');
        assert.equal(await page.locator('.mars-hero .mars-button').getAttribute('href'), 'https://discord.gg/BaQZkd2TKj');
        assert.equal(await page.locator('.mars-film video').getAttribute('controls'), '');
        if ([390, 1440].includes(width)) await page.screenshot({path: `.preview/screenshots/glass-home-${width}-${scheme}.png`});
        for (const position of [0, 1, 6, 12, 20, 40, 64]) {
          await page.evaluate(y => scrollTo(0, y), position);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const early = await page.locator('.mars-header').evaluate(header => ({surface: getComputedStyle(header).backgroundImage, progress: header.style.getPropertyValue('--mars-header-surface-progress'), height: header.getBoundingClientRect().height}));
          assert.equal(early.surface, geometry.surface, 'Tiny scrolls retain the initial transparent surface');
          assert.equal(Number(early.progress), 0);
          assert.equal(early.height, 64);
        }
        const fade = [];
        for (const position of [80, 104, 144, 184, 208, 224]) {
          await page.evaluate(y => scrollTo(0, y), position);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const step = await page.locator('.mars-header').evaluate(header => ({progress: Number(header.style.getPropertyValue('--mars-header-surface-progress')), topAlpha: Number(header.style.getPropertyValue('--mars-header-top-alpha')), bottomAlpha: Number(header.style.getPropertyValue('--mars-header-bottom-alpha')), top: header.getBoundingClientRect().top, height: header.getBoundingClientRect().height}));
          assert.equal(step.progress, (position - 64) / 160);
          assert.equal(step.top, 0); assert.equal(step.height, 64);
          if (fade.length) assert.ok(step.topAlpha > fade.at(-1).topAlpha && step.bottomAlpha > fade.at(-1).bottomAlpha, 'Fade is monotonic, not an abrupt color switch');
          fade.push(step);
        }
        await page.evaluate(() => scrollTo(0, 450));
        await page.waitForFunction(() => document.querySelector('.mars-header').dataset.scrolled === 'true');
        const scrolled = await page.locator('.mars-header').evaluate(header => ({top: header.getBoundingClientRect().top, height: header.getBoundingClientRect().height, background: getComputedStyle(header).backgroundColor}));
        assert.equal(scrolled.top, 0);
        assert.equal(scrolled.height, 64);
        assert.equal(scrolled.background, 'rgba(12, 20, 33, 0.8)');
        if ([390, 1440].includes(width) && scheme === 'light') await page.screenshot({path: `.preview/screenshots/glass-scrolled-${width}.png`});
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForFunction(() => document.querySelector('.mars-header').dataset.scrolled === 'false');
        if (width < 1000) {
          const menu = page.locator('[data-mars-menu]');
          await menu.focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#__drawer').isChecked(), true);
          await page.keyboard.press('Escape');
          await menu.focus();
          await page.keyboard.press('Space');
          assert.equal(await page.locator('#__drawer').isChecked(), true);
          await menu.click();
          assert.equal(await page.locator('#__drawer').isChecked(), false);
          await menu.click();
          await page.locator('#mars-site-navigation').getByRole('link', {name: 'Competition', exact: true}).click();
          await page.waitForURL('**/competition/');
          assert.equal(await page.locator('#__drawer').isChecked(), false);
        }
        await page.goto(base + '/learn/', {waitUntil: 'domcontentloaded'});
        await page.waitForURL('**/learn/');
        assert.equal(await page.locator('.mars-topnav').getByRole('link', {name: 'Guides', exact: true, includeHidden: true}).count(), 0, 'Guide content stays reachable without a header tab');
        assert.equal(await page.locator('.mars-hero').count(), 0);
        assert.equal(await page.locator('.mars-header').evaluate(header => getComputedStyle(header).backgroundImage), 'none');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await page.locator('.mars-header__brand').click();
        await page.waitForURL(base + '/');
        await page.locator('.mars-hero__background img').evaluate(image => image.decode());
        assert.equal(await page.locator('.mars-hero').count(), 1);
        assert.deepEqual(errors, []);
        results.push({width, scheme, geometry, fade, scrolled, keyboardMenu: width < 1000 ? 'ok' : 'desktop nav', homeLearnHome: 'ok'});
        await page.close();
      }
    }
    // Browser-level emulation proves the accessibility fallback, not just its CSS source.
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-transparency', value: 'reduce'}]});
    await page.goto(base + '/');
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), true);
    assert.equal(await page.locator('.mars-header').evaluate(header => getComputedStyle(header).backdropFilter), 'none');
    assert.equal(await page.locator('.mars-header').evaluate(header => getComputedStyle(header).backgroundColor), 'rgb(17, 24, 39)');
    console.log(JSON.stringify({matrix: results, reducedTransparency: 'opaque fallback verified'}, null, 2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});

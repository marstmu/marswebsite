/* Native and forced-fallback slow-scroll checks; not a physical Safari test. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARS_PREVIEW_BACKEND || 'https://workstation.tailee9084.ts.net:8887';
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const sample = page => page.evaluate(() => {
  const picture = document.querySelector('.mars-hero__background');
  const image = picture.querySelector('img');
  const style = getComputedStyle(image);
  const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
  const rect = picture.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const hero = picture.closest('.mars-hero').getBoundingClientRect();
  const foreground = document.querySelector('.mars-hero__inner').getBoundingClientRect();
  return {scroll: scrollY, mode: picture.dataset.parallax, shift: matrix?.m42 || 0, pictureTop: rect.top, pictureBottom: rect.bottom, imageTop: imageRect.top, imageBottom: imageRect.bottom, heroBottom: hero.bottom, foregroundWorldTop: foreground.top + scrollY, heroHeight: hero.height, headerTop: document.querySelector('.mars-header').getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > innerWidth + 1};
});
(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  try {
    const report = [];
    for (const fallback of [false, true]) {
      for (const width of [390, 1440]) {
        const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}, isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'no-preference'});
        if (fallback) await page.addInitScript(() => {
          const supports = CSS.supports.bind(CSS);
          CSS.supports = (property, value) => property === 'animation-timeline' ? false : supports(property, value);
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/');
        await page.locator('.mars-hero__background img').evaluate(image => image.decode());
        await frames(page);
        const initial = await sample(page);
        assert.equal(initial.mode, fallback ? 'fallback' : 'native');
        assert.equal(initial.shift, 0, 'Initial image framing must be exact');
        const trace = [];
        for (const scroll of [...Array.from({length: 21}, (_, index) => index), 100, 250, 450, 700, 900, 1100, 450, 20, 2, 1, 0]) {
          await page.evaluate(position => scrollTo(0, position), scroll);
          await frames(page);
          const current = await sample(page);
          const distance = Math.min(width <= 640 ? 36 : 84, (initial.heroHeight + 64) * .25);
          const expected = Math.min(1, current.scroll / (initial.heroHeight + 64)) * distance;
          assert.ok(Math.abs(current.shift - expected) < .25, `Direct progress, no initial jump: ${JSON.stringify(current)}`);
          assert.ok(Math.abs(current.foregroundWorldTop - initial.foregroundWorldTop) < .1, 'Foreground must stay in normal document flow');
          assert.ok(Math.abs(current.pictureBottom - current.heroBottom) < .1, 'Static picture must hold the original hero boundary');
          assert.ok(current.imageBottom >= current.pictureBottom - .1, 'Translated image must cover the entire bottom edge');
          assert.equal(current.headerTop, 0);
          assert.equal(current.overflow, false);
          if (current.heroBottom > 0) assert.ok(current.imageTop <= .1, 'No exposed image top edge');
          trace.push({scroll: current.scroll, shift: +current.shift.toFixed(4)});
          if (!fallback && [0, 250, 450].includes(scroll)) await page.screenshot({path: `.preview/screenshots/parallax-${width}-scroll-${scroll}.png`});
        }
        assert.equal((await sample(page)).shift, 0, 'Returning to top restores exact framing');
        await page.evaluate(() => scrollTo(0, 300));
        await frames(page);
        await page.emulateMedia({reducedMotion: 'reduce'});
        await frames(page);
        assert.equal((await sample(page)).shift, 0);
        assert.equal((await sample(page)).mode, 'disabled');
        await page.emulateMedia({reducedMotion: 'no-preference'});
        await frames(page);
        assert.ok((await sample(page)).shift > 0);
        if (width === 390) {
          // Toolbar-height-only changes must not remeasure the fallback's range.
          if (fallback) {
            const before = (await sample(page)).shift;
            await page.setViewportSize({width: 390, height: 800});
            await frames(page);
            assert.ok(Math.abs((await sample(page)).shift - before) < .1);
          }
          await page.setViewportSize({width: 844, height: 390});
          await frames(page);
          const landscape = await sample(page);
          assert.equal(landscape.overflow, false);
          assert.ok(landscape.imageTop <= .1);
          await page.locator('[data-mars-menu]').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#__drawer').isChecked(), true);
          await page.keyboard.press('Escape');
        }
        await page.locator('.mars-header__brand').click();
        await page.waitForURL(base + '/');
        if (width !== 1440) {
          await page.locator('[data-mars-menu]').click();
          await page.locator('#mars-site-navigation').getByRole('link', {name: 'Competition', exact: true}).click();
          await page.waitForURL('**/competition/');
          assert.equal(await page.locator('#__drawer').isChecked(), false);
        }
        await page.goto(base + '/learn/', {waitUntil: 'domcontentloaded'});
        await page.waitForURL('**/learn/');
        assert.equal(await page.locator('.mars-hero__background').count(), 0);
        await page.locator('.mars-header__brand').click();
        await page.waitForURL(base + '/');
        await frames(page);
        assert.equal((await sample(page)).shift, 0);
        assert.deepEqual(errors, []);
        report.push({width, path: fallback ? 'forced fallback' : 'native CSS', trace, reducedMotion: 'static', resizeMenuNavigation: 'ok', errors});
        await page.close();
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});

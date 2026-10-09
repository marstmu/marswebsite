/* Responsive shell and loaded-media checks, using an existing Playwright. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARS_PREVIEW_BACKEND || 'http://127.0.0.1:8887';
(async () => {
  fs.mkdirSync('.preview/screenshots', {recursive: true});
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  try {
    const results = [];
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({colorScheme: scheme});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const width of [320, 390, 768, 960, 1024, 1100, 1440]) {
        await page.setViewportSize({width, height: 900});
        await page.goto(base + '/', {waitUntil: 'domcontentloaded'});
        await page.locator('.mars-hero__background img').evaluate(image => image.decode());
        await page.waitForFunction(() => !!window.__marsShellMounted);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width} ${scheme}: overflow`);
        assert.equal(await page.locator('.mars-topnav').isVisible(), width >= 1000);
        assert.equal(await page.locator('.mars-header__brand').isVisible(), true);
        assert.equal(await page.locator('[data-mars-menu]').isVisible(), width < 1000);
        assert.equal(await page.locator('[data-md-component="search"], .md-search__button').count(), 0);
        for (const image of await page.locator('.mars-home img').all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate(element => element.decode());
        }
        const gaps = await page.evaluate(() => {
          const hero = document.querySelector('.mars-hero').getBoundingClientRect();
          const home = document.querySelector('.mars-home').getBoundingClientRect();
          const footer = document.querySelector('.mars-footer').getBoundingClientRect();
          return {heroSeam: Math.round(home.top - hero.bottom), footerGap: Math.round(footer.top - home.bottom)};
        });
        assert.equal(gaps.heroSeam, 0);
        assert.equal(gaps.footerGap, 0);
        const footer = await page.locator('.mars-footer').boundingBox();
        const copyright = await page.locator('.mars-footer small').boundingBox();
        assert.ok(footer.height <= (width >= 1000 ? 66 : copyright.height + 73), 'Footer stays compact, allowing narrow-screen copyright wrapping without shrinking social targets');
        const footerStyle = await page.locator('.mars-footer').evaluate(element => {
          const style = getComputedStyle(element);
          const icons = Array.from(element.querySelectorAll('.md-social__link'), link => link.getBoundingClientRect());
          const inner = element.querySelector('.mars-footer__inner').getBoundingClientRect();
          const social = element.querySelector('.md-social').getBoundingClientRect();
          const copy = element.querySelector('small').getBoundingClientRect();
          const glyphOffsets = Array.from(element.querySelectorAll('.md-social__link svg'), svg => {
            const bounds = svg.getBBox();
            const center = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(svg.getScreenCTM());
            const target = svg.closest('a').getBoundingClientRect();
            return center.y - target.top - target.height / 2;
          });
          return {border: style.borderTopWidth, color: style.color, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, iconTops: icons.map(box => box.top), innerCenter: inner.x + inner.width / 2, socialCenter: social.x + social.width / 2, copyCenterY: copy.top + copy.height / 2, socialCenterY: social.top + social.height / 2, glyphOffsets};
        });
        assert.equal(footerStyle.border, '1px', 'Footer keeps a subdued separator');
        assert.equal(new Set(footerStyle.iconTops).size, 1, 'Social targets stay in one row');
        assert.ok(footerStyle.glyphOffsets.every(offset => Math.abs(offset) < 1), 'Actual SVG artwork is vertically centered inside its tap target');
        if (width < 1000) {
          assert.ok(Math.abs(footerStyle.innerCenter - footerStyle.socialCenter) < 1, 'Mobile socials are centered');
          assert.equal(footerStyle.paddingTop, '16px', 'Mobile stack is optically centered, accounting for invisible tap-target space');
          assert.equal(footerStyle.paddingBottom, '8px');
        } else {
          assert.equal(footerStyle.paddingTop, footerStyle.paddingBottom, 'Desktop row has equal outer padding');
          assert.ok(Math.abs(footerStyle.copyCenterY - footerStyle.socialCenterY) < 1, 'Copyright and social row share a vertical center');
        }
        assert.equal(await page.locator('.mars-footer small').innerText(), 'Metropolitan Airspace Rocket Society © 2026');
        assert.equal(await page.locator('.mars-footer .md-social__link').count(), 6);
        for (const link of await page.locator('.mars-footer .md-social__link').all()) {
          const box = await link.boundingBox();
          assert.equal(box.width, 40);
          assert.equal(box.height, 40);
          assert.ok(await link.getAttribute('aria-label'), 'Every social target has an accessible name');
          assert.equal(await link.locator('svg').evaluate(svg => getComputedStyle(svg).width), '16px');
        }
        await page.evaluate(() => scrollTo(0, 0));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if ([768, 1024].includes(width)) await page.screenshot({path: `.preview/screenshots/shell-home-${width}-${scheme}.png`});
        if (width < 1000) {
          await page.locator('[data-mars-menu]').click();
          assert.equal(await page.locator('#__drawer').isChecked(), true);
          assert.equal(await page.locator('.md-sidebar--primary').evaluate(element => element.inert), false);
          await page.keyboard.press('Escape');
        }
        for (const route of ['/learn/', '/links-and-resources/', '/blog/', '/blog/2026/10/08/winter-2026-launch-recap/', '/blog/2024/09/16/kickoff-meeting/']) {
          await page.goto(base + route, {waitUntil: 'domcontentloaded'});
          await page.waitForFunction(() => !!window.__marsShellMounted);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width} ${route}: overflow`);
          assert.equal(await page.locator('.mars-hero').count(), 0);
          if (width >= 1000) assert.equal(await page.locator('.md-sidebar--primary').isVisible(), false);
          assert.equal(await page.locator('.md-sidebar--secondary').isVisible(), false);
          assert.equal(await page.locator('.md-sidebar--post').isVisible(), false);
          if (route === '/blog/2024/09/16/kickoff-meeting/') {
            const articleImage = page.locator('.md-content__inner img').first();
            assert.equal(await articleImage.getAttribute('loading'), 'eager', 'Sidebar-free posts keep their primary image priority');
            assert.equal(await articleImage.getAttribute('fetchpriority'), 'high');
          }
          if (width >= 1000) {
            const reading = await page.locator('.md-content__inner').boundingBox();
            const main = await page.locator('.md-main__inner').boundingBox();
            assert.ok(Math.abs(reading.x - main.x - 24) < 1, 'No hidden side navigation reserves a column');
          }
          if (route === '/learn/' && width === 390 && scheme === 'light') {
            await page.screenshot({path: '.preview/screenshots/shell-learn-390-light.png'});
          }
        }
        results.push({width, scheme, homeImages: 'decoded', header: width >= 1000 ? 'single row' : 'drawer', ...gaps, docs: 'no overflow'});
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});

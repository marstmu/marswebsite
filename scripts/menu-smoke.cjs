/* Mobile drawer geometry, keyboard, site links and scroll-lock regression. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.MARS_PREVIEW_BACKEND || 'https://workstation.tailee9084.ts.net:8887';
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const geometry = page => page.evaluate(() => {
  const rect = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom};};
  return {brand: rect('.mars-header__brand'), button: rect('[data-mars-menu]'), logo: rect('.mars-hero__logo'), body: rect('body'), panel: rect('.md-sidebar--primary'), scroll: scrollY, overflow: document.documentElement.scrollWidth > innerWidth + 1};
});
(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
  try {
    const results = [];
    for (const [width, height, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [768, 900, 'light'], [999, 900, 'light'], [390, 480, 'light']]) {
      const page = await browser.newPage({viewport: {width, height}, colorScheme: scheme, isMobile: width === 390, hasTouch: width === 390});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/');
      await page.locator('.mars-hero__logo').evaluate(image => image.decode());
      const before = await geometry(page);
      const menu = page.locator('[data-mars-menu]');
      await menu.focus();
      await page.keyboard.press('Space');
      const animation = [];
      for (let frame = 0; frame < 12; frame++) {
        await frames(page);
        const current = await geometry(page);
        assert.equal(current.brand.x, before.brand.x, 'Brand must not shift during opening');
        assert.equal(current.button.x, before.button.x, 'Hamburger/X position must remain stable');
        assert.equal(current.logo.x, before.logo.x, 'Scrollbar locking must not shift the hero');
        assert.equal(current.logo.y, before.logo.y, 'Menu must not move the foreground vertically');
        animation.push(+current.panel.y.toFixed(2));
      }
      const open = await geometry(page);
      assert.equal(open.panel.y, 64);
      assert.ok(open.panel.bottom <= height - 16 + .1);
      assert.equal(open.body.width, before.body.width, 'Stable scrollbar gutter must preserve body width');
      assert.equal(open.overflow, false);
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('.mars-menu__close').isVisible(), true);
      assert.equal(await page.locator('.md-nav--primary > .md-nav__title[for="__drawer"]').isVisible(), false);
      assert.equal(await page.locator('.mars-hero').evaluate(element => element.inert), true);
      assert.equal(await page.locator('#mars-site-navigation a[aria-current="page"]').first().evaluate(element => getComputedStyle(element).color), scheme === 'dark' ? 'rgb(255, 152, 169)' : 'rgb(181, 18, 44)');
      await page.screenshot({path: `.preview/screenshots/menu-final-${width}-${height}-${scheme}.png`});
      await page.mouse.move(5, Math.min(height - 10, 650));
      await page.mouse.wheel(0, 180);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => scrollY), before.scroll, 'Wheel outside panel must not scroll the background');
      await menu.focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Home', 'First Tab must reach menu, not the hidden hero CTA');
      for (let tab = 0; tab < 16; tab++) {
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => !!document.activeElement.closest('.mars-header, #mars-site-navigation')), true, 'Focus must stay in the menu/header');
      }
      assert.equal(await page.locator('#mars-site-navigation').getByText('Website notes', {exact: true}).count(), 0);
      assert.equal(await page.locator('#mars-site-navigation').getByText('Contribute to the docs', {exact: true}).count(), 0);
      assert.equal(await page.locator('#mars-site-navigation').getByText('Guides', {exact: true}).count(), 0);
      assert.equal(await page.locator('#mars-site-navigation').getByRole('link', {name: 'Learn', exact: true}).count(), 0);
      assert.deepEqual(await page.locator('#mars-site-navigation > .md-nav__list > .md-nav__item > a').allTextContents().then(labels => labels.map(label => label.trim())), ['Home', 'Competition', 'Philosophy', 'Blog', 'Gallery', 'Resources']);
      for (const link of await page.locator('#mars-site-navigation > .md-nav__list > .md-nav__item > a').all()) {
        assert.equal(await link.isVisible(), true, 'Every remaining site destination stays reachable');
        assert.ok((await link.boundingBox()).height >= 44, 'Menu destinations retain accessible tap targets');
      }
      const panel = await page.locator('.md-sidebar--primary').boundingBox();
      assert.ok(panel.y + panel.height <= height - 16 + .1, 'Site menu must stay inside viewport');
      const wrapper = page.locator('.md-sidebar--primary .md-sidebar__scrollwrap');
      const dimensions = await wrapper.evaluate(element => ({client: element.clientHeight, scroll: element.scrollHeight}));
      if (dimensions.scroll > dimensions.client + 1) {
        await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height - 20);
        await page.mouse.wheel(0, 250);
        await page.waitForTimeout(120);
        assert.ok(await wrapper.evaluate(element => element.scrollTop > 0));
        assert.equal(await page.evaluate(() => scrollY), before.scroll);
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#__drawer').isChecked(), false);
      assert.equal(await menu.evaluate(element => document.activeElement === element), true);
      assert.equal(await page.locator('.mars-hero').evaluate(element => element.inert), false);
      assert.equal(await page.locator('.mars-menu__open').isVisible(), true);
      await menu.click();
      await page.mouse.click(5, Math.min(height - 10, 650));
      assert.equal(await page.locator('#__drawer').isChecked(), false, 'Outside-click closes the drawer');
      await menu.click();
      await menu.click();
      assert.equal(await page.locator('#__drawer').isChecked(), false, 'Close-X remains clickable');
      await menu.click();
      await page.locator('#mars-site-navigation').getByRole('link', {name: 'Competition', exact: true}).click();
      await page.waitForURL('**/competition/');
      assert.equal(await page.locator('#__drawer').isChecked(), false);
      assert.equal(await page.locator('.md-content').evaluate(element => element.inert), false);
      await page.locator('.mars-header__brand').click();
      await page.waitForURL(base + '/');
      await page.locator('.mars-hero__background img').evaluate(image => image.decode());
      assert.equal(await page.locator('#__drawer').isChecked(), false);
      await page.locator('.mars-story--learn').click();
      await page.waitForURL('**/learn/');
      await page.locator('.mars-header__brand').click();
      await page.waitForURL(base + '/');
      assert.deepEqual(errors, []);
      results.push({width, height, scheme, panel: open.panel, animationTop: animation, scrollbarShift: 0, focusAndSiteLinks: 'ok', scrollAndClose: 'ok', normalNavigation: 'ok', guideCardAccess: 'ok', errors});
      await page.close();
    }
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});

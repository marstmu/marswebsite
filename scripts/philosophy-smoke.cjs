/* Founders' Philosophy page: studio portraits, mobile layout, and legacy navigation. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'ci/node_modules/playwright'));
const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:8887';
const output = process.env.SITE_TEST_OUTPUT || path.join(root, '.preview/philosophy');
fs.mkdirSync(output, {recursive:true});
(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const results = [];
  try {
    const inventoryContext = await browser.newContext();
    const inventoryResponse = await inventoryContext.request.get(`${base}/assets/display/manifest.json`);
    assert.ok(inventoryResponse.ok(),'Display image manifest available');
    const inventory = await inventoryResponse.json();
    await inventoryContext.close();
    for (const width of [320,390,768,1440]) for (const theme of ['light','dark']) {
      const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:width<=390?2:1,isMobile:width<1000,colorScheme:theme});
      await page.goto(`${base}/philosophy/`,{waitUntil:'domcontentloaded'});
      for (const image of await page.locator('article img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(i=>i.decode()); }
      const result = await page.evaluate(() => ({
        scrollWidth:document.documentElement.scrollWidth,
        heading:document.querySelector('article h1')?.textContent.trim(),
        colorScheme:document.body.dataset.mdColorScheme,
        article:document.querySelector('article')?.innerText,
        quote:document.querySelector('article blockquote')?.innerText.replace(/\s+/g,' ').trim(),
        letterHeading:document.querySelector('article h2')?.textContent.trim(),
        letterHeadingStyle:getComputedStyle(document.querySelector('article h2')).fontStyle,
        paragraphs:[...document.querySelectorAll('article .mars-founders-letter p')].map(p=>({text:p.innerText,styles:[p,...p.querySelectorAll('*')].map(e=>getComputedStyle(e).fontStyle)})),
        nav:[...document.querySelectorAll('.mars-topnav a')].map(a=>a.textContent.trim()),
        photos:[...document.querySelectorAll('article figure img')].map(i=>{
          const plane=i.getBoundingClientRect(), frame=i.parentElement.getBoundingClientRect();
          const caption=i.closest('figure').querySelector('figcaption'),captionRect=caption.getBoundingClientRect(),captionStyle=getComputedStyle(caption);
          return {alt:i.alt,src:i.currentSrc,original:i.getAttribute('data-original-src'),width:plane.width,height:plane.height,top:plane.top+scrollY,
            frame:{width:frame.width,height:frame.height,top:frame.top+scrollY,left:frame.left,right:frame.right,overflow:getComputedStyle(i.parentElement).overflow,className:i.parentElement.className},
            sizes:i.sizes,caption:caption.innerText,name:caption.querySelector('strong')?.innerText,
            overlay:{top:captionRect.top+scrollY,height:captionRect.height,bottom:captionRect.bottom+scrollY,color:captionStyle.color,fontStyle:captionStyle.fontStyle,textAlign:captionStyle.textAlign,position:captionStyle.position},
            identity:(()=>{const r=caption.querySelector('.mars-founder__identity').getBoundingClientRect();return {top:r.top+scrollY,left:r.left,right:r.right};})(),
            gradient:getComputedStyle(i.closest('figure'),'::after').backgroundImage,
            links:[...i.closest('figure').querySelectorAll('.mars-founder__link')].map(a=>({href:a.href,label:a.getAttribute('aria-label'),target:a.target,rel:a.rel,width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height,left:a.getBoundingClientRect().left,right:a.getBoundingClientRect().right,iconWidth:a.querySelector('svg')?.getBoundingClientRect().width,top:a.getBoundingClientRect().top+scrollY})),
            portraitLinked:!!i.closest('a'),loaded:i.complete&&i.naturalWidth>0};
        })
      }));
      assert.equal(result.heading,'Philosophy');
      assert.ok(result.scrollWidth<=width,'No horizontal overflow');
      assert.equal(result.colorScheme,theme==='light'?'default':'slate','Requested OS theme applied');
      assert.equal(result.photos.length,2,'Two founder studio portraits');
      assert.ok(result.article.includes('The end goal of MARS is to make TMU have the best student rocketry in Canada.'));
      assert.ok(!result.article.includes('MARS is one team.'));
      assert.ok(!/sponsorship package|reproduced as written|describes MARS in 2024|AI[- ]generated|provenance/i.test(result.article),'No visible provenance/editorial note');
      assert.match(result.letterHeading,/^(A )?letter from the founders\s*¶?$/i,'Plain founders-letter heading');
      assert.equal(result.letterHeadingStyle,'normal','Heading is not italic');
      assert.equal(result.paragraphs.length,3,'Complete three-paragraph letter retained');
      assert.ok(result.paragraphs.every(p=>p.styles.every(style=>style==='italic')),'Entire letter renders in italics');
      assert.ok(result.quote.startsWith('The Metropolitan Aerospace Rocket Society (MARS), founded by Nikolai Sydorenko and Zeulewan Mordasiewicz in 2023,'));
      assert.ok(result.quote.endsWith('to attain their Tripoli High Power Rocketry (HPR) certifications.'));
      assert.ok(!/Competition team|Liquid team/i.test(result.article),'No split-team structure');
      assert.equal(result.nav.filter(text=>text==='Philosophy').length,1,'One Philosophy desktop nav entry');
      assert.ok(!result.nav.some(text=>/Competition team/i.test(text)));
      assert.ok((await page.request.head(`${base}/sponsors/package.pdf`)).ok(),'Original sponsorship PDF still available without a visible provenance link');
      const expectedNames = ['nikolai','zeulewan'];
      for (const [index,photo] of result.photos.entries()) {
        assert.ok(photo.loaded,'Founder photograph decoded');
        assert.ok(photo.src.includes('/assets/display/'),'Responsive display derivative, not original embed');
        assert.ok(photo.original?.endsWith(`/assets/images/founders/${expectedNames[index]}-studio-v${index===0?3:2}.png`),'Nikolai lighting-v3 and unchanged Zeul-v2 assets');
        const source = inventory.sources.find(s=>s.original===photo.original);
        assert.ok(source,'Portrait source recorded in display manifest');
        if(index===1) assert.equal(source.sha256,'a107dcfce497ab3222d3610c1c2d223ee2899e40d2434533bb38b85c3bca7762','Zeul master pixels unchanged');
        const variant = source.variants.find(v=>new URL(v.url,base).href===photo.src);
        assert.ok(variant,'Selected responsive variant recorded in manifest');
        assert.equal(source.width,source.height,'Original studio portrait is square');
        assert.equal(variant.width,variant.height,'Selected derivative preserves square source');
        // These dimensions describe the edited asset, not the underlying camera photo's resolution.
        assert.ok(variant.width<=source.width,'Display derivative does not upscale edited asset pixels');
        assert.ok(photo.width<=source.width,'No CSS enlargement beyond edited asset dimensions');
        assert.ok(Math.abs(photo.width-photo.height)<1,'Visible portrait is square without distorted proportions');
        assert.ok(photo.frame.className.includes('mars-founder__portrait'),'Dedicated portrait crop frame');
        assert.equal(photo.frame.overflow,'hidden','Portrait plane is safely clipped by square frame');
        assert.ok(Math.abs(photo.frame.width-photo.frame.height)<1,'Visible portrait frame is square');
        assert.ok(photo.frame.width<=300.1&&photo.frame.width>=130,'Equal founder cards fit side by side, including narrowphone');
        assert.ok(Math.abs(photo.width/photo.frame.width-(index===0?1.3:1))<.01,'Approved Nikolai optical normalization; Zeul image plane unchanged');
        assert.ok(variant.width>=Math.min(source.width,photo.width*(width<=390?2:1))*.95,'Responsive selection accounts for actual imageplane and DPR');
        assert.equal(photo.overlay.position,'absolute','Metadata overlays actual photo');
        assert.equal(photo.overlay.fontStyle,'normal');assert.equal(photo.overlay.textAlign,'left');assert.equal(photo.overlay.color,'rgb(255, 255, 255)');
        assert.ok(photo.gradient.includes('linear-gradient'),'Subtle photo gradient instead of detachedflatbar');
        const targetSize=width<=384?24:width<=640?32:44;
        const captionHeight=width<=384?32:width<=640?40:64;
        assert.ok(photo.overlay.height<=captionHeight+.1,'Compact metadata row fits below face');
        assert.ok(photo.overlay.top>=photo.frame.top+photo.frame.height*.75,'Metadata stays in chest/bottomquarter');
        assert.ok(Math.abs(photo.overlay.bottom-(photo.frame.top+photo.frame.height))<1,'Metadata stays within picture bottom');
        assert.equal(photo.name,index===0?'Nikolai':'Zeul','Requested co-founder display name');
        assert.match(photo.caption,/Co-founder/,'Requested co-founder role');
        assert.equal(photo.portraitLinked,false,'Only icon links navigate, not whole portrait');
        const expectedLinks=index===0?['https://nikolaisydorenko.com/','https://www.linkedin.com/in/nikolai-sydorenko']:['https://zeuldocs.com/','https://www.linkedin.com/in/zeulewan/'];
        assert.deepEqual(photo.links.map(link=>link.href),expectedLinks,'Correct verified personal website/LinkedIn targets');
        for(const [linkIndex,link] of photo.links.entries()) {
          assert.equal(link.label,`${photo.name}'s ${linkIndex===0?'website':'LinkedIn'}`,'Accessible icon label');
          assert.equal(link.target,'_blank');assert.ok(link.rel.includes('noopener')&&link.rel.includes('noreferrer'));
          assert.ok(link.width>=targetSize&&link.height>=targetSize,'Icon links retain the intended accessible target size');
          assert.ok(link.iconWidth>0&&link.iconWidth<=24,'Compact visible icon');
          assert.ok(link.top>=photo.overlay.top&&link.top+link.height<=photo.overlay.bottom+.1,'Icon targets fit within photo overlay');
          assert.ok(link.left>=photo.frame.left&&link.right<=photo.frame.right+.1,'Icon targets stay within their own card');
        }
        assert.ok(photo.links[1].left>=photo.links[0].right,'Touch targets do not overlap');
        assert.ok(photo.identity.right<=photo.links[0].left,'Names/roles and icon links do not overlap');
        assert.ok(photo.identity.left>=photo.frame.left,'Names/roles remain inside their card');
        photo.nativeWidth=source.width; photo.nativeHeight=source.height; photo.variantWidth=variant.width;
        // Approximate landmarks supplied for accepted N-v3/Z-v2; actual lighting/face preservation still needs visual review.
        const landmarks=index===0?{crown:54,chin:748}:{crown:50,chin:950};
        photo.normalizedCrown=(photo.top-photo.frame.top+landmarks.crown/source.height*photo.height)/photo.frame.height;
        photo.normalizedChin=(photo.top-photo.frame.top+landmarks.chin/source.height*photo.height)/photo.frame.height;
        assert.ok(photo.normalizedCrown>0&&photo.normalizedCrown<.1,'Hair/headroom retained');
        assert.ok(photo.overlay.top>=photo.frame.top+photo.normalizedChin*photo.frame.height,'Metadata below chin, not on face');
      }
      assert.ok(Math.abs(result.photos[0].frame.width-result.photos[1].frame.width)<1,'Both portrait frames have the same visible size');
      assert.ok(Math.abs(result.photos[0].frame.top-result.photos[1].frame.top)<1,'Founder cards stay side by side at every width');
      assert.ok(result.photos[1].frame.left>=result.photos[0].frame.right,'Equal portrait columns do not overlap');
      assert.ok(Math.abs(result.photos[0].normalizedCrown-result.photos[1].normalizedCrown)<.025,'Matched crown positions');
      assert.ok(Math.abs(result.photos[0].normalizedChin-result.photos[1].normalizedChin)<.025,'Matched chin/head scale');
      await page.goto(`${base}/philosophy/Competition-Team/`,{waitUntil:'domcontentloaded'});
      assert.ok(await page.locator('article a[href="../"]').count() || await page.locator('article a').filter({hasText:'Philosophy page'}).count(),'Legacy URL links to consolidated Philosophy');
      await page.goto(`${base}/philosophy/`,{waitUntil:'domcontentloaded'});
      for (const image of await page.locator('article figure img').all()) await image.evaluate(i=>i.decode());
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(output,`philosophy-studio-${width}-${theme}.png`),fullPage:true});
      await page.locator('.mars-founders').screenshot({path:path.join(output,`founders-studio-${width}-${theme}.png`)});
      for(const link of await page.locator('.mars-founder__link').all()){
        await link.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
        assert.ok(await link.evaluate(a=>a.matches(':focus-visible')&&parseFloat(getComputedStyle(a).outlineWidth)>=2),'All4iconlinks have keyboardfocusoutline');
      }
      await page.locator('.mars-founders').screenshot({path:path.join(output,`founders-focus-${width}-${theme}.png`)});
      results.push({width,theme,...result});
      await page.close();
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:true,cases:results.map(r=>({width:r.width,theme:r.theme})),output}));
})().catch(error=>{console.error(error);process.exitCode=1;});

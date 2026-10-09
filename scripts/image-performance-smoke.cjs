/* First-party image delivery regression checks. Native lazy loading is threshold-based. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(root, 'ci/node_modules/playwright'));
const base = new URL(process.env.SITE_TEST_URL || 'http://127.0.0.1:8887');
const output = process.env.SITE_TEST_OUTPUT || path.join(root, '.preview/image-performance');
const generatedPrefix = process.env.DISPLAY_IMAGE_PREFIX || '/assets/display/';
const knownRoutes = ['/', '/gallery/', '/blog/2024/09/16/kickoff-meeting/', '/Guidelines/Archive/2024-2025/Rocket-Guide/'];
const routeArg = process.argv.find(arg => arg.startsWith('--route='));
if (routeArg && !knownRoutes.includes(routeArg.slice(8))) throw new Error('Unknown image-test route');
const routes = routeArg ? [routeArg.slice(8)] : knownRoutes;
const quick = process.argv.includes('--quick');
const reportOnly = process.argv.includes('--report-only');
const profiles = quick ? [{width:390,dpr:2,theme:'light'}, {width:1440,dpr:1,theme:'light'}] :
  [2,3].flatMap(dpr => ['light','dark'].map(theme => ({width:390,dpr,theme})))
    .concat(['light','dark'].map(theme => ({width:1440,dpr:1,theme})));
const budgets = {singleImage:1024*1024, initialImages:1.25*1024*1024, allImages:6*1024*1024};
const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='));
const baseline = baselineArg ? JSON.parse(fs.readFileSync(baselineArg.slice(11))) : [];
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/google-chrome',
    headless:true, args:['--no-sandbox','--disable-extensions','--disable-dev-shm-usage']});
  const reports = [], failures = [], decoded = new Map();
  try {
    const inventoryContext = await browser.newContext();
    const inventoryResponse = await inventoryContext.request.get(new URL(`${generatedPrefix}manifest.json`,base).href);
    if (!inventoryResponse.ok()) throw new Error('Generated display manifest missing');
    const inventory = await inventoryResponse.json();
    const variants = new Map((inventory.sources || []).flatMap(source => (source.variants || [])
      .map(variant => [new URL(variant.url,base).href,{...variant,policy:source.policy,original:source.original}])));
    await inventoryContext.close();
    for (const profile of profiles) for (const route of routes) {
      const page = await browser.newPage({viewport:{width:profile.width,height:900}, deviceScaleFactor:profile.dpr,
        isMobile:profile.width<1000, colorScheme:profile.theme});
      const responses = [], bodies = [], requests = [];
      const onResponse = response => {
        if (response.request().resourceType() !== 'image' || new URL(response.url()).origin !== base.origin) return;
        const item = {url:response.url(),status:response.status(),bytes:Number(response.headers()['content-length'] || 0)};
        requests.push(item); responses.push(response);
        if (!decoded.has(item.url)) bodies.push(response.body().then(body => ({url:item.url,body})).catch(() => null));
      };
      page.on('response', onResponse);
      await page.goto(new URL(route,base).href,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => [...document.images].filter(i => {const r=i.getBoundingClientRect();return r.width&&r.y<innerHeight&&r.bottom>0;}).every(i=>i.complete),null,{timeout:15000});
      await page.waitForTimeout(600);
      const initial = requests.slice();
      for (const image of await page.locator('img').all()) if (await image.isVisible()) {
        await image.scrollIntoViewIfNeeded(); await image.evaluate(i => i.decode().catch(()=>{}));
      }
      await page.waitForTimeout(100); page.off('response',onResponse);
      await page.evaluate(() => scrollTo(0,0)); await page.waitForTimeout(100);
      for (const result of await Promise.all(bodies)) if (result && !decoded.has(result.url)) {
        const bitmap = await page.evaluate(async data => {
          try {
            const bytes=Uint8Array.from(atob(data),char=>char.charCodeAt(0));
            const image=await createImageBitmap(new Blob([bytes]));
            const canvas=document.createElement('canvas'); canvas.width=image.width;canvas.height=image.height;
            const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const corners=[[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]]
              .map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);
            const result={width:image.width,height:image.height,cornerAlpha:corners};image.close();return result;
          } catch { return null; }
        },result.body.toString('base64'));
        if (bitmap) decoded.set(result.url,bitmap);
      }
      const dom = await page.evaluate(() => ({width:innerWidth,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,
        images:[...document.images].map(i => {
          const r=i.getBoundingClientRect();
          const candidates=[i.getAttribute('srcset') || '', ...[...(i.parentElement?.tagName==='PICTURE'?i.parentElement.querySelectorAll('source'):[])].map(s=>s.srcset)]
            .flatMap(set=>set.split(',')).map(entry=>entry.trim()).filter(Boolean).map(entry=>{const parts=entry.split(/\s+/);return {url:new URL(parts[0],document.baseURI).href,descriptor:parts[1]};});
          return {src:i.currentSrc||i.src,alt:i.alt,width:r.width,height:r.height,loaded:i.complete&&i.naturalWidth>0,
            loading:i.loading,priority:i.fetchPriority,candidates,selectedDescriptor:candidates.find(c=>c.url===(i.currentSrc||i.src))?.descriptor,
            hero:!!i.closest('.mars-hero'),heroLogo:i.classList.contains('mars-hero__logo'),brand:!!i.closest('.mars-header__brand')||i.classList.contains('mars-hero__logo')};
        }),
        originalLinks:[...document.querySelectorAll('a[href]')].filter(a=>/\.(jpe?g|png|webp|avif|pdf)(?:[?#]|$)/i.test(a.href)).map(a=>a.href),
        video:document.querySelector('video')?{controls:document.querySelector('video').controls,autoplay:document.querySelector('video').autoplay,poster:document.querySelector('video').poster}:null}));
      const caseErrors = [], check=(ok,message)=>{if(!ok)caseErrors.push(message);};
      check(dom.scrollWidth<=profile.width,'Horizontal overflow');
      for (const image of dom.images.filter(i=>i.width&&i.height)) {
        check(image.loaded,`Broken image: ${image.src}`);
        if (new URL(image.src).origin !== base.origin) continue;
        const url=new URL(image.src);
        if (/\.(png|jpe?g|webp|avif)$/i.test(url.pathname)) check(url.pathname.startsWith(generatedPrefix),`Raw/non-display raster embedded: ${url.pathname}`);
        image.encoded = decoded.get(image.src);
        const declared = variants.get(image.src);
        if (url.pathname.startsWith(generatedPrefix)) check(!!declared,`Display image absent from manifest: ${url.pathname}`);
        if (declared && image.encoded) check(declared.width===image.encoded.width&&declared.height===image.encoded.height,`Manifest dimensions incorrect: ${url.pathname}`);
        if (image.selectedDescriptor?.endsWith('w') && image.encoded) check(parseInt(image.selectedDescriptor)===image.encoded.width,`Incorrect width descriptor: ${url.pathname}`);
        if (image.brand && image.encoded) check(image.encoded.cornerAlpha.every(alpha=>alpha===0),`Brand canvas lost transparency: ${url.pathname}`);
        if (image.hero) {check(image.loading!=='lazy','Primary hero/wordmark lazy-loaded');check(image.priority==='high','Primary hero/wordmark missing high priority');}
      }
      const losslessExceptions=[];
      for (const request of requests) {
        const declared=variants.get(request.url);
        check(request.status<400,`Image HTTP ${request.status}: ${request.url}`);
        if (declared) check(request.bytes===declared.bytes,`Manifest byte size incorrect: ${request.url}`);
        const losslessException=declared?.policy==='lossless'&&request.bytes>budgets.singleImage;
        if (losslessException) losslessExceptions.push({url:request.url,bytes:request.bytes,original:declared.original});
        check(request.bytes<=budgets.singleImage||losslessException,`Photo image exceeds 1MiB: ${request.url}`);
      }
      const initialBytes=initial.reduce((sum,r)=>sum+r.bytes,0),fullBytes=requests.reduce((sum,r)=>sum+r.bytes,0);
      check(initialBytes<=budgets.initialImages,'Initial first-party image payload exceeds 1.25MiB');
      check(fullBytes<=budgets.allImages,'Fully scrolled first-party image payload exceeds 6MiB');
      if (route==='/gallery/') check(initial.length<requests.length,'Gallery no longer defers any offscreen images');
      if (dom.video) {check(dom.video.controls,'Video controls missing');check(!dom.video.autoplay,'Video autoplay added');}
      const old=baseline.find(item=>item.route===route&&item.width===profile.width&&item.dpr===profile.dpr&&item.theme===profile.theme);
      if (old) for (const link of old.dom.originalLinks || []) {
        const href=typeof link==='string'?link:link.href;
        check(dom.originalLinks.some(current=>new URL(current).pathname===new URL(href).pathname),`Original download link lost: ${href}`);
      }
      const localOriginals=dom.originalLinks.filter(href=>new URL(href).origin===base.origin);
      for (const href of localOriginals) check((await page.request.head(href)).ok(),`Original/PDF link not available: ${href}`);
      if (route==='/') check((await page.request.head(new URL('/sponsors/package.pdf',base).href)).ok(),'Original sponsor PDF missing');
      const report={route,...profile,initialCount:initial.length,initialBytes,fullCount:requests.length,fullBytes,dom,requests,losslessExceptions,failures:caseErrors};
      reports.push(report);failures.push(...caseErrors.map(error=>`${route} ${profile.width}@${profile.dpr} ${profile.theme}: ${error}`));
      console.log(JSON.stringify({route,...profile,initialBytes,fullBytes,initialCount:initial.length,fullCount:requests.length,failures:caseErrors}));
      await page.screenshot({path:path.join(output,`${route==='/'?'home':route.replaceAll('/','-')}-${profile.width}-${profile.dpr}-${profile.theme}.png`)});
      await page.close();
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({budgets,generatedPrefix,reports,failures},null,2));
  if(failures.length&&!reportOnly)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});

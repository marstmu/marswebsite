/* Optional focused playback check, using an already installed Playwright. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MARS_PLAYWRIGHT_MODULE || 'playwright');
const targets = (process.env.MARS_VIDEO_TEST_URLS || 'http://127.0.0.1:8887/,https://workstation.tailee9084.ts.net:8887/').split(',');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MARS_CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    for (const target of targets) {
      const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
      const page = await context.newPage();
      const errors = [];
      const videoResponses = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (new URL(response.url()).pathname.endsWith('.mp4')) {
          videoResponses.push({status: response.status(), contentRange: response.headers()['content-range']});
        }
      });
      await page.goto(target, {waitUntil: 'domcontentloaded'});
      const video = page.locator('.mars-film video');
      assert.equal(await video.count(), 1);
      await video.scrollIntoViewIfNeeded();
      assert.ok(await video.evaluate(element => element.controls));
      assert.equal(await video.evaluate(element => element.autoplay), false);
      // A trusted click supplies the same user activation as the native controls.
      await video.click();
      await video.evaluate(element => {element.muted = false; element.volume = 1; return element.play();});
      await page.waitForFunction(() => {
        const element = document.querySelector('video');
        return element && !element.paused && element.currentTime > 0.8 && element.readyState >= 2;
      });
      const playback = await video.evaluate(element => ({
        duration: element.duration, width: element.videoWidth, height: element.videoHeight,
        muted: element.muted, volume: element.volume,
        videoFrames: element.getVideoPlaybackQuality().totalVideoFrames,
        decodedAudioBytes: element.webkitAudioDecodedByteCount,
      }));
      assert.equal(playback.width, 1920);
      assert.equal(playback.height, 1080);
      assert.ok(playback.duration > 130 && playback.duration < 133);
      assert.ok(playback.videoFrames > 0);
      assert.ok(playback.decodedAudioBytes > 0, 'Browser must decode the audio stream');
      const seekTarget = Math.floor(playback.duration * 0.65);
      await video.evaluate((element, time) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Seek timed out')), 15000);
          element.addEventListener('seeked', () => {clearTimeout(timeout); resolve();}, {once: true});
          element.currentTime = time;
        });
      }, seekTarget);
      await page.waitForFunction(time => {
        const element = document.querySelector('video');
        return element.currentTime > time + 0.2 && element.readyState >= 2;
      }, seekTarget);
      await video.evaluate(element => element.pause());
      const download = await context.request.head(new URL('/downloads/mars-video-full-quality', target).href);
      assert.equal(download.status(), 200);
      assert.match(download.headers()['content-disposition'], /^attachment; filename="mars-2026-winter-trailer-full-quality\.mkv"$/);
      assert.equal(download.headers()['accept-ranges'], 'bytes');
      const part = await context.request.get(new URL('/downloads/mars-video-full-quality', target).href, {headers: {Range: 'bytes=0-127'}});
      assert.equal(part.status(), 206);
      assert.equal((await part.body()).length, 128);
      assert.equal(part.headers()['content-range'], 'bytes 0-127/41736409');
      assert.ok(videoResponses.some(response => response.status === 206));
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({url: target, playback, seekSeconds: seekTarget, byteRangePlayback: 'ok', masterDownload: 'ok', runtimeErrors: errors}, null, 2));
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exit(1);});

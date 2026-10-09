/* Minimum photographic coverage, not a fixed total: new originals may be added.
   Four former-homepage pictures are lower-resolution copies of gallery photos.
   Preserve their higher-resolution originals rather than duplicate the images. */
const assert = require('node:assert/strict');
const requiredOriginals = [
  '/gallery/22.JPG', '/gallery/15.JPG', '/gallery/16.JPG', '/gallery/18.JPG',
  '/gallery/19.JPG', '/gallery/1.png', '/gallery/10.png', '/gallery/7.png',
  '/gallery/8.png', '/gallery/20.jpg', '/gallery/17.JPG', '/gallery/21.jpg',
  '/gallery/9.png', '/gallery/14.png', '/gallery/13.png', '/gallery/2.png',
  '/gallery/12.png', '/gallery/11.png', '/gallery/3.png', '/gallery/4.png',
  '/gallery/5.png', '/gallery/6.png',
  '/assets/images/hero.jpg', '/assets/images/1.jpg', '/assets/images/3.jpg',
  '/assets/images/pcb.jpg', '/assets/images/2.jpg', '/assets/images/zn.png',
  '/assets/images/15.png', '/assets/images/group_photo.jpg',
];
const formerHomepageAliases = {
  '/assets/images/6.png': '/gallery/6.png',
  '/assets/images/8.png': '/gallery/8.png',
  '/assets/images/11.png': '/gallery/11.png',
  '/assets/images/12.png': '/gallery/12.png',
};
function assertGalleryCoverage(urls) {
  const paths = urls.map(url => decodeURIComponent(new URL(url).pathname));
  const unique = new Set(paths);
  assert.equal(unique.size, paths.length, 'Gallery repeats an original download');
  for (const original of requiredOriginals) assert(unique.has(original), `Gallery original missing: ${original}`);
  for (const [copy, original] of Object.entries(formerHomepageAliases)) {
    assert(unique.has(original), `Former homepage photograph missing: ${copy}`);
    assert(!unique.has(copy), `Gallery duplicates the photograph represented by ${original}`);
  }
}
module.exports = {assertGalleryCoverage, requiredOriginals, formerHomepageAliases};

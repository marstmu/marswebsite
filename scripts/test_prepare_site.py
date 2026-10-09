"""Regression checks for original preservation and responsive delivery."""
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageCms
from prepare_site import EDITORIAL_OUTPUT_EXCLUSIONS, Media, Rewriter, prepare


class DisplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.site = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def image(self, name, size=(1000, 600), mode="RGB"):
        path = self.site / name
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new(mode, size, (190, 20, 30, 120) if mode == "RGBA" else (190, 20, 30)).save(path)
        return path

    def rewrite(self, content):
        page = self.site / "index.html"
        page.write_text(content)
        prepare(self.site)
        return page.read_text()

    def test_download_original_hash_and_real_descriptors(self):
        path = self.image("photo.jpg")
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        result = self.rewrite('<a href="photo.jpg"><img src="photo.jpg"></a>')
        self.assertIn('href="photo.jpg"', result)
        self.assertIn('data-original-src="/photo.jpg"', result)
        self.assertIn('480w', result)
        self.assertIn('1000w', result)
        self.assertNotIn('1440w', result)
        self.assertIn('loading="lazy"', result)
        self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_lossless_alpha_and_no_upscale(self):
        self.image("img/logo.png", (120, 40), "RGBA")
        media = Media(self.site)
        result = media.variants("img/logo.png", self.site / "index.html")
        self.assertEqual(result["policy"], "lossless")
        self.assertEqual([item["width"] for item in result["variants"]], [120])
        with Image.open(self.site / result["variants"][0]["url"].lstrip("/")) as image:
            self.assertEqual(image.getpixel((20, 20)), (190, 20, 30, 120))

    def test_animation_and_vector_unchanged(self):
        path = self.site / "animation.gif"
        Image.new("RGB", (20, 20), "red").save(path, save_all=True, append_images=[Image.new("RGB", (20, 20), "blue")], duration=100, loop=0)
        (self.site / "icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
        result = self.rewrite('<img src="animation.gif"><img src="icon.svg">')
        self.assertIn('src="animation.gif"', result)
        self.assertIn('src="icon.svg"', result)
        self.assertNotIn("assets/display/", result)
        with Image.open(path) as image:
            self.assertEqual(image.n_frames, 2)

    def test_art_direction_and_hero_priority(self):
        self.image("portrait.jpg", (600, 900))
        self.image("landscape.jpg", (900, 600))
        self.image("img/logo.png", (100, 30))
        result = self.rewrite('<section class="mars-hero"><picture class="mars-hero__background"><source media="(max-width:640px)" srcset="portrait.jpg"><img src="landscape.jpg"></picture><img class="mars-hero__logo" src="img/logo.png"></section>')
        self.assertIn('data-original-src="/portrait.jpg"', result)
        self.assertIn('data-original-src="/landscape.jpg"', result)
        self.assertIn('max(100vw, 66.6667svh)', result)
        self.assertIn('max(100vw, 150.0000svh)', result)
        self.assertIn('fetchpriority="high"', result)
        self.assertNotIn('loading="lazy"', result)

    def test_exif_orientation(self):
        image = Image.new("RGB", (80, 120), "red")
        exif = Image.Exif()
        exif[274] = 6
        image.save(self.site / "rotated.jpg", exif=exif)
        result = Media(self.site).variants("rotated.jpg", self.site / "index.html")
        self.assertEqual((result["width"], result["height"]), (120, 80))

    def test_idempotent_html(self):
        self.image("photo.jpg", (40, 30))
        first = self.rewrite('<img src="photo.jpg">')
        manifest = (self.site / "assets/display/manifest.json").read_text()
        prepare(self.site)
        self.assertEqual(first, (self.site / "index.html").read_text())
        self.assertEqual(manifest, (self.site / "assets/display/manifest.json").read_text())

    def test_unapproved_remote_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            Media(self.site).variants("https://example.com/image.jpg", self.site / "index.html")

    def test_spaces_and_icc(self):
        image = Image.new("RGB", (40, 30), "red")
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        image.save(self.site / "screen shot.png", icc_profile=profile)
        result = self.rewrite('<img src="screen shot.png">')
        self.assertIn('data-original-src="/screen shot.png"', result)
        generated = next((self.site / "assets/display").glob("*.webp"))
        with Image.open(generated) as encoded:
            self.assertTrue(encoded.info.get("icc_profile"))
            self.assertEqual(encoded.getpixel((10, 10)), (255, 0, 0))

    def test_cmyk_jpeg(self):
        Image.new("CMYK", (40, 30), (0, 255, 255, 0)).save(self.site / "print.jpg")
        result = Media(self.site).variants("print.jpg", self.site / "index.html")
        with Image.open(self.site / result["variants"][0]["url"].lstrip("/")) as encoded:
            self.assertEqual(encoded.mode, "RGB")

    def test_screenshot_and_photographic_png_policies(self):
        self.image("blog/Screenshot 2024.png", (60, 40))
        self.image("gallery/photo.png", (61, 40))
        media = Media(self.site)
        self.assertEqual(media.variants("blog/Screenshot 2024.png", self.site / "index.html")["policy"], "lossless")
        self.assertEqual(media.variants("gallery/photo.png", self.site / "index.html")["policy"], "photo")

    def test_manual_preview_uses_original_without_double_lossy(self):
        source = self.image("gallery/full.png", (800, 600))
        self.image("assets/previews/manual.webp", (100, 75))
        media = Media(self.site)
        media.preview_sources["assets/previews/manual.webp"] = source
        result = media.variants("assets/previews/manual.webp", self.site / "index.html")
        self.assertEqual(result["original"], "/gallery/full.png")
        self.assertEqual(result["width"], 800)
        self.assertEqual(result["sha256"], hashlib.sha256(source.read_bytes()).hexdigest())

    def test_authored_dimensions_retained(self):
        self.image("screen.png", (1200, 900))
        result = self.rewrite('<img src="screen.png" width="660"><img src="screen.png" width="440" height="330">')
        self.assertRegex(result, 'width="660"[^>]*height="495"')
        self.assertIn('width="440" height="330"', result)

    def test_contain_thumbnail_sizes_and_photo_override(self):
        self.image("gallery/portrait.png", (600, 900))
        self.image("blog/Screenshot 2024-09-16 205717.png", (300, 220))
        result = self.rewrite('<div class="mars-gallery"><img src="gallery/portrait.png"></div>')
        self.assertIn("min(calc(100vw - 48px), 8.6667rem)", result)
        self.assertIn("320w", result)
        media = Media(self.site)
        self.assertEqual(media.variants("blog/Screenshot 2024-09-16 205717.png", self.site / "index.html")["policy"], "photo")

    def test_primary_article_image_not_lazy(self):
        self.image("first.jpg", (60, 40))
        self.image("later.jpg", (61, 40))
        result = self.rewrite('<div class="md-content--post"><article class="md-content__inner"><img src="first.jpg"><img src="later.jpg"></article></div>')
        self.assertEqual(result.count('loading="eager"'), 1)
        self.assertEqual(result.count('fetchpriority="high"'), 1)
        self.assertEqual(result.count('loading="lazy"'), 1)

    def test_full_frame_gallery_uses_column_width(self):
        self.image("gallery/portrait.png", (600, 900))
        result = self.rewrite('<div class="mars-gallery mars-gallery--full-frame"><a href="gallery/portrait.png"><img src="gallery/portrait.png" width="200" height="300"></a><figcaption>A rocket in flight.</figcaption></div>')
        self.assertIn('sizes="(max-width: 640px) calc(100vw - 48px), (max-width: 999px) calc((100vw - 62px) / 2), 469px"', result)
        self.assertIn('width="200" height="300"', result)
        self.assertIn('href="gallery/portrait.png"', result)
        self.assertIn('loading="lazy"', result)
        self.assertIn('<figcaption>A rocket in flight.</figcaption>', result)

    def test_founder_full_source_cards_responsive_sizes(self):
        self.image("founder.png", (1254, 1254))
        result = self.rewrite('<div class="mars-founders"><figure><div class="mars-founder__portrait"><img src="founder.png" width="1254" height="1254"></div><figcaption><strong>Nikolai</strong><span>Co-founder</span><a href="https://example.com/">Website</a></figcaption></figure></div>')
        self.assertIn('sizes="(max-width: 640px) calc((100vw - 40px) / 2), (max-width: 999px) min(300px, calc((100vw - 57px) / 2)), 300px"', result)
        self.assertIn('loading="lazy"', result)
        self.assertIn('href="https://example.com/"', result)
        result = self.rewrite('<div class="mars-founders"><div class="mars-founder__portrait mars-founder__portrait--nikolai"><img src="founder.png"></div></div>')
        self.assertIn('sizes="(max-width: 640px) calc(64.85vw - 25.94px), (max-width: 999px) min(389.1px, calc(64.85vw - 36.9645px)), 389.1px"', result)

    def test_hero_native_jpeg_preserved_and_dominated_candidates_omitted(self):
        path = self.image("hero.jpg", (2000, 1124))
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        media = Media(self.site)
        media.cache = self.site / "cache"
        result = media.variants("hero.jpg", self.site / "index.html", hero=True)
        self.assertEqual(result["policy"], "hero-q90")
        self.assertEqual((result["width"], result["height"]), (2000, 1124))
        native = result["variants"][-1]
        self.assertEqual((native["width"], native["height"]), (2000, 1124))
        self.assertEqual(native["encoding"], "source-copy")
        self.assertEqual(native["format"], "JPEG")
        self.assertEqual(native["sha256"], before)
        self.assertEqual(hashlib.sha256((self.site / native["url"].lstrip("/")).read_bytes()).hexdigest(), before)
        self.assertTrue(all(v["width"] <= 2000 for v in result["variants"]))
        self.assertTrue(all(v["bytes"] < path.stat().st_size for v in result["variants"][:-1]))
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)

    def test_hero_quality_and_cache_identity_do_not_change_normal_photos(self):
        path = self.image("photo.jpg", (1000, 600))
        media = Media(self.site)
        media.cache = self.site / "cache"
        normal = media.variants("photo.jpg", self.site / "index.html")
        hero = media.variants("photo.jpg", self.site / "index.html", hero=True)
        with patch("prepare_site.HERO_QUALITY", 89):
            different_quality = media.variants("photo.jpg", self.site / "index.html", hero=True)
        self.assertEqual(normal["policy"], "photo")
        self.assertEqual(hero["policy"], "hero-q90")
        self.assertEqual(different_quality["policy"], "hero-q89")
        self.assertEqual(len(media.sources), 3)
        self.assertEqual(media.variants("photo.jpg", self.site / "index.html"), normal)
        for result, quality in ((normal, 76), (hero, 90)):
            variant = next(v for v in result["variants"] if v["width"] == 240)
            with Image.open(path) as original:
                reference = original.convert("RGB").resize((240, 144), Image.Resampling.LANCZOS)
                encoded = io.BytesIO()
                reference.save(encoded, format="WEBP", lossless=False, quality=quality, method=4)
            self.assertEqual((self.site / variant["url"].lstrip("/")).read_bytes(), encoded.getvalue())

    def test_hero_rotated_and_cmyk_sources_are_not_native_copied(self):
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (80, 120), "red").save(self.site / "rotated.jpg", exif=exif)
        Image.new("CMYK", (80, 120), (0, 255, 255, 0)).save(self.site / "print.jpg")
        media = Media(self.site)
        for name in ("rotated.jpg", "print.jpg"):
            result = media.variants(name, self.site / "index.html", hero=True)
            self.assertTrue(all(v["format"] == "WEBP" for v in result["variants"]))
            self.assertEqual(result["variants"][-1]["width"], result["width"])
        self.assertEqual((media.variants("rotated.jpg", self.site / "index.html", hero=True)["width"], media.variants("rotated.jpg", self.site / "index.html", hero=True)["height"]), (120, 80))

    def test_hero_native_jpeg_keeps_embedded_icc_bytes(self):
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        path = self.site / "color.jpg"
        Image.new("RGB", (60, 40), "red").save(path, icc_profile=profile)
        result = Media(self.site).variants("color.jpg", self.site / "index.html", hero=True)
        native = self.site / result["variants"][-1]["url"].lstrip("/")
        self.assertEqual(native.read_bytes(), path.read_bytes())
        with Image.open(native) as image:
            self.assertEqual(image.info["icc_profile"], profile)

    def test_hero_repeated_mixed_build_and_policy_upgrade_pruning(self):
        self.image("hero.jpg", (1000, 600))
        content = '<img src="hero.jpg"><picture class="mars-hero__background"><img src="hero.jpg"></picture>'
        first = self.rewrite(content)
        manifest = (self.site / "assets/display/manifest.json").read_text()
        prepare(self.site)
        self.assertEqual(first, (self.site / "index.html").read_text())
        self.assertEqual(manifest, (self.site / "assets/display/manifest.json").read_text())
        original_assets = json.loads(manifest)["sources"]
        ordinary = next(s for s in original_assets if s["policy"] == "photo")
        retained = self.site / "assets/display/keep-me.jpg"
        retained.write_bytes(b"not-owned-by-the-display-pipeline")
        (self.site / "second.html").write_text('<img src="hero.jpg">')
        with patch("prepare_site.HERO_QUALITY", 89):
            prepare(self.site)
        upgraded = json.loads((self.site / "assets/display/manifest.json").read_text())["sources"]
        self.assertEqual(next(s for s in upgraded if s["policy"] == "photo"), ordinary)
        self.assertTrue(any(s["policy"] == "hero-q89" for s in upgraded))
        self.assertFalse(any("hero-q90" in p.name for p in (self.site / "assets/display").iterdir()))
        self.assertTrue(retained.is_file())
        self.assertIn('data-original-src="/hero.jpg"', (self.site / "second.html").read_text())

    def test_editorial_exclusion_only_touches_exact_generated_paths(self):
        selected = self.image("assets/images/founders/nikolai-studio-v3.png", (40, 40))
        zeul = self.image("assets/images/founders/zeulewan-studio-v2.png", (40, 40))
        original = self.image("gallery/original.png", (41, 40))
        hashes = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in (selected, zeul, original)}
        for relative in EDITORIAL_OUTPUT_EXCLUSIONS:
            path = self.site / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"retained source fixture copied into output")
        self.rewrite('<div class="mars-founders"><img src="assets/images/founders/nikolai-studio-v3.png"><img src="assets/images/founders/zeulewan-studio-v2.png"></div><a href="gallery/original.png">Original</a>')
        self.assertTrue(all(not (self.site / relative).exists() for relative in EDITORIAL_OUTPUT_EXCLUSIONS))
        self.assertTrue(all(hashlib.sha256(path.read_bytes()).hexdigest() == before for path, before in hashes.items()))
        prepare(self.site)  # Omission stays idempotent.
        self.assertTrue(all(path.exists() for path in hashes))

    def test_repository_source_preparation_is_rejected_before_writes(self):
        with patch("prepare_site.ROOT", self.site):
            docs = self.site / "docs"
            docs.mkdir()
            source = docs / "index.html"
            source.write_text("untouched source")
            for directory in (self.site, docs):
                with self.assertRaisesRegex(ValueError, "generated site output"):
                    prepare(directory)
            self.assertEqual(source.read_text(), "untouched source")

    def test_editorial_symlink_is_not_followed_or_deleted(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            source = Path(elsewhere) / "provenance.json"
            source.write_text("private source")
            published = self.site / EDITORIAL_OUTPUT_EXCLUSIONS[0]
            published.parent.mkdir(parents=True)
            published.symlink_to(source)
            with self.assertRaisesRegex(ValueError, "symlink"):
                self.rewrite("<h1>Fixture</h1>")
            self.assertTrue(published.is_symlink())
            self.assertEqual(source.read_text(), "private source")

    def test_editorial_symlink_parent_cannot_delete_source(self):
        with tempfile.TemporaryDirectory() as elsewhere:
            sources = Path(elsewhere)
            source = sources / "provenance.json"
            source.write_text("private original metadata")
            target = self.site / "assets/images/founders"
            target.parent.mkdir(parents=True)
            target.symlink_to(sources, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                self.rewrite("<h1>Fixture</h1>")
            self.assertTrue(target.is_symlink())
            self.assertEqual(source.read_text(), "private original metadata")


if __name__ == "__main__":
    unittest.main()

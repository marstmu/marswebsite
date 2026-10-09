"""Offline fixtures for link validation and preview/public boundaries."""
from pathlib import Path
import tempfile
import unittest

from check_site import SiteParser, audit_site, darkreader_lock_is_valid


class SiteAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.site = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def file(self, name, content="", *, darkreader=True):
        path = self.site / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix == ".html" and darkreader:
            content = '<html><head><meta name="darkreader-lock"></head><body>' + content + '</body></html>'
        path.write_text(content)
        return path

    def audit(self, **kwargs):
        return audit_site(self.site, required_paths=(), original_pdf=None, **kwargs)[0]

    def test_relative_root_and_canonical_links(self):
        self.file("index.html", '<a href="guide/?semester=2026#one">Guide</a><a href="https://marstmu.com/guide/#one">Absolute</a><a href="//www.marstmu.com/guide/#one">Alias</a>')
        self.file("guide/index.html", '<h2 id="one">One</h2><a href="../">Home</a><a href="/index.html">Home2</a>')
        self.assertEqual(self.audit(), [])

    def test_missing_page_and_fragment(self):
        self.file("index.html", '<a href="missing/">Bad</a><a href="https://marstmu.com/guide/#gone">Bad2</a>')
        self.file("guide/index.html", '<h2 id="exists">Existing</h2>')
        failures = self.audit()
        self.assertTrue(any("Missing local target" in f and "missing/" in f for f in failures))
        self.assertTrue(any("Missing fragment" in f and "#gone" in f for f in failures))

    def test_encoded_unicode_fragments_named_anchors_and_top(self):
        self.file("index.html", '<a href="#caf%C3%A9">Unicode</a><a href="#old">Named</a><a href="#">Top</a><h2 id="café">Title</h2><a name="old"></a>')
        self.assertEqual(self.audit(), [])

    def test_spaces_query_and_all_download_extensions(self):
        self.file("index.html", '<a href="files/PCB%20assembly.step?download=1">STEP</a><img src="files/PCB assembly.png">')
        self.file("files/PCB assembly.step", "solid pcb")
        self.file("files/PCB assembly.png", "test-image")
        self.assertEqual(self.audit(), [])

    def test_srcset_posters_originals_styles_and_fonts(self):
        self.file("index.html", '<img src="image.png" srcset="image.png 100w, missing.webp 200w" data-original-src="source.png"><video poster="poster.webp"><source src="video.mp4"></video><link rel="stylesheet" href="css/main.css">')
        for name in ("image.png", "source.png", "poster.webp", "video.mp4"):
            self.file(name)
        self.file("css/main.css", '/*url(fake.woff2)*/ @font-face{src:url("../fonts/font name.woff2")} .x{background:url(data:image/png;base64,AAAA)}')
        self.file("fonts/font name.woff2")
        failures = self.audit()
        self.assertEqual(len(failures), 1)
        self.assertIn("missing.webp", failures[0])

    def test_css_dependency_and_inline_style(self):
        self.file("index.html", '<style>.x{background:url(no.png)}</style><img style="background:url(also-no.png)">')
        self.file("css/main.css", "@font-face{src:url(no.woff2)}")
        self.assertEqual(len(self.audit()), 3)

    def test_external_and_non_http_links_not_network_checked(self):
        self.file("index.html", '<a href="https://example.com/404#missing">External</a><a href="mailto:team@example.com">Email</a><a href="tel:+1234">Call</a><img src="data:image/png;base64,AAA"><a href="javascript:void(0)">Control</a>')
        self.assertEqual(self.audit(), [])

    def test_exact_private_download_allowlist(self):
        self.file("index.html", '<meta name="robots" content="noindex, nofollow, noarchive"><a href="/downloads/mars-images-full-resolution">ZIP</a><a href="/downloads/mars-video-full-quality?download=1">Master</a>')
        self.assertEqual(self.audit(preview=True), [])
        self.assertEqual(len(self.audit()), 2)
        self.file("bad.html", '<meta name="robots" content="noindex, nofollow, noarchive"><a href="/downloads/arbitrary-secret">Bad</a>')
        self.assertTrue(any("arbitrary-secret" in f for f in self.audit(preview=True)))

    def test_preview_alias_only_accepted_in_preview(self):
        self.file("index.html", '<meta name="robots" content="noindex, nofollow, noarchive"><a href="https://workstation.tailee9084.ts.net:8887/guide/">Guide</a>')
        self.file("guide/index.html", '<meta name="robots" content="noindex, nofollow, noarchive">')
        self.assertEqual(self.audit(preview=True), [])
        self.assertTrue(any("Private preview URL" in f for f in self.audit()))

    def test_noindex_required_on_every_preview_page(self):
        self.file("index.html", '<meta name="robots" content="noindex, nofollow, noarchive">')
        self.file("guide/index.html", "Missing robots")
        failures = self.audit(preview=True)
        self.assertEqual(len(failures), 1)
        self.assertIn("guide/index.html", failures[0])

    def test_hidden_draft_html_rejected(self):
        self.file("index.html")
        self.file(".Teams/old/index.html")
        self.assertTrue(any("Excluded draft content" in f for f in self.audit()))

    def test_symlink_cannot_escape_build(self):
        with tempfile.TemporaryDirectory() as other:
            secret = Path(other) / "secret.txt"
            secret.write_text("private fixture")
            (self.site / "escape.txt").symlink_to(secret)
            self.file("index.html", '<a href="escape.txt">Bad</a>')
            self.assertTrue(any("escapes site" in f for f in self.audit()))

    def test_project_mount_and_base_tag(self):
        self.file("index.html", '<base href="/project/"><a href="guide/#one">Guide</a>')
        self.file("guide/index.html", '<h2 id="one">One</h2><a href="https://marstmu.com/project/">Home</a><a href="https://marstmu.com/another-project/">Other application</a>')
        self.assertEqual(self.audit(site_url="https://marstmu.com/project/"), [])

    def test_required_route_and_pdf_integrity(self):
        source = self.file("original.pdf", "exact original")
        self.file("index.html")
        self.file("sponsors/package.pdf", "changed")
        failures, count = audit_site(self.site, required_paths=("missing.html",), original_pdf=source)
        self.assertEqual(count, 1)
        self.assertIn("Missing preserved/new route: missing.html", failures)
        self.assertIn("Original sponsor PDF changed during build", failures)

    def test_darkreader_lock_required_on_every_page_type(self):
        for name in ("index.html", "404.html", "old/index.html", "blog/post/index.html"):
            self.file(name, '<html><head></head><body></body></html>', darkreader=False)
        failures = self.audit()
        self.assertEqual(len(failures), 4)
        self.assertTrue(all("Dark Reader opt-out" in failure for failure in failures))


class DarkReaderLockTests(unittest.TestCase):
    def test_exactly_one_in_head(self):
        for document in (
            '<html><head><meta name="darkreader-lock"></head><body></body></html>',
            '<head><meta name="darkreader-lock" /></head>',
            '<HEAD><META NAME="DarkReader-Lock"></HEAD>',
        ):
            with self.subTest(document=document):
                parser = SiteParser()
                parser.feed(document)
                self.assertTrue(darkreader_lock_is_valid(parser))

    def test_missing_duplicate_or_body_lock_is_rejected(self):
        for document in (
            '<html><head></head><body></body></html>',
            '<head><meta name="darkreader-lock"><meta name="darkreader-lock"></head>',
            '<head></head><body><meta name="darkreader-lock"></body>',
            '<head><meta name="darkreader-lock"></head><body><meta name="darkreader-lock"></body>',
        ):
            with self.subTest(document=document):
                parser = SiteParser()
                parser.feed(document)
                self.assertFalse(darkreader_lock_is_valid(parser))

    def test_native_redirect_keeps_behavior_and_shared_lock(self):
        from jinja2 import Environment, FileSystemLoader
        environment = Environment(loader=FileSystemLoader(Path(__file__).resolve().parents[1] / "overrides"))
        output = environment.get_template("redirect.html").render(config={"site_name": "MARS"}, page={"meta": {"location": "../competition/"}})
        parser = SiteParser()
        parser.feed(output)
        self.assertTrue(darkreader_lock_is_valid(parser))
        self.assertIn('content="0;url=../competition/"', output)
        self.assertIn('["../competition/",window.location.search,window.location.hash]', output)


if __name__ == "__main__":
    unittest.main()

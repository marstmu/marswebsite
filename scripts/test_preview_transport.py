"""HTTP transport fixtures: compression must not weaken range/private boundaries."""
from functools import partial
import gzip
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import preview


class FixtureHandler(preview.PreviewHandler):
    def log_message(self, *_):
        pass


class NegotiationTests(unittest.TestCase):
    def test_quality_negotiation(self):
        for offered in ("gzip", "br, gzip, deflate", "GZip;q=0.5", "*;q=1"):
            self.assertTrue(preview.accepts_gzip(offered), offered)
        for offered in ("", "identity", "gzip;q=0", "*;q=1,gzip;q=0", "gzip;q=bogus", "gzip;q=2", "gzip;q=nan"):
            self.assertFalse(preview.accepts_gzip(offered), offered)


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.site = self.root / "site"
        self.site.mkdir()
        self.text = b"<html><body>" + b"MARS static preview content " * 400 + b"</body></html>"
        (self.site / "index.html").write_bytes(self.text)
        (self.site / "style.css").write_bytes(b".x { color: red; }\n" * 300)
        (self.site / "binary.pdf").write_bytes(b"PDF-original-bytes" * 300)
        (self.site / "guide").mkdir()
        (self.site / "guide/index.html").write_bytes(self.text)
        (self.root / ".local-media").mkdir()
        self.private = self.root / ".local-media/master.zip"
        self.private.write_bytes(bytes(range(256)) * 2)
        self.patches = patch.multiple(preview, ROOT=self.root, OUTPUT=self.site,
                                     PRIVATE_DOWNLOADS={"/downloads/mars-images-full-resolution": self.private})
        self.patches.start()
        preview.gzip_body.cache_clear()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(FixtureHandler, directory=str(self.site)))
        self.thread = Thread(target=self.server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.patches.stop()
        preview.gzip_body.cache_clear()
        self.temp.cleanup()

    def request(self, path="/", method="GET", headers=None):
        try:
            response = urlopen(Request(self.base + path, method=method, headers=headers or {}), timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, dict(response.headers), response.read()

    def test_gzip_homepage_and_css_with_private_headers(self):
        for path in ("/", "/guide/", "/style.css"):
            status, headers, body = self.request(path, headers={"Accept-Encoding": "gzip"})
            expected = self.text if path.endswith("/") else (self.site / "style.css").read_bytes()
            self.assertEqual(status, 200)
            self.assertEqual(headers["Content-Encoding"], "gzip")
            self.assertEqual(gzip.decompress(body), expected)
            self.assertEqual(int(headers["Content-Length"]), len(body))
            self.assertEqual(headers["Vary"], "Accept-Encoding")
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("noindex", headers["X-Robots-Tag"])
        self.assertEqual((self.site / "index.html").read_bytes(), self.text)

    def test_head_and_explicit_identity(self):
        _, compressed, data = self.request(headers={"Accept-Encoding": "gzip"})
        status, head, body = self.request(method="HEAD", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(head["Content-Length"], compressed["Content-Length"])
        self.assertEqual(head["Content-Encoding"], "gzip")
        status, identity, body = self.request(headers={"Accept-Encoding": "gzip;q=0"})
        self.assertNotIn("Content-Encoding", identity)
        self.assertEqual(body, self.text)

    def test_range_and_if_range_never_compress(self):
        status, headers, body = self.request(headers={"Range": "bytes=0-31", "Accept-Encoding": "gzip"})
        self.assertEqual(status, 206)
        self.assertEqual(body, self.text[:32])
        self.assertNotIn("Content-Encoding", headers)
        self.assertEqual(headers["Content-Range"], f"bytes 0-31/{len(self.text)}")
        status, headers, body = self.request(headers={"Range": "bytes=0-31", "If-Range": "not-current", "Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(body, self.text)
        self.assertNotIn("Content-Encoding", headers)

    def test_binary_and_exact_private_attachment_invariants(self):
        status, headers, body = self.request("/binary.pdf", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(body, (self.site / "binary.pdf").read_bytes())
        self.assertNotIn("Content-Encoding", headers)
        status, headers, body = self.request("/downloads/mars-images-full-resolution", headers={"Range": "bytes=-32", "Accept-Encoding": "gzip"})
        self.assertEqual(status, 206)
        self.assertEqual(body, self.private.read_bytes()[-32:])
        self.assertEqual(headers["Content-Disposition"], 'attachment; filename="master.zip"')
        self.assertNotIn("Content-Encoding", headers)
        status, headers, body = self.request("/downloads/mars-images-full-resolution", headers={"Range": "bytes=0-1,5-9"})
        self.assertEqual(status, 416)
        self.assertEqual(body, b"")

    def test_cache_invalidates_on_changed_generated_file(self):
        self.request(headers={"Accept-Encoding": "gzip"})
        changed = self.text.replace(b"MARS", b"TEAM")
        (self.site / "index.html").write_bytes(changed)
        _, _, body = self.request(headers={"Accept-Encoding": "gzip"})
        self.assertEqual(gzip.decompress(body), changed)

    def test_redirect_directory_listing_traversal_and_symlink_guards(self):
        status, _, _ = self.request("/guide?x=1")  # urllib follows the ordinary slash redirect.
        self.assertEqual(status, 200)
        (self.site / "unlisted").mkdir()
        for path in ("/unlisted/", "/.local-media/master.zip", "/%2e%2e/.local-media/master.zip", "/downloads/other-file"):
            self.assertEqual(self.request(path)[0], 404, path)
        (self.site / "escape.pdf").symlink_to(self.private)
        self.assertEqual(self.request("/escape.pdf")[0], 404)


if __name__ == "__main__":
    unittest.main()

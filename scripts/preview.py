#!/usr/bin/env python3
"""Build and serve an isolated, non-indexable MARS review copy; never deploy."""

import argparse
from functools import lru_cache, partial
import gzip
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
from pathlib import Path
import re
import subprocess
import sys
import tomllib
from urllib.parse import urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".preview" / "site"
CONFIG = ROOT / ".preview.zensical.toml"
PREVIEW_URL = "https://workstation.tailee9084.ts.net:8887/"
ROBOTS_META = '<meta name="robots" content="noindex, nofollow, noarchive">'
MASTER_DOWNLOAD_ROUTE = "/downloads/mars-video-full-quality"
# The one requested and inspected video's exact file; no directory mount.
MASTER_VIDEO = ROOT / ".local-media" / "mars-2026-winter-trailer-full-quality.mkv"
PRIVATE_DOWNLOADS = {
    MASTER_DOWNLOAD_ROUTE: MASTER_VIDEO,
    "/downloads/mars-images-full-resolution": ROOT / ".local-media" / "mars-images-full-resolution.zip",
}
TEXT_TYPES = {"application/javascript", "application/json", "application/xml", "image/svg+xml"}


def accepts_gzip(header: str) -> bool:
    """Honor explicit gzip refusals, wildcard offers and bounded q-values."""
    accepted = {}
    for offer in header.lower().split(","):
        name, *parameters = (part.strip() for part in offer.split(";"))
        quality = 1.0
        for parameter in parameters:
            if parameter.startswith("q="):
                try:
                    quality = float(parameter[2:])
                except ValueError:
                    quality = 0.0
        accepted[name] = quality if 0 <= quality <= 1 else 0.0
    return accepted.get("gzip", accepted.get("*", 0.0)) > 0


@lru_cache(maxsize=32)
def gzip_body(filename: str, modified_ns: int, size: int) -> bytes:
    # Stat fields invalidate this bounded in-process cache after a static rebuild.
    # HTTP remains no-store. Originals are read, never rewritten or recompressed.
    return gzip.compress(Path(filename).read_bytes(), compresslevel=6, mtime=0)


def parse_byte_range(header: str, size: int) -> tuple[int, int]:
    """Parse one HTTP byte range. Reject invalid/multiple/unsatisfiable ranges."""
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
    if not match or not any(match.groups()) or size <= 0:
        raise ValueError("Invalid range")
    first, last = match.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:
        length = int(last)
        if length <= 0:
            raise ValueError("Empty suffix range")
        start, end = max(0, size - length), size - 1
    if start >= size or start > end:
        raise ValueError("Unsatisfiable range")
    return start, end


def build() -> None:
    source = (ROOT / "zensical.toml").read_text(encoding="utf-8")
    config = re.sub(r'^site_url = .+$', f'site_url = "{PREVIEW_URL}"', source, count=1, flags=re.MULTILINE)
    config = re.sub(r'^site_dir = .+$', 'site_dir = ".preview/site"', config, count=1, flags=re.MULTILINE)
    # Keep the source's public canonical URL untouched. This file is git-ignored.
    config = config.replace("[project.extra]\n", "[project.extra]\npreview = true\n", 1)
    tomllib.loads(config)
    CONFIG.write_text(config, encoding="utf-8")
    zensical = ROOT / ".venv" / "bin" / "zensical"
    if not zensical.is_file():
        raise SystemExit("Install the locked dependencies in .venv first (see README.md).")
    subprocess.run([str(zensical), "build", "--strict", "--config-file", str(CONFIG)], cwd=ROOT, check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/prepare_site.py"), str(OUTPUT)], cwd=ROOT, check=True)
    for page in OUTPUT.rglob("*.html"):
        content = page.read_text(encoding="utf-8")
        if ROBOTS_META not in content:
            content = content.replace("</head>", f"{ROBOTS_META}\n</head>", 1)
            page.write_text(content, encoding="utf-8")
    # Keep the private sitemap as a route inventory. Robots and the
    # response header still block indexing, and all URLs point inside the tailnet.
    (OUTPUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    for filename in ("CNAME",):
        (OUTPUT / filename).unlink(missing_ok=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "check_site.py"), str(OUTPUT), "--preview"], cwd=ROOT, check=True)
    print(f"Built private preview: {PREVIEW_URL}", flush=True)


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        """Serve bounded byte ranges and only explicitly allowlisted private files."""
        is_master = urlsplit(self.path).path in PRIVATE_DOWNLOADS
        if is_master:
            path = PRIVATE_DOWNLOADS[urlsplit(self.path).path]
            if path.is_symlink() or path.resolve().parent != (ROOT / ".local-media").absolute():
                self.send_error(404, "Download unavailable")
                return None
        else:
            path = Path(self.translate_path(self.path)).resolve()
            if not path.is_relative_to(OUTPUT.resolve()):
                self.send_error(404, "File unavailable")
                return None
            if path.is_dir():
                parsed = urlsplit(self.path)
                if not parsed.path.endswith("/"):
                    self.send_response(301)
                    self.send_header("Location", urlunsplit(parsed._replace(path=parsed.path + "/")))
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return None
                for name in ("index.html", "index.htm"):
                    index = (path / name).resolve()
                    if index.is_file() and index.is_relative_to(OUTPUT.resolve()):
                        path = index
                        break
                else:
                    return self.list_directory(str(path))
        if not path.is_file():
            self.send_error(404, "File unavailable")
            return None
        try:
            source = path.open("rb")
        except OSError:
            self.send_error(404, "File unavailable")
            return None
        stat = path.stat()
        size = stat.st_size
        modified = self.date_time_string(stat.st_mtime)
        start, end = 0, size - 1
        content_type = self.guess_type(str(path))
        text = content_type.startswith("text/") or content_type in TEXT_TYPES
        range_header = self.headers.get("Range")
        if_range = self.headers.get("If-Range")
        if if_range and if_range != modified:
            range_header = None
        if range_header:
            try:
                start, end = parse_byte_range(range_header, size)
            except ValueError:
                source.close()
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return None
        compressed = None
        if text and not is_master and not self.headers.get("Range") and size <= 5 * 1024 * 1024 and accepts_gzip(self.headers.get("Accept-Encoding", "")):
            encoded = gzip_body(str(path), stat.st_mtime_ns, size)
            if len(encoded) < size:
                compressed = encoded
        self.send_response(206 if range_header else 200)
        self.send_header("Content-Type", content_type)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(len(compressed) if compressed is not None else max(0, end - start + 1)))
        self.send_header("Last-Modified", modified)
        if text and not is_master:
            self.send_header("Vary", "Accept-Encoding")
        if compressed is not None:
            self.send_header("Content-Encoding", "gzip")
        if range_header:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if is_master:
            filename = path.name
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        if compressed is not None:
            source.close()
            self._bytes_remaining = len(compressed)
            return io.BytesIO(compressed)
        source.seek(start)
        self._bytes_remaining = max(0, end - start + 1)
        return source

    def copyfile(self, source, outputfile):
        try:
            if self._bytes_remaining is None:
                return super().copyfile(source, outputfile)
            remaining = self._bytes_remaining
            while remaining:
                block = source.read(min(128 * 1024, remaining))
                if not block:
                    break
                outputfile.write(block)
                remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            # Browser scrubbing cancels the previous byte-range request.
            return None

    def end_headers(self) -> None:
        self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404, "Directory listing is disabled")
        return None


def serve() -> None:
    if not (OUTPUT / "index.html").is_file():
        raise SystemExit("Build first with: .venv/bin/python scripts/preview.py --build")
    server = ThreadingHTTPServer(("127.0.0.1", 8887), partial(PreviewHandler, directory=str(OUTPUT)))
    print(f"Local backend: http://127.0.0.1:8887/\nTailnet HTTPS preview: {PREVIEW_URL}", flush=True)
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="Build the isolated preview and validate key routes")
    parser.add_argument("--serve", action="store_true", help="Serve the existing preview on localhost:8887")
    arguments = parser.parse_args()
    if not arguments.build and not arguments.serve:
        parser.error("Choose --build, --serve, or both.")
    if arguments.build:
        build()
    if arguments.serve:
        serve()


if __name__ == "__main__":
    main()

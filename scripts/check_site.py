#!/usr/bin/env python3
"""Validate the complete static site's links, fragments, assets and isolation."""

import argparse
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re
import tomllib
from urllib.parse import unquote, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_URL = "https://workstation.tailee9084.ts.net:8887/"
PREVIEW_DOWNLOADS = {"/downloads/mars-video-full-quality", "/downloads/mars-images-full-resolution"}
IMPORTANT_PATHS = (
    "index.html", "competition/index.html", "blog/index.html", "gallery/index.html",
    "learn/index.html", "links-and-resources/index.html", "philosophy/index.html",
    "blog/archive/2024/index.html", "blog/archive/2025/index.html",
    "Guidelines/Archive/2024-2025/Avionics-Guide/ground-station/index.html",
    "sponsors/package.pdf", "css/mars.css", "img/mars-horizontal-transparent.png",
)
CSS_URL = re.compile(r"url\(\s*(?:\"([^\"]*)\"|'([^']*)'|([^)]*))\s*\)", re.I)


def css_urls(content):
    # Comments are not requests. Preserve quoted paths and spaces.
    content = re.sub(r"/\*.*?\*/", "", content, flags=re.S)
    return [next(value for value in match.groups() if value is not None).strip()
            for match in CSS_URL.finditer(content)]


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references, self.ids, self.robots = [], set(), []
        self.base = None
        self.in_style = False
        self.in_head = False
        self.darkreader_locks = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "head":
            self.in_head = True
        if tag == "meta" and (values.get("name") or "").lower() == "darkreader-lock":
            self.darkreader_locks.append(self.in_head)
        if values.get("id"):
            self.ids.add(values["id"])
        if tag == "a" and values.get("name"):
            self.ids.add(values["name"])
        if tag == "meta" and values.get("name", "").lower() == "robots":
            self.robots.append(values.get("content", ""))
        if tag == "base" and values.get("href"):
            self.base = values["href"]
        elif values.get("href"):
            self.references.append(("href", values["href"]))
        for attribute in ("src", "poster", "data-original-src", "data-original-poster"):
            if values.get(attribute):
                self.references.append((attribute, values[attribute]))
        if tag == "object" and values.get("data"):
            self.references.append(("data", values["data"]))
        if tag in ("img", "source") and values.get("srcset"):
            for entry in values["srcset"].split(","):
                if entry.strip():
                    self.references.append(("srcset", entry.strip().split()[0]))
        for url in css_urls(values.get("style", "")):
            self.references.append(("style", url))
        if tag == "style":
            self.in_style = True

    handle_startendtag = handle_starttag

    def handle_data(self, data):
        if self.in_style:
            self.references.extend(("style", url) for url in css_urls(data))

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "style":
            self.in_style = False


def darkreader_lock_is_valid(parser):
    """The native-theme opt-out must occur exactly once, inside the head."""
    return parser.darkreader_locks == [True]


def page_url(relative, site_url):
    relative = relative.as_posix()
    if relative.endswith("index.html"):
        relative = relative[:-len("index.html")]
    return urljoin(site_url, relative)


def audit_site(site, *, site_url="https://marstmu.com/", preview=False,
               required_paths=IMPORTANT_PATHS, original_pdf=ROOT / "docs/sponsors/package.pdf"):
    """Offline validation, including canonical-domain links into this build."""
    site = site.resolve()
    if not site.is_dir():
        return [f"Site directory does not exist: {site}"], 0
    site_url = site_url.rstrip("/") + "/"
    configured = urlsplit(site_url)
    canonical_host = configured.hostname
    if not canonical_host:
        return ["site_url must be an absolute HTTP(S) URL"], 0
    aliases = {canonical_host, canonical_host.removeprefix("www.")}
    aliases.add("www." + canonical_host.removeprefix("www."))
    if preview:
        aliases.update({urlsplit(PREVIEW_URL).hostname, "127.0.0.1", "localhost"})
    failures, documents = [], {}
    for relative in required_paths:
        if not (site / relative).is_file():
            failures.append(f"Missing preserved/new route: {relative}")
    built_pdf = site / "sponsors/package.pdf"
    if original_pdf is not None and built_pdf.is_file():
        if hashlib.sha256(original_pdf.read_bytes()).digest() != hashlib.sha256(built_pdf.read_bytes()).digest():
            failures.append("Original sponsor PDF changed during build")
    for page in sorted(site.rglob("*.html")):
        document = SiteParser()
        document.feed(page.read_text(encoding="utf-8"))
        documents[page.resolve()] = document
        relative = page.relative_to(site)
        if not darkreader_lock_is_valid(document):
            failures.append(f"Expected exactly one Dark Reader opt-out meta in head: {relative}")
        if any(part.startswith(".") for part in relative.parts):
            failures.append(f"Excluded draft content was published: {relative}")
        if preview and "noindex, nofollow, noarchive" not in document.robots:
            failures.append(f"Preview missing noindex: {relative}")

    def check(reference, source, base):
        parsed = urlsplit(urljoin(base, reference))
        if parsed.scheme not in ("http", "https"):
            return
        if not preview and parsed.hostname == urlsplit(PREVIEW_URL).hostname:
            failures.append(f"Private preview URL in public output {source}: {reference}")
            return
        if parsed.hostname not in aliases:
            return  # External availability is a separate bounded network audit.
        path = unquote(parsed.path)
        if path in PREVIEW_DOWNLOADS:
            if not preview:
                failures.append(f"Preview-only download in public output {source}: {reference}")
            return  # Only these exact attachments intentionally live outside site/.
        mount = unquote(configured.path).rstrip("/")
        if mount and parsed.hostname in {canonical_host, "www." + canonical_host.removeprefix("www.")}:
            if path != mount and not path.startswith(mount + "/"):
                return  # Another application on a project-site host.
            path = path[len(mount):] or "/"
        target = (site / path.lstrip("/")).resolve()
        if not target.is_relative_to(site):
            failures.append(f"Link escapes site in {source}: {reference}")
            return
        if parsed.path.endswith("/") or target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            failures.append(f"Missing local target in {source}: {reference}")
            return
        if parsed.fragment and target.suffix.lower() == ".html":
            destination = documents.get(target)
            if destination is None or unquote(parsed.fragment) not in destination.ids:
                failures.append(f"Missing fragment in {source}: {reference}")

    for page, document in documents.items():
        relative = page.relative_to(site)
        base = page_url(relative, site_url)
        if document.base:
            base = urljoin(base, document.base)
        for _, reference in document.references:
            check(reference, relative, base)
    for stylesheet in sorted(site.rglob("*.css")):
        relative = stylesheet.relative_to(site)
        for reference in css_urls(stylesheet.read_text(encoding="utf-8")):
            check(reference, relative, urljoin(site_url, relative.as_posix()))
    return sorted(set(failures)), len(documents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", type=Path)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--site-url", help="Canonical URL/mount; defaults to zensical.toml")
    args = parser.parse_args()
    configured_url = tomllib.loads((ROOT / "zensical.toml").read_text())["project"]["site_url"]
    failures, count = audit_site(args.site, site_url=args.site_url or configured_url, preview=args.preview)
    if failures:
        print("\n".join(failures))
        raise SystemExit(1)
    print(f"Validated {len(IMPORTANT_PATHS)} important paths, {count} HTML pages, all internal links/fragments, local assets and Dark Reader opt-outs.")


if __name__ == "__main__":
    main()

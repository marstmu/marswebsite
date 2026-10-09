#!/usr/bin/env python3
"""Prepare responsive display images after Zensical. Never modify original assets.

Only --fetch-external contacts remote hosts, to pin images already rendered in
public HTML. Routine builds use those verified repository copies, not live hosts.
"""

import argparse
import hashlib
import html
import io
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageCms, ImageOps, __version__ as PILLOW_VERSION

ROOT = Path(__file__).resolve().parents[1]
VERSION = "mars-display-v3-" + PILLOW_VERSION
HERO_QUALITY = 90
PHOTOGRAPHIC_SCREENSHOTS = {
    "Screenshot 2024-09-11 204215.png", "Screenshot 2024-09-16 205202.png",
    "Screenshot 2024-09-16 205655.png", "Screenshot 2024-09-16 205717.png",
    "Screenshot 2024-09-16 204329.png", "Screenshot 2024-09-23 135329.png",
    "Screenshot 2024-09-23 135604.png",
}  # Visually reviewed: camera photos/collages, not UI/technical screenshots.
EXTERNAL = ROOT / "docs/assets/external"
ALLOWED = re.compile(r"https://(?:github\.com/marstmu/marswebsite/assets/\d+/[\da-f-]+|avatars\.githubusercontent\.com/u/\d+\??)$")
# Retained in docs and the private source archive, never shipped as review/public
# artifacts. Current selected masters and original gallery downloads remain.
EDITORIAL_OUTPUT_EXCLUSIONS = (
    "assets/images/founders/provenance.json",
    "assets/images/founders/nikolai-studio-v1.png",
    "assets/images/founders/nikolai-studio-v2.png",
    "assets/images/founders/zeulewan-studio-v1.png",
    "assets/images/founders/nikolai-sydorenko.png",
    "assets/images/founders/zeulewan-mordasiewicz.png",
    "assets/images/founders/zeulewan-professional-original.jpg",
    "assets/images/founders/zeulewan-zeuldocs-original-v2.jpg",
)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin_external(url, records, fetch):
    if not ALLOWED.fullmatch(url):
        raise ValueError(f"Unapproved remote raster image: {url}")
    if url in records:
        record = records[url]
        path = ROOT / record["file"]
        if path.is_file() and digest(path) == record["sha256"]:
            return path
        raise ValueError(f"Pinned external original missing/changed: {url}")
    if not fetch:
        raise ValueError(f"Unpinned remote image; run prepare_site.py --fetch-external once: {url}")
    with urlopen(Request(url, headers={"User-Agent": "MARS-image-review/1.0"}), timeout=40) as response:
        data = response.read(100 * 1024 * 1024 + 1)
    if len(data) > 100 * 1024 * 1024:
        raise ValueError("External image exceeds 100 MiB limit")
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
        extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif"}.get(image.format)
    if not extension:
        raise ValueError("Unsupported external image format")
    EXTERNAL.mkdir(parents=True, exist_ok=True)
    path = EXTERNAL / (hashlib.sha256(url.encode()).hexdigest()[:24] + "." + extension)
    path.write_bytes(data)
    records[url] = {"file": str(path.relative_to(ROOT)), "sha256": digest(path), "bytes": len(data), "url": url}
    return path


class Media:
    def __init__(self, site, fetch=False):
        self.site, self.fetch = site.resolve(), fetch
        self.records = json.loads((EXTERNAL / "manifest.json").read_text()) if (EXTERNAL / "manifest.json").exists() else {}
        self.preview_sources = {}
        previews = ROOT / "docs/assets/previews/manifest.json"
        if previews.exists():
            for entry in json.loads(previews.read_text()):
                for preview in entry["previews"]:
                    self.preview_sources[preview["file"].removeprefix("docs/")] = ROOT / entry["source"]
        self.cache = ROOT / ".cache/media" / VERSION
        self.output = self.site / "assets/display"
        self.output.mkdir(parents=True, exist_ok=True)
        self.sources = {}

    def resolve(self, url, page):
        parsed = urlsplit(url)
        if parsed.scheme in ("data", "blob") or not parsed.path:
            return None
        if parsed.netloc and parsed.netloc not in ("marstmu.com", "www.marstmu.com", "workstation.tailee9084.ts.net:8887"):
            return pin_external(url, self.records, self.fetch)
        path = self.site / unquote(parsed.path.lstrip("/")) if parsed.path.startswith("/") else page.parent / unquote(parsed.path)
        path = path.resolve()
        if not path.is_relative_to(self.site):
            raise ValueError(f"Image escapes site: {url}")
        relative = str(path.relative_to(self.site))
        return self.preview_sources.get(relative, path)

    def variants(self, url, page, hero=False):
        if "/assets/display/" in url:
            return None
        path = self.resolve(url, page)
        if path is None or path.suffix.lower() in (".svg", ".ico"):
            return None
        if not path.is_file():
            raise ValueError(f"Missing image: {path}")
        poster_original = None
        if path.name == "mars-2026-winter-trailer-poster.jpg":
            poster_original = path
            video = path.with_name("mars-2026-winter-trailer-1080p.mp4")
            frame = ROOT / ".cache/media-frames" / (digest(video)[:24] + "-70s.png")
            if not frame.exists():
                frame.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-ss", "70", "-i", str(video), "-frames:v", "1", str(frame)], check=True)
            path = frame  # Encode once from the original video's decoded frame.
        source_hash = digest(path)
        source_key = (source_hash, f"hero-q{HERO_QUALITY}" if hero else "default")
        if source_key in self.sources:
            return self.sources[source_key]
        with Image.open(path) as original:
            if getattr(original, "n_frames", 1) > 1 and original.format != "MPO":
                self.sources[source_key] = {"original": url, "sha256": source_hash, "animated": True, "variants": []}
                return self.sources[source_key]
            image = ImageOps.exif_transpose(original)
            icc = original.info.get("icc_profile")
            if icc:
                # Converting mode alone is not color management, especially for
                # CMYK JPEGs. Convert the embedded profile explicitly to sRGB.
                srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))
                output_mode = "RGBA" if "A" in image.getbands() else "RGB"
                image = ImageCms.profileToProfile(image, ImageCms.ImageCmsProfile(io.BytesIO(icc)), srgb, outputMode=output_mode)
                icc = srgb.tobytes()
            source_width, source_height = image.size
            name = str(path).lower()
            logo = ("/img/" in name and "/portraits/" not in name) or any(token in name for token in ("/sponsors/", "logo", "wordmark"))
            technical = "/assets/external/" in name or (original.format == "PNG" and "/guidelines/" in name and "/photos/" not in name)
            photographic_png = any(token in name for token in ("/gallery/", "/assets/images/", "/photos/")) or path.name.lower() == "launch.png" or path.name in PHOTOGRAPHIC_SCREENSHOTS or poster_original is not None
            screenshot = path.name not in PHOTOGRAPHIC_SCREENSHOTS and any(token in path.name.lower() for token in ("screenshot", "reimb", "schematic", "simulation", "openrocket", "pcb"))
            photo = not logo and not technical and not screenshot and (original.format in ("JPEG", "MPO") or photographic_png)
            # PNG diagrams/branding preserve pixels and transparency. Previously
            # encoded standalone WebP/JPEG posters use lossless delivery, avoiding
            # a second lossy pass; manual previews are resolved to their originals.
            lossless = not photo
            image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in original.info else "RGB")
            widths = (48, 96, 144, 196, 320) if "avatars.githubusercontent.com" in url else (160, 320, 480, 640, 960, 1280) if logo else (240, 320, 480, 640, 960, 1280, 1440, 1920, 2560)
            hero_photo = hero and photo
            if hero_photo:
                # Large screens can use actual native detail, never synthetic
                # upscaling. The ordinary photo pipeline stays unchanged.
                widths = (*widths, 3200, 3840, 4096, source_width)
            widths = sorted({min(width, source_width) for width in widths})
            variants = []
            policy = f"hero-q{HERO_QUALITY}" if hero_photo else "lossless" if lossless else "photo"
            native_jpeg = hero_photo and original.format == "JPEG" and original.mode == "RGB" and original.getexif().get(274, 1) == 1
            source_bytes = path.stat().st_size
            for width in widths:
                height = max(1, round(source_height * width / source_width))
                source_copy = native_jpeg and width == source_width
                filename = f"{source_hash[:20]}-{policy}-{width}.{'jpg' if source_copy else 'webp'}"
                cached = self.cache / filename
                if not cached.exists():
                    self.cache.mkdir(parents=True, exist_ok=True)
                    if source_copy:
                        # Keep original RGB JPEG pixels/ICC/EXIF bytes intact;
                        # do not add another lossy pass at the native ceiling.
                        shutil.copyfile(path, cached)
                    else:
                        resized = image.resize((width, height), Image.Resampling.LANCZOS)
                        options = dict(format="WEBP", lossless=lossless, quality=HERO_QUALITY if hero_photo else 76, method=4)
                        if icc:
                            options["icc_profile"] = icc
                        resized.save(cached, **options)
                if native_jpeg and not source_copy and cached.stat().st_size >= source_bytes:
                    continue  # A larger, lower-resolution candidate is dominated by the native JPEG.
                shutil.copyfile(cached, self.output / filename)
                variant = {"url": "/assets/display/" + filename, "width": width, "height": height, "bytes": cached.stat().st_size}
                if hero_photo:
                    variant.update({"format": "JPEG" if source_copy else "WEBP", "encoding": "source-copy" if source_copy else f"q{HERO_QUALITY}"})
                    if source_copy:
                        variant["sha256"] = source_hash
                variants.append(variant)
        original_url = url
        if path.is_relative_to(ROOT / "docs"):
            original_url = "/" + str(path.relative_to(ROOT / "docs"))
            if "/assets/external/" in str(path):
                original_url = url
        elif path.is_relative_to(self.site):
            original_url = "/" + str(path.relative_to(self.site))
        result = {"original": original_url, "sha256": source_hash, "sourceBytes": path.stat().st_size, "width": source_width, "height": source_height, "policy": policy, "variants": variants}
        if poster_original:
            result["original"] = "/assets/video/mars-2026-winter-trailer-poster.jpg"
            result["posterFrame"] = {"video": "/assets/video/mars-2026-winter-trailer-1080p.mp4", "seconds": 70, "originalPosterSha256": digest(poster_original)}
        self.sources[source_key] = result
        return result

    def finish(self):
        if self.fetch:
            (EXTERNAL / "manifest.json").write_text(json.dumps(self.records, indent=2, sort_keys=True) + "\n")
        manifest = self.output / "manifest.json"
        if self.sources or not manifest.exists():
            manifest.write_text(json.dumps({"version": VERSION, "sources": list(self.sources.values())}, indent=2, sort_keys=True) + "\n")
        if self.sources:
            keep = {Path(variant["url"]).name for source in self.sources.values() for variant in source["variants"]}
            for generated in self.output.glob("*.webp"):
                if re.fullmatch(r"[\da-f]{20}-(?:photo|lossless|hero-q\d+)-\d+\.webp", generated.name) and generated.name not in keep:
                    generated.unlink()  # Only our obsolete generated variants, never originals.
            for generated in self.output.glob("*.jpg"):
                if re.fullmatch(r"[\da-f]{20}-hero-q\d+-\d+\.jpg", generated.name) and generated.name not in keep:
                    generated.unlink()


class Rewriter(HTMLParser):
    def __init__(self, media, page):
        super().__init__(convert_charrefs=False)
        self.media, self.page, self.parts, self.stack = media, page, [], []
        self.article_primary_delivered = False

    def start(self, tag, attrs, closed=False):
        values = dict(attrs)
        context = " ".join(item[1] for item in self.stack)
        attribute = "poster" if tag == "video" else "srcset" if tag == "source" and "srcset" in values and "type" not in values else "src" if tag == "img" else None
        if attribute and values.get(attribute):
            original_url = values[attribute].split(",")[0].strip().split()[0] if attribute == "srcset" else values[attribute]
            # Reuse retained originals on repeated/mixed builds, not our lossy
            # display files. This also upgrades an already prepared hero safely.
            original_url = values.get("data-original-" + ("poster" if tag == "video" else "src"), original_url)
            # Existing manual srcset entries map back to one full-resolution
            # original; art-directed sources remain independent picture entries.
            result = self.media.variants(original_url, self.page, hero="mars-hero__background" in context)
            if result and result["variants"]:
                variants = result["variants"]
                default = next((variant for variant in variants if variant["width"] >= 960), variants[-1])
                values[attribute] = default["url"]
                values["data-original-" + ("poster" if tag == "video" else "src")] = result["original"]
                if tag != "video":
                    values["srcset"] = ", ".join(f'{variant["url"]} {variant["width"]}w' for variant in variants)
                    if "mars-hero__background" in context:
                        # The plane includes the header behind the hero. Parallax
                        # translates it without zoom, so cover width is unchanged.
                        aspect = result["width"] / result["height"]
                        values["sizes"] = f"max(100vw, {100 * aspect:.4f}svh)"
                    elif "mars-hero__logo" in values.get("class", ""):
                        values["sizes"] = "(max-width: 640px) 295px, (max-width: 900px) 300px, (max-width: 1516px) 31vw, 470px"
                    elif "mars-header__brand" in context or "md-logo" in context:
                        values["sizes"] = "138px"
                    elif "mars-community" in context:
                        values["sizes"] = "(max-width: 640px) max(100vw, 690px), max(100vw, 975px)"
                    elif "mars-story" in context:
                        aspect = result["width"] / result["height"]
                        values["sizes"] = f"(max-width: 640px) max(100vw, {380 * aspect:.2f}px), (max-width: 900px) max(33.34vw, {440 * aspect:.2f}px), max(33.34vw, {490 * aspect:.2f}px)"
                    elif "mars-gallery" in context:
                        if "mars-gallery--full-frame" in context:
                            # Natural-ratio cards paint the entire column width,
                            # including portraits; there is no fixed-height box.
                            values["sizes"] = "(max-width: 640px) calc(100vw - 48px), (max-width: 999px) calc((100vw - 62px) / 2), 469px"
                        else:
                            aspect = result["width"] / result["height"]
                            values["sizes"] = f"(max-width: 640px) min(calc(100vw - 48px), {13 * aspect:.4f}rem), min(340px, {14 * aspect:.4f}rem)"
                    elif "avatars.githubusercontent.com" in original_url:
                        values["sizes"] = "48px"
                    elif "mars-founders" in context:
                        values["sizes"] = "(max-width: 640px) calc(64.85vw - 25.94px), (max-width: 999px) min(389.1px, calc(64.85vw - 36.9645px)), 389.1px" if "mars-founder__portrait--nikolai" in context else "(max-width: 640px) calc((100vw - 40px) / 2), (max-width: 999px) min(300px, calc((100vw - 57px) / 2)), 300px"
                    else:
                        values.setdefault("sizes", "(max-width: 999px) calc(100vw - 40px), 960px")
                    if tag == "img":
                        existing_width, existing_height = values.get("width"), values.get("height")
                        if existing_width and existing_width.isdigit() and not existing_height:
                            values["height"] = str(max(1, round(int(existing_width) * result["height"] / result["width"])))
                        elif existing_height and existing_height.isdigit() and not existing_width:
                            values["width"] = str(max(1, round(int(existing_height) * result["width"] / result["height"])))
                        elif not existing_width and not existing_height:
                            values["width"], values["height"] = str(result["width"]), str(result["height"])
                        eager = "mars-hero" in context or "mars-header" in context
                        values["loading"] = "eager" if eager else values.get("loading", "lazy")
                        values["decoding"] = "async"
                        if "mars-hero__logo" in values.get("class", ""):
                            values["fetchpriority"] = "high"
        if tag == "img":
            values.setdefault("loading", "eager" if "mars-hero" in context or "mars-header" in context else "lazy")
            values.setdefault("decoding", "async")
            # The first photograph in an individual blog post is its primary
            # content/LCP image; later photos retain native lazy loading.
            if "md-content--post" in context and "md-content__inner" in context and not self.article_primary_delivered and "avatars.githubusercontent.com" not in values.get("data-original-src", ""):
                values["loading"] = "eager"
                values["fetchpriority"] = "high"
                self.article_primary_delivered = True
        rendered = " ".join(key if value is None else f'{key}="{html.escape(value, quote=True)}"' for key, value in values.items())
        self.parts.append("<" + tag + (" " + rendered if rendered else "") + (" />" if closed else ">"))
        if not closed and tag not in ("area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"):
            self.stack.append((tag, values.get("class", "")))

    def handle_starttag(self, tag, attrs):
        self.start(tag, attrs)

    def handle_startendtag(self, tag, attrs):
        self.start(tag, attrs, True)

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.parts.append(data)

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")

    def handle_comment(self, data):
        self.parts.append(f"<!--{data}-->")

    def handle_decl(self, decl):
        self.parts.append(f"<!{decl}>")


def prune_editorial_output(site):
    """Remove only an exact allowlist of recoverable generated-output files."""
    site = site.resolve()
    removed = []
    for relative in EDITORIAL_OUTPUT_EXCLUSIONS:
        candidate = site / relative
        parents = []
        for parent in candidate.parents:
            if parent == site:
                break
            parents.append(parent)
        if candidate.is_symlink() or any(parent.is_symlink() for parent in parents):
            raise ValueError(f"Editorial output may not be a symlink: {relative}")
        if not candidate.resolve().is_relative_to(site):
            raise ValueError(f"Editorial output escapes generated site: {relative}")
        if candidate.is_file():
            candidate.unlink()
            removed.append(relative)
    return removed


def prepare(site, fetch=False):
    site = site.resolve()
    if site == ROOT.resolve() or site.is_relative_to((ROOT / "docs").resolve()):
        raise ValueError("Preparation requires generated site output, not repository/docs sources")
    media = Media(site, fetch)
    for page in sorted(site.rglob("*.html")):
        rewrite = Rewriter(media, page)
        rewrite.feed(page.read_text(encoding="utf-8"))
        page.write_text("".join(rewrite.parts), encoding="utf-8")
    media.finish()
    removed = prune_editorial_output(site)
    print(f"Prepared {len(media.sources)} raster sources; originals/download links unchanged.")
    if removed:
        print(f"Omitted {len(removed)} editorial/superseded files from generated output only.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("site", type=Path)
    parser.add_argument("--fetch-external", action="store_true", help="Explicitly pin only remote images rendered in this public build")
    args = parser.parse_args()
    prepare(args.site.resolve(), args.fetch_external)

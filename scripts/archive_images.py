#!/usr/bin/env python3
"""Archive best-available MARS image sources privately, without altering docs.

This is not a claim that every asset is a camera original. Generated manual
previews and build/cache output are excluded. Exact-byte duplicates share one
ZIP member; the manifest preserves source paths, external URLs, and exclusions.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen
import zipfile

from PIL import Image, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OVERRIDES = ROOT / "overrides"
SOURCE_ROOTS = (DOCS, OVERRIDES)
PRIVATE = ROOT / ".local-media"
ZIP_PATH = PRIVATE / "mars-images-full-resolution.zip"
MANIFEST_PATH = PRIVATE / "mars-images-full-resolution-manifest.json"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".avif", ".heic", ".tif", ".tiff"}
EXTERNAL_PATTERN = re.compile(
    r"https://github\.com/marstmu/marswebsite/assets/\d+/[a-f0-9-]+"
    r"|https://avatars\.githubusercontent\.com/u/\d+\??"
)
FORMAT_SUFFIXES = {"JPEG": "jpg", "PNG": "png", "GIF": "gif", "WEBP": "webp", "TIFF": "tiff", "AVIF": "avif"}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def historical(path):
    """Hidden draft directories, not metadata files such as .authors.yml."""
    if not path.is_relative_to(DOCS):
        return False
    return any(part.startswith(".") for part in path.relative_to(DOCS).parts[:-1])


def source_images():
    result = []
    for source_root in SOURCE_ROOTS:
        for path in sorted(source_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            relative = path.relative_to(source_root)
            # Pinned external sources are represented separately as path+URL
            # aliases; generated responsive previews are never source originals.
            if source_root == DOCS and relative.parts[:2] in (("assets", "previews"), ("assets", "external"), ("assets", "display")):
                continue
            if path.is_symlink() or not path.resolve().is_relative_to(source_root.resolve()):
                raise RuntimeError(f"Refusing symlink/out-of-scope image: {relative}")
            result.append(path)
    return result


def external_sources():
    urls = {}
    for path in sorted(DOCS.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".md", ".yml"}:
            continue
        if path.is_symlink():
            raise RuntimeError(f"Refusing symlink source metadata: {path}")
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in EXTERNAL_PATTERN.finditer(line):
                urls.setdefault(match.group(), []).append({
                    "path": path.relative_to(ROOT).as_posix(),
                    "line": number,
                    "hidden_historical": historical(path),
                })
    return urls


def image_metadata(data, label):
    if label.lower().endswith(".svg"):
        # Keep vector data raw. Do not rasterize SVG just for archival metadata.
        import xml.etree.ElementTree as ET
        element = ET.fromstring(data)
        view_box = element.get("viewBox")
        box = [float(value) for value in view_box.replace(",", " ").split()] if view_box else None
        return {"format": "SVG", "width": element.get("width") or (box[2] if box else None),
                "height": element.get("height") or (box[3] if box else None),
                "view_box": view_box, "frames": 1, "vector": True, "decodable": True}
    try:
        opened = Image.open(io.BytesIO(data))
    except UnidentifiedImageError:
        # One reviewed hidden source is a damaged 16-byte PNG stub. Preserve it
        # faithfully and flag it; never fabricate dimensions or silently omit it.
        return {"format": "UNKNOWN", "width": None, "height": None,
                "frames": None, "decodable": False,
                "metadata_warning": "Source bytes are not a decodable image; retained unchanged for archival completeness."}
    with opened as image:
        width, height = image.size
        orientation = image.getexif().get(274, 1)
        display_size = [height, width] if orientation in (5, 6, 7, 8) else [width, height]
        metadata = {
            "format": image.format, "width": width, "height": height, "decodable": True,
            "display_dimensions_after_exif_orientation": display_size,
            "exif_orientation": orientation,
            "frames": getattr(image, "n_frames", 1),
            # MPO camera JPEGs may contain auxiliary pictures/gain maps, not a
            # temporal animation. Preserve all bytes and record that separately.
            "animated": bool(getattr(image, "is_animated", False)) and image.format != "MPO",
            "multi_picture": image.format == "MPO",
            "mode": image.mode,
            "has_alpha_or_transparency": "A" in image.getbands() or "transparency" in image.info,
            "has_icc_profile": bool(image.info.get("icc_profile")),
        }
        if image.format == "ICO":
            metadata["icon_size_variants"] = [list(size) for size in sorted(image.ico.sizes())]
        return metadata


def downloaded_poster_provenance(path):
    """Retain the new exact downloaded YouTube thumbnail and its durable URL."""
    relative = path.relative_to(ROOT).as_posix()
    if relative != "docs/assets/images/video-posters/archived-launch-youtube-maxres.jpg":
        return None
    record = json.loads((ROOT / "research/performance-local-asset-sources.json").read_text())["galleryPoster"]
    if record["path"] != relative or file_sha256(path) != record["sha256"]:
        raise RuntimeError("Gallery poster no longer matches verified downloaded source")
    if record["source"] != "https://i.ytimg.com/vi/jFPGU56kXCg/maxresdefault.jpg":
        raise RuntimeError("Gallery poster source URL is not the reviewed public thumbnail")
    return {"source": record["source"], "source_sha256": record["sha256"],
            "source_status": "best-available-source", "source_dimensions": record["dimensions"],
            "method": "Byte-for-byte downloaded public max-resolution YouTube thumbnail response; no local crop or recompression.",
            "source_note": "Available 1280x720 YouTube thumbnail, not a camera original or a claim of unavailable video-frame detail."}


def founder_provenance(path):
    """Keep the initial PDF extractions and newer studio/original lineage distinct."""
    if path.parent != DOCS / "assets" / "images" / "founders":
        return None
    provenance = json.loads((path.parent / "provenance.json").read_text(encoding="utf-8"))
    entries = provenance["images"] + provenance.get("additional_images", [])
    matches = [item for item in entries if item["file"] == path.name]
    if len(matches) != 1:
        raise RuntimeError(f"Founder asset needs exactly one provenance entry: {path.name}")
    entry = matches[0]
    if file_sha256(path) != entry["sha256"]:
        raise RuntimeError(f"Founder asset no longer matches its verified source/derivative hash: {path.name}")
    source = entry.get("source", provenance["source"])
    source_hash = entry.get("source_sha256", provenance["source_sha256"])
    if source.startswith("docs/"):
        source_path = ROOT / source
        if source_path.is_symlink() or not source_path.resolve().is_relative_to(DOCS.resolve()) or file_sha256(source_path) != source_hash:
            raise RuntimeError(f"Founder original/document no longer matches provenance: {source}")
    result = {"source": source, "source_sha256": source_hash,
              "method": entry.get("method", provenance["method"]), **entry}
    if entry in provenance["images"]:
        result["page"] = provenance["page"]
    return result


def classification(path, founder=None):
    if path.is_relative_to(OVERRIDES):
        return "best-available-source", "Repository-owned icon/vector source; retained raw."
    relative = path.relative_to(DOCS)
    if founder:
        return founder.get("source_status", "best-available-source"), founder.get("source_note", "Native embedded portrait mechanically extracted to lossless PNG from the 2024 sponsorship PDF; no upscale, crop, retouching or AI generation.")
    # Only explicit, locally known derivative provenance is classified as such.
    # Unknown source history is not guessed from resolution or JPEG format.
    if relative.parts[:2] == ("assets", "video"):
        return "known-derivative", "Video poster extracted/generated for site delivery."
    if "-min." in path.name.lower():
        return "known-derivative", "Filename explicitly identifies a minimized image."
    return "best-available-source", "Available repository asset; camera-original status is unknown."


def private_output_guard():
    if PRIVATE.is_symlink() or PRIVATE.resolve() != ROOT.resolve() / ".local-media":
        raise RuntimeError("Private output directory must be the repository's real .local-media directory")
    PRIVATE.mkdir(exist_ok=True)
    for path in (ZIP_PATH, MANIFEST_PATH):
        if path.is_symlink() or path.resolve().is_relative_to(DOCS.resolve()):
            raise RuntimeError("Archive outputs must stay outside docs and published build output")


def manifest_bytes(manifest):
    return (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def verify(manifest, zip_path, expected_local=None):
    """Verify every archived blob, manifest mapping, and unchanged local source."""
    with zipfile.ZipFile(zip_path) as archive:
        expected_names = {blob["archive_path"] for blob in manifest["blobs"]} | {"manifest.json"}
        if set(archive.namelist()) != expected_names or len(archive.namelist()) != len(expected_names):
            raise RuntimeError("Archive member set contains missing, duplicate, or unexpected entries")
        if archive.read("manifest.json") != manifest_bytes(manifest):
            raise RuntimeError("Embedded archive manifest does not match external manifest")
        blobs = {blob["sha256"]: blob for blob in manifest["blobs"]}
        for blob in manifest["blobs"]:
            digest = hashlib.sha256()
            total = 0
            with archive.open(blob["archive_path"]) as member:
                while chunk := member.read(1024 * 1024):
                    digest.update(chunk)
                    total += len(chunk)
            if digest.hexdigest() != blob["sha256"] or total != blob["bytes"]:
                raise RuntimeError(f"Archive original failed byte verification: {blob['archive_path']}")
        for mapping in manifest["mappings"]:
            if mapping["sha256"] not in blobs:
                raise RuntimeError("Source mapping points to absent original blob")
            if mapping["kind"] == "repository-file":
                source = ROOT / mapping["path"]
                if source.is_symlink() or not any(source.resolve().is_relative_to(root.resolve()) for root in SOURCE_ROOTS):
                    raise RuntimeError("Invalid restoration/source path")
                if file_sha256(source) != mapping["sha256"]:
                    raise RuntimeError(f"Source image changed during archival: {mapping['path']}")
    if expected_local is not None and source_images() != expected_local:
        raise RuntimeError("Source-tree image inventory changed during archival; rerun after coordination")
    primary_paths = {ROOT / mapping["path"] for mapping in manifest["mappings"]
                     if mapping["kind"] == "repository-file" and "url_alias" not in mapping}
    if set(source_images()) != primary_paths:
        raise RuntimeError("Current source-image inventory differs from the archive manifest")


def create(replace=False):
    private_output_guard()
    if not replace and (ZIP_PATH.exists() or MANIFEST_PATH.exists()):
        raise RuntimeError("Archive already exists; use --verify-only or explicitly --replace")
    local = source_images()
    external = external_sources()
    if not local:
        raise RuntimeError("No source images found inside the allowed docs/overrides roots")
    pin_manifest = DOCS / "assets" / "external" / "manifest.json"
    pins = json.loads(pin_manifest.read_text(encoding="utf-8")) if pin_manifest.is_file() else {}
    # These pinned sources are technical-owned original responses, not display
    # derivatives. Add each relative path as an alias and reuse verified bytes.
    for url, pin in pins.items():
        if EXTERNAL_PATTERN.fullmatch(url) is None or pin.get("url") != url:
            raise RuntimeError("External pin manifest contains an unreviewed URL")
        path = ROOT / pin["file"]
        if path.is_symlink() or not path.resolve().is_relative_to((DOCS / "assets" / "external").resolve()):
            raise RuntimeError("External pin path is outside its allowed source directory")
        if path.stat().st_size != pin["bytes"] or file_sha256(path) != pin["sha256"]:
            raise RuntimeError("External pin original failed source byte verification")
        external.setdefault(url, [{"path": pin_manifest.relative_to(ROOT).as_posix(), "hidden_historical": False}])
    print(f"Inventory: {len(local)} primary repository images, {len(pins)} pinned source path aliases, {len(external)} durable external URLs.", flush=True)
    manifest = {
        "schema_version": 1,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "archive": ZIP_PATH.name,
        "scope": "Best-available MARS source-tree assets and reviewed external image sources; not necessarily unique camera originals.",
        "private_only": True,
        "excluded_generated_paths": ["docs/assets/previews", "docs/assets/display", "site", ".preview", ".cache"],
        "external_pin_directory_represented_by_url": "docs/assets/external",
        "allowed_source_roots": ["docs", "overrides"],
        "notes": [
            "Raw source bytes, including metadata, are preserved unchanged.",
            "Exact SHA-256 duplicates share one ZIP original; all path and URL mappings remain.",
            "Hidden historical assets are archival only and must not be published.",
            "External original URLs are durable aliases; temporary signed CDN redirect URLs are not retained.",
            "Author avatars are fetched snapshots and may change at their original URL.",
        ],
        "mappings": [], "blobs": [],
    }
    known = {}
    partial_zip = ZIP_PATH.with_suffix(".zip.partial")
    partial_manifest = MANIFEST_PATH.with_suffix(".json.partial")
    for temporary in (partial_zip, partial_manifest):
        if temporary.is_symlink() or (temporary.exists() and not replace):
            raise RuntimeError(f"Refusing existing partial output: {temporary.name}")
    # ZIP_STORED avoids needless recompression of already compressed originals.
    with zipfile.ZipFile(partial_zip, "w" if replace else "x", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        def add(data, mapping, label):
            digest = sha256(data)
            mapping["sha256"] = digest
            manifest["mappings"].append(mapping)
            if digest in known:
                return
            metadata = image_metadata(data, label)
            suffix = (Path(label).suffix.lstrip(".").lower() or "bin") if metadata["format"] == "UNKNOWN" else FORMAT_SUFFIXES.get(metadata["format"], metadata["format"].lower())
            member = f"originals/{digest}.{suffix}"
            archive.writestr(member, data)
            blob = {"sha256": digest, "archive_path": member, "bytes": len(data), "image": metadata}
            known[digest] = blob
            manifest["blobs"].append(blob)

        for path in local:
            founder = founder_provenance(path) or downloaded_poster_provenance(path)
            status, note = classification(path, founder)
            mapping = {
                "kind": "repository-file", "path": path.relative_to(ROOT).as_posix(),
                "hidden_historical": historical(path), "source_status": status, "source_note": note,
            }
            if founder:
                mapping["source_provenance"] = founder
            data = path.read_bytes()
            add(data, mapping, path.name)
            if founder and founder["source"].startswith("https://") and status == "best-available-source":
                # A verified downloaded original, not a generated image, also
                # retains its public URL as an explicit restoration alias.
                add(data, {
                    "kind": "external-url", "url": founder["source"],
                    "references": [{"path": path.relative_to(ROOT).as_posix(), "hidden_historical": historical(path)}],
                    "hidden_historical": historical(path), "source_status": status,
                    "source_note": note, "verified_utc": datetime.now(timezone.utc).isoformat(),
                    "acquisition": "Previously verified exact downloaded original source bytes; no additional network request.",
                    "source_provenance": founder,
                }, path.name)
        for url, pin in pins.items():
            path = ROOT / pin["file"]
            add(path.read_bytes(), {
                "kind": "repository-file", "path": pin["file"],
                "hidden_historical": False, "source_status": "best-available-source",
                "source_note": "Pinned unmodified external original response; durable URL alias retained.",
                "url_alias": url,
            }, path.name)
        for index, (url, references) in enumerate(external.items(), 1):
            if url in pins:
                data = (ROOT / pins[url]["file"]).read_bytes()
                content_type = Image.MIME.get(image_metadata(data, url)["format"])
                acquisition = "Verified repository pin of the original public response; no additional network request."
            else:
                request = Request(url, headers={"User-Agent": "MARS-source-archive/1.0", "Accept": "image/*"})
                with urlopen(request, timeout=45) as response:
                    if response.status != 200 or not response.headers.get("Content-Type", "").startswith("image/"):
                        raise RuntimeError(f"External image unavailable: {url}")
                    data = response.read()
                    content_type = response.headers.get("Content-Type")
                acquisition = "Fetched anonymous original public image response."
            add(data, {
                "kind": "external-url", "url": url, "references": references,
                "hidden_historical": all(item["hidden_historical"] for item in references),
                "source_status": "best-available-source",
                "source_note": "Unmodified anonymous public image response; not proof of a higher-resolution camera original.",
                ("verified_utc" if url in pins else "fetched_utc"): datetime.now(timezone.utc).isoformat(),
                "http_status_at_acquisition": 200, "content_type": content_type,
                "acquisition": acquisition,
            }, url)
            print(f"Verified external image {index}/{len(external)}: {url}", flush=True)
        manifest["summary"] = {
            "repository_file_mappings": len(local) + len(pins),
            "external_url_mappings": sum(mapping["kind"] == "external-url" for mapping in manifest["mappings"]),
            "primary_repository_file_mappings": len(local), "pinned_external_file_mappings": len(pins),
            "unique_original_blobs": len(known),
            "unique_original_bytes": sum(blob["bytes"] for blob in known.values()),
            "repository_file_bytes_before_deduplication": sum(path.stat().st_size for path in local) + sum(pin["bytes"] for pin in pins.values()),
            "hidden_repository_mappings": sum(historical(path) for path in local),
            "hidden_external_mappings": sum(mapping["hidden_historical"] for mapping in manifest["mappings"] if mapping["kind"] == "external-url"),
            "undecodable_source_blobs": sum(blob["image"].get("decodable") is False for blob in known.values()),
        }
        encoded = manifest_bytes(manifest)
        archive.writestr("manifest.json", encoded)
    verify(manifest, partial_zip, expected_local=local)
    partial_manifest.write_bytes(encoded)
    partial_zip.chmod(0o600)
    partial_manifest.chmod(0o600)
    partial_zip.replace(ZIP_PATH)
    partial_manifest.replace(MANIFEST_PATH)
    print(json.dumps({**manifest["summary"], "archive_bytes": ZIP_PATH.stat().st_size,
                      "zip_sha256": file_sha256(ZIP_PATH), "source_images_unchanged": True}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true", help="Check existing ZIP hashes, mappings and current local originals")
    parser.add_argument("--replace", action="store_true", help="Explicitly replace this script's existing private archive outputs")
    args = parser.parse_args()
    if args.verify_only and args.replace:
        parser.error("--verify-only and --replace are mutually exclusive")
    private_output_guard()
    if args.verify_only:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        verify(manifest, ZIP_PATH)
        print("Verified every archive member and all current repository source-image SHA-256 hashes.")
    else:
        create(replace=args.replace)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Image archive failed: {error}", file=sys.stderr)
        raise SystemExit(1)

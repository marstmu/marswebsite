# MARS website

The Metropolitan Aerospace Rocket Society website uses Zensical **0.0.68**.

The production configuration in `zensical.toml` retains `https://marstmu.com/`.
The private preview uses a separate ignored configuration and output directory;
it never replaces the public site's files or DNS.

## Install and preview

Python 3.11 or newer is required; the lockfile and this preview were tested with
Python 3.12.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r requirements.txt
.venv/bin/python scripts/preview.py --build
.venv/bin/python scripts/preview.py --serve
```

Backend: `http://127.0.0.1:8887/`.

Private review URL: <https://workstation.tailee9084.ts.net:8887/>. Tailscale is
required. The HTTPS route proxies only this localhost backend; Funnel is not used.
Preview HTML and responses carry `noindex, nofollow, noarchive`; `robots.txt`
blocks crawling. The private sitemap is retained as a route inventory and uses
tailnet URLs only; the public CNAME is removed from generated preview output.
These precautions do not substitute for the tailnet access boundary.
Text responses negotiate gzip while retaining `no-store`; images, videos, private
attachments and all byte-range responses preserve their original bytes. This is
private-server transport optimization, not proof of public-host performance.

The requested MARS Winter 2026 trailer is available as a 1080p H.264/AAC MP4
with native playback controls. Its highest-quality downloaded master (H.264/Opus
in MKV, 1920×1080) remains untouched outside published docs in `.local-media/`.
The preview-only `/downloads/mars-video-full-quality` route serves that one
explicit file as an attachment; it does not expose the media directory. Both
playback and the master download support HTTP byte ranges for seeking/resuming.
The master is excluded from Git and the generated/public site. Any later public
master hosting remains a separate publication decision.

To update the review copy after editing, rerun `scripts/preview.py --build` and
refresh the browser. The static server intentionally does not rebuild large
historical image collections continuously.

## Migration and verification

Zensical's native `blog` and `exclude` implementations replace the active MkDocs
plugins. Search is deliberately disabled, including its button and keyboard
overlay. The modern theme uses a compact custom header, an image-led homepage,
system-controlled light/dark appearance, and a clean social footer. Blog
date/slug URLs, authors, archives, assets, and the original
`/sponsors/package.pdf` download are preserved.

Markdown extensions have one consolidated configuration. The old duplicate YAML
key is fixed, and Zensical uses its own documented emoji/icon helpers. Copyright
is updated through 2026. The new dependency lock replaces separate floating
package lists in local setup, CI, and the devcontainer.

```sh
# Build public-format output locally; this does not upload or publish anything.
.venv/bin/zensical build --strict
.venv/bin/python scripts/prepare_site.py site
.venv/bin/python scripts/check_site.py site
```

## Image delivery and private originals

Both the preview build and CI run `scripts/prepare_site.py` after
Zensical. Display-only WebP variants use content-addressed names, actual pixel
widths, responsive `srcset`, EXIF orientation and embedded-profile color handling.
Photographs are compressed; diagrams and transparent branding use lossless
encoding. SVGs, favicons and animated GIFs remain unchanged. Existing manual
previews resolve back to their original source before encoding, preserving the
homepage's separate portrait/landscape crops. Original image files and gallery
download links are retained verbatim.
The video poster is encoded from a lossless decoded frame at 70 seconds, not
recompressed from the old JPEG. This requires `ffmpeg` (installed in CI).

Public guide images and author avatars are pinned in `docs/assets/external/`
with durable source URLs and SHA-256 checksums. Routine builds require those
verified copies and do not fetch remote images. To intentionally pin a newly
added public image, first build locally and run
`scripts/prepare_site.py site --fetch-external`, then review its manifest.
This command only inspects images rendered in that build; it does not fetch
excluded team pages. The generated delivery inventory is
`site/assets/display/manifest.json`.
Pages without `.arithmatex` do not download the MathJax engine. Math pages retain
the pinned 3.2.2 renderer, loaded on demand after checking for real formulas.

```sh
.venv/bin/python -m unittest discover -s scripts -p 'test_*.py'
```

Optional browser/lab checks require Node 22.19+ (24 in CI), Chrome and the pinned CI tools:

```sh
npm ci --prefix ci
node scripts/image-performance-smoke.cjs
node scripts/mathjax-smoke.cjs
node scripts/check_lighthouse.mjs --preview --full --report-only
```

The image check verifies delivery bytes, decoded dimensions, responsive
descriptors, transparency, lazy/eager loading and original download links across
mobile DPR 2/3, desktop and both color schemes. Lighthouse reports are local
simulated lab measurements, not field Core Web Vitals. MACH's reference targets
are performance 75, accessibility/best-practices 95 and SEO 90; the private
preview intentionally excludes its noindex SEO score from gating, never removes
its privacy protection. Reports live under ignored `.preview/` directories.
CI blocks on image/media and math regressions; Lighthouse is
explicitly diagnostic (`--report-only`): public-host performance is not yet
validated against the reference 75 target, and CI's uncompressed stdlib server
is not the private preview's gzip transport. Its reports are retained separately from
the Pages artifact.

The separate original-image archive command and its verified manifest remain
private under `.local-media/`; archive creation is never part of CI or the public
build. The exact preview-only `/downloads/mars-images-full-resolution` attachment
route supports range requests without exposing its directory. “Full resolution”
means the best source files available in this checkout and fetched source URLs,
not a claim of unavailable camera masters. Historical source exports and known
minimized variants are identified by the archive manifest.

```sh
# Explicit private archive operation; never invoked by preview/CI builds.
.venv/bin/python scripts/archive_images.py
.venv/bin/python scripts/archive_images.py --verify-only
# Existing archives are protected; reviewed regeneration requires --replace.
```

`mkdocs.yml` is retained as the comparison/rollback configuration, with its
duplicate extension key repaired. Optional legacy-builder dependencies live in
`requirements-legacy.txt`; they are not installed for the Zensical preview.

`requirements.in` declares the intended runtime. `requirements.txt` locks its
transitive dependencies and hashes. For a reviewed dependency update, use a
separate maintenance environment with `pip-tools==7.6.2` and regenerate:

```sh
pip-compile --generate-hashes --output-file requirements.txt requirements.in
```

## Reviewed publication

The workflow builds and validates on pull requests and main-branch
pushes. Publishing requires an explicitly requested manual workflow run with
`publish=true`; the default is false. Zensical has no `gh-deploy` command, so
the site uses GitHub Pages artifacts instead of force-pushing `gh-pages`.

After a maintainer approves publication, dispatch the existing workflow:

```sh
gh workflow run ci.yml --ref main -f publish=true
```

Before an approved public migration, verify representative historical URLs,
blog images/comments, gallery, navigation, disabled search shortcuts, mobile layouts, both themes,
and downloadable documents; configure GitHub Pages to use Actions; confirm the
existing custom domain and DNS are retained; and review the content and updated
sponsorship document. The local preview never changes GitHub settings or DNS.

The complete checker also gates internal pages/fragments (including absolute
canonical-domain links), CSS/font dependencies and preserved downloads. CI runs
all Python suites plus header/menu/history/parallax/founder and facade regression
checks. `scripts/browser-smoke.cjs --public` tests public-format output without
requiring the private server's noindex headers; the default still verifies them.
Founder provenance and superseded/source portrait drafts are excluded from Git
and generated outputs. Their untouched sources and lineage remain in the private
image archive; selected portraits and original gallery downloads stay available.

References: [Zensical migration](https://zensical.org/docs/compatibility/mkdocs/migration/),
[native blog](https://zensical.org/docs/setup/blog/),
[GitHub Pages publishing](https://zensical.org/docs/publish-your-site/).

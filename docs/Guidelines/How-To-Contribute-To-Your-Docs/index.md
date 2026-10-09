# Contribute to the website

The website's Markdown, images, and configuration live in [marstmu/marswebsite](https://github.com/marstmu/marswebsite). Use a branch or fork and propose a pull request; do not push straight to the live site.

## Where to edit

- `docs/index.md`: homepage text.
- `docs/competition/index.md`: competition overview and current announcements.
- `docs/blog/posts/`: dated posts. Keep existing post paths, dates, and author IDs when editing an archive.
- `docs/Guidelines/Archive/2024-2025/`: historical guides, not current competition rules.
- `docs/img/`: shared images. Use descriptive alt text and credit photographers.
- `overrides/`: custom templates; `zensical.toml`: navigation and site settings.

The previous `docs/Teams/your_team_name/` instructions do not describe this checkout. Ask the maintainers where new team documentation should go.

## Preview locally

Run these commands from the repository root with Python 3.12 installed:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/preview.py --build
.venv/bin/python scripts/preview.py --serve
```

The preview server listens on `127.0.0.1:8887`. Open `http://127.0.0.1:8887` on the machine running it. Preview output is marked `noindex`; these commands do not publish to the public website.

For the production configuration's build check, run `.venv/bin/zensical build --strict`. This creates local output only; it is not a deployment command.

## Before a pull request

1. Check navigation, internal links, mobile layout, and light/dark modes in the preview.
2. Source new facts with official links. Separate publication dates from historical event dates; do not invent attendance, current rosters, or registration deadlines.
3. Keep credentials, private documents, and unapproved photos out of the repository.
4. Review `git diff`, then submit a focused pull request for a maintainer to review.

Publishing requires a separate, explicitly approved deployment. Do not assume a commit or push should go live automatically.

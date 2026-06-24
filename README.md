# PageSpeed Archive

Capture and preserve [PageSpeed Insights](https://pagespeed.web.dev) reports as self-contained HTML files, hosted on GitHub Pages.

Reports are saved as single-file HTML snapshots — no external dependencies, fully viewable offline — preserving the exact state of a page's performance profile at a given point in time.

## Setup

```bash
git clone git@github.com:zzlatev-yotpo/pagespeed-archive.git
cd pagespeed-archive
npm install
```

## Usage

### Capture a report

```bash
npm run capture -- "<pagespeed-url>"
```

Example:

```bash
npm run capture -- "https://pagespeed.web.dev/analysis/https-yotpocosmetics-com-pages-rewards/kufokeahnt?form_factor=mobile"
```

This will:
1. Open the URL in a headless browser and wait for the report to render
2. Save the fully rendered page as a single self-contained HTML file
3. Inject a `noindex` meta tag
4. Rebuild the index page
5. Commit and push to trigger a Pages deployment

### Options

| Flag | Description |
|------|-------------|
| `-d, --date <YYYY-MM-DD>` | Override the date label (defaults to today) |
| `-n, --name <name>` | Custom filename (without `.html` extension) |
| `--no-push` | Save locally without committing/pushing |

### List archived reports

```bash
npm run capture -- list
```

## How it works

- **Capture:** Uses [SingleFile](https://github.com/nicksavill/single-file-cli) via Puppeteer to serialize the fully-rendered SPA into one HTML file (CSS, images, fonts inlined as data URIs).
- **Index:** Auto-generated `index.html` lists all archived reports with page name, device type, and date.
- **Deploy:** A GitHub Actions workflow deploys the repo to GitHub Pages on every push to `master`.
- **SEO:** `robots.txt` disallows all crawlers; every HTML file carries `<meta name="robots" content="noindex, nofollow">`.

## File structure

```
├── bin/
│   ├── capture.mjs       # CLI entry point
│   └── build-index.mjs   # Regenerates index.html
├── reports/              # Archived report HTML files
├── .github/workflows/
│   └── deploy-pages.yml  # GitHub Pages deployment
├── index.html            # Auto-generated listing
├── robots.txt            # Disallow all crawlers
└── package.json
```

## Pages URL

https://zzlatev-yotpo.github.io/pagespeed-archive/

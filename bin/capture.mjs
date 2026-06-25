#!/usr/bin/env node

import { program } from 'commander';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'reports');

function parsePagespeedUrl(url) {
  const match = url.match(
    /pagespeed\.web\.dev\/analysis\/([^/]+)\/([^?]+)/
  );
  if (!match) {
    throw new Error(
      'Invalid URL. Expected format: https://pagespeed.web.dev/analysis/<encoded-url>/<id>?form_factor=...'
    );
  }

  const encodedTarget = match[1];
  const analysisId = match[2];

  const formFactorMatch = url.match(/form_factor=(mobile|desktop)/);
  const formFactor = formFactorMatch ? formFactorMatch[1] : 'mobile';

  const pageName = encodedTarget
    .replace(/^https?-/, '')
    .replace(/-com(?=-|$)/, '')
    .replace(/-{2,}/g, '-');

  return { analysisId, formFactor, pageName, encodedTarget };
}

function buildFilename(parsed, dateStr) {
  return `${parsed.pageName}_${parsed.formFactor}_${dateStr}_${parsed.analysisId.slice(0, 8)}.html`;
}

function buildUrl(baseUrl, formFactor) {
  const u = new URL(baseUrl);
  u.searchParams.set('form_factor', formFactor);
  return u.toString();
}

async function getBrowserPath() {
  const puppeteer = await import('puppeteer');
  return puppeteer.default.executablePath();
}

/**
 * Post-process: strip scripts and CSP that break the archived page,
 * inject archive banner and noindex meta.
 */
function cleanupHtml(html, date) {
  // Remove the CSP meta tag (causes rendering/loading blocks)
  html = html.replace(
    /<meta\s+http-equiv="content-security-policy"[^>]*>/gi,
    ''
  );

  // Remove all <script> tags (base64-encoded Google Closure JS that can't work offline)
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove inline event handlers that reference dead code
  html = html.replace(/\s+on(click|load|error|change)="[^"]*"/gi, '');

  // Inject noindex if missing
  if (!html.includes('name="robots"')) {
    html = html.replace(
      /<head([^>]*)>/i,
      '<head$1><meta name="robots" content="noindex, nofollow">'
    );
  }

  // Inject archive banner at top of body
  const banner = `<div style="position:sticky;top:0;z-index:99999;background:#1a73e8;color:#fff;padding:8px 16px;font:13px/1.4 system-ui,sans-serif;text-align:center;">Archived PageSpeed snapshot &mdash; captured ${date}</div>`;
  html = html.replace(/<body([^>]*)>/i, `<body$1>${banner}`);

  return html;
}

async function captureSingleReport(url, outputPath, date) {
  const browserPath = await getBrowserPath();

  console.log(`  Capturing: ${url}`);

  try {
    execSync(
      [
        'npx single-file',
        `"${url}"`,
        `"${outputPath}"`,
        `--browser-executable-path="${browserPath}"`,
        '--no-block-scripts',
        '--no-remove-hidden-elements',
        '--no-insert-meta-csp',
        '--browser-wait-until=networkidle0',
        '--browser-wait-delay=5000',
        '--browser-args=\'["--no-sandbox","--disable-setuid-sandbox"]\'',
        '--filename-conflict-action=overwrite',
      ].join(' '),
      { cwd: ROOT, stdio: 'inherit', timeout: 120_000 }
    );
  } catch (err) {
    console.error(`\n  ❌ SingleFile capture failed: ${err.message}`);
    process.exit(1);
  }

  if (!existsSync(outputPath)) {
    console.error('  ❌ Output file not found after capture.');
    process.exit(1);
  }

  // Post-process: strip broken scripts and inject archive metadata
  let html = readFileSync(outputPath, 'utf-8');
  html = cleanupHtml(html, date);
  writeFileSync(outputPath, html);

  const size = readFileSync(outputPath).length;
  console.log(`  ✅ Saved: ${outputPath.split('/').pop()} (${(size / 1024).toFixed(0)}KB)`);
}

async function captureReport(url, opts) {
  const date = opts.date || new Date().toISOString().slice(0, 10);

  console.log(`\nParsing URL...`);
  const parsed = parsePagespeedUrl(url);
  console.log(`  Page:        ${parsed.pageName}`);
  console.log(`  Analysis ID: ${parsed.analysisId}`);

  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const formFactors = opts.both
    ? ['mobile', 'desktop']
    : [parsed.formFactor];

  console.log(`  Capturing:   ${formFactors.join(', ')}`);
  console.log(`\n  (this takes 20-40s per form factor...)\n`);

  const capturedFiles = [];

  for (const ff of formFactors) {
    const ffParsed = { ...parsed, formFactor: ff };
    const filename = opts.name && formFactors.length === 1
      ? `${opts.name}.html`
      : buildFilename(ffParsed, date);
    const outputPath = resolve(REPORTS_DIR, filename);
    const targetUrl = buildUrl(url, ff);

    await captureSingleReport(targetUrl, outputPath, date);
    capturedFiles.push(filename);
  }

  console.log('\nRebuilding index...');
  execSync('node bin/build-index.mjs', { cwd: ROOT, stdio: 'inherit' });

  if (opts.push !== false) {
    console.log('\nCommitting and pushing...');
    try {
      const msg = capturedFiles.length === 1
        ? `archive: ${capturedFiles[0]}`
        : `archive: ${parsed.pageName} (mobile + desktop)`;
      execSync(
        `git add reports/ index.html && git commit -m "${msg}" && git push`,
        { cwd: ROOT, stdio: 'inherit' }
      );
      console.log('✅ Pushed to remote.');
    } catch (err) {
      console.error('⚠️  Git push failed (commit may still exist locally).');
    }
  }
}

program
  .name('psa')
  .description('Capture PageSpeed Insights reports as self-contained HTML snapshots')
  .version('1.0.0')
  .argument('[url]', 'Full pagespeed.web.dev analysis URL')
  .option('-d, --date <date>', 'Date label (YYYY-MM-DD)')
  .option('-n, --name <name>', 'Custom filename (without .html)')
  .option('-b, --both', 'Capture both mobile and desktop')
  .option('--no-push', 'Skip git commit and push')
  .action((url, opts) => {
    if (url) {
      captureReport(url, opts).catch((err) => {
        console.error('\n❌ Capture failed:', err.message);
        process.exit(1);
      });
    } else {
      program.help();
    }
  });

program
  .command('capture')
  .description('Capture a pagespeed.web.dev report URL')
  .argument('<url>', 'Full pagespeed.web.dev analysis URL')
  .option('-d, --date <date>', 'Date label (YYYY-MM-DD)')
  .option('-n, --name <name>', 'Custom filename (without .html)')
  .option('-b, --both', 'Capture both mobile and desktop')
  .option('--no-push', 'Skip git commit and push')
  .action(captureReport);

program
  .command('list')
  .description('List all archived reports')
  .action(() => {
    if (!existsSync(REPORTS_DIR)) {
      console.log('No reports yet.');
      return;
    }
    const files = readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith('.html'))
      .sort();
    if (files.length === 0) {
      console.log('No reports yet.');
      return;
    }
    console.log(`\n${files.length} archived reports:\n`);
    files.forEach((f) => console.log(`  ${f}`));
  });

program.parse();

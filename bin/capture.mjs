#!/usr/bin/env node

import { program } from 'commander';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

  const targetUrl = encodedTarget
    .replace(/-/g, '/')
    .replace(/^https\/\//, 'https://')
    .replace(/^http\/\//, 'http://');

  const formFactorMatch = url.match(/form_factor=(mobile|desktop)/);
  const formFactor = formFactorMatch ? formFactorMatch[1] : 'mobile';

  const pageName = encodedTarget
    .replace(/^https?-/, '')
    .replace(/-com-/, '-')
    .split('-')
    .slice(0, 4)
    .join('-');

  return { targetUrl, analysisId, formFactor, pageName, encodedTarget };
}

function buildFilename(parsed, dateStr) {
  return `${parsed.pageName}_${parsed.formFactor}_${dateStr}_${parsed.analysisId.slice(0, 8)}.html`;
}

program
  .name('psa')
  .description('Capture PageSpeed Insights reports as self-contained HTML')
  .version('1.0.0');

program
  .command('capture')
  .description('Capture a pagespeed.web.dev report URL')
  .argument('<url>', 'Full pagespeed.web.dev analysis URL')
  .option('-d, --date <date>', 'Date label (YYYY-MM-DD)', () => {
    return new Date().toISOString().slice(0, 10);
  })
  .option('-n, --name <name>', 'Custom filename (without .html)')
  .option('--no-push', 'Skip git commit and push')
  .action((url, opts) => {
    const date = opts.date || new Date().toISOString().slice(0, 10);

    console.log(`\nParsing URL...`);
    const parsed = parsePagespeedUrl(url);
    console.log(`  Target:      ${parsed.targetUrl}`);
    console.log(`  Form factor: ${parsed.formFactor}`);
    console.log(`  Analysis ID: ${parsed.analysisId}`);

    const filename = opts.name
      ? `${opts.name}.html`
      : buildFilename(parsed, date);
    const outputPath = resolve(REPORTS_DIR, filename);

    if (!existsSync(REPORTS_DIR)) {
      mkdirSync(REPORTS_DIR, { recursive: true });
    }

    console.log(`\nCapturing report → ${filename}`);
    console.log(`  (this takes 15-30s while the page renders...)\n`);

    try {
      execSync(
        [
          'npx single-file',
          `"${url}"`,
          `"${outputPath}"`,
          '--browser-wait-until=networkidle0',
          '--browser-wait-delay=5000',
          '--browser-arg="--no-sandbox"',
        ].join(' '),
        { cwd: ROOT, stdio: 'inherit', timeout: 120_000 }
      );
    } catch (err) {
      console.error('\nCapture failed. Ensure puppeteer/chromium is available.');
      console.error(err.message);
      process.exit(1);
    }

    if (!existsSync(outputPath)) {
      console.error('Output file not found after capture.');
      process.exit(1);
    }

    console.log(`\n✅ Saved: reports/${filename}`);

    // Rebuild index
    console.log('Rebuilding index...');
    execSync('node bin/build-index.mjs', { cwd: ROOT, stdio: 'inherit' });

    if (opts.push !== false) {
      console.log('\nCommitting and pushing...');
      try {
        execSync(
          `git add reports/ index.html && git commit -m "archive: ${filename}" && git push`,
          { cwd: ROOT, stdio: 'inherit' }
        );
        console.log('✅ Pushed to remote.');
      } catch (err) {
        console.error('⚠️  Git push failed (commit may still exist locally).');
      }
    }
  });

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
    console.log('');
  });

program.parse();

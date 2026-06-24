#!/usr/bin/env node

import { readdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPORTS_DIR = resolve(ROOT, 'reports');

function parseFilename(filename) {
  // Format: pageName_formFactor_date_idPrefix.html
  const withoutExt = filename.replace('.html', '');
  const parts = withoutExt.split('_');
  if (parts.length >= 4) {
    const idPrefix = parts.pop();
    const date = parts.pop();
    const formFactor = parts.pop();
    const pageName = parts.join('_');
    return { pageName, formFactor, date, idPrefix };
  }
  return { pageName: withoutExt, formFactor: '?', date: '?', idPrefix: '' };
}

let files = [];
try {
  files = readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith('.html'))
    .sort()
    .reverse();
} catch {
  // no reports dir yet
}

const rows = files
  .map((f) => {
    const p = parseFilename(f);
    return `        <tr>
          <td><a href="reports/${f}">${p.pageName}</a></td>
          <td>${p.formFactor}</td>
          <td>${p.date}</td>
          <td><code>${p.idPrefix}</code></td>
        </tr>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PageSpeed Archive</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; max-width: 960px; margin: 0 auto; color: #1a1a1a; }
    h1 { margin-bottom: 0.5rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e5e5; }
    th { background: #f8f8f8; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
    tr:hover td { background: #f0f7ff; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #f0f0f0; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.85em; }
    .empty { text-align: center; padding: 3rem; color: #999; }
  </style>
</head>
<body>
  <h1>PageSpeed Archive</h1>
  <p class="subtitle">Captured PageSpeed Insights reports</p>
  ${
    files.length === 0
      ? '<p class="empty">No reports archived yet. Run <code>psa capture &lt;url&gt;</code> to add one.</p>'
      : `<table>
      <thead>
        <tr>
          <th>Page</th>
          <th>Device</th>
          <th>Date</th>
          <th>ID</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>`
  }
</body>
</html>
`;

writeFileSync(resolve(ROOT, 'index.html'), html);
console.log(`index.html rebuilt (${files.length} reports)`);

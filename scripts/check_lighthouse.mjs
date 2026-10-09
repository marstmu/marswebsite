// Local mobile lab checks, following MACH's category thresholds. Not field CWV.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(root, 'lighthouserc.json'))).ci;
const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:8887';
const cli = process.env.LIGHTHOUSE_CLI || path.join(root, 'ci/node_modules/lighthouse/cli/index.js');
const output = process.env.SITE_TEST_OUTPUT || path.join(root, '.preview/lighthouse');
const preview = process.argv.includes('--preview');
const reportOnly = process.argv.includes('--report-only');
const runs = process.argv.includes('--full') ? config.collect.numberOfRuns : 1;
if (!existsSync(cli)) throw new Error('Install locked CI tools with npm ci --prefix ci, or set LIGHTHOUSE_CLI to an existing CLI.');
mkdirSync(output, {recursive: true});
const reports = [];
let failed = false;
for (const configuredUrl of config.collect.url) {
  const route = new URL(configuredUrl).pathname;
  const scores = {};
  for (let run = 0; run < runs; run++) {
    const name = path.join(output, `${route === '/' ? 'home' : route.replaceAll('/', '-')}-${run}`);
    const result = spawnSync(process.execPath, [cli, new URL(route, base).href, '--quiet',
      '--chrome-flags=' + config.collect.settings.chromeFlags,
      '--output=json', '--output=html', '--output-path=' + name], {stdio: 'inherit', env: process.env});
    if (result.status !== 0) throw new Error('Lighthouse failed for ' + route);
    const report = JSON.parse(readFileSync(name + '.report.json'));
    if (report.runtimeError) throw new Error(JSON.stringify(report.runtimeError));
    for (const [key, value] of Object.entries(report.categories)) (scores[key] ||= []).push(value.score);
    const item = {route, run, lighthouseVersion: report.lighthouseVersion,
      profile: report.configSettings.formFactor, throttling: report.configSettings.throttlingMethod,
      scores: Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, value.score])),
      lcpMs: report.audits['largest-contentful-paint'].numericValue,
      cls: report.audits['cumulative-layout-shift'].numericValue,
      bytes: report.audits['total-byte-weight'].numericValue,
      previewSeoExcluded: preview, warnings: report.runWarnings};
    console.log(JSON.stringify(item)); reports.push(item);
  }
  for (const [assertion, [, rule]] of Object.entries(config.assert.assertions)) {
    const category = assertion.replace('categories:', '');
    // Keep the score visible. A private noindex preview must never become crawlable to pass SEO.
    if (preview && category === 'seo') continue;
    const sorted = scores[category].sort((a, b) => a - b);
    const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
    if (median < rule.minScore) { console.error(`${route}: ${category} ${median} < ${rule.minScore}`); failed = true; }
  }
}
writeFileSync(path.join(output, 'summary.json'), JSON.stringify({labOnly: true, preview, reports}, null, 2));
if (failed && !reportOnly) process.exitCode = 1;

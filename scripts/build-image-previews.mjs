#!/usr/bin/env node
// Mechanical resize/re-encoding only. Original photographs remain untouched.
import { readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/assets/previews');
mkdirSync(output, { recursive: true });
const report = [];
for (const [folder, group, widths] of [
  ['docs/gallery', 'gallery', [480, 960]],
  ['docs/assets/images', 'home', [480, 960, 1600]],
]) {
  for (const file of readdirSync(path.join(root, folder)).sort()) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const source = path.join(root, folder, file);
    const stem = path.parse(file).name;
    const entry = { source: path.relative(root, source), originalBytes: statSync(source).size, previews: [] };
    for (const width of widths) {
      const target = path.join(output, `${group}-${stem}-${width}.webp`);
      execFileSync('magick', [source, '-auto-orient', '-colorspace', 'sRGB', '-resize', `${width}x${width}>`, '-strip', '-quality', '80', target]);
      const dimensions = execFileSync('identify', ['-format', '%w %h', target], { encoding: 'utf8' }).split(' ').map(Number);
      entry.previews.push({ file: path.relative(root, target), maxEdge: width, width: dimensions[0], height: dimensions[1], bytes: statSync(target).size });
    }
    report.push(entry);
    console.log(`${group}/${file}: ${entry.originalBytes} -> ${entry.previews.map(p => p.bytes).join('/')} bytes`);
  }
}
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');

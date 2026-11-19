import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceRoot = 'src';
const files = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.(?:tsx?|ts)$/.test(entry.name)) files.push(path);
  }
};
visit(sourceRoot);

const MIN_FONT_PX = 12;
const problems = [];
const tinyFont = /font-size\s*:\s*(\d+(?:\.\d+)?)px\b/g;
const tinyUtility = /text-\[(\d+(?:\.\d+)?)px\]/g;
const collapse = /\b(?:sidebarCollapsed|is-collapsed|sidebar-toggle|PanelLeftClose|PanelLeftOpen)\b|\bcollapsed\s*=/;

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  for (const [pattern, label] of [[tinyFont, 'font-size'], [tinyUtility, 'text utility']]) {
    for (const match of source.matchAll(pattern)) {
      if (Number(match[1]) < MIN_FONT_PX) problems.push(`${relative('.', path)}: ${label} ${match[1]}px`);
    }
  }
  if (collapse.test(source)) problems.push(`${relative('.', path)}: collapse-related identifier`);
}

const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
for (const token of ['--fs-2xs', '--fs-xs']) {
  for (const match of css.matchAll(new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)rem\\b`, 'g'))) {
    const px = Number(match[1]) * 16;
    if (px < MIN_FONT_PX) problems.push(`src/index.css: ${token} resolves to ${px}px`);
  }
}

const chart = readFileSync(join(sourceRoot, 'components', 'PriceChart.tsx'), 'utf8');
if (!/addCandlestickSeries/.test(chart)) problems.push('PriceChart.tsx: candlestick rendering is required');
for (const label of ['Structure', 'Zones', 'Trade levels', 'Signals', 'Trades']) {
  if (chart.includes(label)) problems.push(`PriceChart.tsx: removed chart layer "${label}" must not be rendered`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  const tokenized = [...css.matchAll(/font-size\s*:\s*var\(--fs-(?:2xs|xs)\)/g)].length;
  console.log(`UI layout checks passed. Font sizes below ${MIN_FONT_PX}px: 0; tiny text utilities: 0; tokenized small-caption rules: ${tokenized}; collapse identifiers: 0.`);
}

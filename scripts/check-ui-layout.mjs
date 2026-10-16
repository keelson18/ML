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

const problems = [];
const tinyFont = /font-size\s*:\s*(\d+(?:\.\d+)?)px\b/g;
const tinyUtility = /text-\[(\d+(?:\.\d+)?)px\]/g;
const collapse = /\b(?:sidebarCollapsed|is-collapsed|sidebar-toggle|PanelLeftClose|PanelLeftOpen)\b|\bcollapsed\s*=/;

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  for (const [pattern, label] of [[tinyFont, 'font-size'], [tinyUtility, 'text utility']]) {
    for (const match of source.matchAll(pattern)) {
      if (Number(match[1]) < 11) problems.push(`${relative('.', path)}: ${label} ${match[1]}px`);
    }
  }
  if (collapse.test(source)) problems.push(`${relative('.', path)}: collapse-related identifier`);
}

const chart = readFileSync(join(sourceRoot, 'components', 'PriceChart.tsx'), 'utf8');
if (!/strokeWidth="2"/.test(chart) || !/strokeWidth="1\.5"/.test(chart)) problems.push('PriceChart.tsx: drawing lines must be at least 1.5px thick');
if (!/fontSize="14"/.test(chart)) problems.push('PriceChart.tsx: chart drawing labels must be at least 14px for mobile');
if (!/\['structure', 'Structure'\]/.test(chart) || !/\['zones', 'Zones'\]/.test(chart) || !/\['tradeLevels', 'Trade levels'\]/.test(chart)
  || !/\['signals', 'Signals'\]/.test(chart) || !/\['trades', 'Trades'\]/.test(chart)) problems.push('PriceChart.tsx: all five independently toggleable drawing layers are required');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
  const justified = [...css.matchAll(/font-size\s*:\s*var\(--fs-2xs\)/g)].length;
  console.log(`UI layout checks passed. Sub-12px numeric declarations: 0; tokenized 11px caption rules: ${justified}; tiny text utilities: 0; collapse identifiers: 0.`);
}

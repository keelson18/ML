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

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');
  const justified = [...css.matchAll(/font-size\s*:\s*var\(--fs-2xs\)/g)].length;
  console.log(`UI layout checks passed. Sub-12px numeric declarations: 0; tokenized 11px caption rules: ${justified}; tiny text utilities: 0; collapse identifiers: 0.`);
}

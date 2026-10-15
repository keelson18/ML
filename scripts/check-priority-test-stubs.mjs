import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const testRoots = [
  'backend/src/engines',
  'backend/src/trader',
  'backend/src/services',
  'backend/src/autonomy',
  'src/lib/strategies',
  'src/lib/indicators',
];
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/;
const stubPattern = /\b(?:(?:it|test|describe)(?:\.(?:concurrent|sequential))?\.(?:todo|skip|only|skipIf|runIf)|[xf](?:it|test|describe))\b/;
const testFiles = [];

async function collectTests(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectTests(path);
    else if (entry.isFile() && testFilePattern.test(entry.name)) testFiles.push(path);
  }
}

for (const testRoot of testRoots) await collectTests(resolve(root, testRoot));

const violations = [];
for (const path of testFiles) {
  const content = await readFile(path, 'utf8');
  if (stubPattern.test(content)) violations.push(relative(root, path).replaceAll('\\', '/'));
}

if (violations.length) {
  console.error(`Priority test files contain todo, skipped, or focused tests:\n${violations.map((path) => `- ${path}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Priority test stub check passed (${testFiles.length} test files scanned).`);
}

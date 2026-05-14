import { expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const ALLOWED = ['routing/haiku-classifier.ts', 'routing/haiku-guard.test.ts'];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.(ts|js|tsx|jsx)$/.test(entry.name)) yield full;
  }
}

test('haiku is reserved exclusively for the classifier', () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];
  const re = /\bclaude-haiku|\bhaiku-4|HAIKU_MODEL/i;
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (ALLOWED.includes(rel)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (re.test(ln) && !ln.trim().startsWith('//') && !ln.trim().startsWith('*')) {
        offenders.push({ file: rel, line: i + 1, text: ln.trim() });
      }
    });
  }
  if (offenders.length) {
    console.error('Haiku referenced outside classifier:', offenders);
  }
  expect(offenders).toEqual([]);
});

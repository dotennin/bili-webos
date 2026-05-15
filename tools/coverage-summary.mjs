import fs from 'node:fs';
import path from 'node:path';

const coverageDir = process.argv[2] ?? 'coverage';
const lcovPath = path.join(coverageDir, 'lcov.info');
const summaryPath = path.join(coverageDir, 'coverage-summary.json');

const text = fs.readFileSync(lcovPath, 'utf8');

const total = {
  lines: { total: 0, covered: 0, skipped: 0 },
  statements: { total: 0, covered: 0, skipped: 0 },
  functions: { total: 0, covered: 0, skipped: 0 },
  branches: { total: 0, covered: 0, skipped: 0 },
};

for (const line of text.split('\n')) {
  if (line.startsWith('LF:')) total.lines.total += Number(line.slice(3)) || 0;
  else if (line.startsWith('LH:')) total.lines.covered += Number(line.slice(3)) || 0;
  else if (line.startsWith('FNF:')) total.functions.total += Number(line.slice(4)) || 0;
  else if (line.startsWith('FNH:')) total.functions.covered += Number(line.slice(4)) || 0;
  else if (line.startsWith('BRF:')) total.branches.total += Number(line.slice(4)) || 0;
  else if (line.startsWith('BRH:')) total.branches.covered += Number(line.slice(4)) || 0;
}

total.statements.total = total.lines.total;
total.statements.covered = total.lines.covered;

for (const metric of Object.values(total)) {
  metric.pct = metric.total === 0 ? 100 : Number(((metric.covered / metric.total) * 100).toFixed(2));
}

const summary = { total };
fs.mkdirSync(coverageDir, { recursive: true });
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Wrote ${summaryPath}`);

import fs from 'node:fs';
import path from 'node:path';

const bunBin =
  process.env.BUN_BIN || path.join(process.env.HOME || '', '.bun/bin/bun');
const coverageDir = 'coverage';
const isolatedCoverageDir = path.join(coverageDir, 'isolated');
const mainCoverageDir = path.join(coverageDir, 'main');
// These tests exercise real storage/api/focus modules, but render suites mock the
// same modules heavily. Running them in a separate Bun process avoids CI-only
// mock.module leakage while still letting us merge their LCOV into the report.
const isolatedTests = [
  'src/utils/storage.test.ts',
  'src/api/client.integration.test.ts',
  'src/hooks/useFocus.test.ts',
];
const isolatedCoverageFiles = [
  'src/utils/storage.ts',
  'src/api/client.ts',
  'src/hooks/useFocus.ts',
];
const testRoots = ['webos/service/com.biliwebos.app.service/test', 'src'];

type LcovFile = {
  filePath: string;
  fnf: number;
  fnh: number;
  brf: number;
  brh: number;
  lines: Map<number, number>;
};

function run(command: string, args: string[]) {
  const proc = Bun.spawnSync([command, ...args], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode || 1);
  }
}

function walk(dir: string) {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && fullPath.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getMainTests() {
  const isolated = new Set(isolatedTests.map((file) => path.normalize(file)));
  return testRoots
    .flatMap(walk)
    .map((file) => path.normalize(file))
    .filter((file) => !isolated.has(file))
    .sort();
}

function parseLcovFile(filePath: string) {
  const files = new Map<string, LcovFile>();
  const text = fs.readFileSync(filePath, 'utf8');
  for (const record of text.split('end_of_record')) {
    if (!record.trim()) continue;

    const entry: LcovFile = {
      filePath: '',
      fnf: 0,
      fnh: 0,
      brf: 0,
      brh: 0,
      lines: new Map(),
    };

    for (const rawLine of record.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('SF:')) {
        entry.filePath = line.slice(3);
      } else if (line.startsWith('FNF:')) {
        entry.fnf = Number(line.slice(4)) || 0;
      } else if (line.startsWith('FNH:')) {
        entry.fnh = Number(line.slice(4)) || 0;
      } else if (line.startsWith('BRF:')) {
        entry.brf = Number(line.slice(4)) || 0;
      } else if (line.startsWith('BRH:')) {
        entry.brh = Number(line.slice(4)) || 0;
      } else if (line.startsWith('DA:')) {
        const [lineNo, hits] = line
          .slice(3)
          .split(',')
          .map((value) => Number(value) || 0);
        if (lineNo > 0) entry.lines.set(lineNo, hits);
      }
    }

    if (entry.filePath) files.set(entry.filePath, entry);
  }
  return files;
}

function mergeLcov(
  basePath: string,
  overlayPath: string,
  overlayFiles: string[],
) {
  const merged = parseLcovFile(basePath);
  const overlay = parseLcovFile(overlayPath);
  for (const filePath of overlayFiles) {
    const entry = overlay.get(filePath);
    if (entry) merged.set(filePath, entry);
  }
  return merged;
}

function writeLcov(files: Map<string, LcovFile>, outputPath: string) {
  const chunks: string[] = [];
  for (const file of [...files.values()].sort((a, b) =>
    a.filePath.localeCompare(b.filePath),
  )) {
    const lines = [...file.lines.entries()].sort((a, b) => a[0] - b[0]);
    const coveredLines = lines.filter(([, hits]) => hits > 0).length;

    chunks.push('TN:');
    chunks.push(`SF:${file.filePath}`);
    chunks.push(`FNF:${file.fnf}`);
    chunks.push(`FNH:${Math.min(file.fnh, file.fnf)}`);
    if (file.brf > 0 || file.brh > 0) {
      chunks.push(`BRF:${file.brf}`);
      chunks.push(`BRH:${Math.min(file.brh, file.brf)}`);
    }
    for (const [lineNo, hits] of lines) {
      chunks.push(`DA:${lineNo},${hits}`);
    }
    chunks.push(`LF:${lines.length}`);
    chunks.push(`LH:${coveredLines}`);
    chunks.push('end_of_record');
  }
  fs.writeFileSync(outputPath, `${chunks.join('\n')}\n`);
}

fs.rmSync(coverageDir, { recursive: true, force: true });
fs.mkdirSync(coverageDir, { recursive: true });

run('tsc', ['-p', 'tsconfig.service.json']);
run(bunBin, [
  'test',
  '--preload',
  './tools/coverage-preload.ts',
  '--coverage',
  '--coverage-reporter=lcov',
  `--coverage-dir=${isolatedCoverageDir}`,
  ...isolatedTests,
]);
run(bunBin, [
  'test',
  '--max-concurrency=1',
  '--preload',
  './tools/coverage-preload.ts',
  '--coverage',
  '--coverage-reporter=text',
  '--coverage-reporter=lcov',
  `--coverage-dir=${mainCoverageDir}`,
  ...getMainTests(),
]);

writeLcov(
  mergeLcov(
    path.join(mainCoverageDir, 'lcov.info'),
    path.join(isolatedCoverageDir, 'lcov.info'),
    isolatedCoverageFiles,
  ),
  path.join(coverageDir, 'lcov.info'),
);

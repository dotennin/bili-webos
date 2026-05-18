// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function metricLabel(metric) {
  return metric[0].toUpperCase() + metric.slice(1);
}

export function formatPct(value) {
  return `${Number(value).toFixed(2)}%`;
}

export function formatDeltaPct(value) {
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

export function findBelowThresholdMetrics(total, threshold) {
  return METRICS.filter(
    (metric) => Number(total?.[metric]?.pct ?? 0) < threshold,
  ).map(metricLabel);
}

export function buildCoverageReport(
  currentSummary,
  baseSummary,
  threshold = 80,
) {
  const currentTotal = currentSummary?.total ?? {};
  const baseTotal = baseSummary?.total ?? null;
  const rows = METRICS.map((metric) => {
    const currentPct = Number(currentTotal?.[metric]?.pct ?? 0);
    const basePct =
      baseTotal && baseTotal[metric] ? Number(baseTotal[metric].pct) : null;
    return {
      metric: metricLabel(metric),
      current: formatPct(currentPct),
      main: basePct == null ? 'N/A' : formatPct(basePct),
      delta: basePct == null ? 'N/A' : formatDeltaPct(currentPct - basePct),
    };
  });
  const belowThreshold = findBelowThresholdMetrics(currentTotal, threshold);

  return {
    threshold,
    currentTotal,
    baseTotal,
    rows,
    belowThreshold,
    baselineMissing: !baseTotal,
    failed: belowThreshold.length > 0,
  };
}

export function renderPullRequestComment(report, options = {}) {
  const baselineLabel = options.baselineLabel ?? 'main';
  const lines = [
    '## Coverage Report',
    '',
    'Build weighted coverage comparison',
    '',
  ];

  if (report.failed) {
    lines.push(
      `Coverage gate failed: weighted coverage is below ${report.threshold}%`,
      '',
      ...report.belowThreshold.map((metric) => {
        const row = report.rows.find((entry) => entry.metric === metric);
        return `- ${metric}: ${row?.current ?? 'N/A'}`;
      }),
      '',
    );
  }

  if (report.baselineMissing) {
    lines.push(
      `Baseline \`${baselineLabel}\` coverage summary is unavailable.`,
      '',
    );
  }

  lines.push(`Weighted LCOV total vs ${baselineLabel}:`, '');
  lines.push('| Metric | Current | Main | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of report.rows) {
    lines.push(
      `| ${row.metric} | ${row.current} | ${row.main} | ${row.delta} |`,
    );
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      args[key] = value;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

if (import.meta.main) {
  const args = parseArgs(process.argv);
  const currentPath = args.current;
  if (!currentPath) {
    throw new Error('--current is required');
  }

  const basePath = args.base;
  const threshold = Number(args.threshold ?? 90);
  const resultOut = args['result-out'] ?? 'coverage/compare-result.json';
  const commentOut = args['comment-out'] ?? 'coverage/pr-comment.md';
  const baselineLabel = args['baseline-label'] ?? 'main';

  const currentSummary = readJsonIfPresent(currentPath);
  const baseSummary = readJsonIfPresent(basePath);
  const report = buildCoverageReport(currentSummary, baseSummary, threshold);
  const comment = renderPullRequestComment(report, { baselineLabel });

  ensureParent(resultOut);
  ensureParent(commentOut);
  fs.writeFileSync(`${resultOut}`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(commentOut, `${comment}\n`);

  console.log(comment);
}

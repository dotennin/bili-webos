# WEN-38 Coverage And CI Design

## Summary

This change raises the repository's weighted LCOV total coverage to at least 95%, then upgrades the pull request coverage workflow so it compares the current branch against `main` and reports clear weighted-metric deltas. The workflow also becomes a gate: if the current branch's weighted LCOV total drops below 90% for any checked metric, the coverage job fails and the pull request comment explicitly calls out the failing threshold.

The implementation order is intentional. Coverage improvement comes first. CI comparison and gating are added only after the weighted LCOV total has been raised past the target.

## Goals

- Raise weighted LCOV total coverage to `>=95%`.
- Keep the coverage calculation based on the weighted LCOV totals, not per-file averages.
- Add pull request reporting that shows weighted `Current / Main / Delta` for `Lines`, `Statements`, `Functions`, and `Branches`.
- Fail coverage CI when the current branch's weighted LCOV total is below `90%` for any checked metric.
- Include an explicit warning in the pull request comment when the current branch is below the `90%` threshold.
- Reuse the existing Bun-based test and coverage workflow instead of introducing a new test runner.

## Non-Goals

- No change to the definition of coverage by excluding more production files just to improve the percentage.
- No file-level coverage diff section in the pull request comment for this ticket.
- No broad refactor of app or service architecture beyond small extractions needed to make existing behavior testable.
- No replacement of the current coverage summary format with a third-party reporting service.

## Current State

- `bun test:coverage` already emits `coverage/lcov.info`.
- `tools/coverage-summary.ts` converts LCOV data into `coverage/coverage-summary.json` with both per-file average and weighted totals.
- `.github/workflows/coverage.yml` already comments the current run's coverage on pull requests and updates badge data on `main`.
- The current weighted totals are well below the ticket target. At the time of design, `coverage/coverage-summary.json` reports weighted totals of:
  - `Lines`: `78.16%`
  - `Statements`: `78.16%`
  - `Functions`: `74.8%`
  - `Branches`: `100%`
- The largest opportunities are concentrated in a few low-coverage production files, especially `src/App.tsx`, `src/dev/biliProxy.ts`, and `webos/service/com.biliwebos.app.service/src/service.ts`.

## Proposed Architecture

### Coverage Improvement Strategy

- Improve the weighted LCOV total by adding real tests for existing production behavior, not by changing the measurement scope.
- Target the biggest weighted gaps first, because large low-coverage files move the repository total fastest.
- Prefer existing test patterns already used in the repo:
  - DOM-oriented render and interaction tests for React pages and app shell behavior
  - Bun unit tests with mocks/stubs for Node-side proxy and service code
- Allow only minimal testability refactors where current top-level side effects or tightly bundled helpers make the desired branches unreachable from tests.
- Keep behavior unchanged while raising coverage; the goal is better verification, not functional redesign.

### Coverage Hotspots To Address

#### `src/App.tsx`

- Add app-shell tests that cover:
  - initial keyboard setup and default focus scheduling
  - login state restoration from storage and nav info fetch
  - sidebar navigation and repeated selection refresh behavior
  - video playback vs live playback routing
  - cast command handling for `play` and `stop`
  - back-key handling across player, live room, login modal, non-default page, and final platform-back fallback
  - toast presentation and dismissal timing

#### `src/dev/biliProxy.ts`

- Add direct tests for:
  - cookie parsing, merging, and bridge serialization
  - request header shaping for CDN vs non-CDN upstreams
  - decompression branches
  - HLS playlist rewrite handling
  - streamed passthrough responses
  - upstream failure and local error responses

#### `webos/service/com.biliwebos.app.service/src/service.ts`

- Extend runtime and helper coverage for:
  - cookie persistence and config persistence branches
  - host validation and request-building branches
  - cast subscription bookkeeping and pending-event delivery
  - local proxy routing and forbidden/not-found/error responses
  - playlist rewrite handling and proxy passthrough branches
- If direct testing of specific logic is too expensive because of top-level startup side effects, extract only the smallest pure helpers or handler factories needed for stable unit coverage.

### CI Comparison And Gate

- Keep `tools/coverage-summary.ts` as the source of truth for weighted totals.
- Add a dedicated coverage comparison utility that:
  - reads the current run's `coverage-summary.json`
  - reads the stored `main` baseline summary
  - computes weighted `Current / Main / Delta` for all four metrics
  - identifies metrics below the `90%` gate
  - emits one structured result for both logging and PR comment generation
- Keep workflow logic thin by moving formatting and threshold decisions into the script layer rather than duplicating calculations inside `github-script`.

### `main` Baseline Source

- Use the stored summary generated from the `main` branch as the comparison baseline.
- Prefer the already-published summary data maintained by the current coverage workflow, rather than re-running the entire test suite on `main` inside the pull request job.
- If the repository continues to publish `coverage/coverage-summary.json` to the `document` branch on `main` pushes, the pull request job should fetch and read that file as its baseline source.
- If the baseline file is temporarily unavailable, the pull request comment must state that the `main` baseline is missing instead of silently inventing a comparison. Missing baseline should not masquerade as a zero delta.

### Pull Request Comment Format

- Keep the pull request comment concise and summary-only.
- Include one weighted coverage table:

`Metric | Current | Main | Delta`

- The rows are `Lines`, `Statements`, `Functions`, and `Branches`.
- `Delta` should be formatted as signed percentages such as `+1.24%` or `-0.80%`.
- When any current weighted metric is below `90%`, include a short warning section above the table that clearly says the coverage gate failed and lists the failing metric values.
- Reuse a stable HTML marker so the workflow updates one bot comment instead of creating duplicates.

## Code Changes

### Test Suite

- Add or extend tests under the existing frontend, tool, and service test directories.
- Prefer updating nearby test files first:
  - `src/App.render.test.ts` or a new focused `src/App.test.ts`
  - `src/dev/biliProxy.test.ts`
  - `webos/service/com.biliwebos.app.service/test/service-runtime.test.ts`
  - `webos/service/com.biliwebos.app.service/test/service-helpers.test.ts`
- Add new focused test files only when a hotspot becomes too large for an existing test file to stay readable.

### Coverage Utilities

- Extend or keep `tools/coverage-summary.ts` for weighted summary generation as needed, but do not split weighted calculation across multiple implementations.
- Add a comparison/gating utility in `tools/` that can be executed from CI and tested locally.
- Add tests for the new utility covering:
  - normal comparison against a valid `main` baseline
  - signed delta formatting
  - threshold pass/fail detection
  - missing baseline handling
  - explicit below-90 warning text generation

### GitHub Workflow

- Update `.github/workflows/coverage.yml` so the pull request path:
  - runs coverage
  - generates the current weighted summary
  - fetches the `main` baseline summary
  - runs the comparison/gating utility
  - uploads artifacts as before
  - updates the pull request comment with summary table plus warning state when needed
  - fails the job when the utility reports any weighted metric below `90%`
- Keep the `main` push path responsible for refreshing published baseline data and badge data.

## Testing Strategy

### Test-First Scope

- Add or update failing tests before changing production logic or CI behavior where practical.
- Start with the largest weighted hotspots so coverage moves are measurable after each batch.

### Required Verification

- Run targeted tests for each touched hotspot while iterating.
- Run the full suite with `bun test`.
- Run `bun test:coverage`.
- Regenerate `coverage/coverage-summary.json` and confirm weighted totals are `>=95%`.
- Run targeted tests for any new coverage comparison utility.
- Verify the generated pull request comment body locally from fixture data before relying on CI.

### Risk Areas

- Large app-shell tests becoming brittle if they over-couple to markup instead of behavior.
- Service-side top-level startup effects making isolated tests harder than expected.
- Drift between workflow comment rendering and gate logic if calculations are duplicated.
- Missing baseline data producing confusing pull request output if not surfaced explicitly.
- Threshold enforcement accidentally keying off per-file averages instead of weighted totals.

## Implementation Order

1. Add or strengthen tests for the biggest weighted coverage hotspots.
2. Make only the minimal production-code extractions needed to unlock those tests.
3. Re-run coverage and confirm the repository weighted totals reach `>=95%`.
4. Add the comparison/gating utility and its tests.
5. Update `.github/workflows/coverage.yml` to use the utility for comparison, PR comment rendering, and threshold enforcement.
6. Re-run tests and coverage after the workflow-related script changes.
7. Verify that the pull request comment text includes an explicit below-90 warning when fixture data falls under threshold.

## Acceptance Mapping

- "提升LCOV总覆盖率到95%以上":
  Completion requires weighted LCOV total coverage of at least `95%`.
- "覆盖率CI测试时, 如果少于90%则不允许通过":
  The pull request coverage job fails when any checked weighted metric is below `90%`.
- "追加当前和主分支的数据进行对比. 显示变化值":
  The pull request comment shows weighted `Current / Main / Delta` values for the four summary metrics.
- "数据对比时需要一目了然":
  The comment is intentionally limited to one summary table plus an explicit warning section when threshold failure occurs.
- "低于90%时也需要在PR comments中进行说明":
  The pull request comment includes a dedicated warning message listing the metrics below the gate.

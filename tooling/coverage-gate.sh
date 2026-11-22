#!/bin/sh
set -eu

cd "$(git rev-parse --show-toplevel)"
base=${1:-origin/main}
git rev-parse --verify --end-of-options "${base}^{commit}" > /dev/null

for report in coverage/full/lcov.info coverage/browser/lcov.info; do
  if [ ! -s "$report" ]; then
    echo "Missing $report. Run full Vitest and browser coverage before the gate." >&2
    exit 1
  fi
done

python3 -m venv .local/coverage-gate
.local/coverage-gate/bin/python -m pip install --disable-pip-version-check --require-hashes -r tooling/coverage-gate-requirements.txt
mkdir -p coverage/patch
status=0
.local/coverage-gate/bin/diff-cover coverage/full/lcov.info coverage/browser/lcov.info \
  --compare-branch="$base" --fail-under=90 --total-percent-float --include-untracked \
  --format markdown:coverage/patch/report.md,json:coverage/patch/report.json \
  > coverage/patch/summary.txt 2>&1 || status=$?
cat coverage/patch/summary.txt

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    printf '### Changed-line coverage gate (minimum 90%%)\n\n```text\n'
    cat coverage/patch/summary.txt
    printf '\n```\n'
  } >> "$GITHUB_STEP_SUMMARY"
fi
exit "$status"

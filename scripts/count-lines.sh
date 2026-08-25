#!/usr/bin/env bash

set -euo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly repo_root="$(cd -- "${script_dir}/.." && pwd)"

if ! command -v cloc >/dev/null 2>&1; then
  echo "cloc is required but was not found in PATH." >&2
  exit 127
fi

exec cloc \
  --exclude-dir=.git,node_modules,.next,out,dist,build,coverage,playwright-report,test-results,.auth-state,.turbo,.cache,generated \
  --not-match-f='^(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$|\.(min\.(js|css)|map)$' \
  "${repo_root}"

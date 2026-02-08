#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

if [ ! -f "${REPO_ROOT}/wrangler.toml" ]; then
  echo "wrangler.toml not found in ${REPO_ROOT}"
  exit 1
fi

wrangler deploy --config "${REPO_ROOT}/wrangler.toml" "$@"

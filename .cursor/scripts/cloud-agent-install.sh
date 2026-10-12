#!/usr/bin/env bash
# Instalacao do Cloud Agent (LF). Rode na raiz do monorepo.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"

if [[ ! -f package.json || ! -f package-lock.json ]]; then
  echo "npm ci exige package.json e package-lock.json em ${raiz}" >&2
  exit 1
fi

echo "[install] npm ci em ${raiz}"
npm ci
echo "[install] concluido"

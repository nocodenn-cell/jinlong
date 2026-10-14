#!/usr/bin/env bash
# uso: run-e2e.sh <nome-da-execucao> <args do playwright...>
name=$1; shift
cd /c/Naturecode/fastproduct/_wt-ci-repro/pdv-importados
source /c/Naturecode/fastproduct/_wt-ci-repro-tools/e2e.env
export CI=true PLAYWRIGHT_E2E_WITH_DEV=1 NODE_OPTIONS=--max-old-space-size=4096
mkdir -p /c/Naturecode/fastproduct/_wt-ci-repro-tools/out
npx playwright test --reporter=list --retries=0 --workers=2 "$@" > /c/Naturecode/fastproduct/_wt-ci-repro-tools/out/$name.log 2>&1
echo "exit=$?" >> /c/Naturecode/fastproduct/_wt-ci-repro-tools/out/$name.log

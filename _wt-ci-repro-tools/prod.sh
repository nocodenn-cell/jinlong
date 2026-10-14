#!/usr/bin/env bash
# uso: prod.sh <nome> <spec> [VAR=valor ...]  — next start (build já feito) + playwright, sem CI=true
name=$1; spec=$2; shift 2
T=/c/Naturecode/fastproduct/_wt-ci-repro-tools; OUT=$T/out
killport() { for p in $(powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -match '_wt-ci-repro.*(next|dist.server)' } | % { \$_.ProcessId }" | tr -d '\r'); do taskkill //F //T //PID $p >/dev/null 2>&1; done; sleep 2; }
killport
cd /c/Naturecode/fastproduct/_wt-ci-repro/pdv-importados
source $T/e2e.env
for kv in "$@"; do export "$kv"; done
export NODE_OPTIONS=--max-old-space-size=4096
(npx next start -p 3000 > $OUT/$name-server.log 2>&1 &)
for i in $(seq 1 40); do grep -q "Ready" $OUT/$name-server.log 2>/dev/null && break; sleep 1; done
grep -q Ready $OUT/$name-server.log || { echo "servidor não subiu"; tail -5 $OUT/$name-server.log; exit 1; }
npx playwright test $spec --project=chromium --reporter=list --retries=0 --workers=1 > $OUT/$name-pw.log 2>&1
echo "playwright exit=$?" >> $OUT/$name-pw.log
killport

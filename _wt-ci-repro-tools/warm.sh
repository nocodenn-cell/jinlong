#!/usr/bin/env bash
# uso: warm.sh <nome> <args do playwright...>  — sobe next dev, aquece / e /login, roda playwright sem CI=true (reusa o servidor)
name=$1; shift
T=/c/Naturecode/fastproduct/_wt-ci-repro-tools; OUT=$T/out
killport() { for p in $(powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -match '_wt-ci-repro.*(next|dist.server)' } | % { \$_.ProcessId }" | tr -d '\r'); do taskkill //F //T //PID $p >/dev/null 2>&1; done; sleep 2; }
killport
cd /c/Naturecode/fastproduct/_wt-ci-repro/pdv-importados
source $T/e2e.env
export NODE_OPTIONS=--max-old-space-size=4096
(npx next dev -p 3000 > $OUT/$name-server.log 2>&1 &)
for i in $(seq 1 90); do grep -q "Ready" $OUT/$name-server.log 2>/dev/null && break; sleep 1; done
grep -q Ready $OUT/$name-server.log || { echo "servidor não subiu"; exit 1; }
for r in / /login; do curl -s -o /dev/null --max-time 240 http://localhost:3000$r; done
unset CI PLAYWRIGHT_E2E_WITH_DEV
npx playwright test --reporter=list --retries=0 --workers=1 "$@" > $OUT/$name.log 2>&1
echo "exit=$?" >> $OUT/$name.log
killport

#!/usr/bin/env bash
# uso: variant.sh <nome> "<flags do next dev>" [VAR=valor ...]   (ex.: variant.sh A "" ; variant.sh B "--turbopack")
name=$1; flags=$2; shift 2
T=/c/Naturecode/fastproduct/_wt-ci-repro-tools; OUT=$T/out; mkdir -p $OUT
killport() { for p in $(powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ? { \$_.CommandLine -match '_wt-ci-repro.*(next|dist.server)' } | % { \$_.ProcessId }" | tr -d ''); do taskkill //F //T //PID $p >/dev/null 2>&1; done;  pid=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess" | tr -d '\r' | head -1); [ -n "$pid" ] && taskkill //F //T //PID $pid >/dev/null 2>&1; sleep 2; }
killport
cd /c/Naturecode/fastproduct/_wt-ci-repro/pdv-importados
source $T/e2e.env
for kv in "$@"; do export "$kv"; done
rm -f $OUT/$name-heap.csv $OUT/$name-server.log; echo "ts,elapsed_s,pid,heapUsed_mb,heapTotal_mb,heapLimit_mb,rss_mb,external_mb,role" > $OUT/$name-heap.csv
export MEMLOG_RUN=$name NODE_OPTIONS="--max-old-space-size=4096 --expose-gc --require $(cygpath -m $T/memlog.cjs)"
(npx next dev $flags -p 3000 > $OUT/$name-server.log 2>&1 &)
for i in $(seq 1 60); do grep -q "Ready" $OUT/$name-server.log 2>/dev/null && break; sleep 1; done
grep -q Ready $OUT/$name-server.log || { echo "servidor não subiu"; tail -5 $OUT/$name-server.log; exit 1; }
unset NODE_OPTIONS MEMLOG_RUN CI PLAYWRIGHT_E2E_WITH_DEV
export NODE_OPTIONS=--max-old-space-size=2048
npx playwright test ${SPEC:-e2e/_tmp-routes-memory.spec.ts} --project=chromium --reporter=list --retries=0 --workers=1 > $OUT/$name-pw.log 2>&1
echo "playwright exit=$?" >> $OUT/$name-pw.log
sleep 6; killport

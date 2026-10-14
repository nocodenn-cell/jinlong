// Preload (--require): registra heap/rss de CADA processo node a cada 2 s em out/<RUN>-heap.csv.
// Só leitura de process.memoryUsage()/v8; não altera o comportamento do app.
const fs = require('fs')
const path = require('path')
const v8 = require('v8')

const run = process.env.MEMLOG_RUN
if (run) {
  const file = path.join(process.env.MEMLOG_DIR || 'C:/Naturecode/fastproduct/_wt-ci-repro-tools/out', `${run}-heap.csv`)
  const t0 = Date.now()
  const role = (process.argv.slice(1).join(' ') || 'node').replace(/\s+/g, ' ').slice(0, 70).replace(/,/g, ';')
  const mb = (n) => Math.round(n / 1048576)
  const tick = () => {
    try {
      const m = process.memoryUsage()
      const h = v8.getHeapStatistics()
      fs.appendFileSync(
        file,
        `${new Date().toISOString().slice(11, 19)},${Math.round((Date.now() - t0) / 1000)},${process.pid},${mb(m.heapUsed)},${mb(m.heapTotal)},${mb(h.heap_size_limit)},${mb(m.rss)},${mb(m.external)},${role}\n`
      )
    } catch {}
  }
  let n = 0
  const gcTick = () => {
    if (process.env.MEMLOG_GC === '1' && typeof global.gc === 'function' && ++n % 10 === 0) {
      global.gc()
      const m = process.memoryUsage()
      fs.appendFileSync(file.replace('-heap.csv', '-retained.csv'), `${Math.round((Date.now() - t0) / 1000)},${process.pid},${mb(m.heapUsed)},${mb(m.rss)}
`)
    }
  }
  const timer = setInterval(() => { tick(); gcTick() }, 2000)
  timer.unref()
}

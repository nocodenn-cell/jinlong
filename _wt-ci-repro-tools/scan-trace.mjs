import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = path.join(os.tmpdir(), 'e2e-trace-idioma', 'resources')
const html = fs.readFileSync(path.join(dir, '0d71e472055ba60568288ddec2887dfdfb6ddd88.html'), 'utf8')
const index = html.indexOf('<h1 class="text-h2')
console.log(html.slice(Math.max(0, index - 1800), index + 200))

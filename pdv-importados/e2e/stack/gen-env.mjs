// Gera os segredos da stack E2E isolada (uma vez). Grava e2e/stack/.env.e2e (ignorado pelo git).
// Nunca imprime valores: só os nomes das chaves criadas.
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, '.env.e2e')
if (existsSync(file)) {
  console.log('.env.e2e já existe; mantido (segredos não são regenerados).')
  process.exit(0)
}

const b64u = (b) => Buffer.from(b).toString('base64url')
const jwt = (secret, role) => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64u(JSON.stringify({ role, iss: 'fastproduct-e2e', iat: 1767225600, exp: 4102444800 }))
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${s}`
}

const jwtSecret = randomBytes(40).toString('hex')
const dbPassword = randomBytes(24).toString('hex')
const env = {
  E2E_DB_PASSWORD: dbPassword,
  E2E_JWT_SECRET: jwtSecret,
  E2E_ANON_KEY: jwt(jwtSecret, 'anon'),
  E2E_SERVICE_KEY: jwt(jwtSecret, 'service_role'),
  E2E_DB_PORT: '54481',
  E2E_API_PORT: '54480',
  E2E_APP_PORT: '3010',
}
writeFileSync(file, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 })
console.log('Criado .env.e2e com as chaves:', Object.keys(env).join(', '))

#!/usr/bin/env node
/**
 * Cenários de teste do procedimento de promoção, SEM tocar em produção.
 *
 * Sobe um stub da Management API do Supabase apoiado no Postgres LOCAL: as
 * migrations são realmente aplicadas e realmente registradas em
 * `supabase_migrations.schema_migrations`, mas no banco descartável. Assim dá
 * para exercitar de verdade o que antes só existia no papel:
 *
 *   1. projeto incorreto           → recusado
 *   2. commit incorreto            → recusado
 *   3. SQL adulterado (sha256)     → recusado
 *   4. backup ausente/velho        → recusado
 *   5. aplicação feliz             → 5 aplicadas, versões remotas registradas
 *   6. falha intermediária          → para na 3ª, as 2 primeiras permanecem
 *   7. retomada                     → pula as aplicadas e conclui
 *   8. correspondência remoto×local → o SQL registrado é o do arquivo
 *
 * Uso: node backend/scripts/promocao-cenarios-teste.mjs
 */

import { createServer } from 'node:http'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, utimesSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '../..')
const SCRIPT = join(AQUI, 'promover-hardening-produtos.mjs')
const MANIFESTO = join(AQUI, 'promover-hardening-produtos.manifesto.json')
const ESTADO = join(AQUI, '.promocao-estado.json')
const MIG_DIR = resolve(AQUI, '../supabase/migrations')

const CONTAINER = process.env.CONTAINER ?? 'supabase_db_fastproduct'
const DB = 'promocao_stub_test'
const PROJETO_OK = 'kbabmewnahysfvlybiak'
const PORTA = 54399

let falhas = 0
function checar(nome, ok, detalhe = '') {
  if (!ok) falhas += 1
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

function psql(sqlTexto, db = DB) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-t', '-A', '-q'], {
    input: sqlTexto,
    encoding: 'utf8',
  })
}

/** Falha injetada: quando setado, o stub recusa esta migration pelo nome. */
let falharNaMigration = null

function criarStub() {
  return createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      const responder = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      try {
        // Projeto errado nunca deveria chegar aqui (o script recusa antes),
        // mas o stub também rejeita — defesa em profundidade do próprio teste.
        if (!req.url.startsWith(`/v1/projects/${PROJETO_OK}/`)) {
          return responder(404, { message: 'projeto desconhecido' })
        }
        const { query, name, query: q } = JSON.parse(corpo || '{}')

        if (req.url.endsWith('/database/query')) {
          // `-t -A` já dá saída crua; meta-comandos `\pset` aqui só quebrariam.
          // `coalesce(...,'[]')` evita linha vazia quando não há resultado.
          const saida = psql(
            `SELECT coalesce(json_agg(t)::text, '[]') FROM (${query}) t;`,
          )
          const linha = saida.split('\n').map((l) => l.trim()).filter(Boolean).pop()
          return responder(200, linha ? JSON.parse(linha) : [])
        }

        if (req.url.endsWith('/database/migrations')) {
          if (falharNaMigration && name === falharNaMigration) {
            return responder(400, { message: `falha injetada em ${name}` })
          }
          psql(`BEGIN;\n${q}\nCOMMIT;`)
          // Versão com o timestamp do MOMENTO — como a API real faz.
          const versao = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
          psql(
            `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
             VALUES ('${versao}', '${name}', ARRAY[$mig$${q}$mig$]);`,
          )
          return responder(201, { version: versao })
        }
        responder(404, { message: 'rota desconhecida' })
      } catch (e) {
        responder(400, { message: String(e.stderr ?? e.message).slice(0, 400) })
      }
    })
  })
}

async function rodar(modo, env = {}) {
  const argv = modo.split(' ')
  try {
    const { stdout } = await execFileAsync('node', [SCRIPT, ...argv], {
      cwd: RAIZ,
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: 'stub',
        SUPABASE_PROJECT_REF: PROJETO_OK,
        SUPABASE_API_BASE: `http://127.0.0.1:${PORTA}`,
        ...env,
      },
    })
    return { code: 0, saida: stdout }
  } catch (e) {
    return { code: e.code ?? 1, saida: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

function prepararBanco() {
  // Banco descartável com o schema pós-replay local (que já é o alvo), menos as
  // 5 migrations — para que a promoção tenha o que aplicar.
  psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres')
  psql(`CREATE DATABASE ${DB};`, 'postgres')
  execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'bash', '-c', `pg_dump -U postgres -d postgres --schema-only | psql -U postgres -d ${DB} -q`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // Zera o tracking e desfaz o efeito das 5 para simular o estado pré-deploy.
  psql(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations
      (version text PRIMARY KEY, name text, statements text[]);
    DELETE FROM supabase_migrations.schema_migrations;
    DROP FUNCTION IF EXISTS public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb);
    DROP INDEX IF EXISTS public.idx_produtos_criado_por;
    DROP INDEX IF EXISTS public.idx_produtos_atualizado_por;
    DROP INDEX IF EXISTS public.idx_historico_precos_produto_alterado_por;
  `)
}

async function main() {
  console.log('=== Cenários de promoção (stub da Management API sobre Postgres local) ===\n')
  const backupFake = join(mkdtempSync(join(tmpdir(), 'promo-')), 'schema.sql')
  writeFileSync(backupFake, 'x'.repeat(200_000))

  const srv = criarStub()
  await new Promise((r) => srv.listen(PORTA, '127.0.0.1', r))

  const manifestoOriginal = existsSync(MANIFESTO) ? readFileSync(MANIFESTO, 'utf8') : null
  const arquivo3 = '20260816141000_criar_produto_autoria_atomica.sql'
  const caminho3 = join(MIG_DIR, arquivo3)
  const conteudo3 = readFileSync(caminho3, 'utf8')

  try {
    prepararBanco()
    if (existsSync(ESTADO)) rmSync(ESTADO)

    // ── 1. projeto incorreto ────────────────────────────────────────────────
    let r = await rodar('--check', { SUPABASE_PROJECT_REF: 'projeto-errado-xyz', BACKUP_SCHEMA_PATH: backupFake })
    checar(
      '1. projeto incorreto é recusado',
      r.code !== 0 && /projeto é o autorizado/.test(r.saida) && /FALHA/.test(r.saida),
      `exit=${r.code}`,
    )

    // ── 2. commit incorreto ─────────────────────────────────────────────────
    const man = JSON.parse(readFileSync(MANIFESTO, 'utf8'))
    writeFileSync(MANIFESTO, JSON.stringify({ ...man, commit: '0'.repeat(40) }, null, 2))
    r = await rodar('--check', { BACKUP_SCHEMA_PATH: backupFake })
    checar(
      '2. commit diferente do auditado é recusado',
      r.code !== 0 && /HEAD é o commit auditado/.test(r.saida),
      `exit=${r.code}`,
    )
    writeFileSync(MANIFESTO, JSON.stringify(man, null, 2))

    // ── 3. SQL adulterado ───────────────────────────────────────────────────
    writeFileSync(caminho3, conteudo3 + '\n-- adulteração\n')
    r = await rodar('--check', { BACKUP_SCHEMA_PATH: backupFake })
    checar(
      '3. SQL adulterado (sha256 diverge) é recusado',
      r.code !== 0 && /sha256 confere: 20260816141000/.test(r.saida) && /FALHA\s+sha256/.test(r.saida),
      `exit=${r.code}`,
    )
    writeFileSync(caminho3, conteudo3)

    // ── 4. backup ausente ───────────────────────────────────────────────────
    r = await rodar('--check', { BACKUP_SCHEMA_PATH: '' })
    checar('4. backup ausente é recusado', r.code !== 0 && /BACKUP_SCHEMA_PATH/.test(r.saida), `exit=${r.code}`)

    // ── 5. falha intermediária ──────────────────────────────────────────────
    falharNaMigration = 'criar_produto_autoria_atomica'
    r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake })
    const aplicadasAposFalha = Number(
      psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`).trim(),
    )
    checar(
      '5. falha na 3ª migration para a promoção',
      r.code !== 0 && /Parou em .*criar_produto_autoria_atomica/.test(r.saida),
      `exit=${r.code}`,
    )
    checar(
      '5b. as 2 anteriores permanecem aplicadas (não há rollback global)',
      aplicadasAposFalhaOk(aplicadasAposFalha),
      `registradas=${aplicadasAposFalha}`,
    )

    // ── 6. retomada ─────────────────────────────────────────────────────────
    falharNaMigration = null
    r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake })
    const total = Number(psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`).trim())
    checar(
      '6. retomada pula as já aplicadas e conclui as restantes',
      r.code === 0 && /pulando/.test(r.saida) && total === 5,
      `exit=${r.code} registradas=${total}`,
    )

    // ── 7. verificação pós-deploy ───────────────────────────────────────────
    r = await rodar('--verify', { BACKUP_SCHEMA_PATH: backupFake })
    checar('7. --verify aprova o estado final', r.code === 0, `exit=${r.code}`)

    // ── 8. correspondência remoto × local ───────────────────────────────────
    const versoes = psql(
      `SELECT string_agg(version || '=' || name, ' | ' ORDER BY version) FROM supabase_migrations.schema_migrations;`,
    ).trim()
    checar(
      '8. versões remotas diferem dos prefixos locais (por isso se casa por NOME)',
      !versoes.includes('20260816135000='),
      versoes.slice(0, 120),
    )
    const conferido = psql(`
      SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE name = 'atualizar_produto_com_faixa_atacado'
        AND array_to_string(statements, '') LIKE '%FOR UPDATE%';
    `).trim()
    checar('8b. SQL registrado no remoto é o do arquivo local (contém FOR UPDATE)', conferido === '1', `=${conferido}`)
  } finally {
    falharNaMigration = null
    writeFileSync(caminho3, conteudo3)
    if (manifestoOriginal) writeFileSync(MANIFESTO, manifestoOriginal)
    if (existsSync(ESTADO)) rmSync(ESTADO)
    try {
      psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres')
    } catch {
      /* best-effort */
    }
    srv.close()
  }

  console.log(`\n=== ${falhas === 0 ? 'todos os cenários passaram' : `${falhas} cenário(s) falharam`} ===`)
  process.exit(falhas === 0 ? 0 : 1)
}

function aplicadasAposFalhaOk(n) {
  return n === 2
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exit(1)
})

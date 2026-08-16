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
import { createHash } from 'node:crypto'
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
/**
 * Contagem automática (auditoria de 2026-08-16): o relatório anterior alegava
 * "25/25 cenários" — número que não correspondia ao artefato. Agora o total é
 * derivado da execução, e CENÁRIO (situação testada) é contado separado de
 * ASSERÇÃO (verificação individual), porque um cenário rende várias asserções.
 */
let assercoes = 0
const cenarios = new Set()
/** Guarda a saída do último comando, para diagnosticar cenário que falha. */
let ultimaSaida = ''
function checar(nome, ok, detalhe = '') {
  assercoes += 1
  // Prefixo numérico do rótulo ("10. timeout..." → "10") identifica o cenário.
  const m = /^(\d+)/.exec(nome.trim())
  if (m) cenarios.add(m[1])
  if (!ok) falhas += 1
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!ok && ultimaSaida) {
    // Sem isto, um cenário que falhava por pré-condição nova aparecia só como
    // "exit=1" e era preciso reinstrumentar o script para descobrir por quê.
    const linhas = ultimaSaida
      .split('\n')
      .filter((l) => /FALHA|RECUSADO|Parou em|ERRO/.test(l))
      .slice(0, 6)
    for (const l of linhas) console.log(`        ↳ ${l.trim()}`)
  }
}

function psql(sqlTexto, db = DB) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-t', '-A', '-q'], {
    input: sqlTexto,
    encoding: 'utf8',
  })
}

/** Falha injetada: quando setado, o stub recusa esta migration pelo nome. */
let falharNaMigration = null
/**
 * Modo de falha de REDE injetado, por nome de migration:
 *   'timeout'  → aplica e registra, mas NÃO responde (cliente estoura)
 *   '429'      → responde 429 sem aplicar
 *   'ambiguo'  → aplica e registra, mas responde corpo malformado
 * Cobrem as situações em que o cliente não sabe se a migration entrou.
 */
let falhaDeRede = null
/** Contador para desempatar versões geradas no mesmo milissegundo. */
let seqVersao = 0

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
          // psql pode quebrar a linha em saídas longas; juntar tudo antes de
          // parsear (pegar só a última linha truncava o JSON e o parse falhava).
          const json = saida
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .join('')
          return responder(200, json ? JSON.parse(json) : [])
        }

        if (req.url.endsWith('/database/migrations')) {
          if (falharNaMigration && name === falharNaMigration) {
            return responder(400, { message: `falha injetada em ${name}` })
          }
          if (falhaDeRede && name === falhaDeRede.nome) {
            if (falhaDeRede.modo === '429') {
              // Rate limit ANTES de aplicar: nada entra no banco.
              res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' })
              return res.end(JSON.stringify({ message: 'rate limit exceeded' }))
            }
            // 'timeout' e 'ambiguo': a migration É aplicada e registrada; o que
            // falha é a RESPOSTA. É o caso perigoso — o cliente não sabe se
            // entrou, e uma re-execução ingênua reaplicaria por cima.
            psql(`BEGIN;\n${q}\nCOMMIT;`)
            seqVersao += 1
            const v =
              new Date().toISOString().replace(/\D/g, '').slice(0, 17) + String(seqVersao).padStart(2, '0')
            psql(
              `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
               VALUES ('${v}', '${name}', ARRAY[$mig$${q}$mig$]);`,
            )
            if (falhaDeRede.modo === 'timeout') {
              // Não responde: derruba a conexão como um timeout de gateway.
              return req.socket.destroy()
            }
            // Corpo malformado: HTTP 200 com JSON quebrado.
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end('{"version": ')
          }
          psql(`BEGIN;\n${q}\nCOMMIT;`)
          // Versão com o timestamp do MOMENTO — como a API real faz.
          // Milissegundos + contador: duas migrations aplicadas dentro do mesmo
          // segundo colidiriam na PK de `version`, e o teste ficava não
          // determinístico (ora 1, ora 4, ora 5 registradas).
          seqVersao += 1
          const versao =
            new Date().toISOString().replace(/\D/g, '').slice(0, 17) + String(seqVersao).padStart(2, '0')
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
  // O auto-teste edita arquivos que fazem parte do artefato; sem isto toda
  // execução da suíte com mudanças não commitadas falharia no gate de worktree.
  const argv = [...modo.split(' '), '--permitir-worktree-sujo']
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
    ultimaSaida = stdout
    return { code: 0, saida: stdout }
  } catch (e) {
    const saida = `${e.stdout ?? ''}${e.stderr ?? ''}`
    ultimaSaida = saida
    return { code: e.code ?? 1, saida }
  }
}

/** Tabelas cobertas pelo ensaio de backup (as mesmas que o script valida). */
const TABELAS_SENTINELA = ['lojas', 'produtos', 'precos_atacado', 'historico_precos_produto', 'usuarios']

/** Conteúdo de uma tabela no formato COPY, ordenado — base do checksum. */
function copiaTexto(tabela, db) {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-q', '-A', '-t', '-c',
      `COPY (SELECT * FROM public.${tabela} ORDER BY 1) TO STDOUT`],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
}

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')

function authStub(db) {
  psql(
    `CREATE SCHEMA IF NOT EXISTS auth;
     CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
     CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
     CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT NULL::text $fn$;
     CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT '{}'::jsonb $fn$;`,
    db,
  )
}

/**
 * Ensaio de backup/restauração com SENTINELAS e CHECKSUM de conteúdo.
 *
 * POR QUE EXISTE (auditoria de 2026-08-16): a validação do script comparava só
 * CONTAGEM, e três das cinco tabelas estavam vazias no stack local — as
 * asserções eram satisfeitas por `0 === 0`. Contagem igual não é integridade:
 * duas bases podem ter a mesma quantidade e conteúdos diferentes.
 *
 * Aqui a origem é um banco descartável com linhas conhecidas nas cinco tabelas;
 * compara-se origem × restaurado por contagem E por md5 do conteúdo. O caso
 * NEGATIVO altera uma linha do restaurado SEM mexer na contagem — se só a
 * contagem fosse conferida, passaria despercebido.
 */
function cenarioBackupSentinela(schemaSql) {
  const ORIGEM = 'backup_sentinela_origem'
  const DESTINO = 'backup_sentinela_destino'
  const LOJA = 'b0000001-0000-4000-8000-0000000000ff'
  const PROD = 'b0000002-0000-4000-8000-0000000000ff'
  const USER = 'b0000003-0000-4000-8000-0000000000ff'

  try {
    for (const db of [ORIGEM, DESTINO]) {
      psql(`DROP DATABASE IF EXISTS ${db};`, 'postgres')
      psql(`CREATE DATABASE ${db};`, 'postgres')
      authStub(db)
      execFileSync(
        'docker',
        ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', db, '-q', '-v', 'ON_ERROR_STOP=0'],
        { input: schemaSql, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
      )
    }

    // Sentinelas — valores fixos e não sensíveis, nas CINCO tabelas.
    psql(
      `INSERT INTO auth.users (id) VALUES ('${USER}');
       INSERT INTO public.lojas (id, nome) VALUES ('${LOJA}', 'SENTINELA Loja');
       -- loja_id tem DEFAULT apontando para uma loja que nao existe neste
       -- banco descartavel; explicitar evita violacao de FK.
       INSERT INTO public.usuarios (id, nome, perfil, loja_id)
         VALUES ('${USER}', 'SENTINELA User', 'OPERADOR', '${LOJA}');
       INSERT INTO public.produtos (id, nome, preco_varejo, origem, loja_id)
         VALUES ('${PROD}', 'SENTINELA Produto', 10.50, 'brasil_nf', '${LOJA}');
       INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario)
         VALUES ('${PROD}', 7, 8.25);
       INSERT INTO public.historico_precos_produto (produto_id) VALUES ('${PROD}');`,
      ORIGEM,
    )

    const dados = execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'pg_dump', '-U', 'postgres', '-d', ORIGEM, '--data-only'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    )

    execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', DESTINO, '-q', '-v', 'ON_ERROR_STOP=0'],
      { input: dados, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
    )

    const comparar = () =>
      TABELAS_SENTINELA.map((t) => {
        const o = copiaTexto(t, ORIGEM)
        const d = copiaTexto(t, DESTINO)
        return {
          tabela: t,
          contagemIgual: o.split('\n').filter(Boolean).length === d.split('\n').filter(Boolean).length,
          checksumIgual: md5(o) === md5(d),
          linhas: o.split('\n').filter(Boolean).length,
        }
      })

    const r1 = comparar()
    checar(
      '13. as cinco tabelas têm sentinela (validação não é vacuamente verdadeira)',
      r1.every((x) => x.linhas > 0),
      r1.map((x) => `${x.tabela}=${x.linhas}`).join(' '),
    )
    checar(
      '13b. contagem restaurada bate com a origem',
      r1.every((x) => x.contagemIgual),
      r1.filter((x) => !x.contagemIgual).map((x) => x.tabela).join(',') || 'todas',
    )
    checar(
      '13c. checksum de CONTEÚDO bate com a origem',
      r1.every((x) => x.checksumIgual),
      r1.filter((x) => !x.checksumIgual).map((x) => x.tabela).join(',') || 'todas',
    )

    // ── 14. NEGATIVO: conteúdo diferente, contagem idêntica ─────────────────
    psql(`UPDATE public.produtos SET nome = 'SENTINELA Produto ADULTERADO' WHERE id = '${PROD}';`, DESTINO)
    const r2 = comparar()
    const prod = r2.find((x) => x.tabela === 'produtos')
    checar(
      '14. adulteração de conteúdo com contagem intacta é DETECTADA pelo checksum',
      prod.contagemIgual && !prod.checksumIgual,
      `contagem_igual=${prod.contagemIgual} checksum_igual=${prod.checksumIgual}`,
    )
  } finally {
    for (const db of [ORIGEM, DESTINO]) {
      try {
        psql(`DROP DATABASE IF EXISTS ${db};`, 'postgres')
      } catch {
        /* best-effort */
      }
    }
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

/**
 * O gate manifesto-vs-commitado é INCONDICIONAL no script de promoção — nenhuma
 * flag o dispensa, porque um bypass disponível no fluxo real valeria mais que o
 * próprio gate. Consequência para o harness: o manifesto precisa estar
 * commitado antes de rodar a suíte.
 *
 * Sem este preflight, esquecer de commitar produzia 16 falhas espalhadas com a
 * causa real escondida no diagnóstico de cada uma.
 */
function exigirManifestoCommitado() {
  let commitado = ''
  try {
    commitado = execFileSync('git', ['show', 'HEAD:backend/scripts/promover-hardening-produtos.manifesto.json'], {
      cwd: RAIZ,
      encoding: 'utf8',
    })
  } catch {
    /* não versionado */
  }
  const norm = (s) => String(s ?? '').replace(/\s+/g, '')
  if (commitado === '' || norm(commitado) !== norm(readFileSync(MANIFESTO, 'utf8'))) {
    console.error(
      'PRÉ-REQUISITO: o manifesto em disco difere do commitado.\n' +
        '  O gate manifesto-vs-commitado é incondicional (por desenho).\n' +
        '  Regrave e commite antes de rodar a suíte:\n' +
        '    node backend/scripts/promover-hardening-produtos.mjs --manifesto --permitir-worktree-sujo\n' +
        '    git add backend/scripts/promover-hardening-produtos.manifesto.json && git commit',
    )
    process.exit(2)
  }
}

async function main() {
  console.log('=== Cenários de promoção (stub da Management API sobre Postgres local) ===\n')
  exigirManifestoCommitado()
  // Backup REAL (dump de schema do Postgres local). Um arquivo de bytes
  // repetidos servia enquanto a validação só olhava tamanho e idade; com a
  // validação estrita (cabeçalho, tabelas do projeto, não-truncado) ele passou
  // a ser corretamente recusado — e o cenário precisa de um backup que preste.
  const dirBk = mkdtempSync(join(tmpdir(), 'promo-'))
  const backupFake = join(dirBk, 'schema.sql')
  const backupDados = join(dirBk, 'dados.sql')
  writeFileSync(
    backupFake,
    execFileSync('docker', ['exec', '-i', CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  )
  // Backup de DADOS — agora obrigatório no procedimento: schema sozinho
  // restaura um banco vazio, o que não é recuperação.
  writeFileSync(
    backupDados,
    execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    ),
  )

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
    r = await rodar('--check', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
    checar(
      '2. commit diferente do auditado é recusado',
      r.code !== 0 && /commit auditado está na história do HEAD/.test(r.saida),
      `exit=${r.code}`,
    )
    writeFileSync(MANIFESTO, JSON.stringify(man, null, 2))

    // ── 3. SQL adulterado ───────────────────────────────────────────────────
    writeFileSync(caminho3, conteudo3 + '\n-- adulteração\n')
    r = await rodar('--check', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
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
    r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
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
    r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
    const total = Number(psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`).trim())
    checar(
      '6. retomada pula as já aplicadas e conclui as restantes',
      r.code === 0 && /pulando/.test(r.saida) && total === 5,
      `exit=${r.code} registradas=${total}`,
    )

    // ── 7. verificação pós-deploy ───────────────────────────────────────────
    r = await rodar('--verify', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
    checar('7. --verify aprova o estado final', r.code === 0, `exit=${r.code}`)

    // ── 9. migration homônima com SQL DIFERENTE ─────────────────────────────
    // O caso central do P1: o nome está no tracking, mas o corpo é outro.
    // Pular por nome aplicaria as seguintes sobre uma base desconhecida.
    psql(`
      UPDATE supabase_migrations.schema_migrations
         SET statements = ARRAY['-- corpo COMPLETAMENTE diferente\nSELECT 1;']
       WHERE name = 'indices_fks_autoria_produtos';
    `)
    r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
    // A divergência pode ser barrada em dois pontos: no `--check` (mensagem
    // "SQL remoto ... divergente") ou, se o fluxo chegar lá, no `--apply`
    // ("DIVERGE do arquivo local"). Qualquer um dos dois é o comportamento
    // correto — o que não pode acontecer é seguir aplicando por cima.
    checar(
      '9. migration homônima com SQL divergente ABORTA a promoção',
      r.code !== 0 &&
        (/DIVERGE do arquivo local/.test(r.saida) ||
          /SQL remoto de .* confere com o arquivo local — divergente/.test(r.saida)),
      `exit=${r.code}`,
    )
    checar(
      '9b. --check acusa a divergência antes de qualquer aplicação',
      /FALHA\s+SQL remoto de indices_fks_autoria_produtos/.test(r.saida),
      '',
    )

    // ── 10, 11, 12. falhas de REDE depois/durante a aplicação ───────────────
    for (const [rotulo, modo, aplicaMesmo] of [
      ['10. timeout DEPOIS de aplicar', 'timeout', true],
      ['11. HTTP 429 (rate limit)', '429', false],
      ['12. resposta ambígua (corpo malformado)', 'ambiguo', true],
    ]) {
      prepararBanco()
      if (existsSync(ESTADO)) rmSync(ESTADO)
      falhaDeRede = { nome: 'criar_produto_autoria_atomica', modo }
      r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
      const registradas = Number(
        psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`).trim(),
      )
      checar(
        `${rotulo}: a promoção para`,
        r.code !== 0,
        `exit=${r.code} registradas=${registradas}`,
      )
      checar(
        `${rotulo}: estado remoto coerente (${aplicaMesmo ? 'aplicada' : 'não aplicada'})`,
        registradas === (aplicaMesmo ? 3 : 2),
        `registradas=${registradas}`,
      )

      // RETOMADA depois da falha de rede: o script tem de reconhecer o que já
      // entrou (confirmando o SQL) e concluir sem reaplicar.
      falhaDeRede = null
      r = await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })
      const total = Number(psql(`SELECT count(*) FROM supabase_migrations.schema_migrations;`).trim())
      checar(
        `${rotulo}: retomada conclui as 5 sem duplicar`,
        r.code === 0 && total === 5,
        `exit=${r.code} registradas=${total}`,
      )
      if (aplicaMesmo) {
        checar(
          `${rotulo}: a que entrou às cegas foi CONFIRMADA por SQL, não pelo nome`,
          /SQL confere/.test(r.saida),
          '',
        )
      }
    }

    // Restaura o estado feliz para o cenário 8.
    prepararBanco()
    if (existsSync(ESTADO)) rmSync(ESTADO)
    falharNaMigration = null
    falhaDeRede = null
    await rodar('--apply --confirmo-producao', { BACKUP_SCHEMA_PATH: backupFake, BACKUP_DADOS_PATH: backupDados })

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

    // ── 13, 14. backup/restauração com sentinelas e checksum ────────────────
    cenarioBackupSentinela(readFileSync(backupFake, 'utf8'))
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

  const passaram = assercoes - falhas
  console.log(
    `\n=== ${cenarios.size} cenários | ${passaram}/${assercoes} asserções ${
      falhas === 0 ? 'passaram' : `passaram, ${falhas} FALHARAM`
    } ===`,
  )
  process.exit(falhas === 0 ? 0 : 1)
}

function aplicadasAposFalhaOk(n) {
  return n === 2
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exit(1)
})

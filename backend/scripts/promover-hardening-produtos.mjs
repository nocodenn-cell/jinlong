#!/usr/bin/env node
/**
 * Promoção SELETIVA e AUDITÁVEL das cinco migrations do hardening de produtos.
 *
 * POR QUE EXISTE: `supabase db push` aplicaria também as ~25 migrations do lote
 * de comissões/pagamentos que estão no diretório e fora do tracking remoto —
 * fora do escopo autorizado. E `db push --dry-run` sequer roda (o tracking
 * remoto tem versões sem arquivo local; a CLI sugere reescrever o histórico, o
 * que está vetado).
 *
 * GARANTIAS DE INTEGRIDADE (adicionadas após auditoria de 2026-08-16 — antes o
 * script tinha a lista certa, mas não provava QUE SQL estava aplicando):
 *   - projeto: só o ref declarado em PROJETO_ESPERADO;
 *   - commit: HEAD tem de ser o commit auditado (MANIFESTO.commit);
 *   - worktree: os cinco arquivos não podem ter modificação não commitada;
 *   - conteúdo: SHA-256 de cada arquivo conferido contra o manifesto;
 *   - backup: exige arquivo de dump recente e não-vazio;
 *   - tracking: consulta o remoto e pula o que já foi aplicado (retomada);
 *   - registro: grava o mapeamento nome→versão remota, porque a Management API
 *     atribui o SEU próprio timestamp, diferente do prefixo local — verificar
 *     por número local nunca casaria.
 *
 * Modos:
 *   --check     pré-condições (leitura apenas)
 *   --plan      imprime a fila e os hashes, sem executar
 *   --apply     aplica (exige --confirmo-producao); retomável
 *   --verify    confere o estado pós-deploy
 *   --manifesto regrava MANIFESTO.json a partir do HEAD atual (uso do autor)
 *
 * Ambiente: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF.
 * Para exercitar sem produção: SUPABASE_API_BASE aponta para um stub local.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '../..')
const MIG_DIR = resolve(AQUI, '../supabase/migrations')
const MANIFESTO_PATH = join(AQUI, 'promover-hardening-produtos.manifesto.json')
const ESTADO_PATH = join(AQUI, '.promocao-estado.json')

/** Projeto autorizado. Qualquer outro ref é recusado. */
const PROJETO_ESPERADO = 'kbabmewnahysfvlybiak'

/** Lista FECHADA. Nada fora daqui é lido ou aplicado, em nenhum modo. */
const MIGRATIONS = [
  '20260816135000_reconcilia_produtos_codigo_interno.sql',
  '20260816140000_rls_produtos_historico_isolamento_por_loja.sql',
  '20260816141000_criar_produto_autoria_atomica.sql',
  '20260816142000_indices_fks_autoria_produtos.sql',
  '20260816143000_atualizar_produto_com_faixa_atacado.sql',
]

const PROIBIDOS = /comiss|commission|pagamento|payment|ap_payments|ar_receipts/i

/** Idade máxima do backup, em horas. */
const BACKUP_MAX_HORAS = 24

const args = new Set(process.argv.slice(2))
const MODO = args.has('--manifesto')
  ? 'manifesto'
  : args.has('--apply')
    ? 'apply'
    : args.has('--verify')
      ? 'verify'
      : args.has('--plan')
        ? 'plan'
        : 'check'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? ''
const PROJECT = process.env.SUPABASE_PROJECT_REF ?? ''
const API_BASE = process.env.SUPABASE_API_BASE ?? 'https://api.supabase.com'
const BACKUP = process.env.BACKUP_SCHEMA_PATH ?? ''

let falhas = 0
function checar(nome, ok, detalhe = '') {
  if (!ok) falhas += 1
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  return ok
}

function nomeMigrationSeguro(nome) {
  if (!MIGRATIONS.includes(nome)) throw new Error(`fora da lista fechada: ${nome}`)
  if (nome.includes('..') || nome.includes('/') || nome.includes('\\')) {
    throw new Error(`nome inválido: ${nome}`)
  }
  return nome
}

function lerMigration(nome) {
  nomeMigrationSeguro(nome)
  const caminho = join(MIG_DIR, nome)
  if (!existsSync(caminho)) throw new Error(`migration não encontrada: ${caminho}`)
  const sql = readFileSync(caminho, 'utf8')
  const ddl = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
  if (PROIBIDOS.test(ddl)) {
    throw new Error(`RECUSADO: o DDL de ${nome} referencia objetos de comissões/pagamentos`)
  }
  return sql
}

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex')

function git(...argv) {
  return execFileSync('git', argv, { cwd: RAIZ, encoding: 'utf8' }).trim()
}

function lerManifesto() {
  if (!existsSync(MANIFESTO_PATH)) {
    throw new Error(`manifesto ausente: ${MANIFESTO_PATH} (gere com --manifesto)`)
  }
  return JSON.parse(readFileSync(MANIFESTO_PATH, 'utf8'))
}

function lerEstado() {
  if (!existsSync(ESTADO_PATH)) return { aplicadas: {} }
  return JSON.parse(readFileSync(ESTADO_PATH, 'utf8'))
}

function gravarEstado(estado) {
  writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2) + '\n')
}

async function api(caminho, opts = {}) {
  if (!TOKEN || !PROJECT) throw new Error('defina SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF')
  const r = await fetch(`${API_BASE}/v1/projects/${PROJECT}${caminho}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`API ${caminho}: ${r.status} ${texto.slice(0, 300)}`)
  return texto ? JSON.parse(texto) : null
}

const sql = (query) =>
  api('/database/query', { method: 'POST', body: JSON.stringify({ query }) })

/**
 * Tracking remoto indexado por NOME, não por versão: `apply_migration` grava a
 * versão com o timestamp do MOMENTO DA APLICAÇÃO, não o prefixo do arquivo.
 * Procurar por `20260816135000` nunca casaria.
 */
async function migrationsRemotas() {
  const linhas = await sql(
    `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`,
  )
  const porNome = new Map()
  for (const l of linhas ?? []) if (l.name) porNome.set(l.name, l.version)
  return porNome
}

const nomeRemoto = (arquivo) => arquivo.replace(/^\d+_/, '').replace(/\.sql$/, '')

function gerarManifesto() {
  const commit = git('rev-parse', 'HEAD')
  const migrations = MIGRATIONS.map((nome) => ({
    arquivo: nome,
    nome_remoto: nomeRemoto(nome),
    sha256: sha256(lerMigration(nome)),
  }))
  const manifesto = { projeto: PROJETO_ESPERADO, commit, migrations }
  writeFileSync(MANIFESTO_PATH, JSON.stringify(manifesto, null, 2) + '\n')
  console.log(`manifesto gravado para o commit ${commit}:`)
  for (const m of migrations) console.log(`  ${m.arquivo}\n    sha256=${m.sha256}`)
}

function verificarIntegridadeLocal(manifesto) {
  checar(
    `projeto é o autorizado (${PROJETO_ESPERADO})`,
    PROJECT === PROJETO_ESPERADO,
    `SUPABASE_PROJECT_REF=${PROJECT || '(vazio)'}`,
  )
  checar(
    'manifesto declara o mesmo projeto',
    manifesto.projeto === PROJETO_ESPERADO,
    `manifesto.projeto=${manifesto.projeto}`,
  )

  let head = ''
  try {
    head = git('rev-parse', 'HEAD')
  } catch {
    /* fora de repo git */
  }
  checar(
    'HEAD é o commit auditado do manifesto',
    head === manifesto.commit,
    `HEAD=${head.slice(0, 8)} manifesto=${String(manifesto.commit).slice(0, 8)}`,
  )

  let sujos = ''
  try {
    sujos = git('status', '--porcelain', '--', ...MIGRATIONS.map((m) => `backend/supabase/migrations/${m}`))
  } catch {
    /* idem */
  }
  checar('worktree limpo para as 5 migrations', sujos === '', sujos || 'sem modificações')

  for (const m of manifesto.migrations) {
    const atual = sha256(lerMigration(m.arquivo))
    checar(
      `sha256 confere: ${m.arquivo}`,
      atual === m.sha256,
      atual === m.sha256 ? atual.slice(0, 16) : `esperado=${m.sha256.slice(0, 16)} atual=${atual.slice(0, 16)}`,
    )
  }

  if (BACKUP) {
    const existe = existsSync(BACKUP)
    const st = existe ? statSync(BACKUP) : null
    const horas = st ? (Date.now() - st.mtimeMs) / 3_600_000 : Infinity
    checar(
      'backup existe, não é vazio e é recente',
      existe && st.size > 100_000 && horas < BACKUP_MAX_HORAS,
      existe ? `${st.size} bytes, ${horas.toFixed(1)}h` : 'arquivo não encontrado',
    )
  } else {
    checar('BACKUP_SCHEMA_PATH definido (projeto free não tem backup automático)', false, 'variável ausente')
  }
}

async function check() {
  console.log('=== Pré-condições ===')
  const manifesto = lerManifesto()
  verificarIntegridadeLocal(manifesto)

  const remotas = await migrationsRemotas()
  for (const m of manifesto.migrations) {
    const ja = remotas.has(m.nome_remoto)
    checar(
      `${m.nome_remoto} ainda não aplicada`,
      !ja,
      ja ? `já registrada como versão ${remotas.get(m.nome_remoto)}` : '',
    )
  }

  const r = await sql(`
    SELECT
      (SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS ret,
      (SELECT numeric_precision || ',' || numeric_scale FROM information_schema.columns
        WHERE table_name='produtos' AND column_name='preco_custo_medio') AS precisao
  `)
  const est = r?.[0] ?? {}
  const nCols = (String(est.ret ?? '').match(/,/g) ?? []).length + 1
  checar('schema de produção ainda casa com o clone validado (RPC 17 colunas)', nCols === 17, `cols=${nCols}`)
  checar('preco_custo_medio 10,2 em produção', est.precisao === '10,2', `precisao=${est.precisao}`)

  console.log(falhas === 0 ? '\nPré-condições OK.' : `\n${falhas} pré-condição(ões) reprovadas — NÃO prosseguir.`)
  return falhas === 0
}

function plan() {
  const manifesto = lerManifesto()
  console.log('=== Fila de promoção (nada será executado) ===')
  console.log(`projeto autorizado: ${PROJETO_ESPERADO}`)
  console.log(`commit auditado:    ${manifesto.commit}`)
  manifesto.migrations.forEach((m, i) => {
    const atual = sha256(lerMigration(m.arquivo))
    const ok = atual === m.sha256 ? 'confere' : '*** DIVERGENTE ***'
    console.log(`${i + 1}. ${m.arquivo}`)
    console.log(`   nome remoto = ${m.nome_remoto}`)
    console.log(`   sha256      = ${atual}  (${ok})`)
  })
  console.log(`\nTotal: ${MIGRATIONS.length}. Nenhuma outra será tocada.`)
  console.log('Para aplicar: --apply --confirmo-producao')
}

async function apply() {
  if (!args.has('--confirmo-producao')) {
    console.error('RECUSADO: --apply exige também --confirmo-producao')
    process.exit(2)
  }
  const manifesto = lerManifesto()
  if (!(await check())) {
    // `check` já reprova o que estiver aplicado; numa RETOMADA isso é esperado,
    // então só as falhas de integridade impedem seguir.
    const remotas = await migrationsRemotas()
    const pendentes = manifesto.migrations.filter((m) => !remotas.has(m.nome_remoto))
    const soPorJaAplicadas = falhas === manifesto.migrations.length - pendentes.length
    if (!soPorJaAplicadas) {
      console.error('RECUSADO: falhas de integridade nas pré-condições.')
      process.exit(1)
    }
    console.log('\n(retomada: algumas migrations já constam no remoto e serão puladas)')
  }

  const remotas = await migrationsRemotas()
  const estado = lerEstado()
  console.log('\n=== Aplicando ===')

  for (const m of manifesto.migrations) {
    if (remotas.has(m.nome_remoto)) {
      console.log(`pulando ${m.arquivo} (já aplicada como ${remotas.get(m.nome_remoto)})`)
      continue
    }
    const corpo = lerMigration(m.arquivo)
    if (sha256(corpo) !== m.sha256) {
      console.error(`ABORTADO: ${m.arquivo} divergiu do manifesto no meio da aplicação.`)
      process.exit(1)
    }
    process.stdout.write(`aplicando ${m.arquivo} ... `)
    try {
      await api('/database/migrations', {
        method: 'POST',
        body: JSON.stringify({ name: m.nome_remoto, query: corpo }),
      })
    } catch (e) {
      console.log('FALHOU')
      // Registra o ponto exato de parada: as anteriores JÁ ESTÃO aplicadas e
      // não devem ser reaplicadas. Rodar de novo retoma daqui.
      estado.aplicadas[m.nome_remoto] = { status: 'falhou', erro: String(e.message).slice(0, 300) }
      gravarEstado(estado)
      console.error(`\nParou em ${m.arquivo}: ${e.message}`)
      console.error('As anteriores permanecem aplicadas. Corrija e rode --apply de novo para retomar.')
      process.exit(1)
    }
    const agora = await migrationsRemotas()
    const versao = agora.get(m.nome_remoto) ?? '(não registrada)'
    estado.aplicadas[m.nome_remoto] = { status: 'ok', versao_remota: versao, sha256: m.sha256 }
    gravarEstado(estado)
    console.log(`OK (versão remota ${versao})`)
  }
  console.log('\nAplicadas. Rode --verify.')
}

async function verify() {
  console.log('=== Verificação pós-deploy ===')
  const manifesto = lerManifesto()
  const remotas = await migrationsRemotas()

  for (const m of manifesto.migrations) {
    checar(
      `${m.nome_remoto} registrada no tracking remoto`,
      remotas.has(m.nome_remoto),
      remotas.has(m.nome_remoto) ? `versão ${remotas.get(m.nome_remoto)}` : 'ausente',
    )
  }

  // Correspondência conteúdo local x SQL efetivamente registrado no remoto.
  const nomes = manifesto.migrations.map((m) => `'${m.nome_remoto}'`).join(',')
  const stmts = await sql(
    `SELECT name, array_to_string(statements, E'\\n') AS sql FROM supabase_migrations.schema_migrations WHERE name IN (${nomes})`,
  )
  for (const m of manifesto.migrations) {
    const remoto = (stmts ?? []).find((s) => s.name === m.nome_remoto)
    if (!remoto) {
      checar(`SQL remoto de ${m.nome_remoto} recuperável`, false, 'não encontrado')
      continue
    }
    // O servidor pode normalizar espaços/quebra; compara o texto sem espaços.
    const norm = (s) => s.replace(/\s+/g, '')
    checar(
      `SQL remoto de ${m.nome_remoto} corresponde ao arquivo local`,
      norm(remoto.sql).includes(norm(lerMigration(m.arquivo)).slice(0, 200)),
      `remoto=${remoto.sql.length} chars`,
    )
  }

  const r = await sql(`
    SELECT
      (SELECT pg_get_function_result(oid) FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS ret,
      (SELECT prosecdef FROM pg_proc WHERE proname='list_produtos_gerente_filtrados' LIMIT 1) AS secdef,
      (SELECT numeric_precision || ',' || numeric_scale FROM information_schema.columns
        WHERE table_name='produtos' AND column_name='preco_custo_medio') AS precisao,
      (SELECT count(*) FROM pg_policies WHERE tablename='produtos' AND policyname IN ('caixa_policy','painel_policy')) AS orfas,
      (SELECT count(*) FROM pg_indexes WHERE indexname IN
        ('idx_produtos_criado_por','idx_produtos_atualizado_por','idx_historico_precos_produto_alterado_por')) AS indices,
      (SELECT count(*) FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado') AS rpc_faixa,
      (SELECT prosrc LIKE '%FOR UPDATE%' FROM pg_proc WHERE proname='atualizar_produto_com_faixa_atacado' LIMIT 1) AS tem_lock
  `)
  const e = r?.[0] ?? {}
  const nCols = (String(e.ret ?? '').match(/,/g) ?? []).length + 1
  checar('RPC de listagem com 17 colunas', nCols === 17, `cols=${nCols}`)
  checar('RPC de listagem é SECURITY INVOKER', e.secdef === false, `secdef=${e.secdef}`)
  checar('preco_custo_medio 10,2', e.precisao === '10,2')
  checar('policies órfãs removidas', Number(e.orfas) === 0, `orfas=${e.orfas}`)
  checar('3 índices de autoria', Number(e.indices) === 3, `indices=${e.indices}`)
  checar('RPC transacional presente', Number(e.rpc_faixa) === 1)
  checar('RPC transacional com FOR UPDATE', e.tem_lock === true, `tem_lock=${e.tem_lock}`)

  console.log(falhas === 0 ? '\nTudo conferido.' : `\n${falhas} verificação(ões) falharam.`)
  return falhas === 0
}

const acoes = { check, plan, apply, verify, manifesto: gerarManifesto }
Promise.resolve(acoes[MODO]())
  .then((ok) => process.exit(ok === false || falhas > 0 ? 1 : 0))
  .catch((e) => {
    console.error('ERRO:', e.message)
    process.exit(1)
  })

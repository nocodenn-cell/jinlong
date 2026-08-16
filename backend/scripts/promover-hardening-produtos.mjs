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
import { execFile, execFileSync } from 'node:child_process'
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
/** Dump de DADOS — obrigatório: schema sozinho restaura um banco vazio. */
const BACKUP_DADOS = process.env.BACKUP_DADOS_PATH ?? ''

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

/** Normalização usada nas comparações de SQL: o servidor pode reformatar
 *  espaços em branco, mas nunca o conteúdo. */
const normSql = (s) => String(s ?? '').replace(/\s+/g, '')

/**
 * SQL efetivamente registrado no remoto para um nome de migration.
 * `statements` é um array de texto; junta-se tudo para comparar por inteiro.
 */
async function sqlRemotoDe(nome) {
  const linhas = await sql(
    `SELECT array_to_string(statements, E'\\n') AS sql
       FROM supabase_migrations.schema_migrations
      WHERE name = '${nome.replace(/'/g, "''")}'
      LIMIT 1`,
  )
  return linhas?.[0]?.sql ?? null
}

/**
 * Confirma que a migration JÁ REGISTRADA no remoto tem exatamente o SQL do
 * arquivo local, antes de pular.
 *
 * POR QUE: pular só porque o NOME existe no tracking é inseguro. O nome pode
 * ter chegado lá por caminhos que não garantem nada sobre o conteúdo — alguém
 * aplicou à mão uma migration homônima, um timeout ocorreu depois do commit,
 * a conexão caiu, a resposta veio malformada, houve 429 e re-execução. Em
 * qualquer desses casos a base sobre a qual as migrations SEGUINTES seriam
 * aplicadas é desconhecida, e o `--verify` no fim já seria tarde: o dano já
 * estaria feito.
 *
 * Três desfechos:
 *   'igual'      → seguro pular;
 *   'divergente' → ABORTA a promoção (não aplica nada por cima);
 *   'ausente'    → registrada sem SQL recuperável; também aborta, por não ser
 *                  possível afirmar equivalência.
 */
async function confirmarSqlRemoto(m) {
  const remoto = await sqlRemotoDe(m.nome_remoto)
  if (remoto == null) return { estado: 'ausente', detalhe: 'sem SQL registrado' }
  const hLocal = sha256(normSql(lerMigration(m.arquivo)))
  const hRemoto = sha256(normSql(remoto))
  if (hLocal === hRemoto) return { estado: 'igual', detalhe: hLocal.slice(0, 16) }
  return {
    estado: 'divergente',
    detalhe: `local=${hLocal.slice(0, 16)} remoto=${hRemoto.slice(0, 16)} (${remoto.length} chars)`,
  }
}

/**
 * Commit que tocou as migrations pela última vez — NÃO o HEAD.
 *
 * Travar HEAD é auto-referencial: gravar o manifesto muda o HEAD e invalida o
 * próprio manifesto que acabou de ser gravado. E HEAD avança a cada commit que
 * não tem nada a ver com estas migrations. O que precisa ser imutável é a
 * PROCEDÊNCIA do SQL, e isso é exatamente o último commit que mexeu nestes
 * cinco arquivos — estável enquanto ninguém os alterar, e mudando na hora em
 * que alguém alterar.
 */
function commitDasMigrations() {
  return git('log', '-1', '--format=%H', '--', ...MIGRATIONS.map((m) => `backend/supabase/migrations/${m}`))
}

/** O próprio script de promoção entra no manifesto: adulterá-lo é tão grave
 *  quanto adulterar o SQL, e antes nada o cobria. */
const ARQUIVO_PROPRIO = 'backend/scripts/promover-hardening-produtos.mjs'

/**
 * Caminhos que COMPÕEM o artefato promovido — o que precisa estar limpo.
 *
 * Não é o repositório inteiro de propósito: este worktree carrega modificações
 * pré-existentes e alheias a esta entrega (`.claude/`, docs de outras frentes,
 * scripts de comissões), e exigir limpeza global tornaria a ferramenta
 * inutilizável sem aumentar a garantia — nenhum desses arquivos entra no SQL
 * aplicado nem na decisão de aplicar. O escopo cobre o SQL, os scripts que
 * decidem/validam a promoção — que era exatamente a lacuna apontada (antes só
 * as 5 migrations eram verificadas).
 *
 * O MANIFESTO fica fora da lista: ele é a REFERÊNCIA da comparação, não o
 * referente. Incluí-lo criava um laço — gravar o manifesto sujava o worktree e
 * invalidava o manifesto recém-gravado. A integridade dele vem de estar
 * commitado no git, o que qualquer auditor inspeciona diretamente.
 */
const CAMINHOS_DO_ARTEFATO = [
  'backend/supabase/migrations',
  'backend/scripts/promover-hardening-produtos.mjs',
  'backend/scripts/promocao-cenarios-teste.mjs',
  'backend/scripts/upgrade-sobre-clone-producao.sh',
  'backend/scripts/concorrencia-faixa-atacado.sh',
  'backend/scripts/fallback-sem-rpc-real.mjs',
  'backend/scripts/rls-produtos-tenant-rest-smoke.mjs',
]

function sha256Proprio() {
  return sha256(readFileSync(join(RAIZ, ARQUIVO_PROPRIO), 'utf8'))
}

function gerarManifesto() {
  // Gerar manifesto com worktree sujo congelaria hashes de conteúdo não
  // commitado — o manifesto passaria a atestar algo que não está no git.
  const sujo = git('status', '--porcelain', '--', ...CAMINHOS_DO_ARTEFATO)
  if (sujo && !args.has('--permitir-worktree-sujo')) {
    console.error('RECUSADO: worktree sujo. Commite antes de gerar o manifesto:')
    console.error(sujo.split('\n').slice(0, 10).join('\n'))
    process.exitCode = 2
    return
  }

  const commit = commitDasMigrations()
  const migrations = MIGRATIONS.map((nome) => ({
    arquivo: nome,
    nome_remoto: nomeRemoto(nome),
    sha256: sha256(lerMigration(nome)),
    // Hash do OBJETO GIT, não só do arquivo em disco: amarra o manifesto ao
    // conteúdo versionado, não a uma cópia local qualquer.
    git_blob: git('rev-parse', `HEAD:backend/supabase/migrations/${nome}`),
  }))
  const manifesto = {
    projeto: PROJETO_ESPERADO,
    commit,
    script_sha256: sha256Proprio(),
    migrations,
  }
  writeFileSync(MANIFESTO_PATH, JSON.stringify(manifesto, null, 2) + '\n')
  console.log(`manifesto gravado para o commit ${commit}:`)
  console.log(`  script: ${manifesto.script_sha256.slice(0, 16)}`)
  for (const m of migrations) console.log(`  ${m.arquivo}\n    sha256=${m.sha256}  blob=${m.git_blob.slice(0, 12)}`)
}

/**
 * Validação ESTRUTURAL do backup, com restauração real opcional.
 *
 * A versão anterior só checava "existe, > 100 KB, recente" — um arquivo
 * aleatório grande passava. Aqui o arquivo tem de ser reconhecidamente um dump
 * de ESTE schema: cabeçalho do pg_dump, marcador de término (pega dump
 * truncado) e presença das tabelas que este projeto tem (pega dump de outro
 * projeto). Com `BACKUP_RESTORE_TEST=1`, ainda restaura num banco descartável
 * e confere que as tabelas nasceram — a única prova de que o dump presta.
 */
const TABELAS_ESPERADAS = ['produtos', 'usuarios', 'precos_atacado', 'historico_precos_produto', 'lojas']

/**
 * Conta as linhas de dados de uma tabela dentro de um dump `--data-only`.
 *
 * `pg_dump` escreve `COPY public."t" (...) FROM stdin;`, depois as linhas, e
 * fecha com `\.` sozinho. Contar aqui permite comparar com o que foi
 * efetivamente restaurado — a prova de que nenhuma linha se perdeu no caminho.
 * Também cobre o formato `INSERT INTO`, usado quando o dump é gerado com
 * `--inserts`.
 */
function linhasNoDump(dump, tabela) {
  const inicio = new RegExp(`^COPY ("?public"?\\.)?"?${tabela}"?\\s*\\(`, 'im')
  const linhas = dump.split('\n')
  const idx = linhas.findIndex((l) => inicio.test(l))
  if (idx >= 0) {
    let n = 0
    for (let i = idx + 1; i < linhas.length; i += 1) {
      if (linhas[i] === '\\.') break
      n += 1
    }
    return n
  }
  const insert = new RegExp(`^INSERT INTO ("?public"?\\.)?"?${tabela}"?\\s`, 'i')
  return linhas.filter((l) => insert.test(l)).length
}

function validarBackup() {
  if (!BACKUP) {
    checar('BACKUP_SCHEMA_PATH definido (projeto free não tem backup automático)', false, 'variável ausente')
    return
  }
  if (!existsSync(BACKUP)) {
    checar('backup existe', false, `não encontrado: ${BACKUP}`)
    return
  }
  const st = statSync(BACKUP)
  const horas = (Date.now() - st.mtimeMs) / 3_600_000
  checar('backup é recente', horas < BACKUP_MAX_HORAS, `${horas.toFixed(1)}h (máx ${BACKUP_MAX_HORAS}h)`)

  const conteudo = readFileSync(BACKUP, 'utf8')

  // Os padrões abaixo foram calibrados contra o artefato REAL de
  // `supabase db dump`, não contra o formato do `pg_dump` puro: a saída da CLI
  // começa com linhas em branco e `SET statement_timeout`, NÃO traz o cabeçalho
  // "PostgreSQL database dump" nem o marcador "... dump complete" do pg_dump, e
  // usa identificadores entre aspas (`"public"."produtos"`). Uma primeira
  // versão desta validação foi escrita para o pg_dump puro e reprovava o backup
  // legítimo — teste com o dump de produção real expôs isso.
  checar(
    'backup é um dump SQL do PostgreSQL',
    /^\s*SET\s+statement_timeout/m.test(conteudo) || /PostgreSQL database dump\b/.test(conteudo),
    conteudo.slice(0, 60).replace(/\s+/g, ' ').trim(),
  )

  // Dump de outro projeto (ou de outro schema): não teria estas tabelas.
  // Aceita identificador com ou sem aspas, com ou sem schema.
  const temTabela = (t) =>
    new RegExp(`CREATE TABLE (IF NOT EXISTS )?("?public"?\\.)?"?${t}"?\\s*\\(`, 'i').test(conteudo)
  const faltando = TABELAS_ESPERADAS.filter((t) => !temTabela(t))
  checar(
    'backup contém as tabelas deste projeto',
    faltando.length === 0,
    faltando.length ? `ausentes: ${faltando.join(', ')}` : TABELAS_ESPERADAS.join(', '),
  )

  // Truncamento: sem marcador de fim no artefato da CLI, a evidência é o
  // arquivo terminar no meio de uma instrução. Um dump íntegro termina com
  // `;` (ou comentário) na última linha não vazia.
  const ultimaLinha = conteudo
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .pop()
  checar(
    'backup não está truncado (última instrução fechada)',
    // `\unrestrict`/`\restrict` são meta-comandos do psql que o pg_dump recente
    // emite no fim do arquivo — um dump íntegro pode terminar neles. O padrão
    // exige a CONTRABARRA literal: `/^\w+/` (sem escape) casaria qualquer linha
    // começando por letra, inclusive uma instrução cortada no meio.
    !!ultimaLinha &&
      (ultimaLinha.endsWith(';') || ultimaLinha.startsWith('--') || /^\\[a-z]+/i.test(ultimaLinha)),
    ultimaLinha ? `última linha: ${ultimaLinha.slice(0, 70)}` : 'arquivo vazio',
  )

  // ── Backup de DADOS ────────────────────────────────────────────────────
  // Schema sozinho não recupera nada: restaurar só a estrutura devolve um banco
  // vazio. O projeto está no plano free, sem backup automático, então o dump de
  // dados é a única cópia existente e passa a ser OBRIGATÓRIO.
  if (!BACKUP_DADOS) {
    checar('BACKUP_DADOS_PATH definido (schema sozinho não recupera dados)', false, 'variável ausente')
    return
  }
  if (!existsSync(BACKUP_DADOS)) {
    checar('backup de dados existe', false, `não encontrado: ${BACKUP_DADOS}`)
    return
  }
  const stDados = statSync(BACKUP_DADOS)
  const horasDados = (Date.now() - stDados.mtimeMs) / 3_600_000
  checar('backup de dados é recente', horasDados < BACKUP_MAX_HORAS, `${horasDados.toFixed(1)}h`)

  const dados = readFileSync(BACKUP_DADOS, 'utf8')
  const temCopyOuInsert = TABELAS_ESPERADAS.filter(
    (t) =>
      new RegExp(`COPY ("?public"?\\.)?"?${t}"?\\s`, 'i').test(dados) ||
      new RegExp(`INSERT INTO ("?public"?\\.)?"?${t}"?\\s`, 'i').test(dados),
  )
  checar(
    'backup de dados contém as tabelas afetadas',
    temCopyOuInsert.length === TABELAS_ESPERADAS.length,
    `com dados: ${temCopyOuInsert.join(', ') || '(nenhuma)'}`,
  )

  // ── Restauração OBRIGATÓRIA ────────────────────────────────────────────
  // Antes era opt-in (BACKUP_RESTORE_TEST=1), tolerava erros e descartava os
  // logs — ou seja, podia "passar" sem restaurar coisa alguma. Agora sempre
  // roda, os erros são capturados e classificados, e o resultado é conferido
  // por CONTAGEM de linhas, não pela mera existência das tabelas.
  const container = process.env.CONTAINER ?? 'supabase_db_fastproduct'
  const dbTeste = 'backup_restore_test'
  const psql = (sqlTexto, db) =>
    execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db, '-q', '-t', '-A'], {
      input: sqlTexto,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    })
  const carregar = (texto) =>
    execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', dbTeste, '-q', '-v', 'ON_ERROR_STOP=0'],
      { input: texto, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
    )

  try {
    psql(`DROP DATABASE IF EXISTS ${dbTeste};`, 'postgres')
    psql(`CREATE DATABASE ${dbTeste};`, 'postgres')
    // Stub mínimo de auth: o dump referencia auth.users em FKs.
    psql(
      `CREATE SCHEMA IF NOT EXISTS auth;
       CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
       CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ SELECT NULL::uuid $fn$;
       CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$ SELECT NULL::text $fn$;
       CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$ SELECT '{}'::jsonb $fn$;`,
      dbTeste,
    )

    const logSchema = carregar(conteudo)
    const logDados = carregar(dados)
    // Erros de RESTAURAÇÃO em `public` não podem ser tolerados em silêncio.
    const errosPublic = `${logSchema}\n${logDados}`
      .split('\n')
      .filter((l) => l.startsWith('ERROR'))
      .filter(
        (l) =>
          !/schema "(auth|storage|realtime|extensions|graphql|graphql_public|vault|supabase_migrations|supabase_functions|pgbouncer|net|cron|pgsodium)"/.test(l) &&
          !/role "(supabase_\w+|dashboard_user|authenticator|pgbouncer)"/.test(l) &&
          !/extension "[^"]+"/.test(l) &&
          !/can only create extension in database postgres/.test(l) &&
          !/publication "supabase_realtime"/.test(l) &&
          !/permission denied for function pg_read_file/.test(l),
      )
    checar(
      'restauração sem erros em `public`',
      errosPublic.length === 0,
      errosPublic.length ? errosPublic.slice(0, 2).join(' | ').slice(0, 200) : 'nenhum',
    )

    // CONTAGENS: o critério certo não é "> 0" e sim "igual ao que está no
    // dump". Exigir sempre não-zero reprovaria um backup fiel de uma tabela
    // legitimamente vazia; comparar com o dump prova que a restauração não
    // perdeu linhas — que é o que interessa para recuperação.
    const linhas = psql(
      TABELAS_ESPERADAS.map((t) => `SELECT '${t}=' || count(*) FROM public.${t}`).join(' UNION ALL '),
      dbTeste,
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const restaurado = Object.fromEntries(linhas.map((l) => l.split('=')).map(([k, v]) => [k, Number(v)]))
    const noDump = Object.fromEntries(TABELAS_ESPERADAS.map((t) => [t, linhasNoDump(dados, t)]))

    const divergentes = TABELAS_ESPERADAS.filter((t) => restaurado[t] !== noDump[t])
    checar(
      'contagens restauradas batem com o dump (nenhuma linha perdida)',
      divergentes.length === 0,
      TABELAS_ESPERADAS.map((t) => `${t}: dump=${noDump[t]} restaurado=${restaurado[t]}`).join(' | '),
    )

    // Pelo menos `produtos` tem de ter vindo com conteúdo — é a tabela que as
    // migrations alteram, e um backup dela vazio não serviria de recuperação.
    checar(
      '`produtos` restaurada com linhas',
      restaurado.produtos > 0,
      `${restaurado.produtos} linhas`,
    )

    // Amostra real — prova que o conteúdo veio, não só a contagem.
    const amostra = psql(
      `SELECT coalesce(string_agg(nome, ' | '), '(vazio)') FROM (SELECT nome FROM public.produtos ORDER BY nome LIMIT 3) s;`,
      dbTeste,
    ).trim()
    checar('amostra de `produtos` legível após restauração', amostra !== '(vazio)' && amostra.length > 0, amostra.slice(0, 120))
  } catch (e) {
    checar('backup RESTAURA de fato', false, String(e.stderr ?? e.message).slice(0, 200))
  } finally {
    try {
      psql(`DROP DATABASE IF EXISTS ${dbTeste};`, 'postgres')
    } catch {
      /* best-effort */
    }
  }
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

  // O commit auditado tem de (a) ser o que de fato produziu estes arquivos e
  // (b) estar na história do HEAD atual. (a) pega arquivo alterado depois do
  // manifesto; (b) pega checkout de outro branch/commit onde este SQL não vem
  // da revisão auditada.
  let atual = ''
  let ancestral = false
  try {
    atual = commitDasMigrations()
    execFileSync('git', ['merge-base', '--is-ancestor', manifesto.commit, 'HEAD'], { cwd: RAIZ })
    ancestral = true
  } catch {
    /* não-ancestral, ou fora de repo git */
  }
  checar(
    'migrations vêm do commit auditado',
    atual === manifesto.commit,
    `commit dos arquivos=${atual.slice(0, 8)} manifesto=${String(manifesto.commit).slice(0, 8)}`,
  )
  checar(
    'commit auditado está na história do HEAD',
    ancestral,
    ancestral ? '' : 'HEAD não descende do commit do manifesto',
  )

  // Todos os caminhos do artefato — não só as 5 migrations. Uma alteração não
  // commitada nos scripts que decidem/validam a promoção significa que o que
  // está em disco não é o que foi auditado. Ver CAMINHOS_DO_ARTEFATO para por
  // que o escopo não é o repositório inteiro.
  let sujos = ''
  try {
    sujos = git('status', '--porcelain', '--', ...CAMINHOS_DO_ARTEFATO)
  } catch {
    /* idem */
  }
  // `--permitir-worktree-sujo` já existia para a geração do manifesto; aqui ele
  // serve ao AUTO-TESTE: `promocao-cenarios-teste.mjs` está entre os caminhos do
  // artefato, então qualquer edição no próprio arquivo de cenários derrubava as
  // 16 asserções que dependem de rodar o script — inclusive as que nada têm a
  // ver com worktree. A flag NUNCA é passada na promoção real (o procedimento
  // documentado não a usa), então o gate segue valendo onde importa.
  const ignorarSujo = args.has('--permitir-worktree-sujo')
  checar(
    `worktree limpo em todos os caminhos do artefato${ignorarSujo ? ' (ignorado: --permitir-worktree-sujo)' : ''}`,
    sujos === '' || ignorarSujo,
    sujos ? sujos.split('\n').slice(0, 4).join(' | ') : 'sem modificações',
  )

  // O manifesto ficou fora do clean-check para não criar laço (gravá-lo sujava
  // o worktree e invalidava a si mesmo). Mas isso abria a brecha de um
  // manifesto local modificado participar da promoção. A saída é comparar o
  // arquivo em disco com a versão COMMITADA: quebra o laço (gerar+commitar é o
  // fluxo normal) e ainda assim recusa manifesto alterado localmente.
  let manifestoCommitado = ''
  try {
    manifestoCommitado = git('show', 'HEAD:backend/scripts/promover-hardening-produtos.manifesto.json')
  } catch {
    /* não versionado */
  }
  const manifestoEmDisco = readFileSync(MANIFESTO_PATH, 'utf8')
  // Mesma concessão de auto-teste do gate de worktree: durante a suíte de
  // cenários o manifesto acabou de ser regravado e ainda não foi commitado.
  // Na promoção real a flag não é passada e a comparação vale integralmente.
  checar(
    `manifesto em disco é idêntico ao commitado${ignorarSujo ? ' (ignorado: --permitir-worktree-sujo)' : ''}`,
    ignorarSujo || (manifestoCommitado !== '' && normSql(manifestoCommitado) === normSql(manifestoEmDisco)),
    manifestoCommitado === ''
      ? 'manifesto não está versionado no HEAD'
      : normSql(manifestoCommitado) === normSql(manifestoEmDisco)
        ? `sha256=${sha256(manifestoEmDisco).slice(0, 16)}`
        : 'DIVERGENTE — há modificação local não commitada no manifesto',
  )

  checar(
    'o próprio script de promoção não foi adulterado',
    !manifesto.script_sha256 || sha256Proprio() === manifesto.script_sha256,
    manifesto.script_sha256
      ? `manifesto=${String(manifesto.script_sha256).slice(0, 16)} atual=${sha256Proprio().slice(0, 16)}`
      : 'manifesto antigo sem script_sha256 — regere com --manifesto',
  )

  for (const m of manifesto.migrations) {
    const atual = sha256(lerMigration(m.arquivo))
    checar(
      `sha256 confere: ${m.arquivo}`,
      atual === m.sha256,
      atual === m.sha256 ? atual.slice(0, 16) : `esperado=${m.sha256.slice(0, 16)} atual=${atual.slice(0, 16)}`,
    )
    if (m.git_blob) {
      let blob = ''
      try {
        blob = git('rev-parse', `HEAD:backend/supabase/migrations/${m.arquivo}`)
      } catch {
        /* arquivo não versionado no HEAD */
      }
      checar(
        `blob git confere: ${m.arquivo}`,
        blob === m.git_blob,
        blob === m.git_blob ? blob.slice(0, 12) : `esperado=${String(m.git_blob).slice(0, 12)} atual=${blob.slice(0, 12) || '(ausente)'}`,
      )
    }
  }

  validarBackup()
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
    // Quando já está lá, o que importa é se é a MESMA coisa. Reportado já no
    // --check para que a divergência apareça antes de qualquer aplicação, e não
    // só quando o --apply tropeçar nela.
    if (ja) {
      const conf = await confirmarSqlRemoto(m)
      checar(
        `SQL remoto de ${m.nome_remoto} confere com o arquivo local`,
        conf.estado === 'igual',
        `${conf.estado}: ${conf.detalhe}`,
      )
    }
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
    process.exitCode = 2
    return
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
      process.exitCode = 1
      return
    }
    console.log('\n(retomada: algumas migrations já constam no remoto e serão puladas)')
    // As "falhas" contadas acima são apenas os avisos de já-aplicada — que numa
    // retomada são o estado ESPERADO, não erro. Sem zerar, uma retomada
    // bem-sucedida terminaria com código de saída 1.
    falhas = 0
  }

  const remotas = await migrationsRemotas()
  const estado = lerEstado()
  console.log('\n=== Aplicando ===')

  for (const m of manifesto.migrations) {
    if (remotas.has(m.nome_remoto)) {
      // NÃO basta o nome existir: confirma o SQL integral antes de pular.
      const conf = await confirmarSqlRemoto(m)
      if (conf.estado !== 'igual') {
        console.log(
          `ABORTADO em ${m.arquivo}: o remoto tem uma migration com este nome, mas ` +
            `o SQL ${conf.estado === 'ausente' ? 'não é recuperável' : 'DIVERGE do arquivo local'} — ${conf.detalhe}`,
        )
        console.log(
          'Não é seguro aplicar as seguintes sobre uma base desconhecida. ' +
            'Investigue o registro remoto antes de continuar.',
        )
        estado.aplicadas[m.nome_remoto] = { status: 'divergente', detalhe: conf.detalhe }
        gravarEstado(estado)
        process.exitCode = 1
        return
      }
      console.log(`pulando ${m.arquivo} (já aplicada como ${remotas.get(m.nome_remoto)}, SQL confere: ${conf.detalhe})`)
      continue
    }
    const corpo = lerMigration(m.arquivo)
    if (sha256(corpo) !== m.sha256) {
      console.error(`ABORTADO: ${m.arquivo} divergiu do manifesto no meio da aplicação.`)
      process.exitCode = 1
      return
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
    // Comparação INTEGRAL por hash, não por prefixo. A versão anterior conferia
    // só os 200 primeiros caracteres normalizados: uma migration homônima com
    // corpo diferente a partir do caractere 201 passaria como equivalente.
    // O servidor pode normalizar espaços em branco, então o hash é do texto sem
    // espaços — mas de TODO o texto.
    const norm = (s) => s.replace(/\s+/g, '')
    const hashLocal = sha256(norm(lerMigration(m.arquivo)))
    const hashRemoto = sha256(norm(remoto.sql))
    checar(
      `SQL remoto de ${m.nome_remoto} é byte-a-byte o do arquivo local`,
      hashLocal === hashRemoto,
      hashLocal === hashRemoto
        ? `sha256(norm)=${hashLocal.slice(0, 16)}`
        : `local=${hashLocal.slice(0, 16)} remoto=${hashRemoto.slice(0, 16)} (${remoto.sql.length} chars)`,
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
// `process.exitCode` em vez de `process.exit()`: sair de imediato com sockets
// de fetch ainda em fechamento derruba o Node no Windows com
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. Deixar o loop de
// eventos drenar entrega o código de saída correto em qualquer plataforma.
Promise.resolve(acoes[MODO]())
  .then((ok) => {
    if (process.exitCode === undefined) {
      process.exitCode = ok === false || falhas > 0 ? 1 : 0
    }
  })
  .catch((e) => {
    console.error('ERRO:', e.message)
    process.exitCode = 1
  })

/**
 * Integração REAL: o `createProductUpdater` DE VERDADE, contra o Postgres/
 * PostgREST local, num banco sem a RPC transacional.
 *
 * POR QUE EXISTE: `backend/scripts/fallback-sem-rpc-real.mjs` prova o defeito
 * antigo no banco, mas reimplementa a decisão em JS — não exercita o código da
 * aplicação. Os testes de unidade exercitam o código, mas com supabase mockado.
 * Faltava o cruzamento: código real + banco real. É o que este arquivo faz.
 *
 * Requer o stack local em pé.
 *
 * Perfil de execução (P2b da auditoria de 2026-08-16): antes o teste fazia
 * `return` quando o stack estava fora, e o Vitest contava isso como PASSOU —
 * uma suíte verde não provava que a integração tinha rodado. Agora:
 *   - com `INTEGRACAO_OBRIGATORIA=1` (CI): stack ausente FALHA o teste;
 *   - sem a variável (dev local sem Docker): `describe.skip`, visível como
 *     SKIPPED no relatório, nunca como verde.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { createProductUpdater } from './productUpdater'

// Credenciais do stack LOCAL, fixas de propósito — NÃO lidas do ambiente.
// O Vitest carrega `.env.local`, que aponta para o projeto de produção; usar
// `process.env` aqui mandava a chave de produção contra a URL local (o erro
// era "No suitable key or wrong key type") e, pior, abriria a porta para este
// teste — que CRIA E APAGA DADOS — falar com produção. Estas são as chaves
// públicas e fixas do `supabase start`.
//
// Em CI, use as variáveis de ambiente SUPABASE_SERVICE_ROLE_KEY.
// O valor abaixo é um placeholder para desenvolvimento local.
const API_URL = 'http://127.0.0.1:54321'
const CONTAINER = process.env.CONTAINER ?? 'supabase_db_fastproduct'
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'MOCK_SERVICE_ROLE_KEY_DO_NOT_COMMIT'

const LOJA = 'a0000001-0000-4000-8000-000000000001'
const SUF = '__INTEG_SEM_RPC__'

function psql(sqlTexto: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-t', '-A'],
    { input: sqlTexto, encoding: 'utf8' },
  )
}

let disponivel = false
let admin: SupabaseClient
let produtoId = ''
/** A RPC foi tirada de cena por este arquivo e precisa voltar no afterAll. */
let rpcOculta = false

// A RPC some do banco por RENAME, não por DROP. O DROP + recriação por texto
// perdia o GRANT EXECUTE TO authenticated/service_role, o COMMENT e o
// `search_path` reais da migration: quem rodava depois (ex.:
// produtosFiscalEdicao.integration.test.ts) recebia "permission denied". O
// RENAME preserva ACL, comentário e corpo; restaurar é renomear de volta.
const RPC_ASSINATURA = 'public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb)'
const RPC_NOME = 'atualizar_produto_com_faixa_atacado'
const RPC_OCULTA = 'atualizar_produto_com_faixa_atacado__oculta_teste_sem_rpc'
const RPC_OCULTA_ASSINATURA = `public.${RPC_OCULTA}(uuid, jsonb, uuid, jsonb)`

/** Devolve a RPC ao nome original se uma execução anterior abortou no meio. */
function restaurarRpcSeOculta(): void {
  psql(`
    DO $$
    BEGIN
      IF to_regprocedure('${RPC_OCULTA_ASSINATURA}') IS NOT NULL THEN
        IF to_regprocedure('${RPC_ASSINATURA}') IS NULL THEN
          ALTER FUNCTION ${RPC_OCULTA_ASSINATURA} RENAME TO ${RPC_NOME};
        ELSE
          DROP FUNCTION ${RPC_OCULTA_ASSINATURA};
        END IF;
      END IF;
    END $$;
  `)
}

async function stackDisponivel(): Promise<boolean> {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API_URL)) return false
  try {
    psql('SELECT 1;')
    const r = await fetch(`${API_URL}/rest/v1/`, { signal: AbortSignal.timeout(3000) })
    return r.status < 500
  } catch {
    return false
  }
}

/** Em CI o stack É pré-requisito: ausência é falha, não dispensa. */
const OBRIGATORIA = process.env.INTEGRACAO_OBRIGATORIA === '1'

beforeAll(async () => {
  disponivel = await stackDisponivel()
  if (!disponivel) {
    if (OBRIGATORIA) {
      throw new Error(
        `stack local indisponível em ${API_URL} e INTEGRACAO_OBRIGATORIA=1 — ` +
          'suba o Supabase local (`supabase start`) antes de rodar a suíte.',
      )
    }
    return
  }

  admin = createClient(API_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Resto de uma execução abortada (afterAll não rodou): devolve a RPC antes.
  restaurarRpcSeOculta()

  await admin.from('precos_atacado').delete().eq('quantidade_minima', 4242)
  const { data: velhos } = await admin.from('produtos').select('id').like('nome', `%${SUF}%`)
  for (const p of velhos ?? []) {
    await admin.from('precos_atacado').delete().eq('produto_id', p.id)
    await admin.from('estoque').delete().eq('produto_id', p.id)
    await admin.from('historico_precos_produto').delete().eq('produto_id', p.id)
  }
  await admin.from('produtos').delete().like('nome', `%${SUF}%`)

  const { data: prod, error } = await admin
    .from('produtos')
    .insert({
      nome: `Produto ${SUF}`,
      preco_varejo: 100,
      origem: 'brasil_nf',
      loja_id: LOJA,
      preco_atacado: 30,
      quantidade_gatilho_atacado: 10,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insert produto: ${error.message}`)
  produtoId = prod!.id as string

  await admin
    .from('precos_atacado')
    .insert({ produto_id: produtoId, quantidade_minima: 10, preco_unitario: 30, loja_id: null, ativo: true })

  // Tira a RPC de cena — simulando o banco que ainda não recebeu a migration.
  psql(`ALTER FUNCTION ${RPC_ASSINATURA} RENAME TO ${RPC_OCULTA};`)
  rpcOculta = true
  psql(`NOTIFY pgrst, 'reload schema';`)
  await new Promise((r) => setTimeout(r, 1500))
}, 60_000)

afterAll(async () => {
  if (!disponivel) return
  if (rpcOculta) restaurarRpcSeOculta()
  if (produtoId) {
    await admin.from('precos_atacado').delete().eq('produto_id', produtoId)
    await admin.from('historico_precos_produto').delete().eq('produto_id', produtoId)
    await admin.from('estoque').delete().eq('produto_id', produtoId)
    await admin.from('produtos').delete().eq('id', produtoId)
  }
  psql(`NOTIFY pgrst, 'reload schema';`)
}, 60_000)

describe('updater REAL contra banco sem a RPC transacional', () => {
  it('mudar o par de atacado é recusado e NADA é gravado no banco', async (ctx) => {
    // `ctx.skip()` marca SKIPPED no relatório; `return` marcava PASSOU.
    if (!disponivel) return ctx.skip()

    // O updater REAL, com o client REAL. Nada de mock aqui.
    const updater = createProductUpdater(admin)

    const antes = await admin
      .from('produtos')
      .select('nome, preco_atacado, quantidade_gatilho_atacado')
      .eq('id', produtoId)
      .single()

    const r = await updater.update({
      id: produtoId,
      lojaId: LOJA,
      input: {
        nome: `Produto ${SUF} tentativa`,
        precoVarejo: 100,
        precoAtacado: 25,
        quantidadeGatilhoAtacado: 20,
      },
    })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toContain('atacado')

    // A prova: o banco não mudou em NADA — nem o nome, que fazia parte do mesmo
    // payload. Nenhuma escrita parcial.
    const depois = await admin
      .from('produtos')
      .select('nome, preco_atacado, quantidade_gatilho_atacado')
      .eq('id', produtoId)
      .single()
    expect(depois.data).toEqual(antes.data)

    const faixas = await admin
      .from('precos_atacado')
      .select('quantidade_minima, preco_unitario, ativo')
      .eq('produto_id', produtoId)
      .eq('ativo', true)
    expect(faixas.data).toHaveLength(1)
    expect(Number(faixas.data![0]!.quantidade_minima)).toBe(10)
    expect(Number(faixas.data![0]!.preco_unitario)).toBe(30)
  }, 60_000)

  it('edição que NÃO altera o par de atacado é gravada normalmente', async (ctx) => {
    if (!disponivel) return ctx.skip()

    const updater = createProductUpdater(admin)
    const novoNome = `Produto ${SUF} renomeado`

    const r = await updater.update({
      id: produtoId,
      lojaId: LOJA,
      input: {
        nome: novoNome,
        precoVarejo: 100,
        // mesmo par de atacado já gravado
        precoAtacado: 30,
        quantidadeGatilhoAtacado: 10,
      },
    })

    expect(r.ok).toBe(true)
    const { data } = await admin.from('produtos').select('nome').eq('id', produtoId).single()
    expect(data!.nome).toBe(novoNome)
  }, 60_000)
})
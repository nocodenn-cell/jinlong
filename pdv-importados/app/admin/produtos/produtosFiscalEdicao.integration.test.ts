// Hotfix C2.8 (prontidão Focus NFe) — prova real, contra Postgres local, do
// fix para o P0 achado no Gate C2.7: `list_produtos_gerente_filtrados` não
// devolvia campos fiscais, e como a tela `/admin/catalogo` usa essa RPC como
// ÚNICA fonte de dados para abrir o modal de edição (sem refetch — ver
// `CatalogoTable.tsx`), toda edição salva apagava a classificação fiscal
// real do produto (NCM/CFOP/CEST/icms_origem -> NULL; CSOSN/CST_PIS/
// CST_COFINS -> default), mesmo alterando só um campo não fiscal.
//
// Mesma técnica de `vendaConsistency.integration.test.ts`: chama os
// adapters reais (`createProductReader`/`createProductUpdater`) direto via
// `@supabase/supabase-js`, sem passar pela borda `cookies()`/Server Action
// (que exige request scope do Next.js, inexistente em vitest). Não duplica
// a prova SQL já feita no bloco `$verify$` da migration
// `20260902150000_list_produtos_gerente_filtrados_campos_fiscais.sql`
// (que já provou RPC->valores reais e RPC->NULL preservado) — este arquivo
// prova a CAMADA TYPESCRIPT: mapper de listagem -> hidratação do formulário
// -> update alterando só `nome` -> valores fiscais intactos no banco.
//
// `list_produtos_gerente_filtrados` é SECURITY INVOKER e seu WHERE depende
// de `auth_usuario_eh_admin()`/`auth_usuario_loja_id()`, que leem
// `auth.uid()` via PostgREST — um client puramente `service_role` (sem JWT
// de usuário real) faz `auth.uid()` resolver NULL e a RPC devolve zero
// linhas para qualquer chamador, mesmo com service_role. Por isso o client
// de LEITURA usado nestes testes carrega um JWT HS256 assinado localmente
// para o usuário GERENTE já semeado (`22222222-...`, mesma loja de
// `vendaConsistency.integration.test.ts`), usando o segredo padrão do
// Supabase CLI local (`super-secret-jwt-token-with-at-least-32-characters-long`
// — não é segredo de produção, é o valor fixo que `supabase start` usa
// sempre que não sobrescrito). O client de ESCRITA/limpeza usa
// `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS, mesmo padrão dos demais testes
// de integração deste repositório).

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { createHmac } from 'node:crypto'
import { createProductReader } from './productReader'
import { createProductUpdater } from './productUpdater'
import { mapListRowToGerente } from './productListMappers'
import type { UpdateProductInput } from '@shared-core/src/products'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const LOCAL_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

const LOJA_MATRIZ = 'a0000001-0000-4000-8000-000000000001'
const GERENTE_ID = '22222222-2222-4222-8222-222222222222'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** JWT HS256 mínimo, assinado com o segredo padrão do Supabase CLI local — só para simular auth.uid() via PostgREST em ambiente de teste. */
function signLocalJwt(sub: string, role: 'authenticated' = 'authenticated'): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ sub, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  )
  const signature = base64url(createHmac('sha256', LOCAL_JWT_SECRET).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${signature}`
}

function skipIfNoServiceRole() {
  if (!SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.warn('SUPABASE_SERVICE_ROLE_KEY ausente — pulando testes de integração (Hotfix C2.8).')
    return true
  }
  return false
}

describe.skipIf(skipIfNoServiceRole())('Hotfix C2.8 — preservação de campos fiscais na edição (RPC real, Postgres local)', () => {
  let admin: SupabaseClient
  let gerente: SupabaseClient
  const produtosCriados: string[] = []

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string)
    gerente = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signLocalJwt(GERENTE_ID)}` } },
    })
  })

  afterEach(async () => {
    if (produtosCriados.length > 0) {
      await admin.from('produtos').delete().in('id', produtosCriados)
      produtosCriados.length = 0
    }
  })

  async function criarProdutoComFiscal(nome: string, fiscal: {
    ncm: string | null
    cfop_produto: string | null
    csosn: string | null
    cest: string | null
    cst_pis: string | null
    cst_cofins: string | null
    icms_origem: string | null
  }): Promise<string> {
    const { data, error } = await admin
      .from('produtos')
      .insert({
        nome,
        preco_varejo: 10,
        origem: 'china_manual',
        tem_nf: false,
        loja_id: LOJA_MATRIZ,
        ...fiscal,
      })
      .select('id')
      .single()
    if (error) throw new Error(`setup: criar produto falhou: ${error.message}`)
    const id = (data as { id: string }).id
    produtosCriados.push(id)
    return id
  }

  async function buscarLinhaViaRpc(nomeBusca: string): Promise<ProdutoGerenteRow> {
    const result = await createProductReader(gerente).listComFiltros({
      lojaId: LOJA_MATRIZ,
      situacao: 'todos',
      origem: 'all',
      nf: 'all',
      estoque: 'todos',
      imagens: 'todos',
      tags: [],
      busca: nomeBusca,
      page: 1,
      pageSize: 10,
    })
    if (!result.ok) throw new Error(`listComFiltros falhou: ${result.error}`)
    expect(result.rows.length).toBeGreaterThan(0)
    return mapListRowToGerente(result.rows[0]!)
  }

  it('1. RPC list_produtos_gerente_filtrados devolve os 7 campos fiscais com valores reais', async () => {
    const nome = `C2.8 TS com fiscal ${randomUUID()}`
    await criarProdutoComFiscal(nome, {
      ncm: '85171231',
      cfop_produto: '5102',
      csosn: '102',
      cest: '1234567',
      cst_pis: '01',
      cst_cofins: '01',
      icms_origem: '3',
    })

    const row = await buscarLinhaViaRpc(nome)
    expect(row.ncm).toBe('85171231')
    expect(row.cfop_produto).toBe('5102')
    expect(row.csosn).toBe('102')
    expect(row.cest).toBe('1234567')
    expect(row.cst_pis).toBe('01')
    expect(row.cst_cofins).toBe('01')
    expect(row.icms_origem).toBe('3')
  })

  it('2. produto com campos fiscais legitimamente NULL continua NULL (não vira default)', async () => {
    const nome = `C2.8 TS sem fiscal ${randomUUID()}`
    await criarProdutoComFiscal(nome, {
      ncm: null,
      cfop_produto: null,
      csosn: null,
      cest: null,
      cst_pis: null,
      cst_cofins: null,
      icms_origem: null,
    })

    const row = await buscarLinhaViaRpc(nome)
    expect(row.ncm).toBeNull()
    expect(row.cfop_produto).toBeNull()
    expect(row.csosn).toBeNull()
    expect(row.cest).toBeNull()
    expect(row.cst_pis).toBeNull()
    expect(row.cst_cofins).toBeNull()
    expect(row.icms_origem).toBeNull()
  })

  it('3. TESTE PRINCIPAL — editar SOMENTE o nome preserva todos os campos fiscais no banco', async () => {
    const nomeOriginal = `C2.8 TS editar ${randomUUID()}`
    const fiscalOriginal = {
      ncm: '84713012',
      cfop_produto: '5405',
      csosn: '500',
      cest: '2100300',
      cst_pis: '49',
      cst_cofins: '49',
      icms_origem: '6',
    }
    const produtoId = await criarProdutoComFiscal(nomeOriginal, fiscalOriginal)

    // Passo 1: hidrata exatamente como a tela /admin/catalogo hidrata o modal
    // de edição — via listComFiltros -> mapListRowToGerente, sem refetch.
    const hidratado = await buscarLinhaViaRpc(nomeOriginal)
    expect(hidratado.ncm).toBe(fiscalOriginal.ncm) // pré-condição: hidratação já correta pós-fix

    // Passo 2: monta o payload exatamente como buildSubmitPayload/
    // mapFormToUpdateProductInput fariam a partir do estado hidratado do
    // formulário, mudando SOMENTE o nome — nenhum campo fiscal é tocado
    // pelo operador nesta simulação.
    const nomeNovo = `${nomeOriginal} (editado)`
    const input: UpdateProductInput = {
      nome: nomeNovo,
      codigoBarras: hidratado.codigo_barras,
      codigoInterno: hidratado.codigo_interno,
      referenciaFornecedor: hidratado.referencia_fornecedor,
      nomeReduzidoPdv: hidratado.nome_reduzido_pdv,
      localizacaoPrateleira: hidratado.localizacao_prateleira,
      precoVarejo: hidratado.preco_varejo,
      precoAtacado: hidratado.preco_atacado,
      precoCusto: hidratado.preco_custo,
      permitirAbaixoCusto: hidratado.permitir_abaixo_custo,
      quantidadeGatilhoAtacado: hidratado.quantidade_gatilho_atacado,
      origem: hidratado.origem as UpdateProductInput['origem'],
      temNf: hidratado.tem_nf,
      unidadeMedida: hidratado.unidade_medida as UpdateProductInput['unidadeMedida'],
      observacao: hidratado.observacao,
      categoriaId: hidratado.categoria_id,
      marcaId: hidratado.marca_id,
      fornecedorId: hidratado.fornecedor_id,
      ncm: hidratado.ncm,
      cfopProduto: hidratado.cfop_produto,
      csosn: hidratado.csosn,
      cest: hidratado.cest,
      cstPis: hidratado.cst_pis,
      cstCofins: hidratado.cst_cofins,
      icmsOrigem: hidratado.icms_origem,
    }

    const updateResult = await createProductUpdater(gerente).update({
      id: produtoId,
      lojaId: LOJA_MATRIZ,
      input,
    })
    expect(updateResult.ok).toBe(true)

    // Passo 3: prova no banco (leitura direta, sem passar pelos mesmos
    // mappers que estão sendo testados) que TODOS os campos fiscais
    // permanecem byte-for-byte iguais ao valor original, e que o nome
    // realmente mudou.
    const { data: linhaFinal, error } = await admin
      .from('produtos')
      .select('nome, ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem')
      .eq('id', produtoId)
      .single()
    expect(error).toBeNull()
    expect(linhaFinal?.nome).toBe(nomeNovo)
    expect(linhaFinal?.ncm).toBe(fiscalOriginal.ncm)
    expect(linhaFinal?.cfop_produto).toBe(fiscalOriginal.cfop_produto)
    expect(linhaFinal?.csosn).toBe(fiscalOriginal.csosn)
    expect(linhaFinal?.cest).toBe(fiscalOriginal.cest)
    expect(linhaFinal?.cst_pis).toBe(fiscalOriginal.cst_pis)
    expect(linhaFinal?.cst_cofins).toBe(fiscalOriginal.cst_cofins)
    expect(linhaFinal?.icms_origem).toBe(fiscalOriginal.icms_origem)
  })

  it('4. editar produto com campos fiscais NULL preserva NULL (não introduz default nem valor inventado)', async () => {
    const nomeOriginal = `C2.8 TS editar sem fiscal ${randomUUID()}`
    const produtoId = await criarProdutoComFiscal(nomeOriginal, {
      ncm: null,
      cfop_produto: null,
      csosn: null,
      cest: null,
      cst_pis: null,
      cst_cofins: null,
      icms_origem: null,
    })

    const hidratado = await buscarLinhaViaRpc(nomeOriginal)
    const nomeNovo = `${nomeOriginal} (editado)`
    const input: UpdateProductInput = {
      nome: nomeNovo,
      codigoBarras: hidratado.codigo_barras,
      codigoInterno: hidratado.codigo_interno,
      referenciaFornecedor: hidratado.referencia_fornecedor,
      nomeReduzidoPdv: hidratado.nome_reduzido_pdv,
      localizacaoPrateleira: hidratado.localizacao_prateleira,
      precoVarejo: hidratado.preco_varejo,
      precoAtacado: hidratado.preco_atacado,
      precoCusto: hidratado.preco_custo,
      permitirAbaixoCusto: hidratado.permitir_abaixo_custo,
      quantidadeGatilhoAtacado: hidratado.quantidade_gatilho_atacado,
      origem: hidratado.origem as UpdateProductInput['origem'],
      temNf: hidratado.tem_nf,
      unidadeMedida: hidratado.unidade_medida as UpdateProductInput['unidadeMedida'],
      observacao: hidratado.observacao,
      categoriaId: hidratado.categoria_id,
      marcaId: hidratado.marca_id,
      fornecedorId: hidratado.fornecedor_id,
      ncm: hidratado.ncm,
      cfopProduto: hidratado.cfop_produto,
      csosn: hidratado.csosn,
      cest: hidratado.cest,
      cstPis: hidratado.cst_pis,
      cstCofins: hidratado.cst_cofins,
      icmsOrigem: hidratado.icms_origem,
    }

    const updateResult = await createProductUpdater(gerente).update({ id: produtoId, lojaId: LOJA_MATRIZ, input })
    expect(updateResult.ok).toBe(true)

    const { data: linhaFinal } = await admin
      .from('produtos')
      .select('nome, ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem')
      .eq('id', produtoId)
      .single()
    expect(linhaFinal?.nome).toBe(nomeNovo)
    expect(linhaFinal?.ncm).toBeNull()
    expect(linhaFinal?.cfop_produto).toBeNull()
    expect(linhaFinal?.csosn).toBeNull()
    expect(linhaFinal?.cest).toBeNull()
    expect(linhaFinal?.cst_pis).toBeNull()
    expect(linhaFinal?.cst_cofins).toBeNull()
    expect(linhaFinal?.icms_origem).toBeNull()
  })
})

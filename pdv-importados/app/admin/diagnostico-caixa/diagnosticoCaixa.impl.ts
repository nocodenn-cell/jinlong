import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { avaliarFlagsAmbienteCaixa } from '@/lib/caixa/diagnosticoPreProducaoEnv'
import {
  PDV_DIAGNOSTICO_SQL_SCRIPT,
  calcularVereditoDiagnostico,
  codigoProdutoDiagnosticoCaixa,
  contarPorStatus,
  type DiagnosticoCheck,
  type DiagnosticoCheckCategoria,
  type DiagnosticoCheckStatus,
  type DiagnosticoCaixaResult,
} from '@/lib/caixa/diagnosticoPreProducaoTypes'
import { ROUTES } from '@shared-core/navigation/routes'
import { obterStatusCaixaOperador } from '@/app/caixa/actions'
import { buscarProdutoComPrecoCaixa } from '@/app/caixa/actions'

type RpcDiagRow = {
  verificado_em?: string
  produto_codigo?: string
  checks?: unknown
  total_falhas?: number
  total_avisos?: number
  veredito?: string
}

function asStatus(raw: unknown): DiagnosticoCheckStatus {
  if (raw === 'ok' || raw === 'aviso' || raw === 'falha') return raw
  return 'falha'
}

function asCategoria(raw: unknown): DiagnosticoCheckCategoria {
  const allowed: DiagnosticoCheckCategoria[] = [
    'migrations',
    'rpc',
    'grants',
    'flags',
    'caixa',
    'estoque',
    'config',
  ]
  if (typeof raw === 'string' && (allowed as string[]).includes(raw)) {
    return raw as DiagnosticoCheckCategoria
  }
  return 'config'
}

function mapRpcChecks(raw: unknown): DiagnosticoCheck[] {
  if (!Array.isArray(raw)) return []
  return raw.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id ?? 'desconhecido'),
      categoria: asCategoria(r.categoria),
      titulo: String(r.titulo ?? r.id ?? 'Verificação'),
      status: asStatus(r.status),
      detalhe: String(r.detalhe ?? ''),
    }
  })
}

async function avaliarRpcCaixaOperador(): Promise<DiagnosticoCheck> {
  const res = await obterStatusCaixaOperador()
  if (!res.ok) {
    return {
      id: 'caixa_rpc_status',
      categoria: 'caixa',
      titulo: 'RPC status caixa (probe)',
      status: 'falha',
      detalhe: res.error,
      acao: 'Confira GRANT em obter_status_caixa_operador e migration 058.',
    }
  }
  const detalhe =
    res.status === 'ABERTO'
      ? `Turno aberto (caixa ${res.caixaId.slice(0, 8)}…). Operador pode vender.`
      : 'Nenhum turno aberto para este usuário — operador deve abrir caixa antes da 1ª venda.'
  return {
    id: 'caixa_rpc_status',
    categoria: 'caixa',
    titulo: 'RPC status caixa (probe)',
    status: 'ok',
    detalhe,
  }
}

async function avaliarProdutoTesteApp(codigo: string): Promise<DiagnosticoCheck[]> {
  const res = await buscarProdutoComPrecoCaixa(codigo, 1)
  if (!res.ok) {
    return [
      {
        id: 'app_produto_busca',
        categoria: 'estoque',
        titulo: 'Busca produto teste (app)',
        status: 'falha',
        detalhe: res.error,
      },
    ]
  }
  if (res.status === 'nao_encontrado') {
    return [
      {
        id: 'app_produto_busca',
        categoria: 'estoque',
        titulo: 'Busca produto teste (app)',
        status: 'aviso',
        detalhe: `Código ${codigo} não encontrado. Cadastre no catálogo ou ajuste PDV_DIAGNOSTICO_PRODUTO_CODIGO.`,
      },
    ]
  }
  if (res.status === 'ambiguo') {
    return [
      {
        id: 'app_produto_busca',
        categoria: 'estoque',
        titulo: 'Busca produto teste (app)',
        status: 'aviso',
        detalhe: res.mensagem,
      },
    ]
  }
  const q = res.produto.quantidade_estoque
  const saldoOk = q !== null && q > 0
  return [
    {
      id: 'app_produto_busca',
      categoria: 'estoque',
      titulo: 'Busca produto teste (app)',
      status: 'ok',
      detalhe: `${res.produto.nome} — preço R$ ${res.precoCalculado.toFixed(2)}.`,
    },
    {
      id: 'app_produto_estoque',
      categoria: 'estoque',
      titulo: 'Estoque produto teste (app)',
      status: saldoOk ? 'ok' : 'aviso',
      detalhe:
        q === null
          ? 'Sem registro de estoque para a loja.'
          : saldoOk
            ? `Saldo disponível: ${q}.`
            : `Saldo ${q} — venda falhará na finalização.`,
    },
  ]
}

async function carregarChecksBanco(codigo: string): Promise<{
  checks: DiagnosticoCheck[]
  rpcDisponivel: boolean
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pdv_diagnostico_pre_producao', {
    p_produto_codigo: codigo,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    const ausente =
      msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('pdv_diagnostico_pre_producao')
    return {
      rpcDisponivel: false,
      checks: [
        {
          id: 'rpc_diagnostico_pre_producao',
          categoria: 'rpc',
          titulo: 'RPC pdv_diagnostico_pre_producao',
          status: 'aviso',
          detalhe: ausente
            ? 'Migration 256 não aplicada. Execute verify_p0_producao.sql no Supabase.'
            : error.message,
          acao: 'Aplique migration 256_pdv_diagnostico_pre_producao.sql',
        },
      ],
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcDiagRow | null
  return { rpcDisponivel: true, checks: mapRpcChecks(row?.checks) }
}

export async function executarDiagnosticoCaixaPreProducao(): Promise<DiagnosticoCaixaResult> {
  await loadAdminContext({
    pathname: ROUTES.admin.diagnosticoCaixa,
    resource: `route:${ROUTES.admin.diagnosticoCaixa}`,
  })

  const produtoCodigo = codigoProdutoDiagnosticoCaixa()
  const flagChecks = avaliarFlagsAmbienteCaixa()
  const [banco, caixaProbe, produtoApp] = await Promise.all([
    carregarChecksBanco(produtoCodigo),
    avaliarRpcCaixaOperador(),
    avaliarProdutoTesteApp(produtoCodigo),
  ])

  const checks: DiagnosticoCheck[] = [
    ...flagChecks,
    ...banco.checks,
    caixaProbe,
    ...produtoApp,
  ]

  const { totalFalhas, totalAvisos } = contarPorStatus(checks)

  return {
    veredito: calcularVereditoDiagnostico(checks),
    verificadoEm: new Date().toISOString(),
    produtoCodigo,
    totalFalhas,
    totalAvisos,
    checks,
    sqlScriptPath: PDV_DIAGNOSTICO_SQL_SCRIPT,
  }
}

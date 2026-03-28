import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useCartStore } from './stores/cartStore'
import type { ItemCarrinho } from '@core/cart/types'
import type { RegraPreco } from '@core/pricing/types'
import { defaultPdvConfig } from './config/pdvConfig'
import {
  buildMapaProdutoChaves,
  produtosCatalogoAtivos,
  resolverProdutoNoCatalogo,
  type ProdutoCacheLite,
} from './catalogoLookup'

type RegraPrecoCacheLite = {
  id: string
  tipo_regra: string
  produto_id: string | null | undefined
  categoria_id: string | null | undefined
  quantidade_minima: number
  quantidade_maxima: number | null | undefined
  tipo_desconto: string
  valor_desconto: number
  data_validade: string | null | undefined
  ativo: boolean
}

type CatalogoLocalInvoke = {
  produtos?: ProdutoCacheLite[]
  regras?: RegraPrecoCacheLite[]
}

type OutboxResumo = {
  pendentes_total: number
  prontos_sync: number
  em_backoff: number
  dlq: number
}

export function App() {
  const [status] = useState<'online' | 'offline'>('offline')
  const [codigo, setCodigo] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  // Estado de sync removido da UI para simplificar o MVP local-first
  // Mantemos apenas a venda local em SQLite.

  const {
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    totalItens,
    totalUnidades,
    setRegras,
    adicionarItem,
    alterarQuantidade,
    removerItem,
    limparCarrinho,
  } = useCartStore()
  const {
    aplicarDescontoGerente,
    descontoGerentePercentual,
    descontoGerenteValor,
    setMaxDescontoGerentePercentual,
    maxDescontoGerentePercentual,
  } = useCartStore()

  const [tauriDisponivel, setTauriDisponivel] = useState(false)

  const [produtosPorCodigoBarras, setProdutosPorCodigoBarras] = useState<
    Record<string, ProdutoCacheLite>
  >({})
  const [produtosCatalogo, setProdutosCatalogo] = useState<ProdutoCacheLite[]>(
    []
  )
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true)
  const [ultimoErroSincCatalogo, setUltimoErroSincCatalogo] = useState<
    string | null
  >(null)
  const [sincronizandoCatalogo, setSincronizandoCatalogo] = useState(false)

  const [caixaAtualId, setCaixaAtualId] = useState<string | null>(null)

  const [outboxResumo, setOutboxResumo] = useState<OutboxResumo | null>(null)
  const [reprocessandoDlq, setReprocessandoDlq] = useState(false)

  const [gerenteId, setGerenteId] = useState(defaultPdvConfig.gerenteId)
  const [gerenteSenhaSha256, setGerenteSenhaSha256] = useState(
    defaultPdvConfig.gerenteSenhaSha256
  )

  const sha256Hex = async (value: string) => {
    const bytes = new TextEncoder().encode(value)
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  const aplicarCacheCatalogo = useCallback(
    (cache: CatalogoLocalInvoke | null | undefined) => {
      if (!cache) return
      const regras: RegraPreco[] = (cache.regras ?? [])
        .filter((r: RegraPrecoCacheLite) => r.ativo)
        .map((r: RegraPrecoCacheLite) => ({
          id: r.id,
          tipoRegra: r.tipo_regra === 'PRODUTO' ? 'PRODUTO' : 'CATEGORIA',
          produtoId: r.produto_id ?? undefined,
          categoriaId: r.categoria_id ?? undefined,
          quantidadeMinima: r.quantidade_minima,
          quantidadeMaxima: r.quantidade_maxima ?? undefined,
          tipoDesconto:
            r.tipo_desconto === 'VALOR_FIXO' ? 'VALOR_FIXO' : 'PERCENTUAL',
          valorDesconto: r.valor_desconto,
          dataValidade: r.data_validade ?? undefined,
          ativo: r.ativo,
        }))

      setRegras(regras)

      const produtosArr = cache.produtos ?? []
      setProdutosCatalogo(produtosCatalogoAtivos(produtosArr))
      setProdutosPorCodigoBarras(buildMapaProdutoChaves(produtosArr))
    },
    [setRegras]
  )

  const sincronizarCatalogoManual = useCallback(async () => {
    if (!tauriDisponivel) return
    setSincronizandoCatalogo(true)
    setUltimoErroSincCatalogo(null)
    try {
      const r = await invoke<{
        produtos_salvos: number
        regras_salvas: number
      }>('sync_catalogo_real_cmd')
      const cache2 = (await invoke(
        'catalogo_local_get_cmd'
      )) as CatalogoLocalInvoke
      aplicarCacheCatalogo(cache2)
      setMensagem(
        `Catálogo atualizado: ${r.produtos_salvos} produto(s), ${r.regras_salvas} regra(s).`
      )
    } catch (e) {
      const msg = String(e)
      setUltimoErroSincCatalogo(msg)
      setMensagem(`Falha ao sincronizar: ${msg}`)
    } finally {
      setSincronizandoCatalogo(false)
    }
  }, [tauriDisponivel, aplicarCacheCatalogo])

  const refreshOutboxResumo = useCallback(async () => {
    if (!tauriDisponivel) return
    try {
      const r = await invoke<OutboxResumo>('outbox_resumo_cmd')
      setOutboxResumo(r)
    } catch {
      setOutboxResumo(null)
    }
  }, [tauriDisponivel])

  useEffect(() => {
    if (!tauriDisponivel) return
    void refreshOutboxResumo()
    const id = window.setInterval(() => void refreshOutboxResumo(), 12000)
    return () => window.clearInterval(id)
  }, [tauriDisponivel, refreshOutboxResumo])

  useEffect(() => {
    // O Tauri injeta `window.__TAURI__` depois do primeiro render.
    // Usamos state para garantir atualização do UI.
    const check = () => {
      const w = window as unknown as {
        __TAURI__?: { core?: { invoke?: unknown } }
      }
      return w?.__TAURI__?.core?.invoke !== undefined
    }

    // Checagem imediata
    setTauriDisponivel(check())

    // Retry curto (evita estado "travado" no false)
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      if (check()) {
        setTauriDisponivel(true)
        window.clearInterval(t)
      } else if (tries >= 15) {
        window.clearInterval(t)
      }
    }, 200)

    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!tauriDisponivel) return

    let cancelled = false

    async function inicializar() {
      try {
        const cfg = await invoke('pdv_config_local_get_cmd')
        if (!cancelled && cfg) {
          setGerenteId(cfg.gerente_id ?? defaultPdvConfig.gerenteId)
          setGerenteSenhaSha256(
            cfg.gerente_senha_sha256 ?? defaultPdvConfig.gerenteSenhaSha256
          )
          setMaxDescontoGerentePercentual(
            Number(cfg.max_desconto_gerente_percentual ?? defaultPdvConfig.maxDescontoGerentePercentual)
          )
        }
      } catch {
        // fallback abaixo
      }

      // Recupera caixa aberto anterior (se existir).
      try {
        const caixa = await invoke('load_caixa_atual_cmd')
        if (!cancelled && caixa?.id) {
          setCaixaAtualId(String(caixa.id))
        }
      } catch {
        // ignora
      }

      // Tenta atualizar catálogo/config online, mas não trava o caixa offline.
      try {
        await invoke('sync_pdv_config_real_cmd')
        const cfg2 = await invoke('pdv_config_local_get_cmd')
        if (!cancelled && cfg2) {
          setGerenteId(cfg2.gerente_id ?? defaultPdvConfig.gerenteId)
          setGerenteSenhaSha256(
            cfg2.gerente_senha_sha256 ?? defaultPdvConfig.gerenteSenhaSha256
          )
          setMaxDescontoGerentePercentual(
            Number(
              cfg2.max_desconto_gerente_percentual ?? defaultPdvConfig.maxDescontoGerentePercentual
            )
          )
        }
      } catch {
        // offline: mantém cache local/fallback
      }

      try {
        const cache1 = (await invoke(
          'catalogo_local_get_cmd'
        )) as CatalogoLocalInvoke
        if (!cancelled) aplicarCacheCatalogo(cache1)
      } catch {
        // sem cache local ainda
      }

      try {
        await invoke('sync_catalogo_real_cmd')
        const cache2 = (await invoke(
          'catalogo_local_get_cmd'
        )) as CatalogoLocalInvoke
        if (!cancelled) {
          aplicarCacheCatalogo(cache2)
          setUltimoErroSincCatalogo(null)
        }
      } catch (e) {
        if (!cancelled) setUltimoErroSincCatalogo(String(e))
        // offline ou .env ausente: mantém cache local já carregado
      } finally {
        if (!cancelled) setCarregandoCatalogo(false)
      }
    }

    inicializar()
    return () => {
      cancelled = true
    }
  }, [
    tauriDisponivel,
    setMaxDescontoGerentePercentual,
    aplicarCacheCatalogo,
  ])

  // Auto-sync: enquanto existir caixa aberto, tentamos descarregar o outbox.
  useEffect(() => {
    if (!tauriDisponivel) return
    if (!caixaAtualId) return

    let running = false
    const t = window.setInterval(() => {
      if (running) return
      running = true
      invoke('sync_outbox_real_cmd', { limite: 50 })
        .catch(() => {
          // Sem bloquear o caixa offline
        })
        .finally(() => {
          void refreshOutboxResumo()
          running = false
        })
    }, 15000)

    return () => window.clearInterval(t)
  }, [tauriDisponivel, caixaAtualId, refreshOutboxResumo])

  function adicionarDoCatalogo() {
    const trimmed = codigo.trim()
    if (!trimmed) return

    const produto = resolverProdutoNoCatalogo(
      trimmed,
      produtosPorCodigoBarras,
      produtosCatalogo
    )
    if (!produto) {
      if (produtosCatalogo.length === 0) {
        setMensagem(
          'Catálogo local vazio. Confira o .env (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY) e use «Sincronizar catálogo».'
        )
      } else {
        setMensagem(
          'Produto não encontrado no catálogo local. Verifique código de barras cadastrado ou digite o nome.'
        )
      }
      return
    }

    const item: ItemCarrinho = {
      id: `${produto.id}-${Date.now()}`,
      produtoId: produto.id,
      nome: produto.nome,
      quantidade: 1,
      precoVariejo: produto.preco_varejo,
      categoriaId: produto.categoria_id ?? undefined,
    }

    adicionarItem(item)
    setCodigo('')
    setMensagem(null)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f3f4f6',
        color: '#111827',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
            PDV Local · Caixa 01 · Operador
          </div>
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Tela clara, otimizada para frente de caixa
            {tauriDisponivel && !carregandoCatalogo && (
              <span style={{ marginLeft: 8, color: '#9ca3af' }}>
                · {produtosCatalogo.length} produto(s) no cache local
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={() => void sincronizarCatalogoManual()}
            disabled={!tauriDisponivel || sincronizandoCatalogo}
            style={{
              fontSize: '0.8rem',
              fontWeight: 500,
              padding: '0.35rem 0.75rem',
              borderRadius: 999,
              border: '1px solid #d1d5db',
              background:
                !tauriDisponivel || sincronizandoCatalogo ? '#f3f4f6' : '#ffffff',
              color: !tauriDisponivel || sincronizandoCatalogo ? '#9ca3af' : '#374151',
              cursor:
                !tauriDisponivel || sincronizandoCatalogo ? 'default' : 'pointer',
            }}
          >
            {sincronizandoCatalogo ? 'Sincronizando…' : 'Sincronizar catálogo'}
          </button>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 500,
              padding: '0.25rem 0.75rem',
              borderRadius: 999,
              backgroundColor: status === 'online' ? '#dcfce7' : '#ffedd5',
              color: status === 'online' ? '#166534' : '#9a3412',
            }}
          >
            {status === 'online' ? 'Online' : 'Offline (seguro)'}
          </div>
        </div>
      </header>

      {tauriDisponivel &&
        outboxResumo &&
        (outboxResumo.dlq > 0 || outboxResumo.pendentes_total > 0) && (
          <div
            style={{
              padding: '0.45rem 1.5rem',
              fontSize: 13,
              borderBottom: '1px solid #e5e7eb',
              backgroundColor:
                outboxResumo.dlq > 0
                  ? '#fef2f2'
                  : outboxResumo.em_backoff > 0
                    ? '#fffbeb'
                    : '#eff6ff',
              color: outboxResumo.dlq > 0 ? '#991b1b' : '#374151',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {outboxResumo.dlq > 0 ? (
              <>
                <strong>{outboxResumo.dlq}</strong>
                <span>
                  evento(s) parados após várias falhas de sync (DLQ). Repor na fila para
                  tentar de novo.
                </span>
                <button
                  type="button"
                  disabled={reprocessandoDlq}
                  onClick={() => {
                    void (async () => {
                      setReprocessandoDlq(true)
                      try {
                        await invoke('outbox_reprocessar_dlq_cmd')
                        await invoke('sync_outbox_real_cmd', { limite: 50 })
                        await refreshOutboxResumo()
                        setMensagem(
                          'Eventos repostos na fila. Sync executada em seguida.'
                        )
                      } catch (e) {
                        setMensagem(`Falha ao reprocessar fila: ${String(e)}`)
                      } finally {
                        setReprocessandoDlq(false)
                      }
                    })()
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '0.25rem 0.65rem',
                    borderRadius: 8,
                    border: '1px solid #dc2626',
                    background: reprocessandoDlq ? '#fecaca' : '#ffffff',
                    color: '#991b1b',
                    cursor: reprocessandoDlq ? 'default' : 'pointer',
                  }}
                >
                  {reprocessandoDlq ? 'Processando…' : 'Repor na fila'}
                </button>
              </>
            ) : (
              <>
                <span>
                  Fila de sync: <strong>{outboxResumo.prontos_sync}</strong> pronto(s)
                </span>
                {outboxResumo.em_backoff > 0 ? (
                  <span style={{ color: '#92400e' }}>
                    · <strong>{outboxResumo.em_backoff}</strong> aguardando intervalo (retry
                    com backoff)
                  </span>
                ) : null}
              </>
            )}
          </div>
        )}

      {!tauriDisponivel && (
        <div
          style={{
            padding: '0.5rem 1.5rem',
            fontSize: 13,
            color: '#92400e',
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fbbf24',
          }}
        >
          Execução fora do Tauri. Abra o app desktop para gravar as vendas localmente.
        </div>
      )}

      {tauriDisponivel && !carregandoCatalogo && produtosCatalogo.length === 0 && (
        <div
          style={{
            padding: '0.5rem 1.5rem',
            fontSize: 13,
            color: '#92400e',
            backgroundColor: '#fffbeb',
            borderBottom: '1px solid #fbbf24',
          }}
        >
          <strong>Catálogo vazio.</strong> Copie{' '}
          <code style={{ fontSize: 12 }}>pdv-local/.env.example</code> para{' '}
          <code style={{ fontSize: 12 }}>.env</code>, preencha{' '}
          <code style={{ fontSize: 12 }}>SUPABASE_URL</code> e{' '}
          <code style={{ fontSize: 12 }}>SUPABASE_SERVICE_ROLE_KEY</code>, reinicie o
          app e clique em <strong>Sincronizar catálogo</strong>.
          {ultimoErroSincCatalogo && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#b45309' }}>
              Detalhe: {ultimoErroSincCatalogo}
            </div>
          )}
        </div>
      )}

      <main
        style={{
          flex: 1,
          padding: '1.25rem 1.5rem 1.5rem',
          display: 'grid',
          gridTemplateColumns: '2.2fr 1fr',
          gap: '1rem',
        }}
      >
        <section
          style={{
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <h2
            style={{
              fontSize: '1rem',
              marginBottom: '0.25rem',
              fontWeight: 600,
              color: '#111827',
            }}
          >
            Leitura de código / produto
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adicionarDoCatalogo()
              }}
              placeholder="Código de barras ou nome do produto..."
              style={{
                flex: 1,
                padding: '0.7rem 0.85rem',
                borderRadius: 999,
                border: '1px solid #d1d5db',
                backgroundColor: '#f9fafb',
                color: '#111827',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <button
              onClick={adicionarDoCatalogo}
              style={{
                padding: '0.7rem 1rem',
                borderRadius: 999,
                border: 'none',
                background: '#16a34a',
                color: '#ecfdf3',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Adicionar
            </button>
            <button
              onClick={limparCarrinho}
              disabled={itens.length === 0}
              style={{
                padding: '0.7rem 1rem',
                borderRadius: 999,
                border: '1px solid #d1d5db',
                background: itens.length === 0 ? '#f9fafb' : '#ffffff',
                color: itens.length === 0 ? '#9ca3af' : '#374151',
                fontSize: 13,
                fontWeight: 500,
                cursor: itens.length === 0 ? 'default' : 'pointer',
              }}
            >
              Novo cupom
            </button>
          </div>
          {mensagem && (
            <p
              style={{
                fontSize: 13,
                ...(mensagem.startsWith('Falha')
                  ? { color: '#b91c1c', backgroundColor: '#fee2e2' }
                  : mensagem.includes('vazio') || mensagem.includes('.env')
                    ? { color: '#92400e', backgroundColor: '#fffbeb' }
                    : { color: '#166534', backgroundColor: '#dcfce7' }),
                padding: '0.35rem 0.6rem',
                borderRadius: 999,
                alignSelf: 'flex-start',
              }}
            >
              {mensagem}
            </p>
          )}

          <div
            style={{
              marginTop: '0.5rem',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '3fr 0.8fr 1fr 1fr 0.9fr',
                padding: '0.5rem 0.75rem',
                fontSize: 12,
                background: '#f9fafb',
                color: '#4b5563',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <span>Produto</span>
              <span style={{ textAlign: 'right' }}>Qtde</span>
              <span style={{ textAlign: 'right' }}>Unit.</span>
              <span style={{ textAlign: 'right' }}>Total</span>
              <span style={{ textAlign: 'right' }}>Tipo</span>
            </div>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
              }}
            >
              {itens.length === 0 ? (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    color: '#9ca3af',
                  }}
                >
                  Nenhum item no carrinho.
                </div>
              ) : (
                itens.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '3fr 0.8fr 1fr 1fr 0.9fr',
                      padding: '0.45rem 0.75rem',
                      fontSize: 12,
                      borderBottom: '1px solid #f3f4f6',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{item.nome}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#9ca3af',
                        }}
                      >
                        Cód: {item.produtoId}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) =>
                          alterarQuantidade(item.id, Number(e.target.value))
                        }
                        style={{
                          width: 52,
                          textAlign: 'right',
                          fontSize: 11,
                          padding: '2px 4px',
                          borderRadius: 6,
                          border: '1px solid #d1d5db',
                          background: '#ffffff',
                          color: '#111827',
                        }}
                      />
                      <button
                        onClick={() => removerItem(item.id)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#b91c1c',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        x
                      </button>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      R$ {' '}
                      {item.resultado.precoOriginal.toFixed(2)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      R$ {' '}
                      {(item.resultado.precoUnitario * item.quantidade).toFixed(2)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {item.resultado.tipoPreco === 'ATACADO' ? (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 999,
                            border: '1px solid rgba(22,163,74,0.4)',
                            color: '#166534',
                            backgroundColor: '#dcfce7',
                          }}
                        >
                          ATACADO
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 999,
                            border: '1px solid #d1d5db',
                            color: '#374151',
                            backgroundColor: '#f9fafb',
                          }}
                        >
                          VAREJO
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div
            style={{
              marginTop: '0.5rem',
              fontSize: 12,
              color: '#6b7280',
            }}
          >
            Itens: {totalItens} · Unidades: {totalUnidades}
          </div>
        </section>

        <section
          style={{
            borderRadius: '0.75rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
            backgroundColor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: 4,
                color: '#111827',
              }}
            >
              Totais
            </h3>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
            >
              <span>Bruto</span>
              <span>
                R$ {totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                color: '#16a34a',
              }}
            >
              <span>
                Descontos automáticos (atacado)
              </span>
              <span>
                - R$ {totalDesconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {descontoGerentePercentual > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: '#dc2626',
                }}
              >
                <span>Desconto gerente ({descontoGerentePercentual.toFixed(1)}%)</span>
                <span>
                  - R${' '}
                  {descontoGerenteValor.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 19,
                fontWeight: 700,
                marginTop: 8,
              }}
            >
              <span>Total a pagar</span>
              <span>
                R$ {totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              disabled={itens.length === 0}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: 999,
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                color: itens.length === 0 ? '#9ca3af' : '#374151',
                fontSize: 12,
                fontWeight: 500,
                cursor: itens.length === 0 ? 'default' : 'pointer',
              }}
              onClick={async () => {
                if (!itens.length) return
                const senha = window.prompt('Senha do gerente para aplicar desconto especial:')
                if (!senha) return
                const senhaSha = await sha256Hex(senha)
                if (senhaSha !== gerenteSenhaSha256) {
                  setMensagem('Senha de gerente inválida.')
                  return
                }
                const entrada = window.prompt(
                  `Informe o desconto especial em % (máx. ${maxDescontoGerentePercentual}%):`,
                  descontoGerentePercentual > 0 ? String(descontoGerentePercentual) : '5'
                )
                if (!entrada) return
                const valor = Number(entrada.replace(',', '.'))
                if (Number.isNaN(valor) || valor < 0) {
                  setMensagem('Valor de desconto inválido.')
                  return
                }
                aplicarDescontoGerente(valor)
                setMensagem(`Desconto especial de ${valor.toFixed(1)}% aplicado pelo gerente.`)
              }}
            >
              Desconto especial (gerente)
            </button>

            {!caixaAtualId ? (
              <button
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#111827',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  if (!tauriDisponivel) {
                    setMensagem('Abra pelo app desktop (Tauri).')
                    return
                  }
                  try {
                    const trocoRaw = window.prompt(
                      'Troco inicial do caixa (R$):',
                      '0'
                    )
                    const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
                    const caixaId = await invoke('abrir_caixa_cmd', {
                      operador_id: null,
                      troco_inicial: Number.isFinite(troco) ? troco : 0,
                    })
                    setCaixaAtualId(String(caixaId))
                    setMensagem('Caixa aberto.')
                  } catch (e) {
                    setMensagem(`Falha ao abrir caixa: ${String(e)}`)
                  }
                }}
              >
                F2 · Abrir caixa
              </button>
            ) : (
              <button
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#111827',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={async () => {
                  if (!caixaAtualId) return
                  try {
                    const trocoRaw = window.prompt(
                      'Valor em caixa para fechamento (R$):',
                      String(totalLiquido.toFixed(2))
                    )
                    const troco = trocoRaw ? Number(trocoRaw.replace(',', '.')) : 0
                    await invoke('fechar_caixa_cmd', {
                      caixa_id: caixaAtualId,
                      troco_fechamento: Number.isFinite(troco) ? troco : 0,
                    })
                    setCaixaAtualId(null)
                    setMensagem('Caixa fechado.')
                  } catch (e) {
                    setMensagem(`Falha ao fechar caixa: ${String(e)}`)
                  }
                }}
              >
                F3 · Fechar caixa
              </button>
            )}

            {caixaAtualId && (
              <button
                style={{
                  padding: '0.55rem 0.9rem',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  background: '#ffffff',
                  color: '#111827',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: itens.length === 0 ? 'default' : 'pointer',
                }}
                onClick={async () => {
                  try {
                    const tipo = window.prompt(
                      'Movimento de caixa (SANGRIA ou SUPRIMENTO):',
                      'SANGRIA'
                    )
                    if (!tipo) return
                    const valorRaw = window.prompt('Valor do movimento (R$):', '10')
                    if (!valorRaw) return
                    const valor = Number(valorRaw.replace(',', '.'))
                    if (!Number.isFinite(valor) || valor <= 0) return
                    await invoke('registrar_movimento_caixa_cmd', {
                      caixa_id: caixaAtualId,
                      tipo: tipo.toUpperCase(),
                      valor,
                      observacao: null,
                    })
                    setMensagem('Movimento registrado.')
                  } catch (e) {
                    setMensagem(`Falha ao registrar movimento: ${String(e)}`)
                  }
                }}
              >
                F4 · Sangria/Suprimento
              </button>
            )}
            <button
              disabled={itens.length === 0}
              style={{
                padding: '0.9rem 0.9rem',
                borderRadius: 999,
                border: 'none',
                background: itens.length === 0 ? '#bbf7d0' : '#16a34a',
                color: '#ecfdf3',
                fontSize: 14,
                fontWeight: 500,
                cursor: itens.length === 0 ? 'default' : 'pointer',
              }}
              onClick={async () => {
                if (!itens.length) return
                if (!tauriDisponivel) {
                  setMensagem(
                    'Execução fora do Tauri. Abra pelo app desktop (janela do Tauri), não pelo navegador em http://localhost:4173.'
                  )
                  return
                }

                // Garante uma sessão de caixa aberta antes de registrar a venda.
                let caixaId = caixaAtualId
                if (!caixaId) {
                  try {
                    const atual = await invoke('load_caixa_atual_cmd')
                    if (atual?.id) {
                      caixaId = String(atual.id)
                      setCaixaAtualId(caixaId)
                    } else {
                      caixaId = await invoke('abrir_caixa_cmd', {
                        operador_id: null,
                        troco_inicial: 0,
                      })
                      setCaixaAtualId(String(caixaId))
                    }
                  } catch (e) {
                    setMensagem(`Falha ao abrir caixa: ${String(e)}`)
                    return
                  }
                }

                try {
                  await invoke('registrar_venda', {
                    venda: {
                      caixa_id: caixaId,
                      operador_id: null,
                      forma_pagamento: 'DINHEIRO',
                      total_bruto: totalBruto,
                      total_desconto: totalDesconto,
                      total_liquido: totalLiquido,
                      desconto_gerente_percentual:
                        descontoGerentePercentual > 0 ? descontoGerentePercentual : null,
                      desconto_gerente_valor:
                        descontoGerentePercentual > 0 ? descontoGerenteValor : null,
                      gerente_id:
                        descontoGerentePercentual > 0 ? gerenteId : null,
                      itens: itens.map((i) => ({
                        produto_id: i.produtoId,
                        nome: i.nome,
                        quantidade: i.quantidade,
                        preco_original: i.resultado.precoOriginal,
                        preco_unitario: i.resultado.precoUnitario,
                      })),
                    },
                  })
                  limparCarrinho()
                  try {
                    await invoke('sync_outbox_real_cmd', { limite: 50 })
                    await refreshOutboxResumo()
                    setMensagem('Venda registrada e sincronizada (quando possível).')
                  } catch {
                    await refreshOutboxResumo()
                    setMensagem('Venda registrada localmente. Sincronização pendente.')
                  }
                } catch (e) {
                  console.error(e)
                  setMensagem(`Falha ao registrar venda local: ${String(e)}`)
                }
              }}
            >
              F5 · Finalizar
            </button>
            <div
              style={{
                fontSize: 11,
                color: '#9ca3af',
              }}
            >
              Atalhos (futuros): F5 Dinheiro · F9 PIX · F10 Cartão.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}


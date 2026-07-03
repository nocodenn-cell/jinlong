import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useDesktopCartStore } from './stores/cartStore'
import type { ItemCarrinho } from '@core/cart/types'
import { defaultPdvConfig } from './config/pdvConfig'
import { resolverProdutoNoCatalogo, type ProdutoCacheLite } from './catalogoLookup'
import { mensagemErroDeExcecao } from './lib/mensagemErroUsuario'
import { logger } from './lib/logger'
import { usePdvLocalCatalogo } from './hooks/usePdvLocalCatalogo'
import { usePdvLocalOutboxSync } from './hooks/usePdvLocalOutboxSync'
import { usePdvLocalVendaCaixaFlow } from './hooks/usePdvLocalVendaCaixaFlow'
import { usePdvLocalKeyboardShortcuts } from './hooks/usePdvLocalKeyboardShortcuts'
import { pricingService } from '@shared/pricing/PricingService'
import { colors } from './styles/colors'

function mensagemEhErro(msg: string): boolean {
  return /^(falha|não foi possível|sessão|acesso negado|problema|muitas tentativas|dados inválidos|configuração inválida|limite de envio|este registro|você não tem permissão)/i.test(
    msg.trim(),
  )
}

function mensagemEhAviso(msg: string): boolean {
  const t = msg.toLowerCase()
  return t.includes('vazio') || t.includes('.env') || t.startsWith('motivo:')
}

function corIndicadorSync(statusSync: string): string {
  if (statusSync === 'ok') return colors.syncOk
  if (statusSync === 'pendente') return colors.syncPending
  return colors.syncError
}

function bgOutboxBanner(resumo: { dlq: number; em_backoff: number }): string {
  if (resumo.dlq > 0) return colors.errorBg
  if (resumo.em_backoff > 0) return colors.warningBg
  return colors.infoBg
}

function estiloBannerMensagem(mensagem: string): Pick<CSSProperties, 'color' | 'backgroundColor'> {
  if (mensagemEhErro(mensagem)) {
    return { color: colors.errorText, backgroundColor: colors.errorBg }
  }
  if (mensagemEhAviso(mensagem)) {
    return { color: colors.warningText, backgroundColor: colors.warningBg }
  }
  return { color: colors.successText, backgroundColor: colors.successBg }
}

export function App() {
  const [status] = useState<'online' | 'offline'>('offline')
  const [codigo, setCodigo] = useState('')
  const [mensagem, setMensagem] = useState<string | null>(null)
  // Caixa local-first: vendas em SQLite; fila outbox sincroniza em background quando há caixa aberto.

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
  } = useDesktopCartStore()
  const {
    aplicarDescontoGerente,
    descontoGerentePercentual,
    descontoGerenteValor,
    descontoGerenteToken,
    setMaxDescontoGerentePercentual,
    maxDescontoGerentePercentual,
  } = useDesktopCartStore()

  const [gerenteId, setGerenteId] = useState(defaultPdvConfig.gerenteId)
  const [caixaAtualId, setCaixaAtualId] = useState<string | null>(null)

  const {
    tauriDisponivel,
    produtosPorCodigoBarras,
    produtosCatalogo,
    carregandoCatalogo,
    ultimoErroSincCatalogo,
    sincronizandoCatalogo,
    sincronizarCatalogoManual,
    regrasRef,
  } = usePdvLocalCatalogo({
    setRegras,
    setGerenteId,
    setMaxDescontoGerentePercentual,
    setCaixaAtualId,
    setMensagem,
  })

  const [confirmarLimparAte, setConfirmarLimparAte] = useState(0)
  const inputLeituraRef = useRef<HTMLInputElement | null>(null)
  const [inputLeituraFocado, setInputLeituraFocado] = useState(false)
  const [metricaAddItemMs, setMetricaAddItemMs] = useState<number | null>(null)
  const [metricaFinalizarMs, setMetricaFinalizarMs] = useState<number | null>(null)
  const [metricaSyncMs, setMetricaSyncMs] = useState<number | null>(null)

  const atualizarMediaMs = (atual: number | null, nova: number) => {
    if (!Number.isFinite(nova) || nova < 0) return atual
    if (atual === null) return nova
    // EMA simples para suavizar os números em tempo real.
    return Math.round((atual * 0.7 + nova * 0.3) * 10) / 10
  }

  const focarInputLeitura = useCallback(() => {
    globalThis.setTimeout(() => inputLeituraRef.current?.focus(), 0)
  }, [])

  const {
    outboxResumo,
    ultimoErroOutbox,
    reprocessandoDlq,
    statusSync,
    executarSyncOutboxComMetrica,
    refreshOutboxResumo,
    reprocessarDlq,
  } = usePdvLocalOutboxSync({
    tauriDisponivel,
    caixaAtualId,
    onSyncElapsedMs: (elapsed) =>
      setMetricaSyncMs((prev) => atualizarMediaMs(prev, elapsed)),
    onMensagem: setMensagem,
    formatarErro: mensagemErroDeExcecao,
  })

  const {
    isFinalizandoVenda,
    abrirCaixa,
    fecharCaixa,
    registrarMovimentoCaixa,
    finalizarVenda,
  } = usePdvLocalVendaCaixaFlow({
    tauriDisponivel,
    caixaAtualId,
    itens,
    totalBruto,
    totalDesconto,
    totalLiquido,
    descontoGerentePercentual,
    descontoGerenteValor,
    descontoGerenteToken,
    maxDescontoGerentePercentual,
    gerenteId,
    onSetCaixaAtualId: setCaixaAtualId,
    onSetMensagem: setMensagem,
    onLimparCarrinho: limparCarrinho,
    onSyncOutbox: executarSyncOutboxComMetrica,
    onRefreshOutboxResumo: refreshOutboxResumo,
    onFinalizarElapsedMs: (elapsed) =>
      setMetricaFinalizarMs((prev) => atualizarMediaMs(prev, elapsed)),
    formatarErro: mensagemErroDeExcecao,
    logError: (message, payload) =>
      logger.error(message, (payload as Record<string, unknown> | undefined) ?? undefined),
  })

  useEffect(() => {
    // Mantém fluxo "zero mouse": ao mudar carrinho, volta foco na leitura.
    focarInputLeitura()
  }, [itens.length, focarInputLeitura])

  const handleNovoCupom = useCallback(() => {
    if (itens.length === 0) return
    const agora = Date.now()
    if (confirmarLimparAte < agora) {
      setConfirmarLimparAte(agora + 2200)
      setMensagem('Toque novamente em "Novo Cupom (F8)" em até 2s para confirmar limpeza.')
      return
    }
    limparCarrinho()
    setConfirmarLimparAte(0)
    setMensagem('Cupom limpo.')
    focarInputLeitura()
  }, [itens.length, confirmarLimparAte, limparCarrinho, focarInputLeitura])

  usePdvLocalKeyboardShortcuts({
    caixaAberto: caixaAtualId !== null,
    itensNoCarrinho: itens.length > 0,
    isFinalizandoVenda,
    onFinalizar: finalizarVenda,
    onFecharCaixa: () => void fecharCaixa(),
    onFocarLeitura: focarInputLeitura,
    onNovoCupom: handleNovoCupom,
    onRegistrarMovimento: () => void registrarMovimentoCaixa(),
  })

  function adicionarDoCatalogo() {
    const t0 = performance.now()
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
          'Catálogo local vazio. Confira o .env (SYNC_ENDPOINT e SYNC_KEY), faça deploy da Edge e use «Sincronizar catálogo».'
        )
      } else {
        setMensagem(
          'Produto não encontrado no catálogo local. Verifique código de barras cadastrado ou digite o nome.'
        )
      }
      return
    }

    const itemBase: ItemCarrinho = {
      id: `${produto.id}-${Date.now()}`,
      produtoId: produto.id,
      nome: produto.nome,
      quantidade: 1,
      precoVariejo: produto.preco_varejo,
      precoUnitario: produto.preco_varejo,
      precoOriginal: produto.preco_varejo,
      categoriaId: produto.categoria_id ?? undefined,
      resultado: {
        precoUnitario: produto.preco_varejo,
        precoOriginal: produto.preco_varejo,
        descontoUnitario: 0,
        tipoPreco: 'VAREJO',
      },
    }
    const resultado = pricingService.calcularPrecoItem(
      itemBase,
      regrasRef.current,
      useDesktopCartStore.getState().pricingCtx,
    )
    const item: ItemCarrinho = {
      ...itemBase,
      precoUnitario: resultado.precoUnitario,
      precoOriginal: resultado.precoOriginal,
      resultado,
    }

    adicionarItem(item)
    setCodigo('')
    setMensagem(null)
    const elapsed = performance.now() - t0
    setMetricaAddItemMs((prev) => atualizarMediaMs(prev, elapsed))
    focarInputLeitura()
  }

  const ultimoItemAdicionado = itens.length > 0 ? itens[itens.length - 1] : null

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.background,
        color: colors.foreground,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '0.75rem 1.5rem',
          borderBottom: `1px solid ${colors.headerBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: colors.headerBg,
        }}
      >
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: colors.headerTextPrimary }}>
            PDV Local · Caixa 01 · Operador
          </div>
          <div style={{ fontSize: '0.8rem', color: colors.headerTextSecondary }}>
            Tela clara, otimizada para frente de caixa
            {tauriDisponivel && !carregandoCatalogo && (
              <span style={{ marginLeft: 8, color: colors.headerTextMuted }}>
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
              border: `1px solid ${colors.buttonBorder}`,
              background:
                !tauriDisponivel || sincronizandoCatalogo ? colors.background : colors.buttonBg,
              color: !tauriDisponivel || sincronizandoCatalogo ? colors.textDisabled : colors.buttonText,
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
              backgroundColor: status === 'online' ? colors.onlineBg : colors.offlineBg,
              color: status === 'online' ? colors.onlineText : colors.offlineText,
            }}
          >
            {status === 'online' ? 'Online' : 'Offline (seguro)'}
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              color: colors.textSecondary,
              padding: '0.2rem 0.6rem',
              borderRadius: 999,
              background: colors.metricBg,
              border: `1px solid ${colors.metricBorder}`,
              display: 'flex',
              gap: 8,
            }}
            title="Métricas locais de performance do PDV"
          >
            <span>Leitura→item: {metricaAddItemMs ?? '—'} ms</span>
            <span>Finalizar: {metricaFinalizarMs ?? '—'} ms</span>
            <span>Sync: {metricaSyncMs ?? '—'} ms</span>
          </div>
        </div>
      </header>
      <div
        title={
          statusSync === 'ok'
            ? 'Sincronização em dia'
            : statusSync === 'pendente'
              ? 'Existem pendências de sincronização'
              : 'Modo offline'
        }
        style={{
          position: 'fixed',
          right: 16,
          bottom: 14,
          width: 14,
          height: 14,
          borderRadius: '50%',
          zIndex: 30,
          border: `2px solid ${colors.syncDotBorder}`,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
          backgroundColor: corIndicadorSync(statusSync),
        }}
      />

      {tauriDisponivel && ultimoErroOutbox && (
        <div
          style={{
            padding: '0.45rem 1.5rem',
            fontSize: 12,
            borderBottom: `1px solid ${colors.warningBorder}`,
            backgroundColor: colors.warningBg,
            color: colors.warningText,
          }}
        >
          <strong>Última falha de sync (fila):</strong> {ultimoErroOutbox}
          <span style={{ marginLeft: 8, opacity: 0.85 }}>
            (tentativas continuam em segundo plano; verifique rede, SYNC_ENDPOINT e SYNC_KEY)
          </span>
        </div>
      )}

      {tauriDisponivel &&
        outboxResumo &&
        (outboxResumo.dlq > 0 || outboxResumo.pendentes_total > 0) && (
          <div
            style={{
              padding: '0.45rem 1.5rem',
              fontSize: 13,
              borderBottom: `1px solid ${colors.headerBorder}`,
              backgroundColor: bgOutboxBanner(outboxResumo),
              color: outboxResumo.dlq > 0 ? colors.outboxDlqText : colors.buttonText,
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
                  onClick={() => void reprocessarDlq()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '0.25rem 0.65rem',
                    borderRadius: 8,
                    border: `1px solid ${colors.outboxDlqBorder}`,
                    background: reprocessandoDlq ? colors.outboxDlqButtonDisabledBg : colors.clearButtonBg,
                    color: colors.outboxDlqText,
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
                  <span style={{ color: colors.warningText }}>
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
            color: colors.warningText,
            backgroundColor: colors.warningBg,
            borderBottom: `1px solid ${colors.warningBorder}`,
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
            color: colors.warningText,
            backgroundColor: colors.warningBg,
            borderBottom: `1px solid ${colors.warningBorder}`,
          }}
        >
          <strong>Catálogo vazio.</strong> Copie{' '}
          <code style={{ fontSize: 12 }}>pdv-local/.env.example</code> para{' '}
          <code style={{ fontSize: 12 }}>.env</code>, preencha{' '}
          <code style={{ fontSize: 12 }}>SYNC_ENDPOINT</code> e{' '}
          <code style={{ fontSize: 12 }}>SYNC_KEY</code>, reinicie o
          app e clique em <strong>Sincronizar catálogo</strong>.
          {ultimoErroSincCatalogo && (
            <div style={{ marginTop: 6, fontSize: 12, color: colors.warningText }}>
              Motivo: {ultimoErroSincCatalogo}
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
            border: `1px solid ${colors.headerBorder}`,
            padding: '1rem',
            backgroundColor: colors.headerBg,
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
              color: colors.foreground,
            }}
          >
            Leitura de código / produto
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              ref={inputLeituraRef}
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adicionarDoCatalogo()
                if (e.key === 'Escape') setCodigo('')
              }}
              onFocus={() => setInputLeituraFocado(true)}
              onBlur={() => setInputLeituraFocado(false)}
              placeholder="Código de barras ou nome do produto..."
              style={{
                flex: 1,
                minHeight: 44,
                padding: '0.7rem 0.9rem',
                borderRadius: 999,
                border: `1px solid ${inputLeituraFocado ? colors.inputBorderFocus : colors.inputBorder}`,
                backgroundColor: colors.inputBg,
                color: colors.foreground,
                fontSize: 14,
                outline: 'none',
                boxShadow: inputLeituraFocado ? `0 0 0 2px ${colors.inputBorderFocus}33` : 'none',
              }}
            />
            <button
              onClick={adicionarDoCatalogo}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '0.7rem 1rem',
                borderRadius: 999,
                border: 'none',
                background: colors.addButton,
                color: colors.addButtonText,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Adicionar
            </button>
            <button
              onClick={handleNovoCupom}
              disabled={itens.length === 0}
              style={{
                minHeight: 44,
                minWidth: 44,
                padding: '0.7rem 1rem',
                borderRadius: 999,
                border: `1px solid ${colors.clearButtonBorder}`,
                background: itens.length === 0 ? colors.clearButtonDisabledBg : colors.clearButtonBg,
                color: itens.length === 0 ? colors.clearButtonDisabledText : colors.clearButtonText,
                fontSize: 13,
                fontWeight: 500,
                cursor: itens.length === 0 ? 'default' : 'pointer',
              }}
            >
              Novo Cupom (F8)
            </button>
          </div>
          {mensagem && (
            <div
              style={{
                fontSize: 13,
                ...estiloBannerMensagem(mensagem),
                padding: '0.35rem 0.5rem 0.35rem 0.65rem',
                borderRadius: 999,
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>{mensagem}</span>
              <button
                type="button"
                onClick={() => {
                  setMensagem(null)
                  focarInputLeitura()
                }}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  minWidth: 24,
                  minHeight: 24,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.55)',
                  color: 'inherit',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                aria-label="Fechar alerta"
              >
                ×
              </button>
            </div>
          )}

          <div
            style={{
              marginTop: '0.5rem',
              borderRadius: 12,
              border: `1px solid ${colors.headerBorder}`,
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
                background: colors.tableHeaderBg,
                color: colors.tableHeaderText,
                borderBottom: `1px solid ${colors.headerBorder}`,
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
                    color: colors.textMuted,
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
                      borderBottom: `1px solid ${colors.tableRowBorder}`,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{item.nome}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.textMuted,
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
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          alterarQuantidade(item.id, Math.max(1, item.quantidade - 1))
                        }
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 10,
                          border: `1px solid ${colors.inputBorder}`,
                          background: colors.buttonBg,
                          color: colors.foreground,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        aria-label={`Diminuir quantidade de ${item.nome}`}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) =>
                          alterarQuantidade(item.id, Number(e.target.value))
                        }
                        style={{
                          width: 60,
                          minHeight: 44,
                          textAlign: 'right',
                          fontSize: 13,
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: `1px solid ${colors.inputBorder}`,
                          background: colors.buttonBg,
                          color: colors.foreground,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => alterarQuantidade(item.id, item.quantidade + 1)}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 10,
                          border: `1px solid ${colors.inputBorder}`,
                          background: colors.buttonBg,
                          color: colors.foreground,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        aria-label={`Aumentar quantidade de ${item.nome}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removerItem(item.id)}
                        style={{
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 10,
                          border: `1px solid ${colors.removeButtonBorder}`,
                          background: colors.removeButtonBg,
                          color: colors.removeButtonText,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Remover
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
                            color: colors.atacadoText,
                            backgroundColor: colors.atacadoBg,
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
                            border: `1px solid ${colors.inputBorder}`,
                            color: colors.buttonText,
                            backgroundColor: colors.inputBg,
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
              color: colors.textSecondary,
            }}
          >
            Itens: {totalItens} · Unidades: {totalUnidades}
          </div>
        </section>

        <section
          style={{
            borderRadius: '0.75rem',
            border: `1px solid ${colors.headerBorder}`,
            padding: '1rem',
            backgroundColor: colors.headerBg,
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
                color: colors.foreground,
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
                color: colors.atacadoText,
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
                  color: colors.syncError,
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
            {ultimoItemAdicionado ? (
              <div
                style={{
                  marginTop: 8,
                  padding: '0.6rem 0.75rem',
                  borderRadius: 10,
                  background: colors.lastItemBg,
                  border: `1px solid ${colors.lastItemBorder}`,
                }}
              >
                <div style={{ fontSize: 12, color: colors.lastItemText, fontWeight: 700 }}>
                  Último item adicionado
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: colors.foreground }}>
                  {ultimoItemAdicionado.nome}
                </div>
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 34,
                fontWeight: 900,
                marginTop: 8,
                padding: '0.65rem 0.75rem',
                borderRadius: 12,
                background: colors.totalBg,
                color: colors.totalText,
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
                minHeight: 44,
                minWidth: 44,
                padding: '0.6rem 0.9rem',
                borderRadius: 999,
                border: `1px solid ${colors.inputBorder}`,
                background: colors.clearButtonDisabledBg,
                color: itens.length === 0 ? colors.textDisabled : colors.buttonText,
                fontSize: 12,
                fontWeight: 500,
                cursor: itens.length === 0 ? 'default' : 'pointer',
              }}
              onClick={async () => {
                if (!itens.length) return
                const senha = globalThis.prompt('Senha do gerente para aplicar desconto especial:')
                if (!senha) return

                let tokenPdv: string | null = null
                let maxClamp: number | null = null

                if (tauriDisponivel) {
                  try {
                    const r = await invoke<{
                      token: string
                      expira_em: string
                      max_desconto_percentual: number
                    }>('validar_gerente_sync_cmd', { senha })
                    tokenPdv = r.token
                    if (
                      Number.isFinite(r.max_desconto_percentual) &&
                      r.max_desconto_percentual > 0
                    ) {
                      maxClamp = r.max_desconto_percentual
                    }
                  } catch {
                    setMensagem(
                      'Falha ao validar gerente no servidor. Verifique conexão e configuração de SYNC_ENDPOINT/SYNC_KEY.'
                    )
                    return
                  }
                } else {
                  setMensagem(
                    'Validação de gerente exige app desktop conectado ao servidor (token remoto obrigatório).'
                  )
                  return
                }

                const maxPrompt =
                  maxClamp != null
                    ? Math.min(maxDescontoGerentePercentual, maxClamp)
                    : maxDescontoGerentePercentual

                const entrada = globalThis.prompt(
                  `Informe o desconto especial em % (máx. ${maxPrompt}%):`,
                  descontoGerentePercentual > 0 ? String(descontoGerentePercentual) : '5'
                )
                if (!entrada) return
                const valor = Number(entrada.replace(',', '.'))
                if (Number.isNaN(valor) || valor < 0) {
                  setMensagem('Valor de desconto inválido.')
                  return
                }
                aplicarDescontoGerente(valor, tokenPdv, maxClamp)
                setMensagem(`Desconto especial de ${valor.toFixed(1)}% aplicado pelo gerente.`)
              }}
            >
              Desconto especial (gerente)
            </button>

            {!caixaAtualId ? (
              <button
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '0.65rem 0.9rem',
                  borderRadius: 999,
                  border: `1px solid ${colors.inputBorder}`,
                  background: colors.buttonBg,
                  color: colors.foreground,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  void abrirCaixa()
                }}
              >
                Abrir caixa
              </button>
            ) : (
              <button
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '0.65rem 0.9rem',
                  borderRadius: 999,
                  border: `1px solid ${colors.inputBorder}`,
                  background: colors.buttonBg,
                  color: colors.foreground,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  void fecharCaixa()
                }}
              >
                Fechar caixa (F6)
              </button>
            )}

            {caixaAtualId && (
              <button
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  padding: '0.55rem 0.9rem',
                  borderRadius: 999,
                  border: `1px solid ${colors.inputBorder}`,
                  background: colors.buttonBg,
                  color: colors.foreground,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: itens.length === 0 ? 'default' : 'pointer',
                }}
                onClick={() => {
                  void registrarMovimentoCaixa()
                }}
              >
                Sangria/Suprimento (Ctrl+Shift+S/R)
              </button>
            )}
            <button
              disabled={itens.length === 0 || isFinalizandoVenda}
              style={{
                minHeight: 52,
                padding: '1rem 1rem',
                borderRadius: 999,
                border: 'none',
                /*
                 * Auditoria WCAG: texto #ecfdf3 sobre o gradiente #16a34a→#059669 media
                 * 3.14-3.79:1 (17px bold nao atinge o limiar de "texto grande" do WCAG,
                 * que exige 14pt/18.66px bold) — FALHA AA. Gradiente escurecido para
                 * #047857→#065f46 (5.53-7.77:1) e texto para branco puro.
                 */
                background:
                  itens.length === 0 || isFinalizandoVenda
                    ? colors.finalizarDisabledBg
                    : 'linear-gradient(135deg,#047857,#065f46)',
                color: itens.length === 0 || isFinalizandoVenda ? colors.finalizarDisabledText : '#ffffff',
                fontSize: 17,
                fontWeight: 800,
                cursor: itens.length === 0 || isFinalizandoVenda ? 'default' : 'pointer',
                boxShadow: '0 10px 20px rgba(5,150,105,0.25)',
              }}
              onClick={() => {
                finalizarVenda()
              }}
            >
              {isFinalizandoVenda ? 'Finalizando…' : 'Finalizar (F4)'}
            </button>
            <div
              style={{
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              Atalhos: F4/F9 Finalizar · F8 Novo Cupom · F2/Ctrl+B Focar leitura · F6 Fechar caixa · Ctrl+Shift+S/R Sangria/Suprimento · Esc limpa o campo.
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}


'use client'

import type { Mensagens } from '@/i18n/getMessages'
import { formatDecimalBRL } from '@/lib/format/money'
import type { FechamentoFormaLinha } from '@/app/caixa/fechamentoPorFormaTypes'

type Props = Readonly<{
  linhas: FechamentoFormaLinha[] | null
  erro: string | null
  m: Mensagens
  moeda: string
  compact?: boolean
}>

function labelForma(forma: FechamentoFormaLinha['formaPagamento'], m: Mensagens): string {
  switch (forma) {
    case 'DINHEIRO':
      return m.caixa.fechamento_forma_dinheiro
    case 'PIX':
      return m.caixa.fechamento_forma_pix
    case 'CARTAO_DEBITO':
      return m.caixa.fechamento_forma_debito
    case 'CARTAO_CREDITO':
      return m.caixa.fechamento_forma_credito
    default:
      return forma
  }
}

/**
 * Painel pós-fechamento: dinheiro com esperado/informado/diferença;
 * eletrônicos só "Registrado no Jinlong" (sem falsa conciliação).
 */
export function CaixaFechamentoFormasPanel({ linhas, erro, m, moeda, compact }: Props) {
  if (erro) {
    return (
      <div
        role="alert"
        data-testid="fechamento-formas-erro"
        className="rounded-md border border-[color-mix(in_srgb,var(--color-danger-strong)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-danger-strong)_10%,transparent)] px-3 py-2 text-sm text-[var(--color-danger-strong)]"
      >
        {m.caixa.fechamento_formas_erro}: {erro}
      </div>
    )
  }

  if (!linhas) {
    return (
      <div
        role="status"
        data-testid="fechamento-formas-loading"
        className="text-sm text-muted-foreground"
      >
        {m.caixa.fechamento_formas_carregando}
      </div>
    )
  }

  return (
    <div
      data-testid="fechamento-formas-panel"
      className={compact ? 'flex flex-col gap-2' : 'flex flex-col gap-3'}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {m.caixa.fechamento_formas_titulo}
      </p>
      {linhas.map((linha) => {
        const isDinheiro = linha.formaPagamento === 'DINHEIRO'
        const temDiff =
          isDinheiro && linha.diferenca !== null && Math.abs(linha.diferenca) > 0.005
        return (
          <div
            key={linha.formaPagamento}
            data-testid={`fechamento-forma-${linha.formaPagamento}`}
            data-metrica={linha.metrica}
            className="rounded-md border border-border px-3 py-2"
          >
            <div className="mb-1 text-sm font-semibold tabular-nums">
              {labelForma(linha.formaPagamento, m)}
            </div>
            {isDinheiro ? (
              <div className="flex flex-col gap-0.5 text-sm tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {m.caixa.fechamento_forma_esperado_caixa}
                  </span>
                  <span>
                    {moeda} {formatDecimalBRL(linha.valorSistemaSnapshot)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {m.caixa.fechamento_forma_informado}
                  </span>
                  <span>
                    {moeda}{' '}
                    {formatDecimalBRL(linha.valorInformado ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span
                    className={
                      temDiff
                        ? 'font-semibold text-[var(--color-danger-strong)]'
                        : 'text-muted-foreground'
                    }
                  >
                    {m.caixa.fechamento_forma_diferenca}
                  </span>
                  <span
                    className={
                      temDiff ? 'font-semibold text-[var(--color-danger-strong)]' : undefined
                    }
                  >
                    {linha.diferenca !== null && linha.diferenca > 0 ? '+ ' : ''}
                    {linha.diferenca !== null && linha.diferenca < 0 ? '− ' : ''}
                    {moeda}{' '}
                    {formatDecimalBRL(Math.abs(linha.diferenca ?? 0))}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-2 text-sm tabular-nums">
                <span className="text-muted-foreground">
                  {m.caixa.fechamento_forma_registrado_jinlong}
                </span>
                <span>
                  {moeda} {formatDecimalBRL(linha.valorSistemaSnapshot)}
                </span>
              </div>
            )}
          </div>
        )
      })}
      <p className="text-[10px] leading-snug text-muted-foreground">
        {m.caixa.fechamento_formas_nota_nao_banco}
      </p>
    </div>
  )
}

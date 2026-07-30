/**
 * Classificação da margem no cadastro — decisão pura, testável sem UI.
 *
 * Só apresentação: não toca pricing engine nem RPC. O objetivo é que o
 * operador VEJA, na hora de cadastrar, que o preço de venda está abaixo ou
 * igual ao custo. Produto salvo com margem negativa é prejuízo silencioso que
 * só aparece semanas depois no relatório.
 */
export type MargemTom = 'indefinida' | 'negativa' | 'zero' | 'ok'

export type MargemAvaliada = Readonly<{
  tom: MargemTom
  /** Lucro absoluto (varejo - custo); null quando não há dados suficientes. */
  valor: number | null
  /** Percentual sobre o preço de venda; null quando não há dados suficientes. */
  percentual: number | null
}>

/**
 * Sem custo informado a margem é indefinida — não é erro, é dado faltando.
 * Custo zero é tratado como informado (margem = 100%): é o caso de brinde ou
 * amostra, e o operador digitou o zero de propósito.
 */
export function avaliarMargem(
  precoVarejo: number | null,
  precoCusto: number | null,
): MargemAvaliada {
  if (
    precoVarejo == null ||
    !Number.isFinite(precoVarejo) ||
    precoVarejo <= 0 ||
    precoCusto == null ||
    !Number.isFinite(precoCusto)
  ) {
    return { tom: 'indefinida', valor: null, percentual: null }
  }

  const valor = precoVarejo - precoCusto
  const percentual = (valor / precoVarejo) * 100

  if (valor < 0) return { tom: 'negativa', valor, percentual }
  if (valor === 0) return { tom: 'zero', valor, percentual }
  return { tom: 'ok', valor, percentual }
}

/**
 * Percentual em pt-BR (vírgula decimal). `toFixed` devolveria "60.0", com ponto,
 * ao lado de um valor monetário com vírgula ("R$ 60,00") — dois separadores
 * diferentes na mesma linha confundem quem confere preço no balcão.
 */
export function formatMargemPercentual(percentual: number): string {
  return percentual.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Classes do Design System por tom — mesma paleta dos avisos do modal. */
export function margemToneClassName(tom: MargemTom): string {
  switch (tom) {
    case 'negativa':
      return 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
    case 'zero':
      return 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]'
    default:
      return 'border-jl-border-1 bg-jl-surface-soft text-jl-fg-1'
  }
}

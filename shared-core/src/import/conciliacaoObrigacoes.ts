/**
 * Conciliação de duplicatas e obrigações de NF-e (D6). Função pura, sem I/O.
 *
 * Regras:
 *  - Valores da mesma natureza conciliam EXATAMENTE em centavos. Não há tolerância.
 *  - Com <fat>: a referência é o valor líquido da fatura (vLiq). Confere-se vOrig − vDesc = vLiq,
 *    e a soma das duplicatas tem de ser igual a vLiq.
 *  - Sem <fat>: a referência é vNF − pagamentos à vista informados no <pag> − adiantamentos
 *    já registrados no ERP para esta compra (informados explicitamente; nunca presumidos).
 *  - Não presume soma(duplicatas) = vNF.
 *  - Diferença material bloqueia só a CONFIRMAÇÃO FINANCEIRA. O documento pode ser registrado pendente.
 *  - Não cria obrigação, não altera nenhum valor de entrada, não inventa contas a pagar.
 */

export type ConciliacaoEntrada = {
  /** vNF (ICMSTot), texto decimal com até 2 casas. */
  valorNf: string
  fatura?: { valorOriginal?: string | null; valorDesconto?: string | null; valorLiquido?: string | null } | null
  duplicatas: { numero?: string | null; vencimento: string; valor: string }[]
  /** <pag>/<detPag>: indPag 0 = à vista, 1 = a prazo; tPag 90 = sem pagamento. */
  pagamentos?: { indPag?: string | null; tPag?: string | null; valor?: string | null }[]
  /** Adiantamentos já pagos e registrados no ERP para esta compra (centavos em texto decimal). */
  adiantamentosRegistrados?: string[]
}

export type ConciliacaoNatureza =
  | 'PARCELADO'
  | 'A_VISTA'
  | 'ANTECIPADO'
  | 'MISTO'
  | 'SEM_PAGAMENTO'
  | 'INDEFINIDO'

export type ConciliacaoMotivo =
  | 'VALOR_INVALIDO'
  | 'FATURA_INCONSISTENTE'
  | 'DUPLICATAS_DIFEREM_DA_REFERENCIA'
  | 'PAGAMENTO_A_VISTA_DIFERE_DA_NF'
  | 'OBRIGACAO_NAO_RECONHECIDA'
  | 'ADIANTAMENTO_EXCEDE_REFERENCIA'
  | 'DESCONTO_FINANCEIRO'

export type ConciliacaoResultado = {
  situacao: 'CONCILIADO' | 'DIVERGENTE' | 'PENDENTE_REVISAO'
  natureza: ConciliacaoNatureza
  referencia: 'FATURA_LIQUIDA' | 'VALOR_NF_MENOS_PAGO'
  /** Todos os valores em centavos (string de inteiro, sem perda). */
  valorNfCentavos: string
  referenciaCentavos: string
  somaDuplicatasCentavos: string
  pagoAVistaCentavos: string
  adiantamentosCentavos: string
  descontoFinanceiroCentavos: string
  diferencaCentavos: string
  bloqueiaConfirmacaoFinanceira: boolean
  permiteRegistrarDocumento: true
  motivos: ConciliacaoMotivo[]
}

const DEC2 = /^(\d+)(?:\.(\d{1,2}))?$/

/** Texto decimal (≤ 2 casas, não negativo) → centavos inteiros. null se inválido. */
export function centavos(texto: string | null | undefined): bigint | null {
  if (texto == null) return null
  const t = texto.trim()
  const m = DEC2.exec(t)
  if (!m) return null
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'))
}

export function conciliarObrigacoesNfe(e: ConciliacaoEntrada): ConciliacaoResultado {
  const motivos = new Set<ConciliacaoMotivo>()
  const inval = (v: bigint | null): bigint => {
    if (v === null) {
      motivos.add('VALOR_INVALIDO')
      return 0n
    }
    return v
  }

  const vNf = inval(centavos(e.valorNf))
  const dups = e.duplicatas.map((d) => inval(centavos(d.valor)))
  const somaDup = dups.reduce((a, b) => a + b, 0n)
  const pagamentos = e.pagamentos ?? []
  const semPagamento = pagamentos.length > 0 && pagamentos.every((p) => (p.tPag ?? '').trim() === '90')
  const pagoAVista = pagamentos
    .filter((p) => (p.indPag ?? '').trim() === '0' && (p.tPag ?? '').trim() !== '90')
    .reduce((a, p) => a + inval(centavos(p.valor ?? '0')), 0n)
  const adiant = (e.adiantamentosRegistrados ?? []).reduce((a, v) => a + inval(centavos(v)), 0n)

  let referencia: ConciliacaoResultado['referencia']
  let ref: bigint
  let desconto = 0n

  const fat = e.fatura
  const temFatura = !!fat && (fat.valorLiquido != null || fat.valorOriginal != null)
  if (temFatura) {
    referencia = 'FATURA_LIQUIDA'
    const vOrig = fat!.valorOriginal != null ? inval(centavos(fat!.valorOriginal)) : null
    desconto = fat!.valorDesconto != null ? inval(centavos(fat!.valorDesconto)) : 0n
    const vLiq = fat!.valorLiquido != null ? inval(centavos(fat!.valorLiquido)) : null
    if (vOrig !== null && vLiq !== null && vOrig - desconto !== vLiq) motivos.add('FATURA_INCONSISTENTE')
    ref = (vLiq ?? (vOrig !== null ? vOrig - desconto : 0n)) - adiant
    if (desconto > 0n) motivos.add('DESCONTO_FINANCEIRO')
  } else {
    referencia = 'VALOR_NF_MENOS_PAGO'
    ref = vNf - pagoAVista - adiant
  }

  if (ref < 0n) {
    motivos.add('ADIANTAMENTO_EXCEDE_REFERENCIA')
  }

  let natureza: ConciliacaoNatureza
  if (semPagamento && dups.length === 0 && !temFatura) {
    natureza = 'SEM_PAGAMENTO'
    if (vNf > 0n) motivos.add('OBRIGACAO_NAO_RECONHECIDA')
  } else if (dups.length > 0) {
    natureza = adiant > 0n || pagoAVista > 0n ? 'MISTO' : 'PARCELADO'
  } else if (adiant > 0n && ref === 0n) {
    natureza = 'ANTECIPADO'
  } else if (pagoAVista > 0n) {
    natureza = 'A_VISTA'
  } else {
    natureza = 'INDEFINIDO'
    if (vNf > 0n) motivos.add('OBRIGACAO_NAO_RECONHECIDA')
  }

  const diferenca = natureza === 'SEM_PAGAMENTO' || natureza === 'INDEFINIDO' ? 0n : somaDup - ref
  if (natureza !== 'SEM_PAGAMENTO' && natureza !== 'INDEFINIDO' && diferenca !== 0n) {
    motivos.add(
      dups.length === 0 && !temFatura ? 'PAGAMENTO_A_VISTA_DIFERE_DA_NF' : 'DUPLICATAS_DIFEREM_DA_REFERENCIA',
    )
  }

  const materiais: ConciliacaoMotivo[] = [
    'VALOR_INVALIDO',
    'FATURA_INCONSISTENTE',
    'DUPLICATAS_DIFEREM_DA_REFERENCIA',
    'PAGAMENTO_A_VISTA_DIFERE_DA_NF',
    'ADIANTAMENTO_EXCEDE_REFERENCIA',
  ]
  const divergente = materiais.some((m) => motivos.has(m))
  const pendente = motivos.has('OBRIGACAO_NAO_RECONHECIDA')

  return {
    situacao: divergente ? 'DIVERGENTE' : pendente ? 'PENDENTE_REVISAO' : 'CONCILIADO',
    natureza,
    referencia,
    valorNfCentavos: vNf.toString(),
    referenciaCentavos: ref.toString(),
    somaDuplicatasCentavos: somaDup.toString(),
    pagoAVistaCentavos: pagoAVista.toString(),
    adiantamentosCentavos: adiant.toString(),
    descontoFinanceiroCentavos: desconto.toString(),
    diferencaCentavos: diferenca.toString(),
    bloqueiaConfirmacaoFinanceira: divergente || pendente,
    permiteRegistrarDocumento: true,
    motivos: [...motivos].sort(),
  }
}

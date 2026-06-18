/** Valor em centavos — evita drift de ponto flutuante; somas D=C são exatas. */
export type Cents = number & { readonly __cents: true }

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'

/** Direção do lançamento conforme a regra T-account. */
export type EntryDirection = 'DEBIT' | 'CREDIT'

export interface Account {
  /** Identificador estável (ex: 'CASH', 'SALES_REVENUE'). */
  readonly id: string
  readonly name: string
  readonly type: AccountType
  /** Direção que aumenta o saldo: ASSET/EXPENSE → DEBIT; LIABILITY/EQUITY/REVENUE → CREDIT. */
  readonly normalBalance: EntryDirection
}

export interface JournalLine {
  readonly account: Account
  readonly direction: EntryDirection
  /** Sempre positivo em centavos; direção carrega o sinal contábil. */
  readonly amount: Cents
}

export interface JournalEntry {
  readonly id: string
  readonly createdAt: Date
  readonly description: string
  readonly lines: readonly JournalLine[]
  /** Referência ao evento de negócio que originou o lançamento (venda_id, compra_id…). */
  readonly referenceId?: string
}

export interface PostedEntry {
  readonly entry: JournalEntry
  readonly postedAt: Date
}

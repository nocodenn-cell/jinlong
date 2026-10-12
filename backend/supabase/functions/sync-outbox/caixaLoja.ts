const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CaixaSyncInsert = {
  id: string;
  operador_id: string | null;
  valor_inicial: number;
  status: "ABERTO";
  loja_id: string;
};

export function requireExplicitLojaId(raw: unknown): string {
  if (typeof raw !== "string" || !UUID_RE.test(raw.trim())) {
    throw new Error("CAIXA_LOJA_OBRIGATORIA");
  }
  return raw.trim();
}

export function assertMesmaLoja(existente: string | null, informada: string): void {
  if (existente == null || existente !== informada) {
    throw new Error("CAIXA_LOJA_DIVERGENTE");
  }
}

export function caixaInsertForLoja(input: {
  id: string;
  operadorId: string | null;
  valorInicial: number;
  lojaId: unknown;
}): CaixaSyncInsert {
  return {
    id: input.id,
    operador_id: input.operadorId,
    valor_inicial: input.valorInicial,
    status: "ABERTO",
    loja_id: requireExplicitLojaId(input.lojaId),
  };
}

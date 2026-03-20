export interface PdvConfig {
  gerenteSenhaSha256: string
  maxDescontoGerentePercentual: number
  gerenteId: string
}

// Fallback local: caso ainda não exista configuração no Supabase/local cache.
export const defaultPdvConfig: PdvConfig = {
  // sha256("1234")
  gerenteSenhaSha256: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  maxDescontoGerentePercentual: 30,
  gerenteId: 'gerente-local-1',
}


export interface PdvConfig {
  gerenteSenhaSha256: string
  maxDescontoGerentePercentual: number
  gerenteId: string
}

// Fallback local: caso ainda não exista configuração no Supabase/cache SQLite (sync `pdv_config`).
// O hash deve coincidir com `public.pdv_config` após primeira sync; em produção troque a senha no banco.
export const defaultPdvConfig: PdvConfig = {
  gerenteSenhaSha256: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  maxDescontoGerentePercentual: 30,
  gerenteId: 'gerente-local-1',
}


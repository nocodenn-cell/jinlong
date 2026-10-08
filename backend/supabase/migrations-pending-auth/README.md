# Migrations pendentes de autorização humana

SQL pronto para apply **seletivo** após autorização explícita.  
**Não** fica em `supabase/migrations/` — o CLI (`db reset` / `db push`) não aplica estes arquivos.

| Arquivo | Motivo de espera |
|---|---|
| `20261008120000_ssot_004_drop_policy_insert_documentos_fiscais.sql` | Defesa DROP POLICY fiscal; apply remoto Jinlong só com auth humana |

Quando autorizado: mover o `.sql` para `supabase/migrations/` e aplicar via processo controlado (nunca `db push --include-all` cego).

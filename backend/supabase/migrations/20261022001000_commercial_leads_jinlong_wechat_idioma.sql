-- Site Jinlong: campos extras do lead (WeChat opcional e idioma preferido).
-- Somente ADD COLUMN; city/segment/utm_* vêm de 20261022000000_commercial_leads_landing_fields.
-- RLS inalterado (anon: só INSERT). Rollback: README_20261022001000_rollback_reference.sql.txt
alter table public.commercial_leads
  add column if not exists wechat text check (wechat is null or char_length(wechat) between 3 and 40),
  add column if not exists idioma text check (idioma is null or idioma in ('pt-BR', 'zh-CN'));
-- Grants por coluna (o anon só insere colunas listadas).
grant insert (wechat, idioma) on public.commercial_leads to anon;

-- Rollback manual (não aplicar automaticamente):
revoke insert (wechat, idioma) on public.commercial_leads from anon;
alter table public.commercial_leads drop column if exists wechat, drop column if exists idioma;

-- Backup dirigido — lojas de teste removidas de PRODUÇÃO em 2026-08-19 (Fase 2, item 2.3)
--
-- Captura somente-leitura das linhas afetadas, imediatamente antes da remoção.
-- NÃO é backup de cluster: cobre exatamente o que a limpeza apaga.
--
-- As 5 lojas foram confirmadas SEM dado operacional no momento da captura:
--   0 caixas, 0 vendas, 0 produtos, 0 estoque em todas.
--   3 delas tinham 1 usuário DONO cada, todos já `ativo = false`,
--   com e-mail `@fp-homolog.com` (contas de homologação).
--
-- Usa `jsonb_populate_recordset`, que casa por NOME de coluna. Uma primeira
-- tentativa gerou `INSERT ... VALUES` a partir de `jsonb_each_text`, e as
-- colunas saíram DESALINHADAS (`ativo` recebeu o nome da loja) porque
-- `jsonb_each_text` não segue `ordinal_position`. Um backup assim só falharia
-- na hora de restaurar. Esta forma não tem esse modo de falha.
--
-- ORDEM DE RESTAURAÇÃO: lojas → usuarios → formas_pagamento (respeita as FKs).
--
-- ATENÇÃO: `auth.users` NÃO é restaurado por este script — as identidades de
-- autenticação precisam ser recriadas pela API de admin do Supabase. Os ids e
-- e-mails estão registrados no final para isso.

BEGIN;

-- Trigger de formas padrão (migration 20261015140000) desligado só durante o restore: sem isso ele cria
-- 4 formas com UUID novo ao reinserir a loja e as linhas originais (mesmo loja_id+codigo) estourariam a
-- UNIQUE. Condicional: em bancos sem a migration o bloco é no-op. Transacional (ALTER TABLE desfaz no rollback).
DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lojas'::regclass
             AND tgname = 'trg_lojas_formas_pagamento_padrao' AND NOT tgisinternal) THEN
    ALTER TABLE public.lojas DISABLE TRIGGER trg_lojas_formas_pagamento_padrao;
  END IF;
END
$trg$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. lojas
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.lojas
SELECT * FROM jsonb_populate_recordset(NULL::public.lojas, $json$
[
 {"id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","cnae":null,"cnpj":null,"nome":"Probe 1784431715968","ativo":true,"email":null,"codigo":"PROBE_1784431715968","logo_url":null,"telefone":null,"created_at":"2026-07-19T03:28:36.344756+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null},
 {"id":"2ad145c6-72fc-46ee-aa71-ad9328ddcba8","cnae":null,"cnpj":null,"nome":"Smoke Homolog 1784431993511","ativo":true,"email":null,"codigo":"SMOKE_1784431993511","logo_url":null,"telefone":null,"created_at":"2026-07-19T03:33:23.576989+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null},
 {"id":"3d65ba13-4c47-456b-b49e-5cf456229a25","cnae":null,"cnpj":null,"nome":"Smoke Homolog 1784432057537","ativo":true,"email":null,"codigo":"SMOKE_1784432057537","logo_url":null,"telefone":null,"created_at":"2026-07-19T03:34:27.986564+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null},
 {"id":"501db05a-0589-429c-871c-ee40af7ac928","cnae":null,"cnpj":null,"nome":"Smoke Homolog 1784431560866","ativo":true,"email":null,"codigo":"SMOKE_1784431560866","logo_url":null,"telefone":null,"created_at":"2026-07-19T03:26:14.416135+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null},
 {"id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","cnae":null,"cnpj":null,"nome":"Probe 1784431787527","ativo":true,"email":null,"codigo":"PROBE_1784431787527","logo_url":null,"telefone":null,"created_at":"2026-07-19T03:29:47.279073+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null}
]
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. usuarios (public) — exige que a identidade exista antes em auth.users
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.usuarios
SELECT * FROM jsonb_populate_recordset(NULL::public.usuarios, $json$
[
 {"id":"87ac559f-7082-41e0-b9dc-5f4bdda293b7","nome":"Dono Smoke 1784432057537","ativo":false,"perfil":"DONO","loja_id":"3d65ba13-4c47-456b-b49e-5cf456229a25","created_at":"2026-07-19T03:34:28.509175+00:00","funcionario_id":null,"idioma_preferido":"pt"},
 {"id":"dadd133f-1799-4695-9794-fb30465121c0","nome":"Probe Dono","ativo":false,"perfil":"DONO","loja_id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","created_at":"2026-07-19T03:28:36.973844+00:00","funcionario_id":null,"idioma_preferido":"pt"},
 {"id":"e7753f81-e397-4597-9285-7e1c2eebdc36","nome":"Probe Dono","ativo":false,"perfil":"DONO","loja_id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","created_at":"2026-07-19T03:29:47.841129+00:00","funcionario_id":null,"idioma_preferido":"pt"}
]
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. formas_pagamento
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.formas_pagamento
SELECT * FROM jsonb_populate_recordset(NULL::public.formas_pagamento, $json$
[
 {"id":"173146f9-0702-42fa-b7a0-66edeb368620","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"2b8aac70-3e2a-4485-a0af-7d29d9149660","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"33e6ec42-f2ac-4892-8f86-c013236aa47c","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"3d65ba13-4c47-456b-b49e-5cf456229a25","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"3db5d8ec-c74d-4d6b-b8b9-15f52680836f","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"3fbb640e-92d5-40ec-9b47-7eaa14d45fee","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"51b43345-795f-448b-b9f0-ff766882aff5","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"51c20b06-70f5-4d13-8869-a0ca17c3382a","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"3d65ba13-4c47-456b-b49e-5cf456229a25","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"6b530fe7-cc1a-4e68-b9c9-bc596cce58d6","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"6cb0e738-bc44-4220-a706-ea886d244d93","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"501db05a-0589-429c-871c-ee40af7ac928","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"6f2c960a-b422-4a29-8bfc-19bc6dd55ec1","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"2ad145c6-72fc-46ee-aa71-ad9328ddcba8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"7347ee4b-5683-4e9c-a2f0-4ca3d9be866a","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"3d65ba13-4c47-456b-b49e-5cf456229a25","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"7c255e87-a9a5-4ce4-9a90-c020eb70f149","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"8d2d3fb5-7107-4a73-8903-a0b2a289d9ca","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"88029d41-298f-43b3-aeef-4beac0e3f24e","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"148fc9e1-1ea8-40cc-b26f-7f3f3446b3b8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"90623b0b-011e-4340-8a8a-4423bc21b294","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"501db05a-0589-429c-871c-ee40af7ac928","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"96d3efed-20c7-436c-a698-5e3ff9017e19","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"2ad145c6-72fc-46ee-aa71-ad9328ddcba8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"9e32f228-02e9-4443-8391-51c710af2b0f","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"2ad145c6-72fc-46ee-aa71-ad9328ddcba8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"a13a0346-b6b8-49d3-a90f-54d85e948b0b","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"3d65ba13-4c47-456b-b49e-5cf456229a25","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"abe83c7e-108a-4e0c-b4a5-a5c3d8560a86","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"501db05a-0589-429c-871c-ee40af7ac928","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"eb877f5d-a5c6-432a-a8b6-d44f1444861a","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"2ad145c6-72fc-46ee-aa71-ad9328ddcba8","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"edd80f36-9769-4e60-9a82-1fc8d6d2bc54","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"501db05a-0589-429c-871c-ee40af7ac928","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0}
]
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lojas'::regclass
             AND tgname = 'trg_lojas_formas_pagamento_padrao' AND NOT tgisinternal) THEN
    ALTER TABLE public.lojas ENABLE TRIGGER trg_lojas_formas_pagamento_padrao;
  END IF;
END
$trg$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Identidades em auth.users (NÃO restauradas por este script)
-- ─────────────────────────────────────────────────────────────────────────────
--   87ac559f-7082-41e0-b9dc-5f4bdda293b7  smoke.dono.1784432057537@fp-homolog.com
--   dadd133f-1799-4695-9794-fb30465121c0  probe.dono.1784431715968@fp-homolog.com
--   e7753f81-e397-4597-9285-7e1c2eebdc36  probe.dono.1784431787527@fp-homolog.com
--
-- Recriar pela API de admin do Supabase (`auth.admin.createUser`) com o `id`
-- acima, ANTES de rodar o bloco 2 deste script. Senhas não foram capturadas e
-- não devem ser: estas são contas de homologação descartáveis.

-- ═════════════════════════════════════════════════════════════════════════════
-- ADENDO 2026-08-19 — `Filial demo` também removida (decisão do dono)
-- ═════════════════════════════════════════════════════════════════════════════
-- Motivo: loja vazia aparecendo no seletor do cliente. 0 caixas, 0 produtos,
-- 0 usuários, 0 estoque; tinha 4 formas de pagamento.
--
-- ATENÇÃO — divergência deliberada com o repositório:
-- `Filial demo` é criada pela migration `036_loja_filial_demo.sql`, NÃO pelo
-- seed. Removê-la em produção significa que um banco reconstruído do Git
-- passa a ter uma loja que produção não tem. O acerto definitivo é uma
-- migration que a remova também no repositório — trilha de reconciliação.
--
-- Restaurar: rodar o bloco abaixo, ou simplesmente reaplicar a `036`.

BEGIN;

-- Trigger de formas padrão (migration 20261015140000) desligado só durante o restore: sem isso ele cria
-- 4 formas com UUID novo ao reinserir a loja e as linhas originais (mesmo loja_id+codigo) estourariam a
-- UNIQUE. Condicional: em bancos sem a migration o bloco é no-op. Transacional (ALTER TABLE desfaz no rollback).
DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lojas'::regclass
             AND tgname = 'trg_lojas_formas_pagamento_padrao' AND NOT tgisinternal) THEN
    ALTER TABLE public.lojas DISABLE TRIGGER trg_lojas_formas_pagamento_padrao;
  END IF;
END
$trg$;

INSERT INTO public.lojas
SELECT * FROM jsonb_populate_recordset(NULL::public.lojas, $json$
[
 {"id":"a0000002-0000-4000-8000-000000000002","cnae":null,"cnpj":null,"nome":"Filial demo","ativo":true,"email":null,"codigo":"FILIAL_DEMO","logo_url":null,"telefone":null,"created_at":"2026-04-08T10:36:09.330593+00:00","endereco_uf":null,"endereco_cep":null,"razao_social":null,"nome_fantasia":null,"endereco_bairro":null,"endereco_cidade":null,"endereco_numero":null,"numero_serie_nfe":1,"numero_serie_nfce":1,"inscricao_estadual":null,"endereco_logradouro":null,"endereco_complemento":null}
]
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.formas_pagamento
SELECT * FROM jsonb_populate_recordset(NULL::public.formas_pagamento, $json$
[
 {"id":"0e8e188f-1622-4a38-b4f6-ab40463de57a","nome":"Cartão de Débito","ativo":true,"codigo":"CARTAO_DEBITO","loja_id":"a0000002-0000-4000-8000-000000000002","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"2403f3da-9c07-49c3-8656-12bd4465b734","nome":"Cartão de Crédito","ativo":true,"codigo":"CARTAO_CREDITO","loja_id":"a0000002-0000-4000-8000-000000000002","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"632a0f9b-8f29-457e-8813-1ed8905a58e3","nome":"Dinheiro","ativo":true,"codigo":"DINHEIRO","loja_id":"a0000002-0000-4000-8000-000000000002","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0},
 {"id":"af956d1b-f6c0-4b63-bf36-be7a73b02379","nome":"Pix","ativo":true,"codigo":"PIX","loja_id":"a0000002-0000-4000-8000-000000000002","created_at":"2026-08-06T01:17:19.767294+00:00","updated_at":"2026-08-06T01:17:19.767294+00:00","taxa_percentual":0.00,"prazo_compensacao_dias":0}
]
$json$::jsonb)
ON CONFLICT (id) DO NOTHING;

DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lojas'::regclass
             AND tgname = 'trg_lojas_formas_pagamento_padrao' AND NOT tgisinternal) THEN
    ALTER TABLE public.lojas ENABLE TRIGGER trg_lojas_formas_pagamento_padrao;
  END IF;
END
$trg$;

COMMIT;

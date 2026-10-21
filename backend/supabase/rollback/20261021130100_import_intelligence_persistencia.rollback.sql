-- ============================================================================
-- ROLLBACK da F4 (20261010160000_f4_import_intelligence_persistencia.sql). Manual, com autorização.
--
-- ATENÇÃO: APAGA todos os dados do Import Intelligence (operações, apurações, aprovações,
-- auditoria e metadados de documentos). Só executar se o módulo nunca foi usado com dados
-- reais, ou depois de exportar esses dados. Por segurança, ABORTA se houver qualquer operação.
-- Arquivos do bucket 'import-documentos' NÃO são apagados por este script (D8: sem exclusão
-- automática); o bucket só é removido se estiver vazio.
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.import_operacoes') IS NOT NULL AND EXISTS (SELECT 1 FROM public.import_operacoes) THEN
    RAISE EXCEPTION 'F4_ROLLBACK_COM_DADOS: há operações do Import Intelligence; exporte e decida antes de reverter';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS import_documentos_leitura ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS import_documentos_envio ON storage.objects';
    IF to_regclass('storage.buckets') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'import-documentos') THEN
      DELETE FROM storage.buckets WHERE id = 'import-documentos';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fp_import_pode_objeto(text, text, text[]);
DROP FUNCTION IF EXISTS public.import_aprovar_apuracao(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.import_mudar_estado(uuid, text, text);
DROP FUNCTION IF EXISTS public.import_registrar_apuracao(uuid, text, integer, text, jsonb, text);
DROP FUNCTION IF EXISTS public.import_montar_entrada(uuid);
DROP FUNCTION IF EXISTS public._import_montar_entrada(uuid);
DROP FUNCTION IF EXISTS public.import_registrar_documento(uuid, text, text, date, text, text, bigint, text, uuid);
DROP FUNCTION IF EXISTS public.import_remover_rascunho(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.import_salvar_lancamento(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.import_salvar_item(uuid, jsonb);
DROP FUNCTION IF EXISTS public.import_criar_operacao(uuid, text, text);

DROP TABLE IF EXISTS public.import_auditoria;
DROP TABLE IF EXISTS public.import_aprovacoes;
DROP TABLE IF EXISTS public.import_divergencias;
DROP TABLE IF EXISTS public.import_apuracao_rateios;
DROP TABLE IF EXISTS public.import_apuracao_itens;
DROP TABLE IF EXISTS public.import_apuracoes;
DROP TABLE IF EXISTS public.import_tributos;
DROP TABLE IF EXISTS public.import_descontos;
DROP TABLE IF EXISTS public.import_despesas;
DROP TABLE IF EXISTS public.import_itens;
DROP TABLE IF EXISTS public.import_cambios;
DROP TABLE IF EXISTS public.import_documentos;
DROP POLICY IF EXISTS import_leitura ON public.import_operacoes;
DROP FUNCTION IF EXISTS public._import_operacao_para_escrita(uuid);   -- retorna o tipo da tabela
DROP TABLE IF EXISTS public.import_operacoes;

DROP FUNCTION IF EXISTS public._import_auditar(uuid, uuid, text, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public._fp_import_usuario_pode(uuid, uuid, text[]);
DROP FUNCTION IF EXISTS public.fp_import_pode_operacao(uuid, text[]);

COMMIT;

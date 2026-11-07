\set ON_ERROR_STOP 1
INSERT INTO empresas VALUES ('e0000001-0000-4000-8000-000000000001','A',null,null,null,now()),('e0000002-0000-4000-8000-000000000002','B',null,null,null,now());
INSERT INTO lojas(id,empresa_id) VALUES ('a0000001-0000-4000-8000-000000000001','e0000001-0000-4000-8000-000000000001'),('b0000001-0000-4000-8000-000000000001','e0000002-0000-4000-8000-000000000002');
INSERT INTO usuarios VALUES ('11111111-1111-4111-8111-111111111111','a0000001-0000-4000-8000-000000000001','ADMIN',true),('22222222-2222-4222-8222-222222222222','b0000001-0000-4000-8000-000000000001','DONO',true);
INSERT INTO usuario_vinculos(usuario_id,empresa_id,papel) VALUES ('22222222-2222-4222-8222-222222222222','e0000002-0000-4000-8000-000000000002','DONO');
CREATE TEMP TABLE r(caso text, ok boolean);
-- token loja nula emitido por ADMIN
INSERT INTO tokens_desconto_gerente VALUES ('tnull',NULL,'11111111-1111-4111-8111-111111111111',false,now()+interval '1h'),('tA','a0000001-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',false,now()+interval '1h');
INSERT INTO r SELECT 'token loja nula (ADMIN) fora da loja B', internal.token_gerente_fora_da_loja('tnull','b0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token da loja A vale na A', NOT internal.token_gerente_fora_da_loja('tA','a0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token da loja A fora da B', internal.token_gerente_fora_da_loja('tA','b0000001-0000-4000-8000-000000000001');
INSERT INTO r SELECT 'token inexistente = false', NOT internal.token_gerente_fora_da_loja('x','b0000001-0000-4000-8000-000000000001');
-- dono por empresa
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO r SELECT 'ADMIN global não é DONO da empresa B', NOT fp_sou_dono_da_empresa('e0000002-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
INSERT INTO r SELECT 'DONO vinculado é DONO da B', fp_sou_dono_da_empresa('e0000002-0000-4000-8000-000000000002');
INSERT INTO r SELECT 'DONO da B não é DONO da A', NOT fp_sou_dono_da_empresa('e0000001-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claim.sub','',false);
-- billing B: ATIVA no BASICO
SELECT cobranca_registrar_assinatura('e0000002-0000-4000-8000-000000000002','BASICO','{}',1,1,'PIX',9900,'cus_1','sub_1','2026-11-01');
UPDATE saas.assinaturas SET status='ATIVA' WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
SELECT cobranca_registrar_assinatura('e0000002-0000-4000-8000-000000000002','REDE','{FISCAL}',3,3,'PIX',99900,'cus_1','sub_1',null);
INSERT INTO r SELECT 'upgrade fica pendente (plano atual BASICO)', plano_codigo='BASICO' AND plano_pendente='REDE' AND qtd_lojas=1 FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
INSERT INTO r SELECT 'upgrade pendente não libera multi_loja/fiscal', NOT ('multi_loja' = ANY(fp_recursos_empresa('e0000002-0000-4000-8000-000000000002'))) AND NOT ('fiscal' = ANY(fp_recursos_empresa('e0000002-0000-4000-8000-000000000002')));
INSERT INTO r SELECT 'empresas.plano não muda antes do pagamento', plano='BASICO' FROM empresas WHERE id='e0000002-0000-4000-8000-000000000002';
SELECT cobranca_aplicar_evento('ev1','PAYMENT_CONFIRMED','{"payment":{"id":"pay_1","subscription":"sub_1","value":999,"dueDate":"2026-11-01"}}');
INSERT INTO r SELECT 'pagamento confirmado aplica upgrade', plano_codigo='REDE' AND plano_pendente IS NULL AND qtd_lojas=3 AND status='ATIVA' FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
INSERT INTO r SELECT 'empresas.plano=REDE após pagar', plano='REDE' FROM empresas WHERE id='e0000002-0000-4000-8000-000000000002';
SELECT cobranca_registrar_assinatura('e0000002-0000-4000-8000-000000000002','ATACADO','{FISCAL}',1,1,'PIX',23800,null,null,null);
INSERT INTO r SELECT 'downgrade é imediato', plano_codigo='ATACADO' AND plano_pendente IS NULL FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
SELECT cobranca_aplicar_evento('ev2','PAYMENT_REFUNDED','{"payment":{"id":"pay_1","subscription":"sub_1","value":999}}');
INSERT INTO r SELECT 'estorno ⇒ SUSPENSA/ESTORNO + suspensão aplicada', status='SUSPENSA' AND motivo_status='ESTORNO' AND suspensao_aplicada FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
INSERT INTO r SELECT 'estorno revoga recursos', cardinality(fp_recursos_empresa('e0000002-0000-4000-8000-000000000002'))=0;
INSERT INTO r SELECT 'estorno suspende vendas', valor='true' FROM configuracoes_gerais WHERE empresa_id='e0000002-0000-4000-8000-000000000002' AND chave='vendas_suspensas';
SELECT cobranca_aplicar_evento('ev3','PAYMENT_CHARGEBACK_REQUESTED','{"payment":{"id":"pay_1","subscription":"sub_1","value":999}}');
INSERT INTO r SELECT 'chargeback ⇒ motivo CHARGEBACK', motivo_status='CHARGEBACK' FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
SELECT cobranca_aplicar_evento('ev4','PAYMENT_RECEIVED','{"payment":{"id":"pay_2","subscription":"sub_1","value":238}}');
INSERT INTO r SELECT 'novo pagamento reativa', status='ATIVA' AND NOT suspensao_aplicada FROM saas.assinaturas WHERE empresa_id='e0000002-0000-4000-8000-000000000002';
INSERT INTO r SELECT 'evento duplicado é idempotente', (cobranca_aplicar_evento('ev2','PAYMENT_REFUNDED','{}')->>'duplicado')::boolean;
INSERT INTO r SELECT 'lock: 1º reserva', cobranca_reservar_assinar('e0000002-0000-4000-8000-000000000002');
INSERT INTO r SELECT 'lock: 2º clique recusado', NOT cobranca_reservar_assinar('e0000002-0000-4000-8000-000000000002');
SELECT cobranca_liberar_assinar('e0000002-0000-4000-8000-000000000002');
INSERT INTO r SELECT 'lock: após liberar reserva de novo', cobranca_reservar_assinar('e0000002-0000-4000-8000-000000000002');
UPDATE saas.assinar_locks SET ate = now() - interval '1s';
INSERT INTO r SELECT 'lock expirado pode ser retomado', cobranca_reservar_assinar('e0000002-0000-4000-8000-000000000002');
INSERT INTO r SELECT 'authenticated sem EXECUTE no lock', NOT has_function_privilege('authenticated','public.cobranca_reservar_assinar(uuid,int)','EXECUTE');
SELECT caso, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END FROM r;
SELECT count(*) FILTER (WHERE ok) || '/' || count(*) AS resultado FROM r;

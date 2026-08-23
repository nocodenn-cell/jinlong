# Plano de provas do piloto D0

## Convenções

- **Ambiente:** homologação idêntica ao alvo ou produção em janela controlada, nunca banco desconhecido.
- **Responsável:** ainda não definido; preencher nome e data antes de executar.
- **Evidência:** guardar output, captura, IDs criados, commit/deployment ID e horário.
- **Limpeza:** não apagar trilha necessária para auditoria; usar loja/dataset identificado como homologação.

| ID | Prova | Pré-condições e dados controlados | Passos essenciais | Resultado esperado | Evidência a guardar | Rollback/limpeza | Responsável / ambiente |
|---|---|---|---|---|---|---|---|
| PV-001 | Migrations/schema | Projeto vinculado; SHA/deploy conhecidos | `supabase migration list`; executar `verify_p0_producao.sql`; conferir assinaturas RPC v4/pricing/remessa/caixa | Remote sem lacunas; verify sem falha; assinaturas iguais ao app | Outputs integrais + project ref mascarado + timestamp | Nenhuma escrita além de verify seguro | A definir / homologação |
| PV-002 | Baseline automatizado | Dependências locais íntegras | executar guards, typecheck, unitários e build web; registrar comandos exatos | Todos verdes ou falhas classificadas | Logs e versões Node/npm | Limpar caches gerados | A definir / CI ou local |
| PV-003 | Produto com custo `NULL` | Categoria; usuário gerente; SKU único | cadastrar sem custo/fornecedor; reabrir; publicar; buscar no PDV; vender | DB preserva NULL; cadastro/venda passam; margem desconhecida | ID, row sanitizada, telas e venda | Inativar SKU de prova | A definir / homologação |
| PV-004 | Custo zero explícito | Mesmo cenário PV-003 | escolher explicitamente custo zero; salvar/reabrir | zero persistido apenas com intenção distinguível | payload/row/tela | Inativar SKU | A definir / homologação |
| PV-005 | Tiers de atacado | Produto varejo 10; tiers 5→8 e 10→7; global divergente se existir | consultar/adicionar quantidades 4,5,9,10; desativar primeiro tier e repetir | 4 varejo; 5/9 primeiro tier; 10 segundo; global nunca interfere | SQL transacional e testes de paridade offline verdes em 2026-08-23 | Rollback transacional | PROVADO_LOCAL / repetir em homologação |
| PV-006 | Remessa/recebimento | SKU e estoque inicial conhecidos | tentar zero, negativo e lista vazia; depois quantidade positiva; repetir confirmação | inválidos não persistem; positivo entra uma vez; retry idempotente; inventário separado aceita zero | SQL transacional + Vitest verdes em 2026-08-23 | Rollback transacional | PROVADO_LOCAL / repetir em homologação |
| PV-007 | Venda nos quatro meios | Caixa aberto; SKU com saldo; operador | uma venda dinheiro, PIX, débito, crédito | todas concluídas; pagamento soma total; estoque baixa uma vez | IDs de venda/pagamento/kardex | cancelar vendas de prova de modo auditado | A definir / homologação |
| PV-008 | Multipagamento | Venda de total conhecido | dividir entre duas ou mais formas; tentar soma divergente | soma exata aceita; divergência rejeitada sem baixa parcial | payload/resposta/rows | cancelar venda válida | A definir / homologação |
| PV-009 | Venda sem cliente | Venda integral e cliente nulo | concluir nos quatro meios sem cliente | venda concluída com `cliente_id NULL`; sem AR indevido | IDs/rows | cancelar | A definir / homologação |
| PV-010 | Cancelamento/devolução | Vendas PV-007/008 | cancelar uma de cada forma; executar devolução suportada | cancelada fora do líquido; caixa/estoque/AR revertidos; devolução separada | rows e relatórios antes/depois | Não apagar eventos | A definir / homologação |
| PV-011 | Caixa/fechamento | Abertura 100; suprimento 20; dinheiro 50; sangria 10; estorno dinheiro 5 | executar movimentos; fechar com contado conhecido | esperado 155; contado/diferença exibidos; formas separadas | caixa, movimentos e relatório | Reabrir somente se PV-012 disponível | A definir / homologação |
| PV-012 | Reabertura | Caixa fechado; gerente, dono e operador | operador tenta; gerente reabre com/sem motivo; verificar fechamento | operador e sem motivo rejeitados; evento novo; original intacto | eventos, atores, timestamps e rows | Fechar novo ciclo conforme runbook | A definir / homologação |
| PV-013 | Permissões negativas | Contas OPERADOR/GERENTE/DONO/ADMIN e duas lojas de teste | executar leitura/escrita/RPCs da matriz | nega operação/perfil/loja indevidos; permite somente casos definidos | outputs sanitizados por perfil | Remover usuários/loja de teste conforme política | A definir / homologação |
| PV-014 | Reconciliação de vendas | Dataset PV-007-010 | comparar vendas concluídas e pagamentos por IDs | equação fecha; canceladas excluídas | SQL e export | Manter dataset até aceite | A definir / homologação |
| PV-015 | Reconciliação de caixa | Dataset PV-011 | recalcular fórmula D0 independentemente | esperado/contado/diferença reproduzíveis | planilha/SQL e tela | Manter até aceite | A definir / homologação |
| PV-016 | Reconciliação de estoque | Saldo inicial e PV-006-010 | somar entradas-saídas±ajustes | saldo da tabela = kardex calculado | SQL, tela e export | Manter até aceite | A definir / homologação |
| PV-017 | Filtros/exports | Dataset com lojas/status/datas distintas | aplicar mesmo período/loja/status em tela, RPC e export | mesmos IDs e totais | arquivos exportados e query | Excluir arquivos locais sensíveis | A definir / homologação |
| PV-018 | AP/AR, se habilitados | Títulos e liquidações controladas | parcial, total, cancelamento/atraso | saldos/status/histórico reconciliam | IDs, timelines e relatório | Estornar via fluxo auditado | A definir / homologação |
| PV-019 | Fiscal stub | Modo stub; venda válida; Focus sem credenciais | concluir venda; abrir fila/detalhe/recibo; induzir falha | venda não desfaz; UI diz indisponível; sem chave/protocolo/DANFE/XML válido | screenshots e rows | Reprocessar/limpar apenas pelo fluxo previsto | A definir / homologação |
| PV-020 | Backup/restore | Backup identificado; projeto temporário autorizado | restaurar snapshot; cronometrar; executar checks de integridade | RPO≤24h e RTO≤8h úteis ou desvio registrado | timestamps, logs e checksums/contagens | Destruir projeto temporário após aceite autorizado | A definir / externo |
| PV-021 | Observabilidade | Release identificada; canal de alerta configurado | gerar erro controlado client/server; confirmar evento/release/alerta | evento chega com ambiente/release e responsável recebe alerta | links/capturas sanitizadas e horário | remover rota/flag de erro se usada | A definir / homologação |
| PV-022 | Navegador/impressora | Máquina, browser, leitor e impressora da cliente | login, scan, venda, impressão atual/histórica | fluxo legível, sem corte, atalhos e periféricos funcionam | checklist, fotos sem dados pessoais | cancelar venda de teste | A definir / cliente |
| PV-023 | Falha de rede | Sessão web e operação não confirmada | interromper rede antes/durante finalização; restaurar; consultar venda | sem dupla venda/baixa; estado recuperável e mensagem clara | vídeo/logs/IDs | cancelar venda válida | A definir / cliente/homologação |

## Critério de saída

O D0 só recebe GO quando PV-001, PV-003, PV-005 a PV-017 e PV-019 a PV-023 estiverem aprovadas; PV-018 é condicional à habilitação de AP/AR. Falha gera item de backlog ligado à prova, sem apagar a evidência.

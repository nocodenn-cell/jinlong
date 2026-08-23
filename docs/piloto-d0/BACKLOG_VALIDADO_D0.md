# Backlog validado do piloto D0

Somente itens sustentados por evidência entram aqui. Estados: `ABERTO`, `EM_EXECUÇÃO`, `BLOQUEADO`, `VALIDADO`, `RESOLVIDO`.

## Bloqueadores D0

| ID | Título | Pri. | Requisito | Evidência/risco | Arquivos prováveis | Dependências | Testes exigidos | Critério de aceite | Estado |
|---|---|---:|---|---|---|---|---|---|---|
| BL-D0-001 | Tornar tiers a única autoridade de atacado | P0 | D0-01 / ESP-PRC-001 | `pdv_config.quantidade_minima_atacado_padrao` concorre com `precos_atacado`; preço divergente | migrations novas futuras, RPC `calcular_preco_produto`, pricing/core, formulário | Inventário de leitores e decisão já tomada | unitário de boundary + integração RPC + UI quantidade | Global nunca altera runtime; primeiro tier ativo define início | ABERTO |
| BL-D0-002 | Preservar custo `NULL` | P0 | D0-02 / ESP-PROD-006 | Parsers/form/margem podem colapsar ausência em zero; falsifica margem | `useMoneyInput`, form mappers, ProductWriter/Updater, RPC 270, relatórios | Schema remoto | mapper/UI/integração DB/relatório | Cadastrar e vender com NULL; zero só explícito | ABERTO |
| BL-D0-003 | Rejeitar zero em remessa/recebimento | P0 | D0-03 / ESP-EST-007 | migration 034 usa `>=0`; operação sem efeito | actions recebimento, InventoryMovementWriter, RPC/migration aditiva futura | Não alterar migration histórica | validação UI, adapter, SQL zero/negativo/vazio | Nenhuma operação/cabeçalho persiste sem item positivo | ABERTO |
| BL-D0-004 | Decidir e fechar reabertura auditável | P0 | D0-05 / ESP-CX-004 | Fluxo completo não localizado; risco de reescrita financeira | cash core/adapters, RPC aditiva, auditoria, UI | Confirmar se estará exposta no D0 | RLS/perfil, imutabilidade, reconciliação | Só gerente/dono; motivo; evento novo; fechamento intacto | ABERTO |
| BL-D0-005 | Garantir stub fiscal honesto | P0 | D0-09 / ESP-FISC-003 | Fila/estados fiscais podem aparentar emissão | fiscal UI, worker mode/stub, recibo/documentos | Sem Focus real | UI snapshot/behavior + integração venda com stub falho | “Indisponível/em preparação”; sem chave/protocolo/DANFE | ABERTO |
| BL-D0-006 | Provar reconciliações obrigatórias | P0 | D0-10 | Relatórios existem sem prova comum de filtros/equações | reports, cash, inventory, sales readers/RPCs/exports | Dataset e schema-alvo | SQL controlado + E2E tela/export | Todas as equações D0 fecham e IDs coincidem | ABERTO |
| BL-D0-007 | Verificar schema/migrations do ambiente-alvo | P0 | DIV-D0-008 | 271 migrations locais e histórico de drift | `backend/supabase/migrations`, verify scripts | Acesso Supabase autorizado | migration list, verify P0, assinaturas RPC | Remote alinhado, verify sem falha | BLOQUEADO |
| BL-D0-008 | Executar ciclo operacional D0 | P0 | PDV/estoque/caixa | Testes históricos não provam deploy atual | app web + backend | Ambiente-alvo, usuários, dados | plano de provas PV-003 a PV-012 | Cadastro→entrada→venda→cancelamento→fechamento íntegro | BLOQUEADO |
| BL-D0-009 | Testar restore e alertas | P0 | D0-06 / D0-OBS-001 | Restore nunca testado; alerta atual não comprovado | runbooks/config externa | Projeto temporário e acesso Sentry/Supabase | restore + erro proposital | Meta RPO/RTO registrada e alerta recebido | BLOQUEADO |
| BL-D0-010 | Provar permissões negativas | P0 | ESP-PERM-001 | SECURITY DEFINER/RLS só documentados | policies/RPCs/smokes | Schema-alvo e usuários por perfil | matriz negativa completa | Operador não executa operação gerencial; isolamento de loja | BLOQUEADO |

## Importantes, não bloqueadoras por si

| ID | Título | Pri. | Requisito | Evidência/risco | Arquivos prováveis | Dependências | Testes exigidos | Critério de aceite | Estado |
|---|---|---:|---|---|---|---|---|---|---|
| NB-D0-001 | Categoria “+” imediatamente selecionável | P1 | ESP-PROD-002 | Reclamação recente; cache foi corrigido sem E2E específico | quick field/actions/cache tags | Nenhuma | E2E criar→listar→selecionar | Sem reload e sem opção stale | ABERTO |
| NB-D0-002 | Entrada monetária pt-BR no browser | P1 | D0-02 | Unitários existem; interação real não provada | `useMoneyInput`, product form | Browser | digitação/cola/backspace em Playwright | `1`, `1,5`, `1,50` persistem corretamente | ABERTO |
| NB-D0-003 | Hover/foco de botões | P1 | reclamação recente | aliases atuais sugerem correção; sem regressão visual | tokens/aliases/button components | Browser visual | screenshots e teclado | Texto/ícone permanece legível em hover/focus | ABERTO |
| NB-D0-004 | Histórico de preço completo | P2 | ESP-PROD-008 | Auditoria de preços não comprovada | produto updater/audit UI | Modelo de evento | integração + consulta | Ator, anterior, novo, data, motivo | ABERTO |
| NB-D0-005 | Auditoria crítica before/after/terminal | P1 | ESP-AUD-001-003 | Cobertura não universal; terminal parcial | audit migrations/events/adapters | Inventário por operação | contratos e integração | Operações P0 guardam campos obrigatórios | ABERTO |
| NB-D0-006 | Homologar impressão física | P1 | ESP-PDV-012 | Modal existe; impressora real não testada | `CaixaReciboModal.tsx` | Máquina/impressora cliente | manual assistido | Venda atual/histórica legível e sem corte | BLOQUEADO |

## Pós-piloto

| ID | Título | Pri. | Requisito | Evidência | Dependências | Estado |
|---|---|---:|---|---|---|---|
| PP-D0-001 | Venda em espera | P3 | PDF p.1 | Código/testes existem; D0-04 exclui | Contratação e concorrência/reserva | VALIDADO |
| PP-D0-002 | WhatsApp | P3 | PDF pp.5-6 | Não implementado; D0-08 exclui | Provedor, LGPD, consentimento, custo | VALIDADO |
| PP-D0-003 | Multiempresa/transferências | P3 | PDF p.4 | Código parcial; D0 uma loja | Modelo multiempresa e RLS | VALIDADO |
| PP-D0-004 | Inventário formal/cego | P3 | PDF p.4 | D0 usa ajuste; contagem formal excluída | UX e workflow de aprovação | VALIDADO |
| PP-D0-005 | CEP automático | P3 | conveniência | Não implementado; manual deve funcionar | Provedor/fallback | VALIDADO |
| PP-D0-006 | Orçamentos | P2 | PDF p.1 | Implementação canônica não localizada | Decisão de produto | ABERTO |
| PP-D0-007 | Curva ABC/sem movimentação/projeção | P3 | PDF pp.4-5,8 | Fora do conjunto obrigatório | Fórmulas e períodos aprovados | ABERTO |
| PP-D0-008 | Perfis Financeiro/Estoque/Vendedor | P2 | PDF p.6 | Perfis atuais diferem | Matriz de responsabilidades | ABERTO |

## Dependências externas

| ID | Item | Pri. | Dependência | Aceite | Estado |
|---|---|---:|---|---|---|
| EXT-D0-001 | Focus NFe/NF-e/NFC-e real | P3 | Contratação, pagamento, certificado/CSC e configuração fiscal | Homologação SEFAZ/Focus em fase própria | BLOQUEADO |
| EXT-D0-002 | Aceite formal RPO/RTO | P1 | Cliente | Registro de aceite ou contraproposta | BLOQUEADO |
| EXT-D0-003 | Estado de backup do Supabase | P0 | Plano e painel do projeto | Retenção comprovada e restore temporário | BLOQUEADO |
| EXT-D0-004 | Prova no equipamento da cliente | P0 | Máquina, navegador, rede e impressora | Checklist assinado com evidências | BLOQUEADO |

## Regra de encerramento

`RESOLVIDO` exige alteração integrada, teste relevante e prova associada quando operacional. Código alterado isoladamente permanece `ABERTO` ou, no máximo, `VALIDADO` tecnicamente.

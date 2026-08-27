# Backlog validado do piloto D0

Somente itens sustentados por evidência entram aqui. Estados: `ABERTO`, `EM_EXECUÇÃO`, `BLOQUEADO`, `VALIDADO`, `RESOLVIDO`, `ADIADO`, `OBSOLETO`.

**Reconciliação 2026-08-27 (`e1327e62`, GO):** itens de código já na `main` saem de “aguarda homologação de merge”. Homologação **na loja**, restore e permissões remotas permanecem abertos — ver [PROXIMA_SPRINT.md](./PROXIMA_SPRINT.md).

## Bloqueadores D0

| ID | Título | Pri. | Requisito | Evidência/risco | Arquivos prováveis | Dependências | Testes exigidos | Critério de aceite | Estado |
|---|---|---:|---|---|---|---|---|---|---|
| BL-D0-001 | Tornar tiers a única autoridade de atacado | P0 | D0-01 / ESP-PRC-001 | RPC + offline + backfill 34 produtos em 24/08 | `20260823192022_*`, `calcular_preco_produto` | — | SQL + paridade online/offline | Global nunca altera runtime | **RESOLVIDO** (código+remoto; prova na loja = PV-005) |
| BL-D0-002 | Preservar custo `NULL` | P0 | D0-02 / ESP-PROD-006 | Parsers/form/margem podem colapsar ausência em zero | `useMoneyInput`, form mappers, RPC 270 | Schema remoto | mapper/UI/integração | Cadastrar e vender com NULL | ABERTO |
| BL-D0-003 | Rejeitar zero em remessa/recebimento | P0 | D0-03 / ESP-EST-007 | D0-03 + DRAFT `#324` aplicados no remoto | `20260823192024_*`, `20260824120000_*` | — | UI/servidor + SQL | Nenhuma operação vazia; DRAFT aceito | **RESOLVIDO** (código+remoto; prova na loja = PV-006) |
| BL-D0-004 | Decidir e fechar reabertura auditável | P0 | D0-05 / ESP-CX-004 | Fluxo completo não localizado; GO aceitou **indisponível** | — | D0-05: se não for D0, manter fechada | — | Não reescrever fechamento; UI não oferece reabrir | **ADIADO** (mantida indisponível; não é hotfix de go-live) |
| BL-D0-005 | Garantir stub fiscal honesto | P0 | D0-09 / ESP-FISC-003 | Stub `NFC_E_STUB` existe; auditoria visual incompleta | fiscal UI/worker | Sem Focus real | UI snapshot | “Indisponível/em preparação”; sem DANFE | ABERTO (não bloqueou o GO) |
| BL-D0-006 | Provar reconciliações obrigatórias | P0 | D0-10 | Relatórios existem sem prova comum | reports, cash, inventory | Dataset | SQL + E2E tela/export | Equações D0 fecham | ABERTO |
| BL-D0-007 | Verificar schema/migrations do ambiente-alvo | P0 | DIV-D0-008 | Drift de **filename vs versão remota** conhecido; RPCs D0 conferidas | `backend/supabase/migrations` | Acesso Supabase | migration list | Remote alinhado o bastante para o piloto | **VALIDADO** para o GO; drift de catálogo Git↔prod = BACKLOG 10 (não reabre GO) |
| BL-D0-008 | Executar ciclo operacional D0 | P0 | PDV/estoque/caixa | Testes CI não substituem a loja | app web + backend | Máquina da cliente | PV-003 a PV-012 | Ciclo íntegro na loja | BLOQUEADO (acesso loja) — próxima sprint P0 |
| BL-D0-009 | Testar restore e alertas | P0 | D0-06 / D0-OBS-001 | Restore nunca testado | `backup.sh`, runbooks | Projeto temporário | restore + erro proposital | RPO/RTO registrados | BLOQUEADO — próxima sprint P0 |
| BL-D0-010 | Provar permissões negativas | P0 | ESP-PERM-001 | SECURITY DEFINER/RLS documentados | policies/RPCs | Schema-alvo | matriz negativa | Operador não executa gerencial | BLOQUEADO — próxima sprint P1 |

## Importantes, não bloqueadoras por si

| ID | Título | Pri. | Requisito | Evidência/risco | Arquivos prováveis | Dependências | Testes exigidos | Critério de aceite | Estado |
|---|---|---:|---|---|---|---|---|---|---|
| NB-D0-001 | Categoria “+” imediatamente selecionável | P1 | ESP-PROD-002 | `mergeOpcoesFiltros` em `e1327e62`; E2E específico ainda não | `mergeOpcoesFiltros.ts` | Nenhuma | E2E criar→selecionar | Sem opção stale após refresh | **VALIDADO** no código; E2E loja ABERTO |
| NB-D0-002 | Entrada monetária pt-BR no browser | P1 | D0-02 | Unitários existem; interação real não provada | `useMoneyInput` | Browser | Playwright digitação | `1`, `1,5`, `1,50` persistem | ABERTO |
| NB-D0-003 | Hover/foco de botões | P1 | reclamação recente | aliases atuais sugerem correção | tokens/button | Browser visual | screenshots | Texto/ícone legível | ABERTO |
| NB-D0-004 | Histórico de preço completo | P2 | ESP-PROD-008 | Auditoria de preços não comprovada | produto updater/audit UI | Modelo de evento | integração | Ator, anterior, novo, data, motivo | ABERTO |
| NB-D0-005 | Auditoria crítica before/after/terminal | P1 | ESP-AUD-001-003 | Cobertura não universal | audit events | Inventário por operação | contratos | Operações P0 guardam campos | ABERTO |
| NB-D0-006 | Homologar impressão física | P1 | ESP-PDV-012 | Teste browser 20/08; impressora da cliente não | `CaixaReciboModal.tsx` | Máquina cliente | manual assistido | Venda atual/histórica legível | BLOQUEADO (loja) |

## Pós-piloto

| ID | Título | Pri. | Requisito | Evidência | Dependências | Estado |
|---|---|---:|---|---|---|---|
| PP-D0-001 | Venda em espera | P3 | PDF p.1 | Código/testes existem; D0-04 exclui | Contratação | **FORA_DO_D0** (não melhorar agora) |
| PP-D0-002 | WhatsApp | P3 | PDF pp.5-6 | Não implementado; D0-08 exclui | Provedor, LGPD | **FORA_DO_D0** |
| PP-D0-003 | Multiempresa/transferências | P3 | PDF p.4 | Código parcial; D0 uma loja | Modelo multiempresa | **FORA_DO_D0** |
| PP-D0-004 | Inventário formal/cego | P3 | PDF p.4 | D0 usa ajuste | UX aprovação | **FORA_DO_D0** |
| PP-D0-005 | CEP automático | P3 | conveniência | Não implementado | Provedor | **FORA_DO_D0** |
| PP-D0-006 | Orçamentos | P2 | PDF p.1 | Implementação canônica não localizada | Decisão de produto | ABERTO (pós-piloto) |
| PP-D0-007 | Curva ABC/sem movimentação/projeção | P3 | PDF pp.4-5,8 | Fora do conjunto obrigatório | Fórmulas | ABERTO (pós-piloto) |
| PP-D0-008 | Perfis Financeiro/Estoque/Vendedor | P2 | PDF p.6 | Perfis atuais diferem | Matriz | ABERTO (pós-piloto) |

## Dependências externas

| ID | Item | Pri. | Dependência | Aceite | Estado |
|---|---|---:|---|---|---|
| EXT-D0-001 | Focus NFe/NF-e/NFC-e real | P3 | Contratação, certificado/CSC | Homologação SEFAZ/Focus em fase própria | BLOQUEADO — **não é a próxima sprint** |
| EXT-D0-002 | Aceite formal RPO/RTO | P1 | Cliente | Registro de aceite ou contraproposta | BLOQUEADO |
| EXT-D0-003 | Estado de backup do Supabase | P0 | Plano e painel do projeto | Retenção comprovada e restore temporário | BLOQUEADO — próxima sprint P0 |
| EXT-D0-004 | Prova no equipamento da cliente | P0 | Máquina, navegador, rede e impressora | Checklist assinado | BLOQUEADO — próxima sprint P0 |

## Regra de encerramento

`RESOLVIDO` exige alteração integrada, teste relevante e, quando operacional, prova associada. Código na `main` sem prova na loja pode ser `RESOLVIDO` de **release** (como BL-D0-001/003) e ainda exigir PV-* na sprint de estabilização.

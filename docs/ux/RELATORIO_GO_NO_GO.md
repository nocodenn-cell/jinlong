# Relatório GO / NO-GO — Sprint UX-IA-01 (Fase de Auditoria)

## A. Diagnóstico
32 páginas em `/admin` (de 45 no app), 23 entradas na sidebar (20 visíveis ao gerente), 18 rotas alcançáveis pela sidebar e 14 só por aba/link. 12 páginas têm barra de hub; 20 não têm sub-navegação. Financeiro expõe 9 controles. Relatórios é navegado por 3 controles sobrepostos. Sem busca global. Detalhes: `AUDITORIA_NAVEGACAO_JINLONG.md`.

## B. Problemas comprovados
P1–P10 na auditoria (seção D), com arquivo e linha.

## C. Principais desperdícios
Navegação duplicada de relatórios; "Relatórios (detalhe)" legado exposto; Etiquetas em dois hubs; processo de compra espalhado por 4 itens de menu; ausência de 4 links contextuais (Funcionário↔Comissões, Auditoria→produto, Caixa→vendas, Config→Suspensão).

## D. Arquitetura proposta
`ARQUITETURA_INFORMACAO_PROPOSTA.md`: **9 destinos + Abrir PDV** (a hipótese de 8 foi **ajustada**: Vendas precisava de casa; Fornecedores vai a Compras; Comissões a Financeiro).

## E. Layout
`WIREFRAMES_LAYOUT.md`.

## F. Impacto operacional
Maior ganho esperado nas jornadas C (compra/recebimento), D (caixa), E (funcionários), F (dono) e G (auditoria). A venda no PDV **não é tocada**. Ganhos em cliques **não estão medidos** — dependem do baseline em `PLANO_TESTES_USABILIDADE.md`.

## G. Impacto técnico
Reaproveita `HubTabDef`, `AdminHubTabNav`, `ROUTES`. Sem migrations, sem RPC, sem policy. Risco médio apenas em Financeiro (PR 5) e Relatórios (PR 7). Testes de navegação existentes precisam ser atualizados junto.

## H. Plano de execução
`PLANO_IMPLEMENTACAO_UX.md`: 9 PRs; 1–3 são suficientes para resolver a maior parte do "não acho".

## I. Correções a análises anteriores (transparência)
- Afirmei "40 rotas /admin": **são 32**.
- Afirmei "~21 itens visíveis": **são 20**.
- O audit de 17/09 lista como gaps itens **já corrigidos** no código (vendas↔financeiro, recibo com cliente, relatórios clicáveis, estoque→repor). Não reabrir.
- A sidebar esconde Implantação e Diagnóstico de GERENTE, mas a policy **não os bloqueia** por URL (achado de segurança/produto, fora do escopo de UX).
- Algumas funções citadas na missão **não existem** (inventário como tela, histórico de preços, importação em massa, impressoras, integrações, perfis editáveis, personas Estoquista/Financeiro).
- A auditoria de 08/10 listou "Auditoria → produto/Kardex" e "Resultado ↔ DRE" como links faltantes; **ambos já existem** (botão Ver Kardex no detalhe do evento; a view DRE linka `?tab=resultado` e `?tab=resumo` do Financeiro). Detectado ao implementar o PR 3.
- "Caixa → vendas do turno" depende de filtro por caixa na RPC `listar_vendas_gerente`: **não é só UI**.

## J. Decisão

### **GO COM RESSALVAS** — para iniciar os PRs 1–3.

**Ressalvas (devem ser resolvidas ou aceitas por você):**
1. **Aprovação da arquitetura ajustada** (9 destinos, Vendas e Compras separadas, Comissões em Financeiro, Auditoria em Relatórios).
2. **Baseline não medido:** metas de tempo/cliques ficam como hipótese até a primeira rodada de teste (T1–T10 na versão atual).
3. **Termos ZH** precisam de validação por falante nativo antes de fixar os novos rótulos.
4. **Decisão de produto sobre Implantação/Diagnóstico** (restringir por policy ou aceitar acesso do GERENTE) — separada do PR de UX.
5. **PR 5 (Financeiro) e PR 7 (Relatórios) só começam com tabela de equivalência aprovada**; sem isso ficam **NO-GO**.
6. **Vínculo OC↔recebimento manual** (risco de entrada duplicada) é decisão de negócio; o PR 6 só muda a porta de entrada.

## K. Próxima ação
Abrir **PR 1 — Sidebar** (9 destinos + Abrir PDV + grupo Interno + i18n dos rótulos de grupo), após sua aprovação dos itens 1 e 3 acima. Branch nova a partir de `main`; sem tocar em `lib/admin/policy`.

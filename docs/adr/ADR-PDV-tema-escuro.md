# ADR — Tema escuro do PDV

| Campo | Valor |
|--------|--------|
| **ID** | ADR-PDV-002 |
| **Título** | Tema escuro do PDV como evolução planejada (contrato vigente: tema único claro) |
| **Status** | Proposto — evolução de roadmap, **sem** implementação. Aguarda sign-off de produto + design. |
| **Data** | 2026-06-26 |
| **Contexto** | A Fase 0 (Layout Compiler) travou o sistema em **tema único claro** ("cara de Bling"). O Plano Mestre v2 previa tema escuro para o ambiente operacional do PDV. Este ADR registra essa intenção como decisão **futura**, sem alterar o código. |

---

## Contexto

- **Contrato vigente (código):** tema **único claro**. O modo escuro foi
  **aposentado na Fase 0 — Layout Compiler**:
  - `pdv-importados/theme.config.ts` → `ACTIVE_THEME = 'classico'` (claro, imutável);
  - `pdv-importados/tailwind.config.js` → `darkMode` aponta para um seletor
    (`.theme-dark-disabled`) que **nunca** existe no DOM, neutralizando utilitárias `dark:`;
  - tokens de superfície/texto ativos vêm de `styles/theme-oriental.css` (claro).
- **Intenção do Plano Mestre v2:** o PDV é ambiente operacional e se beneficiaria
  de um tema escuro (baixa luminosidade, conforto em turnos longos), enquanto o
  uso administrativo permanece claro (maior contraste).
- **Tensão:** a documentação não pode afirmar "claro + escuro" como contrato sem
  contradizer o código. Por isso o tema escuro é registrado como **roadmap**, não
  como estado atual.

Documentos relacionados:

- [Plano Mestre — Pilar 2 (Design System), §Temas](../plano-mestre/02-DESIGN-SYSTEM.md)
- [Arquitetura do PDV — §7 Roadmap](../plano-mestre/05-ARQUITETURA-PDV.md)

---

## Decisão

1. **Manter o tema único claro como contrato vigente.** Nenhuma alteração de
   implementação é feita por este ADR.
2. **Registrar o tema escuro do PDV como evolução planejada** (roadmap), restrita
   ao ambiente operacional do PDV — não ao administrativo.
3. **Manter os componentes *theme-ready* via tokens** (já é a prática): nenhuma
   cor fixa; tudo via tokens de tema. Isso garante que reativar o escuro **não**
   exija reescrever componentes — apenas fornecer o conjunto de tokens escuros e
   reabilitar o seletor de tema.
4. **Não reabilitar utilitárias `dark:`** enquanto o contrato for tema único; a
   futura ativação deve passar por este ADR ser **Aceito** + sign-off.

## Pré-condições para aceitação (futuras)

- [ ] Sign-off de Produto e Design sobre escopo (apenas PDV) e paleta escura.
- [ ] Conjunto de tokens escuros definido no Design System (espelho dos claros).
- [ ] Estratégia de alternância de tema (seletor no Header) e persistência por
      perfil/estação.
- [ ] Verificação de contraste/acessibilidade no tema escuro.

## Consequências

- **Positivas:** elimina a ambiguidade "claro vs. claro+escuro" na documentação;
  preserva o contrato atual; deixa o caminho de ativação explícito e barato
  (graças aos tokens).
- **Negativas:** mantém, por ora, uma divergência conhecida entre o Plano Mestre
  v2 (que citava escuro) e o código (claro) — divergência rastreada no
  [README do Plano Mestre](../plano-mestre/README.md).

## Próximos passos após aceitação

1. Definir tokens escuros em `styles/tokens/*` (sem remover os claros).
2. Reabilitar o seletor de tema no Header (Pilar 1, §3) e a estratégia `darkMode`.
3. Habilitar o tema escuro **apenas** nas rotas do PDV (`app/caixa`).
4. Atualizar o Pilar 2 (§Temas) e mover o item do Roadmap do PDV para o contrato.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-06-26 | Rascunho inicial — registra tema escuro do PDV como roadmap; contrato vigente permanece tema único claro. |

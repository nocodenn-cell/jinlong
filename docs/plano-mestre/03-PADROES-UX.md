# Pilar 3 — Padrões de UX

> Define **CRUD, filtros, pesquisa, paginação, feedback, modais, confirmações e
> fluxos**. Não descreve implementação de módulo (ver [Pilar 4](./04-MODULOS.md))
> nem componentes (ver [Pilar 2](./02-DESIGN-SYSTEM.md)).

## 1. Padrão CRUD

Todas as telas administrativas seguem o mesmo fluxo, na mesma ordem. **A
localização dos elementos nunca muda.**

```
Visualizar → Filtrar → Pesquisar → Selecionar → Editar → Salvar → Auditoria
```

Mapeamento para o Contrato de Página (Pilar 1):

| Etapa | Onde acontece na tela |
|-------|-----------------------|
| Visualizar | `Content` (DataTable) |
| Filtrar | `FilterBar` |
| Pesquisar | `SearchBar` na `Toolbar` |
| Selecionar | linha/checkbox no `Content` |
| Editar | `Dialog`/`Drawer` ou aba "Cadastro" |
| Salvar | ação primária do `PageHeader`/formulário |
| Auditoria | registro automático (ver §7) |

## 2. Filtros (FilterBar)

- Sempre na mesma posição (logo abaixo da Toolbar).
- Filtros aplicados ficam visíveis como chips/badges removíveis.
- "Limpar filtros" sempre disponível quando há filtro ativo.
- O estado de filtro deve ser refletível na URL quando fizer sentido (deep-link).
- Componente: `components/ui/FilterBar.tsx`.

## 3. Pesquisa

- **Busca Global** no Header (centro) — atravessa módulos.
- **Busca contextual** na Toolbar — restrita ao módulo/lista atual.
- Resultado vazio usa o estado **Empty** (mensagem amigável + ação).

## 4. Paginação

- Sempre ao final do `Content`, antes do `Footer`.
- Padrão consistente entre todas as listas (acoplado ao `DataTable`).
- Preferir paginação real (server-side) em listas grandes; informar total.

## 5. Feedback

| Situação | Padrão |
|----------|--------|
| Ação rápida bem-sucedida | **Toast** de sucesso |
| Erro recuperável | **Alert** inline / Toast de erro + ação |
| Carregamento | **Skeleton** (página) / **Spinner** (ação localizada) |
| Lista vazia | **EmptyState** com ação primária |
| Falha de carregamento | Estado **Error**: descrição + "Tentar novamente" |

Os estados de página são contratuais — ver Pilar 2, §4. Estados visuais de
transação do PDV: `docs/VISUAL_TRANSACTION_STATES.md`.

## 6. Modais e Confirmações

- **Dialog** para edição focada / confirmação; **Drawer** para painéis laterais
  contextuais. Componente base: `DragonModal.tsx`.
- **Confirmação obrigatória** para ações destrutivas ou irreversíveis (excluir,
  cancelar venda, estornar). O botão de confirmação carrega o verbo da ação
  ("Excluir", não "OK") e a ação destrutiva usa a cor `destructive`.
- Foco inicial no primeiro campo (edição) ou no botão seguro (confirmação).
- `Esc` fecha; ação primária acionável por teclado.

## 7. Fluxos & consistência

- Fluxos operacionais permanecem **idênticos entre módulos**: aprendeu uma tela,
  aprendeu o sistema.
- O **Dashboard** é gerencial (indicadores, análises, atalhos); o **PDV** é
  operacional (rapidez, teclado, scanner) — fluxos distintos por contrato.
- Atalhos de teclado do PDV e invariantes: `docs/CIRCUITO_OPERACIONAL.md`,
  `docs/OPERACAO_PDV_PRIORIDADES.md`.

## 8. Auditoria (UX + obrigatoriedade)

Toda operação registra: **Usuário · Data · Hora · Estação · Operação · Valor
anterior · Valor atualizado**.

A auditoria é **obrigatória em todos os módulos** e é a etapa final do CRUD.
Do ponto de vista de UX, a trilha de auditoria deve ser consultável (ex.:
`/gerente/atividades`, `/admin/auditoria`) usando o mesmo Contrato de Página.
Regras de negócio e retenção: ver Pilar 4.

## 9. Acessibilidade & teclado (base)

- Toda ação primária acessível por teclado.
- `Focus` visível em todos os componentes interativos (Pilar 2, §3).
- Contraste mínimo respeitado pelo tema claro (uso administrativo).

# Estoque (gerente) — listagem + modal de ajuste padronizado

Refatoração da página `pdv-importados/app/gerente/estoque/` mantendo o
`actions.ts` intacto. Mudanças focam em:

1. **Modal de ajuste no padrão Jīn Lóng** — o atual usa `<dialog>` nativo
   com inline styles cinzas (`background: '#fff'`, etc.), totalmente fora
   do design system. O novo usa `Card` + `dragon-glass-card` + tokens
   `app-btn-*` igual ao `ClienteEditarModal`.
2. **3 modos de operação** explícitos: **Entrada / Saída / Acerto** —
   antes era só um par de campos numéricos sem semântica. Cada modo tem
   sua paleta de motivos e seu botão de confirmação tematizado.
3. **Preview em tempo real** do estoque resultante (antes → depois),
   alertando se o resultado ficar abaixo do mínimo.
4. **Scroll infinito** + filtros enxutos (busca + categoria + toggle "só
   abaixo do mínimo") — substitui a paginação tradicional + nav-link.
5. **Coluna "Última movimentação"** pronta para receber dados do RPC
   (renderiza `—` quando não há, sem quebrar).

## Visualizar

Abra `index.html` — 25 produtos mock (alguns críticos, alguns ok), scroll
infinito, filtros funcionando, modal de ajuste com toggle 3-vias e preview.

## Drop-in no monorepo

Substitua/adicione em `pdv-importados/app/gerente/estoque/`:

```
estoque/
  page.tsx                          ← SUBSTITUIR (usa o novo Client)
  EstoqueListClient.tsx             ← NOVO (alternativa ao PageClient atual)
  EstoqueAjusteModal.tsx            ← SUBSTITUIR (padrão DS)
  actions.ts                        ← MANTÉM (nenhuma mudança)
  actions.validation.ts             ← MANTÉM
  EstoqueGerentePageClient.tsx      ← REMOVER (ou manter como legado)
```

E aplique as chaves de `i18n.additions.ts` aos arquivos
`pdv-importados/i18n/messages.{pt,zh}.ts`.

## O que entrega

### Tabela (`EstoqueListClient.tsx`)

| Coluna | Conteúdo |
|---|---|
| **Código** | SKU curto (mono) + EAN abaixo |
| **Produto** | Nome + unidade |
| **Estoque atual** | Número grande, vermelho quando ≤ mínimo |
| **Mínimo** | Número + déficit "−N para repor" se baixo |
| **Status** | Badge `app-badge-positive` (Normal) / `app-badge-danger` (Baixo) |
| **Última movimentação** | Relativa ("há 3 h") + tipo (placeholder se RPC não retornar) |
| **Ações** | Botão "Ajustar" amber (`app-btn-accent`) |

- **Linha crítica** ganha fundo `bg-destructive/[0.08]` (rosa-escuro
  translúcido) — mesma cor já usada no PageClient atual.
- **Scroll infinito** via `IntersectionObserver` com `rootMargin: 300px`,
  carrega 25 linhas por vez via `obterListaEstoqueGerente()`.
- **Toggle "só abaixo do mínimo"** é o mesmo de toda a área gerente —
  apenas o switch âmbar/vermelho — em vez do `GerenteNavLink` separado.

### Modal (`EstoqueAjusteModal.tsx`)

- `Card` com `dragon-glass-card` (mesmo do `ProdutosEditarCatalogoModal`)
- Cabeçalho: ícone `Boxes` âmbar + nome + EAN + unidade
- **Snapshot atual**: 2 cards em grid (atual + mínimo), o atual fica
  vermelho se está abaixo do mínimo
- **Toggle de operação** (`role="radiogroup"`): Entrada (verde) / Saída
  (vermelho) / Acerto (âmbar) — cada um com hint explicativo
- **Quantidade** + (apenas em "Acerto") **novo mínimo**
- **Preview** "Antes → Depois" com cor accent no resultado e alerta
  vermelho se ficar crítico
- **Motivo** filtrado pelo tipo da operação (entradas só veem motivos
  de entrada, etc.) — códigos casam com o RPC `ajustar_estoque_manual`
- **Observação** obrigatória quando motivo = "OUTRO"
- Botão de confirmação muda: "Confirmar entrada" / "Confirmar saída"
  (vermelho) / "Salvar acerto"
- **a11y**: `role=dialog` `aria-modal`, ESC fecha, focus trap, foco volta
  para o botão "Ajustar" que abriu

### Validações no client

| Caso | Mensagem |
|---|---|
| Quantidade vazia | "Informe a quantidade." |
| Entrada ≤ 0 | "Entrada deve ser positiva." |
| Saída ≤ 0 | "Saída deve ser positiva." |
| Saída > estoque atual | "Saída maior que o estoque atual (N)." |
| Acerto < 0 | "Estoque não pode ser negativo." |
| Mínimo < 0 (acerto) | "Mínimo não pode ser negativo." |
| OUTRO sem observação | "Para 'Outro', a observação é obrigatória (mín. 3 caracteres)." |

A validação server-side em `actions.validation.ts` continua intacta —
estes erros só servem para feedback imediato.

## Compatibilidade

- `actions.ts` **não muda** — o `EstoqueListClient` chama os mesmos
  `obterListaEstoqueGerente`, `obterListaEstoqueGerenteCompletaParaExport`,
  e `atualizarEstoqueProdutoThrow` do `EstoqueGerentePageClient` atual.
- Rotas `/gerente/estoque/imprimir-etiquetas` e `/gerente/estoque/importar-nfe`
  **continuam funcionando** — o `page.tsx` novo só toca o index. Os links
  no header foram preservados.
- O parâmetro `?filtro=baixo` ainda funciona — ativa o toggle
  automaticamente.

## Typecheck

Como o repo é Next.js + TS, depois de copiar os arquivos:

```bash
cd pdv-importados
pnpm typecheck
```

Aviso: o arquivo `EstoqueListClient.tsx` referencia 5 chaves novas em
`m.estoque.*` (listadas em `i18n.additions.ts`). Sem aplicá-las, o
typecheck reclama do tipo `Mensagens`. Aplique antes do typecheck rodar
limpo.

## Arquivos da demo (não vão para produção)

`index.html`, `estoque.css`, `mock-data.jsx`, `EstoqueList.jsx`,
`EstoqueAjusteModal.jsx` — só para visualizar o resultado sem precisar do
Supabase / RPC configurados. Produção mora nos `.tsx`/`.ts`.

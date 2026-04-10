# Roteiro de apresentação — Demo FastProduct

Documento para **conduzir a demo** (admin web + PDV desktop + nuvem), com **env**, **fluxos** e **o que dizer** quando algo falhar. Complementa o circuito técnico em [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md) e o fechamento do piloto em [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md).

---

## 1. Mensagem em uma frase

**Importados no balcão (Tauri + SQLite + fila para a nuvem) e gestão no navegador (Next.js + Supabase), com painel administrativo que pode exibir identidade bilíngue opcional.**

---

## 2. Antes de ligar o projetor (checklist rápido)

### 2.1 `pdv-importados` (web)

| Variável | Demo recomendada | Nota |
|----------|------------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Preenchida | Obrigatório. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preenchida | Login e dados com RLS. |
| `NEXT_PUBLIC_ADMIN_CHINESE_UI` | `true` primeiro | Tema oriental no `/admin`; para comparar, `false` e novo build ou segundo ambiente. |
| `NEXT_PUBLIC_IDLE_LOGOUT_MINUTES` | `0` | Evita logout no meio da fala. |
| `RELATORIO_TIMEZONE` | `America/Sao_Paulo` | Alinha datas do dashboard. |

Referência completa: `pdv-importados/.env.example`.

### 2.2 `pdv-local` (desktop)

| Variável | Demo recomendada | Nota |
|----------|------------------|------|
| `SYNC_ENDPOINT` | URL da Edge `sync-outbox` | Sem isso, sync real não sobe eventos. |
| `SYNC_KEY` | Igual ao secret da Edge | Mesmo valor que `npx supabase secrets set SYNC_KEY=...`. |
| `DEVICE_FINGERPRINT` | Opcional, fixo p.ex. `demo-loja-01` | Facilita achar logs na Edge. |

Referência: `pdv-local/.env.example`. Detalhe de deploy e secrets: [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md).

### 2.3 Contas e dados

- Usuário **autenticado** com acesso a **`/admin`** (dashboard) e rotas **`/gerente/*`** conforme seu RLS/papéis.
- Alguns **pedidos/vendas** no período (hoje / 7d) para o gráfico e a tabela não vazios — ou aceitar estado vazio como “filtro sem movimento”.

---

## 3. Ordem sugerida da demo (~12–18 min)

### Bloco A — Admin web (5–7 min)

1. **Login** em `/login` com o usuário de demo.
2. **Painel administrativo** em `/admin` (redireciona para `/admin/dashboard`).
3. **Narrativa visual (tema oriental):** cabeçalho, nav com tooltips (`title`), cartões com animação suave; mencionar **`prefers-reduced-motion`** se alguém perguntar de acessibilidade.
4. **Dashboard:** período (hoje / 7 / 30), filtros de status, gráfico de tendência, tabela de pedidos.
5. **Se aparecer banner de erro (vermelho/âmbar):** “Dados parciais — rede, projeto Supabase ou política RLS; o painel degrada sem travar a UI.” Aponte o `role="alert"` e a lista de mensagens.
6. **Navegação:** um clique em **Gerente / Vendas / Estoque** (rotas `/gerente/...`) para mostrar continuidade fora do `/admin`.
7. **Opcional:** com segundo ambiente ou rebuild, `NEXT_PUBLIC_ADMIN_CHINESE_UI=false` — layout neutro em PT; comentário honesto: *visualmente* sem fonte chinesa; bundle do layout `/admin` pode ainda carregar assets comuns (impacto pequeno).

### Bloco B — PDV desktop (5–8 min)

1. Abrir o app **Tauri** já com `.env` válido.
2. **Catálogo:** após abrir, o app tenta sincronizar; se **falhar**, mostrar mensagem de erro de catálogo e explicar: *venda local em SQLite continua possível com cache já carregado; reconexão + nova sync recupera*.
3. Fluxo feliz: **incluir itens**, totais, (se fizer parte do roteiro) desconto com validação de gerente conforme `STRICT_MANAGER_DISCOUNT_AUTH`.
4. **Registrar venda** e mencionar **outbox**: eventos ficam pendentes até `sync-outbox` aceitar; offline = fila local, online = drenagem.
5. **Volta ao browser:** em `/gerente` ou dashboard, mostrar **venda refletida** após sync (ou “em alguns segundos após a fila processar”).

### Bloco C — Fechamento (1–2 min)

- **Stack:** Next (admin/caixa web), Tauri + Rust (PDV), Supabase (Postgres + Edge).
- **Piloto / produção:** apontar [DONE_DEFINITION_PILOTO.md](./DONE_DEFINITION_PILOTO.md) ou release note quando for caso real.

---

## 4. Fallbacks e frases prontas

| Situação | O que dizer / fazer |
|----------|---------------------|
| Supabase lento ou 503 | “O painel mostra erro parcial; não congelamos a página. Em produção monitoramos Edge e pool.” |
| RLS nega leitura | “Este usuário não enxerga essa tabela no projeto de demo; em homologação alinhamos políticas e papéis.” |
| Gráfico indisponível | Texto já previsto no produto quando vendas do período falham; leia a mensagem em tela. |
| PDV sem rede | “Catálogo pode estar desatualizado; vendas gravam local e a fila envia quando voltar a Edge.” |
| Sync da outbox falha | “Eventos permanecem pendentes ou em backoff; operação pode reprocessar conforme runbook — ver circuito operacional.” |
| Demo curta (só web) | Fazer apenas Bloco A + menção ao B em um slide. |

---

## 5. O que não prometer na demo

- Latência fiscal em produção sem alinhar `fiscal-worker` e provedor.
- “Zero bytes de fonte com UI PT” no `/admin` sem refatorar layout (route groups) — hoje o impacto é marginal; ver discussão em PR/notas do tema chinês.

---

## 6. Após a demo (opcional)

- Anotar perguntas para backlog (i18n EN, métricas de bundle, etc.).
- Se houve erro de dados, capturar screenshot do banner e o trecho de log (sem secrets).

---

## 7. Referências no repositório

| Documento / arquivo | Uso |
|---------------------|-----|
| [CIRCUITO_OPERACIONAL.md](./CIRCUITO_OPERACIONAL.md) | Edge `sync-outbox`, secrets, papel web vs desktop. |
| [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md) | Gate operacional. |
| `pdv-importados/.env.example` | Variáveis web, fiscal, flags. |
| `pdv-local/.env.example` | `SYNC_*` e fingerprint. |

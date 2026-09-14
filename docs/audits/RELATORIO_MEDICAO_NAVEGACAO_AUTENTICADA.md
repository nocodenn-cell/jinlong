# Medição de Navegação Autenticada

**Data:** 2026-09-12, 22:53 a 23:02 UTC · **Ambiente:** produção (`www.jinlong.app`) · **Modo:** somente medição (nenhum código, banco ou configuração alterados)

**Legenda de evidência:**
- **MEDIDO:** cronometrado nesta sessão.
- **OBSERVADO:** visto diretamente (log, DOM, rede), sem cronometragem.
- **INFERIDO:** conclusão tirada de dados medidos.
- **NÃO MEDIDO:** não foi possível medir; o motivo está indicado.

---

## 1. Método

1. **Autenticação real, sem credenciais expostas.** O próprio usuário fez login no navegador interno do app (Chromium do Claude Desktop), com perfil de gerência. O agente não digitou senha e não leu cookies, tokens nem `localStorage`.
2. **Instrumento no navegador (MEDIDO).** Um script injetado na página observa três coisas:
   - `window.fetch`, só para contar requisições em andamento;
   - Resource Timing, para medir o TTFB e a duração de cada request RSC (`?_rsc`) e de cada Server Action (POST);
   - o DOM, para detectar quando a tela fica sem indicador de carregamento.
3. **Navegação por clique (SPA).** O script clica no `<a>` real da sidebar ou do hub de estoque e cronometra três marcos:
   - `url_mudou`: quando a URL troca, ou seja, quando o Next confirma a navegação;
   - **`tela utilizável`**: não há `.animate-spin`, `.animate-pulse` nem `[aria-busy=true]` dentro de `#main-content`, e já existe um título na tela. No Caixa, entra também o fim das Server Actions disparadas depois que a tela aparece;
   - `rede quieta`: nenhuma requisição em andamento por 1 s. Inclui os prefetches em segundo plano.
   - Foram 3 rodadas completas por rota.
4. **Recarga completa (F5).** Uma recarga por rota, e duas no Dashboard. Mede Navigation Timing (TTFB, HTML completo, DCL), LCP e a última resposta de rede.
5. **Lado servidor.** Logs do gateway Supabase (`edge_logs`) com `response.origin_time` de cada chamada:
   - `Vercel Edge Function` = middleware;
   - `node` = render RSC ou Server Action.
6. **Alinhamento dos relógios.** O relógio do servidor está cerca de **+3,0 s** à frente desta máquina (cabeçalho `Date` de `/api/health`, 3 amostras, precisão de ±0,5 s). Por isso, **atribuir uma chamada do log a uma navegação específica é INFERIDO**. O `origin_time` de cada chamada é MEDIDO.

## 2. Ambiente

| Item | Valor |
|---|---|
| App | Produção Vercel, região `gru1`, deploy `main` `8bc56764` |
| Banco | Supabase `sa-east-1` (produção) |
| Cliente | Chromium interno do Claude Desktop, Windows 11, rede residencial em Recife/BR, **sem throttling** |
| Usuário | 1 usuário de gerência; nenhum outro tráfego relevante no horário |
| Volume de dados | ~245 vendas, ~141 produtos |
| Escrita | Nenhuma. Só GETs, RPCs de leitura e as Server Actions de leitura que o Caixa dispara ao abrir. Nenhum turno aberto, nenhum modal, nenhum salvar. Registro de sessão no Auth só pelo login do próprio usuário e refresh normal do middleware |

## 3. Resultados

### 3.1 Navegação por clique (MEDIDO, ms): uma linha por tentativa

A coluna "Queries/RPCs" vem dos logs Supabase da janela correspondente: origin_time MEDIDO, atribuição INFERIDA.

| Rota | Tentativa | TTFB RSC | Request total | Tela utilizável | Queries/RPCs (servidor) | Observação |
|---|---|---:|---:|---:|---|---|
| Dashboard `/admin/dashboard` | 1ª | 461 | 1.280 | **1.385** | `relatorio_settings`, `caixas`, 3× `vendas`, flags, `v_estoque_baixo`, 2× `usuarios`, todas entre 60 e 339 | loading imediato (24 ms) |
|  | 2ª | 266 | 656 | **704** | idem, entre 59 e 159 | |
|  | 3ª | 215 | 669 | **804** | idem, entre 16 e 77 | |
| Caixa `/caixa` | 1ª | 194 | 606 | **2.970** | 5 Server Actions **em série** no navegador: 926 → 310 → 305 → 258 → 325 | cada action passa por middleware + auth RSC + RPC (§4) |
|  | 2ª | 399 | 575 | **2.727** | actions: 428 → 531 → 418 → 250 → 304 | |
|  | 3ª | 201 | 368 | **2.697** | actions: 369 → 712 → 331 → 285 → 419 | |
| Vendas `/admin/vendas` | 1ª | 1.109 | 2.688 | **2.849** | middleware auth 344 + usuarios 598 · RSC auth 32 + usuarios 792 · `listar_venda_eventos_gerente` 637 | clique sem resposta visual por 1.152 ms |
|  | 2ª | 444 | 2.790 | **2.819** | middleware 17 + 183 · RSC auth 538 + usuarios 953 · RPC 646 | |
|  | 3ª | — | — | 52 | nenhum request | **cache do roteador Next**: não é carga real |
| Catálogo `/admin/catalogo` | 1ª | **5.797** | **10.206** | **10.560** | middleware auth **3.056** + usuarios **2.382** · RSC auth 401 + usuarios **2.057** · `list_produtos_gerente_filtrados` 806 · estoque 801 / produtos 1.059 | **clique sem resposta visual por 5,9 s**; 1ª navegação, servidor frio |
|  | 2ª | 233 | 544 | **719** | auth 26/43 + usuarios 19/72 · RPC 93 · 28 / 19 | |
|  | 3ª | — | — | 175 | nenhum request | cache do roteador: não é carga real |
| Financeiro `/admin/financeiro` | 1ª | 462 | 3.119 | **3.315** | 6 consultas paralelas com **2.050 a 2.431** cada + KPIs 450 / 411 / 225 | |
|  | 2ª | 365 | 957 | **1.020** | 6 paralelas entre 215 e 387 + KPIs 42 / 47 / 20 | |
|  | 3ª | 295 | 747 | **837** | 6 paralelas entre 113 e 241 + KPIs 25 / 47 / 29 | |
| Relatórios `/admin/relatorios` | 1ª | 762 | **12.166** | **12.382** | em série: settings 340 → `vendas_por_dia` **2.053** → `top_produtos` 1.014 → `resumo_exec` 654 → `v_estoque_baixo` 575 → `margem_venda` 1.046 → `curva_abc` **2.106** → `cobertura` 663 → `divergencia` 735 → [vendas 1.547 ‖ `sem_giro` 1.698] | loading imediato; conteúdo aos 12,4 s |
|  | 2ª | 264 | 2.210 | **2.293** | settings 23 → `vendas_por_dia` 786 → 125 → 139 → 72 → 109 → 99 → 77 → 57 → [159 ‖ 119] | |
|  | 3ª | 268 | 4.728 | **4.760** | settings 27 → `vendas_por_dia` 892 → 139 → 486 → 321 → 217 → 198 → 275 → **1.091** → [81 ‖ 316] | |
| Estoque `/admin/estoque` | 1ª | 278 | 487 | **666** | `gerente_estoque_list_page` 94 | |
|  | 2ª | 686 | 941 | **1.049** | RPC 47 | |
|  | 3ª | 251 | 747 | **820** | RPC 122 | |
| Recebimento `/admin/estoque/recebimento` | 1ª | 541 | 1.015 | **1.171** | produtos 24 · remessas 24 | sem skeleton: **clique sem resposta até a resposta chegar** |
|  | 2ª | 187 | 325 | **370** | idem | |
|  | 3ª | 367 | 488 | **542** | idem | |
| Importar NF-e `/admin/estoque/importar-nfe` | 1ª | 1.312 | 2.589 | **2.741** (+ action 899, rede quieta em 3.639) | `importacoes_nfe` 27 | clique sem resposta por 2,7 s |
|  | 2ª | 195 | 261 | **309** (+ action 480, rede quieta em 802) | idem | |
|  | 3ª | 164 | 250 | **305** (+ action 376, rede quieta em 679) | idem | |
| Entrada `/admin/estoque/entrada` | — | — | — | **NÃO MEDIDO** | — | **404 em produção**: a rota só existe no branch local. Em produção a entrada é feita por Recebimento e Importar NF-e |

### 3.2 Recarga completa / F5 (MEDIDO, ms)

"Tela sem loading" é um limite superior: o script só começa a observar depois do evento `load`.

| Rota | TTFB documento | HTML completo (stream) | LCP | Tela sem loading (≤) | Última resposta | Servidor (origin_time) |
|---|---:|---:|---:|---:|---:|---|
| Dashboard (1ª) | 43 | **12.428** | **13.328** | 12.924 | 14.498 | middleware auth 680 + **`usuarios` 8.184** · RSC auth 829 + usuarios 180 · `vendas` até 1.037 · nomes 733 |
| Dashboard (2ª) | 47 | 2.364 | 2.772 | 2.734 | 3.367 | — |
| Catálogo | 56 | 1.830 | 2.844 | 2.418 | 4.466 | auth 20 + 733 · RPC 167 |
| Vendas | 47 | 2.326 | 3.392 | 2.905 | 3.168 | auth 805 + 62 · flags 693 · RPC 34 |
| Financeiro | 44 | 1.779 | 3.040 | 2.443 | 2.806 | — |
| Relatórios | 43 | 4.385 | 5.284 | 4.779 | 5.161 | 720 → 835 → 467 → 273 → 281 → 99 → 51 → 39 → [35 ‖ 202] |
| Estoque | 44 | 701 | 1.300 | 1.070 | 1.863 | — |
| Recebimento | 134 | 2.141 | 3.548 | 2.476 | 3.690 | — |
| Importar NF-e | 45 | 576 | 2.928 | 1.977 | 2.691 | action 507 |
| Caixa | 44 | 428 | 1.376 | 1.552 | **2.662** (fim das 5 actions: 421 → 355 → 490 → 281 → 346) | — |

### 3.3 Resumo pedido

| Pergunta | Resposta | Evidência |
|---|---|---|
| **Pior rota** | **Relatórios**: 12.382 ms (1ª), mediana 4.760 ms | MEDIDO |
| **Melhor rota** | **Importar NF-e**: 305 a 309 ms quente, ou **Recebimento**: 370 a 542 ms | MEDIDO |
| **Média aproximada** | **2,4 s** por navegação por clique (25 amostras válidas, sem os acertos de cache); **mediana 1,17 s** | MEDIDO (média calculada) |
| **Maior waterfall** | Relatórios 1ª: **10 estágios sequenciais + 1 paralelo**, ~10,9 s só de consultas | MEDIDO (origin_time) / INFERIDO (atribuição) |
| **Maior espera de autenticação** | **8.184 ms** num `SELECT` de `usuarios` pelo middleware (F5 do Dashboard). Na 1ª ida ao Catálogo, auth somou **7,9 s** de 10,2 s (3.056 + 2.382 + 401 + 2.057) | MEDIDO |
| **Maior espera de banco** | `relatorio_curva_abc_periodo` **2.106 ms** e `relatorio_vendas_por_dia_periodo` **2.053 ms** (Relatórios 1ª); consultas do Financeiro com **2,0 a 2,4 s** cada (1ª) | MEDIDO |
| **Espera inesperada no frontend** | (a) **Clique sem nenhuma resposta visual** até o servidor responder: Catálogo 5,9 s, Importar NF-e 2,7 s, Vendas 1,2 s, Recebimento 0,4 a 1,2 s. (b) **Tempestade de prefetch**: toda tela aberta dispara de 3 a 5 requests RSC para os links visíveis, cada um passando pelo middleware com 2 chamadas de auth; no Catálogo 1ª levaram 3,5 a 3,8 s cada. (c) **Caixa: 5 Server Actions estritamente em série**. (d) **Cache do roteador** serviu Catálogo e Vendas na 3ª rodada sem request, com dados possivelmente defasados | MEDIDO (a, b, c) / OBSERVADO (d) |

## 4. Waterfalls

**Relatórios, 1ª navegação (MEDIDO, ~12,0 s no servidor):**

```text
clique → middleware [getUser 248 → usuarios 335] → RSC [getUser 57 → usuarios 243]
→ relatorio_settings 340 → vendas_por_dia 2.053 → top_produtos 1.014 → resumo_exec 654
→ v_estoque_baixo 575 → margem_venda 1.046 → curva_abc 2.106 → cobertura 663
→ divergencia 735 → [vendas 1.547 ‖ sem_giro 1.698] → HTML/RSC final (12.166 no navegador)
```

**Caixa (MEDIDO, 3 de 3 tentativas):**

```text
RSC /caixa (368–606) → tela pintada
→ action 1 (369–926) → action 2 (310–712) → action 3 (305–418) → action 4 (250–285) → action 5 (304–419)
cada action no servidor: middleware [getUser → usuarios] → RSC [getUser → usuarios] → RPC
(obter_status_caixa_operador | regras_preco + pdv_config_para_caixa_web | obter_limite_sangria |
 configuracoes_para_caixa_web | listar_vendas_em_espera). As RPCs levam 18–129 ms.
```

As actions começam, cada uma, 3 a 6 ms depois do fim da anterior, o que confirma a serialização. **INFERIDO:** das ~2,1 s de actions, as RPCs somam cerca de 0,25 s. O restante vem das 4 idas de autenticação por action e da ida e volta navegador → Vercel → Supabase.

**Catálogo, 1ª navegação, servidor frio (MEDIDO):**

```text
clique → [sem mudança visual] middleware [getUser 3.056 → usuarios 2.382] → TTFB 5.797
→ RSC [getUser 401 → usuarios 2.057] → list_produtos 806 → [estoque 801 ‖ produtos 1.059] → 10.206
→ 4 prefetches paralelos (3.476–3.752 cada, passando pelo middleware)
```

**Dashboard, F5 frio (MEDIDO):**

```text
documento TTFB 43 (shell + loading) → middleware [getUser 680 → usuarios 8.184]
→ RSC [getUser 829 → usuarios 180] → flags 246 / settings 133 / caixas 164 → [vendas ×3 até 1.037, …] → nomes 733
→ HTML completo 12.428 · LCP 13.328
```

## 5. Gargalos reais percebidos

### MEDIDO

1. **Relatórios: 2,3 a 12,4 s por abertura** (mediana 4,8 s). O tempo é quase todo das consultas encadeadas.
2. **Picos de autenticação** (`/auth/v1/user` e `SELECT usuarios`) de **2 a 8,2 s** na primeira requisição depois de um período ocioso. Com servidor quente, as mesmas chamadas levam 12 a 140 ms. O gargalo real é **intermitente**, não constante.
3. **O Caixa leva ~2,7 s para ficar operacional** em todas as tentativas (2.697 a 2.970 ms). A tela aparece em 0,4 a 0,6 s, e as 5 actions em série levam o restante.
4. **Vendas: ~2,8 s** nas 2 cargas reais, com auth (edge + RSC) respondendo por 0,9 a 1,7 s do total.
5. **Financeiro: 3,3 s** na 1ª abertura (consultas paralelas de 2 a 2,4 s cada) e **0,8 a 1,0 s** quente.
6. **Dashboard, Estoque, Recebimento e Importar NF-e ficam abaixo de 1,4 s** quando quentes.
7. **Clique sem feedback:** rotas sem shell de loading pré-carregado só mudam de tela quando o servidor responde (até 5,9 s).
8. **`/admin/estoque/entrada` retorna 404 em produção.**

### OBSERVADO

- A validação de fuso (`relatorio_tz_validado`) **não custou ~745 ms em toda RPC**. Nas cargas 2ª, 3ª e F5, só a **primeira** RPC do render (`vendas_por_dia`) ficou em 720 a 892 ms; as seguintes ficaram entre 39 e 486 ms. Na 1ª carga, todas ficaram lentas (654 a 2.106 ms).
- Cada tela aberta dispara prefetch de 3 a 5 links (hub de estoque, catálogo, financeiro, `/login`), e cada um executa o middleware com 2 chamadas ao Supabase.
- Requisições do Sentry (`/api/…/envelope/`) aparecem durante a carga, com 44 a 115 ms cada.

### INFERIDO

- O custo de ~700 ms da validação de fuso parece ser **por conexão fria ao banco**, não por chamada. Isso corrige a leitura do relatório anterior, que multiplicava por 6. A ordem das RPCs em série ainda domina Relatórios.
- Os picos de 2 a 8 s em `SELECT usuarios` (média de 1,9 ms no banco, segundo `pg_stat_statements`) indicam espera **fora da execução SQL**: aquisição ou abertura de conexão no PostgREST/pooler depois de ociosidade, ou cold start. Não foi possível separar essas causas.
- O primeiro acesso do dia, ou depois de alguns minutos parado, é o que o usuário do piloto sente como "sistema lento". Nas 2ª e 3ª navegações a maioria das telas fica abaixo de 1 s, exceto Relatórios, Vendas e Caixa.

## 6. Baseline

"Baseline" é a mediana das navegações por clique válidas (MEDIDO). Pior caso é o maior valor observado.

| Rota | Baseline (clique) | Pior caso observado | F5 (HTML completo / LCP) |
|---|---:|---:|---:|
| Relatórios | **4,8 s** | **12,4 s** | 4,4 s / 5,3 s |
| Vendas | **2,8 s** (2 amostras) | 2,85 s | 2,3 s / 3,4 s |
| Caixa (operacional) | **2,7 s** | 3,0 s | 2,7 s até a última action |
| Financeiro | **1,0 s** | 3,3 s | 1,8 s / 3,0 s |
| Estoque | **0,8 s** | 1,0 s | 0,7 s / 1,3 s |
| Dashboard | **0,8 s** | 12,4 s (F5 frio) | 2,4 s / 2,8 s (F5 quente) |
| Catálogo | **0,7 s** quente (2 amostras válidas) | **10,6 s** (frio) | 1,8 s / 2,8 s |
| Recebimento | **0,5 s** | 1,2 s | 2,1 s / 3,5 s |
| Importar NF-e | **0,3 s** (+0,4 a 0,9 s de action) | 2,7 s | 0,6 s / 2,9 s |

> **Hoje, um usuário autenticado espera aproximadamente:**
> - **0,8 s** para abrir o Dashboard por clique, **2,4 s** por F5 e **até 12 s** no primeiro acesso frio;
> - **2,7 s** para o Caixa ficar operacional;
> - **2,8 s** para Vendas;
> - **4,8 s** para Relatórios (entre 2,3 e 12,4 s);
> - **1,0 s** para o Financeiro (3,3 s na primeira vez);
> - **0,7 s** para o Catálogo com servidor quente (10,6 s na primeira navegação fria);
> - **0,3 a 0,5 s** para Recebimento e Importar NF-e.
>
> Números de **uma** sessão, **3 amostras** por rota, rede sem throttling (§8).

## 7. Prioridade (maior tempo real primeiro)

1. **Relatórios:** mediana 4,8 s, pior 12,4 s.
2. **Primeira navegação fria (qualquer rota):** 10,6 s (Catálogo) e 12,4 s (Dashboard F5), dominados por auth.
3. **Vendas:** 2,8 s.
4. **Caixa:** 2,7 s, consistente, e é o fluxo operacional do piloto.
5. **Financeiro:** 1,0 s (3,3 s na 1ª).
6. **Estoque:** 0,8 s.
7. **Dashboard:** 0,8 s quente.
8. **Catálogo:** 0,7 s quente.
9. **Recebimento:** 0,5 s.
10. **Importar NF-e:** 0,3 s.

## 8. Limitações

- **Amostra pequena:** 1 usuário, 1 máquina, 1 janela noturna com baixa concorrência, 3 tentativas por rota. Caixa e Relatórios mostraram variação alta entre tentativas.
- **Rede do auditor** (residencial, Recife) e **sem throttling**. Um balcão com rede pior terá tempos maiores. Nenhuma CPU lenta foi emulada.
- **"Tela utilizável" é heurística:** sem spinner, skeleton ou `aria-busy`, com título presente e, no Caixa, com as actions de inicialização encerradas. Não mede hidratação, long tasks nem o momento em que um botão específico passa a responder (**NÃO MEDIDO**).
- **F5:** o script só começa depois do `load`, então "tela sem loading" é um limite superior. Só 1 amostra por rota (2 no Dashboard).
- **Atribuição servidor ↔ navegação é INFERIDA** (diferença de relógio de ~3,0 s ± 0,5 s). Os prefetches paralelos misturam chamadas de auth na mesma janela.
- **Tempo de execução das funções na Vercel e cold start: NÃO MEDIDO.** A Vercel não expõe duração nos logs acessíveis. O cold start não pôde ser separado da latência de conexão no Supabase.
- **Entrada (`/admin/estoque/entrada`): NÃO MEDIDO**, pois retorna 404 em produção.
- **Caixa medido com perfil de gerência**, sem turno aberto e sem bipar produto. **Tempo de scan/busca e de finalizar venda: NÃO MEDIDO** (seria escrita em produção).
- **Catálogo e Vendas na 3ª rodada vieram do cache do roteador** e foram excluídos das médias.
- **Volume de dados baixo** (~245 vendas): os tempos de consulta tendem a crescer com o uso.

**Instrumentos para fechar as lacunas:**
- Server-Timing ou spans do Sentry por consulta no servidor (exige mudança de código, fora do escopo);
- Vercel Speed Insights / Observability com duração por rota;
- execução repetida em horários de uso real do piloto;
- um usuário operador para o Caixa, num ambiente de homologação onde escrita seja permitida.

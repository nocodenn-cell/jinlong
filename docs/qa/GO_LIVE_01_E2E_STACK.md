# JL-GO-LIVE-01 — Stack E2E isolada e execução dos specs de Golden Flow

Data: 2026-11-05. Veredito: **NO-GO mantido**. A stack isolada funciona (login real e RPC autenticada), mas os specs de interface ainda não passam de forma estável.

## 1. Arquitetura da stack E2E isolada

Pasta: `pdv-importados/e2e/stack/`. Projeto Compose `fastproduct-e2e`, containers `fp_e2e_*`, rede `fp_e2e_net`, volume `fp_e2e_db_data`. Nenhum recurso compartilhado é usado.

| Serviço | Imagem (já presente localmente) | Porta no host | Banco |
|---|---|---|---|
| `fp_e2e_db` | `supabase/postgres:17.6.1.165` | 127.0.0.1:54481 | `sec_gf01` (próprio) |
| `fp_e2e_rest` | `supabase/postgrest:v16.1` | interna | `sec_gf01` |
| `fp_e2e_auth` | `supabase/gotrue:v2.196.0` | interna | `sec_gf01` |
| `fp_e2e_kong` | `supabase/kong:2.8.1` (config `kong.yml`) | 127.0.0.1:54480 | — |

- Banco: `sec_gf01` restaurado de um `pg_dump -Fc` **somente leitura** de `sec_gf01` no container compartilhado. O arquivo do snapshot fica fora do repositório.
- Restauração conferida: contagens iguais ao original (14 lojas, 10 usuários, 33 produtos, 24 vendas, 9 caixas, 56 formas, 530 grants a `authenticated`).
- Segredos: `gen-env.mjs` cria `.env.e2e` (JWT secret, chaves anon/service, senha do banco) e `provision.mjs` cria `.secrets.json` (e-mail e senha do usuário de teste, gerada). Ambos estão no `.gitignore`. Nenhum valor é impresso.
- Usuário de teste: `operador.e2e@fastproduct.test`, criado no GoTrue da stack E2E com senha gerada de 24 bytes.
- Seed determinístico (`seed-golden-flow.sql`, IDs `ee00000x-…`): empresa "E2E Empresa Ficticia", loja "E2E Loja Ficticia", operador, produtos `7898512340003` (R$ 10,00, UN) e `7898512340010` (R$ 40,00, KG), estoque 500 e 100, formas DINHEIRO/PIX/CARTAO_CREDITO/CARTAO_DEBITO, `pdv_config` da empresa. Sem caixa aberto: a abertura é exercida pela tela.
- A cada provisionamento o banco E2E é recriado do snapshot e o seed é reaplicado.

### Confirmação de isolamento
- Os containers `supabase_db_fastproduct`, `supabase_rest_fastproduct`, `supabase_auth_fastproduct`, `supabase_kong_fastproduct`, `supabase_realtime_fastproduct` e `supabase_storage_fastproduct` continuam com o mesmo uptime (16 horas): não foram reconfigurados nem recriados.
- O único acesso ao banco compartilhado foi o `pg_dump` de leitura.
- Nenhum comando destrutivo foi executado no banco `postgres` compartilhado. Os comandos `DROP DATABASE` e `CREATE DATABASE` foram aplicados apenas ao `sec_gf01` dentro de `fp_e2e_db`.
- Os dados da stack compartilhada não foram lidos pelo app E2E: a URL do app aponta para `localhost:54480`.

## 2. Dependências

- O PDV é workspace do monorepo; o lockfile fica na raiz (`package-lock.json`). Verificado: `next 15.5.15` e `@playwright/test 1.61.1` instalados, iguais ao lockfile. `npm ci` não foi executado para não reinstalar o monorepo inteiro. Chromium do Playwright já estava em cache.
- Nenhum pacote foi adicionado, atualizado ou removido. Nenhum lockfile foi alterado.

## 3. Problemas encontrados e correções (infra, não produto)

1. GoTrue não conectava: senhas das roles internas da imagem não batiam com `E2E_DB_PASSWORD`. Corrigido com `ALTER ROLE … PASSWORD` via `supabase_admin` (`postgres` não é superusuário nessa imagem).
2. GoTrue falhava ao criar `schema_migrations`: o schema `auth` restaurado pertencia a `postgres`. Corrigido transferindo o dono do schema e das tabelas para `supabase_auth_admin` (só no banco E2E).
3. Kong não subia: variável `KONG_NGINX_PROXY_PROXY_BUFFER_SIZE` inválida. Removida.
4. Kong respondia 502 após recriar o PostgREST (IP antigo em cache). O provisionamento agora reinicia o Kong após subir rest/auth.
5. `pg_restore` com erros em `vault` e `realtime`: componentes ausentes na imagem reduzida, sem impacto nas tabelas do PDV.
6. Seed: `pdv_config.gerente_id` é NOT NULL e o `id` precisava ser calculado corretamente. Corrigido.
7. Login de tela: a primeira tentativa de navegação falhou porque o `next dev` compila `/caixa` sob demanda (≈36 s de render). Mitigado com aquecimento de rotas e, depois, com build de produção (`next build` + `next start`, caminho previsto em `playwright.config.ts`).
8. Erro transitório `PGRST303 JWT issued at future` em um login (401) que recuperou na tentativa seguinte. Não reproduzido de forma consistente; permanece como observação.

## 4. Resultado dos specs

Specs executados: `e2e/caixa-golden-flow-cycle5.spec.ts` (2 testes) e `e2e/caixa-venda-multi-pagamento.spec.ts` (4 testes). Modo `chromium`, `--trace=on`, modo serial conforme cada spec.

| Rodada | Modo | Passou | Falhou | Não rodou |
|---|---|---|---|---|
| 1 | dev | 0 | 2 (login não navegou; `/caixa` ainda compilando) | 4 |
| 2 | dev | 4 | 1 (golden: `loading` preso) | 1 |
| 3 (só multi) | dev | 4 | 0 | 0 |
| final (limpa) | dev | 0 | 2 (`loading` preso, 40 s) | 4 |
| final2 (limpa) | dev | 4 | 1 (golden) | 1 |
| prod1 (limpa, `next build`) | prod | 1 | 2 | 3 |

Observações sobre os resultados:
- Os testes passam às vezes e falham às vezes com o mesmo código. Isso indica sensibilidade à latência e a estado acumulado, não uma regra fixa.
- **Falha observada na rodada de produção (golden):** a asserção `getByRole('status')` com `Caixa aberto` não encontra o texto. Na região `role=status` do painel só existe um placeholder de carregamento. O app não exibe "Caixa aberto" nessa região (a única ocorrência de "Caixa aberto" em `app/caixa` é em texto de atalhos). Esse é um desalinhamento entre o spec e a UI atual, a ser corrigido no spec ou no componente depois de decisão de produto.
- **Efeito no banco (rodada de produção, golden):** abertura de caixa `POST /rest/v1/caixas` 201, status `ABERTO` (RPC 232 bytes), venda finalizada `finalizar_venda_transacional_canonica_v4` 200 e `pdv_registrar_alertas_margem_venda` 204. A venda foi persistida, mas a asserção de tela falhou depois.
- **Alerta observado:** em algumas capturas de falha aparece "Não foi possível concluir. Tente novamente." após o clique em "Abrir caixa". Não identificado de forma conclusiva; o `INSERT` do caixa retornou 201 nas rodadas em que isso apareceu. Fica como pendência de investigação.
- Os specs rodaram de fato contra a stack isolada: os logs do gateway registram as chamadas do navegador e do servidor Next a `localhost:54480`.

## 5. Efeitos persistidos conferidos

- Golden flow SQL (`backend/scripts/go-live-01-golden-flow.test.sql`): 34 asserções OK, já registradas em `docs/qa/GO_LIVE_01_GOLDEN_FLOW.md`.
- E2E (rodada de produção, golden): abertura, venda e status confirmados por gateway e por consulta ao banco.
- Pagamento dividido e demais testes do multi-pagamento: passaram nas rodadas 2, 3, final2 (dev) e no primeiro teste da rodada de produção.

## 6. Pendências (bloqueios reais)

1. **Asserção de abertura de caixa do spec golden** (`role=status` + "Caixa aberto") não corresponde à UI atual. Decidir: ajustar o spec para o indicador real do turno, ou ajustar o componente para expor o estado em `role=status`. É decisão de produto/UI, não foi alterada aqui.
2. **Estabilidade do aquecimento/latência**: o build de produção reduziu o tempo de login (14 s contra 52–69 s) mas não eliminou a falha do golden.
3. **Investigar o alerta "Não foi possível concluir"** após "Abrir caixa", com o log do servidor da rodada (`prod1-server/next-dev.log`).
4. **Concorrência de duas sessões** e **comprovante/crédito de cliente** continuam não testados.
5. **Migration `20261104180000` no homolog**: sem autorização; não aplicada.

Veredito: **GO-LIVE-01 segue NO-GO** até o golden flow passar de ponta a ponta na tela de forma estável.

## 7. Como reproduzir

```bash
cd pdv-importados
node e2e/stack/gen-env.mjs                       # uma vez (gera .env.e2e)
E2E_SNAPSHOT_DIR="<pasta fora do repo>" node e2e/stack/provision.mjs
node e2e/stack/run-specs.mjs --prod --evidence "<pasta de evidências fora do repo>"
```

## 8. Investigação do P0: alerta "Não foi possível concluir. Tente novamente." (2026-11-05)

### Origem
- Texto vem de `MSG_PADRAO` em `app/caixa/server/caixaErroOperador.ts`. É o fallback de `caixaErroOperador` quando o detalhe técnico chega vazio ou não casa nenhuma regra.
- Caminhos que chamam esse mapeamento: `abrirCaixaOperadorImpl` (abertura), `obterStatusCaixaOperadorImpl` (status, via `reader.getStatus`, que repassa `error.message` do RPC) e outras actions do caixa.
- Nenhum `caixa.abrir.excecao` foi registrado no log do servidor nas rodadas em que o alerta apareceu.

### Correlação observada (rodadas de produção e diagnóstico)
- Clique em "Abrir caixa" → `POST /rest/v1/caixas` 201 (uma única vez) → RPC `obter_status_caixa_operador` 200 com `ABERTO` → venda `finalizar_venda_transacional_canonica_v4` 200.
- Na rodada prod1, o alerta aparece na tela enquanto o banco já está em `ABERTO` e a venda foi registrada. Em execuções posteriores (3 diagnósticos de golden com reset do banco) o alerta não apareceu.

### Risco de duplicidade (P0 verificado)
- Abertura: índice único parcial `uq_caixas_operador_aberto` (`operador_id` onde `status = ABERTO`) impede dois caixas abertos para o mesmo operador. Um segundo clique gera erro de unicidade, que o app mapeia como "caixa já aberto".
- Venda: a finalização é idempotente pelo id da venda (replay coberto no golden flow SQL, bloco 7b). Nenhuma venda duplicada foi observada em nenhuma rodada (uma venda persistida por execução).
- Conclusão parcial: não há evidência de duplicidade. O alerta, porém, pode induzir nova tentativa do operador. Por isso permanece como P0 aberto.

### Causa-raiz: NÃO CONFIRMADA
- Hipótese principal: um RPC ou uma action retorna erro sem detalhe mapeado (ou com mensagem não reconhecida), e o fallback genérico é exibido enquanto o banco já reflete a operação.
- Não reproduzido de forma determinística. Para fechar a causa, o próximo passo é registrar no servidor o detalhe bruto de todo fallback (`caixaErroOperador` recebendo texto vazio ou não mapeado), em `logJson`, e repetir até capturar o alerta.

### Problema de UI confirmado (não é o alerta, mas causa confusão)
- Em todas as execuções aparece, por alguns segundos, `Caixa fechado — abra o caixa para vender` com botão "Abrir caixa" enquanto o status ainda está `Carregando...`. Isso mostra estado fechado antes da confirmação do servidor. Correção proposta (sem texto artificial): exibir estado neutro de carregamento até o status chegar.
- Mensagem "Venda registrada" aparece duplicada no DOM em momentos transitórios (não duplica a venda no banco).

### Estado dos specs
- O spec `caixa-golden-flow-cycle5` falhou na rodada de produção por `getByRole('status')` não encontrar o texto esperado. Nas repetições de diagnóstico, o texto "Caixa aberto (<id>)." aparece no mesmo `role=status`. A falha é de sincronismo (asserção executada enquanto a região está em carregamento) e não de texto.

### Matriz desta etapa
| Item | Resultado |
|---|---|
| Alerta "Não foi possível concluir" | NÃO RESOLVIDO: origem localizada, causa não confirmada |
| Duplicidade após retry (abertura) | PASSOU (índice único) |
| Duplicidade após retry (venda) | PASSOU (idempotência por id; sem duplicata observada) |
| Golden 1 (abrir, venda, status) em diagnóstico | PASSOU em 4 de 4 execuções desta sessão (com reset) |
| Golden 1 em `prod1` (spec real) | FALHOU (alerta + asserção de status) |
| Multi-pagamento (4 testes) | PASSOU em rodadas anteriores, com falhas intermitentes |
| Indicação "Caixa aberto" | Presente no `role=status` após o status carregar |

### GO/NO-GO
**NO-GO.** O alerta permanece inexplicado. Não declarar o golden flow aprovado.

### Próximos passos
1. Logar o detalhe bruto de todo fallback de `caixaErroOperador` no servidor e capturar o alerta.
2. Substituir o estado "Caixa fechado" enquanto o status carrega por um estado neutro de carregamento.
3. Ajustar o spec para aguardar o status estabilizar (sem sleeps fixos).
4. Repetir três execuções completas em modo produção, cada uma com reset do banco.

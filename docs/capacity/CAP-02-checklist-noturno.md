# CAP-02 — Checklist da execução noturna (soak 12 h)

Status: **NÃO AUTORIZADO**. Este checklist só prepara a execução; nada aqui deve ser iniciado sem autorização explícita.
Alvo exclusivo: `fastproduct-capacity` local (API `127.0.0.1:54421`, DB `127.0.0.1:54422`). Sem produção, staging remoto ou AgeGuard.

## 0. Decisões a confirmar antes

- [ ] Ritmo: T04 (5×2, 600/h) ou T05 (10×2, 1200/h). Recomendado: T04.
- [ ] Pacing: manter rajada sincronizada (pior caso) ou adicionar jitter (chegada realista).
- [ ] Fechamento de caixa ao final para exercitar a consolidação financeira (`fechar_caixa_pdv_atomico`): sim ou não.
- [ ] O VM do Cloud Agent permanece ativo por 12 h+ (risco de suspensão do host). Se não houver garantia, rodar em máquina dedicada.

## 1. Renovação do JWT

- [ ] `jwt_expiry = 3600` em `config.capacity.toml`. Hoje o harness faz login só no `setup`, então tudo falharia após cerca de 1 h.
- [ ] Login por VU na 1ª iteração, com `access_token`, `refresh_token` e `expires_at` em variável local do VU (não em `setup`, que é imutável).
- [ ] Renovar via `POST /auth/v1/token?grant_type=refresh_token` quando faltarem menos de 5 min para expirar.
- [ ] `enable_refresh_token_rotation = true`: guardar sempre o refresh token novo. Nunca compartilhar sessão entre VUs.
- [ ] Falha no refresh: novo login com senha, contado em métrica própria (`auth_refresh_fail`). Mais de 3 falhas consecutivas no mesmo VU interrompem o teste.
- [ ] Validação prévia: rodada curta com `jwt_expiry` reduzido **apenas numa cópia local do config** (ex.: 300 s) por 15 min, para provar a renovação.

## 2. Estoque sintético suficiente

- [ ] Consumo por produto/loja = 2 caixas × taxa por caixa × 12 h. T04/T05: 120/h × 12 h = **1440 un.**, mais margem de 2×, logo **≥ 3000 un.**
- [ ] Hoje: lojas CAP 940–970 un. (insuficiente), MATRIZ 9817 (ok).
- [ ] Reabastecer só via RPC canônica `ajustar_estoque_manual` (gera kardex), no DB local, antes do baseline.
- [ ] Gate pré-teste: nenhum produto da fixture com menos de 3000 un.
- [ ] Gate durante o teste: estoque abaixo de 200 un. dispara parada graciosa.

## 3. Monitoramento de 12 h

- [ ] `sample-capacity-resources.sh SCEN PID 60 45000`: intervalo de 60 s e teto de 12,5 h (hoje o teto padrão é 1500 s).
- [ ] Métricas k6: trocar `--out json` (cerca de 290 MB em 12 h a 1200/h) por saída agregada ou JSON comprimido. Disco disponível: 235 GB.
- [ ] Checkpoints horários: `summarize` e `reconcile` em janela de 1 h (`CAP02_SINCE`/`CAP02_UNTIL`), registrando p95/p99, erros, timeouts e vendas/min por hora.
- [ ] Degradação progressiva: alertar se o p95 da hora N ficar mais de 2× o da 1ª hora, ou se vendas/min caírem mais de 5%.
- [ ] PG por hora: tamanho de `vendas`, `itens_venda`, `movimentos_estoque_log`; `n_dead_tup` e último autovacuum; top statements (`pg_stat_statements`).
- [ ] Containers: CPU/RAM de `db`, `rest`, `kong`, `auth`, `realtime`; reinícios (`docker ps` com status).

## 4. Parada automática por falta de memória

- [ ] Gate **contínuo** no monitor (hoje o runner só verifica ao final): `MemAvailable` abaixo de 800 MB em 2 amostras seguidas envia `SIGINT` ao k6 (parada graciosa) e registra o motivo.
- [ ] Gates adicionais com a mesma ação: disco livre abaixo de 10 GB, container `db` não saudável, erro acima de 2% em 5 min, timeouts acima de 0 em 5 min.
- [ ] Observação: a memória disponível do host oscilou entre 2,4 e 6,3 GiB durante o CAP-02 (cerca de 11 GiB não atribuíveis a processos). Registrar o valor inicial.

## 5. Encerramento seguro dos processos

- [ ] O runner grava os PIDs (`runner`, `k6`, `monitor`) em `.capacity-workdir/cap02-soak.pids`.
- [ ] `trap` em EXIT/INT/TERM: `SIGINT` no k6 (gracioso), depois de 30 s `SIGTERM`, depois kill do monitor.
- [ ] Watchdog do monitor: se o runner morrer (inclusive por `SIGKILL`), envia `SIGINT` ao k6 pelo PID file. Isso fecha a limitação atual de k6 órfão.
- [ ] Script de parada manual: lê o PID file e encerra por PID (nunca por nome).
- [ ] Pós-parada: `pgrep -x k6` vazio e monitor encerrado, com isso registrado em `cap02-soak-shutdown.txt`.
- [ ] Nunca usar `supabase stop --no-backup`, `down -v` ou prune. Desligar containers só com `supabase stop --workdir .capacity-workdir`, que preserva os volumes.

## 6. Reconciliação financeira

- [ ] Baseline no início (estoque, `caixas.saldo_atual`, contagem de `movimentos_financeiros`).
- [ ] Por hora e no final: vendas persistidas = confirmadas no k6; 0 vendas sem itens; 0 itens duplicados.
- [ ] `vendas.total_liquido` = soma de `vendas_pagamentos.valor` por venda.
- [ ] `caixas.saldo_atual` = `valor_inicial` + DINHEIRO das vendas, de forma absoluta e contra o baseline.
- [ ] Kardex: cada item vendido tem `SAIDA_VENDA` com delta igual a −quantidade; estoque final = baseline − vendido; 0 negativos.
- [ ] Isolamento: 0 vendas com operador, caixa ou produto de outra loja; amostra RLS via API (operador não lê outra loja).
- [ ] Se aprovado em §0: fechar os caixas ao final via `fechar_caixa_pdv_atomico` e reconciliar `movimentos_financeiros` e as formas (`listar_caixas_fechamento_formas`) contra as vendas do turno. Hoje a venda não lança em `movimentos_financeiros` (delta 0 no CAP-02); a consolidação no fechamento **ainda não foi testada**.
- [ ] Relatório final: tabela por hora, totais por loja e caixa, divergências (esperado 0) e decisão PASS/FAIL.

## 7. Pré-voo (no dia)

- [ ] Stack `fastproduct-capacity` saudável (9 containers); regra iptables ICC só em runtime (não persistir).
- [ ] `NEXT_PUBLIC_*` injetados ignorados; URL e DB validados como `127.0.0.1`.
- [ ] Fixtures 10×2 com sessões distintas; nenhum caixa fechado entre cenários.
- [ ] Rodada de fumaça de 15 min com o harness novo antes das 12 h.
- [ ] Autorização explícita registrada.

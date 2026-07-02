# ADR — Centro de gravidade do PDV

| Campo | Valor |
|--------|--------|
| **ID** | ADR-PDV-001 |
| **Título** | Centro de gravidade, autoridade no bip e tolerância a falhas |
| **Status** | **Aceito** — decisões ratificadas pelo dono do produto em 2026-07-02 (sessão de execução do roadmap R0–R8) |
| **Data** | 2026-05-12 (proposta) · 2026-07-02 (aceitação) |
| **Contexto** | Monorepo com `pdv-importados` (web) e `pdv-local` (desktop); backend fiscal/RLS maduro; fluxo perceptivo do bip no web ainda acoplado a roundtrip. |

---

## Contexto

O repositório contém **dois runtimes** com filosofias diferentes:

- **Web**: operação online-first, catálogo e finalização via Supabase / Server Actions.
- **Desktop**: SQLite, cache de catálogo, outbox e sync assíncrono.

Sem decisão explícita, invariantes operacionais (bip, fila, preço, offline) ficam **implícitas** e geram retrabalho entre sprints.

Documentos relacionados:

- [GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md](../GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md)
- [CONTRATO_PIPELINE_BIP.md](../CONTRATO_PIPELINE_BIP.md)
- [ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md](../ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md)

---

## Decisões (ratificadas em 2026-07-02)

### 1. PDV canónico

**Proposta alinhada ao guia de implantação:**

| Cenário | PDV canónico (caixa físico) | Observação |
|---------|----------------------------|------------|
| Loja pequena, rede estável | Web **ou** híbrido | Web aceitável como caixa principal se volume baixo |
| Loja média / rede oscila | **Híbrido** | Gestão no web; caixa principal recomendado no desktop |
| Alto giro / operação crítica | **Desktop-first** (`pdv-local`) | Web como gestão / contingência, não como único terminal crítico |

**Regra formal híbrida (mensagem única):**  
*“Gerir no navegador; vender com continuidade no desktop quando o caixa for crítico ou a rede for instável.”*

**Sign-off:** [x] Produto (2026-07-02)

**Decisão final:** **Web-first.** O caixa web (`pdv-importados`) é o **PDV canónico** para todos os cenários do piloto. O `pdv-local` (desktop) fica **congelado**: código e CI preservados, **fora do caminho comercial e de piloto**, sem obrigação de paridade de contrato enquanto congelado. A tabela híbrida acima fica **suspensa** até reavaliação pós-piloto (fase R7 do roadmap). Evidência que fundamenta a decisão: todo o investimento operacional (pipeline de bip, gate financeiro, telemetria, painel) foi feito no web; o desktop está sem evolução funcional desde 2026-03.

---

### 2. O que pode falhar **sem impedir venda** (por runtime)

Esta tabela define **expectativa operacional**, não só técnica. Células devem ser preenchidas na aceitação do ADR.

| Componente / falha | Web (`pdv-importados`) | Desktop (`pdv-local`) |
|----------------------|-------------------------|------------------------|
| Internet indisponível | **Proposta:** venda **não** garantida como principal (depende de rede para SKU/preço atuais) | **Proposta:** continuidade com catálogo/outbox conforme [pdv-local/README.md](../../pdv-local/README.md) |
| Fiscal (worker / Focus) | **Proposta:** venda pode concluir; documento fiscal **assíncrono** / retentativa (já enfileirado no modelo atual) | Idem após sync, conforme flags Edge |
| Auth refresh lento | **Proposta:** risco ao bip — documentar UX (não bloquear fila sem política) | Depende de fluxo de operador (evoluir no desktop) |
| Sync / outbox | N/A como fila local de venda | **Proposta:** venda local persiste; sync pode atrasar |
| Pricing RPC | **Proposta (pendente Fase preço):** ver secção 4 | Cache local + regras no desktop |
| Impressão | **Proposta:** não definido como bloqueante no web neste ADR — preencher | Pre preencher por produto |

**Sign-off:** [x] Produto (2026-07-02)

**Decisão:** as células "Proposta" da coluna **Web** acima ficam **ratificadas como comportamento oficial** (internet indisponível ⇒ venda não garantida; fiscal assíncrono não bloqueia venda; sync/outbox N/A no web). A coluna **Desktop** fica suspensa enquanto o `pdv-local` estiver congelado (ver §1). Detalhe linha a linha com evidência de código: [MATRIZ_OFFLINE_PDV.md](../MATRIZ_OFFLINE_PDV.md).

---

### 3. Autoridade no milissegundo do bip

**Semântica oficial do “scan aceito” (ACK perceptivo)** — escolher **uma** como primária para UX e métricas:

| Código | Significado |
|--------|-------------|
| **A** | Código **entrou na fila** operacional (não implica SKU nem preço) |
| **B** | **SKU resolvido** a partir de **cache local** / índice |
| **C** | **Preço provisório** aplicado à linha; reconciliação posterior |
| **D** | **Preço autoritativo** confirmado antes do ACK (bloqueante) |

**Proposta para o web (até existir cache local no browser):** primário **A** + evolução para **C** ou **D** conforme política de preço (secção 4).  
**Proposta para o desktop:** alinhar a **B/C** quando catálogo local estiver atualizado, com reconciliação definida.

**ACK perceptivo ≠ commit fiscal / documento emitido.**

**Sign-off:** [x] Produto (2026-07-02)

**Decisão final:** **A + D.** O feedback imediato ao operador significa **A** (código entrou na fila serial — pipeline `shared-core/src/pdv/scan-pipeline-runtime.ts`); a **linha só é exibida com preço autoritativo** confirmado (**D**), conforme §4. Texto único: *"O bip confirma que a leitura entrou na fila; a linha aparece quando o servidor confirma o preço."* `pending_resolution` permanece **vocabulário reservado** (sem comportamento), conforme `docs/SCAN_PIPELINE_STATE_MACHINE.md §1.1`.

---

### 4. Política de preço no caminho do bip

| Modelo | Descrição | Prós | Contras |
|--------|-----------|------|---------|
| **A** | Preço remoto **autoritativo** bloqueia conclusão perceptiva do item | Consistência | Latência; risco de double-scan |
| **B** | Preço **provisório** local + reconciliação | Fluidez | Conflito explícito; regras de correção |
| **C** | **Híbrido:** base de varejo imediata; promoções/regras **confirmadas** depois | Balanceado | Complexidade de implementação |

**Proposta inicial (web):** evoluir para **C** ou manter **A** explicitamente até haver cache — **não deixar implícito.**

**Sign-off:** [x] Produto (2026-07-02)

**Decisão final:** **A (explícito).** Preço remoto autoritativo antes da conclusão perceptiva da linha, com fila serial + feedback visual (comportamento já implementado e testado: `caixaPrecoAutoritativoServer.ts` + pipeline serial). O risco de latência/double-scan do modelo A é mitigado pela fila (dupla leitura não corrompe estado) e monitorado pela telemetria (`buscando_duration`, R4). Evolução para **C** só com cache de catálogo no browser + regras de conflito — reavaliar em R8; até lá, **não** implementar preço provisório.

---

### 5. Política de conflito e resiliência

| Domínio | Pergunta | Decisão (2026-07-02) |
|---------|----------|----------------------|
| Preço divergente | Local ≠ servidor após reconciliação? | **N/A no modelo A**: não há preço local nem reconciliação — a linha só entra com preço do servidor. Se a RPC falhar, a linha **não entra** e o operador vê erro (estado `failed` do pipeline). Revisitar apenas se §4 evoluir para C. |
| Estoque divergente | Baixa já feita vs disponível real? | Autoridade é o **anti-oversell na finalização** (RPC `finalizar_venda_transacional_canonica_v4`) — comportamento atual ratificado; o bip **não** valida estoque. |
| Replay | Reenvio de mesma leitura? | Pipeline serial + idempotência de **venda** (advisory lock + ON CONFLICT) ratificados. Dedupe temporal de **leitura**: **não implementar agora** — decidir com dados da telemetria (R4), conforme [RECONNECT_REPLAY_POLICY.md](../RECONNECT_REPLAY_POLICY.md). |
| Retry humano | Double Enter / double scan? | Fila serial garante que leitura dupla não corrompe estado; item duplicado é **agregação legítima de quantidade** (comportamento do `unifiedCartStore`). Sem dedupe por janela de tempo até evidência da telemetria. |
| Reconnect | Supabase oscilante? | Semântica fixada em [RECONNECT_REPLAY_POLICY.md](../RECONNECT_REPLAY_POLICY.md): **sem retry implícito**; falha classificada e visível, fila não trava. |

---

### 6. Política offline (mensagem oficial)

| Runtime | Política |
|---------|----------|
| Web | **Decidido:** **degradado** — o caixa web é online-first; **não comercializar** “offline” no web. Detalhe por capacidade: [MATRIZ_OFFLINE_PDV.md](../MATRIZ_OFFLINE_PDV.md). |
| Desktop | **Decidido:** **congelado** (§1) — a capacidade offline existe no código, mas **não é oferecida comercialmente** enquanto o `pdv-local` estiver fora do caminho de piloto. |

**Sign-off:** [x] Produto (2026-07-02)

---

## Consequências

- **Positivas:** prioridades de implementação (fila bip, telemetria, preço) deixam de contradizer o posicionamento do produto.
- **Negativas:** exige manter **matriz offline** e contratos atualizados quando novas capacidades entrarem.

## Anexo — dependências do desktop congelado e enforcement (2026-07-02)

Análise de acoplamento fechada por evidência, com o tratamento de cada ponto:

| Acoplamento | Evidência | Tratamento sob o freeze |
|---|---|---|
| `pdv-local` → `shared-core` (7 módulos via `@core`: `caixa/mapRegrasPreco`, `caixa/variantesChaveLeitura`, `cart/types`, `catalog/isProdutoVendavel`, `managerDiscount/policy`, `pricing/types`, `stores/unifiedCartStore`) | imports em `pdv-local/src` | Consumidor congelado: evolução de `shared-core` **não tem obrigação** de manter o desktop compilando; o CI do desktop só roda quando `pdv-local/**` mudar |
| `pdv-local` → Edge `sync-outbox` (runtime: outbox + `?op=catalogo` / `?op=pdv_config`) | `backend/supabase/functions/sync-outbox` | Endpoint **permanece** (lado servidor do contrato); protegido por `e2e/sync-fluxo-gerente.spec.ts`. Simplificação só na fase R7 se a decisão virar "aposentar" |
| Código ativo → `pdv-local` (reverso) | zero imports; havia 1 comentário de "paridade" em `pdv-importados/core/caixa/variantesChaveLeitura.ts` (corrigido) | **Proibido** — enforced por `scripts/desktop-freeze-guard.mjs` (`guard:freeze`, no `guard:all`) |
| Pipeline raiz (workspace, `dev:desktop`/`dev:tauri`, `npm run test`/`build:all`) | `package.json`, `turbo.json` | Permanecem (dev local e testes do congelado continuam permitidos); CI isolado por paths |

**Enforcement em três camadas:**

1. `scripts/desktop-freeze-guard.mjs` — falha o `guard:all` se surgir import reverso de `pdv-local` em pacote ativo, ou se o marcador `Status: CONGELADO` sumir do `pdv-local/README.md` sem passar pela fase R7.
2. `.github/workflows/desktop-freeze.yml` — bloqueia PR com mudança funcional em `pdv-local/src(-tauri)/**` (testes/README/deps de manutenção isentos); exceção consciente via label `unfreeze-pdv-local`.
3. `.github/workflows/ci-pdv-local.yml` — dispara **apenas** com mudanças no próprio módulo; o módulo congelado deixa de ser gate de PRs que tocam dependências compartilhadas da raiz.

---

## Próximos passos após aceitação

1. ~~Implementar pipeline serial em `shared-core` + adapter no web~~ — **feito** antes da aceitação (`shared-core/src/pdv/` + `app/caixa/scan-pipeline/`).
2. ~~Instrumentação humana (coleta)~~ — **feito** (sink + `/api/caixa/scan-telemetry`); **agregação/leitura** pendente → fase **R4** do [roadmap](../ROADMAP.md).
3. Refletir "desktop congelado" no [GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md](../GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md) e em `pdv-local/README.md` (nota de status — parte da fase R0).

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-05-12 | Rascunho inicial (PR1 — ADR + interfaces pipeline). |
| 2026-05-12 | PR 2A — `createScanPipelineController` + testes Vitest em `shared-core`. |
| 2026-07-02 | **Aceitação** (roadmap R0): web-first com desktop congelado (§1, §6); ACK **A+D** (§3); preço modelo **A** explícito (§4); políticas de conflito preenchidas (§5). |

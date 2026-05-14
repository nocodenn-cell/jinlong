# ADR — Centro de gravidade do PDV

| Campo | Valor |
|--------|--------|
| **ID** | ADR-PDV-001 |
| **Título** | Centro de gravidade, autoridade no bip e tolerância a falhas |
| **Status** | Proposto — aguardando sign-off explícito de produto + eng lead |
| **Data** | 2026-05-12 |
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

## Decisões (propostas — preencher na aceitação)

### 1. PDV canónico

**Proposta alinhada ao guia de implantação:**

| Cenário | PDV canónico (caixa físico) | Observação |
|---------|----------------------------|------------|
| Loja pequena, rede estável | Web **ou** híbrido | Web aceitável como caixa principal se volume baixo |
| Loja média / rede oscila | **Híbrido** | Gestão no web; caixa principal recomendado no desktop |
| Alto giro / operação crítica | **Desktop-first** (`pdv-local`) | Web como gestão / contingência, não como único terminal crítico |

**Regra formal híbrida (mensagem única):**  
*“Gerir no navegador; vender com continuidade no desktop quando o caixa for crítico ou a rede for instável.”*

**Sign-off:** [ ] Produto  [ ] Eng

**Decisão final (após sign-off):** _[web | desktop | híbrido conforme tabela + exceções escritas]_

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

**Sign-off:** [ ] Produto  [ ] Suporte

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

**Sign-off:** [ ] Produto  [ ] Fiscal (se aplicável)

**Decisão final:** _[ A | B | C | D ]_ com texto único: _

---

### 4. Política de preço no caminho do bip

| Modelo | Descrição | Prós | Contras |
|--------|-----------|------|---------|
| **A** | Preço remoto **autoritativo** bloqueia conclusão perceptiva do item | Consistência | Latência; risco de double-scan |
| **B** | Preço **provisório** local + reconciliação | Fluidez | Conflito explícito; regras de correção |
| **C** | **Híbrido:** base de varejo imediata; promoções/regras **confirmadas** depois | Balanceado | Complexidade de implementação |

**Proposta inicial (web):** evoluir para **C** ou manter **A** explicitamente até haver cache — **não deixar implícito.**

**Sign-off:** [ ] Produto  [ ] Eng

**Decisão final:** _[ A | B | C ]_ + notas: _

---

### 5. Política de conflito e resiliência

| Domínio | Pergunta | Proposta (preencher na aceitação) |
|---------|----------|-----------------------------------|
| Preço divergente | Local ≠ servidor após reconciliação? | Alertar operador / bloquear linha / corrigir automaticamente até teto — _definir_ |
| Estoque divergente | Baixa já feita vs disponível real? | Já parcialmente no RPC de finalização — alinhar com UX de bip |
| Replay | Reenvio de mesma leitura? | Pipeline serial + idempotência de **venda** já existe; **leitura** — definir dedupe temporal |
| Retry humano | Double Enter / double scan? | Fila + ACK explícito reduzem; política de dedupe **X ms** |
| Reconnect | Supabase oscilante? | Não travar fila sem política; classificar erro recuperável |

---

### 6. Política offline (mensagem oficial)

| Runtime | Política |
|---------|----------|
| Web | **Proposta:** **degradado** — não comercializar “offline completo” no caixa web sem matriz [MATRIZ_OFFLINE futura](../ROADMAP_PDV_INVARIANTES_OPERACIONAIS.md). |
| Desktop | **Proposta:** **permitido** com limites documentados (sync, fiscal, DLQ). |

**Sign-off:** [ ] Produto  [ ] Comercial

---

## Consequências

- **Positivas:** prioridades de implementação (fila bip, telemetria, preço) deixam de contradizer o posicionamento do produto.
- **Negativas:** exige manter **matriz offline** e contratos atualizados quando novas capacidades entrarem.

---

## Próximos passos após aceitação

1. Implementar pipeline serial em `shared-core` + adapter no web conforme [CONTRATO_PIPELINE_BIP.md](../CONTRATO_PIPELINE_BIP.md).
2. Instrumentação humana (p50/p95) alinhada à semântica de ACK escolhida.
3. Atualizar [GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md](../GUIA_IMPLANTACAO_WEB_VS_DESKTOP.md) apenas se a decisão final divergir do texto atual.

---

## Histórico

| Data | Alteração |
|------|-----------|
| 2026-05-12 | Rascunho inicial (PR1 — ADR + interfaces pipeline). |
| 2026-05-12 | PR 2A — `createScanPipelineController` + testes Vitest em `shared-core`. |

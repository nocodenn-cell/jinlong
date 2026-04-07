# Plano Executável 7 Dias — Fechamento de Segurança

Objetivo: fechar pendências críticas de segurança do FastProduct em 7 dias corridos, com rastreabilidade por módulo e aceite objetivo.

Referências:
- [SECURANCA_CHECKLIST_FECHAMENTO.md](./SECURANCA_CHECKLIST_FECHAMENTO.md)
- [P0_CHECKLIST_OPERACIONAL.md](./P0_CHECKLIST_OPERACIONAL.md)

## Owners por módulo

- **Backend (Supabase / Edge / SQL):** owner `backend`
- **Web (`pdv-importados`):** owner `pdv-importados`
- **Desktop (`pdv-local`):** owner `pdv-local`
- **Coordenação de release:** owner `tech-lead`

---

## Dia 1 — Kickoff técnico e baseline

- **Tarefa:** congelar baseline de segurança por ambiente (`dev/staging/prod`).
  - **Owner:** `backend`
  - **Aceite:** relatório com `migration list`, funções deployadas e status de secrets.
- **Tarefa:** definir matriz de risco (P0/P1/P2) e ordem de execução.
  - **Owner:** `tech-lead`
  - **Aceite:** documento aprovado com sequência dos 6 blocos abaixo.

---

## Dia 2 — Senha de gerente (KDF forte)

- **Tarefa:** migrar hash de gerente de `SHA-256` para `ARGON2ID` ou `BCRYPT`.
  - **Owner:** `backend`
  - **Entregas:** migration + atualização da `validar-gerente` + compatibilidade temporária.
  - **Aceite objetivo:**
    - nova coluna/hash KDF criada;
    - login gerente válido com hash novo;
    - fallback legado removível e documentado.
- **Tarefa:** remover dependência explícita de SHA-256 nos fluxos ativos.
  - **Owner:** `pdv-importados`
  - **Aceite:** nenhum fluxo crítico depende de hash SHA no cliente web.

---

## Dia 3 — Saneamento de seed fraca e rotação

- **Tarefa:** remover seed fraca histórica de `pdv_config` nas migrations/scripts.
  - **Owner:** `backend`
  - **Aceite:** não existe senha padrão versionada para gerente.
- **Tarefa:** rotacionar senha de gerente em `dev`, `staging`, `prod`.
  - **Owner:** `tech-lead`
  - **Aceite objetivo:** evidência por ambiente (timestamp + operador + confirmação de login pós-rotação).

---

## Dia 4 — Rate-limit robusto e observabilidade

- **Tarefa:** ampliar lockout para camada por IP/dispositivo em `validar-gerente`.
  - **Owner:** `backend`
  - **Aceite objetivo:**
    - limite por usuário + IP + device;
    - bloqueio temporal progressivo;
    - resposta consistente (`429`) com motivo.
- **Tarefa:** instrumentar logs/métricas de abuso.
  - **Owner:** `backend`
  - **Aceite:** dashboard mínimo com contagem de tentativas, bloqueios e sucesso por janela.

---

## Dia 5 — Anti-replay forte no sync

- **Tarefa:** implementar assinatura `HMAC(body + timestamp + nonce)` no `sync-outbox`.
  - **Owner:** `backend`
  - **Aceite objetivo:**
    - requests sem assinatura válida rejeitadas (`401/403`);
    - timestamp fora da janela rejeitado;
    - nonce repetido rejeitado (anti-replay).
- **Tarefa:** adequar cliente de sync para enviar assinatura/nonce.
  - **Owner:** `pdv-local`
  - **Aceite:** sync funcional com assinatura ativa em `dev`.

---

## Dia 6 — Retirada gradual de `service_role` do desktop

- **Tarefa:** substituir chamadas privilegiadas locais por Edge/RPC com escopo mínimo.
  - **Owner:** `pdv-local` + `backend`
  - **Aceite objetivo:**
    - `pdv-local` sem uso ativo de `SUPABASE_SERVICE_ROLE_KEY` em fluxos de catálogo/config;
    - autenticação por JWT/device token no caminho principal.
- **Tarefa:** atualizar `.env.example` e docs operacionais.
  - **Owner:** `pdv-local`
  - **Aceite:** documentação e variáveis alinhadas ao novo fluxo.

---

## Dia 7 — Revisão final RLS + abuse test + go/no-go

- **Tarefa:** revisão final de todas as policies RLS restantes.
  - **Owner:** `backend`
  - **Aceite objetivo:** checklist policy-by-policy assinado (SELECT/INSERT/UPDATE/DELETE).
- **Tarefa:** pentest interno curto (abuse test).
  - **Owner:** `tech-lead` + `pdv-importados` + `pdv-local`
  - **Aceite objetivo:**
    - tentativa de preço adulterado falha;
    - tentativa de desconto indevido falha;
    - replay de sync falha;
    - privilege escalation em RPC falha.
- **Tarefa:** decisão de fechamento.
  - **Owner:** `tech-lead`
  - **Aceite:** seção `DEV/STAGING/PROD` marcada como concluída em `SECURANCA_CHECKLIST_FECHAMENTO.md`.

---

## Definição de pronto (DoD)

- Todas as tarefas de Dia 2 a Dia 7 com aceite objetivo cumprido.
- Build e CI verdes nos módulos tocados.
- Evidência operacional arquivada (`SQL checks`, deploy logs, smoke tests).

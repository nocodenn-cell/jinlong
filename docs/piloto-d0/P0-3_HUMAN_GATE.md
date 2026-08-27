# P0-3 — Human gate (restore). **NÃO EXECUTAR.**

**Estado:** aguardando autorização humana explícita para um **DESTINO temporário específico**.  
**P0-2:** **FAIL** — não há backup de plataforma comprovado. Este gate descreve a operação **pretendida**, não autorizada.

## REGRA ABSOLUTA

| Papel | Ref | Permitido nesta sprint |
|---|---|---|
| **PRODUÇÃO / ORIGEM** | `kbabmewnahysfvlybiak` | Só leitura (dump/list), e **só** se o humano autorizar o dump. **Nunca** restore, reset, drop, PITR-restore-in-place, `db reset`, migration destrutiva. |
| **DESTINO** | **não criado / ref não atribuído** | Único lugar onde restore/`psql`/`pg_restore` pode ocorrer, **depois** do humano colar o ref abaixo. |

Se ORIGEM e DESTINO forem o mesmo ref, ou se o DESTINO estiver em branco, **PARAR**.

---

## Formulário (preencher antes de qualquer escrita)

| Campo | Valor agora | Quem preenche |
|---|---|---|
| Projeto **ORIGEM** | `jinlong` (produção piloto) | Fixo |
| Project ref **ORIGEM** | `kbabmewnahysfvlybiak` | Fixo |
| Projeto **DESTINO** temporário | **_(vazio — criar projeto Novo, vazio, outra org/conta se preciso)_** | Humano |
| Project ref **DESTINO** | **`________________`**  ≠ `kbabmewnahysfvlybiak` | Humano |
| Confirmação escrita | “Autorizo restore **somente** no DESTINO acima.” Data/nome: **_______** | Humano |
| Operação pretendida | Ver opções A/B abaixo. **Nenhuma** foi disparada. | — |
| Backup utilizado | **Nenhum comprovado (P0-2 FAIL).** Opção B **gera** o primeiro dump; não restaura um arquivo já existente. | — |
| Dados a validar no DESTINO | Contagens agregadas: `produtos`, `estoque`, `vendas` (totais, sem PII no Git). Comparar ordem de grandeza com ORIGEM via SQL **read-only** na origem. | Após autorização |
| Medição de RTO | Relógio: T0 início restore/load → T1 DESTINO aceita `SELECT count(*)` nas três tabelas. Registrar minutos. Meta D0-06: 8h úteis (desvio explícito se estourar). | Após autorização |
| Prova de que produção **não** muda | (1) DESTINO ≠ `kbabmewnahysfvlybiak`; (2) nenhum `apply_migration` / `db reset` / restore API no ref de produção; (3) antes/depois: `count(*)` em `vendas` na ORIGEM (read-only) deve ser igual, salvo operação normal da loja; (4) Vercel Production continua no mesmo projeto. | Obrigatório |
| Destruição do temporário | Após evidência: pausar ou **Delete project** no DESTINO no painel; confirmar que o ref deixa de listar. **Nunca** delete na ORIGEM. | Após P0-3 |

---

## Opções de operação (ainda não autorizadas)

### A — Restore de plataforma para projeto novo

**Pré-requisito:** P0-2 virar PASS (lista de daily backups ou PITR no painel).  
**Recurso:** Dashboard ORIGEM → Database → Backups → [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project) (só planos pagos + physical backups).  
**Destino:** projeto **criado pela própria UI**, cujo ref será anotado aqui **antes** de confirmar o modal.  
**Proibido:** restore “in place” no projeto atual.

### B — Primeiro export (dump) da ORIGEM → load no DESTINO vazio

**Pré-requisito:** humano cria projeto vazio e cola o ref DESTINO; autoriza dump **read-only** da ORIGEM.  
**Ferramenta:** `supabase db dump` / `pg_dump` contra a ORIGEM; `psql`/`pg_restore` **só** no DESTINO.  
**Isto não é** “restaurar backup existente”. É **criar** a primeira cópia utilizável. Não reclassifica P0-2 como PASS retroativo; no máximo abre P0-3 como ensaio de RTO de **export**, com P0-2 ainda FAIL até existir retenção automática.

`backup.sh` **não** será apontado para produção sem o mesmo gate (ele escreve dump local; destino de restore continua proibido em `kbabmewnahysfvlybiak`).

---

## Ambiguidade → PARE

- DESTINO em branco  
- DESTINO = `kbabmewnahysfvlybiak`  
- “usar o mesmo projeto e depois reverter”  
- PITR restore no projeto vivo  
- `supabase db reset --linked` no link de produção  

**P0-3 não executa até este arquivo ter o ref DESTINO preenchido e a frase de autorização.**

P0-4 (runbook) espera evidência real de P0-2/P0-3. Com P0-2 FAIL, o runbook **não** será escrito como se houvesse Daily Backup.

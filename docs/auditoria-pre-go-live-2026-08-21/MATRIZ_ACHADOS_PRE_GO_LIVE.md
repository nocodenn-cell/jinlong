# Matriz rastreavel de achados pre-go-live

Detalhes, cenarios, correcoes e evidencias completas estao nos tres relatorios de frente. Esta matriz e o indice executivo de aceite.

| ID | Sev. | Status | Descricao/impacto | Evidencia principal | Requisito | Correcao + teste/aceite | Dep. | Tam. | Dono | Bloqueia |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | P1 | FALHA | Conexao/dumps locais podem vazar | `git status`; `git check-ignore` | segredos/backups | quarentena+ignore+scan+rotacao; zero dump/segredo | DevOps | M | DevOps/DPO | Sim |
| SEC-002 | P1 | COMPROVADO | Chave desktop global permite forjar novo cliente | `db.rs:885-953`; `sync-outbox:899-1024` | autenticacao/tenant | credencial por dispositivo; testes A/B/revogacao/loja | backend+desktop | G | Codigo | Sim |
| SEC-003 | P1 | FALHA | Logs persistem localmente sem redacao/TTL | `logger.ts:43-56`; `unified-logger:113-125` | privacidade local | allowlist+redacao+TTL; teste PII/token | privacidade | M | Codigo | Sim |
| SEC-004 | P1 | NAO COMPROVADO | RLS/grants/definers aplicados desconhecidos | scripts/migrations; sem DB | isolamento/RPC | catalog audit+REST negativo cross-loja | banco | G | DB/DevOps | Sim |
| SEC-005 | P2 | NAO COMPROVADO | Cadeia assinada do updater ausente | busca `src-tauri` | supply chain | assinatura/provenance; adulterado rejeitado | release | M | DevOps | Nao |
| LGPD-001 | P1 | PARCIAL | Direitos/retencao prometidos sem fluxo provado | `TERMOS_E_PRIVACIDADE.md` | direitos titular | DSAR+RoPA+TTL; pedido sintetico E2E | juridico | G | Produto/Juridico | Sim |
| LGPD-002 | P1 | FALHA | Dumps de producao sem governanca | `backups/` | seguranca/retencao | cofre+TTL+restore+descarte | DevOps | M | DevOps/DPO | Sim |
| LGPD-003 | P2 | PARCIAL | TTL telemetria e futuro | `RECONNECT_REPLAY_POLICY.md` | minimizacao | purge/agregado; teste temporal | banco | M | Codigo/DPO | Nao |
| LGPD-004 | P2 | NAO COMPROVADO | Bases, DPA e transferencia sem validacao | docs juridicos | governanca | revisao juridica+DPA+incidente | humano | G | Juridico | Expansao |
| FIN-001 | P0 | FALHA | Release financeira nao reproduzivel | branch/SHA/`git diff --stat` | auditabilidade | commit limpo+DB rebuild+manifest; CI mesmo SHA | release | M | Codigo/DevOps | Sim |
| FIN-002 | P1 | NAO COMPROVADO | Concorrencia/invariantes sem execucao DB | `backend/package.json` | consistencia/idempotencia | suite SQL+30 corridas; zero duplicata | DB efemero | G | DB/QA | Sim |
| FIN-003 | P1 | PARCIAL | Diagnosticos/grants podem divergir | migration 20260818000001 + gate9 | menor privilegio | `pg_proc/proacl`+REST negativo | banco | M | DB/Seguranca | Sim |
| FIN-004 | P1 | COMPROVADO | TZ fixa pode cortar periodo errado | report functions `:42-345` | periodo/TZ | TZ por loja; testes virada/UTC | produto | G | DB/Frontend | Condicional |
| FIN-005 | P2 | NAO COMPROVADO | Dashboard nao reconciliado com detalhes | readers/RPCs | reconciliacao | fixture unica fecha centavo/tela | QA | G | Produto/QA | Aceite fin. |
| I18N-001 | P1 | FALHA | 50 arquivos amostrais com JSX hardcoded | comando `rg` | cobertura | lint/extrator; zero literal fora allowlist | catalogo | G | Front/Traducao | Expansao |
| I18N-002 | P1 | COMPROVADO | Desktop PT/BRL-only | `App.tsx:377-919`; `index.html:2` | locale/moeda | runtime compartilhado; receipts PT/ZH/EN | shared-core | G | Desktop | Sim i18n |
| I18N-003 | P1 | COMPROVADO | Banco/tipos aceitam so pt/zh | migrations 072/074; normalizeIdioma | extensibilidade | BCP-47+EN+migration; hydration tests | banco | G | Full-stack | Sim EN |
| I18N-004 | P2 | COMPROVADO | en-US exibe PT por design | `catalogAdapter.test.ts:32-40` | fallback | EN real ou locale efetivo PT; zero mistura | traducao | M | Frontend | Expansao |
| I18N-005 | P2 | PARCIAL | Regiao acoplada a BRL/Brasil | helpers/TZ/fiscal | regionalizacao | configs ortogonais; matriz combinatoria | produto | G | Arquitetura | Expansao |

## Gates de encerramento

Um achado so pode ser fechado com: diff revisado, teste de regressao indicado passando no CI, evidencia no mesmo SHA candidato e criterio objetivo da linha satisfeito. Documento ou teste unitario isolado nao fecha achado de integracao/banco.


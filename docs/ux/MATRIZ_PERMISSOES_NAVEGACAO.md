# Matriz de Permissões × Navegação

**Regra de ouro:** a navegação *reflete* a autorização, nunca a substitui. Fonte única: `lib/admin/policy/adminPolicy.ts` (+ `lib/auth/painelGerencial.ts`).

## 1. Perfis que realmente existem

`PerfilUsuario = 'OPERADOR' | 'GERENTE' | 'DONO' | 'ADMIN'` (`lib/auth/perfil.ts:1`).
Painel `/admin` e `/gerente`: **GERENTE, DONO, ADMIN** (`PERFIS_PAINEL_GERENCIAL`). OPERADOR vai para `/caixa` (`destinoPosLoginPorPerfil`).

**Não existem** (grep): perfis Estoquista e Financeiro; permissões granulares por módulo; tela de "Perfis e permissões". As personas da missão (Estoquista, Financeiro) **não podem ser implementadas na navegação sem antes existir o conceito no backend** — fora do escopo desta sprint. Não criar segundo mecanismo.

## 2. Matriz atual (derivada do código)

| Destino | OPERADOR | GERENTE | DONO | ADMIN | Evidência |
|---|---|---|---|---|---|
| PDV `/caixa` | ✔ | ✔ | ✔ | ✔ | `isProtectedRoute` |
| Início, Vendas, Caixas, Catálogo, Clientes, Funcionários, Estoque, Compras, Fornecedores, Relatórios, Auditoria, Configurações, Suspensão | ✘ | ✔ | ✔ | ✔ | `canAccessAdmin` (sem entrada específica = padrão) |
| Financeiro (+ sensível) | ✘ | ✔ | ✔ | ✔ | `sensitive:financeiro` = `ALL_ADMIN_PROFILES` |
| Comissões (+ liquidação) | ✘ | ✔ | ✔ | ✔ | `sensitive:comissoes` = `ALL_ADMIN_PROFILES` |
| Implantação (ver) | ✘ | **✔ por URL** | ✔ | ✔ | `RESOURCE_PROFILES['route:/admin/implantacao']` |
| Implantação (autorizar GO) | ✘ | ✘ | ✔ | ✔ | `implantacao/actions.ts:283,389` |
| Diagnóstico do Caixa | ✘ | **✔ por URL** | ✔ | ✔ | idem |
| Provisionamento | ✘ | ✘ | ✘ | ✔ | policy + `provisionamento/page.tsx:15` |

Na sidebar atual, `adminOnly` oculta Provisionamento, Implantação e Diagnóstico para quem não é ADMIN (`showAdminOnlyItems = perfil === 'ADMIN'`). Para Implantação e Diagnóstico **isso é só visual** (linhas "por URL").

## 3. Implicações para a nova navegação

1. Hoje GERENTE, DONO e ADMIN veem **o mesmo menu** (exceto os 3 internos). Logo, "navegação por perfil" = **no máximo** a distinção ADMIN × restantes. Não há ganho de UX a obter por perfil agora.
2. A nova sidebar deve consumir **uma função de visibilidade** que chame `canAccessRoute`/`canAccessResource` — nunca replicar listas de perfis.
3. Ocultar ≠ proteger: toda Server Action nova continua validando sessão (padrão `assertAdminSession`). O PR de navegação **não** adiciona nem remove autorização.
4. **Pendência de decisão (fora de UX):** restringir `implantacao` e `diagnostico-caixa` na policy, ou documentá-las como acessíveis a GERENTE/DONO.
5. Ação futura (backlog, não sprint): se o produto quiser Estoquista/Financeiro, criar o perfil no backend + RLS primeiro; a navegação só herda.

## 4. Verificação obrigatória a cada PR

- [ ] `adminPolicy.test.ts` e `SidebarNav.behavior.test.tsx` verdes.
- [ ] Teste novo: GERENTE não vê grupo "Interno"; ADMIN vê.
- [ ] Teste novo: Ctrl+K nunca lista destino que `canAccessRoute` nega.
- [ ] Nenhum diff em `lib/admin/policy/*` nos PRs de UX (qualquer mudança vai em PR separado com revisão de segurança).

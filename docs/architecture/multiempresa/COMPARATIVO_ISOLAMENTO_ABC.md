# Comparativo — estratégias de isolamento multiempresa

## Opções

| | A — Banco compartilhado + isolamento lógico | B — Schema por empresa | C — Projeto/banco Supabase por empresa |
|---|---|---|---|
| Modelo | `empresas` + `loja.empresa_id` + RLS/RESTRICTIVE + helpers | `empresa_N` schema ou search_path | 1 projeto Supabase (ou DB) por cliente |
| Segurança (se bem feita) | Alta com RESTRICTIVE + fail-closed | Alta (isolamento PostgreSQL) | Máxima (blast radius = 1 cliente) |
| Complexidade código | Média — evolução da ESPEC D1–D19 | Alta — migrations N×, tooling | Alta ops — provisioning, CI, secrets N× |
| Custo Supabase | 1 projeto (atual Free/Pro) | 1 projeto, mais objetos | N projetos / N bills |
| Migrations | Uma cadeia; risco drift único | Aplicar em cada schema | Aplicar em cada projeto |
| Escala lojas | Boa com índices `(empresa_id, loja_id, …)` | Boa até dezenas de schemas | Linear em ops |
| Backup/restore | 1 pipeline (já em construção) | 1 dump, restore seletivo difícil | N pipelines |
| Offline sync | Precisa redesign (D6) | Idem + search_path | Naturalmente isolado |
| Fit Jinlong atual | **Melhor** — ESPEC já escolheu este caminho | Overkill agora | Só se compliance exigir air-gap |

## Recomendação

**A — banco compartilhado com isolamento lógico por `empresa_id`**, seguindo `ESPEC_MULTIEMPRESA_V1.md` (D17 aditivo primeiro).

**Não** introduzir microsserviços, schema-per-tenant nem multi-projeto agora.

### Por quê A

1. Código e ESPEC já assumem loja + RLS; falta a camada empresa.  
2. Um backup/CI/migrate — crítico enquanto P0 backup ainda é NO-GO.  
3. Custo e operação cabem no estágio 1→poucos clientes.  
4. C pode ser **escape hatch** futuro para enterprise; não é pré-requisito do 2º cliente se A for implementada com provas XT-*.

### Condições para A ser segura

- RESTRICTIVE tenant guard nas tabelas de dado de cliente  
- Sync-outbox redesenhado (D6) antes do 2º cliente com desktop  
- Zero fallback silencioso para `LOJA_MATRIZ_ID` (D18)  
- Provisionamento sem lookup global de `lojas.codigo` (D11)

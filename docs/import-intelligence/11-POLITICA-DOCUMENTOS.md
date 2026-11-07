# 11 — Política de documentos originais (XML e PDF) — PROPOSTA

**Status: proposta. Não aprovada.** Nenhum armazenamento real de documento foi liberado. Os itens marcados como DECISÃO pendente dependem de decisão jurídica ou operacional. Até a aprovação, o sistema não grava XML ou PDF de importação em armazenamento permanente.

## 1. Bucket e autorização por tenant

- Bucket **privado**, sem leitura pública, sem URL permanente.
- Caminho com identificador de tenant e de operação: `<tenant>/importacoes/<importacao_id>/<sha256>.<ext>`. O tenant vem da sessão e do registro, nunca do nome do arquivo.
- Escrita e leitura só por RPC ou endpoint do servidor, com verificação de licença e permissão (ver `10-SPRINT-2A-RELATORIO.md` §3).
- Políticas de storage que dependem de tenant ficam **bloqueadas** até a identidade de tenant existir (ESPEC etapas 1 a 3).

## 2. Hash e integridade

- `sha256` calculado sobre os **bytes originais**, antes de qualquer normalização.
- O hash é a prova de integridade do arquivo. Não é a identidade da operação (que é o `importacao_id`).
- Duplicidade: mesmo hash no mesmo tenant não cria novo registro; registra nova referência.
- Verificação de integridade: recalcular o hash ao ler e comparar com o registrado. Divergência bloqueia uso do arquivo e gera alerta de auditoria.

## 3. Metadados mínimos

| Campo | Obrigatório | Observação |
|---|---|---|
| `id`, `tenant`, `importacao_id` | Sim | Vínculo com a operação |
| `tipo_documento` | Sim | `NFE_XML`, `DI_PDF`, `INVOICE_PDF`, `CONHECIMENTO_PDF`, `OUTRO` |
| `sha256` | Sim | Integridade |
| `tamanho_bytes`, `mime_type` | Sim | Validado no servidor, não confiado do cliente |
| `nome_original` | Sim | Guardado, nunca usado no caminho |
| `chave_acesso` | Quando NF-e | 44 dígitos |
| `enviado_por`, `enviado_em` | Sim | Auditoria |
| `status` | Sim | `ATIVO`, `SUBSTITUIDO`, `EXCLUIDO_LOGICO`, `RETIDO_LEGAL` |
| `retencao_ate` | Sim | Calculado pela política (seção 5), não preenchido à mão |

## 4. Restrição de acesso

- Leitura: somente papéis do tenant com permissão de importação. Nunca OPERADOR de loja comum. Nunca ADMIN de plataforma sem trilha de auditoria (ESPEC D1).
- Download por URL assinada de curta duração (proposta: 5 minutos), emitida pelo servidor após checagem de permissão e de licença.
- Nenhuma listagem pública. Nenhum acesso por nome de arquivo.

## 5. Política de retenção — DECISÃO PENDENTE

**Não existe política aprovada.** Proposta para discussão com jurídico e contabilidade:

- Prazo de retenção do documento original: **a definir** por jurídico/contabilidade. Não há prazo assumido aqui.
- Enquanto a operação estiver ativa, o documento não pode ser excluído.
- Revisão periódica (proposta: anual) dos documentos com prazo vencido, com decisão registrada.
- Retenção ilimitada **não é assumida**. Exclusão automática **não é assumida**.

## 6. Exportação e auditoria

- Toda leitura, download e exportação gera registro em trilha de auditoria: quem, quando, qual documento, qual hash, de qual IP ou sessão.
- Exportação em lote exige permissão específica e registro do motivo.
- Auditoria é append-only.

## 7. Exclusão e preservação legal

- **Exclusão lógica** (`EXCLUIDO_LOGICO`) é o único estado que o sistema pode aplicar, mediante permissão e motivo. O arquivo continua no storage até a exclusão física.
- **Exclusão física** só ocorre por processo aprovado de retenção, nunca por ação de usuário e nunca em cascata por exclusão de operação ou de cliente.
- **Preservação legal** (`RETIDO_LEGAL`): bloqueia qualquer exclusão, física ou lógica, até liberação formal registrada.
- Desativação do módulo ou da licença **não apaga** documento nem histórico.

## 8. Decisões pendentes

| # | Decisão | Responsável | Bloqueia |
|---|---|---|---|
| DOC-01 | Prazo de retenção do XML e do PDF originais | Jurídico + contabilidade | Qualquer armazenamento real |
| DOC-02 | Quem pode exportar em lote e em que condições | Operação + jurídico | Função de exportação |
| DOC-03 | Procedimento de preservação legal e de liberação | Jurídico | `RETIDO_LEGAL` |
| DOC-04 | Mime types aceitos e tamanho máximo | Arquitetura | Upload |
| DOC-05 | Tempo de vida da URL assinada | Segurança | Download |

## 9. O que pode ser implementado agora

Apenas contratos e testes locais: validação de metadados, cálculo de `sha256` sobre bytes, verificação de integridade e máquina de estados de `status`. **Sem** bucket real, **sem** upload para o Supabase, **sem** URL assinada em produção.

# 03 — Matriz fiscal e tributária (proposta de contrato)

**Escopo desta matriz:** definir **como registrar** tributos, créditos e status de recuperabilidade. **Não** define quais tributos são recuperáveis ou incorporáveis. Essa classificação depende de regra vigente e de validação contábil/fiscal (DECISÃO-03). Não há motor tributário nesta sprint.

---

## 1. Princípios

1. **O sistema registra, o contador classifica.** Nenhuma lista de tributos "sempre recuperáveis" ou "sempre incorporáveis" entra no código.
2. **Todo status tem fundamento.** Sem fundamento registrado, o status não pode sair de `PENDENTE_VALIDACAO`.
3. **Regra com vigência.** A classificação vale para a data do documento de origem, não para a data do cálculo.
4. **Append-only.** Correção gera novo registro com `supersede_de`.
5. **Empresa titular é explícita.** Crédito pertence à empresa que recolheu. Um processo com mais de uma empresa titular exige um lançamento por titular.
6. **Sem default.** Ausência de informação gera pendência, nunca zero.

---

## 2. Atendimento da Etapa D (campos obrigatórios)

| Requisito da missão | Campo no contrato (`02-CONTRATOS.md` §4) | Observação |
|---|---|---|
| Tributo e fundamento | `tributo_codigo`, `fundamento`, `regra_id` | `fundamento` é texto validado pela contabilidade |
| Documento de origem | `documento_origem_id` | DI/DUIMP, guia de recolhimento, recibo |
| Valor apurado | `valor_apurado_brl` | Calculado pelo documento de origem |
| Valor recolhido | `valor_recolhido_brl` | Pode diferir do apurado; divergência de aviso |
| Empresa titular | `empresa_titular_cnpj` | Obrigatório |
| Status de recuperabilidade | `status_recuperabilidade` | Enum da seção 3 |
| Crédito potencial | `credito_potencial_brl` | Não aprovado |
| Crédito reconhecido | `credito_reconhecido_brl` | Só com validação |
| Regra e vigência | `regra_id`, `regra_vigencia_inicio`, `regra_vigencia_fim` | Cópia no lançamento para auditoria |
| Responsável pela validação | `validado_por`, `validado_em` | Obrigatório se reconhecido |

---

## 3. Status de recuperabilidade

| Status | Significado | Quem define | Exige | Efeito no motor |
|---|---|---|---|---|
| `PENDENTE_VALIDACAO` | Registrado, sem classificação | Sistema, ao registrar | Nada | **Bloqueia** publicação (`TRIBUTO_PENDENTE`) |
| `NAO_RECUPERAVEL` | Não gera crédito | Validador | `regra_id`, `fundamento` | Entra no custo se `regra.incorpora_custo = true` |
| `RECUPERAVEL_POTENCIAL` | Pode gerar crédito, ainda não aprovado | Validador | `regra_id`, `fundamento` | Não entra no custo. Vai para memória e crédito potencial |
| `RECUPERAVEL_RECONHECIDO` | Crédito aprovado | Validador (papel de validação) | Tudo acima + `validado_por`, `validado_em` | Não entra no custo. Vai para crédito reconhecido |
| `GLOSADO` | Crédito recusado após potencial ou reconhecido | Validador | Motivo em `fundamento` | Conforme `regra.incorpora_custo` |
| `NAO_APLICAVEL` | Não se aplica a este processo ou item | Validador | Justificativa | Não entra |

**Transições permitidas**

```
PENDENTE_VALIDACAO ──► NAO_RECUPERAVEL | RECUPERAVEL_POTENCIAL | NAO_APLICAVEL
RECUPERAVEL_POTENCIAL ──► RECUPERAVEL_RECONHECIDO | GLOSADO
RECUPERAVEL_RECONHECIDO ──► GLOSADO   (novo lançamento com supersede_de)
GLOSADO ──► RECUPERAVEL_RECONHECIDO   (novo lançamento, com nova validação)
NAO_RECUPERAVEL, NAO_APLICAVEL ──► (novo lançamento com supersede_de)
```

Transições são sempre novo lançamento. Nunca alteração do anterior.

---

## 4. Catálogo de tributos candidatos (a classificar)

Lista de **nomes** para o catálogo `tributo_catalogo`. Não há classificação aqui. Cada linha precisa de regra com fundamento, aprovada pela contabilidade, antes de ser usada em publicação.

| Código sugerido | Nome | Situação |
|---|---|---|
| `II` | Imposto de importação | A classificar. NÃO VALIDADO |
| `IPI_IMPORTACAO` | IPI vinculado à importação | A classificar. NÃO VALIDADO |
| `PIS_IMPORTACAO` | PIS-importação | A classificar. NÃO VALIDADO |
| `COFINS_IMPORTACAO` | COFINS-importação | A classificar. NÃO VALIDADO |
| `ICMS_IMPORTACAO` | ICMS na importação | A classificar. NÃO VALIDADO |
| `AFRMM` | Adicional ao frete para renovação da marinha mercante | A classificar. NÃO VALIDADO |
| `IOF_CAMBIO` | IOF sobre operação de câmbio | A classificar. NÃO VALIDADO; pode ser tratado como despesa financeira |
| `OUTRO_TRIBUTO` | Tributo não catalogado | Exige cadastro antes do uso |

**Sobre a lista:** os nomes vêm de conhecimento geral de operações de importação e servem apenas para cadastro. A incidência, a base de cálculo, a recuperabilidade e a incorporação ao custo não foram verificadas aqui e não devem ser presumidas a partir desta tabela.

---

## 5. Regras de cadastro (`tributo_regra`)

Tabela proposta, mantida pela contabilidade:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | uuid | Identidade |
| `tributo_codigo` | texto | FK para `tributo_catalogo` |
| `regime_empresa` | texto | Regime tributário da empresa titular (NÃO VALIDADO: ver §7) |
| `incorpora_custo` | boolean | Se o valor não recuperável entra no custo |
| `gera_credito` | boolean | Se pode gerar crédito |
| `condicao` | texto | Condição de aplicação, em linguagem clara |
| `fundamento_texto` | texto | Referência normativa usada pelo validador |
| `vigencia_inicio` | data | Início |
| `vigencia_fim` | data | Fim; nulo = em vigor |
| `criado_por`, `criado_em` | — | Autoria |
| `aprovado_por`, `aprovado_em` | — | Aprovação contábil obrigatória para uso |

**Regras de uso**

- Regra sem `aprovado_por` não pode ser referenciada por lançamento.
- Regra alterada gera **nova linha** com nova vigência. A anterior não muda.
- Lançamento copia `regra_id` e a vigência no momento do registro.
- Regra fora de vigência na data do documento de origem gera `TRIBUTO_REGRA_FORA_VIGENCIA` (bloqueante).

---

## 6. Papéis

| Papel | Pode | Não pode |
|---|---|---|
| Registrador (DONO, GERENTE) | Registrar tributo, documento, valor apurado e recolhido | Definir status `RECUPERAVEL_*`, `NAO_RECUPERAVEL` ou `GLOSADO` |
| Validador contábil (papel novo, DECISÃO-03) | Definir status, validar crédito, aprovar regra | Alterar valor apurado ou recolhido |
| Plataforma (ADMIN) | Nada | Acessar dados fiscais de cliente (D1) |

**Separação de funções:** quem registra o valor não valida o status. Se a empresa for pequena e o mesmo usuário acumular os papéis, isso deve ser decisão explícita, registrada.

---

## 7. Perguntas que precisam de resposta da contabilidade (DECISÃO-03)

| # | Pergunta | Por que bloqueia |
|---|---|---|
| F-01 | Qual é o regime tributário de cada empresa titular (Lucro Real, Lucro Presumido, Simples Nacional ou outro)? | Muda recuperabilidade. **NÃO VALIDADO** no repositório |
| F-02 | Para cada tributo da importação, qual é a regra de recuperabilidade no regime da empresa? | Define `status` e `gera_credito` |
| F-03 | Quais tributos entram no custo do produto quando não recuperáveis? | Define `incorpora_custo` |
| F-04 | Como tratar IOF de câmbio: despesa financeira ou custo? | Muda o componente do custo |
| F-05 | AFRMM e frete internacional: incorporam ao custo do item ou são despesa do processo? | Muda rateio |
| F-06 | Seguro: quando já está no valor aduaneiro, é duplicidade? Qual documento prevalece? | Evita dupla contagem (`01-ARQUITETURA.md` §6.7) |
| F-07 | Quem é a empresa titular quando a importadora é diferente das lojas que recebem? | Define em qual CNPJ o crédito fica |
| F-08 | Como tratar a diferença entre valor recolhido e apurado? | Define divergência de aviso ou bloqueio |
| F-09 | Qual é o prazo e o gatilho para reconhecer crédito potencial como reconhecido? | Define transição de status |
| F-10 | Retificação de DI ou de documento de origem após publicação: qual o procedimento? | Define `RetificarProcesso` |

**Enquanto F-01 a F-03 não forem respondidas:** o sistema pode registrar tributos, mas não publica custo landed com tributo incorporado. Publicação fica bloqueada por `TRIBUTO_PENDENTE`.

---

## 8. O que o motor faz e não faz

| Faz | Não faz |
|---|---|
| Lê `status_recuperabilidade` gravado | Decide o status |
| Lê `regra.incorpora_custo` gravado | Decide se incorpora |
| Soma valores apurados por componente | Calcula base de cálculo tributária |
| Marca pendências | Presume recolhimento |
| Registra qual regra foi usada | Infere regra a partir de nome de tributo |

---

## 9. Riscos fiscais e financeiros

| Risco | Descrição | Evidência no repositório | Mitigação |
|---|---|---|---|
| **R-F1** | Crédito tratado como custo, ou custo tratado como crédito | Não há campo de tributo hoje (A-01) | Status obrigatório, sem default |
| **R-F2** | Crédito reconhecido sem validação | Não existe fluxo de validação | `validado_por` obrigatório |
| **R-F3** | Mesmo tributo registrado em dois documentos | Não há verificação hoje | Divergência `DESPESA_DUPLICADA_SUSPEITA` |
| **R-F4** | Regra mudou depois do fato gerador | Não há vigência hoje | Copiar vigência no lançamento |
| **R-F5** | Empresa titular errada, crédito no CNPJ errado | Multiempresa não existe (A-19) | `empresa_titular_cnpj` obrigatório e validado |
| **R-F6** | Obrigação financeira diferente do tributo apurado | Sem conciliação (A-02) | Divergência `NFE_TOTAL_NAO_CONCILIADO` |
| **R-F7** | Valor recolhido diferente do apurado sem explicação | Sem campo hoje | Aviso `TRIBUTO_RECOLHIMENTO_DIVERGENTE` |
| **R-F8** | Retificação que apaga histórico | Não há trilha hoje | Append-only |
| **R-F9** | Publicação de custo com tributo não validado | Não há bloqueio hoje | Bloqueio `TRIBUTO_PENDENTE` |
| **R-F10** | NF-e de entrada tratada como emissão fiscal | Fluxos diferentes (`fiscal-worker` é emissão) | Import não usa `fiscal-worker`. Ver `00-AUDITORIA.md` §2 |

---

## 10. Limites desta matriz

- Não substitui parecer contábil nem fiscal.
- Não contém alíquota, base de cálculo nem condição de incidência.
- Não define regime tributário das empresas.
- Todos os campos "NÃO VALIDADO" dependem de resposta de F-01 a F-10.

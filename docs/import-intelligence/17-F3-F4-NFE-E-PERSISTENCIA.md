# 17 — Fase 3 (NF-e) e Fase 4 (persistência do Import Intelligence)

Status: **implementado e testado em ambiente local**. Nada foi aplicado em produção.

## Fase 3 — NF-e (mudanças separadas)

### 3.1 Parser preserva referências textuais (D5) — commit `86df0c11`

O problema confirmado: com `parseTagValue: true`, toda tag com cara de número virava número.

| Campo | Antes | Depois |
|---|---|---|
| `cProd` | "000123" virava "123" | "000123" |
| `cEAN` | "0789…" virava "789…" | "0789…" |
| NCM | "01012100" virava "1012100" | "01012100" |
| CNPJ iniciado em zero | perdia um dígito e a NF-e era **recusada** | aceito com 14 dígitos |

Correção em `pdv-importados/lib/nfe/nfeParser.ts`:
- Tudo é lido como texto.
- Campos opcionais novos: decimais exatos (`q_com_texto`, `v_un_com_texto`), `gtin_tributavel`, `fatura`, `pagamentos` e `totais` (somente leitura).
- O contrato das duplicatas não mudou.

**Compatibilidade sem adivinhação.** Para cada item, o parser também calcula `ref_fornecedor_legado` e `gtin_legado`, executando a **configuração antiga da mesma biblioteca** sobre o mesmo XML. O preview (`montarLinhasPreview`):
1. prefere o vínculo exato;
2. sem vínculo exato, usa o vínculo legado, com o mesmo resultado de antes, e marca `referencia_match = LEGADA`;
3. se duas referências distintas da mesma nota colidem no formato antigo (`0123` e `00123` viram `123`), não usa o legado e marca `AMBIGUA`, o que exige conferência humana.

Novos vínculos são gravados com o código correto. Nenhum vínculo histórico é alterado.

### 3.2 Relatório de vínculos (D5) — commit `d509407e`

`ops_relatorio_vinculos_d5()` é somente leitura e exclusivo de service_role. Classes:

| Classe | O que indica |
|---|---|
| `POSSIVELMENTE_NORMALIZADA` | código numérico que pode ter perdido zeros |
| `COLISAO_PRODUTOS_DIFERENTES` | códigos iguais sem os zeros apontando para produtos diferentes: **conferência humana** |
| `EQUIVALENTE_MESMO_PRODUTO` | códigos equivalentes para o mesmo produto, consolidáveis |
| `REFERENCIA_CORROMPIDA_PROVAVEL` | 16+ dígitos ou notação científica, possível perda de precisão de float |
| `PRODUTO_INATIVO_OU_AUSENTE` | vínculo para produto inativo ou inexistente |
| `GTIN_POSSIVELMENTE_NORMALIZADO` | 7 ou 11 dígitos |

O GTIN de 13 dígitos fica de fora: um GTIN-14 sem o zero inicial é um EAN-13 válido e não dá para distinguir os dois; o preview casa as duas formas. **Pendente:** rodar o relatório em um clone autorizado de produção antes de qualquer consolidação. Nenhuma correção histórica foi feita.

### 3.3 Duplicatas × NF-e (D6) — commit `32ccfeb7`

Função pura `conciliarObrigacoesNfe` (`shared-core/src/import/conciliacaoObrigacoes.ts`), em centavos exatos e **sem tolerância**:
- **Com fatura:** a referência é `vLiq`, e a função confere `vOrig − vDesc = vLiq`.
- **Sem fatura:** a referência é `vNF − pagamentos à vista − adiantamentos registrados` (informados explicitamente, nunca presumidos).

Ela identifica parcelado, à vista, antecipado, misto, desconto financeiro, divergência documental e obrigação não reconhecida (`tPag 90` ou ausência de informação). Uma divergência bloqueia **só a confirmação financeira** (`bloqueiaConfirmacaoFinanceira`); o documento continua registrável. A função não cria obrigação nem altera valores. 15 testes.

**Ainda não ligada ao fluxo de confirmação da NF-e do ERP.** A ligação muda o comportamento do cliente atual e vai exigir rollout por empresa, no mesmo padrão da D7. É a próxima etapa. O Import Intelligence já pode consumi-la.

### 3.4 Recebimento duplicado OC × NF-e (D7) — commit `d509407e`

O fluxo canônico já não duplica quando a NF-e está vinculada à OC (abate a OC; recusa OC já recebida) ou a uma remessa. A lacuna era a NF-e **sem vínculo** com recebimento anterior.

Agora, com o rollout `ROLLOUT_NFE_TRAVA_RECEBIMENTO` **ativo para a empresa**, concluir uma NF-e sem OC e sem remessa que tenha suspeitos exige vínculo ou conferência registrada. Suspeito é um recebimento de OC na mesma loja, do mesmo fornecedor e produto, nos últimos 180 dias, sem documento. A conferência fica em `nfe_registrar_conferencia_recebimento_anterior` (justificativa, quem, quando, suspeitos).
- A OC **não** passa a ser obrigatória.
- Os comandos de estoque não mudam.
- O trigger roda na transição para `CONCLUIDA`, dentro da mesma transação: atômico.
- Rollout desligado (padrão): comportamento idêntico ao atual (teste D7-2).

Testes: 9/9 pela RPC real `confirmar_importacao_nfe`.

### 3.5 Documentos (D8)

O contrato foi implementado no Import Intelligence (§4.4). Proposta de retenção por categoria, **a validar juridicamente**:

| Categoria | Base de referência (a confirmar) | Retenção proposta |
|---|---|---|
| XML de NF-e (entrada) | prazo decadencial/prescricional tributário | mínimo 5 anos após o exercício, recomendado 6 |
| DI/DUIMP, invoice, packing list, BL | controle aduaneiro e tributário | mínimo 5 anos após o desembaraço |
| Contrato de câmbio e comprovantes | câmbio e tributação | mínimo 5 anos |
| Memória de apuração (entrada e saída do motor) | rastreabilidade do custo | enquanto o custo estiver em uso, mais 5 anos |

Nenhuma exclusão automática foi habilitada. Nenhum documento de cliente foi gravado em banco compartilhado.

## Fase 4 — Persistência do Import Intelligence — commit `e4d43604`

Migration `20261010160000_f4_import_intelligence_persistencia.sql`, com rollback em `rollback/`. Adapter em `pdv-importados/lib/import/importIntelligence.ts`.

### 4.1 Estruturas

| Necessidade | Tabela |
|---|---|
| Operações de importação | `import_operacoes` (status RASCUNHO, APROVADA ou CANCELADA; `versao_dados`) |
| Itens e quantidades | `import_itens` (escalas do motor: moeda 6, quantidade 3, fator 6) |
| Câmbio | `import_cambios` (taxa com 10 casas, fonte, data) |
| Documentos e referências | `import_documentos` (sha256, quem, quando, versão por substituição, imutável) |
| Tributos documentados | `import_tributos` (status de recuperabilidade, regra com vigência, validador). O módulo registra a classificação informada; não cria regra fiscal. |
| Despesas diretas e compartilhadas, critérios de rateio | `import_despesas` (DIRETA com item, ou RATEIO com critério; justificativa obrigatória; negativo = estorno documentado) |
| Descontos | `import_descontos` |
| Simulações e versões de apuração | `import_apuracoes` (SIMULACAO ou APURACAO, versão, entrada e saída do motor, hashes, versão do motor), imutáveis |
| Resultado por item e memória | `import_apuracao_itens` (custo unitário com 6 casas, resíduos com 10), `import_apuracao_rateios` |
| Divergências | `import_divergencias` |
| Estados de aprovação | `import_aprovacoes` (APROVADA, REABERTA, CANCELADA), append-only |
| Auditoria | `import_auditoria`, append-only, gravada por toda RPC |

### 4.2 Autorização

- **Tenant derivado.** `import_criar_operacao(loja, referência)` deriva a empresa da loja. Nenhuma RPC aceita `empresa_id`.
- **Leitura (RLS).** Exige `fp_pode_modulo(empresa, IMPORT_INTELLIGENCE, DONO/GERENTE)`, ou seja, módulo ativo e vigente, empresa operacional, usuário ativo e papel, **e** `fp_pode_loja`.
- **Escrita.** Só pelas RPCs `import_*`, com `fp_pode_operar_loja`. `authenticated` tem apenas SELECT.
- **Módulo desabilitado.** Os dados ficam inacessíveis ao cliente e preservados no banco (F4-10).
- **Produto do item.** Precisa ser da mesma empresa.

### 4.3 Cálculo e aprovação

1. O servidor chama `import_montar_entrada`: **o banco** monta o `LandedCostInput` a partir das tabelas.
2. O servidor roda `calcularLandedCost`, o motor existente, sem duplicação.
3. Grava a apuração com `import_registrar_apuracao`. O banco guarda a **própria** entrada, recusa saída cujos itens não sejam os da operação e recusa versão de dados desatualizada (concorrência).
4. **Aprovar** (`aprovarApuracao`): o servidor recalcula a partir da entrada guardada, exige `verificarAprovacao` aprovável e hash da saída igual ao guardado. Só então chama `import_aprovar_apuracao`, exclusiva de service_role e recusada se houver identidade de usuário. A RPC revalida no banco que o aprovador é DONO da empresa com o módulo ativo, que a apuração é do tipo APURACAO e OK e que os dados não mudaram.
5. Uma operação aprovada não é editável. Só o DONO reabre, e o histórico é preservado.

### 4.4 Documentos (D8)

- Bucket privado `import-documentos`.
- Caminho obrigatório `<empresa>/<operacao>/…`, verificado por constraint e pela policy de storage.
- Leitura e envio só com permissão na operação.
- **Sem** policy de UPDATE/DELETE: nada sobrescreve nem apaga.
- Metadados imutáveis, com nova versão por substituição.

### 4.5 Testes

| Teste | Resultado |
|---|---|
| `backend/scripts/f4-import-intelligence.test.sql` | 11/11: módulo desligado; tenant; isolamento A×B (B licenciado, OPERADOR, GERENTE de outra loja); escalas da entrada; versionamento e concorrência; imutabilidade; aprovação só pelo servidor e só pelo DONO; reabertura; documentos; licença revogada; **ERP intocado** (estoque, kardex, contas a pagar, preços) |
| `pdv-importados/lib/import/importIntelligence.integracao.test.ts` (Supabase local real, JWT do GoTrue, motor real) | 2/2: salvar, reabrir, recalcular com hash idêntico, aprovar pelo servidor; B não vê A; GERENTE não aprova; chamada direta à aprovação recusada; ERP intocado; storage privado com sha256 conferido, B sem acesso, sem sobrescrita nem exclusão |
| Regressão (47 scripts) | 35 PASS / 12 FAIL, idênticas ao baseline |
| Rollback | schema idêntico ao da F3; aborta se houver operações |
| C1 | OK (todas as RPCs novas checam identidade) |

**Gate F4:** a operação é salva e reaberta, o cálculo é reprodutível (hash idêntico) e isolado, sem efeito nos módulos operacionais. **Aprovado em ambiente local.**

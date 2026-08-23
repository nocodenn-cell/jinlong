# Definição funcional autoritativa do piloto D0

**Autoridade:** decisão de produto fornecida em 23/08/2026. Em caso de conflito interpretativo, este arquivo prevalece para o D0.

## D0-01 - Atacado por tiers do produto

- **Regra:** o primeiro tier ativo de cada produto é a única fonte autoritativa para iniciar o atacado. A menor `quantidade_minima` ativa vence. Configuração global pode apenas sugerir um valor no cadastro; nunca participa do cálculo final.
- **Justificativa:** evita duas fontes de verdade e preços diferentes entre cadastro, carrinho e servidor.
- **Aceite:** abaixo do primeiro tier aplica varejo; ao atingir exatamente o tier aplica seu preço; tiers maiores seguem a maior faixa atingida; desativar o primeiro tier promove o próximo ativo.
- **Fora do escopo:** motor promocional novo.
- **Impacto contratual:** substitui qualquer leitura de “quantidade mínima configurável” como parâmetro global de execução.
- **Pendente cliente:** nenhum para a regra; confirmar apenas apresentação da sugestão no cadastro.

## D0-02 - Custo opcional e nullable

- **Regra:** custo é opcional. `NULL` significa desconhecido. Zero só é válido quando declarado intencionalmente. Ausência não bloqueia cadastro nem venda e não pode virar zero silenciosamente.
- **Justificativa:** zero falso corrompe margem, CMV e relatórios.
- **Aceite:** cadastrar/vender com custo `NULL`; relatórios exibem “não informado”; custo zero exige ação explícita; round-trip UI-banco preserva `NULL`.
- **Fora do escopo:** custo médio, lote ou valuation avançado.
- **Impacto contratual:** “preço de custo” da especificação é campo suportado, não obrigatório no D0.
- **Pendente cliente:** nenhum.

## D0-03 - Quantidades

- **Regra:** remessa e confirmação de recebimento exigem quantidade `> 0`; inventário físico aceita zero; negativos são proibidos na UI em todos esses fluxos. Operação sem item positivo não é registrada.
- **Justificativa:** zero em movimento físico cria evento sem efeito; zero em contagem representa ausência real.
- **Aceite:** UI e servidor rejeitam zero/negativo em remessa/recebimento; inventário aceita zero e registra divergência; transação vazia não persiste cabeçalho.
- **Fora do escopo:** inventário formal no D0; a regra de zero vale quando houver contagem física.
- **Impacto contratual:** especializa o requisito genérico de entrada/ajuste da especificação.
- **Pendente cliente:** nenhum.

## D0-04 - Venda em espera

- **Regra:** fora do D0. Não melhorar agora e não apresentar como contratada. Se estável, pode permanecer oculta ou desabilitada por configuração.
- **Justificativa:** reduz risco no fluxo crítico e respeita o feature freeze.
- **Aceite:** material de venda e navegação D0 não prometem/exibem o recurso; desligá-lo não quebra venda normal.
- **Fora do escopo:** hold, retomada, reserva e concorrência.
- **Impacto contratual:** decisão D0 posterga requisito explícito da página 1.
- **Pendente cliente:** eventual contratação pós-piloto.

## D0-05 - Reabertura de caixa

- **Regra:** somente `GERENTE` ou `DONO`, nunca `OPERADOR`; motivo obrigatório; registrar ator, data/hora, caixa anterior e efeitos financeiros. O fechamento original é imutável e um novo evento é criado.
- **Justificativa:** preservar trilha financeira e impedir reescrita retroativa.
- **Aceite:** teste negativo de operador; fechamento original intacto; evento de reabertura consultável com motivo e ator; movimentações anteriores não são apagadas.
- **Fora do escopo:** edição retroativa de movimentos.
- **Impacto contratual:** define a autorização citada na página 7.
- **Pendente cliente:** definir se a função precisa estar disponível no primeiro dia; se não, mantê-la indisponível.

## D0-06 - Recuperação

- **Regra:** meta inicial de RPO até 24 horas e RTO até 8 horas úteis, pendente de aceite formal. Não é SLA definitivo.
- **Justificativa:** meta proporcional ao piloto e à mensalidade; não prometer alta disponibilidade empresarial.
- **Aceite:** backup identificado, restauração em ambiente temporário, integridade verificada e tempos registrados dentro das metas.
- **Fora do escopo:** alta disponibilidade empresarial/PITR como promessa automática.
- **Impacto contratual:** reduz a amplitude do backup local+nuvem diário/semanal/mensal da página 7 a uma capacidade operacional mensurável.
- **Pendente cliente:** aceite formal de RPO/RTO.

## D0-07 - CEP automático

- **Regra:** conveniência de UX, não bloqueador. Cadastro manual deve funcionar quando o serviço falhar.
- **Justificativa:** dependência externa não pode impedir cadastro.
- **Aceite:** endereço manual completo sem chamada externa; eventual autocomplete tem timeout/fallback.
- **Fora do escopo:** contratação ou SLA de provedor de CEP.
- **Impacto contratual:** não consta como requisito explícito na especificação.
- **Pendente cliente:** nenhuma para D0.

## D0-08 - WhatsApp

- **Regra:** backlog, fora do D0. Não integrar sem provedor, consentimento, LGPD, custos e casos de uso.
- **Justificativa:** integração externa e tratamento de dados exigem decisão própria.
- **Aceite D0:** nenhuma integração automática ativa ou prometida.
- **Fora do escopo:** todos os envios listados nas páginas 5-6.
- **Impacto contratual:** posterga requisito da especificação.
- **Pendente cliente:** provedor, base legal/consentimento, custo e casos de uso.

## D0-09 - Fiscal como stub honesto

- **Regra:** visível como “indisponível/em preparação”, sem emissão real e sem chave, protocolo, autorização, DANFE ou aparência fiscal válida. Focus NFe só em fase posterior após contratação/pagamento e configuração.
- **Justificativa:** impedir representação enganosa de autorização fiscal.
- **Aceite:** venda funciona com stub; tela identifica indisponibilidade; nenhum artefato parece NFC-e/NF-e autorizada; falha do stub não desfaz venda.
- **Fora do escopo:** SEFAZ, cancelamento, CC-e, inutilização, XML/DANFE e e-mail fiscal das páginas 5 e 8.
- **Impacto contratual:** posterga emissão fiscal real sem bloquear o piloto.
- **Pendente cliente:** contratação Focus e definição fiscal posterior.

## D0-10 - Relatórios e reconciliações

- **Regra:** obrigatórios: vendas por período; fechamento/movimentações de caixa; estoque atual; kardex; cancelamentos/devoluções; AP/AR se habilitados.
- **Reconciliações:** vendas concluídas = pagamentos; caixa = abertura + suprimentos + dinheiro - sangrias - devoluções/estornos em dinheiro; fechamento mostra esperado, contado e diferença; estoque = inicial + entradas - saídas ± ajustes; canceladas não entram no líquido; devoluções/estornos aparecem separados e reduzem totais; tela/relatório/exportação compartilham período, loja e status.
- **Justificativa:** relatório só é útil se reproduz as autoridades transacionais.
- **Aceite:** dataset controlado fecha todas as equações centavo a centavo e unidade a unidade; filtros retornam os mesmos IDs nos três canais.
- **Fora do escopo:** projeção financeira, curva ABC, inatividade e relatórios fiscais reais, salvo contratação posterior.
- **Impacto contratual:** define o subconjunto obrigatório das páginas 4, 5 e 7-8.
- **Pendente cliente:** confirmar se AP/AR estarão habilitados no piloto.

## Escopo fixo complementar

- Uma loja e canal web.
- Pagamentos: dinheiro, PIX, débito e crédito.
- Não transformar toda função do Bling em obrigação.
- Fora do D0: venda em espera, WhatsApp, multiempresa, inventário formal, Focus NFe real e CEP automático como bloqueador.


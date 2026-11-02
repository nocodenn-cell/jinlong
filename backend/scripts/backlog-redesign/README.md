# Backlog de redesign — concorrência

Scripts de concorrência retirados da primeira integração NF-e (fora da esteira financeira).
Conteúdo e histórico preservados por `git mv`.

- `ux04-oc-recebimento-concorrencia.sh`: recebimento de OC com duas sessões. Não é válido como
  está: usa `session_replication_role = replica` (linhas 35 e 75) e `DELETE` em
  `movimentos_estoque_log` (linha 37), contrariando a imutabilidade do kardex e as FKs NO ACTION.
  Remover o `replica` não basta: a limpeza precisa respeitar o kardex e os dados de teste.
- `nfe-concorrencia-confirmacao.sh`: confirmação de NF-e com duas sessões. Problemas já
  identificados: ausência de barreira real de concorrência, códigos de retorno das sessões
  pouco verificados, delta de estoque sujeito a interferência, sem `lock_timeout`, dependência de
  seed externo e resíduos permanentes de kardex.

Nenhum dos dois foi medido. Não reativar sem redesign e validação.

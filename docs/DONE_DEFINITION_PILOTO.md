# Done Definition — Piloto (FastProduct)

Checklist de fechamento objetivo para encerrar ciclo técnico com baixo risco.

## 1) Código e banco

- [ ] Migrations `032` a `038` aplicadas no ambiente de homologação alvo.
- [ ] `fiscal-worker` deployado e com secrets válidos.
- [ ] Sem erro de lint/build/test nos módulos alterados.

## 2) Testes e compatibilidade

- [ ] `pdv-importados`: suíte de testes verde.
- [ ] `pdv-local`: suíte de testes verde.
- [ ] `pdv-local`: build verde.
- [ ] Compatibilidade de pricing/carrinho validada entre web e desktop.

## 3) Operação e evidências

- [ ] `smoke_operacao_fluxo_completo.sql` executado sem erro.
- [ ] Gate operacional registrado (GO/NO_GO) com output SQL anexado.
- [ ] Ata de homologação anexada no PR/ticket.

## 4) Decisão fiscal para demo

- [ ] Modo fiscal da demo decidido e registrado:
  - [ ] `mock` controlado, ou
  - [ ] `http` real com provedor homologado.
- [ ] Plano de fallback para demo documentado.

## 5) Publicação e rollback

- [ ] Janela de publicação definida.
- [ ] Critérios de rollback definidos no release note.
- [ ] Responsável de monitoramento pós-release definido.

## Critério final

Somente marcar piloto como concluído quando todos os itens acima estiverem `[x]`.

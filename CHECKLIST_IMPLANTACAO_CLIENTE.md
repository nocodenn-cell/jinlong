# Checklist de Implantação — Dia 0 (Técnico)

**Responsável:** Técnico de implantação  
**Duração:** 1–2h  
**Sucesso:** Operador consegue fazer login e chegar na tela do PDV  

---

## Pré-requisitos

- [ ] Laptop/tablet do cliente recebido e testado (conexão, tela, teclado/mouse)
- [ ] Conexão de internet confirmada (mínimo 10 Mbps download)
- [ ] Acesso à conta Supabase de produção (chaves em `.env.local`)
- [ ] Suporte 24h ativado (telefone do CTO anotado)

---

## Instalação e Deploy

### 1. Abrir aplicação no navegador

```bash
# Informar ao cliente (produção canônica):
Acesse https://pdv-importados.vercel.app
# Domínio customizado do cliente, se já configurado na Vercel
```

**Guia de implantação / GO-LIVE:**
- Checklist em app: `/admin/implantacao`
- Certificação: [`GO_LIVE_CERTIFICATION_REPORT.md`](./GO_LIVE_CERTIFICATION_REPORT.md)
- Resumo executivo: [`GO_LIVE_EXECUTIVO_RESUMO.md`](./GO_LIVE_EXECUTIVO_RESUMO.md)
- Status final: [`docs/GO_LIVE_STATUS_FINAL.md`](./docs/GO_LIVE_STATUS_FINAL.md)
- Assinatura GO 09/08/2026: [`docs/GO_LIVE_ASSINATURA_2026-08-09.md`](./docs/GO_LIVE_ASSINATURA_2026-08-09.md)

- [ ] Página carrega em < 5 segundos
- [ ] Logo Jīn Lóng exibida sem erros
- [ ] Formulário de login visível

### 2. Configurar login operador

**Dados necessários:**
- Email operador: **um endereço real, que receba e-mail**
- Senha: [gerar aleatória 12+ caracteres]
- Nome da loja: [nome exato do cliente]

> ### ⚠️ Não use domínios `.test`, `.local` ou `example.com`
>
> São TLDs reservados: **nunca entregam e-mail**. Uma conta assim não consegue
> recuperar senha, e o cliente fica trancado para fora sem um administrador
> por perto. Use o domínio real do cliente ou um Gmail que ele controle.

> ### ⚠️ Criar usuário são **duas** escritas, não uma
>
> A versão anterior deste checklist mandava fazer `INSERT INTO auth.users` com
> hash de senha na mão. **Isso não funciona:** a inserção direta pula o que o
> GoTrue exige (`aud`, `role`, linha em `auth.identities`), então o login falha
> ou nasce quebrado — e, pior, **não cria a linha em `public.usuarios`**, onde
> vivem `perfil` e `loja_id`. Sem ela, o login até passa e **toda venda é
> recusada** com `FINALIZAR_VENDA_CANONICA_USUARIO_INVALIDO`.

**Passo A — identidade de autenticação.** Painel Supabase → *Authentication* →
*Add user* → *Create new user*, com **Auto Confirm User** ligado. Anote o `id`
(UUID) gerado.

Alternativa por API (mesma coisa, com `service_role`):

```js
await supabase.auth.admin.createUser({ email, password, email_confirm: true })
```

**Passo B — perfil da aplicação.** Com o UUID do passo A:

```sql
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo, idioma_preferido)
VALUES (
  '<uuid-do-passo-A>',
  'Nome da pessoa',
  'OPERADOR',                                    -- ou GERENTE / DONO
  'a0000001-0000-4000-8000-000000000001',        -- Matriz
  true,
  'pt'
);
```

Referência viva dos dois passos: `pdv-importados/scripts/seed-dev-users.mjs`
(`ensureAuthUser` + `upsertUsuario`).

- [ ] Passo A concluído — UUID anotado
- [ ] Passo B concluído — `perfil` e `loja_id` corretos
- [ ] Login consegue criar nova sessão
- [ ] Operador consegue fazer logout e login novamente
- [ ] **Operador consegue concluir uma venda** (prova que o passo B ficou certo)

### 3. Verificar dados iniciais

**Catálogo (produtos):**
- [ ] Mínimo 5 produtos cadastrados no `/admin/catalogo`
- [ ] Cada produto tem: código de barras, preço varejo, estoque inicial
- [ ] Preços em reais (ex.: 29.90)

**Clientes:**
- [ ] Mínimo 1 cliente "padrão" para vendas cash (não obrigatório vínculo)

**Caixa:**
- [ ] Turnista (operador) tem permissão de "abrir_caixa"
- [ ] Saldo inicial pré-definido (ex.: R$ 100 de "trocado")

- [ ] Todos 3 itens acima confirmados via SQL query ou UI

---

## Teste Funcional Rápido (15 min)

### Operador faz uma venda teste

1. **Login:** operador@loja.com.br / senha → clica "Entrar"
   - [ ] Redireciona para `/caixa`
   - [ ] Tela do PDV carrega (não está em branco)

2. **Abrir caixa:** Botão "Abrir caixa" em tela azul → insere saldo inicial (100)
   - [ ] Modal abre
   - [ ] Campo "Saldo inicial" aceita números
   - [ ] Clica "Confirmar"
   - [ ] Caixa abre; relógio aparece no topo

3. **Adicionar produto:** Escaneia código de barras (ex.: 7891234567890) ou digita no campo de busca
   - [ ] Produto aparece na linha do carrinho
   - [ ] Quantidade = 1, preço unitário visível
   - [ ] Carrinho mostra total atualizado

4. **Finalizar venda:** Clica "Finalizar" (botão azul grande)
   - [ ] Modal de pagamento abre
   - [ ] Forma "DINHEIRO" selecionada por padrão
   - [ ] Campo "Valor" mostra total da venda
   - [ ] Clica "Finalizar compra"
   - [ ] Mensagem "Venda finalizada com sucesso" exibida (verde)
   - [ ] Carrinho limpa; pronto para próxima venda

5. **Fechar caixa:** Menu "Operações" → "Fechar caixa"
   - [ ] Resumo de vendas do dia aparece
   - [ ] Saldo calculado (inicial + vendas)
   - [ ] Botão "Confirmar encerramento" fica ativo
   - [ ] Clica; caixa fecha
   - [ ] Página redireciona para login

- [ ] **Teste concluído sem erros**

---

## Verificação Pós-Teste

**Dados chegaram ao banco?**

```sql
SELECT COUNT(*) FROM vendas WHERE created_at >= NOW() - INTERVAL '1 hour';
-- Resultado esperado: >= 1 venda
```

- [ ] Venda teste está registrada
- [ ] Estoque foi reduzido (se produto é estoque-gerenciado)

**Auditoria:**

```sql
SELECT * FROM auditoria WHERE tipo = 'venda_finalizada' 
  ORDER BY created_at DESC LIMIT 1;
-- Resultado esperado: evento com id do operador e da venda
```

- [ ] Evento de auditoria registrado

---

## Sanidade Final

- [ ] Suporte 24h confirmado com operador (número, email)
- [ ] Qualquer dúvida **não é bloqueante**; CTO suporta em produção
- [ ] Operador treinou minimamente (1 venda real)
- [ ] Cliente assinou termo de aceite (go-live autorizado)

---

## Rollback (Se necessário)

Se a venda teste falhar **duas vezes**, retorna para staging:

1. Git checkout branch anterior
2. Vercel redeploy automático
3. CTO diagnostica issue
4. Re-tenta D+1

**Nunca forçar operador a fazer venda 1 com sistema instável.**

---

**Próximo passo:** Ir para [CHECKLIST_PRIMEIRO_DIA.md](CHECKLIST_PRIMEIRO_DIA.md)

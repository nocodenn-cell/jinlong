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
# Informar ao cliente:
Acesse https://jinlong-v1.vercel.app
# (ou domínio específico do cliente)
```

- [ ] Página carrega em < 5 segundos
- [ ] Logo Jīn Lóng exibida sem erros
- [ ] Formulário de login visível

### 2. Configurar login operador

**Dados necessários:**
- Email operador: `operador@loja.com.br`
- Senha: [gerar aleatória 12+ caracteres]
- Nome da loja: [nome exato do cliente]

**No painel Supabase (Vercel):**

```sql
-- Admin Supabase faz isso uma vez:
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES ('operador@loja.com.br', <hash>, now());

-- Depois habilitar login via email+senha em Auth → Providers
```

- [ ] Login consegue criar nova sessão
- [ ] Operador consegue fazer logout e login novamente

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

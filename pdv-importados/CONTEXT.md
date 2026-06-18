# Jīn Lóng — Contexto do Projeto

> Sistema de ponto de venda para lojas de importados, lojas chinesas e atacarejos no Brasil.
> Desenvolvido em 2026 com Next.js 15, Supabase e shadcn/ui.

---

## O Cliente

Proprietário de loja de importados — predominantemente comunidade chinesa no Brasil.
Características específicas:

- Vende produtos no **atacado e no varejo** na mesma loja
- Parte dos produtos **vem da China sem nota fiscal** (cadastro manual)
- Parte dos produtos tem nota fiscal (comprados no Brasil para revenda)
- O **dono prefere ler relatórios em mandarim**
- O **operador de caixa é brasileiro** e opera em português
- Pode ter 5.000 a 20.000 SKUs no catálogo
- Precisa que o sistema **funcione mesmo sem internet**

---

## O Problema que Resolvemos

Os ERPs disponíveis no Brasil foram construídos com compliance fiscal como centro.
Para esse cliente, isso é um obstáculo: menus complexos, campos obrigatórios de NF,
fluxos lentos. Nenhum sistema fala mandarim.

Nosso sistema inverte essa lógica:
- Produto sem nota é cidadão de primeira classe
- Atacado automático, invisível para o operador
- Interface limpa, sem menus desnecessários
- Bilíngue: PT para o caixa, ZH para o dono

---

## Os 4 Módulos do MVP

### 1. Produtos
Cadastro rápido (nome + preço = pronto), código de barras, origem do produto,
flag de nota fiscal, categorias com hierarquia simples.

### 2. Motor de Preço Atacado
Regras por produto ou por categoria. Faixas de quantidade com desconto
percentual ou valor fixo. Aplicação **automática e invisível** no carrinho.
Quando a quantidade cruza um limiar, **todos** os itens são recalculados.

### 3. PDV (Ponto de Venda)
Tela mínima. Scan → carrinho → pagamento. Tudo via teclado.
Badge verde "ATAC" quando atacado ativo. Cupom não fiscal impresso.
Controle completo de abertura e fechamento de caixa.

### 4. Relatórios
Vendas do dia, produtos mais vendidos, estoque baixo.
**Toggle PT/ZH** — o dono clica uma vez e vê tudo em mandarim.

---

## Decisões Técnicas Fundamentais

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Backend | Supabase | Banco + auth + RLS em minutos, sem servidor para gerenciar |
| Frontend | Next.js 15 App Router | Server Components + Server Actions = menos código |
| UI | shadcn/ui + Tailwind | Componentes que o dev owna, não depende de lib externa |
| Deploy | Vercel | Deploy em 30s, preview automático, SSL incluso |
| Offline | PWA + IndexedDB | Sem instalação, funciona sem internet |
| i18n | getMessages + `src/lib/i18n/*.json` | PT + ZH (en/es em fallback PT); zh-HK normalizado para zh. URLs sem prefixo de locale |
| Estado | Zustand (carrinho) | Simples, sem boilerplate, persistência fácil |

---

## Perfis de Usuário

| Perfil | Idioma | Pode fazer |
|--------|--------|-----------|
| OPERADOR | PT (fixo) | Abrir caixa, fazer venda, cancelar item |
| GERENTE | PT ou ZH | + configurar preços, aplicar desconto manual, ver relatórios |
| DONO | PT ou ZH | + criar usuários, ver tudo |

---

## Regras de Negócio Críticas

### Atacado — recalcular TUDO
Quando quantidade de um produto no carrinho muda e cruza uma faixa:
recalcular TODOS os itens daquele produto, não apenas o último.

**Exemplo:** 9 cabos a R$10 → adiciona 1 → sistema recalcula os 10 como R$8 cada.

### NF — alerta, não bloqueio
Se uma venda tem `tipo_venda = COM_NF` mas contém produtos com `tem_nf = false`,
o sistema exibe um alerta mas permite que o GERENTE prossiga.
Nunca bloquear a venda automaticamente.

### Prioridade de regra de preço
`Regra por produto` > `Regra por categoria` > `Preço varejo padrão`

### Desconto manual
Requer perfil GERENTE ou DONO + senha de confirmação.
Sempre registrado: quem aplicou, valor, motivo, timestamp.

---

## i18n — Arquivos de Tradução

Localização: `src/lib/i18n/pt.json` e `src/lib/i18n/zh.json`

O toggle de idioma fica no header do painel gerencial.
Preferência salva no campo `idioma_preferido` da tabela `usuarios` no Supabase.
A tela do PDV (caixa) não tem toggle — sempre em português.

---

## Mercado-Alvo

Este produto é feito para escalar no nicho de lojas de importados no Brasil:
- ~60.000 lojas de importados, utilidades e atacarejo no país
- Comunidade chinesa altamente conectada (indicação via WeChat)
- Preço: R$ 199/mês por loja, suporte via WhatsApp
- Canal: técnicos de TI locais (comissão) + demo presencial na Rua 25 de Março (SP)

---

## O que NÃO é o MVP

- ❌ Emissão de NF-e
- ❌ Integração com maquininha de cartão
- ❌ Multi-filial
- ❌ E-commerce
- ❌ Módulo financeiro
- ❌ CRM

Essas features são v2+. O código deve ser extensível, mas não implementado.

---

## Monorepo (fastproduct)

- **pdv-importados** (esta pasta): Next.js web — rotas **`/login`**, **`/caixa`**, **`/gerente/*`** sem prefixo de idioma na URL.
- **pdv-local**: Tauri + SQLite; sync via Edge `sync-outbox`. Não duplicar lógica de desktop dentro do Next.

## Setup Rápido

```bash
# 1. Clone e instale
git clone [repo]
cd pdv-importados
npm install

# 2. Configure o Supabase
cp .env.example .env.local
# Preencher NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Rode as migrations (CLI na pasta backend/ do monorepo)
cd ../backend
npx supabase db push
cd ../pdv-importados

# 3b. Auth + public.usuarios para dev/E2E (precisa SUPABASE_SERVICE_ROLE_KEY + SEED_DEV_PASSWORD no .env.local)
# npm run seed:dev-users   # ver docs/SEED_DEV_E2E.md

# 4. Gere os tipos TypeScript (opcional; ainda a partir de backend/)
cd ../backend
npx supabase gen types typescript --local > ../pdv-importados/lib/supabase/types.ts
cd ../pdv-importados

# 5. Inicie o dev
npm run dev

# 6. Smoke HTTP (outro terminal, com dev rodando)
npm run smoke:http
```

---

## Contato do Projeto

Sistema desenvolvido para o mercado brasileiro de lojas de importados.
Suporte ao usuário final via WhatsApp.
Deploy individual por cliente no Vercel + Supabase.

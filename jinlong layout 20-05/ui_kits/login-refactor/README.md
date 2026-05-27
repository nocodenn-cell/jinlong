# Login — refatoração para o design system Jīn Lóng

Substitui `pdv-importados/app/login/LoginForm.tsx`. Lógica de autenticação
**inalterada** (a função `login()` e o `destinoAposLogin()` são exatamente
os mesmos).

## O que mudou visualmente

| Antes | Depois |
|---|---|
| Container `bg-black` | `caixa-oriental-root` — gradiente noturno + bloom âmbar + nuvens radiais (token `--bg-page`) |
| Dragão sem animação | `dragon-hero-mark` — fade-rise + breathe loop (3.2s) já definidos em `components.css` |
| Wordmark estático | `dragon-hero-subtitle` — glow âmbar sutil (2.6s loop) |
| Form em bloco simples | `dragon-glass-card` — slate translúcido + `backdrop-filter: blur(18px)` + borda âmbar + inset top |
| Inputs sem ícones | Wrapper com `<Mail />` e `<Lock />` (Lucide) à esquerda, foco com ring âmbar |
| Botão sem ícone | `<LogIn />` + animação de translateX no hover, `<Loader2 />` girando durante loading |
| Mensagem de erro genérica | Caixa com border + bg vermelho translúcido + `aria-live="polite"` |
| Sem rodapé | `金龍 · ano` em Noto Serif SC, opacidade baixa |

## Drop-in

```
pdv-importados/app/login/LoginForm.tsx   ← SUBSTITUIR
```

Nenhuma mudança em `page.tsx`, `layout.tsx` ou nas chaves i18n existentes
(`m.login.email_placeholder`, `m.login.senha_placeholder`, `m.login.entrar`,
`m.login.entrando`, `m.login.sessao_inatividade`, `m.brand.logo_subtitle`).

## Acessibilidade

- Labels com `htmlFor` ligados aos inputs
- `autoComplete="username"` / `"current-password"` (gerenciadores de senha)
- `aria-busy` no botão durante loading
- `aria-live="polite"` no `<p role="alert">` de erro
- `aria-hidden` em todos os ícones decorativos (Lucide)
- Foco visível com `focus-visible:ring-2 ring-amber-400/60` (anel âmbar
  do design system)

## Responsividade

- Card: `max-w-[400px]` no desktop, `w-full` em mobile com padding lateral
- Padding interno: `p-7` mobile, `sm:p-8` desktop
- Hero 280×280 fixo (a vinheta já reduz visualmente em telas pequenas via
  CSS premium existente)
- `py-12 sm:py-16` para respiro vertical adaptativo

## Tema

A página força `data-app-theme="noturno"` no root — o login é o único
momento onde sempre ficamos no tema escuro (dragão dourado fica
muito mais forte). Se quiser respeitar a preferência do usuário (ex.:
quem sai do app no tema novem), remova o atributo e ele herda do
`<html>`.

## Assets esperados

- `/public/branding/brand-double-dragon.png` (já existe no repo)
- Fontes do design system carregadas globalmente (Noto Sans/Serif SC,
  Inter, Cinzel)

## Verificação manual

1. `pnpm dev` → abrir `/login`
2. Confirmar:
   - Fundo escuro com bloom dourado no topo, não preto chapado
   - Dragão flutua suavemente (3.2s) e brilha ao redor
   - Wordmark pulsa em âmbar
   - Inputs com ícone à esquerda + ring âmbar ao focar
   - Botão "Entrar" gradiente, ícone LogIn move-se 2px no hover
   - Clicar Entrar com credenciais ruins: caixa vermelha translúcida
   - Clicar com credenciais boas: loader gira, redireciona
3. Resize para 320px: card encolhe para `90%` e ícones continuam alinhados

---
name: jinlong-conversion-journey
description: Jornada comercial do Jinlong (home, demonstração, loja de teste de 15 dias, conversão) com limites de segurança e métricas. Use ao projetar CTAs, formulários, funil ou eventos do site.
---

# Jinlong · jornada de conversão

## Etapas
1 Home → 2 Funcionalidades → 3 Demonstração com dados fictícios → 4 Pedido de loja de teste → 5 Onboarding → 6 Teste de 15 dias → 7 Acompanhamento → 8 Assinatura.

## Estado atual (sprint 1)
Entregues: 1, 2 e a prévia do PDV. Contato por WhatsApp/WeChat via variáveis de ambiente.
NÃO implementar sem aprovação de segurança: cadastro público de lojas, provisionamento automático, pagamento, assinatura, tabela de leads.

## Regras
- Demonstração: somente dados fictícios e componentes isolados. Nunca Supabase, nunca `/demo-fluxo`, nunca dados de loja.
- Canais: `NEXT_PUBLIC_SITE_WHATSAPP_URL` (https://wa.me/…) e `NEXT_PUBLIC_SITE_WECHAT_ID`. Sem valor válido, o canal não aparece. Nunca inventar número, conta ou link.
- Canal principal por idioma: WhatsApp em pt-BR, WeChat em zh-CN.
- CTA único por tela dominante; texto diz o que acontece depois.
- Eventos de funil sem PII: visita, demo iniciada (primeiro clique no stepper), demo concluída, contato clicado.
- Metas numéricas só depois de uma linha de base medida.

## Provisionamento do teste
Manual pela equipe, com o wizard `/admin/provisionamento`. Automação exige: RLS, rate limit, LGPD, validação de entrada, revisão de segurança.

# Guia de Implantação — Web vs Desktop

Guia prático para alinhar **produto**, **implantação** e **onboarding técnico** no monorepo `fastproduct`.

Objetivo: definir claramente **quando usar `pdv-importados` (web)** e **quando usar `pdv-local` (desktop)**, evitando expectativa errada com cliente e reduzindo risco operacional.

---

## 1) Mensagem oficial do produto (usar com cliente)

- **Web (`pdv-importados`)**: gestão e operação online-first no navegador.
- **Desktop (`pdv-local`)**: operação de caixa crítica com continuidade local (offline-first) e sincronização posterior.
- **Modelo recomendado**: "Gerencie no navegador; venda sem parar no desktop."

### O que NÃO prometer

- Não prometer que o web cobre integralmente cenário offline crítico.
- Não misturar narrativa de "offline web completo" com operação de alta disponibilidade em loja.

---

## 2) Matriz de decisão rápida

| Critério | Web (`pdv-importados`) | Desktop (`pdv-local`) |
|---|---|---|
| Internet estável | Excelente | Bom |
| Internet instável/intermitente | Limitado | Excelente |
| Caixa de alto giro (fila constante) | Risco moderado | Recomendado |
| Necessidade de continuidade sem internet | Não recomendado como principal | Recomendado |
| Implantação rápida (sem instalar app) | Excelente | Requer setup local |
| Operação com múltiplos caixas físicos | Possível, mas sensível à rede | Recomendado |

---

## 3) Cenários padrão de loja (playbook comercial)

### Cenário A — Loja pequena, internet estável

- **Perfil**: baixo/médio volume, 1 caixa principal.
- **Recomendação**: **Web-first**.
- **Plano**:
  - Gestão e caixa no web.
  - Desktop opcional como contingência futura.

### Cenário B — Loja média, internet oscila

- **Perfil**: volume médio, 1-3 caixas, picos de movimento.
- **Recomendação**: **Híbrido**.
- **Plano**:
  - Gestão no web.
  - Caixa principal no desktop.
  - Caixa secundário pode iniciar em web e migrar para desktop conforme necessidade.

### Cenário C — Loja de alto giro, operação crítica

- **Perfil**: atacarejo/importados com fluxo intenso.
- **Recomendação**: **Desktop-first no caixa**.
- **Plano**:
  - Todos os caixas críticos no desktop.
  - Web para gestão, cadastros, relatórios e supervisão.

---

## 4) Roteiro de descoberta (perguntas obrigatórias antes de implantar)

1. Quantos caixas operam simultaneamente em horário de pico?
2. Qual o impacto financeiro de 10 minutos sem vendas?
3. Qual a qualidade real da internet na loja (incluindo horário de pico)?
4. Existe histórico de quedas de energia/rede?
5. A loja aceita operação degradada ou exige continuidade total?

### Regra de ouro

- Se a resposta para continuidade for "não pode parar", priorizar desktop no caixa.

---

## 5) Pacotes de implantação sugeridos

## Pacote 1 — Start Web

- Indicado para Cenário A.
- Entregas:
  - `pdv-importados` em produção.
  - Treinamento de login, operação de caixa web e fluxo gerente.
  - Checklist básico de monitoramento.

## Pacote 2 — Híbrido

- Indicado para Cenário B.
- Entregas:
  - Web para gestão.
  - Desktop em 1 caixa crítico.
  - Playbook de fallback de operação.

## Pacote 3 — Caixa Crítico

- Indicado para Cenário C.
- Entregas:
  - Desktop em caixas críticos.
  - Web para gestão central.
  - Rotina de sincronização e suporte operacional reforçado.

---

## 6) Onboarding do time interno (técnico/implantação)

## 6.1 Papéis e responsabilidades

- **Implantação**: aplica checklist por cenário e valida ambiente.
- **Suporte**: monitora sync, fila fiscal e falhas críticas.
- **Produto**: garante discurso consistente (web vs desktop).
- **Engenharia**: mantém contrato entre módulos e runbooks atualizados.

## 6.2 Checklist técnico mínimo por loja

- [ ] Projeto Supabase correto para o ambiente da loja.
- [ ] Secrets e envs revisados (`SYNC_*`, `NEXT_PUBLIC_*`, Edge secrets).
- [ ] Smoke de login (`/login`) com perfil gerente.
- [ ] Smoke de venda ponta a ponta no fluxo escolhido (web/desktop).
- [ ] Validação de sincronização e conferência de registros no backend.
- [ ] Plano de rollback documentado para a loja.

## 6.3 Critérios de aceite por cenário

- **Web-first**: venda web, fechamento de caixa, consulta de relatório sem erro crítico.
- **Híbrido**: venda desktop sincronizada com backend + gestão web funcionando.
- **Desktop-first**: operação contínua em caixa crítico + sincronização consistente após reconexão.

---

## 7) Script de comunicação (vendas/onboarding cliente)

- "Seu painel de gestão fica no navegador."
- "Para caixa que não pode parar, usamos desktop com operação local."
- "Se a internet oscilar, o caixa crítico continua vendendo e sincroniza depois."
- "Nossa recomendação depende do seu risco operacional, não só da preferência visual."

---

## 8) Erros comuns e como evitar

- **Erro**: implantar só web em loja com internet instável.
  - **Prevenção**: aplicar roteiro de descoberta e matriz antes do go-live.
- **Erro**: vendedor prometer offline completo no web.
  - **Prevenção**: usar mensagem oficial deste guia.
- **Erro**: ambientes/secrets misturados.
  - **Prevenção**: checklist técnico mínimo obrigatório.

---

## 9) Próximos passos recomendados

1. Validar este guia com Produto + Suporte + Comercial.
2. Transformar cenários A/B/C em card de qualificação no CRM.
3. Incluir este documento no ritual de kickoff de cada nova loja.

Documento relacionado:
- `docs/AMBIENTES_E_RELEASE.md`
- `docs/CIRCUITO_OPERACIONAL.md`
- `docs/P0_CHECKLIST_OPERACIONAL.md`

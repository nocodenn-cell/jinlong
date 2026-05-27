/* eslint-disable */
/* Findings data for the Plano de Melhorias report.
 * Each finding: { sev, lenses, title, where, before, after }
 * Section: { id, num, han, eyebrow, title, intro, findings }
 */

const SECTIONS = [
  {
    id: 'fundamentos',
    num: '02',
    han: '二',
    eyebrow: 'Fundamentos',
    title: 'Tokens, temas e a base que cola tudo',
    intro: 'A maior dívida do front hoje não está nas telas — está na camada de tokens. Os hardcodes de Tailwind (slate-* / amber-*) e os tokens shadcn não sincronizados com o DS Jīn Lóng tornam o tema Nuvem visualmente quebrado e fazem com que cada modal redescubra o cinza/borda/fonte do zero. Resolver isso primeiro multiplica o ROI de qualquer melhoria de tela.',
    findings: [
      {
        sev: 'critico',
        lenses: ['consistencia', 'visual'],
        title: 'Tema Nuvem vaza slate-escuro em todo o painel gerente',
        where: '~9 telas afetadas · diagnóstico em <code>ui_kits/theme-audit/AUDIT.md</code>',
        before: 'Mesmo com <code>data-app-theme="novem"</code>, KPIs, cards e fundo continuam slate-900. Só o header virou creme. Causa raiz: classes Tailwind hardcoded (<code>bg-slate-950/55</code>, <code>text-slate-300</code>) que ignoram os semantic tokens.',
        after: 'Aplicar a auditoria existente em 3 passos: <b>(1)</b> adicionar namespace <code>jl-*</code> ao tailwind.config, <b>(2)</b> re-mapear tokens shadcn (<code>--background</code>, <code>--card</code>) para os equivalentes Jīn Lóng no <code>globals.css</code>, <b>(3)</b> find-and-replace dos hardcodes para <code>bg-jl-surface</code>, <code>text-jl-fg-1</code> etc. Saída: tema troca suave em <em>todas</em> as rotas.'
      },
      {
        sev: 'alto',
        lenses: ['consistencia'],
        title: 'Inline styles com <code>rgba()</code> literais espalhados',
        where: 'modais de cliente, fornecedor, conta a pagar, estoque',
        before: 'Padrão recorrente: <code>style={{ background: \'rgba(15,23,42,0.68)\' }}</code> + <code>border: \'1px solid rgba(148,163,184,0.38)\'</code>. Cada modal redefine sua superfície — qualquer ajuste de marca vira caça aos arquivos.',
        after: 'Promover dois utilitários: <code>style={{ background: \'var(--surface-elev)\' }}</code> e <code>border: \'1px solid var(--border-1)\'</code>. Onde a frequência justificar, criar classes <code>.jl-glass-surface</code> e <code>.jl-glass-border</code> em <code>components.css</code> e remover os inline.'
      },
      {
        sev: 'alto',
        lenses: ['visual', 'consistencia'],
        title: 'Login usa "ouro luxury" que não existe no resto do app',
        where: '<code>ui_kits/login/index.html</code> — cores <code>#d4af37</code>, <code>#bfa76a</code>',
        before: 'A tela de login adota seu próprio dourado mais escuro/serif (Cinzel) — coerente com o tom cerimonial. Mas as cores são <em>hardcoded</em>, divergem do <code>--accent</code> do app (<code>#fbbf24</code>) e não respeitam tema.',
        after: 'Os tokens já existem: <code>--color-dragon-gold-cinzel</code> (<code>#bfa76a</code>) e <code>--color-dragon-gold-luxury</code> (<code>#d4af37</code>). Trocar todos os literais por essas vars. Documentar a regra: <b>"login = paleta luxury, app = paleta accent"</b>, e travar via lint.'
      },
      {
        sev: 'alto',
        lenses: ['visual', 'consistencia'],
        title: 'Recharts (relatório de vendas) ignora tema',
        where: '<code>relatorio-vendas-page/RelatorioVendasClient.tsx</code>',
        before: 'Tooltip com <code>background: \'rgba(2,6,23,0.95)\'</code>, barras <code>fill="#fbbf24"</code>. No tema Nuvem o tooltip aparece preto sobre fundo creme — totalmente fora da marca.',
        after: 'Substituir por <code>background: \'var(--surface-elev)\'</code>, <code>color: \'var(--fg-1)\'</code>, <code>fill: \'var(--accent)\'</code>. Mesmo princípio para qualquer Recharts futuro: <em>nenhum hex literal em chart code</em>.'
      },
      {
        sev: 'medio',
        lenses: ['visual'],
        title: 'Hierarquia tipográfica subutilizada',
        where: 'todos os títulos de página gerente',
        before: 'Páginas como <code>/gerente/clientes</code>, <code>/gerente/estoque</code> usam o mesmo <code>--font-size-2xl</code> bold para o título. Sem eyebrow tracked-out, sem subtitle. Resultado: difícil bater o olho e saber em que página está.',
        after: 'Adotar lockup de 3 linhas usado no caixa header: eyebrow uppercase tracked-out (<code>--letter-spacing-wide</code>) → título (<code>--font-size-3xl</code>) → subtitle em <code>var(--fg-2)</code>. Já é o padrão no hero do <code>/gerente</code>; estender para todas as páginas.'
      },
      {
        sev: 'medio',
        lenses: ['consistencia'],
        title: 'Modais sem padrão único',
        where: 'estoque (era <code>&lt;dialog&gt;</code> nativo cinza), cliente (glass), pagamento (glass), categorias (header diferente)',
        before: 'O modal de estoque legado usava <code>&lt;dialog&gt;</code> com <code>background: \'#fff\'</code> inline — completamente fora da marca. Mesmo entre os "novos" modais glass, cabeçalho, padding, e botão de fechar variam.',
        after: 'Extrair <code>&lt;DragonModal&gt;</code> reutilizável: glass card 12px radius, header com ícone âmbar + título + subtitle + close, footer com slot de ações. Documentar como o único caminho aceito para qualquer dialog.'
      }
    ]
  },

  {
    id: 'acessibilidade',
    num: '03',
    han: '三',
    eyebrow: 'Acessibilidade',
    title: 'Contraste, foco e respeito ao motion',
    intro: 'Operadores trabalham 8h+ em monitores de qualidade variável, com pouca luz no fundo da loja. Acessibilidade aqui é ergonomia, não conformidade WCAG por checklist. Foco visível, contraste real e respeito a <code>prefers-reduced-motion</code> entram no caminho crítico.',
    findings: [
      {
        sev: 'critico',
        lenses: ['a11y'],
        title: '<code>--fg-3</code> sobre <code>--surface-soft</code> falha contraste AA',
        where: 'metadados em cards, eyebrow uppercase, hint "vs. dia anterior"',
        before: 'A combinação atual (<code>#94a3b8</code> sobre <code>rgba(15,23,42,0.55)</code>) fica em ~3.1:1 — abaixo do mínimo 4.5:1 para texto pequeno. Ainda pior no Nuvem.',
        after: 'Elevar <code>--fg-3</code> em ambos os temas: noturno <code>#94a3b8</code> → <code>#a8b3c4</code>, novem <code>#475569</code> → <code>#3d4759</code>. Auditar os 4 usos onde o texto é &lt;13px e mover para <code>--fg-2</code> direto.'
      },
      {
        sev: 'alto',
        lenses: ['a11y', 'consistencia'],
        title: 'Anel de foco custom só aplicado em parte dos componentes',
        where: 'inputs em modais (cliente, fornecedor), botões secundários',
        before: 'O DS define um foco lindo: <code>0 0 0 2px surface, 0 0 0 4px accent/42%</code> — mas só vive em <code>.app-btn-accent</code>. Inputs em modais caem no <code>outline</code> default azul do Chrome.',
        after: 'Promover ring para utilitário base <code>.jl-focus-ring</code> + aplicar globalmente via <code>&lt;input&gt;:focus-visible</code>, <code>button:focus-visible</code> no <code>components.css</code>. Custo: ~30 linhas. ROI: app inteiro coerente no teclado.'
      },
      {
        sev: 'alto',
        lenses: ['a11y', 'ux'],
        title: 'Atalhos F8/F9/F10 não têm reforço visual ao serem pressionados',
        where: '<code>caixa/PaymentColumn.jsx</code>',
        before: 'O hint <code>(F8)</code> está no label, mas pressionar F8 só finaliza a venda — não há <em>highlight do botão</em>, nem confirmação tátil. Operadores novos não sabem que o atalho funcionou se chegou.',
        after: 'Adicionar <code>:focus</code> sincronizado: ao pressionar F8/F9/F10, o botão correspondente recebe a "amber bloom" + escala 0.98 por 120ms. Para leitor de tela, <code>aria-keyshortcuts="F8"</code> em cada botão.'
      },
      {
        sev: 'medio',
        lenses: ['a11y'],
        title: 'Toast custom rolado a mão sem <code>role</code>',
        where: '<code>caixa/index.html</code> linhas 88-108',
        before: 'O toast verde/vermelho usa <code>div</code> simples com <code>position: fixed</code>. Sem <code>role="status"</code> ou <code>role="alert"</code> — leitor de tela não anuncia "Venda finalizada". Fechamento via <code>setTimeout</code>; sem botão de dispensar.',
        after: 'Extrair <code>&lt;Toast&gt;</code> com <code>role="status"</code> (sucesso) ou <code>role="alert"</code> (erro), <code>aria-live="polite"</code>, ícone Lucide à esquerda, botão X opcional. Cores via <code>--success-bg</code> / <code>--danger-bg</code> (já existem nos tokens).'
      },
      {
        sev: 'medio',
        lenses: ['a11y', 'visual'],
        title: 'Animação <code>imperial-seal-breathe</code> não respeita reduced-motion',
        where: 'componente "印" (manager-approval)',
        before: 'O DS afirma que reduced-motion mata as animações, mas o seal-breathe roda em <code>animation: imperial-seal-breathe 1.8s infinite</code> sem guarda. Em dispositivos com motion reduzida fica piscando.',
        after: 'Envolver toda animação branded em <code>@media (prefers-reduced-motion: no-preference)</code>. Em motion reduzida, deixar só o destaque amber estático para indicar o estado "aguardando aprovação".'
      }
    ]
  },

  {
    id: 'caixa',
    num: '04',
    han: '四',
    eyebrow: 'Caixa · PDV',
    title: 'A tela que define o ritmo do dia',
    intro: 'O caixa é a única tela onde 1 segundo extra por venda × 200 vendas/dia × 30 dias = uma hora roubada do operador. Aqui o vetor de ganho não é estético — é redução de fricção no teclado e clareza no estado financeiro da venda em curso.',
    findings: [
      {
        sev: 'alto',
        lenses: ['ux', 'visual'],
        title: 'Total da venda compete com o resto da coluna',
        where: '<code>caixa/PaymentColumn.jsx</code>',
        before: 'O "Total: R$ 142,30" usa <code>--font-size-2xl</code> bold — mesma escala dos títulos de seção. Não há contagem de itens, subtotal vs descontos, nem dica de troco esperada.',
        after: 'Hierarquia em 3 níveis: <b>(1)</b> "TOTAL" eyebrow uppercase tracked-out, <b>(2)</b> número em <code>--font-size-5xl</code> + <code>tabular-nums</code> + peso 700 (não 900 — pesa demais), <b>(3)</b> linha auxiliar "3 itens · subtotal R$ 152,30 · desconto −R$ 10,00". A venda inteira lida em um olhar.'
      },
      {
        sev: 'alto',
        lenses: ['ux'],
        title: 'Sem ação de "desfazer" no remover item',
        where: '<code>caixa/CartList.jsx</code>',
        before: 'O botão de remover apaga a linha imediatamente. Em loja cheia, operador tira o item errado por acidente e precisa ler o código de barras de novo — interrompe a venda.',
        after: 'Soft-delete + toast "Item removido — desfazer (Ctrl+Z)" por 5s. Atalho <code>Ctrl+Z</code> mapeado para repor o último item removido. Custo de implementação trivial; reduz frustração diária.'
      },
      {
        sev: 'medio',
        lenses: ['ux', 'visual'],
        title: 'Sem rastro das últimas vendas para contexto do operador',
        where: 'caixa, lado da busca',
        before: 'Cada venda começa do zero. Operador não vê a venda anterior (útil para "ah, esse cliente esqueceu um item" ou validar troco).',
        after: 'Faixa lateral colapsável "Últimas 3 vendas" abaixo da busca: número, valor, método, hora. Re-imprimir cupom em um clique. Não obstrui o cart; serve como histórico passivo.'
      },
      {
        sev: 'medio',
        lenses: ['ux'],
        title: 'Busca não dá feedback de "estou procurando"',
        where: '<code>caixa/SearchBar.jsx</code>',
        before: 'Quando o operador bipa um EAN e o produto não está no catálogo, aparece só o toast vermelho. Sem indicação de "buscando…", sem destaque do campo, e o foco se mantém — mas o toast some em 2.2s.',
        after: 'Estado <code>searching</code> mostra spinner âmbar dentro do input + label "Buscando…". Erro vira microcopy <em>dentro</em> do próprio campo (e não toast) para que o operador veja sem desviar o olhar.'
      },
      {
        sev: 'medio',
        lenses: ['ux', 'a11y'],
        title: 'Sem campo de CPF/CNPJ e desconto explícitos',
        where: 'fluxo de finalização',
        before: 'Caixa atual finaliza direto em PIX/Cartão/Dinheiro. CPF na nota e descontos parecem entrar em modal separado (não visíveis no kit).',
        after: 'Dois chips persistentes acima dos botões de pagamento: "CPF na nota: —" e "Desconto: R$ 0,00". Clique abre modal compacto, F4/F5 como atalhos. Visibilidade contínua evita que o operador esqueça e tenha que cancelar/refazer.'
      },
      {
        sev: 'baixo',
        lenses: ['visual'],
        title: 'Han subtitle no item do carrinho aparece inconsistente',
        where: '<code>caixa/CartList.jsx</code>',
        before: 'Alguns itens mostram o nome chinês em cinza pequeno abaixo do PT, outros não — depende do mock. Visualmente parece bug de dados.',
        after: 'Regra explícita: <em>se</em> o operador está em PT, mostrar Han pequeno (<code>--font-size-xs</code>, <code>--fg-3</code>) abaixo. <em>Se</em> está em ZH, mostrar PT como subtitle. Bilinguismo é parte da marca — esconder uma das línguas perde força.'
      }
    ]
  },

  {
    id: 'gerente',
    num: '05',
    han: '五',
    eyebrow: 'Painel Gerente',
    title: 'Dashboard que respira: menos ruído, mais sinal',
    intro: 'O dashboard do gerente está bem composto — KPIs claros, sparkline com pico, painel de estoque crítico, feed. Os ganhos aqui são de <em>refinamento</em>: hierarquizar o delta, dar à atividade o espaço que ela pede, e abrir comparação temporal real.',
    findings: [
      {
        sev: 'alto',
        lenses: ['visual', 'ux'],
        title: 'Delta do KPI sem direção visual',
        where: '<code>gerente/KPICard.jsx</code>',
        before: 'Cards mostram "+12.4" ou "−1.2" como texto isolado. Em "Margem hoje −1.2" o sinal de menos perde força visual e o vermelho jade-imperial não distingue suficientemente "queda preocupante" vs "queda irrelevante".',
        after: 'Chip de delta com seta (▲ / ▼ / —), cor jade/imperial/cinza, e magnitude em <code>tabular-nums</code>. Para deltas &gt;10% adicionar negrito + sombra accent. Microcopy explícita "vs. ontem" dentro do chip, não em legenda solta abaixo.'
      },
      {
        sev: 'medio',
        lenses: ['ux', 'densidade'],
        title: 'Estoque crítico e feed competem por largura',
        where: '<code>ger-grid-2</code> no <code>index.html</code>',
        before: 'Grid 1:1 dá metade da tela para cada. Mas o feed contém eventos longos (frases de 80+ chars) e ações implícitas (clicar para abrir venda); estoque crítico é apenas uma lista densa de SKUs.',
        after: 'Reproporciona para 5:7 (estoque mais estreito, feed mais largo) ou empilha o feed largura cheia abaixo. Reorganização cosmética com forte impacto cognitivo: feed deixa de ser "lateral".'
      },
      {
        sev: 'medio',
        lenses: ['ux', 'visual'],
        title: 'Sparkline sem comparação histórica',
        where: '<code>gerente/Sparkline.jsx</code>',
        before: 'Curva intra-dia hoje, sozinha. Bonito mas pobre em decisão — gerente não sabe se "1480 às 14h" é alto, baixo ou normal para essa hora.',
        after: 'Sobrepor curva <em>fantasma</em> da semana anterior (mesma hora) em <code>color-mix(in srgb, var(--fg-3) 30%, transparent)</code>. Tooltip ao hover mostra "Hoje vs 7d atrás · +18%". Componente reusa o mesmo SVG, só adiciona segundo <code>&lt;path&gt;</code>.'
      },
      {
        sev: 'medio',
        lenses: ['ux'],
        title: 'Range de data limitado a "Hoje / 7d / 30d"',
        where: 'chips no header de <code>/gerente</code>',
        before: 'Três opções fixas. Não é possível ver "ontem" ou "este mês comparando ao anterior" sem deeplink.',
        after: 'Adicionar quarto chip "Personalizado" abrindo popover com calendário compacto (range pré-set: Ontem · Esta semana · Mês atual · Mês anterior · Personalizado). Persistir o range escolhido em URL — gerente cola link no WhatsApp e o sócio vê o mesmo.'
      },
      {
        sev: 'baixo',
        lenses: ['visual'],
        title: 'Header "Resumo da semana" sem ancoragem visual',
        where: 'seção secundária após KPIs do dia',
        before: 'Apenas o eyebrow <em>RESUMO DA SEMANA</em> tracked-out separa os dois grupos de cards. Em scroll rápido o gerente confunde com mais um KPI do dia.',
        after: 'Adicionar uma faixa fina horizontal acima do eyebrow + número da semana (ex: "S20 · 12–18 mai") em <code>--font-numeric</code> menor. Reforça que entrou em outra escala temporal.'
      }
    ]
  },

  {
    id: 'login',
    num: '06',
    han: '六',
    eyebrow: 'Login',
    title: 'O momento cerimonial — preservar, mas limpar',
    intro: 'O login é o único lugar do app onde o tom é deliberadamente lento e ceremônia — Cinzel, dragão respirando, fundo preto, ouro escuro. Vale preservar quase tudo. Os ajustes são pequenos mas necessários: tokens em vez de hex, micro-acessibilidade e estado de erro digno.',
    findings: [
      {
        sev: 'alto',
        lenses: ['a11y', 'visual'],
        title: 'Estado de erro de credenciais é um <code>&lt;p&gt;</code> solto',
        where: '<code>login/LoginForm.jsx</code> · classe <code>.login-premium-error</code>',
        before: 'Quando login falha, aparece "Credenciais inválidas." em <code>#fca5a5</code> centralizado. Sem ícone, sem foco no campo problemático, sem <code>aria-live</code>. Operador iniciante não sabe <em>qual</em> campo errou.',
        after: 'Mensagem dentro de uma faixa âmbar-imperial sutil com ícone <code>AlertCircle</code> Lucide, <code>aria-live="assertive"</code>, e foco programático no campo email. Texto: "E-mail ou senha incorretos · 邮箱或密码错误" (bilingue na falha de auth — operador ZH pode estar logando).'
      },
      {
        sev: 'medio',
        lenses: ['a11y'],
        title: 'Toggle de visualização de senha ausente',
        where: 'input <code>type="password"</code>',
        before: 'Padrão para login em ambiente compartilhado: ver a senha enquanto digita. Hoje não tem.',
        after: 'Botão ghost na ponta direita do underline com ícone <code>Eye</code> / <code>EyeOff</code>. Não quebra a estética minimalista — fica em <code>color-mix(in srgb, var(--color-dragon-gold-cinzel) 40%, transparent)</code>.'
      },
      {
        sev: 'medio',
        lenses: ['visual'],
        title: 'Drágão hero não tem fallback se a PNG falhar',
        where: '<code>login/DragonHero.jsx</code>',
        before: 'O <code>&lt;img&gt;</code> está nu — sem <code>alt</code> descritivo nem fallback. Se a CDN não responder (loja com wifi ruim), aparece quadrado vazio onde devia haver marca.',
        after: '<code>alt="Jīn Lóng — dragão dourado"</code>. Background fallback no <code>&lt;div&gt;</code> pai com gradient radial âmbar simulando o halo. Em rede ruim ainda parece intencional, não quebrado.'
      },
      {
        sev: 'baixo',
        lenses: ['visual'],
        title: 'Faixa de inatividade poderia ganhar Han',
        where: 'banner "Sua sessão expirou por inatividade"',
        before: 'Texto só em PT, mesmo idioma do app. Em uma loja com operadores ZH, eles batem o olho e demoram a entender.',
        after: 'Adicionar segunda linha menor em Han: "您的会话因不活动已过期 — 请重新登录". Mesma faixa, hierarquia clara, sem dobrar o ruído.'
      }
    ]
  },

  {
    id: 'admin',
    num: '07',
    han: '七',
    eyebrow: 'Páginas admin',
    title: 'Listas que pedem um <code>&lt;DataTable&gt;</code> compartilhado',
    intro: 'Clientes, fornecedores, estoque, contas a pagar, vendas, categorias — 6 listagens. Cada uma redescobriu seu header, filtros, paginação e linha-de-ação. Há ganho enorme em extrair um primitivo único e fazer todas as listas herdarem.',
    findings: [
      {
        sev: 'alto',
        lenses: ['consistencia', 'ux'],
        title: 'Seis listagens, seis convenções diferentes',
        where: 'clientes, fornecedores, estoque, contas-pagar, vendas, categorias',
        before: 'Cada lista escolheu: <code>cliente</code> tem busca + tabs; <code>fornecedor</code> tem barra de seleção em massa; <code>estoque</code> tem scroll infinito + toggle "abaixo do mínimo"; <code>contas-pagar</code> tem KPIs no topo. Cada uma também posiciona o botão "Novo" em lugar diferente.',
        after: 'Extrair <code>&lt;DataTablePage&gt;</code> com slots: <code>kpis</code> (opcional, topo), <code>filters</code> (sempre, em row), <code>bulkBar</code> (aparece com seleção), <code>table</code> (corpo), <code>pagination</code> (rodapé) ou <code>infiniteScroll</code>. Ação primária (Novo / Importar) sempre no canto sup-direito do header. 70% de cada Client.tsx some.'
      },
      {
        sev: 'alto',
        lenses: ['ux', 'a11y'],
        title: 'Sem estado de loading consistente — usa fallback "—"',
        where: 'todas as listagens',
        before: 'Enquanto o RPC carrega, vê-se a tabela vazia ou linhas com <code>—</code>. Não comunica "estou carregando" — comunica "está vazio".',
        after: 'Skeleton lines com gradient amber-soft shimmer, 6 linhas, mesma altura da row real. Token novo: <code>--shimmer-base</code>, <code>--shimmer-highlight</code>. Animação 1.4s, parada em reduced-motion.'
      },
      {
        sev: 'medio',
        lenses: ['ux'],
        title: 'Filtros sumiriam — sem chips persistentes que mostram o que está aplicado',
        where: 'estoque, vendas, contas-pagar',
        before: 'O usuário ativa "só abaixo do mínimo", rola, esquece. Volta amanhã estranhando "cadê os 200 SKUs?".',
        after: 'Logo abaixo da barra de filtros, row de chips fechaveis ("Só baixo ×", "Categoria: Chá ×"). Botão "Limpar tudo" se &gt;1 chip ativo. Persistir filtros em URL — link compartilhável.'
      },
      {
        sev: 'medio',
        lenses: ['visual'],
        title: 'Badges de status com paleta inventada por página',
        where: 'estoque ("Normal"/"Baixo"), contas-pagar ("Em dia"/"Vencido"/"Pago"), vendas ("Concluída"/"Cancelada")',
        before: 'Cada página escolheu suas próprias variações entre <code>app-badge-positive</code>, jade, imperial, e até cinza. Resultado: "verde" em três tons diferentes.',
        after: 'Quatro variantes canônicas: <code>positive</code> (jade), <code>warning</code> (âmbar), <code>danger</code> (imperial), <code>muted</code> (slate). Mapeamento explícito em <code>components.css</code> e tabela "use this badge for this state" no README do design system.'
      },
      {
        sev: 'baixo',
        lenses: ['ux'],
        title: 'Bulk actions sem confirmação destrutiva tematizada',
        where: 'fornecedores · "deletar selecionados"',
        before: '<code>confirm()</code> nativo do browser. Quebra completamente a estética glass.',
        after: 'Modal <code>&lt;DragonModal&gt;</code> variant="danger": header imperial-red, ícone <code>AlertTriangle</code>, contagem dos itens afetados em destaque, botão "Cancelar" ghost + "Excluir N fornecedores" imperial-red sólido. Mesmo padrão em todas as exclusões em massa.'
      }
    ]
  },

  {
    id: 'responsivo',
    num: '08',
    han: '八',
    eyebrow: 'Mobile & tablet',
    title: 'O caixa em tablet — hoje é uma promessa, não um caminho',
    intro: 'O kit é desktop-first; as overrides de hit-target em &lt;640px estão lá, mas a composição não. O dia em que um operador usar o caixa em tablet 10" (cenário real em lojas pequenas), o layout 7:3 não sobrevive.',
    findings: [
      {
        sev: 'alto',
        lenses: ['mobile', 'ux'],
        title: 'Caixa não tem variante tablet de fato',
        where: '<code>CaixaGridLayout.tsx</code>',
        before: 'A grid 7:3 colapsa para coluna única em mobile, mas em tablet a coluna de pagamento perde o destaque e fica abaixo do cart, longe da mão do operador.',
        after: 'Em &lt;1024px e &gt;640px (tablet): cart full-width com altura 60vh, coluna de pagamento <em>fixa no rodapé</em> como bottom-sheet expandível. Total sempre visível, botões PIX/Cartão/Dinheiro com hit-target ≥56px. Atalhos F8/F9/F10 viram tap targets reais.'
      },
      {
        sev: 'medio',
        lenses: ['mobile'],
        title: 'Gerente em mobile não tem nav',
        where: '<code>GerenteTopBar.jsx</code>',
        before: 'Top bar com nav horizontal funciona até 768px. Abaixo disso as links colidem ou somem (não há solução documentada).',
        after: 'Em &lt;768px: hamburger à esquerda → drawer Radix com mesma nav vertical, brand wordmark no topo do drawer, user/sign-out no rodapé. Padrão pronto para portar nos outros painéis.'
      },
      {
        sev: 'medio',
        lenses: ['mobile'],
        title: 'Modais glass perdem backdrop-blur em iOS Safari antigo',
        where: 'qualquer modal — Safari &lt;16',
        before: 'O <code>backdrop-filter: blur(18px)</code> é canon. Em Safari antigo cai pra sem-blur e o modal fica translúcido sobre conteúdo legível — quebra visual.',
        after: 'Fallback via <code>@supports not (backdrop-filter: blur(1px))</code>: surface opaca <code>--surface-elev-solid</code> (mais densa, ~92% opacity) sem perder o ar de glass. Documentar como "fallback solid".'
      }
    ]
  },

  {
    id: 'performance',
    num: '09',
    han: '九',
    eyebrow: 'Performance percebida',
    title: 'Loading que não parece quebrado',
    intro: 'O app é Tauri + Next; a maioria das telas é rápida. Mas <em>percebida</em> performance vive em outro lugar: skeletons, transições entre rotas, feedback de submit. Pequenas adições que mudam a sensação geral.',
    findings: [
      {
        sev: 'alto',
        lenses: ['perf', 'ux'],
        title: 'Submit de modal sem estado intermediário',
        where: 'modais de cliente, fornecedor, estoque',
        before: 'Operador clica "Salvar". Botão fica pressionado, depois talvez some o modal — sem indicação clara de "trabalhando". Em conexão lenta o operador clica de novo e cria duplicata.',
        after: 'Estado padrão: <code>idle</code> → <code>loading</code> (botão disable + spinner âmbar inline + texto "Salvando…") → <code>success</code> (check jade por 600ms antes de fechar) ou <code>error</code> (mensagem inline + foco no campo problemático).'
      },
      {
        sev: 'alto',
        lenses: ['perf', 'visual'],
        title: 'Transições entre rotas duras (flash de branco)',
        where: 'navegação em <code>/gerente/*</code>',
        before: 'Clicar de Clientes para Estoque mostra flash branco / fundo errado por ~120ms antes do conteúdo entrar — especialmente no Nuvem.',
        after: 'Layout persistente em <code>app/gerente/layout.tsx</code> com fundo já pintado (<code>bg-oriental-clouds</code>). Transição entre crianças com <code>view-transition-name</code> CSS nativo — fade 180ms easing default.'
      },
      {
        sev: 'medio',
        lenses: ['perf', 'mobile'],
        title: 'Splash do Tauri (pdv-local) usa logo genérico',
        where: 'pdv-local desktop bootstrap',
        before: 'Por ~1.5s ao abrir o desktop, vê-se a janela vazia branca antes do app montar.',
        after: 'Inserir <code>index.html</code> com dragon-hero + wordmark estáticos (sem React) no Tauri inicial. O usuário vê marca completa do segundo zero. Some quando React monta — sem flash.'
      }
    ]
  }
];

const EXEC_TILES = [
  {
    stat: '01',
    eyebrow: 'PRIORIDADE MÁXIMA',
    title: 'Fechar a dívida de tokens',
    body: 'Aplicar o <code>AUDIT.md</code> existente e remover hardcodes Tailwind/inline. Sem isso, todo refinamento de tela é desperdício — o Nuvem continua quebrado.'
  },
  {
    stat: '02',
    eyebrow: 'GANHO DIÁRIO',
    title: 'Caixa: hierarquia do total + undo',
    body: 'Total da venda em 3 níveis tipográficos e undo no remover item. Duas mudanças baratas que economizam segundos a cada venda — operador as sentirá no dia 1.'
  },
  {
    stat: '03',
    eyebrow: 'A11Y NÃO É OPCIONAL',
    title: '<code>--fg-3</code> + ring de foco global',
    body: 'Ajustar contraste de <code>fg-3</code> e promover o anel âmbar para foco global. Custo baixo, impacto em <em>todo</em> componente, atende WCAG AA.'
  },
  {
    stat: '04',
    eyebrow: 'CONSOLIDAÇÃO',
    title: '<code>&lt;DragonModal&gt;</code> + <code>&lt;DataTablePage&gt;</code>',
    body: 'Dois primitivos absorvem ~70% do código repetido de 6 telas admin. Saída: páginas novas em horas, não dias; comportamento consistente garantido.'
  },
  {
    stat: '05',
    eyebrow: 'POLIMENTO DA MARCA',
    title: 'Login com tokens luxury',
    body: 'Promover <code>#d4af37</code> / <code>#bfa76a</code> para <code>--color-dragon-gold-luxury</code> / <code>--cinzel</code> (já existem!). Estética intocada; manutenção limpa.'
  },
  {
    stat: '06',
    eyebrow: 'SINAL > RUÍDO',
    title: 'Sparkline com curva fantasma',
    body: 'Sobrepor semana anterior no sparkline. Mudança cosmética; ganho enorme na qualidade de decisão do gerente. Reutiliza o mesmo SVG.'
  }
];

const ROADMAP = [
  {
    eyebrow: 'SPRINT 1 · 1–2 SEMANAS',
    title: 'Fundamentos',
    sub: 'Refatoração silenciosa — usuário não vê, mas tudo depende',
    items: [
      '<b>Aplicar o AUDIT.md</b> (tailwind.config + theme-fix.css + find-replace)',
      '<b>Substituir hex hardcoded</b> no login (<code>#d4af37</code>, <code>#bfa76a</code>) por tokens existentes',
      '<b>Promover o anel de foco</b> âmbar para utilitário global',
      '<b>Corrigir contraste</b> de <code>--fg-3</code> em ambos os temas',
      '<b>Recharts</b> passa a usar <code>var(--accent)</code>, <code>var(--surface-elev)</code>',
      '<b>Auditoria de reduced-motion</b> — todas as 3 animações brand respeitam'
    ]
  },
  {
    eyebrow: 'SPRINT 2 · 2–3 SEMANAS',
    title: 'Caixa + Gerente',
    sub: 'Onde o ganho é visível e mensurável',
    items: [
      '<b>Hierarquia do total</b> + linha auxiliar (subtotal, desconto)',
      '<b>Undo remover item</b> + atalho Ctrl+Z',
      '<b>Toast com role/aria-live</b> usando tokens semânticos',
      '<b>F8/F9/F10 visual feedback</b> + <code>aria-keyshortcuts</code>',
      '<b>Delta KPI</b> com seta direcional + chip colorido',
      '<b>Sparkline com fantasma</b> da semana anterior',
      '<b>Range de data custom</b> com presets · persistido em URL'
    ]
  },
  {
    eyebrow: 'SPRINT 3 · 3–4 SEMANAS',
    title: 'Consolidação',
    sub: 'Primitivos compartilhados + suporte tablet',
    items: [
      '<b>&lt;DragonModal&gt;</b> reutilizável (header, glass, footer slots)',
      '<b>&lt;DataTablePage&gt;</b> com slots — refatorar as 6 listas para herdá-lo',
      '<b>Variante tablet do caixa</b> (cart full + payment bottom-sheet)',
      '<b>Drawer mobile</b> de navegação no gerente',
      '<b>Skeleton lines</b> com shimmer âmbar em todas listas',
      '<b>View Transitions</b> entre rotas do <code>/gerente</code>',
      '<b>Splash branded</b> no bootstrap do pdv-local (Tauri)'
    ]
  }
];

window.SECTIONS = SECTIONS;
window.EXEC_TILES = EXEC_TILES;
window.ROADMAP = ROADMAP;

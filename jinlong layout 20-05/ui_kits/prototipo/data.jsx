// data.jsx — mock data realista (mercadinho de importados BR, produtos chineses).
// Tudo em escopo global window.* para uso entre os scripts babel separados.

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n);
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-BR');
const fmtTime = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDateTime = (d) => `${fmtDate(d)} · ${fmtTime(d)}`;

// —— Catálogo de produtos (50 SKUs realistas) ————————————————
const PRODUTOS = [
  { sku: 'JL-0017', nome: 'Pulseira de jade — fio duplo',        han: '玉手镯',         categoria: 'Joias',       fornecedor: 'Hangzhou Jade Co.',   preco: 142.00, custo: 78.00,  estoque: 3,  minimo: 12, ncm: '7113.19.00' },
  { sku: 'JL-0091', nome: 'Sino de vento de bronze',             han: '黄铜风铃',       categoria: 'Decoração',    fornecedor: 'Yiwu Imports',         preco: 89.00,  custo: 42.00,  estoque: 2,  minimo: 8,  ncm: '8306.10.00' },
  { sku: 'JL-0142', nome: 'Taça de chá pintada à mão',           han: '手绘茶杯',       categoria: 'Cozinha',      fornecedor: 'Jingdezhen Ceramics',  preco: 38.00,  custo: 16.50, estoque: 64, minimo: 30, ncm: '6912.00.00' },
  { sku: 'JL-0166', nome: 'Pincel de caligrafia — lobo',         han: '狼毫毛笔',       categoria: 'Papelaria',    fornecedor: 'Anhui Brush Studio',   preco: 32.00,  custo: 11.00, estoque: 28, minimo: 20, ncm: '9603.30.00' },
  { sku: 'JL-0203', nome: 'Lanterna de papel vermelha',          han: '红纸灯笼',       categoria: 'Decoração',    fornecedor: 'Yiwu Imports',         preco: 24.50,  custo: 8.40,  estoque: 8,  minimo: 20, ncm: '9405.50.00' },
  { sku: 'JL-0214', nome: 'Leque de bambu pintado',              han: '竹折扇',         categoria: 'Decoração',    fornecedor: 'Suzhou Fan Atelier',   preco: 28.00,  custo: 9.80,  estoque: 41, minimo: 15, ncm: '6602.00.00' },
  { sku: 'JL-0288', nome: 'Incenso de sândalo (caixa 30 un.)',   han: '檀香',           categoria: 'Aromas',       fornecedor: 'Fujian Sandalwood',    preco: 18.90,  custo: 6.20,  estoque: 86, minimo: 40, ncm: '3307.41.00' },
  { sku: 'JL-0312', nome: 'Conjunto de pauzinhos — laca',        han: '漆筷子',         categoria: 'Cozinha',      fornecedor: 'Fuzhou Lacquerware',   preco: 22.00,  custo: 8.10,  estoque: 52, minimo: 25, ncm: '4419.90.00' },
  { sku: 'JL-0388', nome: 'Sache de chá pu-erh — 100 g',         han: '普洱茶饼',       categoria: 'Chás',         fornecedor: 'Yunnan Tea Co.',       preco: 64.00,  custo: 26.00, estoque: 22, minimo: 15, ncm: '0902.40.00' },
  { sku: 'JL-0401', nome: 'Gato da sorte 招财猫 — médio',         han: '招财猫',         categoria: 'Decoração',    fornecedor: 'Yiwu Imports',         preco: 49.00,  custo: 18.50, estoque: 19, minimo: 12, ncm: '9503.00.99' },
  { sku: 'JL-0501', nome: 'Bule de porcelana — dragão',          han: '龙纹瓷壶',       categoria: 'Cozinha',      fornecedor: 'Jingdezhen Ceramics',  preco: 89.00,  custo: 38.00, estoque: 4,  minimo: 10, ncm: '6911.10.00' },
  { sku: 'JL-0567', nome: 'Quimono kimono curto — feminino',     han: '短和服',         categoria: 'Vestuário',    fornecedor: 'Kyoto Atelier',        preco: 168.00, custo: 72.00, estoque: 12, minimo: 8,  ncm: '6204.43.00' },
  { sku: 'JL-0612', nome: 'Hashis de madeira — 10 pares',        han: '木筷子十双',     categoria: 'Cozinha',      fornecedor: 'Fuzhou Lacquerware',   preco: 14.00,  custo: 4.80,  estoque: 142,minimo: 50, ncm: '4419.90.00' },
  { sku: 'JL-0689', nome: 'Mala de seda — pingente',             han: '丝绸符袋',       categoria: 'Acessórios',   fornecedor: 'Suzhou Silk',          preco: 36.00,  custo: 12.40, estoque: 24, minimo: 18, ncm: '6307.90.90' },
  { sku: 'JL-0701', nome: 'Tigela ramen — porcelana azul',       han: '青花拉面碗',     categoria: 'Cozinha',      fornecedor: 'Jingdezhen Ceramics',  preco: 42.00,  custo: 17.20, estoque: 36, minimo: 20, ncm: '6911.10.00' },
  { sku: 'JL-0742', nome: 'Set de origami — 100 folhas',         han: '折纸百张',       categoria: 'Papelaria',    fornecedor: 'Tokyo Paper Co.',      preco: 26.00,  custo: 9.50,  estoque: 58, minimo: 30, ncm: '4823.90.00' },
  { sku: 'JL-0810', nome: 'Pincel para sumi-e — médio',          han: '水墨画笔',       categoria: 'Papelaria',    fornecedor: 'Anhui Brush Studio',   preco: 48.00,  custo: 19.00, estoque: 16, minimo: 15, ncm: '9603.30.00' },
  { sku: 'JL-0866', nome: 'Anel de jade verde — esculpido',      han: '玉戒指',         categoria: 'Joias',        fornecedor: 'Hangzhou Jade Co.',   preco: 218.00, custo: 96.00, estoque: 7,  minimo: 8,  ncm: '7113.19.00' },
  { sku: 'JL-0903', nome: 'Vela perfumada — flor de lótus',      han: '莲花香烛',       categoria: 'Aromas',       fornecedor: 'Fujian Sandalwood',    preco: 38.00,  custo: 14.00, estoque: 44, minimo: 25, ncm: '3406.00.00' },
  { sku: 'JL-0998', nome: 'Tapete tatami — 60×120',              han: '榻榻米垫',       categoria: 'Decoração',    fornecedor: 'Kyoto Atelier',        preco: 196.00, custo: 84.00, estoque: 6,  minimo: 5,  ncm: '5702.99.00' },
];

// —— Histórico de vendas ————————————————
const HOJE = new Date('2026-05-14T18:42:00');
const minutosAtras = (m) => new Date(HOJE.getTime() - m * 60 * 1000);

const VENDAS = [
  { id: 1209, data: minutosAtras(2),    operador: 'João Wei',     caixa: '01', itens: 3, total: 218.50, metodo: 'PIX',      status: 'concluida', cliente: null },
  { id: 1208, data: minutosAtras(6),    operador: 'João Wei',     caixa: '01', itens: 2, total: 142.30, metodo: 'PIX',      status: 'concluida', cliente: 'Cláudia Lin' },
  { id: 1207, data: minutosAtras(38),   operador: 'João Wei',     caixa: '01', itens: 4, total: 58.90,  metodo: 'Dinheiro', status: 'concluida', cliente: null },
  { id: 1206, data: minutosAtras(64),   operador: 'João Wei',     caixa: '01', itens: 1, total: 142.00, metodo: 'Cartão',   status: 'concluida', cliente: null },
  { id: 1205, data: minutosAtras(82),   operador: 'Mei Lin',      caixa: '02', itens: 6, total: 412.00, metodo: 'Cartão',   status: 'concluida', cliente: 'Bruno Oliveira' },
  { id: 1204, data: minutosAtras(105),  operador: 'Mei Lin',      caixa: '02', itens: 2, total: 76.00,  metodo: 'PIX',      status: 'cancelada', cliente: null },
  { id: 1203, data: minutosAtras(118),  operador: 'Mei Lin',      caixa: '02', itens: 1, total: 89.00,  metodo: 'Dinheiro', status: 'concluida', cliente: null },
  { id: 1202, data: minutosAtras(140),  operador: 'João Wei',     caixa: '01', itens: 8, total: 624.50, metodo: 'Crediário',status: 'concluida', cliente: 'Restaurante Sakura' },
  { id: 1201, data: minutosAtras(168),  operador: 'João Wei',     caixa: '01', itens: 3, total: 142.50, metodo: 'PIX',      status: 'concluida', cliente: null },
  { id: 1200, data: minutosAtras(192),  operador: 'Mei Lin',      caixa: '02', itens: 2, total: 96.50,  metodo: 'Dinheiro', status: 'concluida', cliente: null },
  { id: 1199, data: minutosAtras(218),  operador: 'Mei Lin',      caixa: '02', itens: 5, total: 318.00, metodo: 'Cartão',   status: 'devolvida', cliente: 'Ana Tanaka' },
  { id: 1198, data: minutosAtras(245),  operador: 'João Wei',     caixa: '01', itens: 1, total: 38.00,  metodo: 'PIX',      status: 'concluida', cliente: null },
  { id: 1197, data: minutosAtras(280),  operador: 'João Wei',     caixa: '01', itens: 4, total: 184.00, metodo: 'Cartão',   status: 'concluida', cliente: null },
  { id: 1196, data: minutosAtras(312),  operador: 'Mei Lin',      caixa: '02', itens: 2, total: 56.00,  metodo: 'Dinheiro', status: 'concluida', cliente: null },
  { id: 1195, data: minutosAtras(348),  operador: 'João Wei',     caixa: '01', itens: 3, total: 218.00, metodo: 'PIX',      status: 'concluida', cliente: 'Pedro Zhang' },
];

// Detail itens da venda 1208 (a usada como exemplo no drawer)
const VENDA_1208_ITENS = [
  { sku: 'JL-0142', nome: 'Taça de chá pintada à mão', han: '手绘茶杯', qty: 2, preco: 38.00 },
  { sku: 'JL-0501', nome: 'Bule de porcelana — dragão', han: '龙纹瓷壶', qty: 1, preco: 89.00 },
];

// —— Clientes ————————————————
const CLIENTES = [
  { id: 'cli-001', nome: 'Cláudia Lin',          tipo: 'PF', doc: '352.118.220-09', telefone: '(11) 9 8214-7711', email: 'claudia@example.com',   compras: 18, ultimaCompra: minutosAtras(6),    crediario: 0,       limite: 800,  status: 'ativo' },
  { id: 'cli-002', nome: 'Restaurante Sakura',   tipo: 'PJ', doc: '12.448.901/0001-22', telefone: '(11) 3814-6622', email: 'compras@sakura.com.br', compras: 64, ultimaCompra: minutosAtras(140),  crediario: 1842.30, limite: 5000, status: 'ativo' },
  { id: 'cli-003', nome: 'Ana Tanaka',           tipo: 'PF', doc: '188.302.610-44', telefone: '(11) 9 7012-3098', email: 'ana.tanaka@example.com', compras: 12, ultimaCompra: minutosAtras(218),  crediario: 318.00,  limite: 1000, status: 'ativo' },
  { id: 'cli-004', nome: 'Bruno Oliveira',       tipo: 'PF', doc: '402.118.901-55', telefone: '(11) 9 8902-1140', email: 'b.oliveira@example.com', compras: 6,  ultimaCompra: minutosAtras(82),   crediario: 0,       limite: 500,  status: 'ativo' },
  { id: 'cli-005', nome: 'Pedro Zhang',          tipo: 'PF', doc: '244.806.011-72', telefone: '(11) 9 9081-3344', email: 'pedro.z@example.com',    compras: 24, ultimaCompra: minutosAtras(348),  crediario: 142.00,  limite: 600,  status: 'ativo' },
  { id: 'cli-006', nome: 'Casa de Festas Lin',   tipo: 'PJ', doc: '08.214.661/0001-09', telefone: '(11) 4022-1180', email: 'eventos@lin.com.br',    compras: 32, ultimaCompra: minutosAtras(720),  crediario: 0,       limite: 3000, status: 'ativo' },
  { id: 'cli-007', nome: 'Mariko Sato',          tipo: 'PF', doc: '622.014.082-30', telefone: '(11) 9 9914-7711', email: 'mariko@example.com',     compras: 4,  ultimaCompra: minutosAtras(1440), crediario: 0,       limite: 400,  status: 'inativo' },
  { id: 'cli-008', nome: 'Templo Tian Hou',      tipo: 'PJ', doc: '22.044.182/0001-71', telefone: '(11) 3308-6622', email: 'admin@tianhou.org',     compras: 9,  ultimaCompra: minutosAtras(2880), crediario: 0,       limite: 2000, status: 'ativo' },
];

const EXTRATO_RESTAURANTE_SAKURA = [
  { data: minutosAtras(140),  tipo: 'compra',    desc: 'Venda #1202 · crediário 30d', valor: -624.50 },
  { data: minutosAtras(2880), tipo: 'compra',    desc: 'Venda #1144 · crediário 30d', valor: -842.00 },
  { data: minutosAtras(4320), tipo: 'pagamento', desc: 'PIX recebido',                valor: +1200.00 },
  { data: minutosAtras(5760), tipo: 'compra',    desc: 'Venda #1098 · crediário 30d', valor: -518.20 },
  { data: minutosAtras(7200), tipo: 'pagamento', desc: 'Boleto pago',                 valor: +1500.00 },
  { data: minutosAtras(10080),tipo: 'compra',    desc: 'Venda #1042 · crediário 30d', valor: -1382.60 },
];

// —— Fornecedores ————————————————
const FORNECEDORES = [
  { id: 'forn-001', nome: 'Yiwu Imports',          cnpj: '12.808.221/0001-08', categoria: 'Decoração',  contato: 'Wang Lei',     telefone: '+86 579 8540-1102', email: 'sales@yiwu-imports.cn', prazoMedio: 18, ultimaNFe: minutosAtras(72*60),     totalAno: 84200 },
  { id: 'forn-002', nome: 'Jingdezhen Ceramics',   cnpj: '08.114.622/0001-44', categoria: 'Cozinha',    contato: 'Liu Mei',      telefone: '+86 798 822-4407',  email: 'export@jdz-cer.cn',     prazoMedio: 24, ultimaNFe: minutosAtras(168*60),    totalAno: 62400 },
  { id: 'forn-003', nome: 'Hangzhou Jade Co.',     cnpj: '22.448.910/0001-72', categoria: 'Joias',      contato: 'Chen Hua',     telefone: '+86 571 8866-3301', email: 'hua@hz-jade.cn',        prazoMedio: 32, ultimaNFe: minutosAtras(360*60),    totalAno: 38900 },
  { id: 'forn-004', nome: 'Fujian Sandalwood',     cnpj: '14.602.218/0001-30', categoria: 'Aromas',     contato: 'Zhao Yang',    telefone: '+86 591 8714-2208', email: 'zhao@fj-sandal.cn',     prazoMedio: 16, ultimaNFe: minutosAtras(240*60),    totalAno: 18600 },
  { id: 'forn-005', nome: 'Yunnan Tea Co.',        cnpj: '08.722.114/0001-55', categoria: 'Chás',       contato: 'Lin Xiang',    telefone: '+86 871 6633-2280', email: 'lin@yn-tea.cn',         prazoMedio: 20, ultimaNFe: minutosAtras(96*60),     totalAno: 22400 },
  { id: 'forn-006', nome: 'Kyoto Atelier',         cnpj: '88.014.622/0001-09', categoria: 'Vestuário',  contato: 'Sato Hiro',    telefone: '+81 75 414-2208',   email: 'hiro@kyoto-atelier.jp', prazoMedio: 28, ultimaNFe: minutosAtras(480*60),    totalAno: 16800 },
  { id: 'forn-007', nome: 'Anhui Brush Studio',    cnpj: '02.114.806/0001-19', categoria: 'Papelaria',  contato: 'Wei Long',     telefone: '+86 551 6622-3088', email: 'wei@anhui-brush.cn',    prazoMedio: 22, ultimaNFe: minutosAtras(120*60),    totalAno: 9800 },
  { id: 'forn-008', nome: 'Suzhou Silk',           cnpj: '44.221.008/0001-62', categoria: 'Acessórios', contato: 'Tang Mei',     telefone: '+86 512 6314-2204', email: 'tang@suzhou-silk.cn',   prazoMedio: 26, ultimaNFe: minutosAtras(720*60),    totalAno: 7400 },
];

// —— NF-e ————————————————
const NFE_IMPORTS = [
  { id: 'nfe-220', numero: '000220', emissor: 'Yiwu Imports',         data: minutosAtras(72*60),  valor: 8240.00, itens: 48, status: 'processada',  divergencias: 0 },
  { id: 'nfe-219', numero: '000219', emissor: 'Jingdezhen Ceramics',  data: minutosAtras(168*60), valor: 4180.00, itens: 22, status: 'pendente',    divergencias: 3 },
  { id: 'nfe-218', numero: '000218', emissor: 'Fujian Sandalwood',    data: minutosAtras(240*60), valor: 1820.00, itens: 14, status: 'processada',  divergencias: 0 },
  { id: 'nfe-217', numero: '000217', emissor: 'Yunnan Tea Co.',       data: minutosAtras(96*60),  valor: 2240.00, itens: 18, status: 'erro',        divergencias: 5 },
  { id: 'nfe-216', numero: '000216', emissor: 'Anhui Brush Studio',   data: minutosAtras(120*60), valor: 980.00,  itens: 12, status: 'processada',  divergencias: 0 },
];

// Detail da NF-e 219 (a pendente — usada como exemplo)
const NFE_219_ITENS = [
  { sku: 'JL-0142', nome: 'Taça de chá pintada à mão',     han: '手绘茶杯',     qty: 12, preco: 16.50, match: 'ok' },
  { sku: 'JL-0701', nome: 'Tigela ramen — porcelana azul', han: '青花拉面碗',   qty: 8,  preco: 17.20, match: 'ok' },
  { sku: '— novo —', nome: 'Pote chinês — barro vermelho', han: '红陶罐',       qty: 6,  preco: 22.00, match: 'novo' },
  { sku: 'JL-0501', nome: 'Bule de porcelana — dragão',    han: '龙纹瓷壶',     qty: 4,  preco: 41.00, match: 'preco' },
];

// —— Usuários ————————————————
const USUARIOS = [
  { id: 'u-001', nome: 'M. Wei',        email: 'm.wei@jinlong.com.br',  papel: 'Gerente',  ultimo: minutosAtras(12),   ativo: true,  ips: 4 },
  { id: 'u-002', nome: 'João Wei',      email: 'joao@jinlong.com.br',   papel: 'Caixa',    ultimo: minutosAtras(6),    ativo: true,  ips: 1 },
  { id: 'u-003', nome: 'Mei Lin',       email: 'mei@jinlong.com.br',    papel: 'Caixa',    ultimo: minutosAtras(82),   ativo: true,  ips: 1 },
  { id: 'u-004', nome: 'Suporte TI',    email: 'ti@jinlong.com.br',     papel: 'Admin',    ultimo: minutosAtras(1440), ativo: true,  ips: 2 },
  { id: 'u-005', nome: 'Estagiário',    email: 'estagio@jinlong.com.br',papel: 'Caixa',    ultimo: minutosAtras(2880), ativo: false, ips: 0 },
];

const PAPEIS = ['Admin', 'Gerente', 'Caixa', 'Estoquista'];
const PERMISSOES = [
  { grupo: 'Caixa',    chave: 'abrir_caixa',       label: 'Abrir caixa',                      acesso: { Admin: true, Gerente: true,  Caixa: true,  Estoquista: false } },
  { grupo: 'Caixa',    chave: 'fechar_caixa',      label: 'Fechar caixa',                     acesso: { Admin: true, Gerente: true,  Caixa: true,  Estoquista: false } },
  { grupo: 'Caixa',    chave: 'sangria',           label: 'Realizar sangria',                 acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Caixa',    chave: 'cancelar_venda',    label: 'Cancelar venda finalizada',        acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Caixa',    chave: 'devolucao',         label: 'Aprovar devolução / troca',         acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Caixa',    chave: 'desconto_max',      label: 'Aplicar desconto > 10 %',           acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Estoque',  chave: 'editar_produto',    label: 'Editar produto',                   acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: true  } },
  { grupo: 'Estoque',  chave: 'ajustar_estoque',   label: 'Ajustar estoque manualmente',      acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: true  } },
  { grupo: 'Estoque',  chave: 'importar_nfe',      label: 'Importar NF-e',                    acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: true  } },
  { grupo: 'Financeiro', chave: 'ver_relatorios',  label: 'Ver relatórios',                   acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Financeiro', chave: 'exportar_sped',   label: 'Exportar SPED / arquivos fiscais', acesso: { Admin: true, Gerente: true,  Caixa: false, Estoquista: false } },
  { grupo: 'Admin',    chave: 'gerenciar_usuarios',label: 'Gerenciar usuários',               acesso: { Admin: true, Gerente: false, Caixa: false, Estoquista: false } },
  { grupo: 'Admin',    chave: 'editar_fiscal',     label: 'Editar configurações fiscais',     acesso: { Admin: true, Gerente: false, Caixa: false, Estoquista: false } },
];

// —— Financeiro ————————————————
const FINANCEIRO_DRE_MAIO = {
  receitaBruta:    192480.00,
  deducoes:        -18420.00,
  receitaLiquida:  174060.00,
  custoMercadoria: -78240.00,
  lucroBruto:      95820.00,
  despesasOper:    -32480.00, // aluguel, energia, pessoal
  despesasFin:     -1860.00,
  lucroLiquido:    61480.00,
};

const FLUXO_CATEGORIAS = [
  { cat: 'Vendas PIX',          valor:  88420.00, share: 46 },
  { cat: 'Vendas Cartão',       valor:  72380.00, share: 38 },
  { cat: 'Vendas Dinheiro',     valor:  18240.00, share:  9 },
  { cat: 'Vendas Crediário',    valor:  13440.00, share:  7 },
];

const DESPESAS_CATEGORIAS = [
  { cat: 'Aluguel',      valor: 12800 },
  { cat: 'Folha',        valor: 14200 },
  { cat: 'Energia/água', valor:  2280 },
  { cat: 'Marketing',    valor:  1800 },
  { cat: 'Outros',       valor:  1400 },
];

// 30-day faturamento mock
const SERIE_30D = [
  4820, 5210, 4640, 5980, 6420, 7140, 6820,
  5980, 6240, 5840, 7240, 8120, 8460, 7820,
  6420, 6840, 7240, 7980, 8240, 8640, 7920,
  7240, 6820, 7140, 7840, 8240, 8620, 8920,
  9180, 8740,
];

// —— Fechamento de caixa — turno atual ————————————————
const FECHAMENTO_RESUMO = {
  caixa: '01',
  operador: 'João Wei',
  abertura: new Date('2026-05-14T08:00:00'),
  saldoInicial: 150.00,
  vendas: 18,
  vendasTotal: 2480.50,
  metodos: [
    { tipo: 'Dinheiro', esperado: 320.50, contado: null },
    { tipo: 'PIX',      esperado: 1142.30, contado: 1142.30 },
    { tipo: 'Cartão',   esperado: 1018.20, contado: 1018.20 },
  ],
  sangrias: [
    { hora: new Date('2026-05-14T11:42:00'), valor: 200, motivo: 'Banco — depósito' },
    { hora: new Date('2026-05-14T14:18:00'), valor: 100, motivo: 'Troco — caixa 02' },
  ],
  suprimentos: [
    { hora: new Date('2026-05-14T13:00:00'), valor: 50, motivo: 'Troco adicional' },
  ],
};

// —— Atalhos / configurações ————————————————
const ATALHOS_F = [
  { tecla: 'F2',  acao: 'Abrir/focar busca de produto' },
  { tecla: 'F3',  acao: 'Aplicar desconto' },
  { tecla: 'F4',  acao: 'Selecionar cliente' },
  { tecla: 'F5',  acao: 'Sangria / Suprimento' },
  { tecla: 'F6',  acao: 'Devolução' },
  { tecla: 'F8',  acao: 'Pagar com PIX' },
  { tecla: 'F9',  acao: 'Pagar com cartão' },
  { tecla: 'F10', acao: 'Pagar com dinheiro' },
  { tecla: 'F12', acao: 'Finalizar venda' },
  { tecla: 'Esc', acao: 'Cancelar / fechar modal' },
];

// expose
Object.assign(window, {
  fmtBRL, fmtNum, fmtDate, fmtTime, fmtDateTime, minutosAtras,
  PRODUTOS, VENDAS, VENDA_1208_ITENS,
  CLIENTES, EXTRATO_RESTAURANTE_SAKURA,
  FORNECEDORES,
  NFE_IMPORTS, NFE_219_ITENS,
  USUARIOS, PAPEIS, PERMISSOES,
  FINANCEIRO_DRE_MAIO, FLUXO_CATEGORIAS, DESPESAS_CATEGORIAS, SERIE_30D,
  FECHAMENTO_RESUMO,
  ATALHOS_F,
  HOJE,
});

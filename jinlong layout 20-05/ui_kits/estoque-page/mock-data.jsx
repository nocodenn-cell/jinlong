// mock-data.jsx — 25 produtos com estoques variados (alguns críticos, alguns ok).

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n);
const fmtDateTime = (s) => new Date(s).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
const fmtRelative = (s) => {
  const ms = Date.now() - new Date(s).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  const M = Math.floor(d / 30);
  return `há ${M} m`;
};
const skuCurto = (id) => id.replace(/-/g, '').slice(-6).toUpperCase();

const CATEGORIAS = [
  { id: 'cat-joias',     nome: 'Joias' },
  { id: 'cat-decor',     nome: 'Decoração' },
  { id: 'cat-cozinha',   nome: 'Cozinha' },
  { id: 'cat-papelaria', nome: 'Papelaria' },
  { id: 'cat-aromas',    nome: 'Aromas' },
  { id: 'cat-chas',      nome: 'Chás' },
  { id: 'cat-vest',      nome: 'Vestuário' },
  { id: 'cat-acess',     nome: 'Acessórios' },
];

const MOTIVOS = [
  { value: 'ENTRADA_NFE',        label: 'Entrada por NF-e',         tipo: 'in' },
  { value: 'ENTRADA_MANUAL',     label: 'Entrada manual',           tipo: 'in' },
  { value: 'COMPRA',             label: 'Entrada por compra',       tipo: 'in' },
  { value: 'DEVOLUCAO_CLIENTE',  label: 'Devolução de cliente',     tipo: 'in' },
  { value: 'SAIDA_VENDA',        label: 'Saída por venda',          tipo: 'out' },
  { value: 'PERDA',              label: 'Perda',                    tipo: 'out' },
  { value: 'QUEBRA',             label: 'Quebra / avaria',          tipo: 'out' },
  { value: 'TRANSFERENCIA',      label: 'Transferência entre lojas',tipo: 'out' },
  { value: 'ACERTO_INVENTARIO',  label: 'Acerto de inventário',     tipo: 'adj' },
  { value: 'OUTRO',              label: 'Outro',                    tipo: 'adj' },
];

const _produtos = [
  { sku:'JL-0017', nome:'Pulseira de jade — fio duplo',          han:'玉手镯',     ean:'7891234500017', cat:'cat-joias',     atual:3,   min:12, custo:78.00 },
  { sku:'JL-0091', nome:'Sino de vento de bronze',               han:'黄铜风铃',   ean:'7891234500091', cat:'cat-decor',     atual:2,   min:8,  custo:42.00 },
  { sku:'JL-0142', nome:'Taça de chá pintada à mão',             han:'手绘茶杯',   ean:'7891234500142', cat:'cat-cozinha',   atual:64,  min:30, custo:16.50 },
  { sku:'JL-0166', nome:'Pincel de caligrafia — lobo',           han:'狼毫毛笔',   ean:'7891234500166', cat:'cat-papelaria', atual:28,  min:20, custo:11.00 },
  { sku:'JL-0203', nome:'Lanterna de papel vermelha',            han:'红纸灯笼',   ean:'7891234500203', cat:'cat-decor',     atual:8,   min:20, custo:8.40 },
  { sku:'JL-0214', nome:'Leque de bambu pintado',                han:'竹折扇',     ean:'7891234500214', cat:'cat-decor',     atual:41,  min:15, custo:9.80 },
  { sku:'JL-0288', nome:'Incenso de sândalo (caixa 30 un.)',     han:'檀香',       ean:'7891234500288', cat:'cat-aromas',    atual:86,  min:40, custo:6.20 },
  { sku:'JL-0312', nome:'Conjunto de pauzinhos — laca',          han:'漆筷子',     ean:'7891234500312', cat:'cat-cozinha',   atual:52,  min:25, custo:8.10 },
  { sku:'JL-0388', nome:'Sache de chá pu-erh — 100 g',           han:'普洱茶饼',   ean:'7891234500388', cat:'cat-chas',      atual:22,  min:15, custo:26.00 },
  { sku:'JL-0401', nome:'Gato da sorte 招财猫 — médio',           han:'招财猫',     ean:'7891234500401', cat:'cat-decor',     atual:19,  min:12, custo:18.50 },
  { sku:'JL-0501', nome:'Bule de porcelana — dragão',            han:'龙纹瓷壶',   ean:'7891234500501', cat:'cat-cozinha',   atual:4,   min:10, custo:38.00 },
  { sku:'JL-0567', nome:'Quimono kimono curto — feminino',       han:'短和服',     ean:'7891234500567', cat:'cat-vest',      atual:12,  min:8,  custo:72.00 },
  { sku:'JL-0612', nome:'Hashis de madeira — 10 pares',          han:'木筷子十双', ean:'7891234500612', cat:'cat-cozinha',   atual:142, min:50, custo:4.80 },
  { sku:'JL-0689', nome:'Mala de seda — pingente',               han:'丝绸符袋',   ean:'7891234500689', cat:'cat-acess',     atual:24,  min:18, custo:12.40 },
  { sku:'JL-0701', nome:'Tigela ramen — porcelana azul',         han:'青花拉面碗', ean:'7891234500701', cat:'cat-cozinha',   atual:36,  min:20, custo:17.20 },
  { sku:'JL-0742', nome:'Set de origami — 100 folhas',           han:'折纸百张',   ean:'7891234500742', cat:'cat-papelaria', atual:58,  min:30, custo:9.50 },
  { sku:'JL-0810', nome:'Pincel para sumi-e — médio',            han:'水墨画笔',   ean:'7891234500810', cat:'cat-papelaria', atual:16,  min:15, custo:19.00 },
  { sku:'JL-0866', nome:'Anel de jade verde — esculpido',        han:'玉戒指',     ean:'7891234500866', cat:'cat-joias',     atual:7,   min:8,  custo:96.00 },
  { sku:'JL-0903', nome:'Vela perfumada — flor de lótus',        han:'莲花香烛',   ean:'7891234500903', cat:'cat-aromas',    atual:44,  min:25, custo:14.00 },
  { sku:'JL-0998', nome:'Tapete tatami — 60×120',                han:'榻榻米垫',   ean:'7891234500998', cat:'cat-decor',     atual:6,   min:5,  custo:84.00 },
  { sku:'JL-1024', nome:'Chá oolong premium — lata 50 g',        han:'乌龙茶罐',   ean:'7891234501024', cat:'cat-chas',      atual:3,   min:10, custo:34.00 },
  { sku:'JL-1108', nome:'Camisa cheongsam — masculina',          han:'唐装',       ean:'7891234501108', cat:'cat-vest',      atual:14,  min:6,  custo:88.00 },
  { sku:'JL-1199', nome:'Caderno costurado à mão — washi',       han:'和纸笔记本', ean:'7891234501199', cat:'cat-papelaria', atual:30,  min:20, custo:15.50 },
  { sku:'JL-1244', nome:'Brincos de prata — flor de cerejeira',  han:'樱花耳环',   ean:'7891234501244', cat:'cat-joias',     atual:9,   min:12, custo:62.00 },
  { sku:'JL-1310', nome:'Difusor de bambu — verbena',            han:'竹香薰',     ean:'7891234501310', cat:'cat-aromas',    atual:21,  min:18, custo:22.00 },
];

const HOJE = Date.now();
const horasAtras = (h) => new Date(HOJE - h * 3600 * 1000).toISOString();
const diasAtras  = (d) => new Date(HOJE - d * 86400 * 1000).toISOString();

const MOCK_ESTOQUE = _produtos.map((p, i) => ({
  id: uuid(),
  sku: p.sku,
  nome: p.nome,
  han: p.han,
  codigo_barras: p.ean,
  categoria_id: p.cat,
  categoria_nome: CATEGORIAS.find(c => c.id === p.cat)?.nome,
  unidade_medida: 'UN',
  custo: p.custo,
  quantidade_atual: p.atual,
  estoque_minimo: p.min,
  ultima_movimentacao: i % 3 === 0 ? horasAtras(3 + i) :
                       i % 3 === 1 ? horasAtras(36 + i * 3) :
                       diasAtras(7 + i),
  ultimo_motivo: [
    'SAIDA_VENDA', 'ENTRADA_NFE', 'ACERTO_INVENTARIO',
    'SAIDA_VENDA', 'ENTRADA_NFE', 'COMPRA',
  ][i % 6],
}));

function exportarCsv(produtos) {
  const cabecalho = ['SKU','Produto','EAN','Categoria','Atual','Mínimo','Status','Última movimentação'];
  const linhas = produtos.map((p) => {
    const status = p.quantidade_atual <= p.estoque_minimo ? 'BAIXO' : 'OK';
    return [
      p.sku, p.nome, p.codigo_barras, p.categoria_nome,
      p.quantidade_atual, p.estoque_minimo, status,
      new Date(p.ultima_movimentacao).toISOString(),
    ];
  });
  const csv = [cabecalho, ...linhas]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jinlong-estoque-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

Object.assign(window, {
  uuid, fmtBRL, fmtNum, fmtDateTime, fmtRelative, skuCurto,
  CATEGORIAS, MOTIVOS, MOCK_ESTOQUE, exportarCsv,
});

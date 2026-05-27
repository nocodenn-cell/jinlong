// mock-data.jsx — 30 contas a pagar, mix de NF-e e lançamentos manuais.

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n);
const fmtDate = (s) => new Date(s).toLocaleDateString('pt-BR');
const fmtMonth = (s) => {
  const d = new Date(s);
  return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const fmtRelativoVenc = (iso) => {
  const ms = new Date(iso).getTime() - Date.now();
  const dias = Math.round(ms / 86400000);
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  if (dias === -1) return 'venceu ontem';
  if (dias > 1) return `em ${dias} d`;
  return `há ${Math.abs(dias)} d`;
};

const HOJE = new Date('2026-05-20T10:00:00').getTime();
const diasOffset = (d) => new Date(HOJE + d * 86400000).toISOString();

// Lista de fornecedores espelha o que usamos em fornecedores-page
const FORNECEDORES_NOMES = [
  'Yiwu Imports Brasil', 'Jingdezhen Ceramics Ltda.', 'Hangzhou Jade Co. BR',
  'Fujian Sandalwood', 'Yunnan Tea Co.', 'Kyoto Atelier do Brasil',
  'Anhui Brush Studio', 'Suzhou Silk Imports', 'Shenzhen Tech BR',
  'Embalagens Liberdade', 'Distribuidora Oriental Ltda.', 'Refrigerantes São Paulo',
  'Logística Bashō Express',
];

const FORMAS = [
  { id: 'DINHEIRO', label: 'Dinheiro', glyph: '¥' },
  { id: 'PIX',      label: 'PIX',      glyph: '⟁' },
  { id: 'CARTAO',   label: 'Cartão',   glyph: '▭' },
  { id: 'BOLETO',   label: 'Boleto',   glyph: '⫶' },
  { id: 'TRANSF',   label: 'Transferência', glyph: '↔' },
];

const _seed = [
  // [fornecedor, descricao, valor, dias_venc, valor_pago_pct, nfe_numero]
  // Em aberto / pendentes
  ['Yiwu Imports Brasil',         'NF-e #000220 · pedido 84 itens',          8240.00, +12, 0, '000220'],
  ['Jingdezhen Ceramics Ltda.',   'NF-e #000219 · porcelana azul',           4180.00, +5,  0, '000219'],
  ['Embalagens Liberdade',        'Sacolas plásticas — pedido mensal',        680.00,  -2, 0, null],
  ['Logística Bashō Express',     'Frete contêiner CN-BR · semana 19',       2840.00, +18, 0, null],
  ['Refrigerantes São Paulo',     'Pedido bebidas — mai/2026',               1240.00,  +3, 0, null],
  // Parcialmente pagas
  ['Hangzhou Jade Co. BR',        'NF-e #000218 · jade premium',             6420.00, +25, 0.40, '000218'],
  ['Distribuidora Oriental Ltda.','Pedido decoração diversa',                2180.00, -5, 0.50, null],
  // Pagas
  ['Yunnan Tea Co.',              'NF-e #000217 · chá pu-erh',               2240.00, -8,  1.00, '000217'],
  ['Anhui Brush Studio',          'NF-e #000216 · pincéis caligrafia',        980.00, -12, 1.00, '000216'],
  ['Fujian Sandalwood',           'NF-e #000215 · incenso 30un caixas',     1820.00, -18, 1.00, '000215'],
  ['Suzhou Silk Imports',         'Lote primavera 2026',                     3640.00, -22, 1.00, null],
  ['Shenzhen Tech BR',            'Caixas registradoras — manutenção',       1200.00, -28, 1.00, null],
  // Atrasadas
  ['Kyoto Atelier do Brasil',     'NF-e #000214 · kimonos sob encomenda',    5280.00, -15, 0, '000214'],
  ['Embalagens Liberdade',        'Etiquetas adesivas — extra',               320.00, -8,  0, null],
  // Mais pendentes para encher
  ['Yiwu Imports Brasil',         'Pedido 92 — boas-vindas verão',           3420.00, +28, 0, null],
  ['Jingdezhen Ceramics Ltda.',   'NF-e #000213 · tigelas ramen',            2880.00, +35, 0, '000213'],
  ['Hangzhou Jade Co. BR',        'Lote anéis esculpidos',                   4480.00, +42, 0, null],
  ['Distribuidora Oriental Ltda.','Pedido gato-da-sorte 招财猫',              860.00, +45, 0, null],
  ['Yunnan Tea Co.',              'NF-e #000212 · chá premium',              3220.00, +50, 0, '000212'],
  ['Anhui Brush Studio',          'Tintas e papéis arroz',                   1620.00, +14, 0, null],
  ['Logística Bashō Express',     'Frete contêiner — semana 20',             2960.00, +21, 0, null],
  ['Refrigerantes São Paulo',     'Pedido bebidas — jun/2026',               1180.00, +28, 0, null],
  ['Yiwu Imports Brasil',         'Pedido 95 — lanternas festival',          1420.00, +35, 0, null],
  ['Embalagens Liberdade',        'Embalagens premium personalizadas',        980.00, +21, 0, null],
  ['Shenzhen Tech BR',            'Maquininha cartão substituição',          2240.00, +60, 0, null],
  // Canceladas
  ['Kyoto Atelier do Brasil',     'Pedido cancelado por divergência',         620.00, +20, 0, null, 'CANCELADO'],
  // Parcialmente pagas — mais
  ['Suzhou Silk Imports',         'NF-e #000211 · seda crua',                3920.00, -3, 0.65, '000211'],
  ['Distribuidora Oriental Ltda.','Pedido aromas variados',                   840.00, +8, 0.30, null],
  // Mais NF-e
  ['Jingdezhen Ceramics Ltda.',   'NF-e #000210 · bules dragão',             2240.00, -10, 1.00, '000210'],
  ['Fujian Sandalwood',           'NF-e #000209 · velas lótus',              1480.00, -25, 1.00, '000209'],
];

const MOCK_CONTAS = _seed.map((s) => {
  const [forn, desc, valor, diasVenc, pctPago, nfeN, statusForcado] = s;
  const venc = diasOffset(diasVenc);
  const pago = Math.round(valor * pctPago * 100) / 100;
  let status;
  if (statusForcado) status = statusForcado;
  else if (pago >= valor - 0.001) status = 'PAGO';
  else if (pago > 0) status = 'PARCIAL';
  else if (diasVenc < 0) status = 'ATRASADO';
  else status = 'PENDENTE';

  return {
    id: uuid(),
    fornecedor_id: uuid(),
    fornecedor_nome: forn,
    descricao: desc,
    valor_total: valor,
    valor_pago: pago,
    vencimento: venc,
    status,
    nfe_numero: nfeN,
    nfe_importacao_id: nfeN ? uuid() : null,
    criado_em: diasOffset(diasVenc - 30),
    pagamentos: pago > 0 ? [{
      id: uuid(),
      valor: pago,
      forma: ['PIX','BOLETO','TRANSF'][Math.floor(Math.random()*3)],
      data: diasOffset(Math.min(diasVenc - 2, -1)),
      observacao: null,
    }] : [],
  };
});

function exportarCsv(contas) {
  const cab = ['Fornecedor','Descrição','Vencimento','Valor total','Valor pago','Em aberto','Status','NF-e'];
  const linhas = contas.map((c) => [
    c.fornecedor_nome, c.descricao, new Date(c.vencimento).toISOString().slice(0,10),
    c.valor_total.toFixed(2), c.valor_pago.toFixed(2),
    (c.valor_total - c.valor_pago).toFixed(2), c.status, c.nfe_numero || '',
  ]);
  const csv = [cab, ...linhas].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jinlong-contas-pagar-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

Object.assign(window, {
  uuid, fmtBRL, fmtDate, fmtMonth, fmtRelativoVenc, HOJE,
  FORNECEDORES_NOMES, FORMAS, MOCK_CONTAS, exportarCsv,
});

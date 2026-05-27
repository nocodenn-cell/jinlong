// mock-data.jsx — espelha a forma do VendaListRow do actions.ts + dados para a query
// secundária que o modal dispara (itens da venda + nomes do operador/caixa).

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtDateTime = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtIdCurto = (id) => (id ? String(id).slice(0, 8) : '—');

const FORMAS = ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX', 'CREDIARIO'];
const STATUS = ['CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'CONCLUIDA', 'CANCELADA'];

const PRODUTOS_POOL = [
  { id:'p-001', nome:'Taça de chá pintada à mão',         han:'手绘茶杯',     codigo:'7891234500142', preco:38.00 },
  { id:'p-002', nome:'Bule de porcelana — dragão',         han:'龙纹瓷壶',     codigo:'7891234500501', preco:89.00 },
  { id:'p-003', nome:'Pulseira de jade — fio duplo',       han:'玉手镯',       codigo:'7891234500017', preco:142.00 },
  { id:'p-004', nome:'Incenso de sândalo (caixa 30 un.)',  han:'檀香',         codigo:'7891234500288', preco:18.90 },
  { id:'p-005', nome:'Lanterna de papel vermelha',         han:'红纸灯笼',     codigo:'7891234500203', preco:24.50 },
  { id:'p-006', nome:'Sino de vento de bronze',            han:'黄铜风铃',     codigo:'7891234500091', preco:89.00 },
  { id:'p-007', nome:'Pincel de caligrafia — lobo',        han:'狼毫毛笔',     codigo:'7891234500166', preco:32.00 },
  { id:'p-008', nome:'Hashis de madeira — 10 pares',       han:'木筷子十双',   codigo:'7891234500612', preco:14.00 },
  { id:'p-009', nome:'Leque de bambu pintado',             han:'竹折扇',       codigo:'7891234500214', preco:28.00 },
  { id:'p-010', nome:'Gato da sorte 招财猫 — médio',        han:'招财猫',       codigo:'7891234500401', preco:49.00 },
  { id:'p-011', nome:'Conjunto de pauzinhos — laca',       han:'漆筷子',       codigo:'7891234500312', preco:22.00 },
  { id:'p-012', nome:'Vela perfumada — flor de lótus',     han:'莲花香烛',     codigo:'7891234500903', preco:38.00 },
];

const OPERADORES = ['João Wei', 'Mei Lin', 'Suporte TI'];

// ——— gerar 84 vendas “realistas” ———————————————————————————
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const BASE = new Date('2026-05-14T19:00:00').getTime();

const MOCK_VENDAS = Array.from({ length: 84 }, (_, i) => {
  const dataMs = BASE - i * 1000 * 60 * randInt(8, 35);
  const data = new Date(dataMs).toISOString();
  const itens = Array.from({ length: randInt(1, 5) }, () => {
    const p = randItem(PRODUTOS_POOL);
    const qty = randInt(1, 4);
    const descontoUnit = Math.random() < 0.18 ? Math.round(p.preco * 0.1 * 100) / 100 : 0;
    return {
      id: uuid(),
      produto_id: p.id,
      produto_nome: p.nome,
      produto_han: p.han,
      produto_codigo: p.codigo,
      quantidade: qty,
      preco_unitario: p.preco - descontoUnit,
      preco_unitario_original: p.preco,
      desconto_unitario: descontoUnit,
      tipo_preco: descontoUnit > 0 ? 'PROMOCIONAL' : 'NORMAL',
    };
  });
  const bruto = itens.reduce((s, it) => s + it.quantidade * it.preco_unitario_original, 0);
  const desconto = itens.reduce((s, it) => s + it.quantidade * it.desconto_unitario, 0);
  const liquido = bruto - desconto;
  const status = randItem(STATUS);
  return {
    id: uuid(),
    data,
    total_bruto: Math.round(bruto * 100) / 100,
    total_desconto: Math.round(desconto * 100) / 100,
    total_liquido: Math.round(liquido * 100) / 100,
    forma_pagamento: randItem(FORMAS),
    tipo_venda: 'VAREJO',
    status,
    caixa_id: uuid(),
    operador_id: uuid(),
    operador_nome: randItem(OPERADORES),
    numero_nf: status === 'CONCLUIDA' && Math.random() < 0.7 ? String(100000 + i).padStart(6, '0') : null,
    _itens: itens,
    cancelamento_motivo: status === 'CANCELADA' ? 'Cliente desistiu antes de levar a peça.' : null,
  };
});

const FORMA_LABEL = {
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
  PIX: 'PIX',
  CREDIARIO: 'Crediário',
};
const STATUS_LABEL = { CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', PENDENTE: 'Pendente' };

// expose
Object.assign(window, {
  MOCK_VENDAS,
  fmtBRL, fmtDateTime, fmtIdCurto,
  FORMA_LABEL, STATUS_LABEL,
});

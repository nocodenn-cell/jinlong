// mock-data.jsx — vendas dos últimos 30 dias para o relatório

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('pt-BR').format(n);
const fmtDate = (s) => new Date(s).toLocaleDateString('pt-BR');
const fmtDateTime = (s) => new Date(s).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

const VENDEDORES = ['João Wei', 'Mei Lin', 'Suporte TI'];
const CATEGORIAS = ['Joias', 'Decoração', 'Cozinha', 'Papelaria', 'Aromas', 'Chás', 'Vestuário', 'Acessórios'];
const FORMAS = ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'CREDIARIO'];

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const HOJE = new Date('2026-05-20T18:00:00').getTime();
const diasAtras = (d) => new Date(HOJE - d * 86400000).toISOString();

// 30 dias de vendas
const VENDAS = [];
for (let d = 29; d >= 0; d--) {
  const qtdDia = randInt(8, 24);
  for (let i = 0; i < qtdDia; i++) {
    const itens = randInt(1, 5);
    const total = Number((itens * (40 + Math.random() * 140)).toFixed(2));
    VENDAS.push({
      id: uuid(),
      data: diasAtras(d - Math.random()),
      vendedor: randItem(VENDEDORES),
      cliente: Math.random() < 0.3 ? randItem(['Cláudia Lin','Restaurante Sakura','Bruno Oliveira','Ana Tanaka']) : null,
      total_liquido: total,
      forma_pagamento: randItem(FORMAS),
      categoria_principal: randItem(CATEGORIAS),
      status: Math.random() < 0.95 ? 'CONCLUIDA' : 'CANCELADA',
      qtd_itens: itens,
    });
  }
}

const FORMA_LBL = {
  PIX: 'PIX', CARTAO_CREDITO: 'Cartão crédito', CARTAO_DEBITO: 'Cartão débito',
  DINHEIRO: 'Dinheiro', CREDIARIO: 'Crediário',
};

function gerarCsv(vendas) {
  const cab = ['Data','ID','Cliente','Vendedor','Categoria','Total','Forma','Status'];
  const rows = vendas.map((v) => [
    new Date(v.data).toISOString(),
    v.id.slice(0,8), v.cliente || '', v.vendedor, v.categoria_principal,
    v.total_liquido.toFixed(2), FORMA_LBL[v.forma_pagamento], v.status,
  ]);
  const csv = [cab, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `jinlong-relatorio-vendas-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

Object.assign(window, { fmtBRL, fmtNum, fmtDate, fmtDateTime, VENDAS, VENDEDORES, CATEGORIAS, FORMAS, FORMA_LBL, HOJE, gerarCsv });

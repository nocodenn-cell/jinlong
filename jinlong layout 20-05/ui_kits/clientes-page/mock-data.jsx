// mock-data.jsx — espelha a forma do ClienteListRow do actions.ts em produção.

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const fmtDate = (s) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function maskDoc(doc) {
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}
function maskTel(t) {
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return t;
}
function initials(nome) {
  return nome.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

const NOMES_PF = [
  'Cláudia Lin', 'Ana Tanaka', 'Bruno Oliveira', 'Pedro Zhang', 'Mariko Sato',
  'Carla Sousa', 'João Wei Filho', 'Maria Yamamoto', 'Roberto Chen', 'Patrícia Lima',
  'Fábio Almeida', 'Lúcia Hashimoto', 'Eduardo Wong', 'Renata Mendes', 'Tiago Liu',
  'Vânia Kobayashi', 'Henrique Park', 'Sofia Tanaka', 'Carlos Sun', 'Beatriz Cruz',
  'Igor Yamada', 'Daniela Soares', 'Murilo Tang', 'Felipe Cao', 'Bianca Inoue',
];
const NOMES_PJ = [
  'Restaurante Sakura', 'Casa de Festas Lin', 'Templo Tian Hou', 'Decorações Orient Ltda.',
  'Importadora Bambu', 'Boutique Bashō', 'Mercearia Asiática Tang', 'Bistrô Dragon Express',
  'Grão de Chá Imp. Ltda.', 'Mercado Liberdade Premium', 'Pousada Quinta Oriental',
];

const RUAS = [
  'R. Galvão Bueno', 'R. Tomás Gonzaga', 'R. Conselheiro Furtado', 'Av. Liberdade',
  'R. dos Estudantes', 'R. Padre João Manuel', 'R. da Glória', 'Av. Paulista',
];

const HOJE = new Date('2026-05-14T18:42:00').getTime();
function diasAtras(d) { return new Date(HOJE - d * 86400000).toISOString(); }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function gerarCPF() {
  const n = Array.from({ length: 9 }, () => randInt(0, 9));
  // dígitos de checagem reais não importam aqui — só formato
  n.push(randInt(0, 9), randInt(0, 9));
  return n.join('');
}
function gerarCNPJ() {
  const n = Array.from({ length: 12 }, () => randInt(0, 9));
  n.push(randInt(0, 9), randInt(0, 9));
  return n.join('');
}
function gerarTel() {
  const ddd = randItem(['11', '11', '11', '21', '19', '13']);
  const cel = randInt(0, 1) === 0;
  return cel
    ? `${ddd}9${randInt(7000, 9999)}${randInt(1000, 9999)}`
    : `${ddd}${randInt(2000, 5999)}${randInt(1000, 9999)}`;
}
function gerarEmail(nome) {
  const slug = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '').replace(/\s+/g, '.').slice(0, 22);
  const dom = randItem(['gmail.com', 'outlook.com', 'jinlong.com.br', 'uol.com.br', 'hotmail.com']);
  return `${slug}@${dom}`;
}

const MOCK_CLIENTES = [];
NOMES_PF.forEach((nome, i) => {
  const limite = randItem([500, 800, 1000, 1500, 2000, 3000]);
  const usado = Math.random() < 0.35 ? Math.round(limite * Math.random() * 0.9) : 0;
  MOCK_CLIENTES.push({
    id: uuid(),
    nome,
    tipo: 'PF',
    documento: gerarCPF(),
    documento_formatado: maskDoc(gerarCPF()),
    email: gerarEmail(nome),
    telefone: gerarTel(),
    telefone_formatado: maskTel(gerarTel()),
    endereco: `${randItem(RUAS)}, ${randInt(20, 1800)}`,
    limite_crediario: limite,
    saldo_crediario: usado,
    ultima_compra: diasAtras(randInt(1, 80)),
    criado_em: diasAtras(randInt(60, 700)),
  });
});
NOMES_PJ.forEach((nome) => {
  const limite = randItem([2000, 3000, 5000, 8000, 10000]);
  const usado = Math.random() < 0.55 ? Math.round(limite * (0.2 + Math.random() * 0.7)) : 0;
  MOCK_CLIENTES.push({
    id: uuid(),
    nome,
    tipo: 'PJ',
    documento: gerarCNPJ(),
    documento_formatado: maskDoc(gerarCNPJ()),
    email: gerarEmail(nome.replace(/\W+/g, ' ').trim()),
    telefone: gerarTel(),
    telefone_formatado: maskTel(gerarTel()),
    endereco: `${randItem(RUAS)}, ${randInt(20, 1800)}`,
    limite_crediario: limite,
    saldo_crediario: usado,
    ultima_compra: diasAtras(randInt(1, 40)),
    criado_em: diasAtras(randInt(120, 1200)),
  });
});

// Garante o cliente “estrela” do roteiro
MOCK_CLIENTES[NOMES_PF.length] = {
  id: uuid(),
  nome: 'Restaurante Sakura',
  tipo: 'PJ',
  documento: '12448901000122',
  documento_formatado: maskDoc('12448901000122'),
  email: 'compras@sakura.com.br',
  telefone: '11381466220',
  telefone_formatado: maskTel('11381466220'),
  endereco: 'R. dos Estudantes, 244',
  limite_crediario: 5000,
  saldo_crediario: 1842.30,
  ultima_compra: diasAtras(2),
  criado_em: diasAtras(420),
};

Object.assign(window, {
  uuid, fmtBRL, fmtDate, maskDoc, maskTel, initials,
  MOCK_CLIENTES,
});

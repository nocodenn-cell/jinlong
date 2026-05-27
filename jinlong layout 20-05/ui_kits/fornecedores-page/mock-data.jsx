// mock-data.jsx — 24 fornecedores (importadores chineses + alguns BR)

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(n);
const fmtDate = (s) => new Date(s).toLocaleDateString('pt-BR');
function maskCNPJ(d) {
  const x = (d||'').replace(/\D/g,'');
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return d;
}
function maskTel(t) {
  const d = (t||'').replace(/\D/g,'');
  if (d.length === 11) return d.replace(/(\d{2})(\d{1})(\d{4})(\d{4})/, '($1) $2 $3-$4');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return t;
}
function maskCEP(c) {
  const d = (c||'').replace(/\D/g,'');
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, '$1-$2');
  return c;
}
function initials(n) {
  return n.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

const UFs = ['SP','RJ','MG','PR','RS','SC','BA','DF','GO','PE','CE','PA'];

const _seed = [
  // Importadores chineses (CNPJ BR de filial) + nomes em han
  ['Yiwu Imports Brasil',         '12.808.221/0001-08', 'Wang Lei',     'sales@yiwu-imports.com.br', 'Decoração'],
  ['Jingdezhen Ceramics Ltda.',   '08.114.622/0001-44', 'Liu Mei',      'export@jdz-cer.com.br',     'Cozinha'],
  ['Hangzhou Jade Co. BR',        '22.448.910/0001-72', 'Chen Hua',     'hua@hz-jade.com.br',         'Joias'],
  ['Fujian Sandalwood',           '14.602.218/0001-30', 'Zhao Yang',    'zhao@fj-sandal.com.br',      'Aromas'],
  ['Yunnan Tea Co.',              '08.722.114/0001-55', 'Lin Xiang',    'lin@yn-tea.com.br',          'Chás'],
  ['Kyoto Atelier do Brasil',     '88.014.622/0001-09', 'Sato Hiro',    'hiro@kyoto-atelier.com.br', 'Vestuário'],
  ['Anhui Brush Studio',          '02.114.806/0001-19', 'Wei Long',     'wei@anhui-brush.com.br',    'Papelaria'],
  ['Suzhou Silk Imports',         '44.221.008/0001-62', 'Tang Mei',     'tang@suzhou-silk.com.br',   'Acessórios'],
  ['Shenzhen Tech BR',            '38.114.622/0001-71', 'Zhou Bo',      'bo@sztech-br.com.br',        'Eletrônicos'],
  ['Guangzhou Textile Trade',     '14.880.221/0001-90', 'Han Yuan',     'yuan@gz-textile.com.br',    'Vestuário'],
  ['Xiamen Tea & Spices',         '06.224.118/0001-21', 'Cao Jin',      'jin@xm-tea.com.br',          'Chás'],
  ['Tianjin Glass Works',         '70.221.408/0001-13', 'Mo Liang',     'liang@tj-glass.com.br',     'Cozinha'],
  ['Sichuan Spice Co.',           '92.110.622/0001-58', 'Xu Bing',      'bing@sc-spice.com.br',      'Cozinha'],
  ['Beijing Calligraphy Supply',  '40.224.118/0001-92', 'Li Ming',      'ming@bj-callig.com.br',     'Papelaria'],
  ['Qingdao Beer Imports',        '18.804.226/0001-65', 'Sun Wei',      'sun@qd-beer.com.br',         'Bebidas'],
  ['Hangzhou Silk Workshop',      '60.114.806/0001-30', 'Yu Mei',       'mei@hz-silk.com.br',         'Acessórios'],
  ['Embalagens Liberdade',        '11.022.804/0001-44', 'Carlos Silva', 'compras@embalib.com.br',    'Embalagens'],
  ['Distribuidora Oriental Ltda.','22.604.118/0001-09', 'Roberto Tan',  'roberto@distoriental.com.br','Diversos'],
  ['Papelaria Estudantes',        '08.911.020/0001-15', 'Sandra Costa', 'sandra@papelestudantes.com.br','Papelaria'],
  ['Refrigerantes São Paulo',     '17.822.044/0001-80', 'José Souza',   'jose@refrisp.com.br',        'Bebidas'],
  ['Logística Bashō Express',     '99.114.622/0001-09', 'Tatiana Mori', 'tatiana@bashoex.com.br',    'Logística'],
  ['Hong Kong Stationary BR',     '50.224.808/0001-65', 'Lam Chow',     'chow@hkstat.com.br',         'Papelaria'],
  ['Macau Imports & Exports',     '70.118.022/0001-91', 'Wu Ka-Lok',    'ka-lok@macauimp.com.br',    'Diversos'],
  ['Shanghai Premium Goods',      '14.224.806/0001-08', 'Zhang Wei',    'zhang@shg-premium.com.br',  'Diversos'],
];

const HOJE = Date.now();
const diasAtras = (d) => new Date(HOJE - d * 86400000).toISOString();

const MOCK_FORNECEDORES = _seed.map((s, i) => ({
  id: uuid(),
  nome: s[0],
  documento: s[1].replace(/\D/g,''),
  tipo: 'PJ',
  telefone: '11' + (Math.random() < 0.5 ? '9' : '') + Math.floor(20000000 + Math.random() * 79999999),
  email: s[3],
  contato_pessoa: s[2],
  categoria: s[4],
  endereco_logradouro: 'R. ' + ['Galvão Bueno','Conselheiro Furtado','Tomás Gonzaga','dos Estudantes','da Glória','Padre João Manuel'][i % 6],
  endereco_numero: String(20 + Math.floor(Math.random() * 1800)),
  endereco_complemento: i % 5 === 0 ? `Sala ${100 + i}` : '',
  endereco_bairro: ['Liberdade','Cerqueira César','Bela Vista','Sé','Aclimação','Vila Mariana'][i % 6],
  endereco_cidade: ['São Paulo','Santos','Guarulhos','São Paulo','São Paulo','São Paulo'][i % 6],
  endereco_uf: UFs[i % 5],
  endereco_cep: String(10000000 + Math.floor(Math.random() * 89999999)),
  ativo: i % 7 !== 5,
  criado_em: diasAtras(60 + i * 12),
}));

Object.assign(window, {
  uuid, fmtBRL, fmtDate, maskCNPJ, maskTel, maskCEP, initials,
  UFs, MOCK_FORNECEDORES,
});

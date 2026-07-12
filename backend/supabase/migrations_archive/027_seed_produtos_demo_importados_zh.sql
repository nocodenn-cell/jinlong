-- Catálogo demo: loja de importados com nomes em chinês (simplificado) + referência PT.
-- Útil para testar caixa, relatórios (`relatorio_top_produtos_periodo`, etc.) com idioma zh no app.
-- Idempotente: reexecutar atualiza nome/preço/estoque dos mesmos IDs.

-- Categorias (nome bilingue para consistência na UI)
INSERT INTO public.categorias (id, nome)
VALUES
  ('d1c0d100-0001-4000-8000-000000000001', '饮料饮品 · Bebidas'),
  ('d1c0d100-0002-4000-8000-000000000002', '休闲零食 · Lanches e snacks'),
  ('d1c0d100-0003-4000-8000-000000000003', '家居日用 · Casa e utilidades'),
  ('d1c0d100-0004-4000-8000-000000000004', '数码配件 · Acessórios eletrônicos'),
  ('d1c0d100-0005-4000-8000-000000000005', '餐厨用品 · Cozinha e mesa')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

INSERT INTO public.produtos (
  id,
  codigo_barras,
  nome,
  categoria_id,
  preco_varejo,
  preco_custo,
  unidade_medida,
  origem,
  tem_nf,
  ativo,
  observacao
)
VALUES
  (
    'd1c0d200-0001-4000-8000-000000000001',
    '7898512340001',
    '不锈钢保温杯500ml · Garrafa térmica inox 500ml',
    'd1c0d100-0003-4000-8000-000000000003',
    89.90,
    38.00,
    'UN',
    'china_manual',
    false,
    true,
    'Demo relatório zh'
  ),
  (
    'd1c0d200-0002-4000-8000-000000000002',
    '7898512340002',
    '日式拉面碗套装（4件）· Conjunto tigelas estilo ramen',
    'd1c0d100-0005-4000-8000-000000000005',
    45.00,
    18.50,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-0003-4000-8000-000000000003',
    '7898512340003',
    'USB-C快充数据线2米 · Cabo USB-C 2m',
    'd1c0d100-0004-4000-8000-000000000004',
    22.50,
    6.20,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-0004-4000-8000-000000000004',
    '7898512340004',
    '迷你桌面加湿器 · Umidificador USB de mesa',
    'd1c0d100-0003-4000-8000-000000000003',
    68.00,
    29.00,
    'UN',
    'china_manual',
    true,
    true,
    NULL
  ),
  (
    'd1c0d200-0005-4000-8000-000000000005',
    '7898512340005',
    '天然竹筷10双装 · Hashis bambu 10 pares',
    'd1c0d100-0005-4000-8000-000000000005',
    12.90,
    3.80,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-0006-4000-8000-000000000006',
    '7898512340006',
    '旅行收纳袋三件套 · Organizadores de viagem 3 peças',
    'd1c0d100-0003-4000-8000-000000000003',
    34.90,
    11.00,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-0007-4000-8000-000000000007',
    '7898512340007',
    'LED护眼台灯可调光 · Luminária LED mesa regulável',
    'd1c0d100-0004-4000-8000-000000000004',
    125.00,
    52.00,
    'UN',
    'china_manual',
    true,
    true,
    NULL
  ),
  (
    'd1c0d200-0008-4000-8000-000000000008',
    '7898512340008',
    '陶瓷马克杯对杯 · Canecas cerâmica par',
    'd1c0d100-0005-4000-8000-000000000005',
    39.90,
    14.00,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-0009-4000-8000-000000000009',
    '7898512340009',
    '铝合金手机支架 · Suporte celular alumínio',
    'd1c0d100-0004-4000-8000-000000000004',
    19.90,
    5.50,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-000a-4000-8000-00000000000a',
    '7898512340010',
    '网红辣条组合包 · Pacote snacks picantes',
    'd1c0d100-0002-4000-8000-000000000002',
    15.50,
    4.20,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-000b-4000-8000-00000000000b',
    '7898512340011',
    '茉莉花茶包25袋 · Chá de jasmim 25 sachês',
    'd1c0d100-0001-4000-8000-000000000001',
    24.90,
    8.00,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-000c-4000-8000-00000000000c',
    '7898512340012',
    '气泡水蜜桃味500ml · Água gaseificada pêssego 500ml',
    'd1c0d100-0001-4000-8000-000000000001',
    6.50,
    2.10,
    'UN',
    'brasil_nf',
    true,
    true,
    NULL
  ),
  (
    'd1c0d200-000d-4000-8000-00000000000d',
    '7898512340013',
    '无线蓝牙耳机充电盒 · Fones Bluetooth com case',
    'd1c0d100-0004-4000-8000-000000000004',
    189.00,
    78.00,
    'UN',
    'china_manual',
    true,
    true,
    NULL
  ),
  (
    'd1c0d200-000e-4000-8000-00000000000e',
    '7898512340014',
    '硅胶折叠水壶 · Chaleira silicone retrátil',
    'd1c0d100-0005-4000-8000-000000000005',
    79.00,
    31.00,
    'UN',
    'china_manual',
    false,
    true,
    NULL
  ),
  (
    'd1c0d200-000f-4000-8000-00000000000f',
    '7898512340015',
    '免洗洗手液500ml · Álcool em gel 500ml',
    'd1c0d100-0003-4000-8000-000000000003',
    18.90,
    6.80,
    'UN',
    'brasil_sem_nf',
    false,
    true,
    NULL
  )
ON CONFLICT (id) DO UPDATE SET
  codigo_barras = EXCLUDED.codigo_barras,
  nome = EXCLUDED.nome,
  categoria_id = EXCLUDED.categoria_id,
  preco_varejo = EXCLUDED.preco_varejo,
  preco_custo = EXCLUDED.preco_custo,
  unidade_medida = EXCLUDED.unidade_medida,
  origem = EXCLUDED.origem,
  tem_nf = EXCLUDED.tem_nf,
  ativo = EXCLUDED.ativo,
  observacao = EXCLUDED.observacao;

-- Estoque (quantidades fictícias para teste de baixa / relatório)
INSERT INTO public.estoque (produto_id, quantidade_atual, estoque_minimo)
VALUES
  ('d1c0d200-0001-4000-8000-000000000001', 40, 5),
  ('d1c0d200-0002-4000-8000-000000000002', 25, 4),
  ('d1c0d200-0003-4000-8000-000000000003', 120, 20),
  ('d1c0d200-0004-4000-8000-000000000004', 15, 3),
  ('d1c0d200-0005-4000-8000-000000000005', 200, 30),
  ('d1c0d200-0006-4000-8000-000000000006', 35, 5),
  ('d1c0d200-0007-4000-8000-000000000007', 12, 2),
  ('d1c0d200-0008-4000-8000-000000000008', 48, 8),
  ('d1c0d200-0009-4000-8000-000000000009', 90, 15),
  ('d1c0d200-000a-4000-8000-00000000000a', 60, 10),
  ('d1c0d200-000b-4000-8000-00000000000b', 80, 12),
  ('d1c0d200-000c-4000-8000-00000000000c', 150, 24),
  ('d1c0d200-000d-4000-8000-00000000000d', 22, 4),
  ('d1c0d200-000e-4000-8000-00000000000e', 18, 3),
  ('d1c0d200-000f-4000-8000-00000000000f', 70, 10)
ON CONFLICT (produto_id) DO UPDATE SET
  quantidade_atual = EXCLUDED.quantidade_atual,
  estoque_minimo = EXCLUDED.estoque_minimo;

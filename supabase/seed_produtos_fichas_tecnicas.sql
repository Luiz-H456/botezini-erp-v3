-- =============================================================================
-- Seed: Produtos + Ficha Técnica (BOM) — catálogo Botezini
-- Rodar DEPOIS de seed_insumos_homologados.sql (depende dos insumos por nome).
--
-- Fonte dos itens: catálogo de botezini.com.br (24 produtos, 5 linhas).
-- Tecido de cada peça: cartela oficial /cores (campo "Aplicações na Veste").
--
-- ATENÇÃO — CONSUMOS SÃO MÉDIAS DE MERCADO, NÃO MEDIÇÃO DE VOCÊS.
-- Servem para o cálculo de CMV e a Lista de Compras começarem a rodar.
-- Ajuste peça por peça conforme o encaixe real do modelista.
--
-- Base dos consumos: brim/tricoline largura 1,60m · malha largura 1,80m.
-- Malha entra na ficha em KG (o insumo é comprado por kg), já convertida:
--   kg/peça = metros/peça ÷ rendimento(m/kg)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tecidos usados no catálogo que NÃO estão na cartela /cores
--    Aparecem em 4 produtos. Sem eles a ficha fica furada. Confirmar
--    fornecedor e preço — entram zerados.
-- ---------------------------------------------------------------------------
INSERT INTO public.insumos (name, unit, average_unit_cost, category, rendimento, min_stock, notes)
SELECT v.name, v.unit, 0, 'Tecidos', 1, v.min_stock, v.notes
FROM (VALUES
  ('Jeans Industrial',                'm', 80::numeric,  'FORA DA CARTELA /cores. Usado em Calça Jeans Industrial e Calça Jeans Essencial. Definir fornecedor, gramatura e custo/m.'),
  ('Tecido Térmico Acolchoado',       'm', 20::numeric,  'FORA DA CARTELA /cores. Usado na Japona Térmica (câmara fria -18°C). Definir fornecedor e custo/m.'),
  ('Lâmina PVC Impermeável',          'm', 30::numeric,  'FORA DA CARTELA /cores. Usado no Avental PVC Bate-Água. Definir fornecedor e custo/m.')
) AS v(name, unit, min_stock, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.insumos i WHERE i.name = v.name);

-- ---------------------------------------------------------------------------
-- 1. Produtos
--    fabric_consumption_m  = metros lineares de tecido por peça (sempre em m,
--                            mesmo quando o insumo é comprado em kg)
--    pieces_daily_capacity = produção média/dia se a fábrica só fizesse essa
--                            peça. Coerente com a capacidade de ~350 pç/semana.
-- ---------------------------------------------------------------------------
INSERT INTO public.products (name, category, description, fabric_consumption_m, pieces_daily_capacity, overhead_percent, default_fabric_insumo_id)
SELECT v.name, v.category, v.description, v.consumo, v.cap, 40,
       (SELECT id FROM public.insumos WHERE name = v.tecido)
FROM (VALUES
  -- ---------------- Linha Operacional ----------------
  ('Camisa Operacional (MC)',        'Operacional', 'Brim leve, bolso duplo. Manga curta.',            1.50::numeric, 65,  'Brim Leve Cedropac — Padrão'),
  ('Camisa Operacional (ML)',        'Operacional', 'Brim leve, proteção total do braço.',             1.80::numeric, 55,  'Brim Leve Cedropac — Padrão'),
  ('Calça Operacional Reforçada',    'Operacional', 'Brim pesado, bolso faca, costura reforçada.',     1.40::numeric, 60,  'Brim Pesado Cedropac — Padrão'),
  ('Calça Jeans Industrial',         'Operacional', 'Jeans de alta resistência.',                      1.40::numeric, 55,  'Jeans Industrial'),
  ('Macacão Proteção Total',         'Operacional', 'Brim pesado, peça única, zíper frontal longo.',    2.80::numeric, 22,  'Brim Pesado Cedropac — Padrão'),
  ('Jaleco Operacional (Guarda-pó)', 'Operacional', 'Brim pesado, vários bolsos, proteção óleo/graxa.', 1.90::numeric, 45,  'Brim Pesado Cedropac — Padrão'),

  -- ---------------- Linha Alimentar (BPF/ANVISA — cor restrita) ----------------
  ('Camiseta Base Alimentar (PV)',   'Alimentar',   'Malha PV, secagem rápida, gola reforçada.',        1.00::numeric, 110, 'Malha PV Anti Pilling (Guimatex 167) — Padrão'),
  ('Calça Flexível (Laticínio/SIF)', 'Alimentar',   'Cós elástico, sem bolsos externos.',               1.40::numeric, 85,  'Brim Leve Cedropac — Padrão'),
  ('Japona Térmica (Câmara Fria)',   'Alimentar',   'Isolação -18°C, zíper injetado.',                  2.20::numeric, 30,  'Tecido Térmico Acolchoado'),
  ('Avental PVC (Bate-Água)',        'Alimentar',   'PVC impermeável, alça pescoço e cordões.',         1.20::numeric, 120, 'Lâmina PVC Impermeável'),
  ('Touca Árabe Protetora',          'Alimentar',   'Retenção capilar, rede respirável lateral.',       0.35::numeric, 180, 'Malha PV Anti Pilling (Guimatex 167) — Padrão'),
  ('Jaleco Supervisão (Área Limpa)', 'Alimentar',   'Gola padre, botão de pressão interno.',            1.90::numeric, 45,  'Brim Leve Cedropac — Padrão'),

  -- ---------------- Linha Saúde ----------------
  ('Jaleco Clínico (MC e ML)',       'Saúde',       'Brim leve, fácil higienização.',                   1.80::numeric, 55,  'Brim Leve Cedropac — Padrão'),
  ('Túnica Clínica (Scrub)',         'Saúde',       'Decote V, conforto térmico.',                      1.60::numeric, 70,  'Brim Leve Cedropac — Padrão'),
  ('Calça Conforto',                 'Saúde',       'Cós elástico, uso clínico.',                       1.40::numeric, 80,  'Brim Leve Cedropac — Padrão'),
  ('Avental Proteção Frontal',       'Saúde',       'Proteção frontal, amarração nas costas.',          1.20::numeric, 95,  'Brim Leve Cedropac — Padrão'),

  -- ---------------- Linha Corporativa ----------------
  ('Camisa Executiva (MC/ML)',       'Corporativa', 'Tricoline com elastano, Easy Care.',               1.70::numeric, 50,  'Tricoline MNPro — Padrão'),
  ('Polo Corporativa',               'Corporativa', 'Piquet PV, gola e punho canelados.',               1.10::numeric, 80,  'Malha Piquet PV (Guimatex 154) — Padrão'),
  ('Calça Alfaiataria Corporativa',  'Corporativa', 'Tricoline, caimento alfaiataria.',                 1.40::numeric, 45,  'Tricoline MNPro — Padrão'),
  ('Saia Lápis Executiva',           'Corporativa', 'Tricoline, fenda traseira, zíper invisível.',      0.80::numeric, 70,  'Tricoline MNPro — Padrão'),

  -- ---------------- Linha Essencial (alto turnover) ----------------
  ('Camiseta Básica (Malha)',        'Essencial',   'Malha PV anti pilling, gola careca.',              1.00::numeric, 110, 'Malha PV Anti Pilling (Guimatex 167) — Padrão'),
  ('Polo Piquet Básica',             'Essencial',   'Piquet PV, versão econômica.',                     1.10::numeric, 85,  'Malha Piquet PV (Guimatex 154) — Padrão'),
  ('Calça Brim Leve',                'Essencial',   'Brim leve, modelo básico.',                        1.40::numeric, 75,  'Brim Leve Cedropac — Padrão'),
  ('Calça Jeans Essencial',          'Essencial',   'Jeans, versão econômica.',                         1.40::numeric, 60,  'Jeans Industrial')
) AS v(name, category, description, consumo, cap, tecido)
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.name = v.name);

-- ---------------------------------------------------------------------------
-- 2. Ficha Técnica (product_insumos) — consumo POR PEÇA
--    Tecido em 'm' (brim/tricoline/jeans) ou 'kg' (malhas Guimatex).
--    Linha em cone fracionado (cone 5.000m; 0,04 cone = 200m de costura).
-- ---------------------------------------------------------------------------
INSERT INTO public.product_insumos (product_id, insumo_id, quantity)
SELECT p.id, i.id, v.qty
FROM (VALUES
  -- ============ OPERACIONAL ============
  ('Camisa Operacional (MC)',        'Brim Leve Cedropac — Padrão',      1.50::numeric),
  ('Camisa Operacional (MC)',        'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),
  ('Camisa Operacional (MC)',        'Entretela termocolante 41g/m² (1,50m)',    0.150::numeric),
  ('Camisa Operacional (MC)',        'Botão camisa 4 furos nº24',                8::numeric),

  ('Camisa Operacional (ML)',        'Brim Leve Cedropac — Padrão',      1.80::numeric),
  ('Camisa Operacional (ML)',        'Linha costura Alfa fio 120 (cone 5.000m)', 0.050::numeric),
  ('Camisa Operacional (ML)',        'Entretela termocolante 41g/m² (1,50m)',    0.200::numeric),
  ('Camisa Operacional (ML)',        'Botão camisa 4 furos nº24',                10::numeric),

  ('Calça Operacional Reforçada',    'Brim Pesado Cedropac — Padrão',  1.40::numeric),
  ('Calça Operacional Reforçada',    'Linha costura Alfa fio 80 (cone 5.000m)',  0.050::numeric),
  ('Calça Operacional Reforçada',    'Zíper nylon comum 20cm',                   1::numeric),
  ('Calça Operacional Reforçada',    'Botão camisa 4 furos nº24',                1::numeric),
  ('Calça Operacional Reforçada',    'Entretela termocolante 41g/m² (1,50m)',    0.100::numeric),

  ('Calça Jeans Industrial',         'Jeans Industrial',                         1.40::numeric),
  ('Calça Jeans Industrial',         'Linha costura Alfa fio 80 (cone 5.000m)',  0.050::numeric),
  ('Calça Jeans Industrial',         'Zíper nylon comum 20cm',                   1::numeric),
  ('Calça Jeans Industrial',         'Botão camisa 4 furos nº24',                1::numeric),

  ('Macacão Proteção Total',         'Brim Pesado Cedropac — Padrão',  2.80::numeric),
  ('Macacão Proteção Total',         'Linha costura Alfa fio 80 (cone 5.000m)',  0.090::numeric),
  ('Macacão Proteção Total',         'Zíper nylon destacável 60cm',              1::numeric),
  ('Macacão Proteção Total',         'Botão camisa 4 furos nº24',                2::numeric),

  ('Jaleco Operacional (Guarda-pó)', 'Brim Pesado Cedropac — Padrão',  1.90::numeric),
  ('Jaleco Operacional (Guarda-pó)', 'Linha costura Alfa fio 120 (cone 5.000m)', 0.050::numeric),
  ('Jaleco Operacional (Guarda-pó)', 'Entretela termocolante 41g/m² (1,50m)',    0.100::numeric),
  ('Jaleco Operacional (Guarda-pó)', 'Botão camisa 4 furos nº24',                6::numeric),

  -- ============ ALIMENTAR ============
  ('Camiseta Base Alimentar (PV)',   'Malha PV Anti Pilling (Guimatex 167) — Padrão',     0.300::numeric),
  ('Camiseta Base Alimentar (PV)',   'Linha overloque poliéster (cone 5.000m)',  0.030::numeric),

  ('Calça Flexível (Laticínio/SIF)', 'Brim Leve Cedropac — Padrão',      1.40::numeric),
  ('Calça Flexível (Laticínio/SIF)', 'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),

  ('Japona Térmica (Câmara Fria)',   'Tecido Térmico Acolchoado',                2.20::numeric),
  ('Japona Térmica (Câmara Fria)',   'Linha costura Alfa fio 80 (cone 5.000m)',  0.070::numeric),
  ('Japona Térmica (Câmara Fria)',   'Zíper nylon destacável 60cm',              1::numeric),

  ('Avental PVC (Bate-Água)',        'Lâmina PVC Impermeável',                   1.20::numeric),
  ('Avental PVC (Bate-Água)',        'Linha costura Alfa fio 80 (cone 5.000m)',  0.020::numeric),

  ('Touca Árabe Protetora',          'Malha PV Anti Pilling (Guimatex 167) — Padrão',     0.100::numeric),
  ('Touca Árabe Protetora',          'Linha overloque poliéster (cone 5.000m)',  0.010::numeric),

  ('Jaleco Supervisão (Área Limpa)', 'Brim Leve Cedropac — Padrão',      1.90::numeric),
  ('Jaleco Supervisão (Área Limpa)', 'Linha costura Alfa fio 120 (cone 5.000m)', 0.050::numeric),
  ('Jaleco Supervisão (Área Limpa)', 'Entretela termocolante 41g/m² (1,50m)',    0.100::numeric),

  -- ============ SAÚDE ============
  ('Jaleco Clínico (MC e ML)',       'Brim Leve Cedropac — Padrão',      1.80::numeric),
  ('Jaleco Clínico (MC e ML)',       'Linha costura Alfa fio 120 (cone 5.000m)', 0.050::numeric),
  ('Jaleco Clínico (MC e ML)',       'Entretela termocolante 41g/m² (1,50m)',    0.150::numeric),
  ('Jaleco Clínico (MC e ML)',       'Botão camisa 4 furos nº22',                6::numeric),

  ('Túnica Clínica (Scrub)',         'Brim Leve Cedropac — Padrão',      1.60::numeric),
  ('Túnica Clínica (Scrub)',         'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),

  ('Calça Conforto',                 'Brim Leve Cedropac — Padrão',      1.40::numeric),
  ('Calça Conforto',                 'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),

  ('Avental Proteção Frontal',       'Brim Leve Cedropac — Padrão',      1.20::numeric),
  ('Avental Proteção Frontal',       'Linha costura Alfa fio 120 (cone 5.000m)', 0.020::numeric),

  -- ============ CORPORATIVA ============
  ('Camisa Executiva (MC/ML)',       'Tricoline MNPro — Padrão',       1.70::numeric),
  ('Camisa Executiva (MC/ML)',       'Linha costura Alfa fio 120 (cone 5.000m)', 0.045::numeric),
  ('Camisa Executiva (MC/ML)',       'Entretela termocolante 41g/m² (1,50m)',    0.200::numeric),
  ('Camisa Executiva (MC/ML)',       'Botão camisa 4 furos nº22',                9::numeric),

  ('Polo Corporativa',               'Malha Piquet PV (Guimatex 154) — Padrão',           0.320::numeric),
  ('Polo Corporativa',               'Linha overloque poliéster (cone 5.000m)',  0.035::numeric),
  ('Polo Corporativa',               'Botão camisa 4 furos nº22',                3::numeric),
  ('Polo Corporativa',               'Entretela termocolante 41g/m² (1,50m)',    0.050::numeric),

  ('Calça Alfaiataria Corporativa',  'Tricoline MNPro — Padrão',       1.40::numeric),
  ('Calça Alfaiataria Corporativa',  'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),
  ('Calça Alfaiataria Corporativa',  'Zíper nylon comum 20cm',                   1::numeric),
  ('Calça Alfaiataria Corporativa',  'Botão camisa 4 furos nº22',                1::numeric),
  ('Calça Alfaiataria Corporativa',  'Entretela rígida Ciboné (1,60m)',          0.100::numeric),

  ('Saia Lápis Executiva',           'Tricoline MNPro — Padrão',       0.80::numeric),
  ('Saia Lápis Executiva',           'Linha costura Alfa fio 120 (cone 5.000m)', 0.025::numeric),
  ('Saia Lápis Executiva',           'Zíper nylon comum 20cm',                   1::numeric),
  ('Saia Lápis Executiva',           'Entretela rígida Ciboné (1,60m)',          0.080::numeric),

  -- ============ ESSENCIAL ============
  ('Camiseta Básica (Malha)',        'Malha PV Anti Pilling (Guimatex 167) — Padrão',     0.300::numeric),
  ('Camiseta Básica (Malha)',        'Linha overloque poliéster (cone 5.000m)',  0.030::numeric),

  ('Polo Piquet Básica',             'Malha Piquet PV (Guimatex 154) — Padrão',           0.320::numeric),
  ('Polo Piquet Básica',             'Linha overloque poliéster (cone 5.000m)',  0.035::numeric),
  ('Polo Piquet Básica',             'Botão camisa 4 furos nº22',                3::numeric),

  ('Calça Brim Leve',                'Brim Leve Cedropac — Padrão',      1.40::numeric),
  ('Calça Brim Leve',                'Linha costura Alfa fio 120 (cone 5.000m)', 0.040::numeric),
  ('Calça Brim Leve',                'Zíper nylon comum 20cm',                   1::numeric),
  ('Calça Brim Leve',                'Botão camisa 4 furos nº24',                1::numeric),

  ('Calça Jeans Essencial',          'Jeans Industrial',                         1.40::numeric),
  ('Calça Jeans Essencial',          'Linha costura Alfa fio 80 (cone 5.000m)',  0.050::numeric),
  ('Calça Jeans Essencial',          'Zíper nylon comum 20cm',                   1::numeric),
  ('Calça Jeans Essencial',          'Botão camisa 4 furos nº24',                1::numeric)
) AS v(produto, insumo, qty)
JOIN public.products p ON p.name = v.produto
JOIN public.insumos  i ON i.name = v.insumo
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_insumos pi
  WHERE pi.product_id = p.id AND pi.insumo_id = i.id
);

-- =============================================================================
-- Verificação — ficha técnica montada por produto:
--   SELECT p.category, p.name AS produto, p.fabric_consumption_m, p.pieces_daily_capacity,
--          i.name AS insumo, pi.quantity, i.unit
--   FROM product_insumos pi
--   JOIN products p ON p.id = pi.product_id
--   JOIN insumos  i ON i.id = pi.insumo_id
--   ORDER BY p.category, p.name, i.category DESC, i.name;
--
-- Produtos sem ficha (deve voltar vazio):
--   SELECT name FROM products p
--   WHERE NOT EXISTS (SELECT 1 FROM product_insumos WHERE product_id = p.id);
-- =============================================================================

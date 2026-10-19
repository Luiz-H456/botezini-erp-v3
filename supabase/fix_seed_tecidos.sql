-- =============================================================================
-- Reparo: os 15 tecidos por faixa de cor não entraram
--
-- DIAGNÓSTICO (a partir dos seus números)
--   insumos com fabric_family = 0      -> nenhuma faixa existe
--   Tecidos = 8                        -> 5 seus antigos + 3 fora da cartela
--   ficha tecnica = 59 (faltam 20)     -> exatamente as 20 linhas de tecido
--                                         dos 20 produtos que usam a cartela
-- Ou seja: só o bloco de tecidos de seed_insumos_homologados.sql não inseriu.
-- Aviamentos, produtos, fornecedores e as 91 cores entraram normalmente.
--
-- Este script é imune às causas prováveis daquela falha:
--   · fornecedor resolvido por LEFT JOIN, não por subconsulta escalar
--     (subconsulta estoura se houver fornecedor duplicado);
--   · fabric_family e color_tier gravados no próprio INSERT, sem depender
--     de um UPDATE casando por nome depois;
--   · ficha técnica religada por família+faixa, não por nome de insumo.
--
-- Idempotente: pode rodar quantas vezes quiser.
-- =============================================================================

ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS fabric_family text;
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS color_tier    text;
CREATE INDEX IF NOT EXISTS idx_insumos_fabric_family ON public.insumos(fabric_family);

-- ---------------------------------------------------------------------------
-- 1. Os 15 tecidos (5 famílias × 3 faixas), já com família e faixa
--    Custo 0 de propósito: você lança conforme comprar.
-- ---------------------------------------------------------------------------
INSERT INTO public.insumos
  (name, unit, average_unit_cost, category, rendimento, min_stock, supplier_id, fabric_family, color_tier, notes)
SELECT v.name, v.unit, 0, 'Tecidos', v.rendimento, v.min_stock, s.id, v.familia, v.faixa, v.notas
FROM (VALUES
  ('Brim Leve Cedropac — Branco/Cru',                  'm',  1.00, 200, 'Cedro Têxtil', 'Brim Leve Cedropac',                   'Branco',   'Sarja 2x1 · 100% algodao · 190-245 g/m2 · larg. 1,60m. 2 cores: Branco, Cru/Natural. PREENCHER CUSTO/M.'),
  ('Brim Leve Cedropac — Padrão',                      'm',  1.00, 400, 'Cedro Têxtil', 'Brim Leve Cedropac',                   'Padrão',   'Sarja 2x1 · 100% algodao · 190-245 g/m2 · larg. 1,60m. 15 cores. Faixa usada nas fichas tecnicas. PREENCHER CUSTO/M.'),
  ('Brim Leve Cedropac — Especial',                    'm',  1.00, 200, 'Cedro Têxtil', 'Brim Leve Cedropac',                   'Especial', 'Sarja 2x1 · 100% algodao · 190-245 g/m2 · larg. 1,60m. 2 cores: Azul Marinho, Preto. PREENCHER CUSTO/M.'),
  ('Brim Pesado Cedropac — Branco/Cru',                'm',  1.00, 100, 'Cedro Têxtil', 'Brim Pesado Cedropac',                 'Branco',   'Sarja 3x1 · 100% algodao · 260-380 g/m2 · larg. 1,60m. 2 cores: Branco, Cru/Natural. PREENCHER CUSTO/M.'),
  ('Brim Pesado Cedropac — Padrão',                    'm',  1.00, 300, 'Cedro Têxtil', 'Brim Pesado Cedropac',                 'Padrão',   'Sarja 3x1 · 100% algodao · 260-380 g/m2 · larg. 1,60m. 8 cores. Faixa usada nas fichas tecnicas. PREENCHER CUSTO/M.'),
  ('Brim Pesado Cedropac — Especial',                  'm',  1.00, 200, 'Cedro Têxtil', 'Brim Pesado Cedropac',                 'Especial', 'Sarja 3x1 · 100% algodao · 260-380 g/m2 · larg. 1,60m. 4 cores: Marinho, Preto, Camuflado, Azul Motorista. PREENCHER CUSTO/M.'),
  ('Malha PV Anti Pilling (Guimatex 167) — Branco',    'kg', 3.37,  40, 'Guimatex',     'Malha PV Anti Pilling (Guimatex 167)',  'Branco',   '65% PES / 35% viscose · 165 g/m2. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. PREENCHER CUSTO/KG.'),
  ('Malha PV Anti Pilling (Guimatex 167) — Padrão',    'kg', 3.37,  60, 'Guimatex',     'Malha PV Anti Pilling (Guimatex 167)',  'Padrão',   '65% PES / 35% viscose · 165 g/m2. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. Faixa usada nas fichas. PREENCHER CUSTO/KG.'),
  ('Malha PV Anti Pilling (Guimatex 167) — Especial',  'kg', 3.37,  30, 'Guimatex',     'Malha PV Anti Pilling (Guimatex 167)',  'Especial', '65% PES / 35% viscose · 165 g/m2. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. PREENCHER CUSTO/KG.'),
  ('Malha Piquet PV (Guimatex 154) — Branco',          'kg', 3.47,  30, 'Guimatex',     'Malha Piquet PV (Guimatex 154)',        'Branco',   '73,35% PES / 26,65% viscose · 160 g/m2. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. PREENCHER CUSTO/KG.'),
  ('Malha Piquet PV (Guimatex 154) — Padrão',          'kg', 3.47,  50, 'Guimatex',     'Malha Piquet PV (Guimatex 154)',        'Padrão',   '73,35% PES / 26,65% viscose · 160 g/m2. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. Faixa usada nas fichas. PREENCHER CUSTO/KG.'),
  ('Malha Piquet PV (Guimatex 154) — Especial',        'kg', 3.47,  30, 'Guimatex',     'Malha Piquet PV (Guimatex 154)',        'Especial', '73,35% PES / 26,65% viscose · 160 g/m2. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. PREENCHER CUSTO/KG.'),
  ('Tricoline MNPro — Branco',                         'm',  1.00, 100, 'MN Tecidos',   'Tricoline MNPro',                       'Branco',   '72% algodao / 25% poliamida / 3% elastano · Easy Care. 2 cores: Branco, Branco Off. PREENCHER CUSTO/M.'),
  ('Tricoline MNPro — Padrão',                         'm',  1.00, 150, 'MN Tecidos',   'Tricoline MNPro',                       'Padrão',   '72% algodao / 25% poliamida / 3% elastano · Easy Care. 15 cores. Faixa usada nas fichas tecnicas. PREENCHER CUSTO/M.'),
  ('Tricoline MNPro — Especial',                       'm',  1.00, 100, 'MN Tecidos',   'Tricoline MNPro',                       'Especial', '72% algodao / 25% poliamida / 3% elastano · Easy Care. 5 cores. PREENCHER CUSTO/M.')
) AS v(name, unit, rendimento, min_stock, fornecedor, familia, faixa, notas)
LEFT JOIN LATERAL (
  SELECT sup.id FROM public.suppliers sup
  WHERE sup.company_name = v.fornecedor
  ORDER BY sup.created_at LIMIT 1
) s ON true
WHERE NOT EXISTS (SELECT 1 FROM public.insumos i WHERE i.name = v.name);

-- Se a linha já existia (rodada anterior parcial) mas sem família, corrige.
UPDATE public.insumos i SET fabric_family = v.familia, color_tier = v.faixa
FROM (VALUES
  ('Brim Leve Cedropac — Branco/Cru',                 'Brim Leve Cedropac',                   'Branco'),
  ('Brim Leve Cedropac — Padrão',                     'Brim Leve Cedropac',                   'Padrão'),
  ('Brim Leve Cedropac — Especial',                   'Brim Leve Cedropac',                   'Especial'),
  ('Brim Pesado Cedropac — Branco/Cru',               'Brim Pesado Cedropac',                 'Branco'),
  ('Brim Pesado Cedropac — Padrão',                   'Brim Pesado Cedropac',                 'Padrão'),
  ('Brim Pesado Cedropac — Especial',                 'Brim Pesado Cedropac',                 'Especial'),
  ('Malha PV Anti Pilling (Guimatex 167) — Branco',   'Malha PV Anti Pilling (Guimatex 167)', 'Branco'),
  ('Malha PV Anti Pilling (Guimatex 167) — Padrão',   'Malha PV Anti Pilling (Guimatex 167)', 'Padrão'),
  ('Malha PV Anti Pilling (Guimatex 167) — Especial', 'Malha PV Anti Pilling (Guimatex 167)', 'Especial'),
  ('Malha Piquet PV (Guimatex 154) — Branco',         'Malha Piquet PV (Guimatex 154)',       'Branco'),
  ('Malha Piquet PV (Guimatex 154) — Padrão',         'Malha Piquet PV (Guimatex 154)',       'Padrão'),
  ('Malha Piquet PV (Guimatex 154) — Especial',       'Malha Piquet PV (Guimatex 154)',       'Especial'),
  ('Tricoline MNPro — Branco',                        'Tricoline MNPro',                      'Branco'),
  ('Tricoline MNPro — Padrão',                        'Tricoline MNPro',                      'Padrão'),
  ('Tricoline MNPro — Especial',                      'Tricoline MNPro',                      'Especial')
) AS v(name, familia, faixa)
WHERE i.name = v.name
  AND (i.fabric_family IS DISTINCT FROM v.familia OR i.color_tier IS DISTINCT FROM v.faixa);

-- ---------------------------------------------------------------------------
-- 2. Religa a ficha técnica — as 20 linhas de tecido que não entraram.
--    Casa por família+faixa Padrão, então independe do nome exato do insumo.
-- ---------------------------------------------------------------------------
INSERT INTO public.product_insumos (product_id, insumo_id, quantity)
SELECT p.id, i.id, v.qty
FROM (VALUES
  ('Camisa Operacional (MC)',        'Brim Leve Cedropac',                   1.50::numeric),
  ('Camisa Operacional (ML)',        'Brim Leve Cedropac',                   1.80::numeric),
  ('Calça Operacional Reforçada',    'Brim Pesado Cedropac',                 1.40::numeric),
  ('Macacão Proteção Total',         'Brim Pesado Cedropac',                 2.80::numeric),
  ('Jaleco Operacional (Guarda-pó)', 'Brim Pesado Cedropac',                 1.90::numeric),
  ('Camiseta Base Alimentar (PV)',   'Malha PV Anti Pilling (Guimatex 167)', 0.300::numeric),
  ('Calça Flexível (Laticínio/SIF)', 'Brim Leve Cedropac',                   1.40::numeric),
  ('Touca Árabe Protetora',          'Malha PV Anti Pilling (Guimatex 167)', 0.100::numeric),
  ('Jaleco Supervisão (Área Limpa)', 'Brim Leve Cedropac',                   1.90::numeric),
  ('Jaleco Clínico (MC e ML)',       'Brim Leve Cedropac',                   1.80::numeric),
  ('Túnica Clínica (Scrub)',         'Brim Leve Cedropac',                   1.60::numeric),
  ('Calça Conforto',                 'Brim Leve Cedropac',                   1.40::numeric),
  ('Avental Proteção Frontal',       'Brim Leve Cedropac',                   1.20::numeric),
  ('Camisa Executiva (MC/ML)',       'Tricoline MNPro',                      1.70::numeric),
  ('Polo Corporativa',               'Malha Piquet PV (Guimatex 154)',       0.320::numeric),
  ('Calça Alfaiataria Corporativa',  'Tricoline MNPro',                      1.40::numeric),
  ('Saia Lápis Executiva',           'Tricoline MNPro',                      0.80::numeric),
  ('Camiseta Básica (Malha)',        'Malha PV Anti Pilling (Guimatex 167)', 0.300::numeric),
  ('Polo Piquet Básica',             'Malha Piquet PV (Guimatex 154)',       0.320::numeric),
  ('Calça Brim Leve',                'Brim Leve Cedropac',                   1.40::numeric)
) AS v(produto, familia, qty)
JOIN public.products p ON p.name = v.produto
JOIN public.insumos  i ON i.fabric_family = v.familia AND i.color_tier = 'Padrão'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_insumos pi
  WHERE pi.product_id::text = p.id::text AND pi.insumo_id = i.id
);

-- ---------------------------------------------------------------------------
-- 3. Tecido padrão do produto (ficou NULL porque o insumo não existia)
-- ---------------------------------------------------------------------------
UPDATE public.products p
SET default_fabric_insumo_id = i.id
FROM public.product_insumos pi
JOIN public.insumos i ON i.id::text = pi.insumo_id::text
WHERE pi.product_id::text = p.id::text
  AND i.category = 'Tecidos'
  AND p.default_fabric_insumo_id IS NULL;

-- =============================================================================
-- Confira depois de rodar — todos devem bater:
-- =============================================================================
SELECT 'insumos com fabric_family' AS check, count(*)::text AS valor, '15' AS esperado
FROM public.insumos WHERE fabric_family IS NOT NULL
UNION ALL SELECT 'insumos categoria Tecidos', count(*)::text, '18 (ou mais, se voce ja tinha)'
FROM public.insumos WHERE lower(category) IN ('tecidos','tecido')
UNION ALL SELECT 'linhas de ficha tecnica', count(*)::text, '79'
FROM public.product_insumos
UNION ALL SELECT 'faixas de cor SEM insumo', count(*)::text, '0'
FROM (SELECT DISTINCT fc.fabric_family, fc.color_tier FROM public.fabric_colors fc
      WHERE NOT EXISTS (SELECT 1 FROM public.insumos i
                        WHERE i.fabric_family = fc.fabric_family AND i.color_tier = fc.color_tier)) x
UNION ALL SELECT 'produtos sem tecido padrao', count(*)::text, '0'
FROM public.products WHERE default_fabric_insumo_id IS NULL
  AND category IN ('Operacional','Alimentar','Saúde','Corporativa','Essencial');

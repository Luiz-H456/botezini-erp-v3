-- =============================================================================
-- Seed: Fornecedores + Insumos homologados da Botezini
-- Run no SQL Editor do Supabase. Idempotente (insere só o que não existe).
--
-- Fonte dos tecidos: cartela oficial botezini.com.br/cores — 5 tecidos
-- homologados. Linha Alimentar e Linha Saúde não têm tecido próprio: reusam
-- Brim Leve / Malha PV / Piquet PV com restrição de cor (BPF/ANVISA).
--
-- MODELO DE PREÇO POR COR ------------------------------------------------
-- Cada tecido vira 3 insumos, um por faixa de preço de tingimento:
--   · Branco/Cru  — sem tingimento pesado, normalmente o mais barato
--   · Padrão      — o grosso da cartela. É PARA CÁ que a ficha técnica aponta.
--   · Especial    — pretos, marinhos, camuflado e tons saturados; mais caro
-- No pedido, se a cor cair fora da faixa padrão, troque o tecido no item —
-- a Lista de Compras já respeita essa troca (fabric_insumo_id do item).
-- As cores de cada faixa estão listadas em notes, direto da cartela.
--
-- ATENÇÃO: todos os tecidos entram com custo 0. Cedro, Guimatex e MN não
-- publicam tabela; só você tem o preço de compra. Preencha antes de usar a
-- Lista de Compras, senão ela fecha em R$ 0,00. Aviamentos já vêm com preço.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fornecedores
-- ---------------------------------------------------------------------------
INSERT INTO public.suppliers (company_name, category, phone)
SELECT v.company_name, v.category, v.phone
FROM (VALUES
  ('Cedro Têxtil',             'Tecidos',    NULL),
  ('Guimatex',                 'Tecidos',    NULL),
  ('MN Tecidos',               'Tecidos',    '(11) 2095-9799'),
  ('Dicatex',                  'Aviamentos', '(43) 3202-6218'),
  ('Aviamentos São Paulo',     'Aviamentos', NULL),
  ('Casa Criativa Aviamentos', 'Aviamentos', NULL)
) AS v(company_name, category, phone)
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.company_name = v.company_name);

-- ---------------------------------------------------------------------------
-- 2. Tecidos homologados — 5 tecidos × 3 faixas de cor
--    Categoria 'Tecidos' é obrigatória: a Lista de Compras usa essa categoria
--    para permitir a troca de tecido no item do pedido.
--
--    Brim e Tricoline: comprados por METRO -> unit 'm',  rendimento 1
--    Malhas Guimatex:  compradas por QUILO -> unit 'kg', rendimento = m/kg
--      rendimento = 1 / (gramatura_kg/m² × largura_m)
--      PV 165g/m² @1,80m -> 3,37 m/kg | Piquet 160g/m² @1,80m -> 3,47 m/kg
--      Se a largura do seu fornecedor for outra, corrija — o ProductForm
--      divide o custo/kg por esse número para achar o custo/metro.
-- ---------------------------------------------------------------------------
INSERT INTO public.insumos (name, unit, average_unit_cost, category, rendimento, min_stock, supplier_id, notes)
SELECT v.name, v.unit, 0, 'Tecidos', v.rendimento, v.min_stock,
       (SELECT id FROM public.suppliers WHERE company_name = v.supplier_name), v.notes
FROM (VALUES
  -- ===================== BRIM LEVE CEDROPAC (Cedro, Sarja 2x1) =====================
  -- 100% algodão · 190-245 g/m² · UV 50+ · repelência química · larg. 1,60m
  -- Linhas: Operacional, Alimentar, Saúde, Essencial · 19 cores
  ('Brim Leve Cedropac — Branco/Cru', 'm', 1::numeric, 200::numeric, 'Cedro Têxtil',
   'Cedro Sarja 2x1 · 100% algodão · 190-245 g/m² · UV 50+ · larg. 1,60m. FAIXA BRANCO/CRU (2 cores): Branco, Cru/Natural. PREENCHER CUSTO/M.'),
  ('Brim Leve Cedropac — Padrão', 'm', 1::numeric, 400::numeric, 'Cedro Têxtil',
   'Cedro Sarja 2x1 · 100% algodão · 190-245 g/m² · UV 50+ · larg. 1,60m. FAIXA PADRÃO (15 cores): Amarelo, Verde Claro, Azul Royal, Cinza Chumbo, Laranja, Verde Bandeira, Marrom, Bege, Vermelho, Verde Militar, Cinza Claro, Caqui, Rosa Claro, Azul Celeste, Cinza. É a faixa usada nas fichas técnicas. PREENCHER CUSTO/M.'),
  ('Brim Leve Cedropac — Especial', 'm', 1::numeric, 200::numeric, 'Cedro Têxtil',
   'Cedro Sarja 2x1 · 100% algodão · 190-245 g/m² · UV 50+ · larg. 1,60m. FAIXA ESPECIAL (2 cores): Azul Marinho, Preto. PREENCHER CUSTO/M.'),

  -- ===================== BRIM PESADO CEDROPAC (Cedro, Sarja 3x1) =====================
  -- 100% algodão · 260-380 g/m² · UV 50+ · alta resistência · larg. 1,60m
  -- Linha: Operacional · 14 cores
  ('Brim Pesado Cedropac — Branco/Cru', 'm', 1::numeric, 100::numeric, 'Cedro Têxtil',
   'Cedro Sarja 3x1 · 100% algodão · 260-380 g/m² · UV 50+ · larg. 1,60m. FAIXA BRANCO/CRU (2 cores): Branco, Cru/Natural. PREENCHER CUSTO/M.'),
  ('Brim Pesado Cedropac — Padrão', 'm', 1::numeric, 300::numeric, 'Cedro Têxtil',
   'Cedro Sarja 3x1 · 100% algodão · 260-380 g/m² · UV 50+ · larg. 1,60m. FAIXA PADRÃO (8 cores): Verde Militar, Verde Bandeira, Cinza Claro, Bege, Azul Royal, Cinza Chumbo, Caqui, Marrom. É a faixa usada nas fichas técnicas. PREENCHER CUSTO/M.'),
  ('Brim Pesado Cedropac — Especial', 'm', 1::numeric, 200::numeric, 'Cedro Têxtil',
   'Cedro Sarja 3x1 · 100% algodão · 260-380 g/m² · UV 50+ · larg. 1,60m. FAIXA ESPECIAL (4 cores): Azul Marinho, Preto, Camuflado, Azul Motorista. Camuflado é estampado — costuma ter preço próprio, conferir. PREENCHER CUSTO/M.'),

  -- ===================== MALHA PV ANTI PILLING (Guimatex 167) =====================
  -- 65% poliéster / 35% viscose · 165 g/m² · UV 20-25 · anti pilling
  -- Linhas: Essencial, Alimentar · 18 cores · COMPRADA POR KG
  ('Malha PV Anti Pilling (Guimatex 167) — Branco', 'kg', 3.37::numeric, 40::numeric, 'Guimatex',
   '65% PES / 35% viscose · 165 g/m² · anti pilling. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA BRANCO (2 cores): Branco, Branco Gelo. PREENCHER CUSTO/KG.'),
  ('Malha PV Anti Pilling (Guimatex 167) — Padrão', 'kg', 3.37::numeric, 60::numeric, 'Guimatex',
   '65% PES / 35% viscose · 165 g/m² · anti pilling. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA PADRÃO (11 cores): Cinza Mescla, Cinza Claro, Azul Celeste, Verde, Verde Limão, Amarelo, Laranja, Vermelho, Rosa Claro, Caqui, Bege. É a faixa usada nas fichas técnicas. PREENCHER CUSTO/KG.'),
  ('Malha PV Anti Pilling (Guimatex 167) — Especial', 'kg', 3.37::numeric, 30::numeric, 'Guimatex',
   '65% PES / 35% viscose · 165 g/m² · anti pilling. Rendimento 3,37 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA ESPECIAL (5 cores): Cinza Escuro, Preto, Azul Royal, Azul Marinho, Bordo. PREENCHER CUSTO/KG.'),

  -- ===================== MALHA PIQUET PV (Guimatex 154) =====================
  -- 73,35% poliéster / 26,65% viscose · 160 g/m² · UV 50+
  -- Linhas: Essencial, Corporativa, Saúde · 18 cores · COMPRADA POR KG
  ('Malha Piquet PV (Guimatex 154) — Branco', 'kg', 3.47::numeric, 30::numeric, 'Guimatex',
   '73,35% PES / 26,65% viscose · 160 g/m² · UV 50+. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA BRANCO (2 cores): Branco, Branco Optical. PREENCHER CUSTO/KG.'),
  ('Malha Piquet PV (Guimatex 154) — Padrão', 'kg', 3.47::numeric, 50::numeric, 'Guimatex',
   '73,35% PES / 26,65% viscose · 160 g/m² · UV 50+. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA PADRÃO (11 cores): Cinza Mescla, Cinza Claro, Cinza Médio, Azul Piscina, Verde, Amarelo, Laranja, Vermelho, Rosa, Caqui, Marrom. É a faixa usada nas fichas técnicas. PREENCHER CUSTO/KG.'),
  ('Malha Piquet PV (Guimatex 154) — Especial', 'kg', 3.47::numeric, 30::numeric, 'Guimatex',
   '73,35% PES / 26,65% viscose · 160 g/m² · UV 50+. Rendimento 3,47 m/kg estimado p/ largura 1,80m — CONFIRMAR. FAIXA ESPECIAL (5 cores): Preto, Azul Royal, Azul Marinho, Verde Garrafa, Bordo. PREENCHER CUSTO/KG.'),

  -- ===================== TRICOLINE MNPRO (MN Tecidos, Paris Span/Viena) =====================
  -- 72% algodão / 25% poliamida / 3% elastano · secagem rápida · Easy Care
  -- Linha: Corporativa · 22 cores
  ('Tricoline MNPro — Branco', 'm', 1::numeric, 100::numeric, 'MN Tecidos',
   '72% algodão / 25% poliamida / 3% elastano · Easy Care. FAIXA BRANCO (2 cores): Branco, Branco Off. PREENCHER CUSTO/M.'),
  ('Tricoline MNPro — Padrão', 'm', 1::numeric, 150::numeric, 'MN Tecidos',
   '72% algodão / 25% poliamida / 3% elastano · Easy Care. FAIXA PADRÃO (15 cores): Bege, Creme, Amarelo Pálido, Rosa Claro, Rosa Velho, Salmon, Vermelho, Lilás, Azul Celeste, Azul Claro, Verde Água, Verde, Verde Militar, Cinza Claro, Cinza Médio. É a faixa usada nas fichas técnicas. PREENCHER CUSTO/M.'),
  ('Tricoline MNPro — Especial', 'm', 1::numeric, 100::numeric, 'MN Tecidos',
   '72% algodão / 25% poliamida / 3% elastano · Easy Care. FAIXA ESPECIAL (5 cores): Bordo, Azul Royal, Azul Marinho, Cinza Escuro, Preto. PREENCHER CUSTO/M.')
) AS v(name, unit, rendimento, min_stock, supplier_name, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.insumos i WHERE i.name = v.name);

-- ---------------------------------------------------------------------------
-- 3. Aviamentos — costura, bordado e fechamento
--    Unidades pensadas para a FICHA TÉCNICA (consumo por peça), não para a
--    embalagem de compra: botão em 'un' (7 botões/camisa), não em pacote.
--    Custo já convertido para a unidade de consumo. Preço público confirmado.
-- ---------------------------------------------------------------------------
INSERT INTO public.insumos (name, unit, average_unit_cost, category, rendimento, min_stock, supplier_id, notes)
SELECT v.name, v.unit, v.cost, 'Aviamentos', 1, v.min_stock,
       (SELECT id FROM public.suppliers WHERE company_name = v.supplier_name), v.notes
FROM (VALUES
  -- Linhas (cone é a unidade de compra; a ficha usa fração, ex. 0,04 cone/peça)
  ('Linha costura Alfa fio 120 (cone 5.000m)', 'un', 9.80::numeric,  20::numeric, 'Dicatex',
   '100% poliéster, 2 cabos. Máquina reta, tecido plano. R$0,00196/m.'),
  ('Linha costura Alfa fio 80 (cone 5.000m)',  'un', 12.82::numeric, 10::numeric, 'Dicatex',
   '100% poliéster, 2 cabos. Reta pesada / pesponto de brim e jeans. R$0,00256/m.'),
  ('Linha overloque poliéster (cone 5.000m)',  'un', 9.80::numeric,  20::numeric, 'Dicatex',
   'Fechamento de malha (PV e Piquet). Preço-base igual ao fio 120 — confirmar na compra.'),
  ('Linha bordado poliéster trilobal (cone 4.000m)', 'un', 13.50::numeric, 15::numeric, NULL,
   'Bordado computadorizado. Referência de revenda R$12,30-19,90 — não é preço de fábrica. Consumo varia por tamanho da logo; não entra na ficha padrão.'),

  -- Entretela (por metro — o consumo por peça é fração de metro)
  ('Entretela termocolante 41g/m² (1,50m)', 'm', 5.44::numeric, 25::numeric, 'Aviamentos São Paulo',
   'Colarinho, punho e pé de gola. Preço no lote de 25m; avulso R$7,99/m.'),
  ('Entretela rígida Ciboné (1,60m)',       'm', 24.42::numeric, 5::numeric, 'Aviamentos São Paulo',
   'Reforço estruturado (cós, vista de alfaiataria). Preço no lote de 25m; avulso R$25,00/m.'),

  -- Botões e zíperes (por unidade — é assim que entram na ficha técnica)
  ('Botão camisa 4 furos nº22', 'un', 0.0546::numeric, 1000::numeric, 'Casa Criativa Aviamentos',
   'R$7,86 o pacote de 144un. Camisa Executiva, Polo, Jaleco Clínico.'),
  ('Botão camisa 4 furos nº24', 'un', 0.0606::numeric, 1000::numeric, 'Casa Criativa Aviamentos',
   'R$8,73 o pacote de 144un. 18+ cores. Camisa e Calça Operacional.'),
  ('Zíper nylon comum 20cm',    'un', 0.2642::numeric,  200::numeric, 'Casa Criativa Aviamentos',
   'R$26,42 o pacote de 100un. Braguilha de calça e saia.'),
  ('Zíper nylon destacável 60cm', 'un', 0.5516::numeric, 100::numeric, 'Casa Criativa Aviamentos',
   'Macacão e japona térmica. Preço referenciado no invisível 50cm (R$55,16/100un) — CONFIRMAR, destacável costuma ser mais caro.')
) AS v(name, unit, cost, min_stock, supplier_name, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.insumos i WHERE i.name = v.name);

-- =============================================================================
-- Verificação:
--   SELECT i.category, i.name, i.unit, i.rendimento, i.average_unit_cost,
--          s.company_name AS fornecedor
--   FROM insumos i LEFT JOIN suppliers s ON s.id = i.supplier_id
--   ORDER BY i.category DESC, i.name;
--
-- Tecidos ainda sem custo (a Lista de Compras fecha em R$ 0,00 até zerar isso):
--   SELECT name, unit FROM insumos
--   WHERE category = 'Tecidos' AND average_unit_cost = 0 ORDER BY name;
-- =============================================================================

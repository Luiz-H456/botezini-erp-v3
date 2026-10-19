-- =============================================================================
-- Cartela de cores homologada — traz o /cores do site para dentro do ERP
-- Rodar DEPOIS de seed_insumos_homologados.sql.
--
-- PROBLEMA QUE ISSO RESOLVE
-- A cor do item do orçamento era texto livre. Consequências:
--   1. "AZUL MARINHO" / "MARINHO" / "AZ MARINHO" viravam 3 cores distintas;
--   2. o agrupamento do Cronograma do PCP (tecido -> cor -> tipo) fragmentava
--      e contava trocas de setup que não existem;
--   3. nada ligava a cor escolhida à faixa de preço do tecido — o usuário
--      tinha que saber de cabeça que marinho é faixa Especial e trocar o
--      insumo na mão.
--
-- Com esta tabela a cor vira dado: o seletor de cor mostra só as cores
-- homologadas do tecido escolhido e resolve sozinho a faixa de preço.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Família e faixa nos insumos de tecido
--    fabric_family = agrupa as 3 faixas do mesmo tecido
--    color_tier    = 'Branco' | 'Padrão' | 'Especial'
-- ---------------------------------------------------------------------------
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS fabric_family text;
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS color_tier    text;

CREATE INDEX IF NOT EXISTS idx_insumos_fabric_family ON public.insumos(fabric_family);

UPDATE public.insumos SET fabric_family = 'Brim Leve Cedropac',                  color_tier = 'Branco'   WHERE name = 'Brim Leve Cedropac — Branco/Cru';
UPDATE public.insumos SET fabric_family = 'Brim Leve Cedropac',                  color_tier = 'Padrão'   WHERE name = 'Brim Leve Cedropac — Padrão';
UPDATE public.insumos SET fabric_family = 'Brim Leve Cedropac',                  color_tier = 'Especial' WHERE name = 'Brim Leve Cedropac — Especial';
UPDATE public.insumos SET fabric_family = 'Brim Pesado Cedropac',                color_tier = 'Branco'   WHERE name = 'Brim Pesado Cedropac — Branco/Cru';
UPDATE public.insumos SET fabric_family = 'Brim Pesado Cedropac',                color_tier = 'Padrão'   WHERE name = 'Brim Pesado Cedropac — Padrão';
UPDATE public.insumos SET fabric_family = 'Brim Pesado Cedropac',                color_tier = 'Especial' WHERE name = 'Brim Pesado Cedropac — Especial';
UPDATE public.insumos SET fabric_family = 'Malha PV Anti Pilling (Guimatex 167)', color_tier = 'Branco'   WHERE name = 'Malha PV Anti Pilling (Guimatex 167) — Branco';
UPDATE public.insumos SET fabric_family = 'Malha PV Anti Pilling (Guimatex 167)', color_tier = 'Padrão'   WHERE name = 'Malha PV Anti Pilling (Guimatex 167) — Padrão';
UPDATE public.insumos SET fabric_family = 'Malha PV Anti Pilling (Guimatex 167)', color_tier = 'Especial' WHERE name = 'Malha PV Anti Pilling (Guimatex 167) — Especial';
UPDATE public.insumos SET fabric_family = 'Malha Piquet PV (Guimatex 154)',       color_tier = 'Branco'   WHERE name = 'Malha Piquet PV (Guimatex 154) — Branco';
UPDATE public.insumos SET fabric_family = 'Malha Piquet PV (Guimatex 154)',       color_tier = 'Padrão'   WHERE name = 'Malha Piquet PV (Guimatex 154) — Padrão';
UPDATE public.insumos SET fabric_family = 'Malha Piquet PV (Guimatex 154)',       color_tier = 'Especial' WHERE name = 'Malha Piquet PV (Guimatex 154) — Especial';
UPDATE public.insumos SET fabric_family = 'Tricoline MNPro',                      color_tier = 'Branco'   WHERE name = 'Tricoline MNPro — Branco';
UPDATE public.insumos SET fabric_family = 'Tricoline MNPro',                      color_tier = 'Padrão'   WHERE name = 'Tricoline MNPro — Padrão';
UPDATE public.insumos SET fabric_family = 'Tricoline MNPro',                      color_tier = 'Especial' WHERE name = 'Tricoline MNPro — Especial';

-- ---------------------------------------------------------------------------
-- 2. Cartela de cores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fabric_colors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  fabric_family text NOT NULL,
  color_name    text NOT NULL,
  hex           text NOT NULL DEFAULT '#888888',
  color_tier    text NOT NULL DEFAULT 'Padrão',
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fabric_colors_tier_valid CHECK (color_tier IN ('Branco','Padrão','Especial')),
  CONSTRAINT fabric_colors_unique UNIQUE (fabric_family, color_name)
);

CREATE INDEX IF NOT EXISTS idx_fabric_colors_family ON public.fabric_colors(fabric_family);

ALTER TABLE public.fabric_colors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fabric_colors' AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.fabric_colors
      FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fabric_colors TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Seed — 91 cores da cartela oficial /cores
-- ---------------------------------------------------------------------------
INSERT INTO public.fabric_colors (fabric_family, color_name, hex, color_tier, sort_order)
SELECT v.fam, v.cor, v.hex, v.tier, v.ord
FROM (VALUES
  -- ============ BRIM LEVE CEDROPAC (19 cores) ============
  ('Brim Leve Cedropac','Branco',          '#F5F5F5','Branco',   0),
  ('Brim Leve Cedropac','Cru/Natural',     '#EDE0CA','Branco',   1),
  ('Brim Leve Cedropac','Bege',            '#D4CAAD','Padrão',  10),
  ('Brim Leve Cedropac','Caqui',           '#C8B87A','Padrão',  11),
  ('Brim Leve Cedropac','Amarelo',         '#E09C10','Padrão',  12),
  ('Brim Leve Cedropac','Laranja',         '#D45C00','Padrão',  13),
  ('Brim Leve Cedropac','Vermelho',        '#A81C1C','Padrão',  14),
  ('Brim Leve Cedropac','Rosa Claro',      '#D4789A','Padrão',  15),
  ('Brim Leve Cedropac','Marrom',          '#6B3A1A','Padrão',  16),
  ('Brim Leve Cedropac','Verde Claro',     '#7AAABA','Padrão',  17),
  ('Brim Leve Cedropac','Verde Bandeira',  '#1A6B2A','Padrão',  18),
  ('Brim Leve Cedropac','Verde Militar',   '#4A6A2A','Padrão',  19),
  ('Brim Leve Cedropac','Azul Celeste',    '#5AA0D4','Padrão',  20),
  ('Brim Leve Cedropac','Azul Royal',      '#1A4AA8','Padrão',  21),
  ('Brim Leve Cedropac','Cinza Claro',     '#CAC4BE','Padrão',  22),
  ('Brim Leve Cedropac','Cinza',           '#888880','Padrão',  23),
  ('Brim Leve Cedropac','Cinza Chumbo',    '#505050','Padrão',  24),
  ('Brim Leve Cedropac','Azul Marinho',    '#0A1E50','Especial',30),
  ('Brim Leve Cedropac','Preto',           '#141414','Especial',31),

  -- ============ BRIM PESADO CEDROPAC (14 cores) ============
  ('Brim Pesado Cedropac','Branco',         '#F5F5F5','Branco',   0),
  ('Brim Pesado Cedropac','Cru/Natural',    '#EDE0CA','Branco',   1),
  ('Brim Pesado Cedropac','Bege',           '#D4CAAD','Padrão',  10),
  ('Brim Pesado Cedropac','Caqui',          '#C8B87A','Padrão',  11),
  ('Brim Pesado Cedropac','Marrom',         '#6B3A1A','Padrão',  12),
  ('Brim Pesado Cedropac','Verde Bandeira', '#1A6B2A','Padrão',  13),
  ('Brim Pesado Cedropac','Verde Militar',  '#4A6A2A','Padrão',  14),
  ('Brim Pesado Cedropac','Azul Royal',     '#1A4AA8','Padrão',  15),
  ('Brim Pesado Cedropac','Cinza Claro',    '#C4C4BE','Padrão',  16),
  ('Brim Pesado Cedropac','Cinza Chumbo',   '#505050','Padrão',  17),
  ('Brim Pesado Cedropac','Azul Marinho',   '#0A1E50','Especial',30),
  ('Brim Pesado Cedropac','Azul Motorista', '#1A3278','Especial',31),
  ('Brim Pesado Cedropac','Preto',          '#141414','Especial',32),
  ('Brim Pesado Cedropac','Camuflado',      '#5B6E53','Especial',33),

  -- ============ MALHA PV ANTI PILLING 167 (18 cores) ============
  ('Malha PV Anti Pilling (Guimatex 167)','Branco',       '#FFFFFF','Branco',   0),
  ('Malha PV Anti Pilling (Guimatex 167)','Branco Gelo',  '#F0F4F8','Branco',   1),
  ('Malha PV Anti Pilling (Guimatex 167)','Bege',         '#D4CAAD','Padrão',  10),
  ('Malha PV Anti Pilling (Guimatex 167)','Caqui',        '#C8B87A','Padrão',  11),
  ('Malha PV Anti Pilling (Guimatex 167)','Amarelo',      '#D4C000','Padrão',  12),
  ('Malha PV Anti Pilling (Guimatex 167)','Laranja',      '#D45C00','Padrão',  13),
  ('Malha PV Anti Pilling (Guimatex 167)','Vermelho',     '#A81C1C','Padrão',  14),
  ('Malha PV Anti Pilling (Guimatex 167)','Rosa Claro',   '#D4A0B4','Padrão',  15),
  ('Malha PV Anti Pilling (Guimatex 167)','Verde',        '#1A7A3A','Padrão',  16),
  ('Malha PV Anti Pilling (Guimatex 167)','Verde Limão',  '#7AB428','Padrão',  17),
  ('Malha PV Anti Pilling (Guimatex 167)','Azul Celeste', '#5AA0D4','Padrão',  18),
  ('Malha PV Anti Pilling (Guimatex 167)','Cinza Mescla', '#B0B0AB','Padrão',  19),
  ('Malha PV Anti Pilling (Guimatex 167)','Cinza Claro',  '#C8C8C0','Padrão',  20),
  ('Malha PV Anti Pilling (Guimatex 167)','Cinza Escuro', '#606060','Especial',30),
  ('Malha PV Anti Pilling (Guimatex 167)','Azul Royal',   '#1A4AA8','Especial',31),
  ('Malha PV Anti Pilling (Guimatex 167)','Azul Marinho', '#0A1E50','Especial',32),
  ('Malha PV Anti Pilling (Guimatex 167)','Bordo',        '#8A0A1A','Especial',33),
  ('Malha PV Anti Pilling (Guimatex 167)','Preto',        '#141414','Especial',34),

  -- ============ MALHA PIQUET PV 154 (18 cores) ============
  ('Malha Piquet PV (Guimatex 154)','Branco',          '#FFFFFF','Branco',   0),
  ('Malha Piquet PV (Guimatex 154)','Branco Optical',  '#FEF0EA','Branco',   1),
  ('Malha Piquet PV (Guimatex 154)','Caqui',           '#C8B87A','Padrão',  10),
  ('Malha Piquet PV (Guimatex 154)','Marrom',          '#6B3A1A','Padrão',  11),
  ('Malha Piquet PV (Guimatex 154)','Amarelo',         '#D4C000','Padrão',  12),
  ('Malha Piquet PV (Guimatex 154)','Laranja',         '#D45C00','Padrão',  13),
  ('Malha Piquet PV (Guimatex 154)','Vermelho',        '#A81C1C','Padrão',  14),
  ('Malha Piquet PV (Guimatex 154)','Rosa',            '#C87890','Padrão',  15),
  ('Malha Piquet PV (Guimatex 154)','Verde',           '#1A7A3A','Padrão',  16),
  ('Malha Piquet PV (Guimatex 154)','Azul Piscina',    '#2A90C8','Padrão',  17),
  ('Malha Piquet PV (Guimatex 154)','Cinza Mescla',    '#B0B0AB','Padrão',  18),
  ('Malha Piquet PV (Guimatex 154)','Cinza Claro',     '#C8C8C0','Padrão',  19),
  ('Malha Piquet PV (Guimatex 154)','Cinza Médio',     '#888880','Padrão',  20),
  ('Malha Piquet PV (Guimatex 154)','Verde Garrafa',   '#0A4A1E','Especial',30),
  ('Malha Piquet PV (Guimatex 154)','Azul Royal',      '#1A4AA8','Especial',31),
  ('Malha Piquet PV (Guimatex 154)','Azul Marinho',    '#0A1E50','Especial',32),
  ('Malha Piquet PV (Guimatex 154)','Bordo',           '#8A0A1A','Especial',33),
  ('Malha Piquet PV (Guimatex 154)','Preto',           '#141414','Especial',34),

  -- ============ TRICOLINE MNPRO (22 cores) ============
  ('Tricoline MNPro','Branco',          '#FAFAFA','Branco',   0),
  ('Tricoline MNPro','Branco Off',      '#F0E0E4','Branco',   1),
  ('Tricoline MNPro','Creme',           '#E8D6B4','Padrão',  10),
  ('Tricoline MNPro','Bege',            '#D0CBA8','Padrão',  11),
  ('Tricoline MNPro','Amarelo Pálido',  '#E0D078','Padrão',  12),
  ('Tricoline MNPro','Salmon',          '#D4907A','Padrão',  13),
  ('Tricoline MNPro','Rosa Claro',      '#E0A0B8','Padrão',  14),
  ('Tricoline MNPro','Rosa Velho',      '#C8889A','Padrão',  15),
  ('Tricoline MNPro','Vermelho',        '#A81C1C','Padrão',  16),
  ('Tricoline MNPro','Lilás',           '#B898C8','Padrão',  17),
  ('Tricoline MNPro','Verde Água',      '#78C8A8','Padrão',  18),
  ('Tricoline MNPro','Verde',           '#1A7A3A','Padrão',  19),
  ('Tricoline MNPro','Verde Militar',   '#4A6A2A','Padrão',  20),
  ('Tricoline MNPro','Azul Celeste',    '#B8BADB','Padrão',  21),
  ('Tricoline MNPro','Azul Claro',      '#5AA0D4','Padrão',  22),
  ('Tricoline MNPro','Cinza Claro',     '#C8C8C0','Padrão',  23),
  ('Tricoline MNPro','Cinza Médio',     '#888880','Padrão',  24),
  ('Tricoline MNPro','Bordo',           '#6A0A1A','Especial',30),
  ('Tricoline MNPro','Azul Royal',      '#1A4AA8','Especial',31),
  ('Tricoline MNPro','Azul Marinho',    '#0A1E50','Especial',32),
  ('Tricoline MNPro','Cinza Escuro',    '#505050','Especial',33),
  ('Tricoline MNPro','Preto',           '#141414','Especial',34)
) AS v(fam, cor, hex, tier, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fabric_colors fc
  WHERE fc.fabric_family = v.fam AND fc.color_name = v.cor
);

-- =============================================================================
-- Verificação:
--   SELECT fabric_family, color_tier, count(*)
--   FROM fabric_colors GROUP BY 1,2 ORDER BY 1,2;   -- deve somar 91
--
--   -- toda faixa de cor tem um insumo correspondente?
--   SELECT DISTINCT fc.fabric_family, fc.color_tier
--   FROM fabric_colors fc
--   WHERE NOT EXISTS (SELECT 1 FROM insumos i
--                     WHERE i.fabric_family = fc.fabric_family
--                       AND i.color_tier = fc.color_tier);   -- deve vir vazio
-- =============================================================================

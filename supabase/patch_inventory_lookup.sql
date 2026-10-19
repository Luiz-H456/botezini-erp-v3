-- =============================================================================
-- PATCH: lookup_values table + ensure insumos grants
-- Run this once in the Supabase SQL Editor
-- =============================================================================

-- 1. Create lookup_values table (stores units, categories etc)
CREATE TABLE IF NOT EXISTS lookup_values (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid,
  category   text NOT NULL,       -- e.g. 'unit', 'insumo_category'
  value      text NOT NULL,
  label      text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lookup_values_category ON lookup_values(category);

-- 2. Seed default units
INSERT INTO lookup_values (category, value, label, sort_order) VALUES
  ('unit', 'un',   'Unidade',   1),
  ('unit', 'kg',   'Quilograma',2),
  ('unit', 'g',    'Grama',     3),
  ('unit', 'm',    'Metro',     4),
  ('unit', 'm2',   'Metro²',    5),
  ('unit', 'l',    'Litro',     6),
  ('unit', 'ml',   'Mililitro', 7),
  ('unit', 'cx',   'Caixa',     8),
  ('unit', 'pc',   'Peça',      9),
  ('unit', 'rolo', 'Rolo',      10)
ON CONFLICT DO NOTHING;

-- 3. Seed default insumo categories
INSERT INTO lookup_values (category, value, label, sort_order) VALUES
  ('insumo_category', 'Tecidos',    'Tecidos',    1),
  ('insumo_category', 'Acessórios', 'Acessórios', 2),
  ('insumo_category', 'Embalagens', 'Embalagens', 3),
  ('insumo_category', 'Linhas',     'Linhas',     4),
  ('insumo_category', 'Botões',     'Botões',     5),
  ('insumo_category', 'Outros',     'Outros',     6)
ON CONFLICT DO NOTHING;

-- 4. Disable RLS + grant access (for tables added after initial schema run)
ALTER TABLE IF EXISTS lookup_values ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lookup_values FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lookup_values TO authenticated;

ALTER TABLE IF EXISTS insumos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE insumos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE insumos TO authenticated;

ALTER TABLE IF EXISTS insumo_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE insumo_movements FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE insumo_movements TO authenticated;

ALTER TABLE IF EXISTS product_insumos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE product_insumos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE product_insumos TO authenticated;

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

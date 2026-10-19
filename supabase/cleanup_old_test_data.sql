-- Cleanup old test/demo data after schema updates.
--
-- Safe workflow:
-- 1. Run this file as-is first. It only previews candidates.
-- 2. Review the result sets.
-- 3. If the preview is correct, change v_execute to true in the final DO block.
-- 4. Run the whole file again.
--
-- This script does not delete auth.users. It can optionally delete public.profiles
-- for test users if you set v_delete_profiles to true.

DROP TABLE IF EXISTS cleanup_patterns;
CREATE TEMP TABLE cleanup_patterns (
  pattern text NOT NULL
);

INSERT INTO cleanup_patterns (pattern) VALUES
  ('%teste%'),
  ('%test%'),
  ('%demo%'),
  ('%exemplo%'),
  ('%dummy%'),
  ('%fake%'),
  ('%sandbox%');

DROP TABLE IF EXISTS cleanup_manual_users;
CREATE TEMP TABLE cleanup_manual_users (
  id uuid PRIMARY KEY
);

-- Optional: add specific test user IDs here.
-- INSERT INTO cleanup_manual_users (id) VALUES
--   ('00000000-0000-0000-0000-000000000000');

DROP TABLE IF EXISTS cleanup_manual_ids;
CREATE TEMP TABLE cleanup_manual_ids (
  table_name text NOT NULL,
  id uuid NOT NULL
);

-- Optional: add specific row IDs here.
-- INSERT INTO cleanup_manual_ids (table_name, id) VALUES
--   ('clients', '00000000-0000-0000-0000-000000000000'),
--   ('orders', '00000000-0000-0000-0000-000000000000');

DROP TABLE IF EXISTS cleanup_candidates;
CREATE TEMP TABLE cleanup_candidates (
  table_name text NOT NULL,
  id uuid NOT NULL,
  reason text NOT NULL,
  label text
);

-- ---------------------------------------------------------------------------
-- Candidate discovery
-- ---------------------------------------------------------------------------

INSERT INTO cleanup_candidates
SELECT DISTINCT 'profiles', p.id, 'test profile/user', COALESCE(p.email, p.full_name, p.id::text)
FROM public.profiles p
WHERE p.id IN (SELECT id FROM cleanup_manual_users)
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(p.email, '') ILIKE pat.pattern
       OR COALESCE(p.full_name, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'clients', c.id, 'test client', COALESCE(c.company_name, c.contact_person, c.email, c.id::text)
FROM public.clients c
WHERE c.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'clients')
   OR c.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(c.company_name, '') ILIKE pat.pattern
       OR COALESCE(c.contact_person, '') ILIKE pat.pattern
       OR COALESCE(c.email, '') ILIKE pat.pattern
       OR COALESCE(c.category, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'suppliers', s.id, 'test supplier', COALESCE(s.company_name, s.contact_person, s.email, s.id::text)
FROM public.suppliers s
WHERE s.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'suppliers')
   OR s.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(s.company_name, '') ILIKE pat.pattern
       OR COALESCE(s.contact_person, '') ILIKE pat.pattern
       OR COALESCE(s.email, '') ILIKE pat.pattern
       OR COALESCE(s.category, '') ILIKE pat.pattern
       OR COALESCE(s.default_sub_category, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'products', p.id, 'test product', COALESCE(p.name, p.sku, p.id::text)
FROM public.products p
WHERE p.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'products')
   OR p.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(p.name, '') ILIKE pat.pattern
       OR COALESCE(p.sku, '') ILIKE pat.pattern
       OR COALESCE(p.description, '') ILIKE pat.pattern
       OR COALESCE(p.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'insumos', i.id, 'test insumo', COALESCE(i.name, i.category, i.id::text)
FROM public.insumos i
WHERE i.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'insumos')
   OR i.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR i.supplier_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'suppliers')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(i.name, '') ILIKE pat.pattern
       OR COALESCE(i.category, '') ILIKE pat.pattern
       OR COALESCE(i.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'bank_accounts', b.id, 'test bank account', COALESCE(b.name, b.bank_name, b.id::text)
FROM public.bank_accounts b
WHERE b.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'bank_accounts')
   OR b.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(b.name, '') ILIKE pat.pattern
       OR COALESCE(b.bank_name, '') ILIKE pat.pattern
       OR COALESCE(b.account_number, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'cost_centers', cc.id, 'test cost center', COALESCE(cc.name, cc.id::text)
FROM public.cost_centers cc
WHERE cc.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'cost_centers')
   OR cc.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(cc.name, '') ILIKE pat.pattern
       OR COALESCE(cc.type, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'financial_categories', fc.id, 'test financial category', COALESCE(fc.name, fc.code, fc.id::text)
FROM public.financial_categories fc
WHERE fc.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'financial_categories')
   OR fc.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(fc.name, '') ILIKE pat.pattern
       OR COALESCE(fc.code, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'global_categories', gc.id, 'test global category', COALESCE(gc.name, gc.id::text)
FROM public.global_categories gc
WHERE gc.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'global_categories')
   OR gc.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(gc.name, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'budgets', b.id, 'test budget', COALESCE(b.serial_number, b.generated_order_number, b.id::text)
FROM public.budgets b
WHERE b.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'budgets')
   OR b.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR b.client_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(b.serial_number, '') ILIKE pat.pattern
       OR COALESCE(b.generated_order_number, '') ILIKE pat.pattern
       OR COALESCE(b.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'orders', o.id, 'test order', COALESCE(o.order_number, o.budget_serial_number, o.id::text)
FROM public.orders o
WHERE o.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'orders')
   OR o.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR o.budget_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'budgets')
   OR o.client_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(o.order_number, '') ILIKE pat.pattern
       OR COALESCE(o.budget_serial_number, '') ILIKE pat.pattern
       OR COALESCE(o.status, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'financial_obligations', fo.id, 'test obligation', COALESCE(fo.description, fo.notes, fo.id::text)
FROM public.financial_obligations fo
WHERE fo.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'financial_obligations')
   OR fo.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR fo.order_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'orders')
   OR fo.client_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients')
   OR fo.supplier_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'suppliers')
   OR fo.default_account_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'bank_accounts')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(fo.description, '') ILIKE pat.pattern
       OR COALESCE(fo.notes, '') ILIKE pat.pattern
       OR COALESCE(fo.category, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'obligation_payments', op.id, 'test payment', COALESCE(op.notes, op.id::text)
FROM public.obligation_payments op
WHERE op.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'obligation_payments')
   OR op.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR op.obligation_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'financial_obligations')
   OR op.account_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'bank_accounts')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(op.notes, '') ILIKE pat.pattern
       OR COALESCE(op.method, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'invoices', inv.id, 'test invoice', COALESCE(inv.order_number, inv.notes, inv.id::text)
FROM public.invoices inv
WHERE inv.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'invoices')
   OR inv.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR inv.client_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients')
   OR inv.order_id IN (SELECT id::text FROM cleanup_candidates WHERE table_name = 'orders')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(inv.order_number, '') ILIKE pat.pattern
       OR COALESCE(inv.notes, '') ILIKE pat.pattern
       OR COALESCE(inv.status, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'insumo_movements', im.id, 'test insumo movement', COALESCE(im.notes, im.id::text)
FROM public.insumo_movements im
WHERE im.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'insumo_movements')
   OR im.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR im.insumo_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumos')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(im.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'product_insumos', pi.id, 'test product/insumo relation', pi.id::text
FROM public.product_insumos pi
WHERE pi.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'product_insumos')
   OR pi.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR pi.product_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'products')
   OR pi.insumo_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumos');

INSERT INTO cleanup_candidates
SELECT DISTINCT 'product_materials', pm.id, 'test product material', pm.id::text
FROM public.product_materials pm
WHERE pm.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'product_materials')
   OR pm.product_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'products');

INSERT INTO cleanup_candidates
SELECT DISTINCT 'transactions_table', tx.id, 'test legacy transaction', COALESCE(tx.description, tx.notes, tx.id::text)
FROM public.transactions_table tx
WHERE tx.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'transactions_table')
   OR tx.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR tx.client_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients')
   OR tx.supplier_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'suppliers')
   OR tx.account_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'bank_accounts')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(tx.description, '') ILIKE pat.pattern
       OR COALESCE(tx.payee, '') ILIKE pat.pattern
       OR COALESCE(tx.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'payable_accounts_table', pa.id, 'test legacy payable', COALESCE(pa.description, pa.payee, pa.notes, pa.id::text)
FROM public.payable_accounts_table pa
WHERE pa.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'payable_accounts_table')
   OR pa.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR pa.supplier_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'suppliers')
   OR pa.bank_account_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'bank_accounts')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(pa.description, '') ILIKE pat.pattern
       OR COALESCE(pa.payee, '') ILIKE pat.pattern
       OR COALESCE(pa.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'cash_snapshots', cs.id, 'test cash snapshot', cs.snapshot_date::text
FROM public.cash_snapshots cs
WHERE cs.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'cash_snapshots')
   OR cs.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles');

INSERT INTO cleanup_candidates
SELECT DISTINCT 'budget_lines', bl.id, 'test budget line', COALESCE(bl.category, bl.notes, bl.id::text)
FROM public.budget_lines bl
WHERE bl.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'budget_lines')
   OR bl.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR bl.cost_center_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'cost_centers')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(bl.category, '') ILIKE pat.pattern
       OR COALESCE(bl.notes, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'app_settings', a.id, 'test app setting', COALESCE(a.key, a.id::text)
FROM public.app_settings a
WHERE a.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'app_settings')
   OR a.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(a.key, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'company_profile', cp.id, 'test company profile', COALESCE(cp.name, cp.email, cp.cnpj, cp.id::text)
FROM public.company_profile cp
WHERE cp.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'company_profile')
   OR cp.user_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(cp.name, '') ILIKE pat.pattern
       OR COALESCE(cp.email, '') ILIKE pat.pattern
       OR COALESCE(cp.cnpj, '') ILIKE pat.pattern
  );

-- WMS has no user_id in the live schema, so only text patterns/manual IDs are used.
INSERT INTO cleanup_candidates
SELECT DISTINCT 'wms_categories', wc.id, 'test wms category', COALESCE(wc.name, wc.id::text)
FROM public.wms_categories wc
WHERE wc.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'wms_categories')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(wc.name, '') ILIKE pat.pattern
       OR COALESCE(wc.description, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'wms_items', wi.id, 'test wms item', COALESCE(wi.name, wi.sku, wi.id::text)
FROM public.wms_items wi
WHERE wi.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'wms_items')
   OR wi.category_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_categories')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(wi.name, '') ILIKE pat.pattern
       OR COALESCE(wi.sku, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'wms_item_variations', wv.id, 'test wms variation', COALESCE(wv.name, wv.sku, wv.value, wv.id::text)
FROM public.wms_item_variations wv
WHERE wv.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'wms_item_variations')
   OR wv.item_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_items')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(wv.name, '') ILIKE pat.pattern
       OR COALESCE(wv.sku, '') ILIKE pat.pattern
       OR COALESCE(wv.value, '') ILIKE pat.pattern
  );

INSERT INTO cleanup_candidates
SELECT DISTINCT 'wms_stock_items', ws.id, 'test wms stock item', ws.id::text
FROM public.wms_stock_items ws
WHERE ws.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'wms_stock_items')
   OR ws.item_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_items')
   OR ws.variation_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_item_variations');

INSERT INTO cleanup_candidates
SELECT DISTINCT 'wms_stock_movements', wm.id, 'test wms stock movement', COALESCE(wm.notes, wm.id::text)
FROM public.wms_stock_movements wm
WHERE wm.id IN (SELECT id FROM cleanup_manual_ids WHERE table_name = 'wms_stock_movements')
   OR wm.stock_item_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_stock_items')
   OR EXISTS (
    SELECT 1 FROM cleanup_patterns pat
    WHERE COALESCE(wm.notes, '') ILIKE pat.pattern
  );

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------

SELECT table_name, count(*) AS rows_to_delete
FROM cleanup_candidates
GROUP BY table_name
ORDER BY table_name;

SELECT *
FROM cleanup_candidates
ORDER BY table_name, label
LIMIT 500;

-- ---------------------------------------------------------------------------
-- Execute
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_execute boolean := false; -- Change to true only after reviewing the preview.
  v_delete_profiles boolean := false; -- Also removes public.profiles for test users.
BEGIN
  IF NOT v_execute THEN
    RAISE NOTICE 'Preview only. Set v_execute = true in this DO block to delete candidates.';
    RETURN;
  END IF;

  DELETE FROM public.wms_stock_movements
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_stock_movements');

  DELETE FROM public.wms_stock_items
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_stock_items');

  DELETE FROM public.wms_item_variations
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_item_variations');

  DELETE FROM public.wms_items
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_items');

  DELETE FROM public.wms_categories
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'wms_categories');

  DELETE FROM public.obligation_payments
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'obligation_payments')
     OR obligation_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'financial_obligations');

  DELETE FROM public.financial_obligations
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'financial_obligations');

  DELETE FROM public.invoices
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'invoices');

  DELETE FROM public.insumo_movements
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumo_movements')
     OR insumo_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumos');

  DELETE FROM public.product_insumos
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'product_insumos')
     OR product_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'products')
     OR insumo_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumos');

  DELETE FROM public.product_materials
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'product_materials')
     OR product_id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'products');

  DELETE FROM public.orders
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'orders');

  DELETE FROM public.budgets
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'budgets');

  DELETE FROM public.transactions_table
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'transactions_table');

  DELETE FROM public.payable_accounts_table
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'payable_accounts_table');

  DELETE FROM public.cash_snapshots
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'cash_snapshots');

  DELETE FROM public.budget_lines
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'budget_lines');

  DELETE FROM public.app_settings
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'app_settings');

  DELETE FROM public.company_profile
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'company_profile');

  DELETE FROM public.products
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'products');

  DELETE FROM public.insumos
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'insumos');

  DELETE FROM public.suppliers
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'suppliers');

  DELETE FROM public.clients
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'clients');

  DELETE FROM public.bank_accounts
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'bank_accounts')
    AND NOT EXISTS (
      SELECT 1 FROM public.obligation_payments op
      WHERE op.account_id = bank_accounts.id
    );

  DELETE FROM public.financial_categories
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'financial_categories');

  DELETE FROM public.cost_centers
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'cost_centers');

  DELETE FROM public.global_categories
  WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'global_categories');

  IF v_delete_profiles THEN
    DELETE FROM public.profiles
    WHERE id IN (SELECT id FROM cleanup_candidates WHERE table_name = 'profiles');
  END IF;
END;
$$;

-- =============================================================================
-- BOTEZINI PVD — SCHEMA COMPLETO SUPABASE POSTGRESQL
-- Single-user app. SEM RLS. SEM policies. SEM triggers de auth.
-- Apenas um trigger por tabela: updated_at.
-- snake_case em tudo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSÕES
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- FUNÇÃO GENÉRICA PARA O TRIGGER DE updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. COMPANY_PROFILE
-- =============================================================================
CREATE TABLE IF NOT EXISTS company_profile (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid UNIQUE,
  name                  text NOT NULL,
  cnpj                  text,
  email                 text,
  phone                 text,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  website               text,
  logo_url              text,
  primary_color         text,
  bank_name             text,
  agency                text,
  account_number        text,
  bank_holder           text,
  pix_key               text,
  bank_info             text,
  payment_terms         text,
  default_validity_days integer,
  revenue_goal          numeric(15,2),
  expense_limit         numeric(15,2),
  monthly_capacity      numeric(15,2),
  target_margin         numeric(5,2),
  default_tax_rate      numeric(5,2),
  default_commission    numeric(5,2),
  labor_cost_per_hour   numeric(15,2),
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_company_profile_updated_at
  BEFORE UPDATE ON company_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 2. PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  role       text NOT NULL DEFAULT 'factory',
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Trigger: cria profile automaticamente ao criar usuário no Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, 'factory', NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_on_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 3. CLIENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS clients (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        uuid,
  company_name   text NOT NULL,
  category       text,
  cnpj           text,
  contact_person text,
  email          text,
  phone          text,
  address        text,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4. SUPPLIERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                uuid,
  company_name           text NOT NULL,
  category               text,
  cnpj                   text,
  contact_person         text,
  email                  text,
  phone                  text,
  address                text,
  default_cost_center_id uuid,
  default_sub_category   text,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5. COST_CENTERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS cost_centers (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid,
  name         text NOT NULL,
  type         text,
  color        text,
  budget_limit numeric(15,2),
  is_active    boolean NOT NULL DEFAULT true,
  categories   jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_user_id ON cost_centers(user_id);
CREATE TRIGGER trg_cost_centers_updated_at
  BEFORE UPDATE ON cost_centers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE suppliers
  ADD CONSTRAINT fk_suppliers_cost_center
    FOREIGN KEY (default_cost_center_id)
    REFERENCES cost_centers(id)
    ON DELETE SET NULL;

-- =============================================================================
-- 6. BANK_ACCOUNTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid,
  name            text NOT NULL,
  type            text NOT NULL DEFAULT 'checking',
  bank_name       text,
  account_number  text,
  agency          text,
  initial_balance numeric(15,2) NOT NULL DEFAULT 0,
  current_balance numeric(15,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'BRL',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);
CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 7. FINANCIAL_CATEGORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS financial_categories (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid,
  name          text NOT NULL,
  type          text NOT NULL,
  parent_id     uuid REFERENCES financial_categories(id) ON DELETE SET NULL,
  code          text,
  is_deductible boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_categories_user_id   ON financial_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_categories_parent_id ON financial_categories(parent_id);
CREATE TRIGGER trg_financial_categories_updated_at
  BEFORE UPDATE ON financial_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 8. INSUMOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS insumos (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid,
  name              text NOT NULL,
  unit              text NOT NULL,
  current_stock     numeric(15,4) NOT NULL DEFAULT 0,
  min_stock         numeric(15,4) NOT NULL DEFAULT 0,
  average_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  category          text,
  rendimento        numeric(15,4) NOT NULL DEFAULT 1,
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE insumos DROP CONSTRAINT IF EXISTS insumos_supplier_id_fkey;
CREATE INDEX IF NOT EXISTS idx_insumos_user_id     ON insumos(user_id);
CREATE INDEX IF NOT EXISTS idx_insumos_supplier_id ON insumos(supplier_id);
CREATE TRIGGER trg_insumos_updated_at
  BEFORE UPDATE ON insumos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 9. PRODUCTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid,
  name                     text NOT NULL,
  description              text,
  sku                      text,
  category                 text,
  notes                    text,
  price_tier1              numeric(15,2) NOT NULL DEFAULT 0,
  price_tier2              numeric(15,2) NOT NULL DEFAULT 0,
  price_tier3              numeric(15,2) NOT NULL DEFAULT 0,
  average_unit_cost        numeric(15,4) NOT NULL DEFAULT 0,
  margin_alert             boolean NOT NULL DEFAULT false,
  fabric_consumption_m     numeric(15,4),
  default_fabric_insumo_id uuid REFERENCES insumos(id) ON DELETE SET NULL,
  labor_hourly_rate        numeric(15,2),
  labor_workers            integer,
  pieces_daily_capacity    integer,
  overhead_percent         numeric(5,2) DEFAULT 40,
  created_at               timestamptz NOT NULL DEFAULT NOW(),
  updated_at               timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 10. INSUMO_MOVEMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS insumo_movements (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid,
  insumo_id    uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  type         text NOT NULL,
  quantity     numeric(15,4) NOT NULL,
  unit_cost    numeric(15,4),
  total_cost   numeric(15,4),
  reference_id uuid,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insumo_movements_user_id    ON insumo_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_insumo_movements_insumo_id  ON insumo_movements(insumo_id);
CREATE INDEX IF NOT EXISTS idx_insumo_movements_created_at ON insumo_movements(created_at DESC);
CREATE TRIGGER trg_insumo_movements_updated_at
  BEFORE UPDATE ON insumo_movements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 11. PRODUCT_INSUMOS (BOM / Ficha Técnica)
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_insumos (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  insumo_id  uuid NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  quantity   numeric(15,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_insumos_product_id ON product_insumos(product_id);
CREATE INDEX IF NOT EXISTS idx_product_insumos_insumo_id  ON product_insumos(insumo_id);
CREATE TRIGGER trg_product_insumos_updated_at
  BEFORE UPDATE ON product_insumos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 12. BUDGETS
-- =============================================================================
CREATE TABLE IF NOT EXISTS budgets (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 uuid,
  serial_number           text NOT NULL,
  client_id               uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  date                    date NOT NULL,
  items                   jsonb NOT NULL DEFAULT '[]',
  customizations          jsonb NOT NULL DEFAULT '[]',
  extras                  jsonb NOT NULL DEFAULT '[]',
  subtotal_items          numeric(15,2) NOT NULL DEFAULT 0,
  subtotal_customizations numeric(15,2) NOT NULL DEFAULT 0,
  subtotal_extras         numeric(15,2) NOT NULL DEFAULT 0,
  discount                numeric(15,2) NOT NULL DEFAULT 0,
  total_amount            numeric(15,2) NOT NULL DEFAULT 0,
  down_payment_percent    numeric(5,2)  NOT NULL DEFAULT 0,
  down_payment_value      numeric(15,2) NOT NULL DEFAULT 0,
  delivery_payment_value  numeric(15,2) NOT NULL DEFAULT 0,
  validity_days           integer NOT NULL DEFAULT 30,
  delivery_time_days      integer,
  notes                   text,
  status                  text NOT NULL DEFAULT 'Draft',
  generated_order_number  text,
  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id   ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_client_id ON budgets(client_id);
CREATE INDEX IF NOT EXISTS idx_budgets_date      ON budgets(date DESC);
CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 13. ORDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid,
  budget_id            uuid REFERENCES budgets(id) ON DELETE SET NULL,
  budget_serial_number text,
  order_number         text NOT NULL,
  client_id            uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  production_stage     text,
  items                jsonb NOT NULL DEFAULT '[]',
  customizations       jsonb NOT NULL DEFAULT '[]',
  extras               jsonb NOT NULL DEFAULT '[]',
  total_amount         numeric(15,2) NOT NULL DEFAULT 0,
  amount_paid          numeric(15,2) NOT NULL DEFAULT 0,
  discount             numeric(15,2) NOT NULL DEFAULT 0,
  deadline             date NOT NULL,
  status               text NOT NULL DEFAULT 'Pendente',
  payment_status       text,
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_budget_id ON orders(budget_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 14. INVOICES
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid,
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  order_number text,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  due_date     date NOT NULL,
  payments     jsonb NOT NULL DEFAULT '[]',
  status       text NOT NULL DEFAULT 'open',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id   ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id  ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date  ON invoices(due_date);
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 15. TRANSACTIONS (modelo legado V1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid,
  type                text NOT NULL,
  description         text NOT NULL,
  amount              numeric(15,2) NOT NULL,
  date                date NOT NULL,
  due_date            date,
  payment_date        date,
  category_id         uuid REFERENCES financial_categories(id) ON DELETE SET NULL,
  category            text,
  cost_center_id      uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  account_id          uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  reference_id        uuid,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  supplier_id         uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  payee               text,
  splits              jsonb,
  is_paid             boolean NOT NULL DEFAULT false,
  is_recurring        boolean NOT NULL DEFAULT false,
  recurrence_id       uuid,
  installment_number  integer,
  total_installments  integer,
  ofx_id              text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_ofx_id  ON transactions(ofx_id) WHERE ofx_id IS NOT NULL;
CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 16. PAYABLE_ACCOUNTS (modelo legado V1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS payable_accounts (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            uuid,
  description        text NOT NULL,
  supplier_id        uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  payee              text,
  amount             numeric(15,2) NOT NULL,
  due_date           date NOT NULL,
  payment_date       date,
  is_paid            boolean NOT NULL DEFAULT false,
  cost_center_id     uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  category           text,
  bank_account_id    uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  recurrence_id      uuid,
  is_recurring       boolean NOT NULL DEFAULT false,
  installment_number integer,
  total_installments integer,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payable_accounts_user_id  ON payable_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_payable_accounts_due_date ON payable_accounts(due_date);
CREATE TRIGGER trg_payable_accounts_updated_at
  BEFORE UPDATE ON payable_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 17. FINANCIAL_OBLIGATIONS (modelo V2)
-- =============================================================================
CREATE TABLE IF NOT EXISTS financial_obligations (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid,
  type                 text NOT NULL,
  status               text NOT NULL DEFAULT 'open',
  description          text NOT NULL,
  original_amount      numeric(15,2) NOT NULL,
  due_date             date NOT NULL,
  issue_date           date NOT NULL DEFAULT CURRENT_DATE,
  category             text,
  cost_center_id       uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  notes                text,
  client_id            uuid REFERENCES clients(id) ON DELETE SET NULL,
  supplier_id          uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  default_account_id   uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  is_recurring         boolean NOT NULL DEFAULT false,
  recurrence_id        uuid,
  installment_no       integer,
  total_installments   integer,
  split_group_id       uuid,
  cancelled_at         timestamptz,
  cancelled_reason     text,
  is_reconciled        boolean NOT NULL DEFAULT false,
  unreconciled_reason  text,
  unreconciled_at      timestamptz,
  attachments          jsonb NOT NULL DEFAULT '[]',
  created_at           timestamptz NOT NULL DEFAULT NOW(),
  updated_at           timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_user_id       ON financial_obligations(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_type          ON financial_obligations(type);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_status        ON financial_obligations(status);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_due_date      ON financial_obligations(due_date);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_client_id     ON financial_obligations(client_id);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_supplier_id   ON financial_obligations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_recurrence_id ON financial_obligations(recurrence_id) WHERE recurrence_id IS NOT NULL;
CREATE TRIGGER trg_financial_obligations_updated_at
  BEFORE UPDATE ON financial_obligations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 18. OBLIGATION_PAYMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS obligation_payments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid,
  obligation_id uuid NOT NULL REFERENCES financial_obligations(id) ON DELETE CASCADE,
  amount        numeric(15,2) NOT NULL,
  payment_date  date NOT NULL,
  account_id    uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  method        text NOT NULL DEFAULT 'PIX',
  notes         text,
  attachments   jsonb NOT NULL DEFAULT '[]',
  reversed_at   timestamptz,
  reversed_by   uuid REFERENCES obligation_payments(id) ON DELETE SET NULL,
  reversal_of   uuid REFERENCES obligation_payments(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_obligation_id ON obligation_payments(obligation_id);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_account_id   ON obligation_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_payment_date ON obligation_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_obligation_payments_user_id      ON obligation_payments(user_id);

-- =============================================================================
-- 19. AUDIT_LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  action      text NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 20. PRODUCT_MATERIALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_materials (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    uuid REFERENCES products(id) ON DELETE CASCADE,
  stock_item_id uuid,
  quantity      numeric(12,3) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 21. SECTORS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sectors (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'ACTIVE',
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_sectors_updated_at
  BEFORE UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 22. WMS_CATEGORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS wms_categories (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         text NOT NULL,
  sector_id    uuid NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  description  text,
  default_unit text NOT NULL DEFAULT 'un',
  status       text NOT NULL DEFAULT 'ACTIVE',
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_wms_categories_updated_at
  BEFORE UPDATE ON wms_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 23. WMS_ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wms_items (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku                 text,
  name                text NOT NULL,
  category_id         uuid NOT NULL REFERENCES wms_categories(id) ON DELETE RESTRICT,
  has_variations      boolean NOT NULL DEFAULT false,
  default_supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'ACTIVE',
  min_stock           numeric(10,3) NOT NULL DEFAULT 5,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_wms_items_updated_at
  BEFORE UPDATE ON wms_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 24. WMS_ITEM_VARIATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wms_item_variations (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id    uuid NOT NULL REFERENCES wms_items(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL,
  value      text,
  sku        text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 25. WMS_STOCK_ITEMS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wms_stock_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id           uuid NOT NULL REFERENCES wms_items(id) ON DELETE CASCADE,
  variation_id      uuid REFERENCES wms_item_variations(id) ON DELETE RESTRICT,
  sector_id         uuid NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  current_quantity  numeric(10,3) NOT NULL DEFAULT 0,
  min_quantity      numeric(10,3) NOT NULL DEFAULT 0,
  unit              text NOT NULL,
  average_unit_cost numeric(10,2) NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'OK',
  created_at        timestamptz NOT NULL DEFAULT NOW(),
  updated_at        timestamptz NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_wms_stock_items_updated_at
  BEFORE UPDATE ON wms_stock_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 26. WMS_STOCK_MOVEMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wms_stock_movements (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_item_id uuid NOT NULL REFERENCES wms_stock_items(id) ON DELETE CASCADE,
  type          text NOT NULL,
  reason        text NOT NULL,
  quantity      numeric(10,3) NOT NULL,
  unit          text NOT NULL,
  balance_after numeric(10,3) NOT NULL,
  supplier_id   uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  unit_cost     numeric(10,2),
  total_cost    numeric(12,2),
  notes         text,
  movement_date timestamptz NOT NULL DEFAULT NOW(),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 27. BUDGET_LINES
-- =============================================================================
CREATE TABLE IF NOT EXISTS budget_lines (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid,
  cost_center_id  uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  category        text,
  year_month      text NOT NULL,
  budgeted_amount numeric(15,2) NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_lines_user_id     ON budget_lines(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_year_month  ON budget_lines(year_month);
CREATE INDEX IF NOT EXISTS idx_budget_lines_cost_center ON budget_lines(cost_center_id);
CREATE TRIGGER trg_budget_lines_updated_at
  BEFORE UPDATE ON budget_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 28. CASH_SNAPSHOTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS cash_snapshots (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid,
  snapshot_date       date NOT NULL,
  calculated_balance  numeric(15,2) NOT NULL,
  confirmed_balance   numeric(15,2),
  discrepancy         numeric(15,2),
  closed_by           text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_cash_snapshots_user_id       ON cash_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_cash_snapshots_snapshot_date ON cash_snapshots(snapshot_date DESC);

-- =============================================================================
-- 29. LOOKUP_VALUES
-- =============================================================================
CREATE TABLE IF NOT EXISTS lookup_values (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category   text NOT NULL,
  value      text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lookup_values_category ON lookup_values(category);
CREATE TRIGGER trg_lookup_values_updated_at
  BEFORE UPDATE ON lookup_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 30. APP_SETTINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid,
  key        text NOT NULL UNIQUE,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_settings_user_id ON app_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_key     ON app_settings(key);
CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- VIEW: obligation_summary
-- =============================================================================
CREATE OR REPLACE VIEW obligation_summary AS
SELECT
  o.*,
  COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) AS paid_amount,
  o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) AS remaining_amount,
  COUNT(p.id) FILTER (WHERE p.reversed_at IS NULL) AS payment_count,
  ROUND(
    CASE WHEN o.original_amount > 0
         THEN (COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) / o.original_amount) * 100
         ELSE 0
    END, 2
  ) AS paid_pct,
  CASE
    WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) >= o.original_amount THEN 'paid'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL), 0) > 0 THEN 'partial'
    WHEN o.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END::text AS derived_status
FROM financial_obligations o
LEFT JOIN obligation_payments p ON p.obligation_id = o.id
GROUP BY o.id;

-- =============================================================================
-- RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION update_bank_balance(
  p_account_id uuid,
  p_delta      numeric
) RETURNS void AS $$
BEGIN
  UPDATE bank_accounts
    SET current_balance = current_balance + p_delta,
        updated_at      = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pay_obligation(
  p_obligation_id uuid,
  p_amount        numeric,
  p_account_id    uuid,
  p_method        text  DEFAULT 'PIX',
  p_payment_date  date  DEFAULT CURRENT_DATE,
  p_notes         text  DEFAULT NULL,
  p_attachments   jsonb DEFAULT '[]'
) RETURNS uuid AS $$
DECLARE
  v_payment_id uuid;
  v_type       text;
  v_delta      numeric;
BEGIN
  SELECT type INTO v_type FROM financial_obligations WHERE id = p_obligation_id;
  v_delta := CASE WHEN v_type = 'receivable' THEN p_amount ELSE -p_amount END;
  INSERT INTO obligation_payments (
    obligation_id, amount, payment_date, account_id, method, notes, attachments
  ) VALUES (
    p_obligation_id, p_amount, p_payment_date, p_account_id,
    p_method, p_notes, COALESCE(p_attachments, '[]')
  ) RETURNING id INTO v_payment_id;
  PERFORM update_bank_balance(p_account_id, v_delta);
  UPDATE financial_obligations
    SET status = (SELECT derived_status FROM obligation_summary WHERE id = p_obligation_id),
        updated_at = NOW()
  WHERE id = p_obligation_id;
  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reverse_payment(
  p_payment_id uuid,
  p_reason     text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_pay         obligation_payments%ROWTYPE;
  v_type        text;
  v_delta       numeric;
  v_reversal_id uuid;
BEGIN
  SELECT * INTO v_pay FROM obligation_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found: %', p_payment_id; END IF;
  IF v_pay.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Payment already reversed'; END IF;
  SELECT type INTO v_type FROM financial_obligations WHERE id = v_pay.obligation_id;
  v_delta := CASE WHEN v_type = 'receivable' THEN -v_pay.amount ELSE v_pay.amount END;
  UPDATE obligation_payments SET reversed_at = NOW(), reversed_by = NULL WHERE id = p_payment_id;
  INSERT INTO obligation_payments (
    obligation_id, amount, payment_date, account_id, method, notes, reversal_of
  ) VALUES (
    v_pay.obligation_id, v_pay.amount, CURRENT_DATE, v_pay.account_id,
    v_pay.method, COALESCE(p_reason, 'Estorno'), p_payment_id
  ) RETURNING id INTO v_reversal_id;
  UPDATE obligation_payments SET reversed_by = v_reversal_id WHERE id = p_payment_id;
  PERFORM update_bank_balance(v_pay.account_id, v_delta);
  UPDATE financial_obligations
    SET status = (SELECT derived_status FROM obligation_summary WHERE id = v_pay.obligation_id),
        updated_at = NOW()
  WHERE id = v_pay.obligation_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cancel_obligation(
  p_obligation_id uuid,
  p_reason        text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM obligation_payments
    WHERE obligation_id = p_obligation_id AND reversed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Não é possível cancelar: existem pagamentos ativos';
  END IF;
  UPDATE financial_obligations
    SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = p_reason, updated_at = NOW()
  WHERE id = p_obligation_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_recurrence_obligations(
  p_type        text,
  p_description text,
  p_amount      numeric,
  p_first_due   date,
  p_months      integer,
  p_category    text DEFAULT NULL,
  p_cost_center text DEFAULT NULL,
  p_client_id   uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_account_id  uuid DEFAULT NULL,
  p_notes       text DEFAULT NULL
) RETURNS uuid[] AS $$
DECLARE
  v_recurrence_id uuid := uuid_generate_v4();
  v_ids           uuid[] := '{}';
  v_id            uuid;
  i               integer;
BEGIN
  FOR i IN 1..p_months LOOP
    INSERT INTO financial_obligations (
      type, status, description, original_amount,
      due_date, issue_date, category, cost_center_id,
      client_id, supplier_id, default_account_id, notes,
      is_recurring, recurrence_id, installment_no, total_installments
    ) VALUES (
      p_type, 'open', p_description, p_amount,
      (p_first_due + ((i - 1) || ' months')::interval)::date, CURRENT_DATE,
      p_category,
      CASE WHEN p_cost_center IS NOT NULL THEN p_cost_center::uuid ELSE NULL END,
      p_client_id, p_supplier_id, p_account_id, p_notes,
      true, v_recurrence_id, i, p_months
    ) RETURNING id INTO v_id;
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN v_ids;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION toggle_reconciliation(
  p_obligation_id uuid
) RETURNS boolean AS $$
DECLARE
  v_new boolean;
BEGIN
  UPDATE financial_obligations
    SET is_reconciled = NOT is_reconciled, updated_at = NOW()
  WHERE id = p_obligation_id
  RETURNING is_reconciled INTO v_new;
  RETURN v_new;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION undo_reconciliation(
  p_obligation_id uuid,
  p_reason        text DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  UPDATE financial_obligations
    SET is_reconciled = false, unreconciled_reason = p_reason,
        unreconciled_at = NOW(), updated_at = NOW()
  WHERE id = p_obligation_id;
  RETURN true;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalculate_all_bank_balances()
RETURNS void AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM bank_accounts LOOP
    UPDATE bank_accounts
      SET current_balance = initial_balance + COALESCE((
        SELECT SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END)
        FROM obligation_payments op
        JOIN financial_obligations fo ON fo.id = op.obligation_id
        WHERE op.account_id = r.id AND op.reversed_at IS NULL
      ), 0),
      updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_cash_position(
  p_start date DEFAULT NULL,
  p_end   date DEFAULT NULL
) RETURNS TABLE (
  projected_balance  numeric,
  reconciled_balance numeric,
  net_flow           numeric,
  total_receivable   numeric,
  total_payable      numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(current_balance) FROM bank_accounts WHERE is_active), 0) +
      COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
                WHERE type = 'receivable' AND derived_status NOT IN ('paid','cancelled')
                  AND (p_start IS NULL OR due_date >= p_start)
                  AND (p_end IS NULL OR due_date <= p_end)), 0) -
      COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
                WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
                  AND (p_start IS NULL OR due_date >= p_start)
                  AND (p_end IS NULL OR due_date <= p_end)), 0) AS projected_balance,
    (SELECT SUM(current_balance) FROM bank_accounts WHERE is_active) AS reconciled_balance,
    COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
              WHERE type = 'receivable' AND derived_status NOT IN ('paid','cancelled')
                AND (p_start IS NULL OR due_date >= p_start)
                AND (p_end IS NULL OR due_date <= p_end)), 0) -
    COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
              WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
                AND (p_start IS NULL OR due_date >= p_start)
                AND (p_end IS NULL OR due_date <= p_end)), 0) AS net_flow,
    COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
              WHERE type = 'receivable' AND derived_status NOT IN ('paid','cancelled')
                AND (p_start IS NULL OR due_date >= p_start)
                AND (p_end IS NULL OR due_date <= p_end)), 0) AS total_receivable,
    COALESCE((SELECT SUM(remaining_amount) FROM obligation_summary
              WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
                AND (p_start IS NULL OR due_date >= p_start)
                AND (p_end IS NULL OR due_date <= p_end)), 0) AS total_payable;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_aging_buckets(
  p_reference_date date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  obligation_type text,
  bucket          text,
  cnt             bigint,
  total_amount    numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    os.type,
    CASE
      WHEN os.due_date >= p_reference_date THEN 'current'
      WHEN os.due_date >= p_reference_date - INTERVAL '30 days' THEN '1_30'
      WHEN os.due_date >= p_reference_date - INTERVAL '60 days' THEN '31_60'
      ELSE '60_plus'
    END AS bucket,
    COUNT(*)::bigint,
    SUM(os.remaining_amount)
  FROM obligation_summary os
  WHERE os.derived_status NOT IN ('paid', 'cancelled')
  GROUP BY os.type, bucket;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_cashflow_series(
  p_start date,
  p_end   date
) RETURNS TABLE (
  series_date date,
  inflow      numeric,
  outflow     numeric,
  balance     numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH daily AS (
    SELECT
      op.payment_date AS series_date,
      SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN fo.type = 'payable'    THEN op.amount ELSE 0 END) AS outflow
    FROM obligation_payments op
    JOIN financial_obligations fo ON fo.id = op.obligation_id
    WHERE op.reversed_at IS NULL AND op.payment_date BETWEEN p_start AND p_end
    GROUP BY op.payment_date
  )
  SELECT d.series_date, d.inflow, d.outflow,
    SUM(d.inflow - d.outflow) OVER (ORDER BY d.series_date) AS balance
  FROM daily d ORDER BY d.series_date;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_liquidity_kpis(
  p_start date,
  p_end   date
) RETURNS TABLE (
  pmr_days          numeric,
  pmp_days          numeric,
  cce_days          numeric,
  coverage_days     numeric,
  avg_daily_outflow numeric
) AS $$
DECLARE
  v_pmr     numeric;
  v_pmp     numeric;
  v_coverage numeric;
  v_avg_out numeric;
BEGIN
  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmr
  FROM obligation_payments op
  JOIN financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'receivable' AND op.reversed_at IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmp
  FROM obligation_payments op
  JOIN financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable' AND op.reversed_at IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(op.amount) / NULLIF((p_end - p_start), 0), 0) INTO v_avg_out
  FROM obligation_payments op
  JOIN financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable' AND op.reversed_at IS NULL
    AND op.payment_date BETWEEN p_start AND p_end;

  SELECT CASE WHEN v_avg_out > 0
    THEN (SELECT SUM(current_balance) FROM bank_accounts WHERE is_active) / v_avg_out
    ELSE NULL END INTO v_coverage;

  RETURN QUERY SELECT
    ROUND(v_pmr, 1), ROUND(v_pmp, 1),
    ROUND(COALESCE(v_pmr, 0) - COALESCE(v_pmp, 0), 1),
    ROUND(v_coverage, 1), ROUND(v_avg_out, 2);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERMISSÕES
-- =============================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.' || quote_ident(t) || ' FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.' || quote_ident(t) || ' TO authenticated';
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT ON public.obligation_summary TO authenticated;

-- =============================================================================
-- RELOAD SCHEMA
-- =============================================================================
NOTIFY pgrst, 'reload schema';

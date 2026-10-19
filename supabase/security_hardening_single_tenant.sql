-- Security hardening for the single-tenant Botezini ERP.
-- Apply after the base schema/migrations.
-- Model: one company/tenant, authenticated users separated by role.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'manager'), false)
$$;

CREATE OR REPLACE FUNCTION public.is_factory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'factory', false)
$$;

CREATE OR REPLACE FUNCTION public.assert_finance_access()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Acesso financeiro negado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_or_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_factory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_finance_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_factory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_finance_access() TO authenticated;

-- New users must not be admins by default.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'factory';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, 'factory', NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = r.tablename
        AND policyname = 'single_tenant_admin_manager_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY single_tenant_admin_manager_all ON public.%I FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager())',
        r.tablename
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'single_tenant_profile_self_select'
  ) THEN
    CREATE POLICY single_tenant_profile_self_select
      ON public.profiles
      FOR SELECT TO authenticated
      USING (id = auth.uid());
  END IF;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['orders', 'clients', 'products', 'insumos', 'product_insumos']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = table_name
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'single_tenant_factory_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY single_tenant_factory_select ON public.%I FOR SELECT TO authenticated USING (public.is_factory())',
        table_name
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'single_tenant_factory_update_orders'
  ) THEN
    CREATE POLICY single_tenant_factory_update_orders
      ON public.orders
      FOR UPDATE TO authenticated
      USING (public.is_factory())
      WITH CHECK (public.is_factory());
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Constraints that protect new writes without requiring legacy data cleanup.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_obligations_original_amount_positive'
  ) THEN
    ALTER TABLE public.financial_obligations
      ADD CONSTRAINT financial_obligations_original_amount_positive
      CHECK (original_amount > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'obligation_payments_amount_positive'
  ) THEN
    ALTER TABLE public.obligation_payments
      ADD CONSTRAINT obligation_payments_amount_positive
      CHECK (amount > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'insumo_movements_quantity_positive'
  ) THEN
    ALTER TABLE public.insumo_movements
      ADD CONSTRAINT insumo_movements_quantity_positive
      CHECK (quantity > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'insumos_current_stock_nonnegative'
  ) THEN
    ALTER TABLE public.insumos
      ADD CONSTRAINT insumos_current_stock_nonnegative
      CHECK (current_stock >= 0) NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS budgets_serial_number_unique
  ON public.budgets(serial_number);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_unique
  ON public.orders(order_number);

ALTER TABLE public.financial_obligations
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Safer stock trigger: no negative stock and no invalid movement quantity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_insumo_stock_and_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insumo record;
  v_new_qty numeric;
  v_new_cost numeric;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Movement quantity must be positive';
  END IF;

  SELECT *
  INTO v_insumo
  FROM public.insumos
  WHERE id = NEW.insumo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo not found';
  END IF;

  IF NEW.type = 'IN' THEN
    IF NEW.unit_cost IS NULL OR NEW.unit_cost <= 0 THEN
      RAISE EXCEPTION 'Unit cost must be positive for stock entry';
    END IF;

    v_new_qty := v_insumo.current_stock + NEW.quantity;
    v_new_cost := (
      (v_insumo.current_stock * v_insumo.average_unit_cost)
      + (NEW.quantity * NEW.unit_cost)
    ) / NULLIF(v_new_qty, 0);
    NEW.total_cost := COALESCE(NEW.total_cost, NEW.quantity * NEW.unit_cost);
  ELSIF NEW.type = 'OUT' THEN
    IF v_insumo.current_stock < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for insumo %', NEW.insumo_id;
    END IF;

    v_new_qty := v_insumo.current_stock - NEW.quantity;
    v_new_cost := v_insumo.average_unit_cost;
    NEW.unit_cost := v_insumo.average_unit_cost;
    NEW.total_cost := NEW.quantity * v_insumo.average_unit_cost;
  ELSE
    RAISE EXCEPTION 'Invalid movement type. Must be IN or OUT.';
  END IF;

  UPDATE public.insumos
  SET current_stock = v_new_qty,
      average_unit_cost = COALESCE(v_new_cost, 0),
      updated_at = now()
  WHERE id = NEW.insumo_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_insumo_movements_after_insert ON public.insumo_movements;
CREATE TRIGGER trg_insumo_movements_after_insert
  BEFORE INSERT ON public.insumo_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_insumo_stock_and_cost();

-- ---------------------------------------------------------------------------
-- Safer finance RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_bank_balance(
  p_account_id uuid,
  p_delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();

  UPDATE public.bank_accounts
  SET current_balance = current_balance + p_delta,
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found: %', p_account_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_obligation(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_method text DEFAULT 'PIX',
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_obligation public.financial_obligations%ROWTYPE;
  v_paid numeric;
  v_remaining numeric;
  v_delta numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT *
  INTO v_obligation
  FROM public.financial_obligations
  WHERE id = p_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obligation not found: %', p_obligation_id;
  END IF;

  IF v_obligation.cancelled_at IS NOT NULL OR v_obligation.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot pay a cancelled obligation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_accounts
    WHERE id = p_account_id
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Bank account not found or inactive: %', p_account_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM public.obligation_payments
  WHERE obligation_id = p_obligation_id
    AND reversed_at IS NULL
    AND reversal_of IS NULL;

  v_remaining := v_obligation.original_amount - v_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;

  v_delta := CASE
    WHEN v_obligation.type = 'receivable' THEN p_amount
    ELSE -p_amount
  END;

  INSERT INTO public.obligation_payments (
    user_id,
    obligation_id,
    amount,
    payment_date,
    account_id,
    method,
    notes,
    attachments
  ) VALUES (
    auth.uid(),
    p_obligation_id,
    p_amount,
    p_payment_date,
    p_account_id,
    p_method,
    p_notes,
    COALESCE(p_attachments, '[]')
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.update_bank_balance(p_account_id, v_delta);

  UPDATE public.financial_obligations
  SET status = (
        SELECT derived_status
        FROM public.obligation_summary
        WHERE id = p_obligation_id
      ),
      updated_at = now()
  WHERE id = p_obligation_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.obligation_payments%ROWTYPE;
  v_type text;
  v_delta numeric;
  v_reversal_id uuid;
BEGIN
  PERFORM public.assert_finance_access();

  SELECT obligation_payments.*
  INTO v_pay
  FROM public.obligation_payments
  JOIN public.financial_obligations
    ON financial_obligations.id = obligation_payments.obligation_id
  WHERE obligation_payments.id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF v_pay.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment already reversed';
  END IF;

  IF v_pay.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'Nao e permitido estornar um registro de estorno';
  END IF;

  SELECT type
  INTO v_type
  FROM public.financial_obligations
  WHERE id = v_pay.obligation_id;

  v_delta := CASE
    WHEN v_type = 'receivable' THEN -v_pay.amount
    ELSE v_pay.amount
  END;

  UPDATE public.obligation_payments
  SET reversed_at = now(),
      reversed_by = NULL
  WHERE id = p_payment_id;

  INSERT INTO public.obligation_payments (
    user_id,
    obligation_id,
    amount,
    payment_date,
    account_id,
    method,
    notes,
    reversal_of
  ) VALUES (
    auth.uid(),
    v_pay.obligation_id,
    v_pay.amount,
    CURRENT_DATE,
    v_pay.account_id,
    v_pay.method,
    COALESCE(p_reason, 'Estorno'),
    p_payment_id
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.obligation_payments
  SET reversed_by = v_reversal_id
  WHERE id = p_payment_id;

  PERFORM public.update_bank_balance(v_pay.account_id, v_delta);

  UPDATE public.financial_obligations
  SET status = (
        SELECT derived_status
        FROM public.obligation_summary
        WHERE id = v_pay.obligation_id
      ),
      updated_at = now()
  WHERE id = v_pay.obligation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_obligation(
  p_obligation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();

  IF EXISTS (
    SELECT 1
    FROM public.obligation_payments
    JOIN public.financial_obligations
      ON financial_obligations.id = obligation_payments.obligation_id
    WHERE obligation_payments.obligation_id = p_obligation_id
      AND obligation_payments.reversed_at IS NULL
      AND obligation_payments.reversal_of IS NULL
  ) THEN
    RAISE EXCEPTION 'Nao e possivel cancelar: existem pagamentos ativos';
  END IF;

  UPDATE public.financial_obligations
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = p_reason,
      updated_at = now()
  WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obligation not found: %', p_obligation_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_recurrence_obligations(
  text, text, numeric, date, integer, text, text, uuid, uuid, uuid, text
) CASCADE;
DROP FUNCTION IF EXISTS public.create_recurrence_obligations(
  text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid
) CASCADE;
DROP FUNCTION IF EXISTS public.create_recurrence_obligations(
  text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid, uuid
) CASCADE;

CREATE OR REPLACE FUNCTION public.create_recurrence_obligations(
  p_type text,
  p_description text,
  p_amount numeric,
  p_first_due date,
  p_months integer,
  p_category text DEFAULT NULL,
  p_cost_center uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_global_category_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recurrence_id uuid := gen_random_uuid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_due_date date;
  i integer;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_type NOT IN ('receivable', 'payable') THEN
    RAISE EXCEPTION 'Invalid obligation type: %', p_type;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  IF p_months IS NULL OR p_months < 1 OR p_months > 120 THEN
    RAISE EXCEPTION 'Invalid recurrence length';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bank_accounts WHERE id = p_account_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;

  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id
  ) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF p_global_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.global_categories
    WHERE id = p_global_category_id
      AND domain = 'finance'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Global finance category not found or inactive';
  END IF;

  FOR i IN 1..p_months LOOP
    v_id := gen_random_uuid();
    v_due_date := (p_first_due + ((i - 1) || ' months')::interval)::date;

    INSERT INTO public.financial_obligations (
      id,
      user_id,
      type,
      status,
      description,
      original_amount,
      due_date,
      issue_date,
      category,
      cost_center_id,
      client_id,
      supplier_id,
      default_account_id,
      notes,
      is_recurring,
      recurrence_id,
      installment_no,
      total_installments,
      global_category_id,
      order_id
    ) VALUES (
      v_id,
      auth.uid(),
      p_type,
      'open',
      p_description || CASE
        WHEN p_months > 1 THEN ' (' || i || '/' || p_months || ')'
        ELSE ''
      END,
      p_amount,
      v_due_date,
      CURRENT_DATE,
      p_category,
      p_cost_center,
      p_client_id,
      p_supplier_id,
      p_account_id,
      p_notes,
      p_months > 1,
      CASE WHEN p_months > 1 THEN v_recurrence_id ELSE NULL END,
      i,
      p_months,
      p_global_category_id,
      p_order_id
    );

    v_ids := array_append(v_ids, v_id);
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.update_bank_balance(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_obligation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_recurrence_obligations(text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bank_balance(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_obligation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_recurrence_obligations(text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid, uuid) TO authenticated;

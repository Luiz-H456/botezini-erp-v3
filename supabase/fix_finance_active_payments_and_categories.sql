CREATE OR REPLACE VIEW public.obligation_summary AS
SELECT
  o.id,
  o.user_id,
  o.type,
  o.status,
  o.description,
  o.original_amount,
  o.due_date,
  o.issue_date,
  o.category,
  o.cost_center_id,
  o.notes,
  o.client_id,
  o.supplier_id,
  o.default_account_id,
  o.is_recurring,
  o.recurrence_id,
  o.installment_no,
  o.total_installments,
  o.split_group_id,
  o.cancelled_at,
  o.cancelled_reason,
  o.is_reconciled,
  o.unreconciled_reason,
  o.unreconciled_at,
  o.attachments,
  o.created_at,
  o.updated_at,
  COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS paid_amount,
  o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS remaining_amount,
  COUNT(p.id) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL) AS payment_count,
  ROUND(
    CASE
      WHEN o.original_amount > 0 THEN
        COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) / o.original_amount * 100
      ELSE 0
    END,
    2
  ) AS paid_pct,
  CASE
    WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) <= 0 THEN 'paid'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) > 0 THEN 'partial'
    WHEN o.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS derived_status,
  o.global_category_id,
  o.order_id
FROM public.financial_obligations o
LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
GROUP BY o.id;

CREATE OR REPLACE FUNCTION public.pay_obligation(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_method text DEFAULT 'PIX',
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb
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

CREATE OR REPLACE FUNCTION public.get_cashflow_series(
  p_start date,
  p_end date
) RETURNS TABLE(series_date date, inflow numeric, outflow numeric, balance numeric)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH daily AS (
    SELECT
      op.payment_date AS series_date,
      SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE 0 END) AS inflow,
      SUM(CASE WHEN fo.type = 'payable' THEN op.amount ELSE 0 END) AS outflow
    FROM public.obligation_payments op
    JOIN public.financial_obligations fo ON fo.id = op.obligation_id
    WHERE op.reversed_at IS NULL
      AND op.reversal_of IS NULL
      AND op.payment_date BETWEEN p_start AND p_end
    GROUP BY op.payment_date
  )
  SELECT
    d.series_date,
    d.inflow,
    d.outflow,
    SUM(d.inflow - d.outflow) OVER (ORDER BY d.series_date) AS balance
  FROM daily d
  ORDER BY d.series_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_liquidity_kpis(
  p_start date,
  p_end date
) RETURNS TABLE(pmr_days numeric, pmp_days numeric, cce_days numeric, coverage_days numeric, avg_daily_outflow numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_pmr numeric;
  v_pmp numeric;
  v_coverage numeric;
  v_avg_out numeric;
BEGIN
  SELECT AVG(op.payment_date - fo.issue_date)
    INTO v_pmr
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'receivable'
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT AVG(op.payment_date - fo.issue_date)
    INTO v_pmp
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(op.amount) / NULLIF((p_end - p_start), 0), 0)
    INTO v_avg_out
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND op.payment_date BETWEEN p_start AND p_end;

  SELECT CASE
    WHEN v_avg_out > 0 THEN (SELECT SUM(current_balance) FROM public.bank_accounts WHERE is_active) / v_avg_out
    ELSE NULL
  END
  INTO v_coverage;

  RETURN QUERY SELECT
    ROUND(v_pmr, 1),
    ROUND(v_pmp, 1),
    ROUND(COALESCE(v_pmr, 0) - COALESCE(v_pmp, 0), 1),
    ROUND(v_coverage, 1),
    ROUND(v_avg_out, 2);
END;
$$;

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

REVOKE ALL ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_obligation(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_recurrence_obligations(text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_obligation(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cashflow_series(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_liquidity_kpis(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_recurrence_obligations(text, text, numeric, date, integer, text, uuid, uuid, uuid, uuid, text, uuid, uuid) TO authenticated;
GRANT SELECT ON public.obligation_summary TO authenticated;

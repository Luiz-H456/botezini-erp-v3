-- =============================================================================
-- Finance — Front 1 (Fase 7): pagamento pré-lançado
-- Run no SQL Editor do Supabase. Requer Fases 1–6.
--
--  * budgets ganham payment_plan/payment_method (meio no orçamento, opcional).
--  * financial_obligations ganham planned_method (meio previsto da parcela).
--  * obligation_summary expõe planned_method.
--  * apply/revise gravam o método por parcela.
--  * get_pending_installments(): parcelas a "disparar" (pedidos concluídos/entregues).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Colunas
-- ---------------------------------------------------------------------------
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS payment_plan jsonb;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.financial_obligations ADD COLUMN IF NOT EXISTS planned_method text;

-- ---------------------------------------------------------------------------
-- View obligation_summary (recria com planned_method; mantém security_invoker)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.obligation_summary
WITH (security_invoker = on) AS
SELECT
  o.id, o.user_id, o.type, o.status, o.description, o.original_amount, o.due_date,
  o.issue_date, o.category, o.cost_center_id, o.notes, o.client_id, o.supplier_id,
  o.default_account_id, o.is_recurring, o.recurrence_id, o.installment_no,
  o.total_installments, o.split_group_id, o.cancelled_at, o.cancelled_reason,
  o.is_reconciled, o.unreconciled_reason, o.unreconciled_at, o.attachments,
  o.created_at, o.updated_at,
  COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS paid_amount,
  o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) AS remaining_amount,
  COUNT(p.id) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL) AS payment_count,
  ROUND(CASE WHEN o.original_amount > 0
      THEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) / o.original_amount * 100
      ELSE 0 END, 2) AS paid_pct,
  CASE
    WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'
    WHEN o.original_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) <= 0 THEN 'paid'
    WHEN COALESCE(SUM(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0) > 0 THEN 'partial'
    WHEN o.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
    ELSE 'open'
  END AS derived_status,
  o.global_category_id, o.order_id, o.planned_method
FROM public.financial_obligations o
LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
GROUP BY o.id;

GRANT SELECT ON public.obligation_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- apply_order_payment_plan (grava planned_method por parcela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_order_payment_plan(
  p_order_id uuid, p_client_id uuid, p_description text, p_plan jsonb
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid := gen_random_uuid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid; v_item jsonb; v_n int; v_i int := 0; v_amt numeric;
BEGIN
  PERFORM public.assert_finance_access();
  IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) = 0 THEN
    RAISE EXCEPTION 'Plano de pagamento inválido (esperado array não vazio)';
  END IF;

  SELECT array_agg(id) INTO v_ids
  FROM public.financial_obligations
  WHERE order_id = p_order_id AND type = 'receivable' AND cancelled_at IS NULL;
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN RETURN v_ids; END IF;

  v_ids := ARRAY[]::uuid[];
  v_n := jsonb_array_length(p_plan);
  FOR v_i IN 0 .. v_n - 1 LOOP
    v_item := p_plan -> v_i;
    v_amt := (v_item ->> 'amount')::numeric;
    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Parcela % com valor inválido', v_i + 1; END IF;
    v_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id, split_group_id,
      is_recurring, installment_no, total_installments, planned_method
    ) VALUES (
      v_id, v_uid, 'receivable', 'open',
      p_description || ' — ' || COALESCE(v_item ->> 'label', 'Parcela ' || (v_i + 1)),
      v_amt, COALESCE((v_item ->> 'due')::date, CURRENT_DATE),
      CURRENT_DATE, p_client_id, p_order_id, v_group,
      (v_n > 1), v_i + 1, v_n, v_item ->> 'method'
    );
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN v_ids;
END;
$$;

-- ---------------------------------------------------------------------------
-- revise_order_plan (grava planned_method por parcela)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revise_order_plan(
  p_order_id uuid, p_client_id uuid, p_description text, p_plan jsonb
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group uuid := gen_random_uuid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid; v_item jsonb; v_n int; v_i int; v_amt numeric;
BEGIN
  PERFORM public.assert_finance_access();
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;
  IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) = 0 THEN
    RAISE EXCEPTION 'Plano inválido (esperado array não vazio)';
  END IF;

  v_n := jsonb_array_length(p_plan);
  FOR v_i IN 0 .. v_n - 1 LOOP
    v_amt := ((p_plan -> v_i) ->> 'amount')::numeric;
    IF v_amt IS NULL OR v_amt <= 0 THEN RAISE EXCEPTION 'Parcela % com valor inválido', v_i + 1; END IF;
  END LOOP;

  UPDATE public.financial_obligations fo
  SET status = 'cancelled', cancelled_at = now(),
      cancelled_reason = 'Revisão de plano de pagamento', updated_at = now()
  WHERE fo.order_id = p_order_id AND fo.type = 'receivable' AND fo.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.obligation_payments op
      WHERE op.obligation_id = fo.id AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    );

  FOR v_i IN 0 .. v_n - 1 LOOP
    v_item := p_plan -> v_i;
    v_amt := (v_item ->> 'amount')::numeric;
    v_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id, split_group_id,
      is_recurring, installment_no, total_installments, planned_method
    ) VALUES (
      v_id, v_uid, 'receivable', 'open',
      p_description || ' — ' || COALESCE(v_item ->> 'label', 'Parcela ' || (v_i + 1)),
      v_amt, COALESCE((v_item ->> 'due')::date, CURRENT_DATE),
      CURRENT_DATE, p_client_id, p_order_id, v_group,
      (v_n > 1), v_i + 1, v_n, v_item ->> 'method'
    );
    v_ids := array_append(v_ids, v_id);
  END LOOP;
  RETURN v_ids;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_pending_installments(): parcelas a DISPARAR (pedidos concluídos/entregues)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_installments()
RETURNS TABLE (
  obligation_id    uuid,
  order_id         uuid,
  order_number     text,
  client_name      text,
  description      text,
  due_date         date,
  remaining_amount numeric,
  planned_method   text,
  derived_status   text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT os.id, os.order_id, o.order_number, c.company_name, os.description,
         os.due_date, os.remaining_amount, os.planned_method, os.derived_status
  FROM public.obligation_summary os
  JOIN public.orders o  ON o.id = os.order_id
  LEFT JOIN public.clients c ON c.id = os.client_id
  WHERE os.type = 'receivable'
    AND os.derived_status <> 'cancelled'
    AND os.remaining_amount > 0
    AND o.status IN ('Concluído', 'Entregue')
  ORDER BY os.due_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_installments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_installments() TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM get_pending_installments();
--   SELECT id, description, planned_method FROM obligation_summary WHERE planned_method IS NOT NULL LIMIT 5;
-- =============================================================================

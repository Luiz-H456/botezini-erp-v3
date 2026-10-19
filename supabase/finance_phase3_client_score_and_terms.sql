-- =============================================================================
-- Finance — Fase 3: score do cliente, condições de pagamento e plano por pedido
-- Run no SQL Editor do Supabase. Requer Fases 1 e 2.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Colunas de negócio (idempotente)
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS default_payment_terms text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS credit_limit numeric(15,2) DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS score_cached numeric(5,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS score_updated_at timestamptz;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_plan jsonb;

-- ---------------------------------------------------------------------------
-- 3.2 Score do cliente (0–100), derivado do histórico de pagamentos.
--     Retorna NULL quando não há histórico suficiente (score desconhecido).
--
--     Componentes (peso): pontualidade 40 · atraso médio 25 · inadimplência 20
--     · volume 10 (log) · recorrência 5.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_score(p_client_id uuid)
RETURNS TABLE (
  score           numeric,
  on_time_pct     numeric,
  avg_delay_days  numeric,
  overdue_ratio   numeric,
  total_transacted numeric,
  order_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_on_time    numeric;
  v_avg_delay  numeric;
  v_overdue    numeric;
  v_total      numeric;
  v_orders     bigint;
  v_pay_count  bigint;
  v_score      numeric;
BEGIN
  PERFORM public.assert_finance_access();

  -- Pagamentos ativos (não estorno/estornado) de recebíveis deste cliente
  SELECT
    COUNT(*),
    AVG(CASE WHEN op.payment_date <= fo.due_date THEN 1.0 ELSE 0.0 END) * 100,
    AVG(GREATEST(op.payment_date - fo.due_date, 0))
  INTO v_pay_count, v_on_time, v_avg_delay
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'receivable'
    AND fo.client_id = p_client_id
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL;

  -- Inadimplência atual e volume total
  SELECT
    COALESCE(SUM(os.original_amount), 0),
    CASE WHEN COALESCE(SUM(os.original_amount), 0) > 0
      THEN COALESCE(SUM(os.remaining_amount) FILTER (WHERE os.derived_status = 'overdue'), 0)
           / SUM(os.original_amount)
      ELSE 0 END,
    COUNT(DISTINCT os.order_id)
  INTO v_total, v_overdue, v_orders
  FROM public.obligation_summary os
  WHERE os.type = 'receivable'
    AND os.client_id = p_client_id
    AND os.derived_status <> 'cancelled';

  -- Sem histórico → score desconhecido
  IF v_total = 0 AND COALESCE(v_pay_count, 0) = 0 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  v_score :=
      COALESCE(v_on_time, 0) * 0.40
    + GREATEST(0, 100 - COALESCE(v_avg_delay, 0) * 5) * 0.25
    + (1 - COALESCE(v_overdue, 0)) * 100 * 0.20
    + LEAST(100, (ln(1 + COALESCE(v_total, 0)) / ln(1 + 100000)) * 100) * 0.10
    + LEAST(100, COALESCE(v_orders, 0) * 10) * 0.05;

  RETURN QUERY SELECT
    ROUND(v_score, 1),
    ROUND(COALESCE(v_on_time, 0), 1),
    ROUND(COALESCE(v_avg_delay, 0), 1),
    ROUND(COALESCE(v_overdue, 0), 4),
    v_total,
    COALESCE(v_orders, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3.3 Materializa o score no cache dos clientes (rodar sob demanda/agendado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_client_scores()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_score numeric;
  v_n integer := 0;
BEGIN
  PERFORM public.assert_finance_access();
  FOR r IN SELECT id FROM public.clients LOOP
    SELECT s.score INTO v_score FROM public.get_client_score(r.id) s;
    UPDATE public.clients
      SET score_cached = v_score, score_updated_at = now()
      WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3.4 Aplica um PLANO DE PAGAMENTO por pedido (N parcelas customizadas).
--     Idempotente por order_id. Plano = array jsonb:
--       [{"label":"Entrada","amount":300,"due":"2026-07-20"},
--        {"label":"Parcela 1","amount":350,"due":"2026-08-20"}, ...]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_order_payment_plan(
  p_order_id   uuid,
  p_client_id  uuid,
  p_description text,
  p_plan       jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_group uuid := gen_random_uuid();
  v_ids   uuid[] := ARRAY[]::uuid[];
  v_id    uuid;
  v_item  jsonb;
  v_n     int;
  v_i     int := 0;
  v_amt   numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) = 0 THEN
    RAISE EXCEPTION 'Plano de pagamento inválido (esperado array não vazio)';
  END IF;

  -- Idempotência por order_id (não recria se já houver recebível ativo)
  SELECT array_agg(id) INTO v_ids
  FROM public.financial_obligations
  WHERE order_id = p_order_id AND type = 'receivable' AND cancelled_at IS NULL;
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    RETURN v_ids;
  END IF;

  v_ids := ARRAY[]::uuid[];
  v_n := jsonb_array_length(p_plan);

  FOR v_i IN 0 .. v_n - 1 LOOP
    v_item := p_plan -> v_i;
    v_amt := (v_item ->> 'amount')::numeric;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'Parcela % com valor inválido', v_i + 1;
    END IF;

    v_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id, split_group_id,
      is_recurring, installment_no, total_installments
    ) VALUES (
      v_id, v_uid, 'receivable', 'open',
      p_description || ' — ' || COALESCE(v_item ->> 'label', 'Parcela ' || (v_i + 1)),
      v_amt,
      COALESCE((v_item ->> 'due')::date, CURRENT_DATE),
      CURRENT_DATE, p_client_id, p_order_id, v_group,
      (v_n > 1), v_i + 1, v_n
    );
    v_ids := array_append(v_ids, v_id);
  END LOOP;

  -- guarda o plano no pedido (rastro da intenção)
  UPDATE public.orders SET payment_plan = p_plan, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_ids;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_client_score(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_client_scores()     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_order_payment_plan(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_score(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_client_scores()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_payment_plan(uuid, uuid, text, jsonb) TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM get_client_score('<client_id>');
--   SELECT refresh_client_scores();
--   SELECT id, company_name, score_cached, credit_limit, default_payment_terms
--     FROM clients ORDER BY score_cached DESC NULLS LAST LIMIT 10;
-- =============================================================================

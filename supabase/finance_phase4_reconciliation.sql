-- =============================================================================
-- Finance — Fase 4: reconciliação de pedido revisado (recotação / mudança)
-- Run no SQL Editor do Supabase. Requer Fases 1–3.
--
-- Princípio: NUNCA mutar original_amount. Divergência entre o total do pedido e
-- a soma das obrigações vira um lançamento COMPLEMENTAR auditável.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Diagnóstico: compara total do pedido × soma das obrigações ativas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_reconciliation(p_order_id uuid)
RETURNS TABLE (
  order_id          uuid,
  order_total       numeric,
  obligations_total numeric,
  delta             numeric,
  suggestion        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_total numeric;
  v_obl_total   numeric;
  v_delta       numeric;
BEGIN
  PERFORM public.assert_finance_access();

  SELECT o.total_amount INTO v_order_total FROM public.orders o WHERE o.id = p_order_id;
  IF v_order_total IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  -- Colunas qualificadas: as OUT params (order_id, ...) do RETURNS TABLE colidem
  -- com colunas homônimas se não forem qualificadas.
  SELECT COALESCE(SUM(fo.original_amount), 0) INTO v_obl_total
  FROM public.financial_obligations fo
  WHERE fo.order_id = p_order_id AND fo.type = 'receivable' AND fo.cancelled_at IS NULL;

  v_delta := v_order_total - v_obl_total;

  RETURN QUERY SELECT
    p_order_id, v_order_total, v_obl_total, v_delta,
    CASE
      WHEN v_delta > 0 THEN 'Criar recebível complementar de ' || v_delta
      WHEN v_delta < 0 THEN 'Emitir crédito/ajuste de ' || abs(v_delta)
      ELSE 'Sem divergência'
    END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4.2 Aplica o ajuste como lançamento novo (não muta o original).
--     delta > 0 → recebível complementar (cliente deve mais).
--     delta < 0 → obrigação 'payable' de crédito (você deve ao cliente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_order_adjustment(
  p_order_id uuid,
  p_delta    numeric,
  p_reason   text DEFAULT NULL,
  p_due_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_id     uuid := gen_random_uuid();
  v_client uuid;
  v_type   text;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Ajuste deve ser diferente de zero';
  END IF;

  SELECT client_id INTO v_client FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  v_type := CASE WHEN p_delta > 0 THEN 'receivable' ELSE 'payable' END;

  INSERT INTO public.financial_obligations (
    id, user_id, type, status, description, original_amount, due_date,
    issue_date, client_id, order_id, is_recurring, installment_no, total_installments, notes
  ) VALUES (
    v_id, v_uid, v_type, 'open',
    'Ajuste de pedido — ' || COALESCE(p_reason, 'revisão'),
    abs(p_delta), p_due_date,
    CURRENT_DATE, v_client, p_order_id, false, 1, 1,
    'Lançamento de ajuste (Fase 4). Delta original: ' || p_delta
  );

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_order_reconciliation(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_order_adjustment(uuid, numeric, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_reconciliation(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_adjustment(uuid, numeric, text, date) TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM get_order_reconciliation('<order_id>');
--   -- se delta <> 0:
--   SELECT apply_order_adjustment('<order_id>', <delta>, 'recotação');
--   SELECT * FROM get_order_reconciliation('<order_id>');  -- delta agora 0
-- =============================================================================

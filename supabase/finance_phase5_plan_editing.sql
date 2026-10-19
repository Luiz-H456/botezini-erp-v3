-- =============================================================================
-- Finance — Fase 5: revisão de plano de pagamento pós-emissão
-- Run no SQL Editor do Supabase. Requer Fases 1–4.
--
-- revise_order_plan(): reescreve a parte EM ABERTO do plano de um pedido de forma
-- atômica. Parcelas com pagamento ativo (pagas/parciais) são PRESERVADAS; apenas
-- as sem nenhum pagamento ativo são canceladas e o novo plano é inserido.
-- Respeita a imutabilidade: nada de original_amount é alterado — cancela e recria.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.revise_order_plan(
  p_order_id   uuid,
  p_client_id  uuid,
  p_description text,
  p_plan       jsonb
) RETURNS uuid[]
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
  v_i     int;
  v_amt   numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) = 0 THEN
    RAISE EXCEPTION 'Plano inválido (esperado array não vazio)';
  END IF;

  -- valida cada parcela antes de mexer em qualquer coisa
  v_n := jsonb_array_length(p_plan);
  FOR v_i IN 0 .. v_n - 1 LOOP
    v_amt := ((p_plan -> v_i) ->> 'amount')::numeric;
    IF v_amt IS NULL OR v_amt <= 0 THEN
      RAISE EXCEPTION 'Parcela % com valor inválido', v_i + 1;
    END IF;
  END LOOP;

  -- 1) Cancela SÓ as obrigações em aberto (sem pagamento ativo). Preserva pagas/parciais.
  UPDATE public.financial_obligations fo
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_reason = 'Revisão de plano de pagamento',
      updated_at = now()
  WHERE fo.order_id = p_order_id
    AND fo.type = 'receivable'
    AND fo.cancelled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.obligation_payments op
      WHERE op.obligation_id = fo.id
        AND op.reversed_at IS NULL
        AND op.reversal_of IS NULL
    );

  -- 2) Insere o novo plano em aberto
  FOR v_i IN 0 .. v_n - 1 LOOP
    v_item := p_plan -> v_i;
    v_amt := (v_item ->> 'amount')::numeric;
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

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_order_plan(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_order_plan(uuid, uuid, text, jsonb) TO authenticated;

-- =============================================================================
-- Verificação:
--   -- cria plano, paga 1 parcela, revisa: a paga permanece, as abertas trocam
--   SELECT * FROM revise_order_plan('<order>', '<client>', 'Pedido #X',
--     '[{"label":"Nova 1","amount":400,"due":"2026-09-01"},
--       {"label":"Nova 2","amount":600,"due":"2026-10-01"}]'::jsonb);
-- =============================================================================

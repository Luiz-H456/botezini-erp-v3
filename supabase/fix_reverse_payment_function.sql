-- Run this whole block in Supabase SQL Editor.
-- Do not execute only the lines inside BEGIN/END.

CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $reverse_payment$
DECLARE
  v_pay public.obligation_payments%ROWTYPE;
  v_type text;
  v_delta numeric;
  v_reversal_id uuid;
BEGIN
  PERFORM public.assert_finance_access();

  SELECT *
  INTO v_pay
  FROM public.obligation_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF v_pay.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment already reversed';
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
$reverse_payment$;

REVOKE ALL ON FUNCTION public.reverse_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid, text) TO authenticated;

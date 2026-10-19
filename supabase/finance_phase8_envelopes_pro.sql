-- =============================================================================
-- Finance — Front 2 (Fase 8): Caixinhas completas
-- Run no SQL Editor do Supabase. Requer Fase 6.
--
--  * Finalidade, meta com prazo, saldo mínimo (alerta) e % de provisionamento.
--  * fund_envelopes(base): aloca auto_fund_pct de um valor-base em cada caixinha
--    com regra, respeitando o saldo livre.
--  * O extrato (recebimentos/retiradas) já é gravado em cash_envelope_movements.
-- =============================================================================

ALTER TABLE public.cash_envelopes ADD COLUMN IF NOT EXISTS purpose       text;
ALTER TABLE public.cash_envelopes ADD COLUMN IF NOT EXISTS target_date   date;
ALTER TABLE public.cash_envelopes ADD COLUMN IF NOT EXISTS min_balance   numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.cash_envelopes ADD COLUMN IF NOT EXISTS auto_fund_pct numeric(5,2)  NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fund_envelopes(p_base numeric)
RETURNS numeric   -- total efetivamente alocado
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_free  numeric;
  v_total numeric := 0;
  v_amt   numeric;
  r       record;
BEGIN
  PERFORM public.assert_finance_access();
  IF p_base IS NULL OR p_base <= 0 THEN
    RAISE EXCEPTION 'Valor-base deve ser positivo';
  END IF;

  SELECT o.free INTO v_free FROM public.get_envelope_overview() o;

  FOR r IN
    SELECT id, auto_fund_pct FROM public.cash_envelopes
    WHERE NOT is_archived AND auto_fund_pct > 0
    ORDER BY sort_order
  LOOP
    v_amt := round(p_base * r.auto_fund_pct / 100, 2);
    IF v_amt > v_free THEN v_amt := v_free; END IF;   -- nunca estoura o livre
    IF v_amt > 0 THEN
      UPDATE public.cash_envelopes SET balance = balance + v_amt, updated_at = now() WHERE id = r.id;
      INSERT INTO public.cash_envelope_movements (user_id, envelope_id, delta, kind, notes)
      VALUES (auth.uid(), r.id, v_amt, 'allocate', 'Provisionamento automático');
      v_free := v_free - v_amt;
      v_total := v_total + v_amt;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.fund_envelopes(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_envelopes(numeric) TO authenticated;

-- Verificação:
--   UPDATE cash_envelopes SET auto_fund_pct = 15 WHERE name = 'Impostos';
--   SELECT fund_envelopes(1000);   -- aloca 150 em Impostos (se houver livre)
--   SELECT * FROM cash_envelope_movements ORDER BY created_at DESC LIMIT 5;

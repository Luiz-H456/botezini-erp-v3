-- =============================================================================
-- FINANCEIRO — correções na função de liquidez (get_liquidity_kpis)
-- Run no SQL Editor do Supabase.
--
-- Duas correções e uma limitação assumida, encontradas ao conferir as métricas
-- contra a bibliografia de contabilidade gerencial.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_liquidity_kpis(
  p_start date,
  p_end date
) RETURNS TABLE(pmr_days numeric, pmp_days numeric, cce_days numeric, coverage_days numeric, avg_daily_outflow numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pmr numeric; v_pmp numeric; v_coverage numeric; v_avg_out numeric;
  v_dias integer;
BEGIN
  -- CORREÇÃO 1 — contagem de dias do período.
  --
  -- Era `p_end - p_start`, que dá a distância ENTRE as datas: de 01/03 a 31/03
  -- resulta 30, não 31. Dividir a saída total por 30 em vez de 31 inflava a
  -- saída média diária em ~3%, e a cobertura em dias saía menor do que a real.
  -- Errava para o lado conservador, mas errava.
  v_dias := GREATEST(p_end - p_start + 1, 1);

  -- Prazo médio de recebimento. Lançamento informativo entra: ele representa
  -- recebimento real, só não mexeu no saldo.
  --
  -- LIMITAÇÃO CONHECIDA: só entram obrigações que JÁ FORAM PAGAS (o JOIN com
  -- obligation_payments exige pagamento). O cliente que está há 90 dias sem
  -- pagar não conta — e passa a contar, piorando o número, só no dia em que
  -- paga. Ou seja: quanto pior a inadimplência, melhor o PMR parece, porque os
  -- atrasados ficam de fora. Ler sempre junto com o total vencido em aberto.
  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmr
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'receivable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  SELECT AVG(op.payment_date - fo.issue_date) INTO v_pmp
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND fo.issue_date BETWEEN p_start AND p_end;

  -- Saída média diária: aqui SÓ pagamento que mexeu no caixa de verdade,
  -- senão a cobertura ficaria distorcida por lançamento informativo.
  SELECT COALESCE(SUM(op.amount) / v_dias, 0) INTO v_avg_out
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE fo.type = 'payable'
    AND op.reversed_at IS NULL AND op.reversal_of IS NULL
    AND COALESCE(op.affects_balance, true) = true
    AND op.payment_date BETWEEN p_start AND p_end;

  SELECT CASE WHEN v_avg_out > 0
    THEN (SELECT SUM(current_balance) FROM public.bank_accounts WHERE is_active) / v_avg_out
    ELSE NULL END
  INTO v_coverage;

  RETURN QUERY SELECT
    ROUND(v_pmr, 1),
    ROUND(v_pmp, 1),
    -- CORREÇÃO 2 — o que este número É, e o que ele NÃO é.
    --
    -- O Ciclo de Conversão de Caixa da bibliografia é PME + PMR − PMP, onde PME
    -- é o prazo médio de estocagem. Aqui só existe PMR − PMP: falta o PME, que
    -- exigiria giro de estoque (estoque médio ÷ CMV × dias) — dado que o app
    -- ainda não acumula.
    --
    -- Numa confecção, que compra tecido e mantém material em processo, omitir o
    -- PME SUBESTIMA o ciclo: o dinheiro fica preso mais dias do que este número
    -- diz. Ele continua útil para acompanhar a tendência (piorou ou melhorou o
    -- descompasso entre receber e pagar), mas não deve ser lido como o ciclo de
    -- caixa completo, e sim como o ciclo financeiro parcial.
    CASE WHEN v_pmr IS NULL OR v_pmp IS NULL THEN NULL
         ELSE ROUND(v_pmr - v_pmp, 1) END,
    ROUND(v_coverage, 1),
    ROUND(v_avg_out, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_liquidity_kpis(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_liquidity_kpis(date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verificação — a saída média diária deve cair um pouco (divisor maior):
--   SELECT * FROM get_liquidity_kpis('2026-08-01', '2026-08-31');
-- =============================================================================

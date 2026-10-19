-- =============================================================================
-- Finance — Fase 4ب: lista de pedidos que precisam de reconciliação
-- Complementa finance_phase4_reconciliation.sql (que faz 1 pedido por vez).
-- Run no SQL Editor. Requer Fases 1–4.
--
-- Retorna os pedidos cujo total diverge da soma das obrigações ativas — ou seja,
-- pedidos recotados/alterados depois do recebível emitido. Base do painel de UI.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_orders_needing_reconciliation()
RETURNS TABLE (
  order_id          uuid,
  order_number      text,
  client_name       text,
  order_total       numeric,
  obligations_total numeric,
  delta             numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  WITH obl AS (
    SELECT fo.order_id, SUM(fo.original_amount) AS total
    FROM public.financial_obligations fo
    WHERE fo.type = 'receivable'
      AND fo.cancelled_at IS NULL
      AND fo.order_id IS NOT NULL
    GROUP BY fo.order_id
  )
  SELECT
    o.id, o.order_number, c.company_name,
    o.total_amount, obl.total, (o.total_amount - obl.total) AS delta
  FROM public.orders o
  JOIN obl ON obl.order_id = o.id            -- só pedidos que já têm recebível
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE o.total_amount <> obl.total          -- e cujo total diverge
  ORDER BY abs(o.total_amount - obl.total) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_needing_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orders_needing_reconciliation() TO authenticated;

-- Verificação:
--   SELECT * FROM get_orders_needing_reconciliation();

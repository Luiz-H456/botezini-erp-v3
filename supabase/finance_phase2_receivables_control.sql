-- =============================================================================
-- Finance — Fase 2: controles de recebíveis (entregues × recebidos)
-- Run this whole block no SQL Editor do Supabase. Requer a Fase 1 aplicada.
--
-- Todas as funções: SECURITY DEFINER + assert_finance_access() → só admin/manager
-- executam; internamente rodam como owner (dados corretos) mas com o portão de
-- acesso na entrada. Consistente com as demais RPCs financeiras.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 Pedidos ENTREGUES/CONCLUÍDOS com saldo em aberto (lista de cobrança)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_delivered_unpaid()
RETURNS TABLE (
  order_id       uuid,
  order_number   text,
  client_id      uuid,
  client_name    text,
  status         text,
  deadline       date,
  total          numeric,
  received       numeric,
  to_receive     numeric,
  next_due_date  date,
  has_overdue    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    o.id, o.order_number, o.client_id, c.company_name,
    o.status::text, o.deadline,
    ofs.total, ofs.received, ofs.to_receive, ofs.next_due_date, ofs.has_overdue
  FROM public.orders o
  JOIN public.order_financial_status ofs ON ofs.order_id = o.id
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE o.status IN ('Concluído', 'Entregue')
    AND ofs.to_receive > 0
  ORDER BY ofs.has_overdue DESC, ofs.next_due_date NULLS LAST;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.2 Adiantamentos: dinheiro RECEBIDO em pedidos ainda NÃO entregues
--     (passivo de performance — você deve a mercadoria)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_advance_received()
RETURNS TABLE (
  order_id     uuid,
  order_number text,
  client_id    uuid,
  client_name  text,
  status       text,
  total        numeric,
  received     numeric,
  to_receive   numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    o.id, o.order_number, o.client_id, c.company_name,
    o.status::text, ofs.total, ofs.received, ofs.to_receive
  FROM public.orders o
  JOIN public.order_financial_status ofs ON ofs.order_id = o.id
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE o.status NOT IN ('Concluído', 'Entregue')
    AND ofs.received > 0
  ORDER BY ofs.received DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.3 Recebíveis por cliente (aberto / vencido / a vencer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_receivables()
RETURNS TABLE (
  client_id       uuid,
  client_name     text,
  open_total      numeric,
  overdue_total   numeric,
  not_due_total   numeric,
  obligations_cnt bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    os.client_id,
    c.company_name,
    SUM(os.remaining_amount)                                              AS open_total,
    SUM(os.remaining_amount) FILTER (WHERE os.derived_status = 'overdue') AS overdue_total,
    SUM(os.remaining_amount) FILTER (WHERE os.derived_status <> 'overdue')AS not_due_total,
    COUNT(*)                                                              AS obligations_cnt
  FROM public.obligation_summary os
  LEFT JOIN public.clients c ON c.id = os.client_id
  WHERE os.type = 'receivable'
    AND os.derived_status <> 'cancelled'
    AND os.remaining_amount > 0
    AND os.client_id IS NOT NULL
  GROUP BY os.client_id, c.company_name
  ORDER BY overdue_total DESC NULLS LAST, open_total DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2.4 Quebra por MEIO DE PAGAMENTO (relatório) — pagamentos ativos no período
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payment_method_breakdown(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  method          text,
  obligation_type text,
  cnt             bigint,
  total_amount    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    COALESCE(op.method, 'Outro') AS method,
    fo.type::text,
    COUNT(*)                     AS cnt,
    SUM(op.amount)               AS total_amount
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND op.payment_date BETWEEN p_start AND p_end
  GROUP BY COALESCE(op.method, 'Outro'), fo.type
  ORDER BY total_amount DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_delivered_unpaid()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_advance_received()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_client_receivables()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payment_method_breakdown(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivered_unpaid()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_advance_received()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_receivables()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_method_breakdown(date, date) TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM get_delivered_unpaid();
--   SELECT * FROM get_advance_received();
--   SELECT * FROM get_client_receivables();
--   SELECT * FROM get_payment_method_breakdown(CURRENT_DATE - 90, CURRENT_DATE);
-- =============================================================================

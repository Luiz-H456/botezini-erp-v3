-- =============================================================================
-- FINANCEIRO V3 · 1 — parcela de pedido não entregue não é "a receber"
--
-- 1. orders.delivered_at: a data em que o pedido foi entregue. As entregas
--    antigas recebem updated_at como APROXIMAÇÃO — não existe registro de
--    quando cada uma aconteceu (audit_logs vazio). A consulta do fim lista
--    todas para correção à mão.
--    O preenchimento roda com o gatilho trg_orders_updated_at desligado, para não
--    apagar o updated_at real dos pedidos entregues.
-- 2. obligation_summary.awaiting_delivery: verdadeiro para conta a receber de
--    pedido que ainda não está 'Entregue'. derived_status NÃO muda, porque
--    reverse_payment e register_informational_payment copiam derived_status
--    para financial_obligations.status; um status novo vazaria para a tabela.
-- 3. Somas de "a receber" ignoram as que aguardam entrega.
-- 4. 'Concluído' sai dos filtros de status (nenhum pedido usa).
--
-- Somente na v3 local até o Luiz decidir levar para produção.
-- =============================================================================

-- ANTES (somente leitura)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivered_at') AS ja_tem_delivered_at,
  (SELECT count(*) FROM public.orders WHERE status = 'Entregue')  AS pedidos_entregues,
  (SELECT count(*) FROM public.orders WHERE status = 'Concluído') AS pedidos_concluidos;

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at date;

-- O gatilho de updated_at é desligado só durante o preenchimento: sem isso o UPDATE
-- sobrescreve o updated_at real de todo pedido entregue (e é dele que sai a aproximação).
ALTER TABLE public.orders DISABLE TRIGGER trg_orders_updated_at;
UPDATE public.orders
   SET delivered_at = (updated_at AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE status = 'Entregue' AND delivered_at IS NULL;
ALTER TABLE public.orders ENABLE TRIGGER trg_orders_updated_at;

CREATE OR REPLACE VIEW public.obligation_summary WITH (security_invoker = on) AS
 SELECT o.id,
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
    COALESCE(sum(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS paid_amount,
    o.original_amount - COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS remaining_amount,
    count(p.id) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL) AS payment_count,
    round(
        CASE
            WHEN o.original_amount > 0::numeric THEN COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) / o.original_amount * 100::numeric
            ELSE 0::numeric
        END, 2) AS paid_pct,
        CASE
            WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'::text
            WHEN (o.original_amount - COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric)) <= 0::numeric THEN 'paid'::text
            WHEN COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) > 0::numeric THEN 'partial'::text
            WHEN o.due_date < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date THEN 'overdue'::text
            ELSE 'open'::text
        END AS derived_status,
    o.global_category_id,
    o.order_id,
    o.planned_method,
    COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS amortized_amount,
    (o.type = 'receivable' AND ord.id IS NOT NULL AND ord.status IS DISTINCT FROM 'Entregue') AS awaiting_delivery
   FROM public.financial_obligations o
     LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
     LEFT JOIN public.orders ord ON ord.id = o.order_id
  GROUP BY o.id, ord.id;

CREATE OR REPLACE FUNCTION public.get_cash_position(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(projected_balance numeric, reconciled_balance numeric, net_flow numeric, total_receivable numeric, total_payable numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo      numeric;
  v_receber    numeric;
  v_pagar      numeric;
BEGIN
  SELECT COALESCE(SUM(current_balance), 0) INTO v_saldo
  FROM public.bank_accounts WHERE is_active;

  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_receber
  FROM public.obligation_summary
  WHERE type = 'receivable' AND derived_status NOT IN ('paid','cancelled')
    AND NOT awaiting_delivery
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_pagar
  FROM public.obligation_summary
  WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  RETURN QUERY SELECT
    v_saldo + v_receber - v_pagar,
    v_saldo,
    v_receber - v_pagar,
    v_receber,
    v_pagar;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_receivables()
 RETURNS TABLE(client_id uuid, client_name text, open_total numeric, overdue_total numeric, not_due_total numeric, obligations_cnt bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND NOT os.awaiting_delivery
  GROUP BY os.client_id, c.company_name
  ORDER BY overdue_total DESC NULLS LAST, open_total DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_aging_buckets(p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(obligation_type text, bucket text, cnt bigint, total_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    os.type AS obligation_type,
    CASE
      WHEN os.due_date >= p_reference_date                           THEN 'current'
      WHEN os.due_date >= p_reference_date - INTERVAL '30 days'     THEN '1_30'
      WHEN os.due_date >= p_reference_date - INTERVAL '60 days'     THEN '31_60'
      ELSE '60_plus'
    END AS bucket,
    COUNT(*)::bigint AS cnt,
    SUM(os.remaining_amount) AS total_amount
  FROM obligation_summary os
  WHERE os.derived_status NOT IN ('paid', 'cancelled')
    AND NOT os.awaiting_delivery
  GROUP BY os.type, bucket;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_installments()
 RETURNS TABLE(obligation_id uuid, order_id uuid, order_number text, client_name text, description text, due_date date, remaining_amount numeric, planned_method text, derived_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND o.status = 'Entregue'
  ORDER BY os.due_date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_unpaid()
 RETURNS TABLE(order_id uuid, order_number text, client_id uuid, client_name text, status text, deadline date, total numeric, received numeric, to_receive numeric, next_due_date date, has_overdue boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE o.status = 'Entregue'
    AND ofs.to_receive > 0
  ORDER BY ofs.has_overdue DESC, ofs.next_due_date NULLS LAST;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- DEPOIS (somente leitura): as entregas antigas, para conferir a data à mão
SELECT order_number, delivered_at, updated_at
  FROM public.orders WHERE status = 'Entregue' ORDER BY delivered_at, order_number;

SELECT count(*) FILTER (WHERE awaiting_delivery) AS aguardando_entrega,
       count(*) FILTER (WHERE type = 'receivable')  AS contas_a_receber
  FROM public.obligation_summary;

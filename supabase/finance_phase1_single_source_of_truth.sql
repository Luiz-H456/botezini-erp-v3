-- =============================================================================
-- Finance — Fase 1: verdade única (entrada pendente + saldo, status derivado)
-- Run this whole block in the Supabase SQL Editor.
--
-- Decisões de negócio:
--   * Entrada (sinal) é PREVISÃO → nasce como obrigação PENDENTE, não como
--     pagamento. "Recebido" só sobe quando um pagamento real for lançado.
--   * Vencimento é data combinada (editável), independente do prazo de produção.
--
-- O que muda:
--   1. RPC create_order_receivable(): cria, de forma ATÔMICA e idempotente por
--      order_id, o recebível do pedido como "Entrada + Saldo" (ou único, se não
--      houver sinal). Substitui a criação em dois lugares (conversão + entrega).
--   2. View order_financial_status: total / recebido / a_receber / status por
--      pedido, derivados de obligation_summary (fonte única). security_invoker=on.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) RPC: cria o recebível do pedido (entrada pendente + saldo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_receivable(
  p_order_id     uuid,
  p_client_id    uuid,
  p_description  text,
  p_total        numeric,
  p_entrada      numeric DEFAULT 0,        -- valor previsto do sinal (pendente)
  p_entrada_due  date    DEFAULT CURRENT_DATE,
  p_saldo_due    date    DEFAULT CURRENT_DATE
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_ids        uuid[] := ARRAY[]::uuid[];
  v_group      uuid := gen_random_uuid();
  v_entrada_id uuid;
  v_saldo_id   uuid;
  v_single_id  uuid;
  v_split      boolean;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'Total do pedido deve ser positivo';
  END IF;

  IF p_entrada IS NULL OR p_entrada < 0 OR p_entrada > p_total THEN
    RAISE EXCEPTION 'Entrada inválida (deve estar entre 0 e o total)';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- Idempotência real: por order_id (não por texto em notes).
  SELECT array_agg(id)
  INTO v_ids
  FROM public.financial_obligations
  WHERE order_id = p_order_id
    AND type = 'receivable'
    AND cancelled_at IS NULL;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    RETURN v_ids;  -- já existe recebível ativo para este pedido
  END IF;

  v_ids := ARRAY[]::uuid[];
  -- Só divide em entrada+saldo quando o sinal é parcial (0 < entrada < total).
  v_split := (p_entrada > 0 AND p_entrada < p_total);

  IF v_split THEN
    v_entrada_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id, split_group_id,
      is_recurring, installment_no, total_installments
    ) VALUES (
      v_entrada_id, v_uid, 'receivable', 'open',
      p_description || ' — Entrada', p_entrada, p_entrada_due,
      CURRENT_DATE, p_client_id, p_order_id, v_group,
      false, 1, 2
    );
    v_ids := array_append(v_ids, v_entrada_id);

    v_saldo_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id, split_group_id,
      is_recurring, installment_no, total_installments
    ) VALUES (
      v_saldo_id, v_uid, 'receivable', 'open',
      p_description || ' — Saldo', p_total - p_entrada, p_saldo_due,
      CURRENT_DATE, p_client_id, p_order_id, v_group,
      false, 2, 2
    );
    v_ids := array_append(v_ids, v_saldo_id);
  ELSE
    -- Sem sinal (ou sinal = total): obrigação única pelo total.
    v_single_id := gen_random_uuid();
    INSERT INTO public.financial_obligations (
      id, user_id, type, status, description, original_amount, due_date,
      issue_date, client_id, order_id,
      is_recurring, installment_no, total_installments
    ) VALUES (
      v_single_id, v_uid, 'receivable', 'open',
      p_description, p_total, p_saldo_due,
      CURRENT_DATE, p_client_id, p_order_id,
      false, 1, 1
    );
    v_ids := array_append(v_ids, v_single_id);
  END IF;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_receivable(uuid, uuid, text, numeric, numeric, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_receivable(uuid, uuid, text, numeric, numeric, date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) View: status financeiro por pedido (fonte única = obligation_summary)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.order_financial_status
WITH (security_invoker = on) AS
SELECT
  os.order_id,
  SUM(os.original_amount)                         AS total,
  SUM(os.paid_amount)                             AS received,
  SUM(os.remaining_amount)                        AS to_receive,
  ROUND(
    CASE WHEN SUM(os.original_amount) > 0
      THEN SUM(os.paid_amount) / SUM(os.original_amount) * 100
      ELSE 0 END, 2)                              AS received_pct,
  MIN(os.due_date) FILTER (WHERE os.remaining_amount > 0) AS next_due_date,
  bool_or(os.derived_status = 'overdue')          AS has_overdue,
  CASE
    WHEN SUM(os.remaining_amount) <= 0                        THEN 'paid'
    WHEN bool_or(os.derived_status = 'overdue')              THEN 'overdue'
    WHEN SUM(os.paid_amount) > 0                              THEN 'partial'
    ELSE 'open'
  END                                             AS payment_status
FROM public.obligation_summary os
WHERE os.type = 'receivable'
  AND os.order_id IS NOT NULL
  AND os.cancelled_at IS NULL
GROUP BY os.order_id;

GRANT SELECT ON public.order_financial_status TO authenticated;

-- =============================================================================
-- Verificação pós-aplicação (rodar manualmente):
--   SELECT * FROM public.order_financial_status LIMIT 20;
--   -- para um pedido: total = received + to_receive, e received vem de pagamentos reais
--
-- Migração de dados legados (opcional, avaliar antes de rodar em produção):
--   * Pedidos antigos têm 1 obrigação-lump (não serão divididos retroativamente;
--     a view já os trata corretamente somando por order_id).
--   * order.amount_paid / order.payment_status legados devem ser tratados como
--     DERIVADOS a partir daqui (a Fase 1 no client para de escrevê-los como verdade).
-- =============================================================================

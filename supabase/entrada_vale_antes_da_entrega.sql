-- =============================================================================
-- ENTRADA JÁ VALE COMO A RECEBER  (v3 — decisão do Luiz, 14/10/2026)
-- Rodar DEPOIS de financeiro_v3_1_entrega.sql (que criou awaiting_delivery).
-- Pode rodar de novo sem estrago.
--
-- O QUE MUDA
-- Até aqui, toda conta a receber de pedido não entregue ficava "aguardando
-- entrega": sumia de Contas, não vencia e o cliente não virava devedor —
-- inclusive a ENTRADA, que se cobra no começo da produção. Agora a entrada
-- vale já: aparece em Contas, vence e cobra. O resto continua esperando a
-- entrega, como antes.
--
-- O QUE É ENTRADA
-- A mesma regra do app (src/utils/condicaoDePagamento.ts, venceNaConfirmacao
-- e DIAS_DE_FOLGA_DA_ENTRADA = 3): a parcela que vence em até 3 dias da data
-- do pedido. Pedido feito na sexta com entrada para segunda continua tendo
-- entrada. Mudou um dos dois lados, mude o outro.
--
-- COLUNA NOVA
-- pedido_em_aberto guarda o sentido antigo de awaiting_delivery (conta de
-- pedido ainda não entregue, com a entrada). O "Recebido antecipado" do
-- Resultado usa ela, para continuar somando a entrada já paga.
--
-- Só a view muda. Nenhuma linha de nenhuma tabela é alterada.
-- =============================================================================

CREATE OR REPLACE VIEW public.obligation_summary
  WITH (security_invoker = on) AS
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
    -- Espera a entrega: conta a receber de pedido não entregue, MENOS a entrada.
    o.type = 'receivable'::text AND ord.id IS NOT NULL AND ord.status IS DISTINCT FROM 'Entregue'::text
      AND NOT COALESCE(o.due_date <= ((ord.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date + 3), false) AS awaiting_delivery,
    -- O sentido antigo, inteiro: conta a receber de pedido ainda não entregue (com a entrada).
    -- É o que o "Recebido antecipado" do Resultado soma.
    o.type = 'receivable'::text AND ord.id IS NOT NULL AND ord.status IS DISTINCT FROM 'Entregue'::text AS pedido_em_aberto
   FROM public.financial_obligations o
     LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
     LEFT JOIN public.orders ord ON ord.id = o.order_id
  GROUP BY o.id, ord.id;

-- Conferência (só leitura): quantas contas cada marca pega agora.
SELECT count(*) FILTER (WHERE awaiting_delivery) AS esperam_a_entrega,
       count(*) FILTER (WHERE pedido_em_aberto AND NOT awaiting_delivery) AS entradas_que_ja_valem,
       count(*) FILTER (WHERE pedido_em_aberto) AS de_pedidos_em_aberto
  FROM public.obligation_summary;

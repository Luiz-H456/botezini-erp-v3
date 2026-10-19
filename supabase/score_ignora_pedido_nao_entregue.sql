-- =============================================================================
-- Score do cliente: pedido não entregue não pesa contra ele
--
-- O PROBLEMA
-- O score media atraso de pagamento contra a data de vencimento, sem olhar se a
-- fábrica já tinha entregue. Resultado: pedido atrasado na produção derrubava o
-- score do CLIENTE — o saldo vence na entrega, a entrega não saiu, e quem levava
-- a culpa era ele. O número passava a medir o nosso atraso e a chamar de risco
-- de crédito dele.
--
-- A REGRA
-- Conta a receber de pedido que ainda não foi ENTREGUE não entra no julgamento
-- de pontualidade nem na inadimplência. Volta a contar assim que o pedido é
-- marcado como entregue — aí o relógio é do cliente de novo.
--
-- Conta avulsa (sem order_id) continua contando normalmente: não há entrega
-- pendente que justifique a espera.
--
-- O QUE MUDA NO CÁLCULO
-- Ao tirar esses pagamentos da média, um cliente cujos pedidos estão todos em
-- produção pode ficar sem NENHUM pagamento julgável. Na fórmula antiga isso
-- valia zero em pontualidade (COALESCE(v_on_time, 0)) e destruía 65 pontos de
-- 100 — punindo justamente quem ainda não teve chance de pagar nada.
--
-- Agora os pesos são RENORMALIZADOS: sem histórico julgável, pontualidade e
-- atraso saem da conta e o score é formado pelos componentes que sobraram, em
-- vez de contá-los como nota zero. Score baixo passa a significar "pagou mal",
-- não "ainda não pagou".
--
-- Rode no SQL Editor do Supabase. Requer finance_phase3_client_score_and_terms.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_client_score(p_client_id uuid)
RETURNS TABLE (
  score           numeric,
  on_time_pct     numeric,
  avg_delay_days  numeric,
  overdue_ratio   numeric,
  total_transacted numeric,
  order_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_on_time    numeric;
  v_avg_delay  numeric;
  v_overdue    numeric;
  v_total      numeric;
  v_orders     bigint;
  v_pay_count  bigint;
  v_score      numeric;
  v_pontos     numeric := 0;
  v_peso       numeric := 0;
BEGIN
  PERFORM public.assert_finance_access();

  -- Pagamentos JULGÁVEIS: de pedido já entregue, ou de conta sem pedido.
  -- Enquanto a peça não saiu, o prazo é promessa nossa — não dívida vencida
  -- dele.
  SELECT
    COUNT(*),
    AVG(CASE WHEN op.payment_date <= fo.due_date THEN 1.0 ELSE 0.0 END) * 100,
    AVG(GREATEST(op.payment_date - fo.due_date, 0))
  INTO v_pay_count, v_on_time, v_avg_delay
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  LEFT JOIN public.orders o ON o.id = fo.order_id
  WHERE fo.type = 'receivable'
    AND fo.client_id = p_client_id
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND (fo.order_id IS NULL OR o.status = 'Entregue');

  -- Inadimplência atual e volume total.
  --
  -- O denominador continua sendo TUDO: o volume é o tamanho da relação e não
  -- depende de entrega. Só o numerador — o que se cobra como atraso — exclui o
  -- que ainda não foi entregue.
  SELECT
    COALESCE(SUM(os.original_amount), 0),
    CASE WHEN COALESCE(SUM(os.original_amount), 0) > 0
      THEN COALESCE(SUM(os.remaining_amount) FILTER (
             WHERE os.derived_status = 'overdue'
               AND (os.order_id IS NULL OR ord.status = 'Entregue')), 0)
           / SUM(os.original_amount)
      ELSE 0 END,
    COUNT(DISTINCT os.order_id)
  INTO v_total, v_overdue, v_orders
  FROM public.obligation_summary os
  LEFT JOIN public.orders ord ON ord.id = os.order_id
  WHERE os.type = 'receivable'
    AND os.client_id = p_client_id
    AND os.derived_status <> 'cancelled';

  -- Sem histórico nenhum → score desconhecido (NULL), não zero.
  IF v_total = 0 AND COALESCE(v_pay_count, 0) = 0 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, 0::numeric, 0::bigint;
    RETURN;
  END IF;

  -- Pontualidade (40) e atraso médio (25) só entram quando há pagamento
  -- julgável. Sem eles, os pesos restantes são renormalizados — contá-los como
  -- zero puniria quem ainda não teve a chance de pagar.
  IF COALESCE(v_pay_count, 0) > 0 THEN
    v_pontos := v_pontos
      + COALESCE(v_on_time, 0) * 0.40
      + GREATEST(0, 100 - COALESCE(v_avg_delay, 0) * 5) * 0.25;
    v_peso := v_peso + 0.65;
  END IF;

  -- Inadimplência (20), volume (10) e recorrência (5) valem sempre.
  v_pontos := v_pontos
    + (1 - COALESCE(v_overdue, 0)) * 100 * 0.20
    + LEAST(100, (ln(1 + COALESCE(v_total, 0)) / ln(1 + 100000)) * 100) * 0.10
    + LEAST(100, COALESCE(v_orders, 0) * 10) * 0.05;
  v_peso := v_peso + 0.35;

  v_score := v_pontos / v_peso;

  RETURN QUERY SELECT
    ROUND(v_score, 1),
    -- NULL, e não 0, quando não há pagamento julgável: a tela precisa poder
    -- dizer "sem histórico ainda" em vez de "0% de pontualidade".
    CASE WHEN COALESCE(v_pay_count, 0) > 0 THEN ROUND(COALESCE(v_on_time, 0), 1) END,
    CASE WHEN COALESCE(v_pay_count, 0) > 0 THEN ROUND(COALESCE(v_avg_delay, 0), 1) END,
    ROUND(COALESCE(v_overdue, 0), 4),
    v_total,
    COALESCE(v_orders, 0);
END;
$$;

REVOKE ALL    ON FUNCTION public.get_client_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_score(uuid) TO authenticated;

-- =============================================================================
-- NÃO chame get_client_score nem refresh_client_scores AQUI.
--
-- As duas passam por assert_finance_access(), que exige `auth.uid()`. No SQL
-- Editor não há sessão de usuário — auth.uid() é NULL e a chamada morre com
-- "Acesso financeiro negado", derrubando o script inteiro junto (o editor roda
-- tudo numa transação, então o CREATE FUNCTION acima seria desfeito).
--
-- Também não é preciso: `clients.score_cached` não é lido por tela nenhuma. O
-- badge chama get_client_score ao vivo a cada abertura, então o score novo já
-- vale assim que esta função é substituída. O cache é atualizado pelo próprio
-- app em useReceivablesControl, com usuário autenticado.
--
-- VERIFICAÇÃO: abra o cadastro de um cliente com pedido em produção e conta
-- vencida. O badge deve parar de puni-lo; ao marcar o pedido como "Entregue",
-- o score cai na próxima abertura.
-- =============================================================================

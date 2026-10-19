-- Conferência do Financeiro v3 — SOMENTE LEITURA.
-- Devolve os números que a Visão geral tem que mostrar HOJE. Mudam com a data:
-- rode no mesmo dia em que conferir a tela.
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
abertas AS (
  SELECT os.* FROM public.obligation_summary os
  WHERE os.derived_status <> 'cancelled' AND os.remaining_amount > 0
)
SELECT 'receber_vencido' AS numero, count(*) AS contas, COALESCE(sum(remaining_amount), 0) AS total
  FROM abertas, hoje WHERE type = 'receivable' AND NOT awaiting_delivery AND due_date < hoje.d
UNION ALL
SELECT 'receber_7_dias', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'receivable' AND NOT awaiting_delivery AND due_date >= hoje.d AND due_date <= hoje.d + 6
UNION ALL
SELECT 'pagar_vencido', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'payable' AND due_date < hoje.d
UNION ALL
SELECT 'pagar_7_dias', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'payable' AND due_date >= hoje.d AND due_date <= hoje.d + 6
UNION ALL
SELECT 'em_producao', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas WHERE awaiting_delivery
UNION ALL
SELECT 'livre', 0,
  (SELECT COALESCE(sum(current_balance), 0) FROM public.bank_accounts WHERE is_active)
  - (SELECT COALESCE(sum(balance), 0) FROM public.cash_envelopes WHERE NOT COALESCE(is_archived, false));

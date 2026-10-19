-- =============================================================================
-- BOTEZINI PVD — AUDITORIA DE LÓGICA FINANCEIRA (RPC & DASHBOARD)
-- Scripts para validação manual dos cálculos do Supabase
-- =============================================================================

-- 1. AUDITORIA DE CÉREBRO (GET_CASH_POSITION)
-- Verifica se as 6 sub-queries estão respeitando p_start e p_end
-- -----------------------------------------------------------------------------
SELECT 'Mês Atual' as periodo, * FROM get_cash_position(
  date_trunc('month', current_date)::date, 
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date
)
UNION ALL
SELECT 'Tudo', * FROM get_cash_position(NULL, NULL);


-- 2. AUDITORIA DE STATUS DERIVADO (OBLIGATION_SUMMARY)
-- Garante que parciais e cancelados estão sendo classificados corretamente
-- -----------------------------------------------------------------------------
SELECT 
    description, 
    type, 
    original_amount, 
    paid_amount, 
    remaining_amount, 
    derived_status,
    is_reconciled
FROM obligation_summary
WHERE derived_status IN ('partial', 'paid', 'cancelled', 'overdue')
ORDER BY updated_at DESC
LIMIT 20;


-- 3. TESTE DE IMPACTO DE CANCELAMENTO
-- Verifica se cancelados sumiram do fluxo mas permanecem no banco (soft logic)
-- -----------------------------------------------------------------------------
SELECT 
    SUM(remaining_amount) as total_na_view,
    (SELECT SUM(remaining_amount) FROM obligation_summary WHERE derived_status != 'cancelled') as total_sem_cancelados
FROM obligation_summary;


-- 4. TESTE DE CONCILIAÇÃO BANCÁRIA
-- Compara o saldo real das contas com o somatório de pagamentos ativos
-- -----------------------------------------------------------------------------
SELECT 
    b.name as banco,
    b.initial_balance,
    b.current_balance as saldo_no_banco,
    b.initial_balance + COALESCE((
        SELECT SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END)
        FROM obligation_payments op
        JOIN financial_obligations fo ON fo.id = op.obligation_id
        WHERE op.account_id = b.id AND op.reversed_at IS NULL
    ), 0) as saldo_recalculado_via_pagamentos
FROM bank_accounts b;


-- 5. TESTE DE LIQUIDEZ (KPIs)
-- Verifica se a média de recebimento (PMR) e pagamento (PMP) está batendo
-- -----------------------------------------------------------------------------
SELECT * FROM get_liquidity_kpis(
  (current_date - interval '90 days')::date,
  current_date
);

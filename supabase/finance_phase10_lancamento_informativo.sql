-- =============================================================================
-- Lançamento informativo + ajuste de saldo
--
-- O PROBLEMA
-- Na migração, R$ 78.756,29 já foram recebidos no sistema antigo. Se você der
-- baixa nesses pedidos pelo app, a RPC pay_obligation soma cada um ao saldo do
-- banco — e o caixa infla com dinheiro que já entrou lá atrás. Mas se não der
-- baixa, o Recebíveis fica mostrando dívida que não existe.
--
-- A SOLUÇÃO
-- Um pagamento marcado como INFORMATIVO: consta no histórico da conta, abate o
-- saldo devedor, aparece nos relatórios — mas NÃO toca em bank_accounts.
-- E um ajuste de saldo direto, para você dizer quanto tem hoje de verdade.
--
-- Rode no banco onde o app roda.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. A marca no pagamento
-- ---------------------------------------------------------------------------
ALTER TABLE public.obligation_payments
  ADD COLUMN IF NOT EXISTS affects_balance boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.obligation_payments.affects_balance IS
  'false = lançamento informativo: registra o recebimento/pagamento sem mexer no saldo bancário. Usado para dinheiro que entrou antes do ERP.';

CREATE INDEX IF NOT EXISTS idx_obligation_payments_informativo
  ON public.obligation_payments(affects_balance) WHERE affects_balance = false;


-- ---------------------------------------------------------------------------
-- 2. RPC: registrar pagamento informativo
--    Mesma validação do pay_obligation (não deixa pagar mais que o saldo, nem
--    conta cancelada), mas sem chamar update_bank_balance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_informational_payment(
  p_obligation_id uuid,
  p_amount        numeric,
  p_payment_date  date DEFAULT CURRENT_DATE,
  p_account_id    uuid DEFAULT NULL,
  p_notes         text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_obligation public.financial_obligations%ROWTYPE;
  v_paid      numeric;
  v_remaining numeric;
  v_account   uuid;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  SELECT * INTO v_obligation
  FROM public.financial_obligations
  WHERE id = p_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta nao encontrada: %', p_obligation_id;
  END IF;

  IF v_obligation.cancelled_at IS NOT NULL OR v_obligation.status = 'cancelled' THEN
    RAISE EXCEPTION 'Conta cancelada nao aceita lancamento';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.obligation_payments
  WHERE obligation_id = p_obligation_id
    AND reversed_at IS NULL AND reversal_of IS NULL;

  v_remaining := v_obligation.original_amount - v_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Valor excede o saldo devedor (resta %)', v_remaining;
  END IF;

  -- account_id é NOT NULL na tabela. Sem conta informada, usa a primeira ativa
  -- apenas para satisfazer a chave — o saldo dela NÃO será alterado.
  v_account := COALESCE(
    p_account_id,
    (SELECT id FROM public.bank_accounts WHERE is_active ORDER BY created_at LIMIT 1)
  );
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Nenhuma conta bancaria cadastrada. Cadastre uma antes.';
  END IF;

  INSERT INTO public.obligation_payments
    (user_id, obligation_id, amount, payment_date, account_id, method, notes, affects_balance)
  VALUES
    (auth.uid(), p_obligation_id, p_amount, p_payment_date, v_account, 'Informativo',
     COALESCE(p_notes, 'Recebido antes do ERP — nao altera saldo'), false)
  RETURNING id INTO v_payment_id;

  -- NÃO chama update_bank_balance. É esse o ponto.

  UPDATE public.financial_obligations
  SET status = (SELECT derived_status FROM public.obligation_summary WHERE id = p_obligation_id),
      updated_at = now()
  WHERE id = p_obligation_id;

  RETURN v_payment_id;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. RPC: ajustar o saldo da conta para o valor real
--    update_bank_balance soma um delta. Esta define o valor absoluto — é o que
--    você quer ao dizer "hoje tenho X no banco".
--
--    ATENÇÃO ao detalhe: não basta gravar current_balance. A tela do Financeiro
--    tem o botão "Recalcular saldos", que refaz tudo a partir de
--    initial_balance + movimento. Se eu só gravasse o saldo atual, o primeiro
--    clique nesse botão jogaria seu ajuste fora. Por isso ajusto TAMBÉM o
--    initial_balance, de modo que o recálculo chegue no mesmo número.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_bank_balance(
  p_account_id  uuid,
  p_new_balance numeric,
  p_reason      text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_antes     numeric;
  v_movimento numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_new_balance IS NULL THEN
    RAISE EXCEPTION 'Informe o saldo';
  END IF;

  SELECT current_balance INTO v_antes
  FROM public.bank_accounts WHERE id = p_account_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta bancaria nao encontrada: %', p_account_id;
  END IF;

  -- Movimento real desta conta — exatamente o mesmo cálculo do
  -- recalculate_all_bank_balances (item 7), para os dois baterem sempre.
  SELECT COALESCE(SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END), 0)
  INTO v_movimento
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE op.account_id = p_account_id
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND COALESCE(op.affects_balance, true) = true;

  UPDATE public.bank_accounts
  SET initial_balance = p_new_balance - v_movimento,
      current_balance = p_new_balance,
      updated_at = now()
  WHERE id = p_account_id;

  RETURN v_antes;   -- devolve o saldo anterior, para a tela mostrar a diferença
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. Permissões
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.register_informational_payment(uuid, numeric, date, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_bank_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_informational_payment(uuid, numeric, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bank_balance(uuid, numeric, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. CORREÇÃO DE BUG — o CCE mentia
--    Estava: ROUND(COALESCE(v_pmr,0) - COALESCE(v_pmp,0), 1)
--    Sem nenhum pagamento registrado, PMR e PMP são NULL e a conta dava 0.
--    A tela mostrava "0d" em VERDE, como se o ciclo de caixa fosse perfeito —
--    quando na verdade não havia dado nenhum. Agora devolve NULL, e a tela
--    mostra "—", que é a verdade.
-- ---------------------------------------------------------------------------
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
BEGIN
  -- Prazo médio de recebimento. Lançamento informativo entra: ele representa
  -- recebimento real, só não mexeu no saldo.
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
  SELECT COALESCE(SUM(op.amount) / NULLIF((p_end - p_start), 0), 0) INTO v_avg_out
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
    -- só calcula o ciclo se houver os DOIS lados; senão é NULL (a tela mostra "—")
    CASE WHEN v_pmr IS NULL OR v_pmp IS NULL THEN NULL
         ELSE ROUND(v_pmr - v_pmp, 1) END,
    ROUND(v_coverage, 1),
    ROUND(v_avg_out, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_liquidity_kpis(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_liquidity_kpis(date, date) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. Estorno precisa respeitar o informativo
--    reverse_payment chamava update_bank_balance sem perguntar nada. Estornar
--    um lançamento informativo TIRARIA do saldo um dinheiro que nunca entrou
--    por ele — o erro inverso do que estamos consertando.
--    Também: a linha de estorno herda o affects_balance da original, senão ela
--    voltaria a contar no recálculo do item 7.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $reverse_payment$
DECLARE
  v_pay public.obligation_payments%ROWTYPE;
  v_type text;
  v_delta numeric;
  v_reversal_id uuid;
BEGIN
  PERFORM public.assert_finance_access();

  SELECT * INTO v_pay
  FROM public.obligation_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF v_pay.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment already reversed';
  END IF;

  SELECT type INTO v_type
  FROM public.financial_obligations
  WHERE id = v_pay.obligation_id;

  v_delta := CASE
    WHEN v_type = 'receivable' THEN -v_pay.amount
    ELSE v_pay.amount
  END;

  UPDATE public.obligation_payments
  SET reversed_at = now(), reversed_by = NULL
  WHERE id = p_payment_id;

  INSERT INTO public.obligation_payments (
    user_id, obligation_id, amount, payment_date, account_id,
    method, notes, reversal_of, affects_balance
  ) VALUES (
    auth.uid(), v_pay.obligation_id, v_pay.amount, CURRENT_DATE, v_pay.account_id,
    v_pay.method, COALESCE(p_reason, 'Estorno'), p_payment_id,
    COALESCE(v_pay.affects_balance, true)
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.obligation_payments
  SET reversed_by = v_reversal_id
  WHERE id = p_payment_id;

  -- AQUI está a mudança: informativo não mexeu no saldo, então o estorno
  -- também não mexe.
  IF COALESCE(v_pay.affects_balance, true) THEN
    PERFORM public.update_bank_balance(v_pay.account_id, v_delta);
  END IF;

  UPDATE public.financial_obligations
  SET status = (SELECT derived_status FROM public.obligation_summary WHERE id = v_pay.obligation_id),
      updated_at = now()
  WHERE id = v_pay.obligation_id;
END;
$reverse_payment$;

REVOKE ALL ON FUNCTION public.reverse_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------------
-- 7. O botão "Recalcular saldos" do Financeiro
--    Sem este ajuste, um clique nele somaria todos os informativos ao saldo e
--    o problema voltaria inteiro.
--
--    Aproveito para corrigir um bug que já existia ali: o filtro era só
--    `reversed_at IS NULL`, o que EXCLUI o pagamento estornado mas INCLUI a
--    linha de estorno (que tem reversed_at nulo). Um recebimento estornado
--    somava no saldo em vez de zerar. Faltava `reversal_of IS NULL`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_all_bank_balances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  PERFORM public.assert_finance_access();

  FOR r IN SELECT id FROM public.bank_accounts LOOP
    UPDATE public.bank_accounts
    SET current_balance = initial_balance + COALESCE((
          SELECT SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END)
          FROM public.obligation_payments op
          JOIN public.financial_obligations fo ON fo.id = op.obligation_id
          WHERE op.account_id = r.id
            AND op.reversed_at IS NULL
            AND op.reversal_of IS NULL
            AND COALESCE(op.affects_balance, true) = true
        ), 0),
        updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_all_bank_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_bank_balances() TO authenticated;


-- ---------------------------------------------------------------------------
-- 8. CRASH: sem nenhuma conta bancária cadastrada, o Financeiro caía
--
--    Em get_cash_position todas as somas tinham COALESCE(..., 0) — menos uma:
--        (SELECT SUM(current_balance) FROM bank_accounts WHERE is_active)
--    SUM() sobre conjunto vazio devolve NULL, não zero. Esse NULL chegava no
--    formatCurrency da tela, o TypeError derrubava a árvore do React e o
--    usuário via tela de erro. Era o único campo desprotegido da função.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_position(
  p_start date DEFAULT NULL,
  p_end   date DEFAULT NULL
) RETURNS TABLE (
  projected_balance  numeric,
  reconciled_balance numeric,
  net_flow           numeric,
  total_receivable   numeric,
  total_payable      numeric
)
LANGUAGE plpgsql
SET search_path = public
AS $$
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
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_pagar
  FROM public.obligation_summary
  WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  RETURN QUERY SELECT
    v_saldo + v_receber - v_pagar,   -- projected_balance
    v_saldo,                          -- reconciled_balance (era o NULL)
    v_receber - v_pagar,              -- net_flow
    v_receber,                        -- total_receivable
    v_pagar;                          -- total_payable
END;
$$;


-- =============================================================================
-- Verificação:
--   -- com zero contas bancárias, nenhuma coluna pode voltar NULL:
--   SELECT * FROM get_cash_position(NULL, NULL);
--
--   SELECT * FROM get_liquidity_kpis(date '2026-07-01', date '2026-07-31');
--   -- sem pagamentos: pmr, pmp, cce e coverage todos NULL (a tela mostra "—")
--
--   SELECT id, name, current_balance FROM bank_accounts WHERE is_active;
-- =============================================================================

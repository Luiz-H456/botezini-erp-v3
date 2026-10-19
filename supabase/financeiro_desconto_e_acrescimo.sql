-- =============================================================================
-- FINANCEIRO — baixa com desconto ou acréscimo
-- Run no SQL Editor do Supabase.
--
-- O PROBLEMA
--
-- `pay_obligation` recusava qualquer valor acima do saldo:
--     IF p_amount > v_remaining THEN RAISE EXCEPTION 'exceeds remaining balance'
-- Então não havia como lançar juros ou multa: o cliente pagava R$ 1.050 numa
-- conta de R$ 1.000 e o sistema não aceitava.
--
-- E desconto não existia. Pagar menos era aceito como pagamento PARCIAL, o que
-- é diferente: a conta ficava aberta com um resíduo que ninguém iria pagar,
-- inflando o "a receber" para sempre e estragando a idade da carteira.
--
-- A SOLUÇÃO
--
-- Duas colunas explícitas, ambas sempre positivas, porque somar tudo num campo
-- com sinal deixa impossível responder depois "quanto eu dei de desconto no
-- ano?" — que é justamente a pergunta que se faz:
--
--   desconto   → o que você abriu mão de receber (ou o fornecedor te abateu)
--   acrescimo  → juros e multa cobrados por atraso
--
-- A conta que fecha:
--
--   dinheiro que entrou/saiu ......... p_amount        (mexe no saldo do banco)
--   dívida liquidada ................. p_amount + desconto − acrescimo
--
-- Ou seja: dívida de 1.000 paga com 950 + 50 de desconto está QUITADA. E 1.050
-- pagos com 50 de acréscimo também quitam os mesmos 1.000 — os 50 a mais são
-- receita de juros, não amortização.
--
-- A trava contra digitação errada CONTINUA: o que não pode exceder o saldo é a
-- dívida liquidada, não o dinheiro. Digitar 10.000 em vez de 1.000 segue sendo
-- recusado.
-- =============================================================================

BEGIN;

ALTER TABLE public.obligation_payments
  ADD COLUMN IF NOT EXISTS desconto  numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acrescimo numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ajuste_motivo text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'obligation_payments_ajuste_nonneg') THEN
    ALTER TABLE public.obligation_payments
      ADD CONSTRAINT obligation_payments_ajuste_nonneg
      CHECK (desconto >= 0 AND acrescimo >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.obligation_payments.desconto IS
  'Valor abatido da dívida sem entrada de caixa. Liquida, mas não some no banco.';
COMMENT ON COLUMN public.obligation_payments.acrescimo IS
  'Juros/multa recebidos além da dívida. Entra no caixa, mas não amortiza.';

CREATE OR REPLACE FUNCTION public.pay_obligation(
  p_obligation_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_method text DEFAULT 'PIX',
  p_payment_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_desconto numeric DEFAULT 0,
  p_acrescimo numeric DEFAULT 0,
  p_ajuste_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_obligation public.financial_obligations%ROWTYPE;
  v_paid numeric;
  v_remaining numeric;
  v_delta numeric;
  v_desconto numeric := COALESCE(p_desconto, 0);
  v_acrescimo numeric := COALESCE(p_acrescimo, 0);
  v_liquidado numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor pago precisa ser maior que zero';
  END IF;
  IF v_desconto < 0 OR v_acrescimo < 0 THEN
    RAISE EXCEPTION 'Desconto e acréscimo não podem ser negativos';
  END IF;
  -- Os dois juntos não fazem sentido: ou você abateu, ou cobrou a mais.
  IF v_desconto > 0 AND v_acrescimo > 0 THEN
    RAISE EXCEPTION 'Informe desconto OU acréscimo, não os dois';
  END IF;

  SELECT * INTO v_obligation
  FROM public.financial_obligations
  WHERE id = p_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada: %', p_obligation_id;
  END IF;

  IF v_obligation.cancelled_at IS NOT NULL OR v_obligation.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não dá para baixar uma conta cancelada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bank_accounts WHERE id = p_account_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Conta bancária não encontrada ou inativa: %', p_account_id;
  END IF;

  SELECT COALESCE(SUM(amount + desconto - acrescimo), 0)
  INTO v_paid
  FROM public.obligation_payments
  WHERE obligation_id = p_obligation_id
    AND reversed_at IS NULL
    AND reversal_of IS NULL;

  v_remaining := v_obligation.original_amount - v_paid;

  -- O que amortiza a dívida é o dinheiro MAIS o desconto MENOS o acréscimo.
  -- Juros não abatem dívida; desconto abate sem dinheiro entrar.
  v_liquidado := p_amount + v_desconto - v_acrescimo;

  IF v_liquidado > v_remaining + 0.005 THEN
    RAISE EXCEPTION
      'O valor liquidado (% ) passa do saldo em aberto (%). Confira o desconto informado.',
      round(v_liquidado, 2), round(v_remaining, 2);
  END IF;

  -- O saldo do banco move pelo DINHEIRO, não pelo liquidado.
  v_delta := CASE WHEN v_obligation.type = 'receivable' THEN p_amount ELSE -p_amount END;

  INSERT INTO public.obligation_payments (
    obligation_id, amount, payment_date, account_id, method, notes, attachments,
    desconto, acrescimo, ajuste_motivo
  ) VALUES (
    p_obligation_id, p_amount, p_payment_date, p_account_id, p_method, p_notes,
    COALESCE(p_attachments, '[]'::jsonb),
    v_desconto, v_acrescimo, NULLIF(btrim(COALESCE(p_ajuste_motivo, '')), '')
  ) RETURNING id INTO v_payment_id;

  PERFORM public.update_bank_balance(p_account_id, v_delta);

  RETURN v_payment_id;
END;
$$;

-- A assinatura de 7 parâmetros vira ambígua com a de 10 na chamada por nome.
DROP FUNCTION IF EXISTS public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb);

REVOKE ALL ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_obligation(uuid, numeric, uuid, text, date, text, jsonb, numeric, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Verificação:
--
-- 1. Restou UMA função com este nome? (2 quebram a chamada por nome)
--    SELECT oid::regprocedure FROM pg_proc WHERE proname = 'pay_obligation';
--
-- 2. Os pagamentos antigos continuam somando igual (desconto/acréscimo = 0):
--    SELECT obligation_id, SUM(amount), SUM(amount + desconto - acrescimo)
--      FROM obligation_payments GROUP BY obligation_id HAVING SUM(amount) <> SUM(amount + desconto - acrescimo);
--    -- deve voltar VAZIO.
-- =============================================================================

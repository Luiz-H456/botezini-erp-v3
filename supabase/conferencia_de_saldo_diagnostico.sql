-- =============================================================================
-- SALDO BANCARIO — DIAGNOSTICO E GARANTIA
--
-- POR QUE ESTE ARQUIVO EXISTE
-- O alerta de "saldo divergente" do painel disparou, alguem clicou em
-- "Sincronizar Saldos", e o saldo de uma conta foi de +50 mil para -26 mil.
-- Sincronizar NAO conserta: ela APAGA o saldo guardado e escreve no lugar
-- (saldo inicial + soma dos lancamentos). Quando o saldo guardado era o certo,
-- o clique troca o numero bom pelo derivado.
--
-- Este arquivo faz tres coisas, nesta ordem:
--   1. MOSTRA qual dos dois numeros esta errado, sem alterar nada
--   2. GARANTE que a funcao de recalculo em producao e a versao correta
--   3. Explica como reancorar o saldo certo
--
-- A PARTE 1 E SOMENTE LEITURA. Rode ela primeiro, sozinha.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. O RAIO-X  (nao altera nada — pode rodar a vontade)
--
-- Para cada conta ativa: o que esta guardado, o que a formula da, e de quanto
-- e a diferenca. A coluna `lancamentos_sem_tipo` e a que denuncia um join
-- quebrado: se ela for maior que zero, a formula esta somando pagamento cuja
-- obrigacao sumiu, e o numero calculado NAO vale nada.
-- ---------------------------------------------------------------------------
SELECT
  b.name                                              AS conta,
  b.current_balance                                   AS guardado,
  b.initial_balance                                   AS saldo_inicial,
  COALESCE(m.movimento, 0)                            AS soma_lancamentos,
  b.initial_balance + COALESCE(m.movimento, 0)        AS calculado,
  b.current_balance - (b.initial_balance + COALESCE(m.movimento, 0)) AS diferenca,
  COALESCE(m.qtd, 0)                                  AS lancamentos,
  COALESCE(orfaos.qtd, 0)                             AS lancamentos_sem_tipo
FROM public.bank_accounts b
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END) AS movimento,
    COUNT(*) AS qtd
  FROM public.obligation_payments op
  JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE op.account_id = b.id
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND COALESCE(op.affects_balance, true) = true
) m ON true
-- Pagamento cuja obrigacao nao existe mais. O LEFT JOIN acha o que o JOIN
-- de cima descarta em silencio — e e exatamente isso que faz a formula mentir.
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS qtd
  FROM public.obligation_payments op
  LEFT JOIN public.financial_obligations fo ON fo.id = op.obligation_id
  WHERE op.account_id = b.id
    AND op.reversed_at IS NULL
    AND op.reversal_of IS NULL
    AND fo.id IS NULL
) orfaos ON true
WHERE b.is_active
ORDER BY abs(b.current_balance - (b.initial_balance + COALESCE(m.movimento, 0))) DESC;


-- ---------------------------------------------------------------------------
-- 1b. Se `lancamentos_sem_tipo` for maior que zero, veja QUAIS sao:
-- ---------------------------------------------------------------------------
-- SELECT op.id, op.amount, op.payment_date, op.notes, op.obligation_id
--   FROM public.obligation_payments op
--   LEFT JOIN public.financial_obligations fo ON fo.id = op.obligation_id
--  WHERE fo.id IS NULL AND op.reversed_at IS NULL AND op.reversal_of IS NULL
--  ORDER BY op.payment_date DESC;


-- ---------------------------------------------------------------------------
-- 2. GARANTIR a versao correta do recalculo
--
-- A versao antiga (schema_botezini.sql) filtrava so `reversed_at IS NULL`.
-- Isso EXCLUI o pagamento estornado mas INCLUI a linha de estorno, que tem
-- reversed_at nulo e guarda o valor POSITIVO do original. Resultado: cada
-- estorno de pagavel subtraia o valor uma vez, quando deveria dar zero — o
-- saldo afunda sozinho, exatamente na direcao do que aconteceu aqui.
--
-- CREATE OR REPLACE e idempotente: rodar com a versao boa ja instalada nao
-- muda nada.
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


-- =============================================================================
-- 3. COMO REANCORAR O SALDO CERTO
--
-- NAO edite bank_accounts na mao. Use a funcao, porque so ela reajusta o
-- initial_balance junto — e e o initial_balance dessincronizado que faz o
-- alerta voltar amanha.
--
--   SELECT public.set_bank_balance(
--     'UUID-DA-CONTA'::uuid,
--     <O SALDO REAL, CONFERIDO NO EXTRATO>,
--     'Ajuste apos sincronizacao indevida');
--
-- O valor acima NAO tem exemplo numerico de proposito. Um numero plausivel num
-- comando que grava saldo e um convite a ser copiado inteiro — e ninguem tem
-- como saber, olhando o comando depois, se aquele valor veio do extrato ou do
-- exemplo. O unico numero certo aqui e o que voce leu no banco.
--
-- Ela devolve o saldo anterior e deixa a conta fechando: depois disso, o
-- raio-x da parte 1 mostra diferenca zero, e nenhum clique em "Sincronizar"
-- muda mais o numero.
--
-- Na tela da o mesmo: Financeiro > a conta > ajustar saldo. O botao chama
-- exatamente esta funcao.
-- =============================================================================

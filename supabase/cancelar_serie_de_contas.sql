-- =============================================================================
-- CANCELAR UMA SÉRIE INTEIRA DE CONTAS
--
-- Rodar no SQL Editor do Supabase. NÃO APAGA DADO: marca cancelled_at, igual
-- ao cancelamento individual que já existe.
--
-- O PEDIDO: "quero conseguir excluir uma conta recorrente ou parcelada por
-- completo". Hoje é uma de cada vez — um salário de doze meses exige doze
-- cancelamentos, cada um com sua confirmação. Ninguém faz doze: faz três,
-- cansa, e ficam nove parcelas fantasmas projetando saída de caixa que não vai
-- acontecer. Isso é pior do que não ter cancelado nenhuma, porque agora a
-- previsão está errada e ninguém sabe que está.
--
-- CANCELAR E NÃO APAGAR, DE PROPÓSITO. Uma obrigação cancelada continua
-- existindo, com cancelled_at preenchido, e é assim que o resto do sistema já
-- funciona (há 23 delas hoje). A conferência de saldo e o histórico precisam do
-- registro de que aquilo existiu e foi desfeito; um DELETE deixaria um buraco
-- que ninguém consegue explicar seis meses depois — e some da tela do mesmo
-- jeito, que é o que se quer.
--
-- DUAS COLUNAS, NÃO UMA. "Recorrente" e "parcelada" nascem de funções
-- diferentes e se agrupam por colunas diferentes:
--
--   recurrence_id     create_recurrence_obligations — o salário de 12 meses
--   split_group_id    apply_order_payment_plan — a entrada + 2x de um pedido
--
-- A função aceita as duas. Quem olhasse só recurrence_id acharia que o
-- parcelamento de pedido não é série.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ANTES — que séries existem, e quantas parcelas cada uma tem
--    (somente leitura)
-- ---------------------------------------------------------------------------
SELECT COALESCE(o.recurrence_id::text, o.split_group_id::text)  AS serie,
       CASE WHEN o.recurrence_id IS NOT NULL
            THEN 'recorrencia' ELSE 'parcelamento' END          AS tipo,
       count(*)                                                 AS parcelas,
       count(*) FILTER (WHERE o.cancelled_at IS NOT NULL)        AS ja_canceladas,
       min(o.description)                                        AS exemplo
  FROM public.financial_obligations o
 WHERE o.recurrence_id IS NOT NULL OR o.split_group_id IS NOT NULL
 GROUP BY 1, 2
 ORDER BY 3 DESC
 LIMIT 20;


-- ---------------------------------------------------------------------------
-- 2. A FUNÇÃO
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_obligation_series(
  p_obligation_id  uuid,
  p_reason         text DEFAULT NULL,
  -- Falso cancela a série toda; verdadeiro preserva o que já venceu.
  --
  -- As duas intenções são legítimas e dão resultados bem diferentes: "essa
  -- despesa acabou, pare de projetá-la" quer só as futuras; "essa conta nunca
  -- deveria ter sido lançada" quer todas. Quem decide é quem está na tela, e
  -- por isso não há um padrão esperto aqui.
  p_apenas_futuras boolean DEFAULT false
) RETURNS TABLE(
  canceladas            integer,
  mantidas_por_pagamento integer,
  ja_estavam_canceladas integer,
  valor_cancelado       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec   uuid;
  v_split uuid;
  v_hoje  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM public.assert_finance_access();

  SELECT o.recurrence_id, o.split_group_id
    INTO v_rec, v_split
    FROM public.financial_obligations o
   WHERE o.id = p_obligation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada: %', p_obligation_id;
  END IF;

  IF v_rec IS NULL AND v_split IS NULL THEN
    RAISE EXCEPTION
      'Esta conta não faz parte de uma série: não é recorrente nem parcelada. Use o cancelamento individual.';
  END IF;

  -- A recorrência ganha da parcela quando as duas existem: uma obrigação com
  -- as duas colunas nasceu de uma recorrência que depois foi parcelada, e a
  -- recorrência é o grupo maior.
  IF v_rec IS NOT NULL THEN
    v_split := NULL;
  END IF;

  -- Tudo numa instrução só. Se qualquer parcela falhar, nenhuma é cancelada —
  -- e meia série cancelada seria o pior dos estados: some da tela pela metade,
  -- e a previsão de caixa fica errada sem ninguém perceber.
  WITH alvo AS (
    SELECT o.id, o.original_amount
      FROM public.financial_obligations o
     WHERE ((v_rec   IS NOT NULL AND o.recurrence_id  = v_rec)
         OR (v_split IS NOT NULL AND o.split_group_id = v_split))
       AND o.cancelled_at IS NULL
       -- Pagamento ativo trava, exatamente como no cancelamento individual.
       -- Não é limitação técnica: dinheiro que entrou ou saiu não vira "nunca
       -- existiu". Para essas, estorne o pagamento antes.
       AND NOT EXISTS (
             SELECT 1 FROM public.obligation_payments p
              WHERE p.obligation_id = o.id
                AND p.reversed_at IS NULL
                AND p.reversal_of IS NULL)
       AND (NOT p_apenas_futuras OR o.due_date > v_hoje)
  ), feito AS (
    UPDATE public.financial_obligations o
       SET status           = 'cancelled',
           cancelled_at     = now(),
           cancelled_reason = COALESCE(p_reason, 'Série cancelada'),
           updated_at       = now()
      FROM alvo
     WHERE o.id = alvo.id
     RETURNING o.id, o.original_amount
  )
  SELECT count(*)::integer, COALESCE(sum(original_amount), 0)
    INTO canceladas, valor_cancelado
    FROM feito;

  SELECT count(*)::integer
    INTO mantidas_por_pagamento
    FROM public.financial_obligations o
   WHERE ((v_rec   IS NOT NULL AND o.recurrence_id  = v_rec)
       OR (v_split IS NOT NULL AND o.split_group_id = v_split))
     AND o.cancelled_at IS NULL
     AND EXISTS (SELECT 1 FROM public.obligation_payments p
                  WHERE p.obligation_id = o.id
                    AND p.reversed_at IS NULL
                    AND p.reversal_of IS NULL);

  SELECT count(*)::integer
    INTO ja_estavam_canceladas
    FROM public.financial_obligations o
   WHERE ((v_rec   IS NOT NULL AND o.recurrence_id  = v_rec)
       OR (v_split IS NOT NULL AND o.split_group_id = v_split))
     AND o.cancelled_at IS NOT NULL;

  -- Descontadas as que acabaram de ser canceladas nesta chamada, senão o
  -- número devolvido diria que elas "já estavam" — e a tela mostraria a
  -- mesma parcela contada duas vezes, em duas colunas que se contradizem.
  ja_estavam_canceladas := ja_estavam_canceladas - canceladas;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_obligation_series(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_obligation_series(uuid, text, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. DEPOIS — a função existe e exige acesso financeiro?
-- ---------------------------------------------------------------------------
SELECT p.proname,
       p.prosecdef                                   AS security_definer,
       pg_get_function_result(p.oid)                 AS retorno,
       (pg_get_functiondef(p.oid) LIKE '%assert_finance_access%') AS confere_acesso
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'cancel_obligation_series';
-- confere_acesso precisa vir `t`. Sem isso a fábrica cancelaria série
-- financeira, que é justamente o que a auditoria fechou nas outras funções.

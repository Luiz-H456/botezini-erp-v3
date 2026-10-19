-- =============================================================================
-- A BAIXA COM DESCONTO NAO FECHAVA A CONTA
--
-- Rodar no SQL Editor do Supabase. NAO APAGA DADO: recria uma view.
--
-- O SINTOMA, como o Luiz relatou: "quando dou baixa numa conta com valor
-- parcial, se ela for recorrente ou parcelada, ela nao da baixa por completo".
--
-- A CAUSA. Duas partes do sistema discordavam sobre o que significa "pago":
--
--   pay_obligation (a funcao que registra a baixa)
--       SUM(amount + desconto - acrescimo)
--       -> desconto ABATE a divida; acrescimo (juros/multa) NAO abate
--
--   obligation_summary (a view que a tela le)
--       SUM(amount)
--       -> so o dinheiro conta; o desconto era ignorado
--
-- Quem quita R$ 2.844,44 com R$ 1.000,00 em dinheiro e R$ 1.844,44 de desconto
-- deixa a funcao satisfeita — para ela a divida zerou — enquanto a view segue
-- dizendo que faltam R$ 1.844,44. A conta fica presa: aparece em aberto E
-- recusa novo pagamento, porque a funcao acha que ja nao ha o que pagar.
--
-- QUAL DAS DUAS ESTAVA CERTA. A funcao. Desconto e divida perdoada: some do que
-- se deve sem dinheiro sair. Acrescimo e juros: dinheiro que sai sem abater
-- principal. A view e que precisava aprender isso.
--
-- POR QUE PARECIA COISA DE CONTA RECORRENTE. Nao e — atinge qualquer baixa com
-- desconto. So que as contas que voce quita com desconto sao justamente os
-- salarios e o pro-labore, que sao recorrentes. As nove afetadas hoje sao todas
-- (1/12).
--
-- O QUE MUDA NA TELA. As nove contas passam a aparecer como PAGAS. Isso e o que
-- voce mandou fazer quando marcou "quitar com desconto" — a tela e que nunca
-- obedeceu. Confira a lista na parte 1 antes de seguir: se alguma delas era
-- para continuar devendo, o certo NAO e deixar este arquivo de lado, e sim
-- estornar aquela baixa e refaze-la como pagamento parcial (sem marcar o
-- desconto).
--
-- paid_amount CONTINUA SENDO DINHEIRO. O grafico de fluxo de caixa soma esse
-- campo para saber quanto entrou e saiu de fato; se ele passasse a incluir
-- desconto, o caixa passaria a mostrar dinheiro que nunca existiu. Quem
-- amortiza agora tem campo proprio: amortized_amount.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ANTES DE MEXER — quais contas estao presas  (nao altera nada)
-- ---------------------------------------------------------------------------
SELECT o.description                                          AS conta,
       o.original_amount                                      AS valor,
       SUM(p.amount)                                          AS dinheiro_pago,
       SUM(p.desconto)                                        AS desconto_dado,
       o.original_amount - SUM(p.amount)                      AS a_tela_diz_que_falta,
       o.original_amount - SUM(p.amount + p.desconto - p.acrescimo) AS realmente_falta
  FROM public.financial_obligations o
  JOIN public.obligation_payments p ON p.obligation_id = o.id
 WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL
 GROUP BY o.id, o.description, o.original_amount
HAVING SUM(p.desconto) > 0
 ORDER BY 5 DESC;
-- Cada linha aqui e uma conta que a tela mostra em aberto e que, depois da
-- correcao, passa a aparecer paga.


-- ---------------------------------------------------------------------------
-- 2. A CORRECAO
--
-- O corpo abaixo foi EXTRAIDO da view que roda em producao, e nao reescrito de
-- memoria. Quatro expressoes mudaram e uma coluna entrou; todo o resto e
-- identico, coluna por coluna, ate a ordem.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.obligation_summary WITH (security_invoker='on') AS
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
    COALESCE(sum(p.amount) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric) AS paid_amount,
    (o.original_amount - COALESCE(sum(((p.amount + p.desconto) - p.acrescimo)) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric)) AS remaining_amount,
    count(p.id) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))) AS payment_count,
    round(
        CASE
            WHEN (o.original_amount > (0)::numeric) THEN ((COALESCE(sum(((p.amount + p.desconto) - p.acrescimo)) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric) / o.original_amount) * (100)::numeric)
            ELSE (0)::numeric
        END, 2) AS paid_pct,
        CASE
            WHEN (o.cancelled_at IS NOT NULL) THEN 'cancelled'::text
            WHEN ((o.original_amount - COALESCE(sum(((p.amount + p.desconto) - p.acrescimo)) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric)) <= (0)::numeric) THEN 'paid'::text
            WHEN (COALESCE(sum(((p.amount + p.desconto) - p.acrescimo)) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric) > (0)::numeric) THEN 'partial'::text
            WHEN (o.due_date < ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date) THEN 'overdue'::text
            ELSE 'open'::text
        END AS derived_status,
    o.global_category_id,
    o.order_id,
    o.planned_method,
    -- Coluna NOVA, e por isso ela esta no fim e nao ao lado do paid_amount:
    -- CREATE OR REPLACE VIEW so aceita acrescentar coluna no final. Tentar
    -- encaixa-la no meio da erro "cannot change name of view column", porque
    -- para o PostgreSQL isso e RENOMEAR as colunas seguintes.
    COALESCE(sum(((p.amount + p.desconto) - p.acrescimo)) FILTER (WHERE ((p.reversed_at IS NULL) AND (p.reversal_of IS NULL))), (0)::numeric) AS amortized_amount
   FROM (public.financial_obligations o
     LEFT JOIN public.obligation_payments p ON ((o.id = p.obligation_id)))
  GROUP BY o.id;

GRANT SELECT ON public.obligation_summary TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. DEPOIS — precisa vir VAZIO
--
-- Nenhuma conta pode sobrar onde a view e a funcao discordem.
-- ---------------------------------------------------------------------------
SELECT s.description, s.remaining_amount AS view_diz,
       o.original_amount - COALESCE((SELECT SUM(p.amount + p.desconto - p.acrescimo)
                                       FROM public.obligation_payments p
                                      WHERE p.obligation_id = o.id
                                        AND p.reversed_at IS NULL
                                        AND p.reversal_of IS NULL), 0) AS funcao_diz
  FROM public.obligation_summary s
  JOIN public.financial_obligations o ON o.id = s.id
 WHERE s.remaining_amount IS DISTINCT FROM
       o.original_amount - COALESCE((SELECT SUM(p.amount + p.desconto - p.acrescimo)
                                       FROM public.obligation_payments p
                                      WHERE p.obligation_id = o.id
                                        AND p.reversed_at IS NULL
                                        AND p.reversal_of IS NULL), 0);


-- ---------------------------------------------------------------------------
-- 4. E as nove que estavam presas, agora pagas
-- ---------------------------------------------------------------------------
SELECT derived_status, count(*), SUM(remaining_amount) AS total_em_aberto
  FROM public.obligation_summary
 GROUP BY derived_status
 ORDER BY 2 DESC;

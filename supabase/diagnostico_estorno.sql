-- =============================================================================
-- Por que estornar não libera o cancelamento — diagnóstico em UMA query
--
-- SOMENTE LEITURA. Nenhum DROP, DELETE ou UPDATE. Nada é alterado.
--
-- É uma query só de propósito: o SQL Editor do Supabase mostra apenas o
-- resultado da ÚLTIMA instrução quando você roda várias de uma vez, então
-- diagnóstico dividido em vários SELECTs perde as respostas pelo caminho.
--
-- COMO LER O RESULTADO
--   itens 1 e 2  → dizem se a função e a view estão com o filtro completo
--   itens 3      → uma linha por conta que tem estorno, com quantos pagamentos
--                  AINDA estão ativos nela
--
-- O que se espera de uma conta estornada por inteiro: `0 ativo(s)`. Se aparecer
-- `1 ativo(s)` ou mais numa conta que você acha que estornou toda, é porque
-- sobrou pagamento — foram dois lançamentos e você estornou um.
-- =============================================================================

WITH funcao AS (
    SELECT pg_get_functiondef(p.oid) AS src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_obligation'
    LIMIT 1
),
def_da_view AS (
    SELECT pg_get_viewdef('public.obligation_summary'::regclass, true) AS src
),
contas AS (
    SELECT
        o.id,
        COALESCE(o.description, '(sem descrição)') AS descricao,
        o.status,
        COUNT(*) FILTER (WHERE p.reversed_at IS NULL
                           AND p.reversal_of IS NULL)  AS ativos,
        COUNT(*) FILTER (WHERE p.reversal_of IS NOT NULL) AS estornos,
        COUNT(*)                                        AS linhas
    FROM public.financial_obligations o
    JOIN public.obligation_payments p ON p.obligation_id = o.id
    WHERE o.cancelled_at IS NULL
    GROUP BY o.id, o.description, o.status
)

SELECT
    '1. cancel_obligation'::text AS item,
    (CASE
        WHEN NOT EXISTS (SELECT 1 FROM funcao)
            THEN 'NAO ENCONTRADA no schema public'
        WHEN (SELECT src FROM funcao) LIKE '%reversal_of IS NULL%'
            THEN 'OK - ignora o contra-lancamento do estorno'
        ELSE 'PROBLEMA - conta o contra-lancamento como pagamento ativo'
     END)::text AS resultado,
    ''::text AS detalhe

UNION ALL
SELECT
    '2. view obligation_summary'::text,
    (CASE
        WHEN (SELECT src FROM def_da_view) LIKE '%reversal_of IS NULL%'
            THEN 'OK - ignora o contra-lancamento do estorno'
        ELSE 'PROBLEMA - soma o contra-lancamento em paid_amount'
     END)::text,
    ''::text

UNION ALL
SELECT
    ('3. conta com estorno')::text,
    c.descricao::text,
    (c.ativos || ' ativo(s) de ' || c.linhas || ' lancamento(s)'
        || ' | ' || c.estornos || ' estorno(s)'
        || ' | status: ' || c.status
        || ' | id: ' || c.id)::text
FROM contas c
WHERE c.estornos > 0

ORDER BY 1, 3;

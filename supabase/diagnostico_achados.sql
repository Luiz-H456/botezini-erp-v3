-- =============================================================================
-- DIAGNÓSTICO DOS ACHADOS NOS DADOS  (v3 — 14/10/2026)
-- SÓ LEITURA. É UMA consulta só (um SELECT): não grava, não apaga, não cria nada.
-- Pode rodar no SQL Editor do Supabase (que mostra só o último resultado — por
-- isso é uma consulta única) ou no psql.
--
-- Devolve uma tabela: achado · item · detalhe. Cada achado é uma lista para o
-- Luiz decidir; nada aqui corrige coisa nenhuma. As correções, quando ele
-- decidir, vêm em arquivos próprios, com consulta de antes e de depois.
--
-- Os 7 achados (roteiro v3, seção 4, e notas de 06/10):
--   1. o pagamento de R$ 209.254,00 numa conta de R$ 2.546,67
--   2. categorias marcadas como custo do produto
--   3. clientes com o mesmo nome
--   4. pedidos cujas parcelas não fecham com o total
--   5. possíveis lançamentos em dobro (folha em duas categorias; empréstimos)
--   6. caixinhas abaixo do ritmo da meta (a do 13º)
--   7. bancos no negativo e PIX que sai x PIX que entra em 90 dias
-- =============================================================================

WITH
pag AS (   -- pagamentos que valem (nem estornados, nem estorno)
  SELECT p.*, o.type, o.description, o.original_amount, o.category, o.order_id
    FROM public.obligation_payments p
    JOIN public.financial_obligations o ON o.id = p.obligation_id
   WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL
),

-- 1. Pagamento maior que a própria conta (o de R$ 209.254 é o caso conhecido;
--    a consulta pega qualquer outro do mesmo tipo).
a1 AS (
  SELECT '1. pagamento maior que a conta' AS achado,
         to_char(payment_date, 'DD/MM/YYYY') || ' · ' || description AS item,
         'pagou R$ ' || translate(to_char(amount, 'FM999,999,990.00'), ',.', '.,') || ' numa conta de R$ '
           || translate(to_char(original_amount, 'FM999,999,990.00'), ',.', '.,') || ' · pagamento ' || id AS detalhe
    FROM pag
   WHERE amount > original_amount * 1.5 AND amount - original_amount > 100
),

-- 2. Categorias que entram como custo do produto no Resultado. "Imposto" e
--    "Cartão de crédito" estavam marcadas; imposto já tem linha própria.
a2 AS (
  SELECT '2. categoria marcada custo do produto' AS achado,
         g.name AS item,
         'natureza ' || coalesce(g.natureza, '—') || ' · ' ||
         (SELECT count(*) FROM public.financial_obligations o WHERE o.category = g.name)
           || ' conta(s) com essa categoria' AS detalhe
    FROM public.global_categories g
   WHERE g.custo_do_produto AND g.is_active
),

-- 3. Clientes com o mesmo nome. Mesmo nome com CNPJ diferente costuma ser
--    filial (não é duplicado); mesmo nome sem CNPJ ou com o mesmo CNPJ, é.
nomes AS (
  SELECT lower(btrim(regexp_replace(company_name, '\s+', ' ', 'g'))) AS nome, count(*) AS n
    FROM public.clients GROUP BY 1 HAVING count(*) > 1
),
a3 AS (
  SELECT '3. clientes com o mesmo nome' AS achado,
         c.company_name AS item,
         'CNPJ ' || coalesce(nullif(c.cnpj, ''), 'vazio') || ' · grupo ' || coalesce(nullif(c.grupo_economico, ''), '—')
           || ' · ' || (SELECT count(*) FROM public.orders o WHERE o.client_id = c.id) || ' pedido(s) · id ' || c.id AS detalhe
    FROM public.clients c
    JOIN nomes n ON n.nome = lower(btrim(regexp_replace(c.company_name, '\s+', ' ', 'g')))
),

-- 4. Pedidos cuja soma das parcelas a receber não bate com o total do pedido.
somas AS (
  SELECT o.order_id, sum(o.original_amount) AS parcelas, count(*) AS qtd
    FROM public.financial_obligations o
   WHERE o.type = 'receivable' AND o.order_id IS NOT NULL AND o.cancelled_at IS NULL
   GROUP BY o.order_id
),
a4 AS (
  SELECT '4. parcelas não fecham com o pedido' AS achado,
         ord.order_number || ' · ' || coalesce(ord.status, '—') AS item,
         'pedido R$ ' || translate(to_char(ord.total_amount, 'FM999,999,990.00'), ',.', '.,') || ' · parcelas R$ '
           || translate(to_char(coalesce(s.parcelas, 0), 'FM999,999,990.00'), ',.', '.,') || ' (' || coalesce(s.qtd, 0) || ') · diferença R$ '
           || translate(to_char(ord.total_amount - coalesce(s.parcelas, 0), 'FM999,999,990.00'), ',.', '.,') AS detalhe
    FROM public.orders ord
    LEFT JOIN somas s ON s.order_id = ord.id
   WHERE ord.status IS DISTINCT FROM 'Cancelado'
     AND abs(ord.total_amount - coalesce(s.parcelas, 0)) > 0.01
),

-- 5a. Folha lançada em duas categorias: mesmo valor, mesmo mês, uma em
--     "Folha - Salários" e outra em "Folha de Pagamento".
a5a AS (
  SELECT '5. folha em duas categorias (possível dobro)' AS achado,
         to_char(a.due_date, 'MM/YYYY') || ' · R$ ' || translate(to_char(a.original_amount, 'FM999,999,990.00'), ',.', '.,') AS item,
         a.description || '  ×  ' || b.description AS detalhe
    FROM public.financial_obligations a
    JOIN public.financial_obligations b
      ON b.type = 'payable' AND b.cancelled_at IS NULL
     AND b.category = 'Folha de Pagamento'
     AND b.original_amount = a.original_amount
     AND date_trunc('month', b.due_date) = date_trunc('month', a.due_date)
   WHERE a.type = 'payable' AND a.cancelled_at IS NULL AND a.category = 'Folha - Salários'
),
-- 5b. Contas a pagar iguais: mesma descrição, mesmo valor, mesmo vencimento.
a5b AS (
  SELECT '5. conta a pagar repetida' AS achado,
         min(description) || ' · ' || to_char(due_date, 'DD/MM/YYYY') AS item,
         count(*) || ' iguais de R$ ' || translate(to_char(original_amount, 'FM999,999,990.00'), ',.', '.,') AS detalhe
    FROM public.financial_obligations
   WHERE type = 'payable' AND cancelled_at IS NULL
   GROUP BY lower(btrim(description)), original_amount, due_date
  HAVING count(*) > 1
),
-- 5c. Duas séries de empréstimo com a mesma numeração no mesmo mês
--     (ex.: "emprestimo (13/18)" R$ 828,54 e "Empréstimo (13/18)" R$ 613,82):
--     dois contratos ou um lançado duas vezes? Pergunta para o contador.
a5c AS (
  SELECT '5. empréstimo com duas séries no mesmo mês' AS achado,
         to_char(date_trunc('month', due_date), 'MM/YYYY') || ' · ' || substring(description from '\(\d+/\d+\)') AS item,
         string_agg(description || ' R$ ' || translate(to_char(original_amount, 'FM999,999,990.00'), ',.', '.,'), '  ×  ' ORDER BY original_amount) AS detalhe
    FROM public.financial_obligations
   WHERE type = 'payable' AND cancelled_at IS NULL AND category = 'Empréstimo'
     AND description ~ '\(\d+/\d+\)'
   GROUP BY date_trunc('month', due_date), substring(description from '\(\d+/\d+\)')
  HAVING count(*) > 1
),

-- 6. Caixinhas com meta e data: quanto falta e quanto por mês daqui até lá.
a6 AS (
  SELECT '6. caixinha abaixo do ritmo' AS achado,
         e.name AS item,
         'guardado R$ ' || translate(to_char(e.balance, 'FM999,999,990.00'), ',.', '.,') || ' de R$ ' || translate(to_char(e.target_amount, 'FM999,999,990.00'), ',.', '.,')
           || ' (' || round(100 * e.balance / nullif(e.target_amount, 0)) || '%) · '
           || coalesce('até ' || to_char(e.target_date, 'DD/MM/YYYY'), 'sem data-alvo')
           || CASE WHEN e.target_date > current_date THEN
                ' · precisa R$ ' || translate(to_char((e.target_amount - e.balance)
                  / greatest(1, (extract(year from age(e.target_date, current_date)) * 12
                                 + extract(month from age(e.target_date, current_date)))), 'FM999,999,990.00'), ',.', '.,') || '/mês'
              ELSE '' END AS detalhe
    FROM public.cash_envelopes e
   WHERE NOT e.is_archived AND e.target_amount > 0 AND e.balance < e.target_amount
),

-- 7a. Bancos no negativo.
a7a AS (
  SELECT '7. banco no negativo' AS achado,
         b.name AS item,
         'saldo R$ ' || translate(to_char(b.current_balance, 'FM999,999,990.00'), ',.', '.,') AS detalhe
    FROM public.bank_accounts b
   WHERE b.is_active AND b.current_balance < 0
),
-- 7b. PIX que entra x PIX que sai nos últimos 90 dias, por banco.
a7b AS (
  SELECT '7. PIX em 90 dias' AS achado,
         coalesce(b.name, 'sem banco') AS item,
         'entrou R$ ' || translate(to_char(sum(p.amount) FILTER (WHERE p.type = 'receivable'), 'FM999,999,990.00'), ',.', '.,')
           || ' · saiu R$ ' || translate(to_char(sum(p.amount) FILTER (WHERE p.type = 'payable'), 'FM999,999,990.00'), ',.', '.,')
           || ' · saída/entrada ' || coalesce(replace(round(sum(p.amount) FILTER (WHERE p.type = 'payable')
                / nullif(sum(p.amount) FILTER (WHERE p.type = 'receivable'), 0), 1)::text, '.', ','), '—')
           -- Sem os pagamentos do achado 1: mostra quanto da proporção é só erro de digitação.
           || ' · sem os do achado 1: ' || coalesce(replace(round(
                sum(p.amount) FILTER (WHERE p.type = 'payable' AND NOT (p.amount > p.original_amount * 1.5 AND p.amount - p.original_amount > 100))
                / nullif(sum(p.amount) FILTER (WHERE p.type = 'receivable'), 0), 1)::text, '.', ','), '—') AS detalhe
    FROM pag p
    LEFT JOIN public.bank_accounts b ON b.id = p.account_id
   WHERE p.method = 'PIX' AND p.payment_date >= current_date - 90
   GROUP BY b.name
)

SELECT achado, item, detalhe FROM a1
UNION ALL SELECT * FROM a2
UNION ALL SELECT * FROM a3
UNION ALL SELECT * FROM a4
UNION ALL SELECT * FROM a5a
UNION ALL SELECT * FROM a5b
UNION ALL SELECT * FROM a5c
UNION ALL SELECT * FROM a6
UNION ALL SELECT * FROM a7a
UNION ALL SELECT * FROM a7b
ORDER BY 1, 2;

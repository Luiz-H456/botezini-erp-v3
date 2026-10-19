-- =============================================================================
-- MIGRAÇÃO — Passo 1: diagnóstico da ORIGEM
-- Rode no SQL Editor do Supabase de PRODUÇÃO (o que tem os dados reais).
-- SOMENTE LEITURA — não altera nada.
-- Me mande as três saídas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Volume: quanto tem de cada coisa?
-- ---------------------------------------------------------------------------
SELECT 'clients'              AS tabela, count(*) AS linhas FROM public.clients
UNION ALL SELECT 'suppliers',            count(*) FROM public.suppliers
UNION ALL SELECT 'products',             count(*) FROM public.products
UNION ALL SELECT 'budgets',              count(*) FROM public.budgets
UNION ALL SELECT 'orders',               count(*) FROM public.orders
UNION ALL SELECT 'product_insumos',      count(*) FROM public.product_insumos
UNION ALL SELECT 'insumos',              count(*) FROM public.insumos
UNION ALL SELECT 'financial_obligations',count(*) FROM public.financial_obligations
UNION ALL SELECT 'obligation_payments',  count(*) FROM public.obligation_payments
ORDER BY tabela;

-- ---------------------------------------------------------------------------
-- B) Formato: as colunas batem com o ERP novo?
--    (se a origem for uma versão antiga do schema, isso mostra a diferença)
-- ---------------------------------------------------------------------------
SELECT table_name,
       string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('clients','budgets','orders')
GROUP BY table_name
ORDER BY table_name;

-- ---------------------------------------------------------------------------
-- C) Sanidade dos dados que vamos trazer
-- ---------------------------------------------------------------------------
SELECT 'orcamentos'                       AS metrica, count(*)::text AS valor FROM public.budgets
UNION ALL SELECT 'pedidos',                    count(*)::text FROM public.orders
UNION ALL SELECT 'pedidos SEM cliente valido', count(*)::text FROM public.orders o
          WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = o.client_id)
UNION ALL SELECT 'pedidos com itens vazios',   count(*)::text FROM public.orders
          WHERE items IS NULL OR jsonb_array_length(items) = 0
UNION ALL SELECT 'orcamentos com itens vazios',count(*)::text FROM public.budgets
          WHERE items IS NULL OR jsonb_array_length(items) = 0
UNION ALL SELECT 'numero de pedido repetido',  count(*)::text FROM (
            SELECT order_number FROM public.orders
            GROUP BY order_number HAVING count(*) > 1) x
UNION ALL SELECT 'serial de orcamento repetido', count(*)::text FROM (
            SELECT serial_number FROM public.budgets
            GROUP BY serial_number HAVING count(*) > 1) y
UNION ALL SELECT 'pedido mais antigo',        COALESCE(min(created_at)::date::text,'-') FROM public.orders
UNION ALL SELECT 'pedido mais recente',       COALESCE(max(created_at)::date::text,'-') FROM public.orders
UNION ALL SELECT 'faturamento total pedidos', COALESCE(sum(total_amount),0)::text FROM public.orders;

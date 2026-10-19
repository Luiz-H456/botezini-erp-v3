-- =============================================================================
-- PRÉ-VOO — consulta ÚNICA. Rode na ORIGEM antes do EXPORT_completo.
--
-- IMPORTANTE: o SQL Editor do Supabase mostra só o resultado da ÚLTIMA
-- consulta de um arquivo. Por isso tudo aqui é uma consulta só — senão você
-- veria apenas metade da resposta e acharia que a outra não rodou.
--
-- POR QUE ISTO EXISTE
-- A importação quebrou em `fk_suppliers_cost_center` porque cost_centers tinha
-- ficado de fora da lista. Aqui o próprio catálogo do Postgres diz quais
-- tabelas são referenciadas — em vez de eu listar de cabeça.
-- =============================================================================

WITH exportadas(tabela) AS (
  VALUES ('cost_centers'), ('clients'), ('suppliers'), ('insumos'),
         ('products'), ('product_insumos'), ('budgets'), ('orders')
),
saidas AS (
  SELECT tc.table_name AS origem, kcu.column_name AS coluna, ccu.table_name AS alvo
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name IN (SELECT tabela FROM exportadas)
),
volume AS (
  SELECT 'cost_centers' t, count(*) n FROM public.cost_centers
  UNION ALL SELECT 'clients',         count(*) FROM public.clients
  UNION ALL SELECT 'suppliers',       count(*) FROM public.suppliers
  UNION ALL SELECT 'insumos',         count(*) FROM public.insumos
  UNION ALL SELECT 'products',        count(*) FROM public.products
  UNION ALL SELECT 'product_insumos', count(*) FROM public.product_insumos
  UNION ALL SELECT 'budgets',         count(*) FROM public.budgets
  UNION ALL SELECT 'orders',          count(*) FROM public.orders
)
SELECT '1. DEPENDENCIAS' AS secao,
       s.origem || '.' || s.coluna || ' -> ' || s.alvo AS item,
       CASE WHEN s.alvo IN (SELECT tabela FROM exportadas)
            THEN 'ok'
            ELSE 'FALTA NO EXPORT — vai quebrar' END AS situacao
FROM saidas s

UNION ALL
SELECT '2. VOLUME', v.t, v.n::text FROM volume v

UNION ALL
SELECT '3. VEREDITO',
       CASE WHEN EXISTS (SELECT 1 FROM saidas s
                         WHERE s.alvo NOT IN (SELECT tabela FROM exportadas))
            THEN 'GRAFO ABERTO — falta tabela, NAO exporte ainda'
            ELSE 'grafo fechado — pode rodar o EXPORT_completo' END,
       (SELECT sum(n)::text || ' linhas no total' FROM volume)

ORDER BY 1, 3 DESC, 2;

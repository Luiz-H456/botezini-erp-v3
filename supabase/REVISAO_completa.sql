-- =============================================================================
-- RELATÓRIO DE REVISÃO — consulta ÚNICA, somente leitura
-- Rode na ORIGEM (produção). Copie o resultado inteiro e me mande.
--
-- Devolve ~150 linhas em 3 colunas (secao | item | valor) cobrindo volume,
-- tipos, chaves estrangeiras, integridade, números do negócio, catálogo de
-- produtos e insumos, e as anomalias que já detectei nos seus dados.
--
-- É com isto que eu decido o que precisa de tratamento antes de entrar no
-- banco novo. Não substitui o export — ele é gerado à parte (EXPORT_completo).
-- =============================================================================

WITH
volume AS (
  SELECT '1. VOLUME' s, t.tabela i, t.n::text v FROM (
    SELECT 'clients' tabela, count(*) n FROM public.clients
    UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
    UNION ALL SELECT 'products', count(*) FROM public.products
    UNION ALL SELECT 'insumos', count(*) FROM public.insumos
    UNION ALL SELECT 'product_insumos (fichas)', count(*) FROM public.product_insumos
    UNION ALL SELECT 'budgets', count(*) FROM public.budgets
    UNION ALL SELECT 'orders', count(*) FROM public.orders
  ) t
),
tipos AS (
  SELECT '2. TIPO DAS COLUNAS' s,
         (table_name || '.' || column_name) i,
         data_type v
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ((table_name='orders'   AND column_name IN ('id','client_id','budget_id'))
      OR (table_name='budgets'  AND column_name IN ('id','client_id'))
      OR (table_name='clients'  AND column_name = 'id')
      OR (table_name='invoices' AND column_name IN ('id','order_id'))
      OR (table_name='insumos'  AND column_name IN ('id','supplier_id'))
      OR (table_name='products' AND column_name IN ('id','default_fabric_insumo_id'))
      OR (table_name='product_insumos' AND column_name IN ('product_id','insumo_id')))
),
fks AS (
  SELECT '3. CHAVES ESTRANGEIRAS' s,
         (tc.table_name || '.' || kcu.column_name || ' -> ' || ccu.table_name) i,
         rc.delete_rule v
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
    AND tc.table_name IN ('orders','budgets','invoices','product_insumos','insumos','products')
),
integridade AS (
  SELECT '4. INTEGRIDADE (tudo deve dar 0)' s, x.i, x.v::text FROM (
    SELECT 'pedido sem cliente valido' i, count(*) v FROM public.orders o
      WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id::text = o.client_id::text)
    UNION ALL SELECT 'pedido com itens vazios', count(*) FROM public.orders
      WHERE items IS NULL OR jsonb_array_length(items) = 0
    UNION ALL SELECT 'orcamento com itens vazios', count(*) FROM public.budgets
      WHERE items IS NULL OR jsonb_array_length(items) = 0
    UNION ALL SELECT 'numero de pedido repetido', count(*) FROM (
      SELECT order_number FROM public.orders GROUP BY 1 HAVING count(*)>1) a
    UNION ALL SELECT 'serial de orcamento repetido', count(*) FROM (
      SELECT serial_number FROM public.budgets GROUP BY 1 HAVING count(*)>1) b
    UNION ALL SELECT 'cliente com nome repetido', count(*) FROM (
      SELECT upper(trim(company_name)) FROM public.clients GROUP BY 1 HAVING count(*)>1) c
    UNION ALL SELECT 'insumo com nome repetido', count(*) FROM (
      SELECT upper(trim(name)) FROM public.insumos GROUP BY 1 HAVING count(*)>1) d
    UNION ALL SELECT 'produto com nome repetido', count(*) FROM (
      SELECT upper(trim(name)) FROM public.products GROUP BY 1 HAVING count(*)>1) e
    UNION ALL SELECT 'pedido apontando orcamento inexistente', count(*) FROM public.orders o
      WHERE o.budget_serial_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.budgets b WHERE b.serial_number = o.budget_serial_number)
  ) x
),
negocio AS (
  SELECT '5. NUMEROS DO NEGOCIO' s, y.i, y.v FROM (
    SELECT 'faturamento total dos pedidos' i, to_char(COALESCE(sum(total_amount),0),'999G999G999D99') v FROM public.orders
    UNION ALL SELECT 'ja recebido (amount_paid)', to_char(COALESCE(sum(amount_paid),0),'999G999G999D99') FROM public.orders
    UNION ALL SELECT 'saldo a receber (aberto)', to_char(COALESCE(sum(total_amount - COALESCE(amount_paid,0)),0),'999G999G999D99')
      FROM public.orders WHERE status IN ('Pendente','Em Produção')
    UNION ALL SELECT 'pedido mais antigo', COALESCE(min(created_at)::date::text,'-') FROM public.orders
    UNION ALL SELECT 'pedido mais recente', COALESCE(max(created_at)::date::text,'-') FROM public.orders
    UNION ALL SELECT 'pedidos ja vencidos e em aberto', count(*)::text FROM public.orders
      WHERE status IN ('Pendente','Em Produção') AND deadline < CURRENT_DATE
  ) y
),
status_ped AS (
  SELECT '6. PEDIDOS POR STATUS' s,
         status i,
         (count(*)::text || ' pedidos | R$ ' || to_char(sum(total_amount),'999G999D99')) v
  FROM public.orders GROUP BY status
),
produtos AS (
  SELECT '7. PRODUTOS' s,
         p.name i,
         (CASE WHEN EXISTS (SELECT 1 FROM public.product_insumos pi
                            WHERE pi.product_id::text = p.id::text)
               THEN 'com ficha' ELSE 'SEM FICHA' END
          || ' | usado em ' ||
          (SELECT count(*) FROM public.orders o
           WHERE o.items::text LIKE '%' || p.id::text || '%')::text || ' pedidos') v
  FROM public.products p
),
insumos_lst AS (
  SELECT '8. INSUMOS' s,
         i2.name i,
         (COALESCE(i2.category,'sem categoria') || ' | ' || i2.unit
          || ' | R$ ' || to_char(i2.average_unit_cost,'9999D99')) v
  FROM public.insumos i2
),
tecidos AS (
  SELECT '9. TECIDOS USADOS NOS PEDIDOS' s,
         COALESCE(NULLIF(trim(it->>'fabric_name'),''),'(vazio)') i,
         count(*)::text || ' linhas de item' v
  FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
  GROUP BY 1,2
),
clientes AS (
  SELECT '10. CLIENTES' s,
         c.company_name i,
         (SELECT count(*) FROM public.orders o
          WHERE o.client_id::text = c.id::text)::text || ' pedidos' v
  FROM public.clients c
),
anomalias AS (
  SELECT '11. ANOMALIAS' s, z.i, z.v::text FROM (
    SELECT 'itens sem fabric_insumo_id' i, count(*) v
      FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
      WHERE COALESCE(it->>'fabric_insumo_id','') = ''
    UNION ALL SELECT 'itens sem product_id', count(*)
      FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
      WHERE COALESCE(it->>'product_id','') = ''
    UNION ALL SELECT 'itens sem tamanho', count(*)
      FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
      WHERE COALESCE(it->>'size','') IN ('','-')
    UNION ALL SELECT 'pedidos sem estagio de producao', count(*)
      FROM public.orders WHERE production_stage IS NULL
    UNION ALL SELECT 'pedidos em aberto SEM nenhuma entrada', count(*)
      FROM public.orders WHERE status IN ('Pendente','Em Produção')
        AND COALESCE(amount_paid,0) = 0
    UNION ALL SELECT 'pedidos com amount_paid > total', count(*)
      FROM public.orders WHERE COALESCE(amount_paid,0) > total_amount
  ) z
)
SELECT s AS secao, i AS item, v AS valor FROM (
  SELECT * FROM volume       UNION ALL
  SELECT * FROM tipos        UNION ALL
  SELECT * FROM fks          UNION ALL
  SELECT * FROM integridade  UNION ALL
  SELECT * FROM negocio      UNION ALL
  SELECT * FROM status_ped   UNION ALL
  SELECT * FROM produtos     UNION ALL
  SELECT * FROM insumos_lst  UNION ALL
  SELECT * FROM tecidos      UNION ALL
  SELECT * FROM clientes     UNION ALL
  SELECT * FROM anomalias
) tudo
ORDER BY secao, item;

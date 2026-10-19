-- =============================================================================
-- Descobrir os tipos reais das colunas de ligação
--
-- POR QUE ISTO EXISTE
-- O erro "operator does not exist: uuid = text" mostrou que o schema derivou:
-- alguma coluna que deveria ser uuid está como text. Blindei todas as
-- comparações com ::text (funciona nos dois casos), mas vale saber onde a
-- deriva está — ela também afeta as chaves estrangeiras.
--
-- Somente leitura. Rode nos DOIS projetos e compare.
-- =============================================================================

SELECT
  table_name  AS tabela,
  column_name AS coluna,
  data_type   AS tipo,
  CASE WHEN data_type = 'uuid' THEN 'ok' ELSE '⚠ DEVERIA SER uuid' END AS situacao
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'orders'                AND column_name IN ('id','client_id','budget_id')) OR
    (table_name = 'budgets'               AND column_name IN ('id','client_id')) OR
    (table_name = 'clients'               AND column_name = 'id') OR
    (table_name = 'invoices'              AND column_name IN ('id','order_id','client_id')) OR
    (table_name = 'financial_obligations' AND column_name IN ('id','order_id','client_id','supplier_id')) OR
    (table_name = 'obligation_payments'   AND column_name IN ('id','obligation_id','account_id')) OR
    (table_name = 'product_insumos'       AND column_name IN ('id','product_id','insumo_id')) OR
    (table_name = 'insumos'               AND column_name IN ('id','supplier_id')) OR
    (table_name = 'products'              AND column_name IN ('id','default_fabric_insumo_id'))
  )
ORDER BY
  CASE WHEN data_type = 'uuid' THEN 1 ELSE 0 END,  -- problemas primeiro
  table_name, column_name;


-- ---------------------------------------------------------------------------
-- Chaves estrangeiras que realmente existem hoje.
-- Se uma coluna virou text, a FK provavelmente foi derrubada junto — e aí
-- nada impede dado órfão de entrar.
-- ---------------------------------------------------------------------------
SELECT
  tc.table_name      AS tabela,
  kcu.column_name    AS coluna,
  ccu.table_name     AS aponta_para,
  rc.delete_rule     AS ao_apagar
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('orders','budgets','invoices','financial_obligations',
                        'obligation_payments','product_insumos','insumos','products')
ORDER BY tc.table_name, kcu.column_name;

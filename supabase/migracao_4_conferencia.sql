-- =============================================================================
-- MIGRAÇÃO — Passo 4: conferência final
-- Rode no DESTINO. Somente leitura. Compare com o passo 1 rodado na origem.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Os números batem com a origem?
-- ---------------------------------------------------------------------------
SELECT 'clients'   AS tabela, count(*) AS linhas FROM public.clients
UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
UNION ALL SELECT 'products',  count(*) FROM public.products
UNION ALL SELECT 'budgets',   count(*) FROM public.budgets
UNION ALL SELECT 'orders',    count(*) FROM public.orders
ORDER BY tabela;

-- Faturamento tem que dar exatamente o mesmo valor do passo 1.
SELECT COALESCE(sum(total_amount), 0) AS faturamento_total_pedidos FROM public.orders;


-- ---------------------------------------------------------------------------
-- B) Ficou algum pedido órfão? (tem que voltar VAZIO)
-- ---------------------------------------------------------------------------
SELECT o.order_number, o.client_id AS cliente_inexistente
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id::text = o.client_id::text);


-- ---------------------------------------------------------------------------
-- C) Pedido apontando para orçamento que não veio
-- ---------------------------------------------------------------------------
SELECT o.order_number, o.budget_serial_number AS orcamento_ausente
FROM public.orders o
WHERE o.budget_serial_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.budgets b WHERE b.serial_number = o.budget_serial_number)
ORDER BY o.order_number;


-- ---------------------------------------------------------------------------
-- D) PRODUTOS DUPLICADOS — os do catálogo semeado x os que vieram da produção.
--    Aqui você decide qual manter. Enquanto houver duplicata, o seletor de
--    produto do orçamento mostra os dois.
-- ---------------------------------------------------------------------------
SELECT upper(trim(name)) AS nome_normalizado,
       count(*)          AS quantas_vezes,
       string_agg(id::text || ' (' || COALESCE(category,'sem categoria') || ')', '  |  ') AS ids
FROM public.products
GROUP BY upper(trim(name))
HAVING count(*) > 1
ORDER BY 1;


-- ---------------------------------------------------------------------------
-- E) Produtos usados em pedido que NÃO têm ficha técnica.
--    Enquanto estiverem aqui, a Lista de Compras do PCP ignora esses pedidos
--    e o CMV não calcula. É a lista de trabalho da reconciliação.
-- ---------------------------------------------------------------------------
SELECT DISTINCT
  it->>'product_name' AS produto,
  it->>'product_id'   AS product_id
FROM public.orders o,
     LATERAL jsonb_array_elements(o.items) AS it
WHERE o.status IN ('Pendente', 'Em Produção')
  -- item sem product_id (string vazia existe nos dados reais) entra na lista
  AND COALESCE(it->>'product_id', '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.product_insumos pi
    WHERE pi.product_id::text = it->>'product_id')
ORDER BY 1;


-- ---------------------------------------------------------------------------
-- F) O que o PCP vai enxergar depois da migração
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE status IN ('Pendente','Em Produção')) AS pedidos_ativos_no_kanban,
  count(*) FILTER (WHERE status IN ('Concluído','Entregue'))   AS historico,
  count(*) FILTER (WHERE status IN ('Pendente','Em Produção')
                     AND deadline < CURRENT_DATE)              AS ja_atrasados,
  COALESCE(sum(
    (SELECT sum((i->>'quantity')::numeric)
     FROM jsonb_array_elements(items) i)
  ) FILTER (WHERE status IN ('Pendente','Em Produção')), 0)    AS pecas_na_fila
FROM public.orders;

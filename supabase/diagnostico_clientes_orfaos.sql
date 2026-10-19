-- =============================================================================
-- DIAGNÓSTICO: "Cliente Desconhecido" em pedidos e orçamentos
--
-- SOMENTE LEITURA. Não altera nada.
--
-- O app mostra "Cliente Desconhecido" quando não encontra, na lista de clientes,
-- o client_id gravado no pedido. Só há três causas possíveis, e esta consulta
-- distingue as três:
--
--   A) A lista de clientes chega VAZIA no app (RLS bloqueando a leitura).
--   B) Os clientes existem, mas os pedidos apontam para ids que não existem
--      mais (órfãos — típico de deduplicação ou limpeza mal terminada).
--   C) Os clientes existem e os ids batem — aí o problema é no app, não no banco.
--
-- Rode no SQL Editor do banco que o app está usando AGORA.
-- =============================================================================

WITH contagem AS (
  SELECT
    (SELECT count(*) FROM public.clients)  AS clientes,
    (SELECT count(*) FROM public.orders)   AS pedidos,
    (SELECT count(*) FROM public.budgets)  AS orcamentos
),
orfaos_pedido AS (
  SELECT o.id, o.order_number, o.client_id
  FROM public.orders o
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE c.id IS NULL
),
orfaos_orcamento AS (
  SELECT b.id, b.serial_number, b.client_id
  FROM public.budgets b
  LEFT JOIN public.clients c ON c.id = b.client_id
  WHERE c.id IS NULL
),
nulos AS (
  SELECT
    (SELECT count(*) FROM public.orders  WHERE client_id IS NULL) AS pedidos_sem_client_id,
    (SELECT count(*) FROM public.budgets WHERE client_id IS NULL) AS orcamentos_sem_client_id
)
SELECT '1. VOLUME'   AS secao, 'clientes na tabela'                  AS item, clientes::text   AS valor FROM contagem
UNION ALL SELECT '1. VOLUME', 'pedidos',                              pedidos::text            FROM contagem
UNION ALL SELECT '1. VOLUME', 'orcamentos',                           orcamentos::text         FROM contagem

UNION ALL SELECT '2. ORFAOS', 'pedidos apontando para cliente inexistente',
                 (SELECT count(*)::text FROM orfaos_pedido)
UNION ALL SELECT '2. ORFAOS', 'orcamentos apontando para cliente inexistente',
                 (SELECT count(*)::text FROM orfaos_orcamento)
UNION ALL SELECT '2. ORFAOS', 'pedidos com client_id NULO',           pedidos_sem_client_id::text    FROM nulos
UNION ALL SELECT '2. ORFAOS', 'orcamentos com client_id NULO',        orcamentos_sem_client_id::text FROM nulos

-- Amostra: se houver órfãos, estes são os ids que o app não encontra.
UNION ALL SELECT '3. AMOSTRA DE ORFAOS',
                 'pedido #' || COALESCE(order_number, '?'),
                 COALESCE(client_id::text, 'NULO')
          FROM (SELECT * FROM orfaos_pedido LIMIT 5) x

-- RLS: o que ESTA sessão enxerga. Se o app enxerga menos que isto, o problema é
-- a política de leitura para o papel do usuário logado, não os dados.
UNION ALL SELECT '4. RLS', 'RLS ligada em clients?',
                 (SELECT CASE WHEN relrowsecurity THEN 'sim' ELSE 'nao' END
                  FROM pg_class WHERE oid = 'public.clients'::regclass)
UNION ALL SELECT '4. RLS', 'politicas em clients',
                 (SELECT COALESCE(string_agg(policyname, ' | '), 'NENHUMA')
                  FROM pg_policies WHERE schemaname='public' AND tablename='clients')

UNION ALL SELECT '5. VEREDITO',
  CASE
    WHEN (SELECT clientes FROM contagem) = 0
      THEN 'A tabela clients esta VAZIA neste banco'
    WHEN (SELECT count(*) FROM orfaos_pedido) > 0
      THEN 'ORFAOS: ha pedidos apontando para clientes que nao existem'
    ELSE 'Os vinculos estao integros no banco — investigar leitura/RLS no app'
  END,
  (SELECT count(*)::text || ' pedido(s) orfao(s)' FROM orfaos_pedido)

ORDER BY 1, 2;

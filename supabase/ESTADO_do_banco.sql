-- =============================================================================
-- ESTADO DO BANCO — o que já foi aplicado e o que falta
--
-- 100% LEITURA: uma única consulta. Não cria, não apaga, não altera nada —
-- nem tabela temporária. Pode rodar em qualquer banco, inclusive produção.
--
-- Em vez de tentar lembrar quais SQL foram rodados, pergunta ao próprio banco.
--
-- Detalhe técnico: as contagens usam query_to_xml, que recebe a consulta como
-- TEXTO. Isso é o que permite proteger com CASE uma tabela que talvez não
-- exista — o Postgres resolve nomes ao PLANEJAR, então uma referência estática
-- quebraria a consulta inteira mesmo dentro de um ramo nunca avaliado.
-- =============================================================================

WITH
-- Conta linhas de uma tabela, devolvendo NULL se ela não existir.
conta AS (
  SELECT t.nome,
         CASE WHEN to_regclass('public.' || t.nome) IS NULL THEN NULL
              ELSE (xpath('/row/c/text()',
                     query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.nome),
                                  false, true, '')))[1]::text::bigint
         END AS n
  FROM (VALUES ('clients'),('orders'),('budgets'),('products'),('product_insumos'),
               ('insumos'),('bank_accounts'),('production_sectors'),('fabric_colors'),
               ('financial_obligations'),('obligation_payments')) AS t(nome)
),
-- Contagens com filtro. Mesma proteção: a consulta é texto.
filtrada AS (
  SELECT f.rotulo,
         CASE WHEN f.depende IS NOT NULL AND to_regclass('public.' || f.depende) IS NULL THEN NULL
              ELSE (xpath('/row/c/text()', query_to_xml(f.sql, false, true, '')))[1]::text::bigint
         END AS n
  FROM (VALUES
    ('insumos_custo_zero', 'insumos',
     'SELECT count(*) AS c FROM public.insumos WHERE COALESCE(average_unit_cost,0) = 0'),
    ('contas_ativas', 'bank_accounts',
     'SELECT count(*) AS c FROM public.bank_accounts WHERE is_active'),
    ('setores_com_capacidade', 'production_sectors',
     'SELECT count(*) AS c FROM public.production_sectors WHERE weekly_capacity_pieces > 0'),
    ('pedidos_sem_cliente', 'orders',
     'SELECT count(*) AS c FROM public.orders o LEFT JOIN public.clients k ON k.id = o.client_id
      WHERE o.client_id IS NOT NULL AND k.id IS NULL'),
    ('orcamentos_sem_cliente', 'budgets',
     'SELECT count(*) AS c FROM public.budgets b LEFT JOIN public.clients k ON k.id = b.client_id
      WHERE b.client_id IS NOT NULL AND k.id IS NULL'),
    ('produtos_sem_ficha', 'product_insumos',
     'SELECT count(*) AS c FROM public.products p
      WHERE NOT EXISTS (SELECT 1 FROM public.product_insumos pi WHERE pi.product_id = p.id)')
  ) AS f(rotulo, depende, sql)
),
sem_rls AS (
  SELECT count(*) AS n FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r'
    AND NOT c.relrowsecurity AND c.relname NOT LIKE '\_bkp\_%'
),
backups AS (
  SELECT count(*) AS n FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_bkp\_%'
)

SELECT grupo, item, situacao, detalhe FROM (

-- ── A. ESTRUTURA ────────────────────────────────────────────────────────────
SELECT 'A. ESTRUTURA' AS grupo, t.nome AS item,
       CASE WHEN to_regclass('public.' || t.nome) IS NOT NULL THEN 'ok' ELSE 'FALTA' END AS situacao,
       '' AS detalhe
FROM (VALUES ('clients'),('suppliers'),('products'),('product_insumos'),('insumos'),
             ('budgets'),('orders'),('financial_obligations'),('obligation_payments'),
             ('bank_accounts'),('cost_centers'),('production_sectors'),
             ('production_logs'),('fabric_colors')) AS t(nome)

-- ── B. COLUNAS POR FASE ─────────────────────────────────────────────────────
UNION ALL
SELECT 'B. COLUNAS', c.tabela || '.' || c.coluna,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name=c.tabela AND column_name=c.coluna
       ) THEN 'ok' ELSE 'FALTA' END,
       c.script
FROM (VALUES
  ('obligation_payments','affects_balance','finance_phase10'),
  ('budgets','reference_photos','phase11_fotos_referencia'),
  ('orders','reference_photos','phase11_fotos_referencia'),
  ('insumos','fabric_family','seed_cartela_cores'),
  ('insumos','color_tier','seed_cartela_cores'),
  ('insumos','rendimento','seed_insumos_homologados'),
  ('production_sectors','weekly_capacity_pieces','pcp_phase1_capacity_sectors')
) AS c(tabela, coluna, script)

-- ── C. FUNÇÕES (RPC) ────────────────────────────────────────────────────────
UNION ALL
SELECT 'C. FUNCOES', f.nome,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
         WHERE ns.nspname='public' AND p.proname = f.nome
       ) THEN 'ok' ELSE 'FALTA' END,
       f.script
FROM (VALUES
  ('register_informational_payment','finance_phase10'),
  ('set_bank_balance','finance_phase10'),
  ('get_cash_position','finance_phase10 — corrige crash sem conta bancaria'),
  ('get_liquidity_kpis','finance_phase10 — corrige CCE verde falso'),
  ('recalculate_all_bank_balances','finance_phase10 — ignora informativo'),
  ('reverse_payment','fix_reverse_payment_function'),
  ('pay_obligation','base'),
  ('assert_finance_access','security_hardening'),
  ('is_admin_or_manager','security_hardening')
) AS f(nome, script)

-- ── D. DADOS ────────────────────────────────────────────────────────────────
UNION ALL
SELECT 'D. DADOS', nome, COALESCE(n::text, 'tabela nao existe'),
       CASE
         WHEN nome = 'product_insumos' AND n = 0
           THEN 'sem ficha tecnica: lista de compras e consumo previsto ficam vazios'
         WHEN nome = 'fabric_colors' AND n IS NOT NULL AND n <> 91
           THEN 'esperado 91 na cartela do site'
         ELSE ''
       END
FROM conta

UNION ALL
SELECT 'D. DADOS', f.rotulo, COALESCE(f.n::text, '-'),
       CASE
         WHEN f.rotulo = 'insumos_custo_zero'     AND f.n > 0 THEN 'total da lista de compras sai subestimado'
         WHEN f.rotulo = 'contas_ativas'          AND f.n = 0 THEN 'sem conta ativa o Financeiro nao registra baixa'
         WHEN f.rotulo = 'setores_com_capacidade' AND f.n = 0 THEN 'ocupacao do Dashboard cai no padrao 350/semana'
         WHEN f.rotulo = 'produtos_sem_ficha'     AND f.n > 0 THEN 'ficam de fora do calculo de compras'
         ELSE ''
       END
FROM filtrada f
WHERE f.rotulo IN ('insumos_custo_zero','contas_ativas','setores_com_capacidade','produtos_sem_ficha')

-- ── E. INTEGRIDADE ──────────────────────────────────────────────────────────
UNION ALL
SELECT 'E. INTEGRIDADE', f.rotulo, COALESCE(f.n::text, '-'),
       CASE WHEN f.n > 0 THEN 'aparecem como "Cliente Desconhecido"' ELSE '' END
FROM filtrada f
WHERE f.rotulo IN ('pedidos_sem_cliente','orcamentos_sem_cliente')

UNION ALL
SELECT 'E. INTEGRIDADE', 'tabelas SEM RLS', n::text,
       CASE WHEN n > 0 THEN 'rode security_hardening_single_tenant.sql' ELSE '' END
FROM sem_rls

UNION ALL
SELECT 'E. INTEGRIDADE', 'tabelas _bkp_* remanescentes', n::text,
       CASE WHEN n > 0 THEN 'so apague depois de conferir tudo' ELSE '' END
FROM backups

) AS relatorio
-- O que FALTA sobe para o topo de cada grupo — é o que exige ação.
ORDER BY grupo, CASE WHEN situacao = 'FALTA' THEN 0 ELSE 1 END, item;

-- =============================================================================
-- MIGRAÇÃO — Passo 0: LIMPAR dados de teste do DESTINO
-- Rode no Supabase de DESTINO (o projeto novo), ANTES de importar a produção.
--
-- ⚠️  ESTE ARQUIVO APAGA DADOS. Leia antes de rodar.
--
-- O QUE APAGA (o que você pediu):
--   clientes · orçamentos · pedidos · contas a pagar/receber e seus pagamentos
--   + o que depende deles: notas fiscais, apontamentos de produção
--
-- O QUE **NÃO** APAGA (de propósito — é o trabalho já feito):
--   produtos e fichas técnicas · insumos (tecidos e aviamentos) · cartela de
--   cores · setores de produção · fornecedores · contas bancárias · centros de
--   custo · categorias · perfis e empresa
--
-- SEGURANÇA
--   O passo 2 copia tudo para tabelas _bkp_* antes de apagar. Se algo der
--   errado, dá para restaurar. Só apague as _bkp_* quando a migração terminar.
--
-- COMO USAR
--   1. Rode SÓ o passo 1 e confira os números.
--   2. Rode o passo 2 (backup).
--   3. No passo 3, troque `v_confirmo := false` para `true` e rode.
--   4. Rode o passo 4 para conferir.
-- =============================================================================


-- =============================================================================
-- PASSO 1 — PREVIEW (somente leitura). Isto é o que será apagado.
-- =============================================================================
SELECT 'obligation_payments' AS tabela, count(*) AS sera_apagado FROM public.obligation_payments
UNION ALL SELECT 'financial_obligations', count(*) FROM public.financial_obligations
UNION ALL SELECT 'invoices',              count(*) FROM public.invoices
UNION ALL SELECT 'orders',                count(*) FROM public.orders
UNION ALL SELECT 'budgets',               count(*) FROM public.budgets
UNION ALL SELECT 'clients',               count(*) FROM public.clients
ORDER BY 1;

-- E isto é o que será PRESERVADO. Confira que os seeds continuam de pé.
SELECT 'products'           AS preservado, count(*) AS linhas FROM public.products
UNION ALL SELECT 'product_insumos (fichas)', count(*) FROM public.product_insumos
UNION ALL SELECT 'insumos',                  count(*) FROM public.insumos
UNION ALL SELECT 'fabric_colors',            count(*) FROM public.fabric_colors
UNION ALL SELECT 'production_sectors',       count(*) FROM public.production_sectors
UNION ALL SELECT 'suppliers',                count(*) FROM public.suppliers
UNION ALL SELECT 'bank_accounts',            count(*) FROM public.bank_accounts
ORDER BY 1;


-- =============================================================================
-- PASSO 2 — BACKUP. Rode antes de apagar. Barato e reversível.
-- =============================================================================
DROP TABLE IF EXISTS public._bkp_obligation_payments;
DROP TABLE IF EXISTS public._bkp_financial_obligations;
DROP TABLE IF EXISTS public._bkp_invoices;
DROP TABLE IF EXISTS public._bkp_orders;
DROP TABLE IF EXISTS public._bkp_budgets;
DROP TABLE IF EXISTS public._bkp_clients;

CREATE TABLE public._bkp_obligation_payments   AS SELECT * FROM public.obligation_payments;
CREATE TABLE public._bkp_financial_obligations AS SELECT * FROM public.financial_obligations;
CREATE TABLE public._bkp_invoices              AS SELECT * FROM public.invoices;
CREATE TABLE public._bkp_orders                AS SELECT * FROM public.orders;
CREATE TABLE public._bkp_budgets               AS SELECT * FROM public.budgets;
CREATE TABLE public._bkp_clients               AS SELECT * FROM public.clients;

SELECT 'backup criado' AS status,
       (SELECT count(*) FROM public._bkp_clients)  AS clientes,
       (SELECT count(*) FROM public._bkp_budgets)  AS orcamentos,
       (SELECT count(*) FROM public._bkp_orders)   AS pedidos,
       (SELECT count(*) FROM public._bkp_financial_obligations) AS contas;


-- =============================================================================
-- PASSO 3 — APAGAR.  Troque false por true na linha v_confirmo.
--
-- A ordem abaixo respeita as chaves estrangeiras. Não reordene:
--   invoices e orders.client_id são ON DELETE RESTRICT — se tentar apagar
--   cliente antes, o banco recusa e nada acontece.
-- =============================================================================
DO $$
DECLARE
  v_confirmo boolean := false;   -- <<<<<< TROQUE PARA true PARA APAGAR

  v_pag int; v_obr int; v_nf int; v_ped int; v_orc int; v_cli int;
BEGIN
  IF NOT v_confirmo THEN
    RAISE NOTICE '---------------------------------------------------------';
    RAISE NOTICE 'NADA FOI APAGADO. v_confirmo esta false.';
    RAISE NOTICE 'Rode o PASSO 1 e o PASSO 2 antes. Depois troque para true.';
    RAISE NOTICE '---------------------------------------------------------';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='_bkp_clients') THEN
    RAISE EXCEPTION 'Backup nao encontrado. Rode o PASSO 2 antes de apagar.';
  END IF;

  -- Log imutável de pagamentos: vai primeiro (CASCADE cobriria, mas quero contar)
  DELETE FROM public.obligation_payments;    GET DIAGNOSTICS v_pag = ROW_COUNT;

  -- Contas a pagar/receber
  DELETE FROM public.financial_obligations;  GET DIAGNOSTICS v_obr = ROW_COUNT;

  -- Notas fiscais: apontam para orders (CASCADE) e clients (RESTRICT)
  DELETE FROM public.invoices;               GET DIAGNOSTICS v_nf  = ROW_COUNT;

  -- Apontamentos de produção do PCP, se a tabela já existir
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='production_logs') THEN
    DELETE FROM public.production_logs;
  END IF;

  DELETE FROM public.orders;                 GET DIAGNOSTICS v_ped = ROW_COUNT;
  DELETE FROM public.budgets;                GET DIAGNOSTICS v_orc = ROW_COUNT;
  DELETE FROM public.clients;                GET DIAGNOSTICS v_cli = ROW_COUNT;

  RAISE NOTICE 'APAGADO -> pagamentos:% contas:% notas:% pedidos:% orcamentos:% clientes:%',
               v_pag, v_obr, v_nf, v_ped, v_orc, v_cli;
END;
$$;


-- =============================================================================
-- PASSO 4 — CONFERÊNCIA. Os quatro primeiros têm que dar 0;
-- os seeds têm que continuar intactos.
-- =============================================================================
SELECT 'clients'   AS tabela, count(*) AS deve_ser_zero FROM public.clients
UNION ALL SELECT 'budgets',   count(*) FROM public.budgets
UNION ALL SELECT 'orders',    count(*) FROM public.orders
UNION ALL SELECT 'financial_obligations', count(*) FROM public.financial_obligations
UNION ALL SELECT 'obligation_payments',   count(*) FROM public.obligation_payments
ORDER BY 1;

SELECT 'products'                AS seed, count(*) AS deve_continuar FROM public.products
UNION ALL SELECT 'product_insumos', count(*) FROM public.product_insumos
UNION ALL SELECT 'insumos',         count(*) FROM public.insumos
UNION ALL SELECT 'fabric_colors',   count(*) FROM public.fabric_colors
ORDER BY 1;

-- Saldo das contas bancárias fica como estava — os pagamentos de teste que
-- mexeram no saldo não são revertidos automaticamente. Se o saldo estiver
-- sujo, corrija na mão depois:
--   SELECT id, name, current_balance FROM bank_accounts;
--   UPDATE bank_accounts SET current_balance = <valor real> WHERE id = '<id>';


-- =============================================================================
-- PASSO 5 — Só quando a migração inteira estiver validada, descarte o backup:
--
--   DROP TABLE public._bkp_obligation_payments;
--   DROP TABLE public._bkp_financial_obligations;
--   DROP TABLE public._bkp_invoices;
--   DROP TABLE public._bkp_orders;
--   DROP TABLE public._bkp_budgets;
--   DROP TABLE public._bkp_clients;
--
-- Para RESTAURAR (se precisar voltar atrás), a ordem é a inversa:
--   INSERT INTO public.clients  SELECT * FROM public._bkp_clients;
--   INSERT INTO public.budgets  SELECT * FROM public._bkp_budgets;
--   INSERT INTO public.orders   SELECT * FROM public._bkp_orders;
--   INSERT INTO public.invoices SELECT * FROM public._bkp_invoices;
--   INSERT INTO public.financial_obligations SELECT * FROM public._bkp_financial_obligations;
--   INSERT INTO public.obligation_payments   SELECT * FROM public._bkp_obligation_payments;
-- =============================================================================

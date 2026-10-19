-- =============================================================================
-- Fix: papel `factory` no PCP Kanban
--
-- A aba Fábrica antiga usava o enum fixo de estágios e não lia tabela nenhuma
-- de setores. O Kanban do PCP (que a absorveu) monta as colunas a partir de
-- production_sectors — e a única policy dessa tabela é admin/manager.
-- Resultado: o operador de fábrica logava e via "Nenhum setor configurado".
--
-- Este patch dá ao factory SELECT (somente leitura) nos setores. Ele já tinha:
--   · SELECT em orders/clients/products/insumos/product_insumos (hardening)
--   · UPDATE em orders (mover cartão)
--   · INSERT em production_logs via RPC log_production (fase 1C)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'production_sectors'
      AND policyname = 'single_tenant_factory_select'
  ) THEN
    CREATE POLICY single_tenant_factory_select
      ON public.production_sectors
      FOR SELECT TO authenticated
      USING (public.is_factory());
  END IF;
END;
$$;

-- Verificação (deve listar 2 policies: admin_manager_all e factory_select):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'production_sectors';

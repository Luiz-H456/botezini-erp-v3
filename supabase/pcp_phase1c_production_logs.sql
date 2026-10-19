-- =============================================================================
-- PCP — Fase 1C: Controle Parcial de Produção (baixas por tamanho/peça/operação)
-- Run no SQL Editor do Supabase. Requer pcp_phase1_capacity_sectors.sql.
--
-- production_logs é IMUTÁVEL (padrão do Blueprint: não edita saldo, registra
-- lançamento). O "saldo restante" é DERIVADO (total do pedido − Σ qty_done).
-- Acessível ao papel `factory` (é dado operacional de chão de fábrica).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.production_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid,
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sector_id      uuid REFERENCES public.production_sectors(id) ON DELETE SET NULL,
  size           text,
  operation      text,
  qty_done       numeric(12,2) NOT NULL DEFAULT 0,
  qty_expedited  numeric(12,2) NOT NULL DEFAULT 0,
  notes          text,
  logged_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_logs_qty_nonneg CHECK (qty_done >= 0 AND qty_expedited >= 0)
);

CREATE INDEX IF NOT EXISTS idx_prod_logs_order ON public.production_logs(order_id);

-- ---------------------------------------------------------------------------
-- RLS: admin/manager E factory (chão de fábrica lança e lê)
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='production_logs' AND policyname='prod_logs_all_roles') THEN
    CREATE POLICY prod_logs_all_roles ON public.production_logs
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager() OR public.is_factory())
      WITH CHECK (public.is_admin_or_manager() OR public.is_factory());
  END IF;
END;
$$;

GRANT SELECT, INSERT ON public.production_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC atômica de baixa parcial. Valida e insere o log (imutável).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_production(
  p_order_id      uuid,
  p_qty_done      numeric,
  p_sector_id     uuid   DEFAULT NULL,
  p_size          text   DEFAULT NULL,
  p_operation     text   DEFAULT NULL,
  p_qty_expedited numeric DEFAULT 0,
  p_notes         text   DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN
    RAISE EXCEPTION 'Sem permissão para lançar produção';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;
  IF COALESCE(p_qty_done, 0) < 0 OR COALESCE(p_qty_expedited, 0) < 0 THEN
    RAISE EXCEPTION 'Quantidades não podem ser negativas';
  END IF;
  IF COALESCE(p_qty_done, 0) = 0 AND COALESCE(p_qty_expedited, 0) = 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade produzida ou expedida';
  END IF;

  INSERT INTO public.production_logs
    (id, user_id, order_id, sector_id, size, operation, qty_done, qty_expedited, notes)
  VALUES
    (v_id, auth.uid(), p_order_id, p_sector_id, p_size, p_operation,
     COALESCE(p_qty_done, 0), COALESCE(p_qty_expedited, 0), p_notes);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_production(uuid, numeric, uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_production(uuid, numeric, uuid, text, text, numeric, text) TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT log_production('<order_id>', 20);        -- baixa de 20 peças
--   SELECT order_id, SUM(qty_done) FROM production_logs GROUP BY order_id;
-- =============================================================================

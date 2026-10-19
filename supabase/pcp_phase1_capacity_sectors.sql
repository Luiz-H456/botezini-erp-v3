-- =============================================================================
-- PCP — Fase 1B: Setores configuráveis + Capacidade
-- Run no SQL Editor do Supabase.
--
-- Estágios de produção deixam de ser um enum fixo e passam a ser uma TABELA
-- configurável (decisão D1). Os 6 estágios atuais entram como seed, com os
-- MESMOS nomes que orders.production_stage já usa (compatibilidade total).
-- Capacidade é SEMANAL em peças, por setor (decisão D4).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Setores (estágios) configuráveis
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_sectors (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid,
  name                   text NOT NULL,
  sort_order             int NOT NULL DEFAULT 0,
  weekly_capacity_pieces numeric(12,2) NOT NULL DEFAULT 350,
  color                  text NOT NULL DEFAULT '#8b5cf6',
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_sectors_capacity_nonneg CHECK (weekly_capacity_pieces >= 0)
);

-- ---------------------------------------------------------------------------
-- Configuração global de capacidade (linha única)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capacity_config (
  id               int PRIMARY KEY DEFAULT 1,
  user_id          uuid,
  working_days     int NOT NULL DEFAULT 5,           -- dias úteis por semana
  holidays         date[] NOT NULL DEFAULT '{}',      -- feriados
  overtime_enabled boolean NOT NULL DEFAULT false,
  notes            text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_config_singleton CHECK (id = 1)
);

-- ---------------------------------------------------------------------------
-- RLS + grants (padrão single-tenant admin/manager — Blueprint §6)
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_config    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='production_sectors' AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.production_sectors
      FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='capacity_config' AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.capacity_config
      FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_sectors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capacity_config    TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: os 6 estágios atuais (nomes idênticos ao enum ProductionStage) e a
-- linha única de configuração. Idempotente — só semeia se estiver vazio.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.production_sectors) THEN
    INSERT INTO public.production_sectors (name, sort_order, color) VALUES
      ('Aguardando Material', 0, '#71717a'),
      ('Corte',               1, '#3b82f6'),
      ('Personalização',      2, '#ec4899'),
      ('Costura',             3, '#8b5cf6'),
      ('Finalização',         4, '#10b981'),
      ('Transporte',          5, '#f59e0b');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.capacity_config WHERE id = 1) THEN
    INSERT INTO public.capacity_config (id) VALUES (1);
  END IF;
END;
$$;

-- =============================================================================
-- Verificação:
--   SELECT name, sort_order, weekly_capacity_pieces FROM production_sectors ORDER BY sort_order;
--   SELECT * FROM capacity_config;
-- =============================================================================

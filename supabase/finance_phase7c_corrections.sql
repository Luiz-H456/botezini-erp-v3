-- =============================================================================
-- Finance — Front 3 (correções): presets de filtro persistidos no banco
-- Run no SQL Editor do Supabase.
--
-- Move os "presets" de filtro financeiro do localStorage para o perfil da
-- empresa (single-tenant), para não se perderem ao trocar de dispositivo.
-- =============================================================================

ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS finance_presets jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Verificação:
--   SELECT finance_presets FROM public.company_profile;

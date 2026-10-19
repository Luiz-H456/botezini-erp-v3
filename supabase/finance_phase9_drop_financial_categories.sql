-- =============================================================================
-- Front 4 — Categorias: aposentar o sistema legado `financial_categories`
-- Run no SQL Editor DEPOIS de subir o código que parou de usá-la.
--
-- Contexto: diagnóstico confirmou que financial_categories só tinha linhas de
-- teste/lixo ("categoria", "ddddddddddddd", "sd") — ZERO dados reais. A fonte
-- oficial de categorias financeiras é global_categories(domain='finance').
-- O app já não lê/escreve mais essa tabela (código removido no Front 4).
--
-- SEGURANÇA: faça um backup rápido antes (o SELECT abaixo) e confirme que o
-- resultado não tem nada que você queira preservar.
-- =============================================================================

-- 1) Backup/inspeção final (confirme que é só lixo antes de derrubar)
SELECT id, name, type, code FROM public.financial_categories ORDER BY name;

-- 2) Drop seguro (só descomente e rode após conferir o SELECT acima)
-- DROP TABLE IF EXISTS public.financial_categories CASCADE;

-- =============================================================================
-- Observação: o restante da "tríade" de categorias segue o plano
-- (docs/plano-unificacao-categorias.md):
--   * `category` textual  → mantido como fallback histórico (não remover).
--   * cache local `botezini_cat_*` → cache de UI, não é fonte de verdade.
--   * global_categories   → fonte oficial (finance/inventory/crm).
-- A migração de texto→global e a separação de domínios exigem as decisões de
-- negócio (rode categories_diagnostic_readonly.sql e decida) — fora deste drop.
-- =============================================================================

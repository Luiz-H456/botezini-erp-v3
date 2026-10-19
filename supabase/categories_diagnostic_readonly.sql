-- =============================================================================
-- Front 4 — Categorias: DIAGNÓSTICO SOMENTE LEITURA (não altera nada)
-- Rode no SQL Editor do Supabase ANTES de qualquer consolidação.
-- Base: docs/plano-unificacao-categorias.md (seções 16.x).
--
-- Objetivo: levantar o estado real das categorias (3 sistemas: texto legado,
-- financial_categories, global_categories) para decidir a migração com dados,
-- não por nome. NENHUM UPDATE/DELETE aqui.
-- =============================================================================

-- 1) Categorias textuais distintas por tabela
SELECT 'financial_obligations' AS source, category, count(*) AS total
FROM public.financial_obligations WHERE nullif(trim(category), '') IS NOT NULL GROUP BY category
UNION ALL SELECT 'clients', category, count(*) FROM public.clients WHERE nullif(trim(category), '') IS NOT NULL GROUP BY category
UNION ALL SELECT 'suppliers', category, count(*) FROM public.suppliers WHERE nullif(trim(category), '') IS NOT NULL GROUP BY category
UNION ALL SELECT 'products', category, count(*) FROM public.products WHERE nullif(trim(category), '') IS NOT NULL GROUP BY category
UNION ALL SELECT 'insumos', category, count(*) FROM public.insumos WHERE nullif(trim(category), '') IS NOT NULL GROUP BY category
ORDER BY source, total DESC;

-- 2) Registros com vs sem categoria global (mede adoção do global_category_id)
SELECT 'financial_obligations' AS source, count(*) AS total,
       count(*) FILTER (WHERE global_category_id IS NOT NULL) AS with_global,
       count(*) FILTER (WHERE nullif(trim(category), '') IS NOT NULL) AS with_legacy_text
FROM public.financial_obligations
UNION ALL SELECT 'clients', count(*), count(*) FILTER (WHERE global_category_id IS NOT NULL), count(*) FILTER (WHERE nullif(trim(category), '') IS NOT NULL) FROM public.clients
UNION ALL SELECT 'suppliers', count(*), count(*) FILTER (WHERE global_category_id IS NOT NULL), count(*) FILTER (WHERE nullif(trim(category), '') IS NOT NULL) FROM public.suppliers
UNION ALL SELECT 'products', count(*), count(*) FILTER (WHERE global_category_id IS NOT NULL), count(*) FILTER (WHERE nullif(trim(category), '') IS NOT NULL) FROM public.products
UNION ALL SELECT 'insumos', count(*), count(*) FILTER (WHERE global_category_id IS NOT NULL), count(*) FILTER (WHERE nullif(trim(category), '') IS NOT NULL) FROM public.insumos;

-- 3) global_categories duplicadas por nome normalizado (candidatas a merge)
SELECT domain, lower(trim(name)) AS normalized_name, count(*) AS total,
       array_agg(id ORDER BY created_at) AS ids
FROM public.global_categories GROUP BY domain, lower(trim(name)) HAVING count(*) > 1
ORDER BY domain, normalized_name;

-- 4) financial_categories existentes (sistema legado #2 — decidir migrar/aposentar)
SELECT id, name, type, parent_id, code, is_deductible FROM public.financial_categories ORDER BY type, name;

-- 5) Conflitos: texto legado ≠ nome da categoria global (mesma linha)
SELECT 'financial_obligations' AS source, fo.id, fo.category AS legacy, gc.name AS global_name
FROM public.financial_obligations fo JOIN public.global_categories gc ON gc.id = fo.global_category_id
WHERE nullif(trim(fo.category), '') IS NOT NULL AND lower(trim(fo.category)) <> lower(trim(gc.name));

-- =============================================================================
-- PRÓXIMO PASSO (fora deste arquivo, exige decisão de negócio):
--   Com estes números, decidir: manter domínios finance/inventory/crm?
--   Migrar financial_categories → global_categories(finance)? Mapear texto→global?
--   Só então gerar os UPDATEs aprovados (nunca por nome automático).
-- =============================================================================

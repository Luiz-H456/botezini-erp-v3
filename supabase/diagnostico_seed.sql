-- =============================================================================
-- Diagnóstico — o seed entrou mesmo?
-- Somente leitura. Rode no SQL Editor e me mande o resultado.
-- =============================================================================

SELECT 'fabric_colors existe'          AS check,
       to_char(count(*), '999')        AS valor,
       '91'                            AS esperado
FROM public.fabric_colors

UNION ALL SELECT 'insumos com fabric_family', to_char(count(*), '999'), '15'
FROM public.insumos WHERE fabric_family IS NOT NULL

UNION ALL SELECT 'insumos categoria Tecidos', to_char(count(*), '999'), '18'
FROM public.insumos WHERE lower(category) IN ('tecidos','tecido')

UNION ALL SELECT 'insumos Aviamentos', to_char(count(*), '999'), '10'
FROM public.insumos WHERE category = 'Aviamentos'

UNION ALL SELECT 'produtos do catalogo', to_char(count(*), '999'), '24'
FROM public.products WHERE category IN ('Operacional','Alimentar','Saúde','Corporativa','Essencial')

UNION ALL SELECT 'linhas de ficha tecnica', to_char(count(*), '999'), '79'
FROM public.product_insumos

UNION ALL SELECT 'fornecedores do seed', to_char(count(*), '999'), '6'
FROM public.suppliers
WHERE company_name IN ('Cedro Têxtil','Guimatex','MN Tecidos','Dicatex',
                       'Aviamentos São Paulo','Casa Criativa Aviamentos')

-- Este é o que importa: cor sem insumo correspondente = dropdown de cor não abre.
UNION ALL SELECT 'faixas de cor SEM insumo (tem que dar 0)', to_char(count(*), '999'), '0'
FROM (SELECT DISTINCT fc.fabric_family, fc.color_tier
      FROM public.fabric_colors fc
      WHERE NOT EXISTS (SELECT 1 FROM public.insumos i
                        WHERE i.fabric_family = fc.fabric_family
                          AND i.color_tier   = fc.color_tier)) x;

-- Se "insumos com fabric_family" vier 0, os UPDATE não casaram por nome.
-- Rode isto para ver os nomes que realmente existem:
--   SELECT name, category, fabric_family, color_tier, average_unit_cost
--   FROM insumos WHERE lower(category) IN ('tecidos','tecido') ORDER BY name;

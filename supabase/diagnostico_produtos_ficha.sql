-- =============================================================================
-- Produtos duplicados e ficha técnica ausente
--
-- 100% LEITURA: uma consulta só. Não cria, não altera, não apaga nada.
--
-- PERGUNTA QUE ISTO RESPONDE
-- São 56 produtos, mas só 24 têm ficha técnica (79 linhas de BOM). Se os
-- PEDIDOS apontam para os produtos SEM ficha, a lista de compras e o consumo
-- previsto da ficha de corte ficam vazios justamente onde importa.
--
-- Suspeita: a migração trouxe os produtos da produção e o seed criou outros
-- 24 com nomes parecidos — dois cadastros para a mesma peça.
-- =============================================================================

WITH
-- Nome normalizado: sem acento, sem caixa, sem espaço duplicado. É a chave que
-- revela "Camisa Polo" e "camisa polo" como o mesmo produto.
norm AS (
  SELECT p.id, p.name,
         regexp_replace(
           lower(translate(p.name,
             'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
             'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuucc')),
           '\s+', ' ', 'g') AS chave,
         EXISTS (SELECT 1 FROM public.product_insumos pi WHERE pi.product_id = p.id) AS tem_ficha,
         (SELECT count(*) FROM public.product_insumos pi WHERE pi.product_id = p.id) AS linhas_bom
  FROM public.products p
),
-- Quantos itens de pedido usam cada produto
uso AS (
  SELECT (it->>'product_id') AS product_id, count(*) AS itens
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS it
  WHERE it->>'product_id' IS NOT NULL AND it->>'product_id' <> ''
  GROUP BY 1
),
enriquecido AS (
  SELECT n.*, COALESCE(u.itens, 0) AS itens_em_pedidos
  FROM norm n
  LEFT JOIN uso u ON u.product_id = n.id::text
),
-- Grupos com mais de um cadastro para o mesmo nome normalizado
duplicados AS (
  SELECT chave, count(*) AS cadastros,
         sum(CASE WHEN tem_ficha THEN 1 ELSE 0 END) AS com_ficha,
         sum(itens_em_pedidos) AS itens
  FROM enriquecido GROUP BY chave HAVING count(*) > 1
)

SELECT secao, item, valor, observacao FROM (

  SELECT '1. RESUMO' AS secao, 'produtos cadastrados' AS item,
         count(*)::text AS valor, '' AS observacao FROM enriquecido
  UNION ALL SELECT '1. RESUMO', 'com ficha tecnica',
         count(*)::text, '' FROM enriquecido WHERE tem_ficha
  UNION ALL SELECT '1. RESUMO', 'SEM ficha tecnica',
         count(*)::text, 'ignorados na lista de compras' FROM enriquecido WHERE NOT tem_ficha
  UNION ALL SELECT '1. RESUMO', 'nomes duplicados (grupos)',
         count(*)::text, 'mesmo produto cadastrado 2x ou mais' FROM duplicados

  -- O ponto crítico: produtos que os PEDIDOS usam e que não têm ficha.
  UNION ALL
  SELECT '2. CRITICO — usado em pedido e SEM ficha', name,
         itens_em_pedidos::text || ' item(ns)',
         'consumo de tecido nao aparece na ficha de corte'
  FROM enriquecido WHERE NOT tem_ficha AND itens_em_pedidos > 0

  -- Duplicados onde UM tem ficha e o outro não: candidato a fusão.
  UNION ALL
  SELECT '3. DUPLICADOS', d.chave,
         d.cadastros::text || ' cadastros · ' || d.com_ficha::text || ' com ficha',
         CASE WHEN d.com_ficha > 0 AND d.com_ficha < d.cadastros
              THEN 'FUNDIR: um tem ficha, o outro nao'
              WHEN d.com_ficha = 0 THEN 'nenhum tem ficha'
              ELSE 'ambos tem ficha — conferir qual e o certo' END
  FROM duplicados d

  -- Sem ficha e sem uso: provavelmente lixo do catalogo, baixa prioridade.
  UNION ALL
  SELECT '4. SEM FICHA E SEM USO', 'total',
         count(*)::text, 'nao afeta pedido nenhum hoje'
  FROM enriquecido WHERE NOT tem_ficha AND itens_em_pedidos = 0

) AS r
ORDER BY secao, valor DESC, item;

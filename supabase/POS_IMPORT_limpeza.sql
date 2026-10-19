-- =============================================================================
-- PÓS-IMPORTAÇÃO — limpeza dos problemas encontrados na revisão
-- Rode no DESTINO, DEPOIS de colar o EXPORT_completo.
--
-- Baseado no relatório de revisão da sua produção. Trata quatro coisas:
--   1. clientes duplicados  — 20 registros que deveriam ser 9
--   2. insumo lixo          — existe um insumo cujo nome é uma vírgula
--   3. tecido pendurado     — HELANCA PREMIUM em 12 itens, insumo já apagado
--   4. relatório do que sobra para você decidir na mão
--
-- Cada bloco tem confirmação própria. Nada roda sozinho.
-- =============================================================================


-- =============================================================================
-- BLOCO 1 — CLIENTES DUPLICADOS
--
-- São 9 grupos, 20 registros -> viram 9. Em 3 grupos os PEDIDOS ESTÃO
-- ESPALHADOS entre os registros, então não dá para simplesmente apagar:
--   GRANHA LIGAS  3 registros com 1+2+0 pedidos
--   MUZENZA       2 registros com 2+1 pedidos
--   SILOMINAS     2 registros com 1+1 pedidos
--
-- Critério: mantém o registro MAIS ANTIGO de cada grupo (normalizando
-- maiúsculas e acentos), repõe pedidos/orçamentos/contas nele, apaga o resto.
-- =============================================================================

-- Normalização de acento sem depender da extensão `unaccent`, que nem sempre
-- está habilitada no Supabase. translate() resolve os casos do português —
-- é o que faz MANGÁ e Mangá caírem na mesma chave.
CREATE OR REPLACE FUNCTION public._norm_nome(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(trim(translate(COALESCE(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')))
$$;

-- 1.1 — PREVIEW. Rode sozinho e confira quem sobrevive.
WITH norm AS (
  SELECT id, company_name, created_at,
         public._norm_nome(company_name) AS chave
  FROM public.clients
),
grupos AS (
  SELECT chave, min(created_at) AS mais_antigo, count(*) AS quantos
  FROM norm GROUP BY chave HAVING count(*) > 1
)
SELECT
  n.chave                                        AS grupo,
  n.company_name                                 AS nome_cadastrado,
  n.created_at::date                             AS criado_em,
  CASE WHEN n.created_at = g.mais_antigo
       THEN 'MANTER' ELSE 'fundir neste' END     AS acao,
  (SELECT count(*) FROM public.orders o  WHERE o.client_id::text = n.id::text) AS pedidos,
  (SELECT count(*) FROM public.budgets b WHERE b.client_id::text = n.id::text) AS orcamentos
FROM norm n
JOIN grupos g ON g.chave = n.chave
ORDER BY n.chave, n.created_at;


-- 1.2 — EXECUTAR. Troque false por true.
DO $$
DECLARE
  v_confirmo boolean := false;   -- <<<<<< TROQUE PARA true

  r record;
  v_ped int := 0; v_orc int := 0; v_con int := 0; v_del int := 0; v_n int;
BEGIN
  IF NOT v_confirmo THEN
    RAISE NOTICE 'NADA FOI ALTERADO. Rode o 1.1, confira, e troque para true.';
    RETURN;
  END IF;

  DROP TABLE IF EXISTS public._bkp_clients_dup;
  CREATE TABLE public._bkp_clients_dup AS SELECT * FROM public.clients;

  FOR r IN
    WITH norm AS (
      SELECT id, created_at, public._norm_nome(company_name) AS chave
      FROM public.clients
    ),
    manter AS (
      SELECT DISTINCT ON (chave) chave, id AS id_manter
      FROM norm ORDER BY chave, created_at
    )
    SELECT n.id AS id_apagar, m.id_manter
    FROM norm n JOIN manter m ON m.chave = n.chave
    WHERE n.id <> m.id_manter
  LOOP
    UPDATE public.orders  SET client_id = r.id_manter
      WHERE client_id::text = r.id_apagar::text;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_ped := v_ped + v_n;

    UPDATE public.budgets SET client_id = r.id_manter
      WHERE client_id::text = r.id_apagar::text;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_orc := v_orc + v_n;

    UPDATE public.financial_obligations SET client_id = r.id_manter
      WHERE client_id::text = r.id_apagar::text;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_con := v_con + v_n;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='invoices') THEN
      UPDATE public.invoices SET client_id = r.id_manter
        WHERE client_id::text = r.id_apagar::text;
    END IF;

    DELETE FROM public.clients WHERE id = r.id_apagar;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_del := v_del + v_n;
  END LOOP;

  RAISE NOTICE 'FUSAO -> pedidos repontados:% orcamentos:% contas:% clientes apagados:%',
               v_ped, v_orc, v_con, v_del;
END;
$$;


-- =============================================================================
-- BLOCO 2 — INSUMO LIXO E TECIDO PENDURADO
-- =============================================================================

-- 2.1 — PREVIEW
SELECT 'insumo com nome invalido' AS problema, id::text AS detalhe, name AS valor
FROM public.insumos WHERE trim(name) IN (',', '.', '-', '')
UNION ALL
SELECT 'tecido citado no item sem insumo cadastrado',
       pendurado.fid,
       pendurado.fnome || ' (' || pendurado.linhas || ' itens)'
FROM (
  SELECT it->>'fabric_insumo_id' AS fid,
         COALESCE(NULLIF(trim(it->>'fabric_name'),''),'(vazio)') AS fnome,
         count(*)::text AS linhas
  FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
  WHERE COALESCE(it->>'fabric_insumo_id','') <> ''
    AND NOT EXISTS (SELECT 1 FROM public.insumos i
                    WHERE i.id::text = it->>'fabric_insumo_id')
  GROUP BY 1,2
) pendurado;

-- 2.2 — Recriar o insumo que sumiu, para os 12 itens de HELANCA PREMIUM
--       voltarem a resolver. O id é o mesmo que os pedidos já citam.
INSERT INTO public.insumos (id, name, unit, average_unit_cost, category, rendimento, notes)
VALUES ('c7860bd0-1817-4638-b3d3-696b598f432d', 'HELANCA PREMIUM', 'm', 0, 'Tecidos', 1,
        'Recriado na migracao: 12 itens de pedido citavam este id, mas o insumo tinha sido apagado na origem. PREENCHER CUSTO.')
ON CONFLICT (id) DO NOTHING;

-- 2.3 — Apagar o insumo cujo nome é uma vírgula (só se ninguém usar)
DELETE FROM public.insumos i
WHERE trim(i.name) = ','
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o, LATERAL jsonb_array_elements(o.items) it
    WHERE it->>'fabric_insumo_id' = i.id::text);


-- =============================================================================
-- BLOCO 3 — O QUE SOBRA PARA DECISÃO MANUAL (somente leitura)
-- =============================================================================

-- 3.1 Produtos duplicados entre o catálogo semeado e os da produção
SELECT 'produto duplicado' AS tipo,
       upper(trim(name))   AS nome,
       count(*)::text      AS quantos,
       string_agg(COALESCE(category,'sem categoria'), ' | ') AS categorias
FROM public.products
GROUP BY upper(trim(name)) HAVING count(*) > 1
ORDER BY 2;

-- 3.2 Insumos duplicados (os 15 semeados por faixa x os 17 da produção)
SELECT 'insumo possivelmente duplicado' AS tipo,
       i.name, i.unit, i.average_unit_cost::text AS custo,
       COALESCE(i.fabric_family,'(sem familia)') AS familia
FROM public.insumos i
WHERE lower(i.category) IN ('tecidos','tecido')
ORDER BY COALESCE(i.fabric_family, i.name), i.name;

-- 3.3 Produtos usados em pedido aberto que não têm ficha técnica.
--     A produção não tinha NENHUMA ficha (product_insumos = 0 na origem),
--     então todos os produtos importados caem aqui. Enquanto estiverem nesta
--     lista, a Lista de Compras do PCP ignora o pedido e o CMV não calcula.
SELECT 'produto sem ficha usado em pedido aberto' AS tipo,
       p.name,
       count(DISTINCT o.id)::text AS pedidos_afetados
FROM public.products p
JOIN public.orders o
  ON o.items::text LIKE '%' || p.id::text || '%'
 AND o.status IN ('Pendente','Em Produção')
WHERE NOT EXISTS (SELECT 1 FROM public.product_insumos pi
                  WHERE pi.product_id::text = p.id::text)
GROUP BY p.name
ORDER BY 3 DESC, 2;

-- =============================================================================
-- EXPORT COMPLETO — devolve UMA CÉLULA com o script inteiro
-- Rode na ORIGEM (produção). Somente leitura.
--
-- Antes devolvia uma linha por comando, e o editor do Supabase empacotava
-- aquilo como JSON — daí a dificuldade de copiar. Agora tudo vem concatenado
-- num único texto: clique na célula, copie, cole no destino, execute.
--
-- O script sai envolvido em BEGIN/COMMIT: ou entra tudo, ou não entra nada.
-- Nada de importação pela metade.
--
-- A ordem é a das chaves estrangeiras (ordenação topológica):
--   centros de custo → clientes → fornecedores → insumos → produtos
--   → fichas → orçamentos → pedidos
--
-- ANTES DE COLAR, o destino precisa estar:
--   1. limpo            -> migracao_0_limpar_dados_teste.sql
--   2. com schema certo -> fix_alinhar_schema_dev.sql
--   3. com os tecidos   -> fix_seed_tecidos.sql
-- =============================================================================

SELECT
  '-- Migração Botezini · gerado em ' || now()::timestamp(0)::text || E'\n'
  || '-- ' || count(*)::text || E' comandos\n\nBEGIN;\n\n'
  || string_agg(comando, E'\n' ORDER BY ordem, quando)
  || E'\n\nCOMMIT;\n'
  AS script_completo
FROM (

  -- CENTROS DE CUSTO: suppliers.default_cost_center_id aponta para cá.
  -- Sem isto, a importação de fornecedores morre com violação de chave
  -- estrangeira (fk_suppliers_cost_center).
  SELECT 0 AS ordem, t.created_at AS quando,
         format('INSERT INTO public.cost_centers SELECT * FROM json_populate_record(NULL::public.cost_centers, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text) AS comando
  FROM public.cost_centers t

  UNION ALL
  SELECT 1, t.created_at,
         format('INSERT INTO public.clients SELECT * FROM json_populate_record(NULL::public.clients, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.clients t

  UNION ALL
  SELECT 2, t.created_at,
         format('INSERT INTO public.suppliers SELECT * FROM json_populate_record(NULL::public.suppliers, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.suppliers t

  UNION ALL
  -- insumos ANTES de produtos: products.default_fabric_insumo_id aponta aqui
  SELECT 3, t.created_at,
         format('INSERT INTO public.insumos SELECT * FROM json_populate_record(NULL::public.insumos, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.insumos t

  UNION ALL
  SELECT 4, t.created_at,
         format('INSERT INTO public.products SELECT * FROM json_populate_record(NULL::public.products, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.products t

  UNION ALL
  SELECT 5, t.created_at,
         format('INSERT INTO public.product_insumos SELECT * FROM json_populate_record(NULL::public.product_insumos, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.product_insumos t

  UNION ALL
  SELECT 6, t.created_at,
         format('INSERT INTO public.budgets SELECT * FROM json_populate_record(NULL::public.budgets, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.budgets t

  UNION ALL
  SELECT 7, t.created_at,
         format('INSERT INTO public.orders SELECT * FROM json_populate_record(NULL::public.orders, %L) ON CONFLICT (id) DO NOTHING;',
                row_to_json(t)::text)
  FROM public.orders t

) tudo;


-- =============================================================================
-- SE A CÉLULA FICAR GRANDE DEMAIS PARA O EDITOR (são ~400 KB), rode em duas
-- partes trocando o filtro abaixo e colando uma de cada vez:
--
--   ... FROM ( ...mesmo bloco... ) tudo WHERE ordem <= 5;   -- cadastros
--   ... FROM ( ...mesmo bloco... ) tudo WHERE ordem >= 6;   -- orçamentos+pedidos
--
-- Mas aí tire o BEGIN/COMMIT da segunda parte para não abrir transação aninhada,
-- ou simplesmente rode as duas em sequência sem fechar a aba.
-- =============================================================================

-- =============================================================================
-- MIGRAÇÃO — Passo 2: EXPORTAR da origem
-- Rode no SQL Editor do Supabase de PRODUÇÃO. SOMENTE LEITURA.
--
-- COMO FUNCIONA
-- Cada consulta devolve uma coluna de texto onde CADA LINHA já é um comando
-- INSERT pronto. Você seleciona a coluna inteira, copia, e cola no destino.
--
-- Por que assim e não CSV: os itens do orçamento/pedido são JSON aninhado —
-- em CSV o escape de aspas corrompe tudo. Aqui o Postgres monta o literal
-- com json_populate_record, que:
--   · leva TODAS as colunas sem eu precisar listar uma a uma;
--   · tolera diferença de schema (coluna a mais é ignorada, a menos vira NULL);
--   · preserva o id original, então as ligações entre as tabelas continuam.
--
-- IMPORTANTE: rode e cole no destino NESTA ORDEM. Cliente antes de pedido,
-- senão a chave estrangeira recusa.
--
--   2.1 clientes → 2.2 fornecedores → 2.3 produtos → 2.3b insumos
--   → 2.3c fichas → 2.4 orçamentos → 2.5 pedidos
--
-- São SETE consultas. Rodar só a de pedidos deixa tudo quebrado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 — CLIENTES  (cole o resultado no destino primeiro)
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.clients SELECT * FROM json_populate_record(NULL::public.clients, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.clients t
ORDER BY t.created_at;


-- ---------------------------------------------------------------------------
-- 2.2 — FORNECEDORES
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.suppliers SELECT * FROM json_populate_record(NULL::public.suppliers, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.suppliers t
ORDER BY t.created_at;


-- ---------------------------------------------------------------------------
-- 2.3 — PRODUTOS
-- Necessário: os itens do pedido guardam product_id. Sem o produto no destino,
-- a ficha técnica não resolve e a Lista de Compras do PCP ignora o pedido.
-- Obs.: o destino já tem os 24 produtos do catálogo que semeamos. Estes vão
-- conviver com aqueles — o passo 4 mostra as duplicatas por nome para você
-- reconciliar depois. Não juntei automaticamente: fundir identidade de
-- produto errado bagunçaria a ficha técnica.
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.products SELECT * FROM json_populate_record(NULL::public.products, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.products t
ORDER BY t.created_at;


-- ---------------------------------------------------------------------------
-- 2.3b — INSUMOS  ⚠️ ACRESCENTADO DEPOIS DE VER SEUS DADOS REAIS
-- Os itens do pedido guardam fabric_insumo_id apontando para os insumos DESTE
-- banco. Sem trazê-los, todo pedido histórico fica com o tecido quebrado e a
-- Lista de Compras mostra "insumo desconhecido".
-- Eles vão CONVIVER com os 25 insumos semeados no destino (tecidos por faixa
-- de cor + aviamentos) — o passo 4 lista as duplicatas para reconciliar.
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.insumos SELECT * FROM json_populate_record(NULL::public.insumos, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.insumos t
ORDER BY t.created_at;


-- ---------------------------------------------------------------------------
-- 2.3c — FICHAS TÉCNICAS existentes (product_insumos)
-- Se este banco já tinha ficha montada, ela vem junto. Se voltar vazio, tudo
-- bem: as 24 fichas semeadas no destino continuam valendo.
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.product_insumos SELECT * FROM json_populate_record(NULL::public.product_insumos, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.product_insumos t;


-- ---------------------------------------------------------------------------
-- 2.4 — ORÇAMENTOS
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.budgets SELECT * FROM json_populate_record(NULL::public.budgets, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.budgets t
ORDER BY t.created_at;


-- ---------------------------------------------------------------------------
-- 2.5 — PEDIDOS
-- ---------------------------------------------------------------------------
SELECT format(
  'INSERT INTO public.orders SELECT * FROM json_populate_record(NULL::public.orders, %L) ON CONFLICT (id) DO NOTHING;',
  row_to_json(t)::text
) AS comando
FROM public.orders t
ORDER BY t.created_at;

-- =============================================================================
-- NÃO exportamos financial_obligations nem obligation_payments — decisão sua:
-- o financeiro antigo não vem. As contas a receber são geradas no passo 3,
-- só para pedido ainda em aberto.
-- =============================================================================

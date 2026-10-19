\set ON_ERROR_STOP 1
BEGIN;
-- usuários de teste (gestor e fábrica)
INSERT INTO auth.users(id, email) VALUES ('00000000-0000-0000-0000-0000000000a1','gestor@teste.local'),('00000000-0000-0000-0000-0000000000f1','fabrica@teste.local') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(id, role) VALUES ('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000f1','factory')
  ON CONFLICT (id) DO UPDATE SET role = excluded.role;
INSERT INTO public.clients(id, company_name) VALUES ('00000000-0000-0000-0000-0000000000c1','Cliente Teste');
INSERT INTO public.orders(id, order_number, client_id, deadline) VALUES
  ('00000000-0000-0000-0000-0000000000d1','PED-T1','00000000-0000-0000-0000-0000000000c1', current_date+10),
  ('00000000-0000-0000-0000-0000000000d2','PED-T2','00000000-0000-0000-0000-0000000000c1', current_date+10),
  ('00000000-0000-0000-0000-0000000000d3','PED-T3','00000000-0000-0000-0000-0000000000c1', current_date+10),
  ('00000000-0000-0000-0000-0000000000d4','PED-T4','00000000-0000-0000-0000-0000000000c1', current_date+10),
  ('00000000-0000-0000-0000-0000000000d5','PED-T5','00000000-0000-0000-0000-0000000000c1', current_date+10);
INSERT INTO public.insumos(id, name, unit, current_stock, average_unit_cost) VALUES
  ('00000000-0000-0000-0000-00000000000a','Malha T','kg',0,0);
-- como gestor (as duas formas de auth.uid: claim.sub antiga e claims nova)
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);

-- 1) compra dividida: 6 kg para T1, 4 kg para T2, 2 kg para o estoque, a R$ 50
SELECT public.lancar_compra('{"fornecedor_nome":"Fornecedor T"}',
  '[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":6,"custo_unitario":50,"pedido_id":"00000000-0000-0000-0000-0000000000d1"},
    {"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":4,"custo_unitario":50,"pedido_id":"00000000-0000-0000-0000-0000000000d2"},
    {"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":2,"custo_unitario":50}]');
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 2 THEN RAISE EXCEPTION '1: estoque devia ser 2'; END IF; END $$;

-- 2) usar do estoque 1 kg no T1; vinculado de T1 = 7
SELECT public.usar_do_estoque('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000a',1);
DO $$ BEGIN IF (SELECT quantidade FROM vinculado_ao_pedido('00000000-0000-0000-0000-0000000000d1')) <> 7 THEN RAISE EXCEPTION '2: vinculado T1 devia ser 7'; END IF;
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 1 THEN RAISE EXCEPTION '2: estoque devia ser 1'; END IF; END $$;

-- 3) usar do estoque sem saldo é recusado, com a mensagem de falta de saldo
DO $$ BEGIN
  BEGIN PERFORM public.usar_do_estoque('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-00000000000a',5);
        RAISE EXCEPTION '3: devia recusar';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%essa quantidade%' THEN RAISE EXCEPTION '3: mensagem errada: %', SQLERRM; END IF; END;
END $$;

-- 4) fábrica apura a sobra do T1 (T1 entregue): pede 2,5 kg; entra 2,5 (≤ 7) ao custo médio do vinculado (R$ 50)
UPDATE public.orders SET status = 'Entregue' WHERE id = '00000000-0000-0000-0000-0000000000d1';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000f1',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}',true);
DO $$ DECLARE r jsonb; BEGIN
  r := public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d1','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":2.5}]');
  IF (r->>'ja_feita')::bool OR (r->>'movimentos')::int <> 1 THEN RAISE EXCEPTION '4: resposta %', r; END IF;
  IF r ? 'custo' THEN RAISE EXCEPTION '4: resposta não pode trazer custo'; END IF;
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 3.5 THEN RAISE EXCEPTION '4: estoque devia ser 3,5'; END IF;
END $$;
-- 5) segunda apuração do mesmo pedido: nada muda
DO $$ DECLARE r jsonb; BEGIN
  r := public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d1','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":2.5}]');
  IF NOT (r->>'ja_feita')::bool THEN RAISE EXCEPTION '5: devia ser ja_feita'; END IF;
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 3.5 THEN RAISE EXCEPTION '5: estoque mudou'; END IF;
END $$;
-- (b) apurar pedido que não está 'Entregue' é recusado (T3 não foi entregue)
DO $$ BEGIN
  BEGIN PERFORM public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d3','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":1}]');
        RAISE EXCEPTION '(b) devia recusar: pedido nao entregue';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%ainda%entregue%' THEN RAISE EXCEPTION '(b) mensagem errada: %', SQLERRM; END IF; END;
END $$;
-- 6) (a) linhas duplicadas: T2 (vinculado 4) recebe [A 4, A 4]: entra só 4 (estoque 3,5 -> 7,5)
UPDATE public.orders SET status = 'Entregue' WHERE id = '00000000-0000-0000-0000-0000000000d2';
DO $$ DECLARE r jsonb; BEGIN
  r := public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d2','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":4},{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":4}]');
  IF (r->>'ja_feita')::bool OR (r->>'movimentos')::int <> 1 THEN RAISE EXCEPTION '6a: resposta %', r; END IF;
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 7.5 THEN RAISE EXCEPTION '6a: duplicadas passaram do vinculado, estoque devia ser 7,5'; END IF;
END $$;

-- (c) fábrica: as escritas são recusadas com 'Sem permissão'
DO $$ BEGIN
  BEGIN PERFORM public.lancar_compra('{}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":1,"custo_unitario":40}]');
        RAISE EXCEPTION '(c1) fabrica conseguiu lancar compra';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Sem perm%' THEN RAISE EXCEPTION '(c1) mensagem errada: %', SQLERRM; END IF; END;
END $$;
DO $$ BEGIN
  BEGIN PERFORM public.usar_do_estoque('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000a',1);
        RAISE EXCEPTION '(c2) fabrica conseguiu usar do estoque';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Sem perm%' THEN RAISE EXCEPTION '(c2) mensagem errada: %', SQLERRM; END IF; END;
END $$;
DO $$ BEGIN
  BEGIN PERFORM public.excluir_compra('00000000-0000-0000-0000-0000000000ff');
        RAISE EXCEPTION '(c3) fabrica conseguiu excluir compra';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Sem perm%' THEN RAISE EXCEPTION '(c3) mensagem errada: %', SQLERRM; END IF; END;
END $$;
DO $$ BEGIN
  BEGIN PERFORM public.ajustar_contagem('00000000-0000-0000-0000-00000000000a', 1);
        RAISE EXCEPTION '(c4) fabrica conseguiu ajustar contagem';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%Sem perm%' THEN RAISE EXCEPTION '(c4) mensagem errada: %', SQLERRM; END IF; END;
END $$;
-- (c5) fábrica: vinculado_ao_pedido funciona, sem custo (só insumo_id e quantidade), e T1 dá 7
DO $$ DECLARE v_cols text; v_qtd numeric; BEGIN
  SELECT string_agg(k, ',' ORDER BY k) INTO v_cols FROM (
    SELECT DISTINCT jsonb_object_keys(to_jsonb(v)) AS k FROM public.vinculado_ao_pedido('00000000-0000-0000-0000-0000000000d1') v) s;
  IF v_cols IS DISTINCT FROM 'insumo_id,quantidade' THEN RAISE EXCEPTION '(c5) colunas erradas: %', v_cols; END IF;
  SELECT quantidade INTO v_qtd FROM public.vinculado_ao_pedido('00000000-0000-0000-0000-0000000000d1') WHERE insumo_id = '00000000-0000-0000-0000-00000000000a';
  IF v_qtd IS DISTINCT FROM 7 THEN RAISE EXCEPTION '(c5) fabrica: vinculado T1 devia ser 7, veio %', v_qtd; END IF;
END $$;

-- 7) fábrica não lê compras
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.compras) <> 0 THEN RAISE EXCEPTION '7: fábrica leu compras'; END IF; END $$;
RESET ROLE;

-- volta a gestor
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
-- (d) lançar compra para pedido já apurado (T1) é recusado
DO $$ BEGIN
  BEGIN PERFORM public.lancar_compra('{}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":1,"custo_unitario":40,"pedido_id":"00000000-0000-0000-0000-0000000000d1"}]');
        RAISE EXCEPTION '(d) devia recusar: pedido ja apurado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%entregue e teve%' THEN RAISE EXCEPTION '(d) mensagem errada: %', SQLERRM; END IF; END;
END $$;
-- 8) excluir compra com pedido já apurado é recusado (compra escolhida pelo conteúdo: tem item do T1)
DO $$ BEGIN
  BEGIN PERFORM public.excluir_compra((SELECT ci.compra_id FROM compra_itens ci WHERE ci.pedido_id = '00000000-0000-0000-0000-0000000000d1' LIMIT 1));
        RAISE EXCEPTION '8: devia recusar';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%entregue e teve%' THEN RAISE EXCEPTION '8: mensagem errada: %', SQLERRM; END IF; END;
END $$;
-- 9) compra para T3 e T3 excluído antes da entrega: os 3 kg voltam ao estoque
SELECT public.lancar_compra('{}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":3,"custo_unitario":40,"pedido_id":"00000000-0000-0000-0000-0000000000d3"}]');
DELETE FROM public.orders WHERE id = '00000000-0000-0000-0000-0000000000d3';
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 10.5 THEN RAISE EXCEPTION '9: estoque devia ser 10,5'; END IF; END $$;
-- 10) excluir compra só de estoque, com saldo: estorna
SELECT public.lancar_compra('{}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":1,"custo_unitario":40}]');
SELECT public.excluir_compra((SELECT c.id FROM compras c JOIN compra_itens i ON i.compra_id=c.id WHERE i.quantidade=1 AND i.custo_unitario=40));
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 10.5 THEN RAISE EXCEPTION '10: estoque devia voltar a 10,5'; END IF; END $$;
-- 11) ajuste de contagem: real 8 → sai 2,5
SELECT public.ajustar_contagem('00000000-0000-0000-0000-00000000000a', 8);
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 8 THEN RAISE EXCEPTION '11: estoque devia ser 8'; END IF; END $$;
-- (e) pedido com sobra apurada (vazia) é excluído: a compra dele (10 kg) nunca entrou no estoque,
--     então excluir a compra só estorna os 2 kg que entraram (estoque 8 -> 10 -> 10 -> 8)
SELECT public.lancar_compra('{"fornecedor_nome":"Fornecedor E"}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":10,"custo_unitario":50,"pedido_id":"00000000-0000-0000-0000-0000000000d4"},{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":2,"custo_unitario":50}]');
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 10 THEN RAISE EXCEPTION '(e1) estoque devia ser 10 apos a compra de 2 kg'; END IF; END $$;
UPDATE public.orders SET status = 'Entregue' WHERE id = '00000000-0000-0000-0000-0000000000d4';
DO $$ DECLARE r jsonb; BEGIN
  r := public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d4','[]'::jsonb);
  IF (r->>'ja_feita')::bool OR (r->>'movimentos')::int <> 0 THEN RAISE EXCEPTION '(e2) resposta %', r; END IF;
END $$;
DELETE FROM public.orders WHERE id = '00000000-0000-0000-0000-0000000000d4';
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 10 THEN RAISE EXCEPTION '(e3) excluir o pedido nao pode mexer no estoque: devia continuar 10'; END IF; END $$;
SELECT public.excluir_compra((SELECT c.id FROM compras c JOIN compra_itens i ON i.compra_id=c.id WHERE i.quantidade=10 AND i.custo_unitario=50));
DO $$ BEGIN IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 8 THEN RAISE EXCEPTION '(e4) estoque devia cair exatamente 2 (para 8)'; END IF; END $$;
-- (f) pedido ENTREGUE, com compra vinculada e sem sobra apurada (falhou ou está pendente), é excluído:
--     o material já foi usado, então nada volta ao estoque (continua 8)
SELECT public.lancar_compra('{}','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":5,"custo_unitario":50,"pedido_id":"00000000-0000-0000-0000-0000000000d5"}]');
UPDATE public.orders SET status = 'Entregue' WHERE id = '00000000-0000-0000-0000-0000000000d5';
DELETE FROM public.orders WHERE id = '00000000-0000-0000-0000-0000000000d5';
DO $$ BEGIN
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 8 THEN RAISE EXCEPTION '(f1) excluir pedido entregue nao pode devolver ao estoque: devia continuar 8'; END IF;
  IF EXISTS (SELECT 1 FROM insumo_movements WHERE source = 'devolucao' AND quantity = 5) THEN RAISE EXCEPTION '(f2) nao pode haver devolucao de 5'; END IF;
END $$;
\echo 'TODOS OS CASOS PASSARAM'
ROLLBACK;

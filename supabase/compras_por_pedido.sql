-- =============================================================================
-- COMPRAS POR PEDIDO  (v3 — S7, decisão do Luiz em 14/10/2026)
-- Substitui a baixa automática: compras semanais vinculadas a cada pedido; a sobra
-- (comprado − ficha técnica) entra no estoque na entrega, uma vez por pedido.
-- Só acrescenta (tabelas, colunas, funções, gatilho). Nada é apagado.
-- Pode rodar mais de uma vez. Toda escrita pelas funções abaixo (SECURITY DEFINER).
-- =============================================================================

-- ANTES (somente leitura)
SELECT (SELECT count(*) FROM public.insumo_movements) AS movimentos,
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('compras','compra_itens','pedido_sobra_apurada')) AS tabelas_ja_existentes;

-- 1. Origem de cada movimento
ALTER TABLE public.insumo_movements ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.insumo_movements ADD COLUMN IF NOT EXISTS compra_item_id uuid;
CREATE INDEX IF NOT EXISTS idx_insumo_movements_reference ON public.insumo_movements(reference_id) WHERE reference_id IS NOT NULL;

-- 2. Compras
CREATE TABLE IF NOT EXISTS public.compras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  fornecedor_nome text,
  data            date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  notas           text,
  user_id         uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compras_data ON public.compras(data DESC);

CREATE TABLE IF NOT EXISTS public.compra_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id      uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  insumo_id      uuid NOT NULL REFERENCES public.insumos(id),
  quantidade     numeric(15,4) NOT NULL CHECK (quantidade > 0),
  custo_unitario numeric(15,4) NOT NULL CHECK (custo_unitario > 0),
  pedido_id      uuid REFERENCES public.orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_compra_itens_pedido ON public.compra_itens(pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compra_itens_compra ON public.compra_itens(compra_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insumo_movements_compra_item_fk') THEN
    ALTER TABLE public.insumo_movements ADD CONSTRAINT insumo_movements_compra_item_fk
      FOREIGN KEY (compra_item_id) REFERENCES public.compra_itens(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Trava: sobra apurada uma vez por pedido
CREATE TABLE IF NOT EXISTS public.pedido_sobra_apurada (
  order_id   uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Acesso: leitura só gestão; escrita só pelas funções
ALTER TABLE public.compras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_itens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_sobra_apurada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compras_leitura ON public.compras;
DROP POLICY IF EXISTS compra_itens_leitura ON public.compra_itens;
DROP POLICY IF EXISTS sobra_apurada_leitura ON public.pedido_sobra_apurada;
CREATE POLICY compras_leitura ON public.compras FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY compra_itens_leitura ON public.compra_itens FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY sobra_apurada_leitura ON public.pedido_sobra_apurada FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR public.is_factory());
GRANT SELECT ON public.compras, public.compra_itens, public.pedido_sobra_apurada TO authenticated;

-- 5. Funções
CREATE OR REPLACE FUNCTION public.lancar_compra(p_compra jsonb, p_itens jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_item jsonb; v_item_id uuid; v_qtd numeric; v_custo numeric; v_pedido uuid;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para lançar compra'; END IF;
  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'A compra não tem itens'; END IF;
  INSERT INTO public.compras (fornecedor_id, fornecedor_nome, data, notas, user_id)
  VALUES (NULLIF(p_compra->>'fornecedor_id','')::uuid, NULLIF(btrim(p_compra->>'fornecedor_nome'),''),
          COALESCE(NULLIF(p_compra->>'data','')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
          NULLIF(btrim(p_compra->>'notas'),''), auth.uid())
  RETURNING id INTO v_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    v_qtd := (v_item->>'quantidade')::numeric;
    v_custo := (v_item->>'custo_unitario')::numeric;
    v_pedido := NULLIF(v_item->>'pedido_id','')::uuid;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN RAISE EXCEPTION 'Quantidade tem de ser maior que zero'; END IF;
    IF v_custo IS NULL OR v_custo <= 0 THEN RAISE EXCEPTION 'Custo tem de ser maior que zero'; END IF;
    IF v_pedido IS NOT NULL THEN
      -- Trava o pedido em modo compartilhado: uma apuração concorrente espera ou esta compra falha.
      PERFORM 1 FROM public.orders WHERE id = v_pedido FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
      IF EXISTS (SELECT 1 FROM public.pedido_sobra_apurada WHERE order_id = v_pedido) THEN
        RAISE EXCEPTION 'O pedido já foi entregue e teve a sobra apurada: lance para o estoque';
      END IF;
    END IF;
    INSERT INTO public.compra_itens (compra_id, insumo_id, quantidade, custo_unitario, pedido_id)
    VALUES (v_id, (v_item->>'insumo_id')::uuid, v_qtd, v_custo, v_pedido)
    RETURNING id INTO v_item_id;
    IF v_pedido IS NULL THEN
      INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, notes, source, compra_item_id, user_id)
      VALUES ((v_item->>'insumo_id')::uuid, 'IN', v_qtd, v_custo, 'Compra para o estoque', 'compra', v_item_id, auth.uid());
    END IF;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.excluir_compra(p_compra_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  -- Serializa por compra: duas exclusões (ou uma exclusão e um lançamento) não se atropelam.
  PERFORM 1 FROM public.compras WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.compra_itens ci JOIN public.pedido_sobra_apurada a ON a.order_id = ci.pedido_id
             WHERE ci.compra_id = p_compra_id) THEN
    RAISE EXCEPTION 'Um pedido desta compra já foi entregue e teve a sobra apurada';
  END IF;
  -- Estorno = o que de fato entrou no estoque por esta compra (compra + devolução de pedido excluído).
  -- Sobra não tem compra_item_id, então não entra aqui.
  FOR r IN SELECT m.insumo_id, sum(m.quantity) AS qtd FROM public.insumo_movements m
            WHERE m.type = 'IN'
              AND m.compra_item_id IN (SELECT ci.id FROM public.compra_itens ci WHERE ci.compra_id = p_compra_id)
            GROUP BY m.insumo_id LOOP
    IF (SELECT current_stock FROM public.insumos WHERE id = r.insumo_id FOR UPDATE) < r.qtd THEN
      RAISE EXCEPTION 'O estoque já usou parte do que esta compra pôs lá';
    END IF;
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, notes, source, user_id)
    VALUES (r.insumo_id, 'OUT', r.qtd, 'Compra excluída', 'estorno_compra', auth.uid());
  END LOOP;
  DELETE FROM public.compras WHERE id = p_compra_id;
END $$;

CREATE OR REPLACE FUNCTION public.usar_do_estoque(p_order_id uuid, p_insumo_id uuid, p_quantidade numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade tem de ser maior que zero'; END IF;
  -- Trava o pedido em modo compartilhado, antes de checar a trava da sobra (ver lancar_compra).
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF EXISTS (SELECT 1 FROM public.pedido_sobra_apurada WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'O pedido já foi entregue e teve a sobra apurada';
  END IF;
  IF (SELECT current_stock FROM public.insumos WHERE id = p_insumo_id FOR UPDATE) < p_quantidade THEN
    RAISE EXCEPTION 'O estoque não tem essa quantidade';
  END IF;
  INSERT INTO public.insumo_movements (insumo_id, type, quantity, reference_id, notes, source, user_id)
  VALUES (p_insumo_id, 'OUT', p_quantidade, p_order_id, 'Usado do estoque no pedido', 'uso_estoque', auth.uid());
END $$;

-- O que foi vinculado ao pedido (compras + usos do estoque), por insumo. Sem custo: a fábrica chama.
CREATE OR REPLACE FUNCTION public.vinculado_ao_pedido(p_order_id uuid)
RETURNS TABLE(insumo_id uuid, quantidade numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT v.insumo_id, sum(v.qtd)::numeric FROM (
    SELECT ci.insumo_id, ci.quantidade AS qtd FROM public.compra_itens ci WHERE ci.pedido_id = p_order_id
    UNION ALL
    SELECT m.insumo_id, m.quantity FROM public.insumo_movements m
     WHERE m.reference_id = p_order_id AND m.source = 'uso_estoque' AND m.type = 'OUT'
  ) v GROUP BY v.insumo_id;
END $$;

CREATE OR REPLACE FUNCTION public.apurar_sobras_do_pedido(p_order_id uuid, p_sobras jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_linha record; v_vinc numeric; v_custo numeric; v_mov int := 0;
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  -- Trava o pedido: lancar_compra e usar_do_estoque o travam em modo compartilhado.
  PERFORM 1 FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF (SELECT status FROM public.orders WHERE id = p_order_id) IS DISTINCT FROM 'Entregue' THEN
    RAISE EXCEPTION 'O pedido ainda não foi entregue';
  END IF;
  INSERT INTO public.pedido_sobra_apurada (order_id, user_id) VALUES (p_order_id, auth.uid())
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ja_feita', true, 'movimentos', 0); END IF;
  -- Soma as linhas por insumo antes do teto: linhas repetidas não passam do vinculado.
  FOR v_linha IN
    SELECT (e->>'insumo_id')::uuid AS ins, sum((e->>'quantidade')::numeric) AS qtd
      FROM jsonb_array_elements(COALESCE(p_sobras, '[]'::jsonb)) e
     GROUP BY 1
  LOOP
    CONTINUE WHEN v_linha.qtd IS NULL OR v_linha.qtd <= 0;
    -- Nunca devolve mais do que foi vinculado, e o custo é o do que foi vinculado.
    SELECT sum(q), sum(q * c) / NULLIF(sum(q), 0) INTO v_vinc, v_custo FROM (
      SELECT ci.quantidade AS q, ci.custo_unitario AS c FROM public.compra_itens ci
       WHERE ci.pedido_id = p_order_id AND ci.insumo_id = v_linha.ins
      UNION ALL
      SELECT m.quantity, m.unit_cost FROM public.insumo_movements m
       WHERE m.reference_id = p_order_id AND m.insumo_id = v_linha.ins AND m.source = 'uso_estoque' AND m.type = 'OUT'
    ) x;
    CONTINUE WHEN v_vinc IS NULL OR v_custo IS NULL OR v_custo <= 0;
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, reference_id, notes, source, user_id)
    VALUES (v_linha.ins, 'IN', least(v_linha.qtd, v_vinc), v_custo, p_order_id, 'Sobra do pedido', 'sobra', auth.uid());
    v_mov := v_mov + 1;
  END LOOP;
  RETURN jsonb_build_object('ja_feita', false, 'movimentos', v_mov);
END $$;

CREATE OR REPLACE FUNCTION public.ajustar_contagem(p_insumo_id uuid, p_saldo_real numeric, p_custo numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_atual numeric; v_medio numeric; v_dif numeric; v_custo numeric;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_saldo_real IS NULL OR p_saldo_real < 0 THEN RAISE EXCEPTION 'Saldo real não pode ser negativo'; END IF;
  SELECT current_stock, average_unit_cost INTO v_atual, v_medio FROM public.insumos WHERE id = p_insumo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo não encontrado'; END IF;
  v_dif := p_saldo_real - v_atual;
  IF v_dif = 0 THEN RETURN; END IF;
  IF v_dif > 0 THEN
    v_custo := COALESCE(NULLIF(v_medio, 0), p_custo);
    IF v_custo IS NULL OR v_custo <= 0 THEN RAISE EXCEPTION 'Informe o custo: este insumo ainda não tem custo médio'; END IF;
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, notes, source, user_id)
    VALUES (p_insumo_id, 'IN', v_dif, v_custo, 'Ajuste de contagem', 'ajuste', auth.uid());
  ELSE
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, notes, source, user_id)
    VALUES (p_insumo_id, 'OUT', -v_dif, 'Ajuste de contagem', 'ajuste', auth.uid());
  END IF;
END $$;

-- 6. Pedido excluído ANTES da entrega devolve o que estava vinculado.
--    Pedido já 'Entregue' (com sobra apurada, pendente ou que falhou) não devolve nada: a fábrica já usou o material.
CREATE OR REPLACE FUNCTION public.devolver_vinculado_do_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  IF OLD.status = 'Entregue' OR EXISTS (SELECT 1 FROM public.pedido_sobra_apurada WHERE order_id = OLD.id) THEN RETURN OLD; END IF;
  FOR r IN SELECT ci.id, ci.insumo_id, ci.quantidade, ci.custo_unitario FROM public.compra_itens ci WHERE ci.pedido_id = OLD.id LOOP
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, notes, source, compra_item_id)
    VALUES (r.insumo_id, 'IN', r.quantidade, r.custo_unitario, 'Pedido excluído: volta ao estoque', 'devolucao', r.id);
  END LOOP;
  UPDATE public.compra_itens SET pedido_id = NULL WHERE pedido_id = OLD.id;
  FOR r IN SELECT m.insumo_id, m.quantity, m.unit_cost FROM public.insumo_movements m
            WHERE m.reference_id = OLD.id AND m.source = 'uso_estoque' AND m.type = 'OUT' AND m.unit_cost > 0 LOOP
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, notes, source)
    VALUES (r.insumo_id, 'IN', r.quantity, r.unit_cost, 'Pedido excluído: volta ao estoque', 'devolucao');
  END LOOP;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_orders_devolver_vinculado ON public.orders;
CREATE TRIGGER trg_orders_devolver_vinculado BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.devolver_vinculado_do_pedido();

REVOKE ALL ON FUNCTION public.lancar_compra(jsonb, jsonb), public.excluir_compra(uuid),
  public.usar_do_estoque(uuid, uuid, numeric), public.vinculado_ao_pedido(uuid),
  public.apurar_sobras_do_pedido(uuid, jsonb), public.ajustar_contagem(uuid, numeric, numeric),
  public.devolver_vinculado_do_pedido() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.lancar_compra(jsonb, jsonb), public.excluir_compra(uuid),
  public.usar_do_estoque(uuid, uuid, numeric), public.vinculado_ao_pedido(uuid),
  public.apurar_sobras_do_pedido(uuid, jsonb), public.ajustar_contagem(uuid, numeric, numeric) TO authenticated;

-- DEPOIS (somente leitura)
SELECT (SELECT count(*) FROM pg_proc WHERE proname IN ('lancar_compra','excluir_compra','usar_do_estoque',
          'vinculado_ao_pedido','apurar_sobras_do_pedido','ajustar_contagem')) AS funcoes_6,
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('compras','compra_itens','pedido_sobra_apurada')) AS tabelas_3,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_orders_devolver_vinculado') AS gatilho_1;

# Compras por pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a baixa automática de estoque por compras semanais vinculadas a cada pedido, com a sobra entrando sozinha no estoque na entrega.

**Architecture:** Duas tabelas novas (`compras`, `compra_itens`) e uma trava (`pedido_sobra_apurada`), com toda escrita por funções `SECURITY DEFINER` num arquivo SQL. As contas (previsto pela ficha com troca de tecido, divisão sugerida, sobra, o que falta comprar) são utils puras testadas em `src/utils/fabrica/compras.ts`. As telas reaproveitam a Lista de compras, o Quadro e o Estoque; saem a baixa, a trava de falta e o Consumo não apurado.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind v4; Supabase/PostgREST; testes `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-14-compras-por-pedido-design.md` (leia antes de qualquer tarefa).

## Global Constraints

- Worktree `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`. Nunca push. Nunca stage em `supabase/snippets/`.
- **Nada no banco.** Implementador NÃO roda SQL em banco nenhum. O controlador testa o SQL num contêiner descartável e o Luiz roda no banco local.
- O estoque nunca mexe sozinho por produção. Saldo muda só por: compra sem pedido, sobra na entrega, "usar do estoque", pedido excluído antes da entrega, ajuste de contagem.
- A sobra é apurada **uma vez por pedido** (trava no banco).
- Compra tem dinheiro: só admin/manager lê `compras`/`compra_itens`. A fábrica nunca recebe custo de compra.
- Produto sem ficha técnica no pedido ⇒ o pedido inteiro conta como **todo gasto** (sobra vazia).
- Lançar compra **não** cria conta a pagar.
- Visual pelo `src/components/finance/ui/estilo.ts`; camadas z-modal 100 / z-sobreposto 200 / z-balao 300 / z-confirmacao 400 / z-aviso 500; modal sai em `createPortal(..., document.body)` (exemplo: `src/components/common/Modal.tsx`); Esc pelo `src/hooks/useEscFecha.ts`.
- Ícone só-ícone: 18px com `${BOTAO_SECUNDARIO} w-10 px-0`, ou denso `inline-flex h-8 w-8` com 16px; botão de ícone com `aria-label` e `type="button"`. Tamanho de ícone nunca diminui.
- Números pelo `src/utils/numeros.ts` (`numero`, `percentual`); entrada de número por `parseBRL` de `src/utils/currency.ts` (regra: "1.000" é mil).
- Utils puras em `src/utils/**` com import relativo `.ts` e sem import do app.
- Testes: `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts" "src/utils/fabrica/*.test.ts"`; mais `npx tsc --noEmit` e `npx vite build`.
- Commits em português, terminando com linha em branco e `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Tecido trocado no pedido**: o item escolheu um tecido diferente do da ficha — previsto, divisão e sobra usam o tecido do pedido, não o da ficha (teste em Task 2).
2. **Entrega repetida** (pedido volta do Entregue e é entregue de novo): nenhuma segunda sobra (teste SQL em Task 1).
3. **Excluir compra cuja parte do estoque já foi usada**: recusa com motivo, nada muda (teste SQL em Task 1).
4. **Fábrica confirma entrega**: a sobra entra mesmo assim, e a resposta do servidor não traz custo (teste SQL em Task 1; conferência no navegador no fim).
5. **Quantidades com 3 casas e "1.000"**: 0,357 kg × 10 peças = 3,57; digitar "1.000" é mil (testes em Task 2 e conferência da janela em Task 4).

---

### Task 1: SQL — compras, trava da sobra e funções

**Files:**
- Create: `supabase/compras_por_pedido.sql`
- Create: `supabase/testes/compras_por_pedido_teste.sql`

**Interfaces:**
- Produces (RPCs, nomes e parâmetros exatos):
  - `lancar_compra(p_compra jsonb, p_itens jsonb) returns uuid` — `p_compra = {fornecedor_id?, fornecedor_nome?, data?, notas?}`; `p_itens = [{insumo_id, quantidade, custo_unitario, pedido_id?}]`.
  - `excluir_compra(p_compra_id uuid) returns void`.
  - `usar_do_estoque(p_order_id uuid, p_insumo_id uuid, p_quantidade numeric) returns void`.
  - `vinculado_ao_pedido(p_order_id uuid) returns table(insumo_id uuid, quantidade numeric)` — sem custo.
  - `apurar_sobras_do_pedido(p_order_id uuid, p_sobras jsonb) returns jsonb` — `p_sobras = [{insumo_id, quantidade}]`; devolve `{"ja_feita": bool, "movimentos": int}`.
  - `ajustar_contagem(p_insumo_id uuid, p_saldo_real numeric, p_custo numeric default null) returns void`.
  - Coluna `insumo_movements.source` com valores `manual | compra | estorno_compra | sobra | uso_estoque | devolucao | ajuste`.

- [ ] **Step 1: Escrever `supabase/compras_por_pedido.sql`**

```sql
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
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF v_pedido IS NOT NULL AND EXISTS (SELECT 1 FROM public.pedido_sobra_apurada WHERE order_id = v_pedido) THEN
      RAISE EXCEPTION 'O pedido já foi entregue e teve a sobra apurada: lance para o estoque';
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
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF EXISTS (SELECT 1 FROM public.compra_itens ci JOIN public.pedido_sobra_apurada a ON a.order_id = ci.pedido_id
             WHERE ci.compra_id = p_compra_id) THEN
    RAISE EXCEPTION 'Um pedido desta compra já foi entregue e teve a sobra apurada';
  END IF;
  FOR r IN SELECT ci.insumo_id, sum(ci.quantidade) AS qtd FROM public.compra_itens ci
            WHERE ci.compra_id = p_compra_id AND ci.pedido_id IS NULL GROUP BY ci.insumo_id LOOP
    IF (SELECT current_stock FROM public.insumos WHERE id = r.insumo_id FOR UPDATE) < r.qtd THEN
      RAISE EXCEPTION 'O estoque já usou parte do que esta compra pôs lá';
    END IF;
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, notes, source, user_id)
    VALUES (r.insumo_id, 'OUT', r.qtd, 'Compra excluída', 'estorno_compra', auth.uid());
  END LOOP;
  DELETE FROM public.compras WHERE id = p_compra_id;
END $$;

CREATE OR REPLACE FUNCTION public.usar_do_estoque(p_order_id uuid, p_insumo_id uuid, p_quantidade numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade tem de ser maior que zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
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
RETURNS TABLE(insumo_id uuid, quantidade numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_linha jsonb; v_ins uuid; v_qtd numeric; v_vinc numeric; v_custo numeric; v_mov int := 0;
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  INSERT INTO public.pedido_sobra_apurada (order_id, user_id) VALUES (p_order_id, auth.uid())
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('ja_feita', true, 'movimentos', 0); END IF;
  FOR v_linha IN SELECT * FROM jsonb_array_elements(COALESCE(p_sobras, '[]'::jsonb)) LOOP
    v_ins := (v_linha->>'insumo_id')::uuid;
    v_qtd := COALESCE((v_linha->>'quantidade')::numeric, 0);
    CONTINUE WHEN v_qtd <= 0;
    -- Nunca devolve mais do que foi vinculado, e o custo é o do que foi vinculado.
    SELECT sum(q), sum(q * c) / NULLIF(sum(q), 0) INTO v_vinc, v_custo FROM (
      SELECT ci.quantidade AS q, ci.custo_unitario AS c FROM public.compra_itens ci
       WHERE ci.pedido_id = p_order_id AND ci.insumo_id = v_ins
      UNION ALL
      SELECT m.quantity, m.unit_cost FROM public.insumo_movements m
       WHERE m.reference_id = p_order_id AND m.insumo_id = v_ins AND m.source = 'uso_estoque' AND m.type = 'OUT'
    ) x;
    CONTINUE WHEN v_vinc IS NULL OR v_custo IS NULL OR v_custo <= 0;
    INSERT INTO public.insumo_movements (insumo_id, type, quantity, unit_cost, reference_id, notes, source, user_id)
    VALUES (v_ins, 'IN', least(v_qtd, v_vinc), v_custo, p_order_id, 'Sobra do pedido', 'sobra', auth.uid());
    v_mov := v_mov + 1;
  END LOOP;
  RETURN jsonb_build_object('ja_feita', false, 'movimentos', v_mov);
END $$;

CREATE OR REPLACE FUNCTION public.ajustar_contagem(p_insumo_id uuid, p_saldo_real numeric, p_custo numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 6. Pedido excluído antes da entrega devolve o que estava vinculado
CREATE OR REPLACE FUNCTION public.devolver_vinculado_do_pedido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pedido_sobra_apurada WHERE order_id = OLD.id) THEN RETURN OLD; END IF;
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

GRANT EXECUTE ON FUNCTION public.lancar_compra(jsonb, jsonb), public.excluir_compra(uuid),
  public.usar_do_estoque(uuid, uuid, numeric), public.vinculado_ao_pedido(uuid),
  public.apurar_sobras_do_pedido(uuid, jsonb), public.ajustar_contagem(uuid, numeric, numeric) TO authenticated;

-- DEPOIS (somente leitura)
SELECT (SELECT count(*) FROM pg_proc WHERE proname IN ('lancar_compra','excluir_compra','usar_do_estoque',
          'vinculado_ao_pedido','apurar_sobras_do_pedido','ajustar_contagem')) AS funcoes_6,
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('compras','compra_itens','pedido_sobra_apurada')) AS tabelas_3,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_orders_devolver_vinculado') AS gatilho_1;
```

Notas para o implementador: `insumo_movements` tem um gatilho `BEFORE INSERT` (`update_insumo_stock_and_cost`) que já atualiza `insumos.current_stock` e o custo médio, exige `unit_cost > 0` em `IN` e recusa `OUT` sem saldo — por isso as funções não mexem em `insumos` diretamente. `is_admin_or_manager()` e `is_factory()` já existem no banco.

- [ ] **Step 2: Escrever `supabase/testes/compras_por_pedido_teste.sql`** (transação desfeita no fim; falha com `RAISE EXCEPTION` se algo der errado)

```sql
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
  ('00000000-0000-0000-0000-0000000000d3','PED-T3','00000000-0000-0000-0000-0000000000c1', current_date+10);
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

-- 3) usar do estoque sem saldo é recusado
DO $$ BEGIN
  BEGIN PERFORM public.usar_do_estoque('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-00000000000a',5);
        RAISE EXCEPTION '3: devia recusar';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '3:%' THEN RAISE; END IF; END;
END $$;

-- 4) fábrica apura a sobra do T1: pede 2,5 kg; entra 2,5 (≤ 7) ao custo médio do vinculado (R$ 50)
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
-- 6) sobra maior que o vinculado é limitada ao vinculado (T2 tem 4; pede 9 → entra 4)
DO $$ BEGIN PERFORM public.apurar_sobras_do_pedido('00000000-0000-0000-0000-0000000000d2','[{"insumo_id":"00000000-0000-0000-0000-00000000000a","quantidade":9}]');
  IF (SELECT current_stock FROM insumos WHERE id='00000000-0000-0000-0000-00000000000a') <> 7.5 THEN RAISE EXCEPTION '6: estoque devia ser 7,5'; END IF; END $$;
-- 7) fábrica não lê compras
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.compras) <> 0 THEN RAISE EXCEPTION '7: fábrica leu compras'; END IF; END $$;
RESET ROLE;

-- volta a gestor
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
-- 8) excluir compra com pedido já apurado é recusado
DO $$ BEGIN
  BEGIN PERFORM public.excluir_compra((SELECT id FROM compras LIMIT 1)); RAISE EXCEPTION '8: devia recusar';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '8:%' THEN RAISE; END IF; END;
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
\echo 'TODOS OS CASOS PASSARAM'
ROLLBACK;
```

- [ ] **Step 3: Commit** (o implementador não roda o SQL; o controlador roda no contêiner descartável e devolve o resultado)

```bash
git add supabase/compras_por_pedido.sql supabase/testes/compras_por_pedido_teste.sql
git commit -m "feat(sql): compras por pedido, sobra apurada uma vez e devolução ao excluir pedido"
```

---

### Task 2: Contas puras — previsto, divisão, sobra e o que falta comprar

**Files:**
- Create: `src/utils/fabrica/compras.ts`
- Create: `src/utils/fabrica/compras.test.ts`
- Modify: `src/utils/purchaseList.ts` (passa a usar `previstoDoPedido` e o vinculado)
- Modify: `src/utils/purchaseList.test.ts`

**Interfaces:**
- Consumes: `PLOrder`, `PLBomLine`, `PLInsumo` de `src/utils/purchaseList.ts` (já existem).
- Produces:
  - `previstoDoPedido(pedido: PLOrder, fichas: Map<string, PLBomLine[]>, insumos: Map<string, PLInsumo>): { porInsumo: Map<string, number>; semFicha: boolean }`
  - `sugerirDivisao(quantidade: number, faltas: { pedidoId: string; falta: number }[]): { pedidoId: string | null; quantidade: number }[]` — `pedidoId: null` = estoque.
  - `calcularSobras(vinculado: Map<string, number>, previsto: { porInsumo: Map<string, number>; semFicha: boolean }): { insumo_id: string; quantidade: number }[]`
  - `computePurchaseList(orders, bomByProduct, insumoById, vinculadoPorPedido?: Map<string, Map<string, number>>)` — `to_buy` passa a ser previsto − vinculado; nova coluna `pedidos: { order_id: string; order_number: string; falta: number }[]` em `PurchaseLine`; `in_stock` continua (estoque de sobras, informativo); `is_shortage = to_buy > 0`.

- [ ] **Step 1: Escrever os testes `src/utils/fabrica/compras.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previstoDoPedido, sugerirDivisao, calcularSobras } from './compras.ts';
import type { PLOrder, PLBomLine, PLInsumo } from '../purchaseList.ts';

const insumos = new Map<string, PLInsumo>([
    ['malha', { id: 'malha', name: 'Malha', unit: 'kg', current_stock: 0, average_unit_cost: 50, category: 'Tecidos' }],
    ['malha2', { id: 'malha2', name: 'Malha 2', unit: 'kg', current_stock: 0, average_unit_cost: 60, category: 'Tecidos' }],
    ['linha', { id: 'linha', name: 'Linha', unit: 'un', current_stock: 0, average_unit_cost: 2, category: 'Aviamentos' }],
]);
const fichas = new Map<string, PLBomLine[]>([
    ['camiseta', [{ insumo_id: 'malha', quantity: 0.357 }, { insumo_id: 'linha', quantity: 1 }]],
]);
const pedido = (items: PLOrder['items']): PLOrder => ({ id: 'p1', order_number: 'PED-1', deadline: '2026-11-11', items });

test('previsto multiplica a ficha pelas peças, com 3 casas', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10 }]), fichas, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.get('malha'), 3.57);
    assert.equal(r.porInsumo.get('linha'), 10);
});

test('tecido escolhido no pedido substitui o tecido da ficha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10, fabric_insumo_id: 'malha2' }]), fichas, insumos);
    assert.equal(r.porInsumo.get('malha'), undefined);
    assert.equal(r.porInsumo.get('malha2'), 3.57);
    assert.equal(r.porInsumo.get('linha'), 10);
});

test('produto sem ficha marca semFicha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'camiseta', quantity: 10 }, { product_id: 'boné', quantity: 5 }]), fichas, insumos);
    assert.equal(r.semFicha, true);
});

test('item com zero peças não conta e não marca semFicha', () => {
    const r = previstoDoPedido(pedido([{ product_id: 'boné', quantity: 0 }]), fichas, insumos);
    assert.equal(r.semFicha, false);
    assert.equal(r.porInsumo.size, 0);
});

test('divisão sugerida cobre as faltas na ordem dada e o resto vai ao estoque', () => {
    assert.deepEqual(sugerirDivisao(10, [{ pedidoId: 'a', falta: 6 }, { pedidoId: 'b', falta: 3 }]),
        [{ pedidoId: 'a', quantidade: 6 }, { pedidoId: 'b', quantidade: 3 }, { pedidoId: null, quantidade: 1 }]);
    assert.deepEqual(sugerirDivisao(4, [{ pedidoId: 'a', falta: 6 }]), [{ pedidoId: 'a', quantidade: 4 }]);
    assert.deepEqual(sugerirDivisao(2, []), [{ pedidoId: null, quantidade: 2 }]);
    assert.deepEqual(sugerirDivisao(0, [{ pedidoId: 'a', falta: 1 }]), []);
});

test('sobra = vinculado − previsto, só positivo, 3 casas', () => {
    const previsto = { porInsumo: new Map([['malha', 3.57], ['linha', 10]]), semFicha: false };
    const vinculado = new Map([['malha', 5], ['linha', 8], ['ziper', 2]]);
    assert.deepEqual(calcularSobras(vinculado, previsto), [
        { insumo_id: 'malha', quantidade: 1.43 },
        { insumo_id: 'ziper', quantidade: 2 },
    ]);
});

test('pedido com produto sem ficha: tudo gasto, sobra vazia', () => {
    const previsto = { porInsumo: new Map([['malha', 3.57]]), semFicha: true };
    assert.deepEqual(calcularSobras(new Map([['malha', 10]]), previsto), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/fabrica/compras.test.ts`
Expected: FAIL — `Cannot find module './compras.ts'`.

- [ ] **Step 3: Implementar `src/utils/fabrica/compras.ts`**

```ts
/**
 * Compras por pedido (S7): o que a ficha prevê para um pedido, como dividir uma
 * compra entre os pedidos e o que sobra na entrega. Sem estoque calculado: o
 * estoque só recebe o que sobra (decisão do Luiz, 14/10/2026).
 */
import type { PLOrder, PLBomLine, PLInsumo } from '../purchaseList.ts';

/** Quantidades com 3 casas (0,357 kg × 10 = 3,57), sem lixo de ponto flutuante. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const TECIDOS = ['tecidos', 'tecido'];
const ehTecido = (i?: PLInsumo) => !!i && (!i.category || TECIDOS.includes(i.category.toLowerCase()));

export interface Previsto { porInsumo: Map<string, number>; semFicha: boolean }

/** A ficha × as peças de cada item; o tecido escolhido no pedido substitui o da ficha. */
export function previstoDoPedido(pedido: PLOrder, fichas: Map<string, PLBomLine[]>, insumos: Map<string, PLInsumo>): Previsto {
    const porInsumo = new Map<string, number>();
    let semFicha = false;
    for (const item of pedido.items || []) {
        const pecas = Number(item.quantity) || 0;
        if (pecas <= 0) continue;
        const ficha = fichas.get(item.product_id) || [];
        if (ficha.length === 0) { semFicha = true; continue; }
        for (const linha of ficha) {
            let insumoId = linha.insumo_id;
            if (item.fabric_insumo_id && item.fabric_insumo_id !== linha.insumo_id && ehTecido(insumos.get(linha.insumo_id))) {
                insumoId = item.fabric_insumo_id;
            }
            const q = (Number(linha.quantity) || 0) * pecas;
            if (q > 0) porInsumo.set(insumoId, r3((porInsumo.get(insumoId) || 0) + q));
        }
    }
    return { porInsumo, semFicha };
}

/** Divide uma quantidade comprada pelas faltas, na ordem dada; o resto vai ao estoque (pedidoId null). */
export function sugerirDivisao(quantidade: number, faltas: { pedidoId: string; falta: number }[]): { pedidoId: string | null; quantidade: number }[] {
    let resto = r3(quantidade);
    const partes: { pedidoId: string | null; quantidade: number }[] = [];
    for (const f of faltas) {
        if (resto <= 0) break;
        const q = r3(Math.min(resto, Math.max(0, f.falta)));
        if (q > 0) { partes.push({ pedidoId: f.pedidoId, quantidade: q }); resto = r3(resto - q); }
    }
    if (resto > 0) partes.push({ pedidoId: null, quantidade: resto });
    return partes;
}

/** Sobra = vinculado − previsto, só o positivo. Produto sem ficha no pedido: tudo gasto (resposta 6 do Luiz). */
export function calcularSobras(vinculado: Map<string, number>, previsto: Previsto): { insumo_id: string; quantidade: number }[] {
    if (previsto.semFicha) return [];
    const sobras: { insumo_id: string; quantidade: number }[] = [];
    for (const [insumo_id, v] of vinculado) {
        const q = r3(v - (previsto.porInsumo.get(insumo_id) || 0));
        if (q > 0) sobras.push({ insumo_id, quantidade: q });
    }
    return sobras.sort((a, b) => a.insumo_id.localeCompare(b.insumo_id));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/fabrica/compras.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Mudar `computePurchaseList` para "o que falta comprar"** em `src/utils/purchaseList.ts`:
  - `PurchaseLine` ganha `vinculado: number` e `pedidos: { order_id: string; order_number: string; falta: number }[]`.
  - Assinatura: `computePurchaseList(orders, bomByProduct, insumoById, vinculadoPorPedido = new Map<string, Map<string, number>>())`.
  - Para cada pedido: `previstoDoPedido(order, bomByProduct, insumoById)`; produtos sem ficha continuam indo para `products_without_bom` (mantenha: percorra os itens com `bomByProduct.get(item.product_id)` vazio). Para cada insumo do previsto: `falta = max(0, previsto − vinculado do pedido nesse insumo)`; acumula `needed += previsto`, `vinculado += vinculado do pedido`, e, se `falta > 0`, empurra `{order_id, order_number, falta}` em `pedidos` (ordem: prazo do pedido, depois número).
  - `to_buy = round2(soma das faltas)`; `in_stock` = `current_stock` (sobras guardadas, só informativo — **não** abate do `to_buy`); `est_cost = round2(to_buy * unit_cost)`; `is_shortage = to_buy > 0`.
  - Remova a lógica de tecido duplicada (`isFabric`/`FABRIC_CATS`) que passou para `compras.ts`.

- [ ] **Step 6: Atualizar `src/utils/purchaseList.test.ts`**: os testes que esperavam `to_buy = needed − in_stock` passam a esperar `to_buy = needed − vinculado` e ignorar o estoque. Acrescente:

```ts
test('o que falta comprar abate o já vinculado a cada pedido, não o estoque', () => {
    const orders: PLOrder[] = [
        { id: 'o1', order_number: 'PED-1', deadline: '2026-11-01', items: [{ product_id: 'p', quantity: 10 }] },
        { id: 'o2', order_number: 'PED-2', deadline: '2026-11-05', items: [{ product_id: 'p', quantity: 10 }] },
    ];
    const bom = new Map<string, PLBomLine[]>([['p', [{ insumo_id: 'm', quantity: 0.5 }]]]);
    const ins = new Map<string, PLInsumo>([['m', { id: 'm', name: 'Malha', unit: 'kg', current_stock: 100, average_unit_cost: 10, category: 'Tecidos' }]]);
    const vinc = new Map([['o1', new Map([['m', 5]])], ['o2', new Map([['m', 2]])]]);
    const r = computePurchaseList(orders, bom, ins, vinc);
    const l = r.lines[0];
    assert.equal(l.needed, 10);
    assert.equal(l.vinculado, 7);
    assert.equal(l.to_buy, 3);
    assert.equal(l.in_stock, 100);
    assert.deepEqual(l.pedidos, [{ order_id: 'o2', order_number: 'PED-2', falta: 3 }]);
});
```

- [ ] **Step 7: Suíte inteira + tipos**

Run: o comando de testes das Global Constraints e `npx tsc --noEmit`.
Expected: tudo passa. (Se `recebimento.ts`/`recebimento.test.ts` quebrarem pelo campo novo, ajuste só o fixture do teste — o arquivo sai na Task 4.)

- [ ] **Step 8: Commit**

```bash
git add src/utils/fabrica/compras.ts src/utils/fabrica/compras.test.ts src/utils/purchaseList.ts src/utils/purchaseList.test.ts src/utils/fabrica/recebimento.test.ts
git commit -m "feat(compras): previsto com tecido do pedido, divisão sugerida, sobra e o que falta comprar"
```

---

### Task 3: Repositório e tipos de compras

**Files:**
- Create: `src/repositories/comprasRepository.ts`
- Modify: `src/types/index.ts` (`InsumoMovement` ganha `source?` e `compra_item_id?`; tipos novos `Compra`, `CompraItem`)

**Interfaces:**
- Consumes: RPCs da Task 1.
- Produces (em `comprasRepository`):
  - `lancarCompra(compra: { fornecedor_id?: string; fornecedor_nome?: string; data?: string; notas?: string }, itens: { insumo_id: string; quantidade: number; custo_unitario: number; pedido_id?: string | null }[]): Promise<string>`
  - `excluirCompra(id: string): Promise<void>`
  - `comprasDoPeriodo(de: string, ate: string): Promise<Compra[]>` (com `itens: CompraItem[]` embutidos, ordenadas por data desc)
  - `vinculadoPorPedido(pedidoIds: string[]): Promise<Map<string, Map<string, number>>>` — lê `compra_itens` (gestão) **e** os usos do estoque (`insumo_movements` com `source='uso_estoque'`), somando por pedido e insumo.
  - `vinculadoAoPedido(orderId: string): Promise<Map<string, number>>` — pela RPC `vinculado_ao_pedido` (serve à fábrica).
  - `usarDoEstoque(orderId: string, insumoId: string, quantidade: number): Promise<void>`
  - `apurarSobras(orderId: string, sobras: { insumo_id: string; quantidade: number }[]): Promise<{ jaFeita: boolean; movimentos: number } | null>` — `null` quando a função não existe no banco (SQL não rodado), como `baixarEstoqueDaProducao` fazia com `isFuncaoAusente`.
  - `ajustarContagem(insumoId: string, saldoReal: number, custo?: number): Promise<void>`
  - Tipos em `src/types/index.ts`:

```ts
export interface CompraItem { id: string; compra_id: string; insumo_id: string; quantidade: number; custo_unitario: number; pedido_id?: string | null }
export interface Compra { id: string; fornecedor_id?: string | null; fornecedor_nome?: string | null; data: string; notas?: string | null; created_at: string; itens: CompraItem[] }
export type OrigemDoMovimento = 'manual' | 'compra' | 'estorno_compra' | 'sobra' | 'uso_estoque' | 'devolucao' | 'ajuste';
```

- [ ] **Step 1:** Adicionar os tipos acima e `source?: OrigemDoMovimento; compra_item_id?: string | null;` em `InsumoMovement`.
- [ ] **Step 2:** Criar `src/repositories/comprasRepository.ts` seguindo o padrão de `productionRepository.ts` (import `supabase` de onde ele importa; `if (!supabase) ...`; erro do Supabase vira `throw new Error(error.message)`; reaproveite `isFuncaoAusente` do mesmo lugar que `productionRepository` usa). Leituras com `.select('*, itens:compra_itens(*)')` para `comprasDoPeriodo`, filtrando `data` entre `de` e `ate`. `vinculadoPorPedido` com `.in('pedido_id', ids)` em `compra_itens` e `.in('reference_id', ids).eq('source','uso_estoque').eq('type','OUT')` em `insumo_movements`; sem ids, devolve mapa vazio sem consultar.
- [ ] **Step 3:** `npx tsc --noEmit` limpo.
- [ ] **Step 4: Commit**

```bash
git add src/repositories/comprasRepository.ts src/types/index.ts
git commit -m "feat(compras): repositório de compras, vínculo por pedido, sobras e ajuste"
```

---

### Task 4: Lista de compras vira "o que falta comprar", com Lançar compra e Usar do estoque

**Files:**
- Modify: `src/hooks/pcp/usePurchaseList.ts` (lê `vinculadoPorPedido` dos pedidos ativos e passa a `computePurchaseList`; expõe `pedidosAtivos` com id, número e prazo, e `reload`)
- Modify: `src/components/pcp/PurchaseListPanel.tsx`
- Create: `src/components/pcp/LancarCompraModal.tsx`
- Create: `src/components/pcp/UsarDoEstoqueModal.tsx` (usado também pelo Estoque na Task 6)
- Delete: `src/components/pcp/ReceberCompraModal.tsx`, `src/utils/fabrica/recebimento.ts`, `src/utils/fabrica/recebimento.test.ts` (depois de `grep` confirmar que nada mais usa)

**Interfaces:**
- Consumes: `computePurchaseList(..., vinculadoPorPedido)`, `PurchaseLine.pedidos/vinculado`, `sugerirDivisao`, `comprasRepository.*`.
- Produces: `UsarDoEstoqueModal({ insumo: { id: string; name: string; unit: string; current_stock: number }, pedidos: { id: string; order_number: string; falta?: number }[], onClose: () => void, onDone: () => void })`.

- [ ] **Step 1: Hook.** Em `usePurchaseList.load`, depois de filtrar `active`, `const vinculados = await comprasRepository.vinculadoPorPedido(active.map(o => o.id))` e passe como 4º argumento. Leitura que falha aqui **não** zera a lista: trate como `new Map()` e guarde um aviso `avisoVinculo = 'Não consegui ler as compras já lançadas: a lista mostra tudo como falta.'`, exposto pelo hook.
- [ ] **Step 2: Painel.**
  - Colunas da tabela: Insumo · Previsto · Já comprado (`vinculado`) · **Falta** (`to_buy`, em rosa quando > 0) · Em estoque (`in_stock`, só quando > 0) · Pedidos (números de `pedidos`, ex.: "PED-051 (3 kg) · PED-052 (1 kg)"). Números por `numero()` com a unidade.
  - Linha com `in_stock > 0` e `to_buy > 0` ganha o botão "Usar do estoque" (abre `UsarDoEstoqueModal` com `pedidos` da linha).
  - Botão principal do topo: **"Lançar compra"** (abre `LancarCompraModal` com as linhas que faltam como itens iniciais).
  - Abaixo da tabela, seção **"Compras desta semana"**: `comprasDoPeriodo(segunda, domingo)` da semana atual; cada compra num `CARTAO` com fornecedor, data, total (`reais(soma quantidade × custo)`), e os itens agrupados por insumo com o destino de cada parte ("PED-051 · 6 kg", "Estoque · 2 kg"). `MenuMais` com "Excluir compra" → `ConfirmDialog` → `excluirCompra`; erro do banco aparece no aviso da tela (é a recusa explicada).
  - Tire: `ReceberCompraModal`, o estado `recebendo`, e textos de "falta de estoque".
  - O PDF continua com `generatePurchaseListPDF(result.lines, ...)` (o PDF já usa `to_buy`).
- [ ] **Step 3: `LancarCompraModal`** (portal, `z-modal`, `useEscFecha`, cabeçalho e rodapé fixos):
  - Cabeçalho: Fornecedor (`SearchableSelect` dos `suppliers` com opção de texto livre — se o select do projeto não aceitar texto livre, use o select + um campo "ou digite o nome"), Data (`input type="date"`, hoje), Notas.
  - Itens: cada item tem Insumo (`SearchableSelect` de insumos), Quantidade (texto, `parseBRL`), Custo unitário (texto, `parseBRL`, sugerido pelo `average_unit_cost`). Ao definir insumo e quantidade, as **partes** são preenchidas por `sugerirDivisao(qtd, linha.pedidos.map(p => ({ pedidoId: p.order_id, falta: p.falta })))` (pedidos da linha da Lista para esse insumo; insumo fora da lista = tudo para o estoque). Cada parte: seletor de destino (pedidos ativos + "Estoque") e quantidade editável; "+ parte" e lixeira (h-8 w-8, 16px). Aviso em vermelho quando a soma das partes ≠ quantidade, e "Lançar" desabilitado.
  - Rodapé: "Total R$ X" e "Lançar compra" → `lancarCompra(cabeçalho, partes achatadas como itens)`; sucesso fecha e chama `onDone` (recarrega lista e compras); erro fica na janela.
- [ ] **Step 4: `UsarDoEstoqueModal`**: pedido (seletor, já com o primeiro de `pedidos`), quantidade (texto, `parseBRL`, sugerida = `min(falta, current_stock)`), "Em estoque: X". "Usar" → `usarDoEstoque` → `onDone`. Erro do banco na janela.
- [ ] **Step 5:** `grep -rn "ReceberCompraModal\|fabrica/recebimento" src` vazio; apagar os três arquivos.
- [ ] **Step 6:** Testes, `tsc`, build limpos.
- [ ] **Step 7: Commit**

```bash
git add -A src/hooks/pcp/usePurchaseList.ts src/components/pcp/ src/utils/fabrica/
git commit -m "feat(compras): Lista de compras mostra o que falta, lança a compra dividida e usa o estoque à mão"
```

---

### Task 5: Quadro — sem baixa nem trava; sobra apurada na entrega

**Files:**
- Modify: `src/hooks/pcp/usePcpKanban.ts`
- Modify: `src/components/pcp/KanbanPanel.tsx`
- Modify: `src/repositories/productionRepository.ts` (tira `getShortages`, `baixarEstoqueDaProducao`, `nomesDosInsumos` se nada mais usar; `registrarPrevistoDoCorte` continua)
- Delete (se nada mais usar, conferido com `grep`): `src/components/modals/StockShortageModal.tsx`, `src/components/modals/FichaTecnicaMissingModal.tsx`

**Interfaces:**
- Consumes: `comprasRepository.vinculadoAoPedido`, `comprasRepository.apurarSobras`, `previstoDoPedido`, `calcularSobras`, `storageService.getProductInsumosByProducts`, `storageService.getInsumos`.
- Produces: `avisoDaEntrega: string | null` no hook (substitui `avisoDaBaixa`), `limparAvisoDaEntrega()`, `tentarApurarDeNovo(): Promise<void>`.

- [ ] **Step 1: Mover sem travas.** Em `moveTo`: remova o bloco de `getShortages`/`setShortages`/`setPendingMove`, a chamada `baixarEstoque` e o `catch` de `FICHA_TECNICA_MISSING`. Mantenha, ao sair do 1º setor, o previsto do corte: `const plano = await productionRepository.planejarBaixaDoPedido(order); await productionRepository.registrarPrevistoDoCorte(order.id, sectorName, plano)` dentro de `try/catch` próprio com `console.warn` (falhar não segura o movimento, como hoje). Remova `forceMove`, `cancelShortage`, `shortages`, `pendingMove`, `fichaMissing` e `baixarEstoque` do hook e do retorno.
- [ ] **Step 2: Apurar na entrega.** Crie no hook:

```ts
const apurarSobras = useCallback(async (order: Order): Promise<string> => {
    const [vinculado, fichas, insumos] = await Promise.all([
        comprasRepository.vinculadoAoPedido(order.id),
        storageService.getProductInsumosByProducts([...new Set((order.items || []).map(i => i.product_id).filter(Boolean))]),
        storageService.getInsumos(),
    ]);
    const bom = new Map([...fichas.entries()].map(([pid, l]) => [pid, l.map(b => ({ insumo_id: b.insumo_id, quantity: Number(b.quantity) }))]));
    const ins = new Map(insumos.map(i => [i.id, { id: i.id, name: i.name, unit: i.unit, current_stock: Number(i.current_stock) || 0, average_unit_cost: 0, category: i.category }]));
    const previsto = previstoDoPedido({ id: order.id, order_number: order.order_number, deadline: order.deadline,
        items: (order.items || []).map(i => ({ product_id: i.product_id, quantity: Number(i.quantity) || 0, fabric_insumo_id: i.fabric_insumo_id })) }, bom, ins);
    const sobras = calcularSobras(vinculado, previsto);
    const r = await comprasRepository.apurarSobras(order.id, sobras);
    if (r === null) return 'Entregue. A sobra não foi para o estoque: o banco ainda não tem compras por pedido.';
    if (r.jaFeita || sobras.length === 0) return '';
    const nomes = sobras.map(s => `${ins.get(s.insumo_id)?.name ?? 'insumo'} ${numero(s.quantidade)} ${ins.get(s.insumo_id)?.unit ?? ''}`.trim());
    return `Sobrou para o estoque: ${nomes.slice(0, 2).join(' · ')}${nomes.length > 2 ? ` +${nomes.length - 2}` : ''}.`;
}, []);
```

  Em `confirmDelivery`, depois de `await commitMove(order, null)` e do `setPasso(...)`: `try { setAvisoDaEntrega((await apurarSobras(order)) || null); } catch (e) { setPedidoParaApurar(order); setAvisoDaEntrega(\`Entregue, mas a sobra não foi para o estoque: ${e instanceof Error ? e.message : 'erro'}.\`); }`. `tentarApurarDeNovo` repete `apurarSobras(pedidoParaApurar)` (a função é idempotente) e limpa o estado em sucesso. `numero` vem de `@/utils/numeros`.
- [ ] **Step 3: Painel.** Em `KanbanPanel.tsx`, troque o bloco que mostra `kb.avisoDaBaixa` por `kb.avisoDaEntrega` (mesmo visual), com botão "Tentar de novo" quando houver `pedidoParaApurar`; tire `StockShortageModal` e `FichaTecnicaMissingModal` e seus estados. **Modo fábrica (`semValores`)**: o aviso de sobra só fala de quantidades — pode aparecer.
- [ ] **Step 4:** `grep` para cada função/arquivo removido; apagar o que ficou sem uso (`StockShortageModal.tsx`, `FichaTecnicaMissingModal.tsx`, métodos do repositório). Atualize `src/utils/sobreposicoes.test.ts` se algum removido estiver citado.
- [ ] **Step 5:** Testes, `tsc`, build limpos.
- [ ] **Step 6: Commit**

```bash
git add -A src/hooks/pcp/usePcpKanban.ts src/components/pcp/KanbanPanel.tsx src/repositories/productionRepository.ts src/components/modals/ src/utils/sobreposicoes.test.ts
git commit -m "feat(quadro): sem baixa nem trava de falta; a sobra do pedido vai ao estoque na entrega"
```

---

### Task 6: Estoque — ajustar contagem e usar num pedido

**Files:**
- Modify: `src/pages/Inventory.tsx`
- Create: `src/components/modals/AjustarContagemModal.tsx`
- Modify: `src/components/inventory/InsumoDetalhe.tsx` (origem de cada movimento no histórico)
- Delete (se nada mais usar): `src/components/modals/InsumoMovementModal.tsx`

**Interfaces:**
- Consumes: `comprasRepository.ajustarContagem`, `UsarDoEstoqueModal` (Task 4), `OrigemDoMovimento`.

- [ ] **Step 1:** Na linha do insumo (`Inventory.tsx` ~552), troque os botões "Entrada"/"Saída" por um botão "Ajustar contagem" (ícone `Scale` ou `ClipboardCheck`, 18px, `${BOTAO_SECUNDARIO} w-10 px-0`, `aria-label={\`Ajustar contagem de ${item.name}\`}`) e acrescente ao `MenuMais` da linha o item "Usar num pedido" (abre `UsarDoEstoqueModal` com os pedidos ativos, sem `falta`).
- [ ] **Step 2: `AjustarContagemModal`** (portal, `z-modal`, `useEscFecha`): "Saldo no sistema: X un"; campo "Saldo contado" (texto, `parseBRL`); mostra "Vai lançar +Y" / "Vai lançar −Y"; se o insumo não tem custo médio (`average_unit_cost <= 0`) e a diferença é positiva, aparece o campo "Custo unitário" obrigatório. "Ajustar" → `ajustarContagem` → fecha e recarrega.
- [ ] **Step 3: Histórico.** Em `InsumoDetalhe.tsx`, cada movimento mostra a origem por um rótulo: `compra` "Compra", `estorno_compra` "Compra excluída", `sobra` "Sobra do pedido", `uso_estoque` "Usado no pedido", `devolucao` "Pedido excluído", `ajuste` "Ajuste de contagem", `manual` e vazio "Lançamento antigo".
- [ ] **Step 4:** `grep -rn InsumoMovementModal src` — se só `Inventory.tsx` usava, apague o arquivo e tire da `sobreposicoes` se citado.
- [ ] **Step 5:** Testes, `tsc`, build limpos.
- [ ] **Step 6: Commit**

```bash
git add -A src/pages/Inventory.tsx src/components/modals/ src/components/inventory/InsumoDetalhe.tsx src/utils/sobreposicoes.test.ts
git commit -m "feat(estoque): ajustar contagem e usar num pedido no lugar de entrada e saída"
```

---

### Task 7: Sai o Consumo não apurado; Início pede o que falta comprar

**Files:**
- Modify: `src/pages/PCP.tsx`, `src/utils/pcpAbas.ts`, `src/App.tsx` (case `'consumo'`), `src/utils/navegacao.ts` (view `'consumo'`)
- Modify: `src/hooks/inicio/useFilaDoInicio.ts`, `src/utils/inicio/fila.ts`, `src/utils/inicio/fila.test.ts`
- Modify: `src/repositories/productionRepository.ts` (tira `getConsumoNaoApurado`, `resolverConsumoNaoApurado`, `ConsumoNaoApuradoRow`)
- Delete: `src/components/pcp/ConsumoNaoApuradoPanel.tsx`
- Modify: `docs/superpowers/plans/2026-10-14-ida-para-producao.md` (item 4 da seção 3 vira `compras_por_pedido.sql`)
- Modify: `docs/superpowers/specs/2026-10-08-roteiro-v3-design.md` (linha do S7 "Compras por pedido", Pronto)

**Interfaces:**
- Consumes: `computePurchaseList` (Task 2), `comprasRepository.vinculadoPorPedido` (Task 3).
- Produces: em `fila.ts`, o campo `consumoNaoApurado` sai da entrada; entra `faltaComprarNaSemana: number`; a linha vira `{ objetivo: 'planejar', acao: 'Comprar', quantidade: e.faltaComprarNaSemana, urgente: false, texto: \`Comprar ${s(n, 'insumo', 'insumos')} para os pedidos desta semana\`, destino: { view: 'purchases' } }` (use o id de view que a Lista de compras já tem em `navegacao.ts`). A linha "Comprar N insumos abaixo do mínimo" sai (o estoque agora é só sobra; mínimo não pede compra).

- [ ] **Step 1: Teste em `fila.test.ts`** (antes de mexer): troque o caso de consumo não apurado por:

```ts
test('pede compra pelo que falta para os pedidos da semana, não pelo mínimo do estoque', () => {
    const linhas = montarFila({ ...base, faltaComprarNaSemana: 3 });
    const l = linhas.find(x => x.acao === 'Comprar');
    assert.equal(l?.texto, 'Comprar 3 insumos para os pedidos desta semana');
    assert.equal(linhas.some(x => /abaixo do mínimo|consumo não apurado/i.test(x.texto)), false);
});
```

  (`base` e `montarFila` são os que o arquivo já usa; ajuste o nome se for outro.)
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar em `fila.ts`. Em `useFilaDoInicio.ts`: tire `getConsumoNaoApurado` do `Promise.all`; calcule `faltaComprarNaSemana` com os dados que o hook já carrega (`pedidos`, `insumos`, `ficha` — confira o formato de `ficha` e converta para `Map<string, PLBomLine[]>`) mais `comprasRepository.vinculadoPorPedido` dos pedidos ativos com prazo nesta semana (segunda a domingo, `getTodayStr` local): `computePurchaseList(...).lines.filter(l => l.is_shortage).length`. Falha ao ler o vínculo = linha some (nunca afirmar falta que não sabe).
- [ ] **Step 4:** Tirar a aba e a view: `'nao-apurado'` de `PcpTab` e do `PCP.tsx`; `'consumo'` de `navegacao.ts` (lista de views do objetivo "producao") e do `App.tsx`; apagar `ConsumoNaoApuradoPanel.tsx`; tirar os métodos do repositório. `grep -rn "nao-apurado\|'consumo'\|ConsumoNaoApurado" src` vazio.
- [ ] **Step 5:** Docs: no plano de produção, a linha 4 da tabela da seção 3 passa a ser `compras_por_pedido.sql` — "compras por pedido, sobra na entrega, ajuste de contagem; escreve dados: não (só estrutura e funções)"; e o estado sai de "em espera". No roteiro, acrescente S7 "Compras por pedido" como Pronto com o intervalo de commits.
- [ ] **Step 6:** Suíte, `tsc`, build limpos.
- [ ] **Step 7: Commit**

```bash
git add -A src/ docs/superpowers/plans/2026-10-14-ida-para-producao.md docs/superpowers/specs/2026-10-08-roteiro-v3-design.md
git commit -m "feat(compras): sai o consumo não apurado; o Início pede o que falta comprar na semana"
```

---

## Depois das tarefas (controlador)

1. Rodar `supabase/compras_por_pedido.sql` e o teste num contêiner descartável com o dump de produção mais recente (duas vezes o SQL; o teste tem de terminar em "TODOS OS CASOS PASSARAM").
2. Pedir ao Luiz para rodar o SQL no banco local da v3 (comando `docker cp` + `psql -1` de sempre).
3. Navegador no banco local, com dados ENSAIO: pedido ENSAIO novo; compra dividida entre ele e o estoque; mover pelo Quadro (estoque não mexe); entregar (sobra entra, aviso certo); modo fábrica sem valores; Estoque com ajuste; 1440 e 390.
4. Comparação antes/depois para o Luiz.

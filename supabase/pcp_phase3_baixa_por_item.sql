-- =============================================================================
-- PCP — Fase 3: baixa parcial POR ITEM do pedido
-- Run no SQL Editor do Supabase. Requer pcp_phase1c_production_logs.sql.
--
-- Antes: a baixa era só quantidade por pedido — respondia "faltam 40 peças",
-- não "de quê". Numa entrega parcial isso não basta: do mesmo pedido saem
-- algumas polos azul claro, poucas azul escuro e nenhuma calça.
--
-- `item_key` identifica a linha do pedido. Os itens vivem em JSON dentro do
-- pedido, sem id próprio, então a identidade é produto|COR|TAMANHO — o que
-- distingue uma linha da outra na prática. Índice seria mais simples e mais
-- errado: bastaria reordenar os itens para as baixas passadas apontarem para a
-- peça errada, e o log é IMUTÁVEL, então o erro seria permanente.
--
-- Compatível com o que já existe: item_key é NULL nas baixas antigas. Elas
-- continuam contando no saldo do pedido, apenas sem se atribuir a uma linha.
-- =============================================================================

-- TUDO OU NADA. DDL no Postgres é transacional, e entre o DROP e o CREATE da
-- função existe um instante sem `log_production` — se algo falhar ali no meio,
-- sem a transação você ficaria SEM a função e as baixas parariam até rodar de
-- novo. Com BEGIN/COMMIT, qualquer erro desfaz tudo e o banco continua como
-- estava. (O NOTIFY no fim só dispara no commit, que é o comportamento certo.)
BEGIN;

ALTER TABLE public.production_logs
  ADD COLUMN IF NOT EXISTS item_key text;

COMMENT ON COLUMN public.production_logs.item_key IS
  'Identidade da linha do pedido: product_id|COR|TAMANHO (caixa alta). NULL nas baixas anteriores à Fase 3.';

CREATE INDEX IF NOT EXISTS idx_prod_logs_item
  ON public.production_logs(order_id, item_key);

-- ---------------------------------------------------------------------------
-- RPC: mesma função, com o item opcional no fim.
--
-- O parâmetro entra por ÚLTIMO e com DEFAULT para nenhuma chamada existente
-- quebrar — quem ainda lança sem item continua funcionando igual.
--
-- O DROP da versão antiga vem ANTES do CREATE, e a ordem importa: no Postgres
-- a função é identificada por nome + tipos dos argumentos, então criar a de 8
-- parâmetros NÃO substitui a de 7 — as duas passariam a coexistir. Com duas
-- candidatas do mesmo nome, o PostgREST recusa a chamada por nome
-- ("function is not unique") e TODA baixa para de funcionar. Dropando antes,
-- se algo falhar no meio o script para sem deixar esse estado ambíguo.
--
-- Assinatura conferida contra pcp_phase1c_production_logs.sql (linha 47).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.log_production(uuid, numeric, uuid, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.log_production(
  p_order_id      uuid,
  p_qty_done      numeric,
  p_sector_id     uuid    DEFAULT NULL,
  p_size          text    DEFAULT NULL,
  p_operation     text    DEFAULT NULL,
  p_qty_expedited numeric DEFAULT 0,
  p_notes         text    DEFAULT NULL,
  p_item_key      text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN
    RAISE EXCEPTION 'Sem permissão para lançar produção';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;
  IF COALESCE(p_qty_done, 0) < 0 OR COALESCE(p_qty_expedited, 0) < 0 THEN
    RAISE EXCEPTION 'Quantidades não podem ser negativas';
  END IF;
  IF COALESCE(p_qty_done, 0) = 0 AND COALESCE(p_qty_expedited, 0) = 0 THEN
    RAISE EXCEPTION 'Informe uma quantidade produzida ou expedida';
  END IF;

  INSERT INTO public.production_logs
    (id, user_id, order_id, sector_id, size, operation, qty_done, qty_expedited, notes, item_key)
  VALUES
    (v_id, auth.uid(), p_order_id, p_sector_id, p_size, p_operation,
     COALESCE(p_qty_done, 0), COALESCE(p_qty_expedited, 0), p_notes,
     NULLIF(btrim(COALESCE(p_item_key, '')), ''));

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_production(uuid, numeric, uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_production(uuid, numeric, uuid, text, text, numeric, text, text) TO authenticated;

-- O PostgREST guarda o schema em cache. Sem recarregar, ele continua enxergando
-- a assinatura antiga e responde "Could not find the function ... in the schema
-- cache" quando o app mandar p_item_key. O Supabase costuma recarregar sozinho
-- após DDL, mas não na hora — este NOTIFY força e custa nada.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Verificação (rode depois, no mesmo editor):
--
-- 1. A coluna existe?
--    SELECT item_key, qty_done FROM production_logs ORDER BY logged_at DESC LIMIT 10;
--
-- 2. As baixas antigas continuam somando (nenhuma peça sumiu do saldo)?
--    SELECT order_id, SUM(qty_done) FROM production_logs GROUP BY order_id;
--
-- 3. Restou UMA só função com este nome? Tem que voltar exatamente 1 linha —
--    se voltar 2, o PostgREST recusa a chamada por nome e a baixa quebra.
--    SELECT oid::regprocedure FROM pg_proc WHERE proname = 'log_production';
-- =============================================================================

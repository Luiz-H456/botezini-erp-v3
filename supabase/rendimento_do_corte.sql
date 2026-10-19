-- =============================================================================
-- RENDIMENTO DO CORTE  (2.0 — bloco E2)
-- Rodar no SQL Editor do Supabase. Independente de baixa_automatica_de_producao
-- .sql — as duas podem ser rodadas em qualquer ordem.
--
-- POR QUE ESTE NÚMERO
-- Tecido é a maior fatia do custo da peça, e melhorar o encaixe é a alavanca
-- mais direta que existe sobre a margem. Hoje ninguém sabe dizer se ele está
-- melhorando, piorando ou parado — o dado não é guardado em lugar nenhum.
--
-- A razão gasto ÷ previsto é o que responde isso, e é o que decide se vale
-- investir em software de encaixe: 1,02 diz que não há muito a ganhar; 1,25 diz
-- que há um quarto do maior custo da peça indo para o chão.
--
-- O PREVISTO É GRAVADO SOZINHO, O GASTO É INFORMADO
-- Quando o pedido sai do primeiro setor, o sistema já sabe quanto a ficha
-- previu — grava na hora. O gasto real só quem esteve no enfesto sabe, e entra
-- depois, pela aba de Rendimento do Corte. Uma linha sem gasto é uma pergunta
-- em aberto, não um zero.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rendimento_do_corte (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  insumo_id     uuid NOT NULL REFERENCES public.insumos(id) ON DELETE CASCADE,
  -- Nome copiado na gravação: o cadastro pode ser renomeado ou mesclado, e o
  -- histórico de rendimento precisa continuar legível depois disso.
  insumo_name   text,
  -- Tecido comprado em quilo é contado em quilo. Chamar tudo de "metro" seria
  -- errado de um jeito que ninguém perceberia.
  unidade       text,
  stage         text,
  previsto      numeric(15,4) NOT NULL,
  gasto         numeric(15,4),
  observacao    text,
  informado_em  timestamptz,
  informado_por uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rendimento_previsto_positivo CHECK (previsto > 0),
  CONSTRAINT rendimento_gasto_nao_negativo CHECK (gasto IS NULL OR gasto >= 0),
  -- Um registro por tecido por pedido. Reprocessar o mesmo pedido não duplica
  -- a pergunta nem apaga a resposta já dada.
  CONSTRAINT rendimento_unico UNIQUE (order_id, insumo_id)
);

CREATE INDEX IF NOT EXISTS idx_rendimento_order
  ON public.rendimento_do_corte(order_id);
-- O índice parcial serve à tela que mais importa: a fila do que falta informar.
CREATE INDEX IF NOT EXISTS idx_rendimento_pendente
  ON public.rendimento_do_corte(created_at DESC) WHERE gasto IS NULL;

-- ---------------------------------------------------------------------------
-- RLS — chão de fábrica informa o gasto, porque é ele quem corta
-- ---------------------------------------------------------------------------
ALTER TABLE public.rendimento_do_corte ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='rendimento_do_corte' AND policyname='rendimento_todos') THEN
    CREATE POLICY rendimento_todos ON public.rendimento_do_corte
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager() OR public.is_factory())
      WITH CHECK (public.is_admin_or_manager() OR public.is_factory());
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.rendimento_do_corte TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. Gravar o previsto, ao entrar em produção
--
--   p_previstos  [{"insumo_id": uuid, "insumo_name": text,
--                  "unidade": text, "previsto": numeric}]
--
-- ON CONFLICT DO NOTHING é a regra inteira: o previsto de um pedido é o que a
-- ficha dizia NA HORA do corte. Reescrevê-lo depois, com a ficha já corrigida,
-- faria todo corte antigo parecer perfeito — e o histórico de rendimento
-- passaria a medir o quanto a ficha foi ajustada, não o quanto o corte melhorou.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_previsto_do_corte(
  p_order_id  uuid,
  p_stage     text,
  p_previstos jsonb DEFAULT '[]'::jsonb
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_linha jsonb;
  v_qtd   numeric;
  v_novos int := 0;
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN
    RAISE EXCEPTION 'Sem permissão para registrar rendimento de corte';
  END IF;

  IF p_order_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  FOR v_linha IN SELECT * FROM jsonb_array_elements(COALESCE(p_previstos, '[]'::jsonb))
  LOOP
    v_qtd := COALESCE((v_linha->>'previsto')::numeric, 0);
    CONTINUE WHEN v_qtd <= 0;

    INSERT INTO public.rendimento_do_corte
      (order_id, insumo_id, insumo_name, unidade, stage, previsto)
    VALUES (
      p_order_id,
      (v_linha->>'insumo_id')::uuid,
      v_linha->>'insumo_name',
      COALESCE(NULLIF(v_linha->>'unidade', ''), 'un'),
      p_stage,
      v_qtd)
    ON CONFLICT (order_id, insumo_id) DO NOTHING;

    IF FOUND THEN v_novos := v_novos + 1; END IF;
  END LOOP;

  RETURN v_novos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_previsto_do_corte(uuid, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Informar o gasto real
--
-- Aceita correção: quem digitou 40 no lugar de 4 precisa poder consertar. O que
-- não se aceita é apagar — passar NULL não limpa, porque uma linha que volta a
-- "não informada" some da conta e ninguém entende por que o número mudou.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.informar_gasto_do_corte(
  p_id         uuid,
  p_gasto      numeric,
  p_observacao text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF p_gasto IS NULL OR p_gasto <= 0 THEN
    RAISE EXCEPTION 'Informe quanto foi gasto de fato (maior que zero)';
  END IF;

  UPDATE public.rendimento_do_corte
     SET gasto         = p_gasto,
         observacao    = COALESCE(NULLIF(btrim(p_observacao), ''), observacao),
         informado_em  = now(),
         informado_por = auth.uid()
   WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de rendimento não encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.informar_gasto_do_corte(uuid, numeric, text) TO authenticated;

-- =============================================================================
-- Para ver o rendimento da casa direto no SQL:
--
--   SELECT insumo_name,
--          SUM(previsto)             AS previsto,
--          SUM(gasto)                AS gasto,
--          ROUND(SUM(gasto) / NULLIF(SUM(previsto), 0), 3) AS razao,
--          COUNT(*)                  AS cortes
--     FROM public.rendimento_do_corte
--    WHERE gasto IS NOT NULL
--    GROUP BY insumo_name
--    ORDER BY SUM(gasto) - SUM(previsto) DESC;
--
-- A razão é ponderada pelo volume de propósito: a média simples das razões
-- deixaria um corte de dois metros pesar igual a um de trezentos.
-- =============================================================================

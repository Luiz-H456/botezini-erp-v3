-- =============================================================================
-- BAIXA AUTOMÁTICA DE ESTOQUE NA PRODUÇÃO  (2.0 — bloco E1)
-- Rodar no SQL Editor do Supabase. Requer pcp_phase1_capacity_sectors.sql e
-- patch_insumo_movements.sql (o trigger que mexe em current_stock).
-- No banco local da v3 o Studio não é dono das tabelas: rodar com docker cp +
-- psql como supabase_admin (ver docs da v3). Pode rodar de novo sem estrago.
--
-- O QUE MUDA
-- O sistema sempre soube a ficha técnica e a quantidade, e até conferia a falta
-- antes de deixar o pedido avançar. O que nunca fez foi DESCONTAR. Ao sair do
-- primeiro setor, agora desconta.
--
-- O QUE NÃO MUDA
-- Boa parte dos produtos não tem ficha, e o saldo de estoque é uma opinião.
-- Nada aqui conserta isso. O que muda é que cada peça NÃO apurada passa a ter
-- linha, nome e motivo — o estoque continua errado, mas agora está escrito
-- onde.
--
-- DUAS REGRAS QUE ATRAVESSAM O ARQUIVO
--   1. Mover o cartão no kanban NUNCA falha por causa de estoque. Falta de
--      saldo vira pendência, não exceção. O app não pode discutir com o chão
--      de fábrica sobre um número que ele mesmo sabe que está defasado.
--   2. Ou grava tudo, ou não grava nada. Uma função, uma transação.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. De onde veio cada movimento
--
-- Sem isto não há como distinguir a saída que o sistema gerou da que alguém
-- lançou à mão — e sem essa distinção nenhum estorno é possível, porque não se
-- sabe o que estornar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.insumo_movements
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.insumo_movements
  ADD COLUMN IF NOT EXISTS stage text;

COMMENT ON COLUMN public.insumo_movements.source IS
  'manual = lançado por alguém na tela de Estoque. producao = gerado pela baixa automática ao avançar o pedido.';

CREATE INDEX IF NOT EXISTS idx_insumo_movements_source
  ON public.insumo_movements(source) WHERE source <> 'manual';

-- ---------------------------------------------------------------------------
-- 2. O livro de "este pedido já baixou"
--
-- É o que torna a operação idempotente. Arrastar o cartão de volta e para a
-- frente de novo é gesto comum no kanban; sem esta trava, cada ida tiraria o
-- material outra vez e o estoque afundaria sozinho.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.producao_baixas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage       text NOT NULL,
  user_id     uuid,
  pecas_apuradas     numeric(12,2) NOT NULL DEFAULT 0,
  pecas_nao_apuradas numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producao_baixas_unica UNIQUE (order_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_producao_baixas_order
  ON public.producao_baixas(order_id);

-- Uma baixa por PEDIDO, não por etapa. A baixa acontece ao sair do primeiro
-- setor, e o destino varia: 1º → Costura, volta ao 1º, 1º → Estampa seriam
-- duas etapas diferentes e, só com a trava (order_id, stage), duas baixas do
-- mesmo material. (Revisão de 14/10/2026.)
CREATE UNIQUE INDEX IF NOT EXISTS producao_baixas_um_por_pedido
  ON public.producao_baixas(order_id);

-- ---------------------------------------------------------------------------
-- 3. Consumo não apurado
--
-- A lista do que saiu da fábrica sem o sistema saber o que foi consumido.
-- Existe para ser olhada e encolher: cada linha aqui é uma ficha técnica que
-- falta, um produto fora do cadastro ou um saldo que não batia.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consumo_nao_apurado (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage        text NOT NULL,
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text,
  -- Preenchido só quando o motivo é falta de saldo: aí a pendência é de um
  -- insumo específico, e não do produto inteiro.
  insumo_id    uuid REFERENCES public.insumos(id) ON DELETE SET NULL,
  insumo_name  text,
  pecas        numeric(12,2) NOT NULL DEFAULT 0,
  quantidade   numeric(15,4),
  motivo       text NOT NULL,
  resolvido_em timestamptz,
  user_id      uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nao_apurado_order
  ON public.consumo_nao_apurado(order_id);
CREATE INDEX IF NOT EXISTS idx_nao_apurado_aberto
  ON public.consumo_nao_apurado(created_at DESC) WHERE resolvido_em IS NULL;

-- ---------------------------------------------------------------------------
-- 4. RLS — gestão e fábrica LEEM; quem grava são as duas RPCs abaixo
--
-- As RPCs são SECURITY DEFINER e passam por cima da RLS. Por isso a política
-- direta é só de leitura: com FOR ALL, qualquer login de fábrica podia apagar
-- a trava de "já baixou" (e o próximo movimento baixaria de novo) ou marcar
-- pendência como resolvida sem passar pelo resolver_ (que é só de gestor).
-- O GRANT sozinho não segura: no Supabase a tabela nova já nasce com tudo
-- liberado para authenticated. (Revisão de 14/10/2026, testado.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.producao_baixas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumo_nao_apurado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producao_baixas_todos ON public.producao_baixas;
DROP POLICY IF EXISTS nao_apurado_todos     ON public.consumo_nao_apurado;
DROP POLICY IF EXISTS producao_baixas_leitura ON public.producao_baixas;
DROP POLICY IF EXISTS nao_apurado_leitura     ON public.consumo_nao_apurado;

CREATE POLICY producao_baixas_leitura ON public.producao_baixas
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR public.is_factory());

CREATE POLICY nao_apurado_leitura ON public.consumo_nao_apurado
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager() OR public.is_factory());

GRANT SELECT ON public.producao_baixas     TO authenticated;
GRANT SELECT ON public.consumo_nao_apurado TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. A RPC
--
-- O QUE ENTRA
--   p_baixas       [{"insumo_id": uuid, "quantidade": numeric}]
--   p_nao_apurado  [{"product_id": uuid|null, "product_name": text,
--                    "pecas": numeric, "motivo": text}]
--
-- A conta de quanto sai é feita no cliente (utils/baixaDeProducao.ts, testada)
-- e chega pronta. Refazê-la aqui criaria uma segunda versão da mesma regra, e
-- as duas divergiriam na primeira mudança de ficha técnica.
--
-- O QUE SAI
--   {"ja_feita": bool, "movimentos": int, "sem_saldo": int, "pendencias": int}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.baixar_estoque_da_producao(
  p_order_id     uuid,
  p_stage        text,
  p_baixas       jsonb DEFAULT '[]'::jsonb,
  p_nao_apurado  jsonb DEFAULT '[]'::jsonb,
  p_pecas_apuradas     numeric DEFAULT 0,
  p_pecas_nao_apuradas numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_linha       jsonb;
  v_insumo      record;
  v_qtd         numeric;
  v_movimentos  int := 0;
  v_sem_saldo   int := 0;
  v_pendencias  int := 0;
  v_uid         uuid := auth.uid();
BEGIN
  IF NOT (public.is_admin_or_manager() OR public.is_factory()) THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque de produção';
  END IF;

  IF p_order_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  IF p_stage IS NULL OR btrim(p_stage) = '' THEN
    RAISE EXCEPTION 'Etapa não informada';
  END IF;

  -- A trava de idempotência é a PRIMEIRA coisa a acontecer, e é o próprio
  -- índice único que decide — não um SELECT antes do INSERT, que deixaria a
  -- janela aberta para duas abas baixando o mesmo pedido ao mesmo tempo.
  INSERT INTO public.producao_baixas (order_id, stage, user_id,
                                      pecas_apuradas, pecas_nao_apuradas)
  VALUES (p_order_id, p_stage, v_uid,
          COALESCE(p_pecas_apuradas, 0), COALESCE(p_pecas_nao_apuradas, 0))
  ON CONFLICT DO NOTHING;   -- qualquer das duas travas únicas

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ja_feita', true, 'movimentos', 0,
                              'sem_saldo', 0, 'pendencias', 0);
  END IF;

  -- ── As saídas ───────────────────────────────────────────────────────────
  FOR v_linha IN SELECT * FROM jsonb_array_elements(COALESCE(p_baixas, '[]'::jsonb))
  LOOP
    v_qtd := COALESCE((v_linha->>'quantidade')::numeric, 0);
    CONTINUE WHEN v_qtd <= 0;

    SELECT id, name, current_stock INTO v_insumo
      FROM public.insumos
     WHERE id = (v_linha->>'insumo_id')::uuid
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Insumo apagado depois de entrar na ficha. Não é erro de quem está
      -- movendo o cartão, e não pode derrubar a transação inteira.
      INSERT INTO public.consumo_nao_apurado
        (order_id, stage, insumo_id, insumo_name, quantidade, motivo, user_id)
      VALUES (p_order_id, p_stage, (v_linha->>'insumo_id')::uuid, NULL,
              v_qtd, 'insumo-inexistente', v_uid);
      v_pendencias := v_pendencias + 1;
      CONTINUE;
    END IF;

    -- Saldo insuficiente NÃO é exceção. O trigger de insumo_movements aborta
    -- nesse caso, e um abort aqui impediria o pedido de avançar por causa de um
    -- saldo que todo mundo sabe que está defasado. Vira pendência.
    IF v_insumo.current_stock < v_qtd THEN
      INSERT INTO public.consumo_nao_apurado
        (order_id, stage, insumo_id, insumo_name, quantidade, motivo, user_id)
      VALUES (p_order_id, p_stage, v_insumo.id, v_insumo.name,
              v_qtd, 'sem-saldo', v_uid);
      v_sem_saldo := v_sem_saldo + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.insumo_movements
      (insumo_id, type, quantity, reference_id, notes, source, stage, user_id)
    VALUES (v_insumo.id, 'OUT', v_qtd, p_order_id,
            'Baixa automática de produção', 'producao', p_stage, v_uid);
    v_movimentos := v_movimentos + 1;
  END LOOP;

  -- ── As pendências vindas do cliente (sem ficha, fora do cadastro) ───────
  FOR v_linha IN SELECT * FROM jsonb_array_elements(COALESCE(p_nao_apurado, '[]'::jsonb))
  LOOP
    INSERT INTO public.consumo_nao_apurado
      (order_id, stage, product_id, product_name, pecas, motivo, user_id)
    VALUES (
      p_order_id, p_stage,
      NULLIF(v_linha->>'product_id', '')::uuid,
      v_linha->>'product_name',
      COALESCE((v_linha->>'pecas')::numeric, 0),
      COALESCE(NULLIF(v_linha->>'motivo', ''), 'desconhecido'),
      v_uid);
    v_pendencias := v_pendencias + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ja_feita',   false,
    'movimentos', v_movimentos,
    'sem_saldo',  v_sem_saldo,
    'pendencias', v_pendencias);
END;
$$;

GRANT EXECUTE ON FUNCTION public.baixar_estoque_da_producao(uuid, text, jsonb, jsonb, numeric, numeric)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Marcar uma pendência como resolvida
--
-- Não apaga: a linha vira histórico de "isto aconteceu e foi tratado". Apagar
-- faria a lista parecer que o problema nunca existiu, e é justamente a
-- frequência dele que diz se a ficha técnica está sendo preenchida.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_consumo_nao_apurado(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.consumo_nao_apurado
     SET resolvido_em = now()
   WHERE id = p_id AND resolvido_em IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_consumo_nao_apurado(uuid) TO authenticated;

-- =============================================================================
-- NÃO INCLUÍDO, DE PROPÓSITO: estorno da baixa
--
-- Desfazer exigiria uma entrada compensatória, e toda entrada recalcula o custo
-- médio ponderado do insumo. Devolver 15 m de malha ao custo de hoje muda o
-- custo médio de um saldo que nunca saiu de lá — o estoque volta certo e o
-- custo fica errado, que é o pior dos dois mundos.
--
-- Enquanto o desfazer não for pensado por inteiro, o caminho é lançar a entrada
-- manualmente na tela de Estoque, onde quem lança escolhe o custo. Os
-- movimentos automáticos são reconhecíveis por source = 'producao'.
--
-- Para ver o que a baixa automática já tirou de um pedido:
--   SELECT * FROM public.insumo_movements
--    WHERE source = 'producao' AND reference_id = '<order_id>';
-- =============================================================================

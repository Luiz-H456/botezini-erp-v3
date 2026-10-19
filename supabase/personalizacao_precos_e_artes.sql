-- =============================================================================
-- PERSONALIZAÇÃO — tabela de preços, artes de bordado, histórico e notas
-- Run no SQL Editor do Supabase. Puramente aditivo: quatro tabelas novas,
-- nada existente é alterado.
--
-- O problema que resolve: hoje o valor do bordado e da estampa é decidido de
-- cabeça a cada orçamento. Duas peças iguais saem por preços diferentes
-- dependendo do dia, e não há como saber depois quanto se costuma cobrar.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. TABELA DE PREÇOS — a referência que você consulta ao orçar
--
-- Linhas livres, mantidas por você. Não é regra de cálculo: é a lista de
-- "quanto eu cobro por isso", para parar de arbitrar valor.
--
-- `faixa_min`/`faixa_max` permitem preço por volume (até 50 peças um valor,
-- acima outro) sem criar uma linha por quantidade. Ambos NULL = vale sempre.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalizacao_precos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  tecnica     text NOT NULL CHECK (tecnica IN ('bordado', 'dtf', 'silk', 'sublimacao')),
  descricao   text NOT NULL,
  unidade     text NOT NULL DEFAULT 'peça',
  valor       numeric(15,2) NOT NULL DEFAULT 0,
  faixa_min   integer,
  faixa_max   integer,
  observacao  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personalizacao_precos_faixa CHECK (
    faixa_min IS NULL OR faixa_max IS NULL OR faixa_max >= faixa_min
  )
);

-- ---------------------------------------------------------------------------
-- 2. ARTES DE BORDADO — cadastro próprio
--
-- Cadastro próprio, e não um campo dentro do pedido, porque o mesmo logo serve
-- vários pedidos do mesmo cliente ao longo de anos. Guardado uma vez, os
-- pontos, as cores e o tempo não precisam ser redigitados nem redescobertos.
--
-- `cliente_id` é opcional: existe arte genérica (um símbolo, uma bandeira) que
-- não pertence a ninguém.
--
-- `local_do_arquivo` é TEXTO LIVRE de propósito — pode ser um caminho de rede,
-- uma gaveta física, um pendrive, um link. Amarrar num formato só deixaria de
-- fora metade dos casos reais.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artes_bordado (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid,
  nome              text NOT NULL,
  cliente_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  pontos            integer,
  cores_linha       text,            -- livre: "Branco, Azul Marinho, Dourado"
  tempo_minutos     integer,
  local_do_arquivo  text,
  largura_mm        integer,
  altura_mm         integer,
  observacoes       text,
  feita_em          date,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artes_bordado_pontos_pos CHECK (pontos IS NULL OR pontos >= 0)
);

CREATE INDEX IF NOT EXISTS idx_artes_bordado_cliente ON public.artes_bordado(cliente_id);

-- ---------------------------------------------------------------------------
-- 3. HISTÓRICO — o que foi realmente cobrado
--
-- Separado da tabela de preços porque são coisas diferentes: a tabela é o que
-- você PRETENDE cobrar, o histórico é o que COBROU. A distância entre os dois
-- é a informação útil — se você tabela R$ 12 e cobra R$ 9 há seis meses, a
-- tabela está errada.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalizacao_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  tecnica       text NOT NULL CHECK (tecnica IN ('bordado', 'dtf', 'silk', 'sublimacao')),
  descricao     text NOT NULL,
  arte_id       uuid REFERENCES public.artes_bordado(id) ON DELETE SET NULL,
  cliente_id    uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  quantidade    numeric(12,2) NOT NULL DEFAULT 0,
  valor_unitario numeric(15,2) NOT NULL DEFAULT 0,
  data          date NOT NULL DEFAULT CURRENT_DATE,
  observacao    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perso_hist_tecnica ON public.personalizacao_historico(tecnica, data DESC);

-- ---------------------------------------------------------------------------
-- 4. NOTAS POR TÉCNICA — uma por técnica, texto livre
--
-- Onde ficam "preço por mil pontos", "valor da arte", "metro do DTF" e o que
-- mais você quiser anotar. Texto livre porque cada técnica tem suas próprias
-- variáveis, e engessar num formulário fixo garantiria que faltasse um campo.
--
-- `preco_por_mil_pontos` é a exceção que ganha coluna própria: é o único número
-- que o sistema usa para SUGERIR preço de bordado. Sugerir, não impor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalizacao_notas (
  tecnica              text PRIMARY KEY CHECK (tecnica IN ('bordado', 'dtf', 'silk', 'sublimacao')),
  user_id              uuid,
  notas                text,
  preco_por_mil_pontos numeric(15,2),
  valor_minimo         numeric(15,2),
  valor_da_arte        numeric(15,2),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS — mesma regra do resto do cadastro
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['personalizacao_precos','artes_bordado','personalizacao_historico','personalizacao_notas']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        t || '_all', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Sugestão de partida (opcional) — as quatro técnicas com notas em branco:
--
--   INSERT INTO public.personalizacao_notas (tecnica) VALUES
--     ('bordado'), ('dtf'), ('silk'), ('sublimacao')
--   ON CONFLICT (tecnica) DO NOTHING;
-- =============================================================================

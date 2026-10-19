-- =============================================================================
-- Quadro de notas — ligações entre notas, setas e caneta de desenho
--
-- Continuação do phase12_quadro_notas.sql. Mesmo escopo: pessoal, RLS por
-- auth.uid() = user_id.
--
-- DUAS TABELAS, propositalmente separadas:
--
-- board_connections — uma LIGAÇÃO ANCORADA entre duas notas (tipo linha de
-- fluxograma). Guarda só os DOIS IDs, nunca coordenadas: a posição da linha é
-- recalculada no app a partir da posição ATUAL de cada nota, então a ligação
-- acompanha sozinha quando qualquer uma das notas é arrastada. Cai junto se
-- uma nota é apagada (ON DELETE CASCADE).
--
-- board_drawings — traço LIVRE (caneta ou seta avulsa), sem relação com
-- nenhuma nota. Guarda os pontos do traço em si (coordenadas fixas no
-- canvas); não se move quando uma nota se move por perto.
--
-- Rode DEPOIS do phase12_quadro_notas.sql (board_connections referencia
-- board_notes).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.board_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_note_id  uuid NOT NULL REFERENCES public.board_notes(id) ON DELETE CASCADE,
  to_note_id    uuid NOT NULL REFERENCES public.board_notes(id) ON DELETE CASCADE,
  color         text NOT NULL DEFAULT 'zinc',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_connections_nao_liga_consigo CHECK (from_note_id <> to_note_id)
);

COMMENT ON TABLE public.board_connections IS
  'Ligação (linha/seta) entre duas notas do quadro. Sem coordenadas próprias — a posição é recalculada no app a partir da posição atual das notas.';

CREATE INDEX IF NOT EXISTS idx_board_connections_user ON public.board_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_board_connections_from  ON public.board_connections(from_note_id);
CREATE INDEX IF NOT EXISTS idx_board_connections_to    ON public.board_connections(to_note_id);

-- Evita duas ligações idênticas (A→B duas vezes) — não trava A→B e B→A, que
-- são visualmente diferentes (a seta aponta para o outro lado).
CREATE UNIQUE INDEX IF NOT EXISTS ux_board_connections_par
  ON public.board_connections(user_id, from_note_id, to_note_id);


CREATE TABLE IF NOT EXISTS public.board_drawings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  points        jsonb NOT NULL,
  color         text NOT NULL DEFAULT 'zinc',
  stroke_width  numeric NOT NULL DEFAULT 2.5,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.board_drawings IS
  'Traço livre no quadro: caneta (muitos pontos) ou seta avulsa (2 pontos). Coordenadas fixas no canvas, sem relação com notas.';

ALTER TABLE public.board_drawings DROP CONSTRAINT IF EXISTS board_drawings_kind_valido;
ALTER TABLE public.board_drawings ADD CONSTRAINT board_drawings_kind_valido
  CHECK (kind IN ('pen', 'arrow'));

ALTER TABLE public.board_drawings DROP CONSTRAINT IF EXISTS board_drawings_color_valida;
ALTER TABLE public.board_drawings ADD CONSTRAINT board_drawings_color_valida
  CHECK (color IN ('amber', 'emerald', 'sky', 'rose', 'violet', 'zinc'));

-- Uma seta é sempre 2 pontos; a caneta precisa de pelo menos 2 para desenhar
-- alguma coisa (1 ponto seria um clique sem arrastar, nada a mostrar).
ALTER TABLE public.board_drawings DROP CONSTRAINT IF EXISTS board_drawings_pontos_validos;
ALTER TABLE public.board_drawings ADD CONSTRAINT board_drawings_pontos_validos
  CHECK (
    jsonb_typeof(points) = 'array'
    AND (
      (kind = 'arrow' AND jsonb_array_length(points) = 2)
      OR (kind = 'pen' AND jsonb_array_length(points) >= 2)
    )
  );

CREATE INDEX IF NOT EXISTS idx_board_drawings_user ON public.board_drawings(user_id);

ALTER TABLE public.board_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_drawings    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_connections_owner_all ON public.board_connections;
CREATE POLICY board_connections_owner_all ON public.board_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS board_drawings_owner_all ON public.board_drawings;
CREATE POLICY board_drawings_owner_all ON public.board_drawings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.board_connections FROM PUBLIC, anon;
REVOKE ALL ON public.board_drawings    FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_drawings    TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM board_connections;
--   SELECT * FROM board_drawings;
--   -- as duas só devolvem o que pertence ao usuário logado nesta sessão
-- =============================================================================

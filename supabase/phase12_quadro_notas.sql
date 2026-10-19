-- =============================================================================
-- Quadro de notas — mural pessoal de ideias, lembretes e anotações
--
-- PESSOAL, não da equipe: cada usuário só vê e mexe nas PRÓPRIAS notas. Por
-- isso a política de RLS aqui NÃO é a single_tenant_admin_manager_all usada no
-- resto do sistema (que dá acesso total a admin/manager) — é auth.uid() =
-- user_id, sem exceção nem para admin. É bloco de notas pessoal, não mural
-- compartilhado.
--
-- Layout livre: cada nota guarda posição (pos_x, pos_y) e tamanho (width,
-- height) em pixels, mais z_index para resolver sobreposição ao trazer para
-- frente. O conteúdo em si não tem limite — content é text, sem tamanho
-- máximo nem estrutura imposta (nada de checklist obrigatório, título
-- obrigatório etc.) — é o usuário quem decide o que anotar e como.
--
-- Rode no banco onde o app roda.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.board_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT 'amber',
  pos_x       numeric NOT NULL DEFAULT 40,
  pos_y       numeric NOT NULL DEFAULT 40,
  width       numeric NOT NULL DEFAULT 240,
  height      numeric NOT NULL DEFAULT 220,
  z_index     integer NOT NULL DEFAULT 1,
  is_done     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.board_notes IS
  'Quadro de notas pessoal (ideias, lembretes). RLS por auth.uid() — cada usuário só acessa as próprias, mesmo admin não vê a dos outros.';

CREATE INDEX IF NOT EXISTS idx_board_notes_user ON public.board_notes(user_id);

-- Trava de formato: cor precisa ser uma das da paleta do app, não texto livre
-- (o app envia sempre um nome fixo; travar aqui pega bug do cliente cedo).
ALTER TABLE public.board_notes DROP CONSTRAINT IF EXISTS board_notes_color_valida;
ALTER TABLE public.board_notes ADD CONSTRAINT board_notes_color_valida
  CHECK (color IN ('amber', 'emerald', 'sky', 'rose', 'violet', 'zinc'));

ALTER TABLE public.board_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_notes_owner_all ON public.board_notes;
CREATE POLICY board_notes_owner_all ON public.board_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reaproveita o trigger de updated_at já usado no resto do schema (definido em
-- schema_botezini.sql) em vez de criar uma função duplicada só para esta tabela.
DROP TRIGGER IF EXISTS trg_board_notes_updated_at ON public.board_notes;
CREATE TRIGGER trg_board_notes_updated_at
  BEFORE UPDATE ON public.board_notes
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

REVOKE ALL ON public.board_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_notes TO authenticated;

-- =============================================================================
-- Verificação:
--   SELECT * FROM board_notes;
--   -- devolve só as notas do usuário logado nesta sessão, mesmo que seja admin
-- =============================================================================

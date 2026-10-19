-- =============================================================================
-- Perfil do usuário: nome próprio e foto
--
-- O QUE FALTAVA
-- `profiles` já tinha `full_name`, mas nunca foi preenchido — a barra lateral
-- caía no rótulo do cargo e todo mundo aparecia como "Administrador". Um nome
-- que não é o da pessoa é pior que nenhum: ocupa o lugar da informação sem
-- trazê-la. Foto não existia.
--
-- Este script:
--   1. acrescenta `avatar_url` (o caminho no bucket, nunca a URL assinada —
--      ela expira em 1 h e guardá-la deixaria o avatar quebrado no dia
--      seguinte, mesma regra das fotos de orçamento);
--   2. permite que cada pessoa edite o PRÓPRIO nome e foto, e só o próprio.
--
-- O cargo (`role`) fica de fora de propósito: quem pode mudar o próprio cargo
-- pode se promover a admin, e a política abaixo bloqueia isso explicitamente.
--
-- Seguro de rodar mais de uma vez. Rode no SQL Editor do Supabase.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
  'Caminho da foto no bucket financial-attachments. Não guardar URL assinada: expira.';

-- ── Cada um edita o próprio perfil ──────────────────────────────────────────
--
-- A checagem de role aparece nas DUAS cláusulas de propósito: USING filtra a
-- linha que pode ser alterada, WITH CHECK valida a linha DEPOIS da alteração.
-- Sem o WITH CHECK, um update poderia passar pelo filtro e ainda assim gravar
-- um cargo novo — a trava só existe de verdade quando cobre os dois lados.
DROP POLICY IF EXISTS "perfil proprio: ler" ON public.profiles;
CREATE POLICY "perfil proprio: ler"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "perfil proprio: editar" ON public.profiles;
CREATE POLICY "perfil proprio: editar"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- O cargo não se altera por aqui. Promoção é decisão de outra pessoa.
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Até rodar isto, o app continua funcionando: o repositório detecta a coluna
-- ausente, salva o perfil SEM a foto e avisa no console apontando para este
-- arquivo. O nome já grava, porque `full_name` sempre existiu.
--
-- VERIFICAÇÃO
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('full_name', 'avatar_url');
--
-- Devem voltar as duas linhas.
-- =============================================================================

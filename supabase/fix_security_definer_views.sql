-- =============================================================================
-- Fix: Security Definer View — public.transactions e public.payable_accounts
--
-- É o follow-up que ficou anotado em fix_security_audit_2026_07.sql (linhas
-- 101-103), agora confirmado pelo linter do Supabase.
--
-- O QUE ESTÁ ERRADO
-- Uma view sem `security_invoker` roda com as permissões e as políticas de RLS
-- de QUEM CRIOU a view (normalmente o postgres/owner), não de quem consulta.
-- Resultado: a view contorna o RLS das tabelas-base. Qualquer usuário
-- autenticado que tenha SELECT na view enxerga tudo o que o dono enxergaria —
-- inclusive linhas que o RLS deveria esconder dele.
--
-- No seu caso as duas views leem tabelas financeiras, então o furo expõe
-- lançamento e conta a pagar para papéis que não deveriam ver (ex.: factory).
--
-- A CORREÇÃO
-- `security_invoker = on` (Postgres 15+, que é o que o Supabase roda) faz a
-- view avaliar permissões e RLS na conta de QUEM CONSULTA. O RLS das tabelas
-- por baixo volta a valer. Não muda o resultado para admin/manager.
--
-- ALTER VIEW não reescreve a definição — é seguro e reversível.
-- =============================================================================

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['transactions', 'payable_accounts'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
      RAISE NOTICE 'view public.% agora usa security_invoker', v;
    ELSE
      RAISE NOTICE 'public.% nao existe como view — nada a fazer', v;
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- Verificação — as duas devem listar security_invoker=true:
--   SELECT c.relname, c.reloptions
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='v'
--     AND c.relname IN ('transactions','payable_accounts','obligation_summary');
--
-- DEPOIS DE APLICAR, TESTE: entre com um usuário de papel `factory` e confira
-- que ele não lê mais essas views. Se alguma tela do app quebrar para
-- admin/manager, o problema é RLS faltando na tabela-base, não nesta mudança.
-- =============================================================================

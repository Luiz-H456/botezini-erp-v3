-- =============================================================================
-- CONFERIR O ACESSO NO BANCO NOVO (SOMENTE LEITURA)
-- O navegador fala direto com o PostgREST usando a chave anonima; quem protege os dados e
-- a RLS. Aqui se assume cada papel dentro de uma transacao so-leitura (SET LOCAL ROLE) e se
-- conta o que ele enxerga. Nada e gravado.
--   anonimo (sem login)        -> nao pode ver nada de negocio
--   login sem perfil            -> nao pode ver nada de negocio
--   admin (perfil de verdade)   -> ve tudo, inclusive o financeiro
-- =============================================================================
SET search_path TO public, pg_catalog;

DO $$
DECLARE
  v_admin uuid;
  v_papel text;
  v_tabela text;
  v_n bigint;
  v_resultado text;
  v_tabelas text[] := ARRAY['orders', 'budgets', 'clients', 'financial_obligations', 'obligation_payments', 'bank_accounts', 'insumos'];
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY created_at NULLS LAST LIMIT 1;
  IF v_admin IS NULL THEN RAISE NOTICE 'ATENCAO: nenhum perfil admin no banco'; END IF;

  FOREACH v_papel IN ARRAY ARRAY['anon', 'sem_perfil', 'admin'] LOOP
    v_resultado := '';
    FOREACH v_tabela IN ARRAY v_tabelas LOOP
      BEGIN
        IF v_papel = 'anon' THEN
          SET LOCAL ROLE anon;
          PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
        ELSIF v_papel = 'sem_perfil' THEN
          SET LOCAL ROLE authenticated;
          PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000dead"}', true);
        ELSE
          SET LOCAL ROLE authenticated;
          PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
        END IF;
        EXECUTE format('SELECT count(*) FROM public.%I', v_tabela) INTO v_n;
        v_resultado := v_resultado || format(' %s=%s', v_tabela, v_n);
      EXCEPTION WHEN insufficient_privilege THEN
        v_resultado := v_resultado || format(' %s=NEGADO', v_tabela);
      END;
      RESET ROLE;
    END LOOP;
    RAISE NOTICE 'ACESSO % ->%', rpad(v_papel, 10), v_resultado;
  END LOOP;
END $$;

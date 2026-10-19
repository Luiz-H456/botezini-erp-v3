-- =============================================================================
-- RESGATE — PASSO 1: o que existe agora e o que dá para recuperar
--
-- SOMENTE LEITURA nas tabelas do sistema. Cria só tabelas TEMPORÁRIAS, que
-- morrem ao fechar a sessão.
--
-- Rode inteiro, de uma vez, no banco de PRODUÇÃO.
--
-- Procura backup em QUALQUER tabela public._bkp_* que tenha coluna id — os
-- scripts de limpeza gravam com nomes diferentes (_bkp_clients na migração,
-- _bkp_clients_dup na deduplicação), e um deles pode salvar o dia.
--
-- SQL dinâmico de propósito: o Postgres resolve nomes de tabela ao PLANEJAR,
-- então citar uma tabela que não existe quebra o script inteiro, mesmo dentro
-- de um IF que nunca seria executado.
-- =============================================================================

DROP TABLE IF EXISTS _diag;
CREATE TEMP TABLE _diag (secao text, item text, valor text);

DO $$
DECLARE
  v_clientes int; v_pedidos int; v_orcamentos int;
  v_citados int; v_orfaos int; v_contas int := 0;
  r record; n int; cobre int; achou boolean := false;
BEGIN
  SELECT count(*) INTO v_clientes   FROM public.clients;
  SELECT count(*) INTO v_pedidos    FROM public.orders;
  SELECT count(*) INTO v_orcamentos FROM public.budgets;

  CREATE TEMP TABLE _citados AS
    SELECT DISTINCT client_id FROM public.orders  WHERE client_id IS NOT NULL
    UNION
    SELECT DISTINCT client_id FROM public.budgets WHERE client_id IS NOT NULL;
  SELECT count(*) INTO v_citados FROM _citados;

  CREATE TEMP TABLE _orfaos AS
    SELECT t.client_id FROM _citados t
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE c.id IS NULL;
  SELECT count(*) INTO v_orfaos FROM _orfaos;

  INSERT INTO _diag VALUES
    ('1. AGORA', 'clientes na tabela', v_clientes::text),
    ('1. AGORA', 'pedidos',            v_pedidos::text),
    ('1. AGORA', 'orcamentos',         v_orcamentos::text),
    ('2. VINCULOS', 'ids de cliente citados por pedidos/orcamentos', v_citados::text),
    ('2. VINCULOS', 'desses, quantos NAO existem mais em clients',   v_orfaos::text);

  -- Varre TODAS as tabelas _bkp_* que tenham id, e mede quanto cada uma cobre
  -- dos vínculos quebrados.
  FOR r IN
    SELECT c.relname AS tabela
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '\_bkp\_%'
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0)
    ORDER BY c.relname
  LOOP
    achou := true;
    EXECUTE format('SELECT count(*) FROM public.%I', r.tabela) INTO n;
    BEGIN
      EXECUTE format(
        'SELECT count(*) FROM public.%I b WHERE b.id::text IN (SELECT client_id::text FROM _orfaos)',
        r.tabela) INTO cobre;
    EXCEPTION WHEN others THEN
      cobre := -1;   -- tipo incompatível: não é backup de clientes
    END;
    INSERT INTO _diag VALUES
      ('3. BACKUPS ENCONTRADOS', r.tabela,
       n::text || ' linhas · cobre ' ||
       CASE WHEN cobre < 0 THEN 'n/a' ELSE cobre::text END || ' orfao(s)');
  END LOOP;

  IF NOT achou THEN
    INSERT INTO _diag VALUES ('3. BACKUPS ENCONTRADOS', '(nenhuma tabela _bkp_*)', '-');
  END IF;

  -- Rastro em outras tabelas: o financeiro guarda client_id e costuma ter o
  -- nome do cliente na descrição, o que permite reconstruir sem backup.
  IF to_regclass('public.financial_obligations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.financial_obligations
             WHERE client_id::text IN (SELECT client_id::text FROM _orfaos)' INTO v_contas;
  END IF;
  INSERT INTO _diag VALUES
    ('4. RASTRO', 'contas financeiras ligadas a clientes sumidos', v_contas::text);

  INSERT INTO _diag VALUES
    ('5. VEREDITO',
     CASE
       WHEN v_clientes > 0 AND v_orfaos = 0
         THEN 'Banco integro — o problema esta na LEITURA do app (RLS/sessao)'
       WHEN achou
         THEN 'Ha tabela(s) _bkp_* — veja acima qual cobre os orfaos e use o RESGATE_2'
       ELSE 'Sem backup local — usar o backup do Supabase (RESGATE_3)'
     END,
     v_orfaos::text || ' vinculo(s) quebrado(s)');
END $$;

SELECT * FROM _diag ORDER BY 1, 2;

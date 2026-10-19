-- =============================================================================
-- RESGATE — PASSO 2: restaurar os clientes a partir de uma tabela _bkp_*
--
-- SÓ RODE DEPOIS DO RESGATE_1, e escolha abaixo a tabela que ele indicou como
-- a que "cobre" os órfãos.
--
-- O que faz: reinsere em public.clients as linhas do backup que sumiram.
-- O que NÃO faz: não apaga nada, não altera cliente que já existe, não toca em
-- pedidos, orçamentos nem contas.
--
-- Seguro rodar duas vezes: só insere quem falta.
-- =============================================================================

DO $$
DECLARE
  -- <<<<<< TROQUE pelo nome que o RESGATE_1 mostrou
  v_backup text := '_bkp_clients_dup';

  v_antes int; v_depois int; v_orfaos int;
BEGIN
  IF to_regclass('public.' || quote_ident(v_backup)) IS NULL THEN
    RAISE EXCEPTION 'Tabela public.% nao existe neste banco. Confira o nome no RESGATE_1.', v_backup;
  END IF;

  SELECT count(*) INTO v_antes FROM public.clients;

  -- Colunas em comum entre o backup e a tabela atual, resolvidas do catálogo:
  -- se o backup tiver colunas a mais ou a menos, a inserção continua válida.
  EXECUTE format(
    'INSERT INTO public.clients (%1$s)
     SELECT %1$s FROM public.%2$I b
     WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = b.id)',
    (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
       FROM pg_attribute a
      WHERE a.attrelid = 'public.clients'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
        AND EXISTS (SELECT 1 FROM pg_attribute b2
                    WHERE b2.attrelid = ('public.' || quote_ident(v_backup))::regclass
                      AND b2.attname = a.attname AND b2.attnum > 0 AND NOT b2.attisdropped)),
    v_backup);

  SELECT count(*) INTO v_depois FROM public.clients;

  SELECT count(*) INTO v_orfaos
  FROM public.orders o
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE o.client_id IS NOT NULL AND c.id IS NULL;

  RAISE NOTICE 'clientes antes: % | depois: % | restaurados: % | pedidos ainda orfaos: %',
               v_antes, v_depois, v_depois - v_antes, v_orfaos;
END $$;

-- Conferência (é o resultado que aparece na tela):
SELECT
  (SELECT count(*) FROM public.clients) AS clientes_agora,
  (SELECT count(*) FROM public.orders o
    LEFT JOIN public.clients c ON c.id = o.client_id
    WHERE o.client_id IS NOT NULL AND c.id IS NULL) AS pedidos_ainda_orfaos,
  (SELECT count(*) FROM public.budgets b
    LEFT JOIN public.clients c ON c.id = b.client_id
    WHERE b.client_id IS NOT NULL AND c.id IS NULL) AS orcamentos_ainda_orfaos;

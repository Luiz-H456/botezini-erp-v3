-- =============================================================================
-- RESGATE — PASSO 3: trazer os clientes do backup de volta para a produção
--
-- CONTEXTO
-- Os clientes foram apagados da produção e NÃO existe _bkp_clients lá. A
-- recuperação vem do backup do Supabase. Mas restaurar por cima da produção
-- desfaria tudo que foi criado depois do backup — pedidos e orçamentos que
-- estão intactos. Por isso o caminho é:
--
--   1. No painel do Supabase: Database > Backups > restaurar para um PROJETO
--      NOVO (nunca "restore" no projeto de produção).
--   2. Rodar ESTE script no projeto RESTAURADO. Ele devolve UMA célula de texto
--      com os INSERTs de todos os clientes.
--   3. Copiar essa célula e colar no SQL Editor da PRODUÇÃO.
--
-- O script gerado tem ON CONFLICT DO NOTHING: reinsere só quem falta, não
-- sobrescreve cliente que já existe e pode rodar duas vezes sem estragar nada.
--
-- Este arquivo é SOMENTE LEITURA — roda no backup, não escreve nada.
-- =============================================================================

SELECT
  'BEGIN;' || chr(10) || chr(10) ||
  string_agg(
    'INSERT INTO public.clients (' || cols || ') VALUES (' || vals || ') ON CONFLICT (id) DO NOTHING;',
    chr(10) ORDER BY ord
  ) || chr(10) || chr(10) || 'COMMIT;' AS script_para_colar_na_producao
FROM (
  SELECT
    row_number() OVER (ORDER BY c.created_at NULLS LAST, c.id) AS ord,
    -- Colunas resolvidas do catálogo: se o backup tiver colunas a mais ou a
    -- menos que a produção, o INSERT continua válido porque é nominal.
    (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
       FROM pg_attribute a
      WHERE a.attrelid = 'public.clients'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) AS cols,
    (SELECT string_agg(
        CASE WHEN j.value IS NULL THEN 'NULL'
             ELSE quote_literal(j.value) || '::' || format_type(a.atttypid, a.atttypmod)
        END, ', ' ORDER BY a.attnum)
       FROM pg_attribute a
       LEFT JOIN LATERAL (
         SELECT to_jsonb(c) ->> a.attname AS value
       ) j ON true
      WHERE a.attrelid = 'public.clients'::regclass
        AND a.attnum > 0 AND NOT a.attisdropped) AS vals
  FROM public.clients c
) t;

-- =============================================================================
-- Conferência depois de colar na produção:
--
--   SELECT count(*) FROM clients;
--
--   -- deve voltar 0:
--   SELECT count(*) FROM orders o
--   LEFT JOIN clients c ON c.id = o.client_id
--   WHERE o.client_id IS NOT NULL AND c.id IS NULL;
-- =============================================================================

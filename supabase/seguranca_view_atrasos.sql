-- =============================================================================
-- SEGURANÇA: view order_delay_current com as regras de acesso de quem consulta
--
-- Alerta do Supabase (Security Definer View). A view foi criada sem security_invoker
-- (supabase/pcp_phase2_atrasos.sql): ela lê order_delays com os poderes do DONO e passa
-- por cima da RLS da tabela, que só deixa admin/gerente ler. Com o primeiro atraso
-- registrado, qualquer um com a chave pública (anon) ou um usuário da fábrica leria
-- motivo e dias de atraso pela API. O app não usa esta view: nenhuma tela muda.
--
-- Conserto: security_invoker = on (como obligation_summary e as outras views) e o anônimo
-- sem permissão nenhuma nela. Pode rodar de novo: o resultado é o mesmo.
-- =============================================================================

-- ANTES (somente leitura)
SELECT 'antes' AS momento, coalesce(array_to_string(c.reloptions, ','), '(sem opções)') AS opcoes,
       has_table_privilege('anon', 'public.order_delay_current', 'SELECT') AS anon_le
  FROM pg_class c WHERE c.oid = 'public.order_delay_current'::regclass;

ALTER VIEW public.order_delay_current SET (security_invoker = on);
REVOKE ALL ON public.order_delay_current FROM anon;

-- DEPOIS (somente leitura)
SELECT 'depois' AS momento, coalesce(array_to_string(c.reloptions, ','), '(sem opções)') AS opcoes,
       has_table_privilege('anon', 'public.order_delay_current', 'SELECT') AS anon_le
  FROM pg_class c WHERE c.oid = 'public.order_delay_current'::regclass;

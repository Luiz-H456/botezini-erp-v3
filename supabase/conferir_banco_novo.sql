-- =============================================================================
-- CONFERIR O BANCO NOVO (SOMENTE LEITURA)
-- Duas partes: (A) "impressao digital" da estrutura - roda igual no banco local da v3
-- e no novo; se um hash difere, aquela parte da estrutura nao e a mesma;
-- (B) dados que a limpeza garante (nenhum salario em dobro, estoque so de tecidos...).
-- (rls_auto_enable() e do Supabase na nuvem - gatilho ensure_rls - e fica de fora.)
-- Nada aqui escreve: pode rodar quantas vezes quiser.
-- =============================================================================
-- Mesmo search_path nos dois bancos: na nuvem a sessao enxerga o schema auth e omitiria o prefixo.
SET search_path TO public, pg_catalog;

SELECT 'A' AS parte, 'tabelas public' AS item, count(*)::text AS valor FROM pg_tables WHERE schemaname = 'public'
UNION ALL SELECT 'A', 'tabelas com RLS ligado', count(*)::text FROM pg_tables WHERE schemaname = 'public' AND rowsecurity
UNION ALL SELECT 'A', 'hash colunas', md5(coalesce(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(regexp_replace(column_default, 'nextval\([^)]*\)', 'nextval', 'g'), ''), '|' ORDER BY table_name, column_name), ''))
  FROM information_schema.columns WHERE table_schema = 'public'
UNION ALL SELECT 'A', 'hash indices', md5(coalesce(string_agg(indexdef, '|' ORDER BY indexname), '')) FROM pg_indexes WHERE schemaname = 'public'
UNION ALL SELECT 'A', 'hash constraints', md5(coalesce(string_agg(conrelid::regclass || '.' || conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conrelid::regclass::text, conname), ''))
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace
UNION ALL SELECT 'A', 'hash policies RLS', md5(coalesce(string_agg(tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname), ''))
  FROM pg_policies WHERE schemaname = 'public'
UNION ALL SELECT 'A', 'hash triggers', md5(coalesce(string_agg(c.relname || '.' || t.tgname || ':' || t.tgenabled::text, '|' ORDER BY c.relname, t.tgname), ''))
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace, 'auth'::regnamespace)
UNION ALL SELECT 'A', 'funcoes public (sem extensao)', count(*)::text
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'rls_auto_enable' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
UNION ALL SELECT 'A', 'hash funcoes', md5(coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || p.prosecdef || ':' || md5(p.prosrc), '|' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)), ''))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'rls_auto_enable' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
UNION ALL SELECT 'A', 'hash views', md5(coalesce(string_agg(viewname || ':' || md5(definition), '|' ORDER BY viewname), '')) FROM pg_views WHERE schemaname = 'public'
UNION ALL SELECT 'A', 'views SEM security_invoker (deve ser -)', coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '-')
  FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
   AND NOT coalesce(c.reloptions::text, '') ~ 'security_invoker=(on|true|1|yes)'
UNION ALL SELECT 'A', 'hash permissoes (anon, authenticated, service_role)', md5(coalesce(string_agg(grantee || '.' || table_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, privilege_type), ''))
  FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
UNION ALL SELECT 'A', 'hash permissoes de coluna', md5(coalesce(string_agg(grantee || '.' || table_name || '.' || column_name || ':' || privilege_type, '|' ORDER BY grantee, table_name, column_name, privilege_type), ''))
  FROM information_schema.column_privileges WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
UNION ALL SELECT 'A', 'extensoes', string_agg(extname, ',' ORDER BY extname) FROM pg_extension WHERE extname IN ('pg_trgm', 'uuid-ossp', 'pgcrypto', 'pg_stat_statements')
UNION ALL SELECT 'A', 'gatilho de novo usuario em auth.users', count(*)::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace = 'auth'::regnamespace AND c.relname = 'users'
UNION ALL SELECT 'A', 'bucket de anexos', coalesce(string_agg(id, ','), '-') FROM storage.buckets
UNION ALL SELECT 'A', 'politicas do storage', count(*)::text FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
-- B: dados
UNION ALL SELECT 'B', 'pedidos / orcamentos / clientes', (SELECT count(*) FROM public.orders) || ' / ' || (SELECT count(*) FROM public.budgets) || ' / ' || (SELECT count(*) FROM public.clients)
UNION ALL SELECT 'B', 'insumos (nao tecido)', (SELECT count(*) FROM public.insumos) || ' (' || (SELECT count(*) FROM public.insumos WHERE coalesce(category, '') <> 'Tecidos') || ')'
UNION ALL SELECT 'B', 'itens de pedido apontando para tecido inexistente', count(*)::text
  FROM public.orders o, jsonb_array_elements(o.items) e WHERE coalesce(e->>'fabric_insumo_id', '') <> '' AND NOT EXISTS (SELECT 1 FROM public.insumos i WHERE i.id::text = e->>'fabric_insumo_id')
UNION ALL SELECT 'B', 'pedidos marcados legado', count(*)::text FROM public.orders WHERE compras_legado
UNION ALL SELECT 'B', 'contas financeiras / pagamentos', (SELECT count(*) FROM public.financial_obligations) || ' / ' || (SELECT count(*) FROM public.obligation_payments)
UNION ALL SELECT 'B', 'salarios em dobro (pessoa+mes)', count(*)::text FROM (SELECT 1 FROM public.financial_obligations WHERE cancelled_at IS NULL AND description ~ '^Sal[^ ]+ (integral|meio) ' GROUP BY regexp_replace(description, '\s*\(\d+/\d+\)$', ''), date_trunc('month', due_date) HAVING count(*) > 1) d
UNION ALL SELECT 'B', 'pagamento de R$ 209.254 ativo', count(*)::text FROM public.obligation_payments WHERE amount = 209254 AND reversed_at IS NULL AND reversal_of IS NULL
UNION ALL SELECT 'B', 'status gravado diferente do calculado', count(*)::text FROM public.financial_obligations f JOIN public.obligation_summary s ON s.id = f.id WHERE f.status IS DISTINCT FROM s.derived_status
UNION ALL SELECT 'B', 'saldo gravado x recalculado (diferenca maxima)', coalesce(max(abs(b.current_balance - (b.initial_balance + coalesce((SELECT sum(CASE WHEN fo.type = 'receivable' THEN op.amount ELSE -op.amount END) FROM public.obligation_payments op JOIN public.financial_obligations fo ON fo.id = op.obligation_id WHERE op.account_id = b.id AND op.reversed_at IS NULL AND op.reversal_of IS NULL AND op.affects_balance), 0)))), 0)::text FROM public.bank_accounts b
UNION ALL SELECT 'B', 'categorias financeiras (pai / filho)', (SELECT count(*) FROM public.global_categories WHERE domain = 'finance' AND parent_id IS NULL) || ' / ' || (SELECT count(*) FROM public.global_categories WHERE domain = 'finance' AND parent_id IS NOT NULL)
UNION ALL SELECT 'B', 'logins / perfis', (SELECT count(*) FROM auth.users) || ' / ' || (SELECT count(*) FROM public.profiles)
UNION ALL SELECT 'B', 'contas de teste da v3 (deve ser 0 na nuvem)', count(*)::text FROM auth.users WHERE email LIKE '%@botezini.local'
ORDER BY 1, 2;

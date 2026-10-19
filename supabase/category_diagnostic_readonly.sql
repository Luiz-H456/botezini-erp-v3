with category_text as (
  select * from (
    select 'financial_obligations' as source, category as value, count(*)::int as total
    from public.financial_obligations
    where nullif(trim(category), '') is not null
    group by category
    union all
    select 'clients', category, count(*)::int
    from public.clients
    where nullif(trim(category), '') is not null
    group by category
    union all
    select 'suppliers', category, count(*)::int
    from public.suppliers
    where nullif(trim(category), '') is not null
    group by category
    union all
    select 'suppliers.default_sub_category', default_sub_category, count(*)::int
    from public.suppliers
    where nullif(trim(default_sub_category), '') is not null
    group by default_sub_category
    union all
    select 'products', category, count(*)::int
    from public.products
    where nullif(trim(category), '') is not null
    group by category
    union all
    select 'insumos', category, count(*)::int
    from public.insumos
    where nullif(trim(category), '') is not null
    group by category
    union all
    select 'budget_lines', category, count(*)::int
    from public.budget_lines
    where nullif(trim(category), '') is not null
    group by category
  ) x
),
coverage as (
  select * from (
    select 'financial_obligations' source, count(*)::int total,
      count(*) filter (where global_category_id is not null)::int with_global,
      count(*) filter (where global_category_id is null)::int without_global,
      count(*) filter (where nullif(trim(category), '') is not null)::int with_text
    from public.financial_obligations
    union all
    select 'clients', count(*)::int,
      count(*) filter (where global_category_id is not null)::int,
      count(*) filter (where global_category_id is null)::int,
      count(*) filter (where nullif(trim(category), '') is not null)::int
    from public.clients
    union all
    select 'suppliers', count(*)::int,
      count(*) filter (where global_category_id is not null)::int,
      count(*) filter (where global_category_id is null)::int,
      count(*) filter (where nullif(trim(category), '') is not null)::int
    from public.suppliers
    union all
    select 'products', count(*)::int,
      count(*) filter (where global_category_id is not null)::int,
      count(*) filter (where global_category_id is null)::int,
      count(*) filter (where nullif(trim(category), '') is not null)::int
    from public.products
    union all
    select 'insumos', count(*)::int,
      count(*) filter (where global_category_id is not null)::int,
      count(*) filter (where global_category_id is null)::int,
      count(*) filter (where nullif(trim(category), '') is not null)::int
    from public.insumos
  ) x
),
conflicts as (
  select * from (
    select 'financial_obligations' source, fo.id::text id, fo.category legacy, gc.name global_name, gc.domain::text domain
    from public.financial_obligations fo
    join public.global_categories gc on gc.id = fo.global_category_id
    where nullif(trim(fo.category), '') is not null
      and lower(trim(fo.category)) <> lower(trim(gc.name))
    union all
    select 'clients', c.id::text, c.category, gc.name, gc.domain::text
    from public.clients c
    join public.global_categories gc on gc.id = c.global_category_id
    where nullif(trim(c.category), '') is not null
      and lower(trim(c.category)) <> lower(trim(gc.name))
    union all
    select 'suppliers', s.id::text, s.category, gc.name, gc.domain::text
    from public.suppliers s
    join public.global_categories gc on gc.id = s.global_category_id
    where nullif(trim(s.category), '') is not null
      and lower(trim(s.category)) <> lower(trim(gc.name))
    union all
    select 'products', p.id::text, p.category, gc.name, gc.domain::text
    from public.products p
    join public.global_categories gc on gc.id = p.global_category_id
    where nullif(trim(p.category), '') is not null
      and lower(trim(p.category)) <> lower(trim(gc.name))
    union all
    select 'insumos', i.id::text, i.category, gc.name, gc.domain::text
    from public.insumos i
    join public.global_categories gc on gc.id = i.global_category_id
    where nullif(trim(i.category), '') is not null
      and lower(trim(i.category)) <> lower(trim(gc.name))
  ) x
),
duplicate_globals as (
  select domain::text, lower(trim(name)) normalized_name, count(*)::int total,
    array_agg(id::text order by created_at) ids,
    array_agg(name order by created_at) names
  from public.global_categories
  group by domain, lower(trim(name))
  having count(*) > 1
),
lookup_values_use as (
  select category, value, label, sort_order, is_active
  from public.lookup_values
  order by category, sort_order, label
  limit 200
),
cost_centers_categories as (
  select id::text, name, type, categories
  from public.cost_centers
  where jsonb_array_length(coalesce(categories, '[]'::jsonb)) > 0
  order by type, name
),
financial_categories_use as (
  select id::text, name, type, parent_id::text, code, is_deductible
  from public.financial_categories
  order by type, name
),
global_category_rows as (
  select domain::text, id::text, name, parent_id::text, is_active, color
  from public.global_categories
  order by domain, coalesce(parent_id::text, ''), name
),
global_category_columns as (
  select column_name, data_type, udt_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'global_categories'
  order by ordinal_position
),
tables_with_global_category_id as (
  select table_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'global_category_id'
  order by table_name
),
tables_only_category as (
  select table_name
  from information_schema.columns c
  where table_schema = 'public'
    and column_name = 'category'
    and not exists (
      select 1
      from information_schema.columns g
      where g.table_schema = 'public'
        and g.table_name = c.table_name
        and g.column_name = 'global_category_id'
    )
  order by table_name
),
enum_values as (
  select e.enumlabel
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'global_category_domain'
  order by e.enumsortorder
)
select jsonb_build_object(
  'enum_values', coalesce((select jsonb_agg(to_jsonb(enum_values)) from enum_values), '[]'::jsonb),
  'global_category_columns', coalesce((select jsonb_agg(to_jsonb(global_category_columns)) from global_category_columns), '[]'::jsonb),
  'tables_with_global_category_id', coalesce((select jsonb_agg(to_jsonb(tables_with_global_category_id)) from tables_with_global_category_id), '[]'::jsonb),
  'tables_only_category', coalesce((select jsonb_agg(to_jsonb(tables_only_category)) from tables_only_category), '[]'::jsonb),
  'global_categories', coalesce((select jsonb_agg(to_jsonb(global_category_rows)) from global_category_rows), '[]'::jsonb),
  'category_text', coalesce((select jsonb_agg(to_jsonb(category_text) order by source, total desc, value) from category_text), '[]'::jsonb),
  'coverage', coalesce((select jsonb_agg(to_jsonb(coverage) order by source) from coverage), '[]'::jsonb),
  'conflicts', coalesce((select jsonb_agg(to_jsonb(conflicts) order by source, id) from conflicts), '[]'::jsonb),
  'duplicate_globals', coalesce((select jsonb_agg(to_jsonb(duplicate_globals) order by domain, normalized_name) from duplicate_globals), '[]'::jsonb),
  'lookup_values', coalesce((select jsonb_agg(to_jsonb(lookup_values_use)) from lookup_values_use), '[]'::jsonb),
  'cost_centers_categories', coalesce((select jsonb_agg(to_jsonb(cost_centers_categories)) from cost_centers_categories), '[]'::jsonb),
  'financial_categories', coalesce((select jsonb_agg(to_jsonb(financial_categories_use)) from financial_categories_use), '[]'::jsonb)
) as diagnostic;

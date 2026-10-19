# Plano de unificacao e diagnostico de categorias

Data: 2026-06-03

Escopo executado: somente diagnostico documental e plano tecnico. Nao foram aplicadas migrations, nao foram alterados SQLs, nao foram alteradas regras financeiras, nao foram criados utilitarios nem patches de leitura.

## 1. Sumario executivo

O prompt recebido faz sentido como direcao arquitetural, mas nao deve ser executado como patch direto.

O ERP tem hoje um sistema parcialmente novo de categorias globais (`global_categories`) convivendo com categorias textuais antigas (`category`), centros de custo, lookups e tabelas legadas. A unificacao deve acontecer por funcao, nao por nome.

Estado recomendado:

- Usar `global_categories` como base oficial futura.
- Manter dominios separados.
- Manter `category` textual como fallback historico por enquanto.
- Nao migrar por nome automaticamente.
- Nao transformar centro de custo em categoria.
- Antes de qualquer migration, rodar diagnosticos SQL somente leitura.

Veredito: **seguir com plano em camadas**. Primeiro leitura unificada e diagnostico. Depois escrita unificada. So depois migrations revisadas.

## 2. Diagnostico atual

### Fatos confirmados no codigo/schema

- `global_categories` existe e possui dominio via enum `global_category_domain`.
- O enum atual no schema local aceita apenas: `finance`, `inventory`, `crm`.
- O tipo TypeScript `GlobalCategory.domain` tambem aceita apenas `'finance' | 'inventory' | 'crm'`.
- Clientes, fornecedores, produtos, insumos e obrigacoes financeiras possuem `global_category_id`.
- Varias tabelas ainda possuem `category` textual.
- `financial_categories` ainda existe no banco e no repository.
- `lookup_values` ainda e usado para unidades e categoria de insumo.
- `cost_centers.categories` existe como `jsonb`, mas seu uso real e limitado.
- `wms_categories` existe no schema, mas nao ha integracao visivel com os fluxos principais atuais do app.

### Ponto tecnico critico

O TypeScript envia `p_global_category_id` para a RPC `create_recurrence_obligations`, mas os SQLs locais mostram a funcao recebendo o parametro sem inserir `global_category_id` no `INSERT`.

Arquivos:

- `src/repositories/financeRepository.ts`
- `supabase/schema_live.sqlnpx`
- `supabase/security_hardening_single_tenant.sql`

Isso precisa ser confirmado contra o Supabase real antes de padronizar relatorios por categoria global.

## 3. Sistemas de categoria encontrados

| Nome/campo | Tabela/arquivo | Modulo | Funcao real | Fonte atual | Deve unificar? | Com o que? | Risco |
|---|---|---|---|---|---|---|---|
| `global_categories` | Supabase | todos | catalogo novo multi-dominio | banco | Sim, como base futura | por dominio | Medio |
| `global_category_id` | clients/suppliers/products/insumos/financial_obligations | todos | FK para categoria global | banco/app | Sim | `global_categories.id` | Alto se nao persistir |
| `category` | varias tabelas | legado | texto de classificacao | texto livre/lista | Manter como fallback | categoria global aprovada | Alto |
| `financial_categories` | tabela | financeiro legado | plano/categorias financeiras antigas | banco | Talvez migrar | `global_categories(domain=finance)` | Medio |
| `lookup_values` | tabela | estoque/config | listas gerais e categorias de insumo | banco | Parcial | manter para valores nao categoria | Medio |
| `default_sub_category` | suppliers | fornecedor/financeiro | sugestao textual de categoria financeira | fornecedor | Migrar depois | global finance default | Alto |
| `default_cost_center_id` | suppliers | fornecedor/financeiro | sugestao de centro de custo | FK | Nao e categoria | `cost_centers` | Baixo/medio |
| `cost_center_id` | financial_obligations/budget_lines | financeiro | dimensao gerencial | FK | Nao unificar | centro de custo | Medio |
| `cost_centers.categories` | cost_centers | financeiro | vinculo opcional com categoria global | jsonb | Reavaliar | possivel mapping explicito | Medio |
| `categoryBreakdown` | useFinanceFilters | financeiro | agrupamento por categoria | resolucao mista | Sim | resolvedor unico | Medio |
| `wms_categories` | schema | WMS | categoria de item WMS | tabela separada | Nao agora | manter separado | Baixo/medio |

Classificacao:

- Categoria real oficial futura: `global_categories`.
- Categoria legada textual: `category`.
- Categoria duplicada: `financial_categories`, listas `app_settings` e parte de `lookup_values`.
- Categoria de dominio diferente: produto, insumo, cliente, fornecedor, financeiro.
- Centro de custo disfarçado/confundido: `cost_centers.categories`.
- Lookup antigo: `lookup_values` para `insumo_category`.
- Campo auxiliar/sugestao: `default_sub_category`.
- Uso incerto: `wms_categories`, `financial_categories` na UI atual.

## 4. O que deve ser unificado

Deve ser unificado no sentido de usar a mesma infraestrutura (`global_categories`), mas com dominios separados:

- Categoria financeira: `global_categories.domain = finance`.
- Categoria de insumo/estoque: hoje `inventory`; futuramente pode permanecer `inventory` ou virar dominio mais especifico.
- Categoria de produto: idealmente dominio proprio `product`, mas hoje usa `inventory`.
- Categoria de cliente: idealmente dominio proprio `client`, mas hoje usa `crm`.
- Categoria de fornecedor: idealmente dominio proprio `supplier`, mas hoje usa `crm`.

Unificacao recomendada:

| Categoria atual | Origem | Dominio correto | Categoria pai sugerida | Categoria filha sugerida | Acao recomendada |
|---|---|---|---|---|---|
| `financial_obligations.category` | financeiro | `finance` | natureza financeira | nome atual validado | manter fallback e migrar depois |
| `financial_categories` | financeiro legado | `finance` | conforme tipo/codigo | conforme nome | declarar legado ou migrar |
| `clients.category` | CRM | `client` ou `crm` | segmento/status | nome atual validado | migrar com decisao |
| `suppliers.category` | fornecedores | `supplier` ou `crm` | tipo de fornecedor | nome atual validado | migrar com decisao |
| `suppliers.default_sub_category` | fornecedor | `finance` | natureza de despesa sugerida | nome atual validado | trocar por FK futura |
| `products.category` | produtos | `product` | linha/tipo produto | nome atual validado | migrar com meta |
| `insumos.category` | estoque | `inventory` | familia insumo | nome atual validado | migrar com lookup |
| `lookup_values:insumo_category` | estoque | `inventory` | familia insumo | value | migrar se for categoria |

## 5. O que nao deve ser unificado

Nao deve virar uma mesma categoria so porque tem o mesmo nome:

- `Tecidos` em estoque e `Tecidos` em financeiro.
- `Producao` como centro de custo e `Producao` como categoria textual.
- `Marketing` como despesa financeira e eventual segmento comercial.
- `Fornecedor de tecido` e `Materia-prima > Tecidos`.

Regra:

- Categoria = natureza, tipo ou classificacao do item/lancamento.
- Centro de custo = area/responsavel onde o gasto ocorreu.
- Mapping entre dominios pode existir, mas com IDs diferentes e relacao explicita.

## 6. Modelo proposto

Base oficial sugerida:

```text
global_categories
  id
  user_id
  name
  domain
  parent_id
  color
  is_active
  sort_order      -- futuro
  metadata        -- futuro
  created_at
  updated_at
```

Campos atuais no schema local:

- Existe: `id`, `user_id`, `name`, `domain`, `parent_id`, `color`, `is_active`, `created_at`, `updated_at`.
- Nao encontrei em `global_categories`: `sort_order`, `metadata`.

Migration futura possivel, nao aplicar agora:

```sql
-- PROPOSTA FUTURA, NAO EXECUTAR NESTA FASE
ALTER TABLE public.global_categories
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
```

## 7. Dominios propostos

### Estado atual

Schema e TS aceitam:

```text
finance
inventory
crm
```

### Proposta conservadora

Curto prazo:

- manter `finance`;
- manter `inventory`;
- manter `crm`;
- nao alterar enum ainda.

Medio prazo, se aprovado:

```text
finance
inventory
product
client
supplier
```

SQL futuro necessario:

```sql
-- PROPOSTA FUTURA, NAO EXECUTAR NESTA FASE
ALTER TYPE public.global_category_domain ADD VALUE IF NOT EXISTS 'product';
ALTER TYPE public.global_category_domain ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE public.global_category_domain ADD VALUE IF NOT EXISTS 'supplier';
```

Arquivos TypeScript que tambem precisariam mudar:

- `src/types/index.ts`
- `src/repositories/globalCategoryRepository.ts`
- `src/components/modals/GlobalCategoryQuickAdd.tsx`
- `src/components/modals/QuickCreateModal.tsx`
- `src/services/storage.ts`
- `src/hooks/useMasterData.ts`

## 8. Hierarquia pai/filho proposta

Nao implementar nomes automaticamente. Primeiro comparar com categorias reais do banco.

### Financeiro

Estrutura possivel:

```text
Receitas
  Vendas de produtos
  Servicos prestados
  Frete cobrado

Custos
  Materia-prima
    Tecidos
    Aviamentos
    Embalagens
  Mao de obra direta
  Terceirizacao

Despesas
  Administrativo
  Comercial
  Marketing
  Energia
  Sistemas
  Contabilidade

Investimentos
  Maquinas
  Equipamentos

Dividas
  Emprestimos
  Juros
```

### Estoque/Insumos

```text
Materia-prima
  Tecidos
  Malhas
  Aviamentos
  Linhas
  Etiquetas
  Embalagens

Material auxiliar
  Limpeza
  Manutencao
  Escritorio
```

### Produtos

```text
Uniformes
  Operacionais
  Administrativos
  Promocionais

Pecas
  Camisetas
  Calcas
  Jalecos
  Coletes
```

### Clientes

```text
Tipo
  B2B
  Varejo
  Governo
  Revenda

Status comercial
  Recorrente
  Novo
  Inativo
  Estrategico
```

### Fornecedores

```text
Materia-prima
  Tecidos
  Aviamentos

Servicos
  Transporte
  Manutencao
  Terceirizacao
```

## 9. Campos oficiais e legados

| Entidade | Campo oficial futuro | Campo legado/fallback | Observacao |
|---|---|---|---|
| Obrigacao financeira | `global_category_id` | `category` | precisa confirmar RPC |
| Cliente | `global_category_id` | `category` | hoje completo usa legado, rapido usa global |
| Fornecedor | `global_category_id` + futuro default financeiro | `category`, `default_sub_category` | sugestao financeira deve ser separada |
| Produto | `global_category_id` | `category` | ideal dominio `product` |
| Insumo | `global_category_id` | `category` | hoje inventory/lookup/texto livre |
| Budget line | possivel futuro `global_category_id` | `category` | hoje nao tem FK global |
| Centro de custo | `cost_center_id` | n/a | nao e categoria |

## 10. Sistemas paralelos e destino sugerido

### `financial_categories`

Status: legado/incerto.

Fatos:

- Existe no schema.
- `financeRepository` ainda le e salva.
- `CategoryModal` ainda existe.
- UI financeira atual usa principalmente `globalCategories` de dominio `finance`.

Destino sugerido: marcar como legado depois de confirmar que nenhum fluxo ativo depende dela. Migrar para `global_categories(domain=finance)` se houver dados reais.

### `lookup_values`

Status: parcialmente ativo.

Fatos:

- Usado para unidades.
- Usado para `insumo_category` em `Inventory.tsx`.

Destino sugerido: manter para listas que nao sao categoria. Para `insumo_category`, migrar futuramente para `global_categories(domain=inventory)` se a decisao for padronizar.

### `category` textual

Status: ativo como fallback e legado.

Destino sugerido:

- Nao remover.
- Nao apagar.
- Continuar lendo.
- Em novos formularios, preferir `global_category_id`.
- Congelar criacao textual livre apenas depois de UX pronta.

### `cost_centers.categories`

Status: uso confuso/parcial.

Fatos:

- `CostCenterQuickAdd` salva ids de categorias globais financeiras nesse array.
- `SupplierForm` exibe uma referencia curta desse array.
- Relatorios principais nao usam esse array como fonte oficial.

Destino sugerido: reavaliar. Se for necessario relacionar centro de custo e categoria, preferir tabela explicita no futuro, nao array JSON opaco.

## 11. Riscos

### Critico

Risco: `global_category_id` financeiro nao persistir na RPC.

Impacto: filtros e relatorios globais ficam falsamente vazios ou caem no legado.

Acao: confirmar no Supabase real e alinhar SQL local antes de depender de `global_category_id`.

### Alto

Risco: Dashboard/DRE agrupar por `category` textual enquanto Financeiro escreve global.

Impacto: DRE e relatorios gerenciais inconsistentes.

Acao: leitura unificada via resolvedor antes de migrar dados.

### Alto

Risco: separar dominios `client`/`supplier`/`product` sem migrar dados.

Impacto: categorias somem dos selects porque hoje estao em `crm` e `inventory`.

Acao: diagnostico e plano de migracao antes de alterar enum/UI.

### Medio

Risco: `lookup_values` misturar categorias com listas gerais.

Impacto: migration errada pode afetar unidades e outros cadastros.

Acao: migrar apenas `lookup_values.category = 'insumo_category'`, se aprovado.

### Medio

Risco: mapeamento por nome normalizado.

Impacto: `Tecidos` estoque e `Tecidos` financeiro podem virar a mesma categoria indevidamente.

Acao: usar diagnostico por dominio e revisao humana.

## 12. Perguntas de negocio

1. `global_categories` sera a fonte oficial futura?
2. Os dominios atuais `finance`, `inventory`, `crm` bastam no curto prazo?
3. Quer separar `crm` em `client` e `supplier`?
4. Quer separar `inventory` em `inventory` e `product`?
5. Categoria financeira sera obrigatoria?
6. Centro de custo sera obrigatorio no financeiro?
7. Cliente precisa ter categoria obrigatoria?
8. Fornecedor precisa ter categoria obrigatoria?
9. Produto precisa ter categoria obrigatoria?
10. Insumo precisa ter categoria obrigatoria?
11. Fornecedor deve ter categoria propria e categoria financeira padrao?
12. Insumo deve sugerir categoria financeira de compra?
13. Produto deve sugerir categoria financeira de receita?
14. Quem pode criar categorias?
15. Categoria pai pode ser selecionada ou apenas categoria filha?
16. Relatorios devem agrupar por pai, filho ou caminho completo?
17. Como tratar conflitos entre `category` textual e `global_category_id`?
18. Como tratar registros antigos sem categoria global?
19. Como tratar categorias globais sem uso?
20. Quando esconder `category` textual da UI?

## 13. Plano de migracao

### Etapa 0 - Confirmacao tecnica

- Confirmar schema real do Supabase.
- Confirmar se `create_recurrence_obligations` persiste `global_category_id`.
- Confirmar dados existentes em `global_categories`, `financial_categories`, `app_settings`, `lookup_values`.

### Etapa 1 - Diagnostico SQL

- Rodar apenas `SELECT`.
- Gerar listas de categorias textuais distintas.
- Gerar conflitos entre categoria textual e global.
- Gerar sugestoes, nao updates.

### Etapa 2 - Leitura unificada

- Criar resolvedor em TS.
- Usar em relatorios sem migrar dados.
- Garantir que UUID nunca apareca.

### Etapa 3 - Escrita unificada

- Formularios novos gravam `global_category_id`.
- `category` textual continua como fallback/copia de leitura.
- Cadastro rapido segue criando dado real, mas com avisos de incompletude.

### Etapa 4 - Mapping aprovado

- Criar tabela temporaria ou view de sugestoes.
- Revisao humana dos mapeamentos.
- Nao migrar por nome automaticamente.

### Etapa 5 - Migration segura

- Preencher `global_category_id` apenas para mapeamentos aprovados.
- Manter `category` textual.
- Comparar relatorios antes/depois.

### Etapa 6 - Limpeza futura

- Declarar sistemas legados.
- Esconder campos textuais livres da UI.
- Remover apenas com backup e validacao.

## 14. Patches seguros sugeridos

Nao aplicados nesta fase.

### Patch seguro 1 - `categoryResolver.ts`

Tipo: leitura.

Risco: baixo/medio.

Objetivo:

- Resolver nome por `global_category_id`.
- Cair para `category` textual.
- Detectar conflito.
- Nunca exibir UUID.

Arquivos provaveis:

- `src/utils/categoryResolver.ts`
- `src/hooks/finance/useFinanceFilters.ts`
- `src/utils/finance.ts`
- `src/pages/Dashboard.tsx`
- `src/components/finance/ObligationCard.tsx`
- `src/pages/FinanceComponents.tsx`

### Patch seguro 2 - diagnostico visual de conflito

Tipo: leitura/UX.

Objetivo: avisar quando registro tem `category` textual diferente da global resolvida.

Nao deve bloquear operacao inicialmente.

### Patch seguro 3 - selects por dominio atual

Tipo: UX.

Objetivo: manter dominios atuais (`finance`, `inventory`, `crm`) e exibir caminho pai/filho quando existir.

Nao exige migration.

## 15. Arquivos que seriam alterados futuramente

Sem alterar agora, os arquivos provaveis sao:

- `src/utils/categoryResolver.ts` novo.
- `src/types/index.ts`.
- `src/repositories/globalCategoryRepository.ts`.
- `src/services/storage.ts`.
- `src/hooks/finance/useFinanceFilters.ts`.
- `src/hooks/finance/useObligationForm.ts`.
- `src/pages/FinanceComponents.tsx`.
- `src/pages/Finance.tsx`.
- `src/pages/Dashboard.tsx`.
- `src/components/modals/QuickCreateModal.tsx`.
- `src/components/modals/GlobalCategoryQuickAdd.tsx`.
- `src/components/modals/CostCenterQuickAdd.tsx`.
- `src/components/masterdata/CategorySelect.tsx`.
- `src/pages/MasterData.tsx`.
- `src/hooks/useMasterData.ts`.
- `src/repositories/financeRepository.ts`.
- `src/repositories/crmRepository.ts`.
- `src/repositories/inventoryRepository.ts`.
- `supabase/*.sql` somente apos aprovacao.

## 16. Scripts SQL de diagnostico

Somente leitura. Podem ser rodados no Supabase SQL Editor para levantar dados antes de decidir.

### 16.1 Categorias textuais distintas por tabela

```sql
select 'financial_obligations' as source, category, count(*) as total
from public.financial_obligations
where nullif(trim(category), '') is not null
group by category
union all
select 'clients', category, count(*)
from public.clients
where nullif(trim(category), '') is not null
group by category
union all
select 'suppliers', category, count(*)
from public.suppliers
where nullif(trim(category), '') is not null
group by category
union all
select 'suppliers.default_sub_category', default_sub_category, count(*)
from public.suppliers
where nullif(trim(default_sub_category), '') is not null
group by default_sub_category
union all
select 'products', category, count(*)
from public.products
where nullif(trim(category), '') is not null
group by category
union all
select 'insumos', category, count(*)
from public.insumos
where nullif(trim(category), '') is not null
group by category
order by source, total desc, category;
```

### 16.2 Registros com e sem categoria global

```sql
select 'financial_obligations' as source,
       count(*) as total,
       count(*) filter (where global_category_id is not null) as with_global,
       count(*) filter (where global_category_id is null) as without_global,
       count(*) filter (where nullif(trim(category), '') is not null) as with_legacy_text
from public.financial_obligations
union all
select 'clients', count(*),
       count(*) filter (where global_category_id is not null),
       count(*) filter (where global_category_id is null),
       count(*) filter (where nullif(trim(category), '') is not null)
from public.clients
union all
select 'suppliers', count(*),
       count(*) filter (where global_category_id is not null),
       count(*) filter (where global_category_id is null),
       count(*) filter (where nullif(trim(category), '') is not null)
from public.suppliers
union all
select 'products', count(*),
       count(*) filter (where global_category_id is not null),
       count(*) filter (where global_category_id is null),
       count(*) filter (where nullif(trim(category), '') is not null)
from public.products
union all
select 'insumos', count(*),
       count(*) filter (where global_category_id is not null),
       count(*) filter (where global_category_id is null),
       count(*) filter (where nullif(trim(category), '') is not null)
from public.insumos;
```

### 16.3 Conflitos entre texto legado e categoria global

```sql
select 'financial_obligations' as source, fo.id, fo.category as legacy_category,
       gc.name as global_category_name, gc.domain
from public.financial_obligations fo
join public.global_categories gc on gc.id = fo.global_category_id
where nullif(trim(fo.category), '') is not null
  and lower(trim(fo.category)) <> lower(trim(gc.name))
union all
select 'clients', c.id, c.category, gc.name, gc.domain
from public.clients c
join public.global_categories gc on gc.id = c.global_category_id
where nullif(trim(c.category), '') is not null
  and lower(trim(c.category)) <> lower(trim(gc.name))
union all
select 'suppliers', s.id, s.category, gc.name, gc.domain
from public.suppliers s
join public.global_categories gc on gc.id = s.global_category_id
where nullif(trim(s.category), '') is not null
  and lower(trim(s.category)) <> lower(trim(gc.name))
union all
select 'products', p.id, p.category, gc.name, gc.domain
from public.products p
join public.global_categories gc on gc.id = p.global_category_id
where nullif(trim(p.category), '') is not null
  and lower(trim(p.category)) <> lower(trim(gc.name))
union all
select 'insumos', i.id, i.category, gc.name, gc.domain
from public.insumos i
join public.global_categories gc on gc.id = i.global_category_id
where nullif(trim(i.category), '') is not null
  and lower(trim(i.category)) <> lower(trim(gc.name));
```

### 16.4 Categorias globais duplicadas por nome normalizado

```sql
select domain,
       lower(trim(name)) as normalized_name,
       count(*) as total,
       array_agg(id order by created_at) as ids,
       array_agg(name order by created_at) as names
from public.global_categories
group by domain, lower(trim(name))
having count(*) > 1
order by domain, normalized_name;
```

### 16.5 Categorias globais sem uso

```sql
with usage as (
  select global_category_id as id, count(*) as total from public.financial_obligations where global_category_id is not null group by global_category_id
  union all
  select global_category_id, count(*) from public.clients where global_category_id is not null group by global_category_id
  union all
  select global_category_id, count(*) from public.suppliers where global_category_id is not null group by global_category_id
  union all
  select global_category_id, count(*) from public.products where global_category_id is not null group by global_category_id
  union all
  select global_category_id, count(*) from public.insumos where global_category_id is not null group by global_category_id
)
select gc.id, gc.domain, gc.name, gc.parent_id, coalesce(sum(u.total), 0) as usage_count
from public.global_categories gc
left join usage u on u.id = gc.id
group by gc.id, gc.domain, gc.name, gc.parent_id
having coalesce(sum(u.total), 0) = 0
order by gc.domain, gc.name;
```

### 16.6 `financial_categories` existentes

```sql
select id, name, type, parent_id, code, is_deductible, created_at, updated_at
from public.financial_categories
order by type, name;
```

### 16.7 `lookup_values` usados como categoria de insumo

```sql
select id, category, value, label, sort_order, is_active
from public.lookup_values
where category = 'insumo_category'
order by sort_order, label;
```

### 16.8 Centros de custo com categorias vinculadas

```sql
select id, name, type, categories
from public.cost_centers
where jsonb_array_length(coalesce(categories, '[]'::jsonb)) > 0
order by type, name;
```

### 16.9 Validar se obrigacoes recorrentes gravaram categoria global

```sql
select recurrence_id,
       count(*) as total,
       count(*) filter (where global_category_id is not null) as with_global_category,
       count(*) filter (where global_category_id is null) as without_global_category,
       min(created_at) as first_created_at,
       max(created_at) as last_created_at
from public.financial_obligations
where recurrence_id is not null
group by recurrence_id
order by last_created_at desc;
```

## 17. Scripts SQL de migracao dry-run

Dry-run: gera sugestoes, nao altera dados.

### 17.1 Sugestoes por nome dentro do mesmo dominio

```sql
with legacy as (
  select 'finance'::text as suggested_domain, 'financial_obligations' as source, category as legacy_name, count(*) as total
  from public.financial_obligations
  where global_category_id is null and nullif(trim(category), '') is not null
  group by category
  union all
  select 'crm', 'clients', category, count(*)
  from public.clients
  where global_category_id is null and nullif(trim(category), '') is not null
  group by category
  union all
  select 'crm', 'suppliers', category, count(*)
  from public.suppliers
  where global_category_id is null and nullif(trim(category), '') is not null
  group by category
  union all
  select 'inventory', 'products', category, count(*)
  from public.products
  where global_category_id is null and nullif(trim(category), '') is not null
  group by category
  union all
  select 'inventory', 'insumos', category, count(*)
  from public.insumos
  where global_category_id is null and nullif(trim(category), '') is not null
  group by category
)
select l.source,
       l.suggested_domain,
       l.legacy_name,
       l.total,
       gc.id as matched_global_category_id,
       gc.name as matched_global_category_name,
       case when gc.id is null then 'CRIAR_CATEGORIA_GLOBAL' else 'MAPEAR_EXISTENTE' end as suggested_action
from legacy l
left join public.global_categories gc
  on gc.domain::text = l.suggested_domain
 and lower(trim(gc.name)) = lower(trim(l.legacy_name))
order by l.source, l.total desc, l.legacy_name;
```

### 17.2 Gerar comandos comentados para aprovacao manual

```sql
-- DRY-RUN: este SELECT apenas monta sugestoes de UPDATE.
-- Copiar/aprovar manualmente antes de qualquer execucao.
with candidates as (
  select fo.id, gc.id as global_id, fo.category, gc.name
  from public.financial_obligations fo
  join public.global_categories gc
    on gc.domain = 'finance'
   and lower(trim(gc.name)) = lower(trim(fo.category))
  where fo.global_category_id is null
    and nullif(trim(fo.category), '') is not null
)
select '-- update public.financial_obligations set global_category_id = '''
       || global_id || ''' where id = ''' || id || '''; -- '
       || category || ' -> ' || name as proposed_sql
from candidates
order by category;
```

## 18. Criterios de aceite

O plano de unificacao so deve virar implementacao quando:

1. O Supabase real confirmar se a RPC persiste `global_category_id`.
2. Houver decisao sobre manter dominios atuais ou criar `product`, `client`, `supplier`.
3. Houver lista real de categorias existentes por tabela.
4. Houver revisao humana dos nomes duplicados.
5. Houver decisao sobre categoria pai selecionavel ou somente filha.
6. `categoryResolver` for testado em leitura sem mudar dados.
7. Relatorios compararem antes/depois.
8. `category` textual continuar disponivel como fallback.
9. Nenhum UUID aparecer em relatorio.
10. Migrations destrutivas forem proibidas ate backup e homologacao.

## Resposta direta aos criterios do prompt

1. Categorias realmente iguais: somente as aprovadas dentro do mesmo dominio e funcao. Exemplo: `financial_obligations.category = "Marketing"` pode mapear para `global_categories(finance, "Marketing")`.
2. Categorias com nome parecido: `Tecidos` em estoque e `Tecidos` no financeiro podem ter nomes iguais, mas devem ser IDs diferentes.
3. Devem virar pai: grupos como `Receitas`, `Custos`, `Despesas`, `Materia-prima`, `Uniformes`, `Tipo`, `Status comercial`.
4. Devem virar filho: nomes operacionais reais como `Tecidos`, `Aviamentos`, `Marketing`, `B2B`, `Operacionais`.
5. Devem continuar separados: financeiro, estoque/insumo, produto, cliente, fornecedor e centro de custo.
6. Sistemas legados: `financial_categories`, `category` textual, parte de `lookup_values`, listas de `app_settings`.
7. Evitar UUID em relatorio: resolvedor por `global_category_id` com fallback textual.
8. Preservar historico: nao apagar `category`, nao apagar tabelas, migrar apenas FK aprovada.
9. Migrar sem destruir dados: diagnostico -> sugestao -> revisao -> update aprovado -> comparacao.
10. Impedir categorias soltas: apos UX pronta, bloquear criacao textual livre e exigir escolha/criacao em `global_categories`.


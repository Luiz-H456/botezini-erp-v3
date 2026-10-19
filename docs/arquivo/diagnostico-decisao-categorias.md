# Diagnostico real e matriz de decisao de categorias

Data: 2026-06-03

Escopo: diagnostico real via `supabase db query --linked` com SELECTs somente leitura. Nao houve migration, UPDATE, DELETE, alteracao de dados, alteracao de UI ou mudanca de regra financeira.

SQL usado: `supabase/category_diagnostic_readonly.sql`.

## 1. Resumo executivo

O banco real esta com poucos dados de categoria, mas ja confirma a decisao principal:

- Nao ha base suficiente para migracao automatica.
- `global_categories` existe e deve ser mantida como base futura.
- O enum real ainda tem apenas `finance`, `inventory`, `crm`.
- Nao existem `sort_order` nem `metadata` em `global_categories`.
- `parent_id` existe.
- Categorias textuais reais encontradas sao provaveis dados de teste: `categortia` em cliente e `asd` em produto.
- `financial_categories` tem 3 registros, mas nao ha uso real em `transactions` ou `transactions_table`.
- `cost_centers.categories` contem valores que nao sao UUIDs de categoria global: `tsttt`, `000`. Isso indica uso legado/livre ou dado de teste.
- A RPC real `create_recurrence_obligations` recebe `p_global_category_id`, mas a definicao indica que o parametro nao e usado no corpo. Resultado: obrigacoes recorrentes provavelmente nao persistem `global_category_id`.

Decisao recomendada: **nao criar novos dominios agora**. Manter `finance`, `inventory`, `crm` no curto prazo, corrigir primeiro a persistencia de `global_category_id` financeiro e criar leitura unificada segura.

## 2. Schema real confirmado

### Enum `global_category_domain`

| Valor |
|---|
| `finance` |
| `inventory` |
| `crm` |

### Campos reais de `global_categories`

| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `uuid_generate_v4()` |
| `user_id` | uuid | NO | null |
| `name` | text | NO | null |
| `domain` | global_category_domain | NO | null |
| `parent_id` | uuid | YES | null |
| `color` | text | YES | `'#71717a'::text` |
| `is_active` | boolean | YES | `true` |
| `created_at` | timestamptz | YES | `now()` |
| `updated_at` | timestamptz | YES | `now()` |

Conclusao:

- `parent_id` existe.
- `sort_order` nao existe.
- `metadata` nao existe.

### Tabelas com `global_category_id`

| Tabela |
|---|
| `clients` |
| `financial_obligations` |
| `insumos` |
| `obligation_summary` |
| `products` |
| `suppliers` |

### Tabelas com `category` textual e sem `global_category_id`

| Tabela |
|---|
| `budget_lines` |
| `lookup_values` |
| `payable_accounts` |
| `payable_accounts_table` |
| `transactions` |
| `transactions_table` |

## 3. Tabelas reais de diagnostico

### 3.1 Categorias textuais distintas por tabela

| Fonte | Categoria textual | Total |
|---|---:|---:|
| `clients` | `categortia` | 1 |
| `products` | `asd` | 1 |

Nao apareceram categorias textuais em:

- `financial_obligations`
- `suppliers`
- `suppliers.default_sub_category`
- `insumos`
- `budget_lines`

### 3.2 `global_categories` por dominio

| Dominio | Categoria | ID | Pai | Ativa |
|---|---|---|---|---|
| `crm` | `operacionalpai` | `ef20900f-e0d3-4d1c-a0b7-d198b6820505` | null | true |
| `finance` | `Cloud & Server` | `d19b3d30-24be-4732-9b78-0646dcd624ed` | null | true |
| `finance` | `Insumos` | `abf7e3a0-caf8-4b8f-b2cd-1a7941aaa8c3` | null | true |

Nao ha categorias globais no dominio `inventory`.

### 3.3 Cobertura de `global_category_id` e `category`

| Fonte | Total registros | Com global | Sem global | Com texto |
|---|---:|---:|---:|---:|
| `clients` | 2 | 0 | 2 | 1 |
| `financial_obligations` | 2 | 0 | 2 | 0 |
| `insumos` | 0 | 0 | 0 | 0 |
| `products` | 2 | 0 | 2 | 1 |
| `suppliers` | 0 | 0 | 0 | 0 |

Conclusao: no dataset real atual, nenhum registro operacional esta usando `global_category_id`.

### 3.4 Possiveis duplicidades por nome normalizado

| Resultado |
|---|
| Nenhuma duplicidade encontrada em `global_categories` por `domain + lower(trim(name))`. |

### 3.5 Conflitos entre `category` textual e `global_category_id`

| Resultado |
|---|
| Nenhum conflito encontrado, porque os registros com texto nao possuem `global_category_id`. |

### 3.6 Usos reais de `financial_categories`

Registros existentes:

| Tipo | Nome | ID | Pai | Codigo | Dedutivel |
|---|---|---|---|---|---|
| `expense` | `categoria` | `2120611e-f35b-44d9-a79a-7b6f336e06d5` | null | vazio | false |
| `expense` | `ddddddddddddd` | `dcb84e2e-a839-426e-a752-02eb30087e02` | null | vazio | false |
| `expense` | `sd` | `a4af6e66-4841-4b9d-8809-6cfe6a74027e` | null | vazio | false |

Referencias em transacoes:

| Fonte | Total registros | Com `category_id` |
|---|---:|---:|
| `transactions.category_id` | 0 | 0 |
| `transactions_table.category_id` | 0 | 0 |

Conclusao: `financial_categories` tem dados, mas parecem registros de teste/legado e nao estao sendo usados por transacoes.

### 3.7 Usos reais de `lookup_values`

| Categoria lookup | Valor | Label | Ordem | Ativo |
|---|---|---|---:|---|
| `insumo_category` | `Tecidos` | `Tecidos` | 1 | true |
| `insumo_category` | `Acessorios` | `Acessorios` | 2 | true |
| `insumo_category` | `Embalagens` | `Embalagens` | 3 | true |
| `insumo_category` | `Linhas` | `Linhas` | 4 | true |
| `insumo_category` | `Botoes` | `Botoes` | 5 | true |
| `insumo_category` | `Outros` | `Outros` | 6 | true |
| `unit` | `un` | `Unidade` | 1 | true |
| `unit` | `kg` | `Quilograma` | 2 | true |
| `unit` | `g` | `Grama` | 3 | true |
| `unit` | `m` | `Metro` | 4 | true |
| `unit` | `m2` | `Metro2` | 5 | true |
| `unit` | `l` | `Litro` | 6 | true |
| `unit` | `cx` | `Caixa` | 7 | true |
| `unit` | `pc` | `Peca` | 8 | true |
| `unit` | `rolo` | `Rolo` | 9 | true |

Conclusao: `lookup_values` nao pode ser removido. Ele guarda unidades e categorias de insumo. Apenas `insumo_category` e candidata a migracao futura; `unit` deve continuar como lookup.

### 3.8 Usos reais de `cost_centers.categories`

| Centro de custo | Tipo | ID | `categories` |
|---|---|---|---|
| `teste` | `production` | `51c6036b-7406-4062-80a6-77c03f77bf69` | `["tsttt", "000"]` |

Conclusao: o campo esta sendo usado com valores livres, nao como FK confiavel para `global_categories`. Nao deve ser usado como base de relatorio.

## 4. Matriz de decisao por categoria encontrada

| Categoria encontrada | Origem | Funcao | Decisao | Acao executavel futura | Exige revisao humana? |
|---|---|---|---|---|---|
| `categortia` | `clients.category` | CRM/client | deixar legado por enquanto | corrigir manualmente ou mapear para categoria CRM se for real | Sim |
| `asd` | `products.category` | product | deixar legado/teste | corrigir/remover via limpeza de dados de teste, nao migrar automaticamente | Sim |
| `operacionalpai` | `global_categories.crm` | CRM/client/fornecedor incerto | manter como global existente | revisar nome e decidir se e pai real | Sim |
| `Cloud & Server` | `global_categories.finance` | finance | manter | pode virar filho de `Despesas > Sistemas` futuramente | Sim |
| `Insumos` | `global_categories.finance` | finance | manter | pode virar pai/filho de `Custos > Materia-prima` futuramente | Sim |
| `categoria` | `financial_categories` | finance legado/teste | deixar legado | nao migrar sem uso real | Sim |
| `ddddddddddddd` | `financial_categories` | finance legado/teste | deixar legado | candidato a limpeza posterior se confirmado teste | Sim |
| `sd` | `financial_categories` | finance legado/teste | deixar legado | candidato a limpeza posterior se confirmado teste | Sim |
| `Tecidos` | `lookup_values.insumo_category` | inventory | criar global futura | criar/migrar para `global_categories.inventory` depois | Sim |
| `Acessorios` | `lookup_values.insumo_category` | inventory | criar global futura | criar/migrar para `global_categories.inventory` depois | Sim |
| `Embalagens` | `lookup_values.insumo_category` | inventory | criar global futura | criar/migrar para `global_categories.inventory` depois | Sim |
| `Linhas` | `lookup_values.insumo_category` | inventory | criar global futura | criar/migrar para `global_categories.inventory` depois | Sim |
| `Botoes` | `lookup_values.insumo_category` | inventory | criar global futura | criar/migrar para `global_categories.inventory` depois | Sim |
| `Outros` | `lookup_values.insumo_category` | inventory | criar global futura | manter como fallback controlado | Sim |
| `tsttt` | `cost_centers.categories` | indefinida | nao unificar | tratar como lixo/teste se confirmado | Sim |
| `000` | `cost_centers.categories` | indefinida | nao unificar | tratar como lixo/teste se confirmado | Sim |
| `unit` values | `lookup_values.unit` | unidade, nao categoria | nao unificar | manter em `lookup_values` | Nao |

## 5. Separacao por funcao

### Finance

Fontes atuais:

- `global_categories.domain = finance`: `Cloud & Server`, `Insumos`.
- `financial_categories`: `categoria`, `ddddddddddddd`, `sd`.
- `financial_obligations.category`: sem dados reais.

Decisao:

- Finance deve usar `global_categories.finance`.
- `financial_categories` deve ficar legado ate confirmar que nao ha UI ativa usando.
- Corrigir persistencia de `global_category_id` na RPC antes de qualquer relatorio depender disso.

### Inventory

Fontes atuais:

- `lookup_values.insumo_category`: Tecidos, Acessorios, Embalagens, Linhas, Botoes, Outros.
- `insumos`: sem registros.
- `global_categories.inventory`: vazio.

Decisao:

- Manter `lookup_values` por enquanto.
- Futuramente criar globais inventory a partir de `insumo_category`, mas nao remover lookup porque unidades usam a mesma tabela.

### CRM/client

Fontes atuais:

- `clients.category`: `categortia`.
- `global_categories.crm`: `operacionalpai`.
- `clients.global_category_id`: nenhum uso real.

Decisao:

- Manter dominio `crm` por enquanto.
- Nao criar dominio `client` agora.
- Corrigir dados de teste antes de migrar.

### Supplier

Fontes atuais:

- `suppliers`: sem registros.
- `suppliers.default_sub_category`: sem dados reais.

Decisao:

- Nao criar dominio `supplier` agora.
- Quando houver dados reais, fornecedor deve ter duas dimensoes: categoria propria CRM/supplier e categoria financeira padrao separada.

### Product

Fontes atuais:

- `products.category`: `asd`.
- `products.global_category_id`: nenhum uso real.

Decisao:

- Nao criar dominio `product` agora.
- Com poucos dados e categoria `asd`, primeiro limpar/classificar manualmente.

### Cost center separado

Fontes atuais:

- `cost_centers.categories`: `["tsttt", "000"]`.

Decisao:

- Nao considerar categoria oficial.
- Centro de custo continua separado.
- Esse array nao deve alimentar relatorio sem saneamento.

## 6. Modelo final minimo proposto

### Curto prazo

Manter dominios atuais:

| Dominio | Justificativa | Migration? | Impacto TS |
|---|---|---|---|
| `finance` | ja existe e e usado no financeiro | Nao | Nenhum |
| `inventory` | ja existe e cobre insumos/produtos hoje | Nao | Nenhum |
| `crm` | ja existe e cobre cliente/fornecedor hoje | Nao | Nenhum |

Justificativa: criar `client`, `supplier` e `product` agora faria categorias sumirem dos selects atuais e exigiria migration de enum + TypeScript + dados. Como os dados reais ainda sao poucos/teste, nao compensa.

### Medio prazo

Criar novos dominios apenas se houver decisao de negocio:

| Dominio novo | Justificativa | Migration SQL | Impacto TS |
|---|---|---|---|
| `product` | separar produto vendido de estoque/insumo | Sim, alterar enum | Atualizar tipos, repositories, QuickCreate |
| `client` | segmentacao propria de cliente | Sim, alterar enum | Atualizar tipos, QuickCreate, MasterData |
| `supplier` | segmentacao propria de fornecedor | Sim, alterar enum | Atualizar tipos, QuickCreate, MasterData |

### Migration minima necessaria antes de implementar relatorios globais

Corrigir RPC `create_recurrence_obligations` para inserir `global_category_id`.

Motivo: hoje a funcao real menciona `p_global_category_id` apenas uma vez, indicando que recebe o parametro, mas nao o usa no corpo.

## 7. Riscos antes da implementacao

### O que quebra se mudar dominio

- `QuickCreateModal` hoje usa `crm` para cliente/fornecedor e `inventory` para produto/insumo.
- `GlobalCategoryQuickAdd` tipa dominio como `'finance' | 'inventory' | 'crm'`.
- `GlobalCategory` no TypeScript aceita apenas esses tres valores.
- Categorias ja criadas em `crm` e `inventory` nao aparecem se a UI passar a buscar `client`, `supplier` ou `product`.

### O que some da UI

- `operacionalpai` some se cliente/fornecedor deixar de buscar `crm`.
- Produtos/insumos nao tem globais inventory hoje; se a UI exigir global, selects ficam vazios.
- Categorias textuais `categortia` e `asd` nao aparecem em selects globais.

### O que muda em relatorio

- Hoje nenhum `financial_obligations` tem global nem category textual.
- Se corrigir RPC, novos lancamentos podem passar a ter global.
- Dashboard ainda usa `category` textual em pontos importantes; se nao houver resolvedor, relatorios continuam sem enxergar globais.

### O que exige revisao humana

- Decidir se `categortia` e erro de digitacao ou categoria real.
- Decidir se `asd`, `categoria`, `ddddddddddddd`, `sd`, `tsttt`, `000` sao lixo/teste.
- Decidir se `Insumos` financeiro e pai, filho ou categoria final.
- Decidir se `Cloud & Server` deve ficar em `finance > Despesas > Sistemas`.
- Decidir se `Tecidos` inventory deve mapear para `finance > Custos > Materia-prima > Tecidos`.

## 8. Plano de implementacao seguro

### Etapa 1 - Corrigir base tecnica financeira

Objetivo: garantir que `global_category_id` financeiro persista.

Acao futura:

- Ajustar RPC `create_recurrence_obligations`.
- Atualizar arquivo SQL local.
- Testar criando obrigacao com categoria global.

Exige migration: sim, `CREATE OR REPLACE FUNCTION`.

### Etapa 2 - Criar resolvedor de leitura

Objetivo: impedir UUID em relatorio e preservar legado.

Acao futura:

- Criar `src/utils/categoryResolver.ts`.
- Regra: `global_category_id` valido vence, `category` textual e fallback.
- Detectar conflito.

Exige migration: nao.

### Etapa 3 - Aplicar resolvedor em relatorios

Objetivo: relatorios usarem categoria resolvida.

Arquivos futuros:

- `src/hooks/finance/useFinanceFilters.ts`
- `src/utils/finance.ts`
- `src/pages/Dashboard.tsx`
- `src/components/finance/ObligationCard.tsx`

Exige migration: nao.

### Etapa 4 - Saneamento manual de dados teste

Objetivo: limpar/decidir categorias ruins.

Itens:

- `categortia`
- `asd`
- `categoria`
- `ddddddddddddd`
- `sd`
- `tsttt`
- `000`

Exige migration: nao automaticamente; exige decisao humana.

### Etapa 5 - Migrar inventory lookup para global opcionalmente

Objetivo: criar categorias globais inventory a partir de `lookup_values.insumo_category`.

Exige migration: sim, inserts controlados em `global_categories`.

Nao remover `lookup_values.unit`.

### Etapa 6 - Decidir dominios novos

Objetivo: separar `product`, `client`, `supplier` se necessario.

Exige migration: sim, alterar enum e TS.

Recomendacao: adiar.

## 9. Decisao executavel final

| Decisao | Status |
|---|---|
| Criar novos dominios agora | Nao |
| Migrar categorias agora | Nao |
| Apagar legados agora | Nao |
| Usar `global_categories` como base futura | Sim |
| Corrigir RPC para persistir `global_category_id` | Sim, antes da implementacao |
| Criar resolvedor de categoria | Sim, proxima etapa segura |
| Tratar `financial_categories` como legado | Sim, mas sem apagar |
| Tratar `lookup_values.unit` como lookup permanente | Sim |
| Migrar `lookup_values.insumo_category` | Futuro, apos aprovacao |
| Usar `cost_centers.categories` em relatorio | Nao |


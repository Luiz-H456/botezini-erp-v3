# Auditoria do sistema de categorias do ERP

Data: 2026-06-03

Escopo desta auditoria: leitura do codigo e schema local. Nao foram alterados SQL, regras financeiras, hooks financeiros ou logica de categorias.

## 1. Sumario executivo

O sistema de categorias hoje esta **inconsistente**.

Fato: existem varios mecanismos paralelos de classificacao:

- `global_categories`: tabela nova com dominios `finance`, `inventory` e `crm`.
- `category`: campo textual legado em `clients`, `suppliers`, `products`, `insumos`, `financial_obligations`, `budget_lines` e tabelas legadas.
- `financial_categories`: tabela financeira antiga, ainda lida/salva por `financeRepository`, mas sem uso claro na UI financeira atual.
- `cost_centers.categories`: array JSON com ids de categorias globais financeiras, usado como vinculo gerencial opcional.
- `app_settings` com chaves `categories_client`, `categories_supplier`, `categories_product` e `meta_cat_product`.
- `lookup_values` com `category = 'insumo_category'` para categorias de insumo em `Inventory.tsx`.
- `wms_categories`: sistema WMS separado no schema, sem integracao visivel com os fluxos atuais de pedidos/estoque.

As categorias globais parecem ser a camada nova e mais estruturada, mas ainda nao substituem a categoria textual. O financeiro usa as duas: o formulario seleciona uma categoria global e tambem grava o nome em `category`; os filtros tentam aceitar `category`, `global_category_id` e nome resolvido; relatorios do Dashboard ainda dependem principalmente de `category` textual.

Maior risco: relatorios financeiros e DRE agruparem por `category` enquanto registros novos passam a depender de `global_category_id`, ou o inverso. Isso pode fragmentar despesas/receitas entre nomes iguais, UUIDs, vazios e categorias legadas.

Conclusao: os relatorios financeiros **ainda nao conseguem confiar plenamente nas categorias atuais** sem uma regra formal de fonte oficial.

## 2. Mapa geral das categorias

| Tipo de categoria | Campo usado | Tabela/origem | Modulos que usam | Status | Risco |
|---|---|---|---|---|---|
| Categoria legada generica | `category` | Varios cadastros e financeiro | Financeiro, Dashboard, MasterData, Inventory, PDF | ativa | Alto: texto livre e duplicado com `global_category_id` |
| Categoria global | `global_category_id` | `global_categories` | Financeiro, cadastro rapido, CRM, inventory/produtos | parcialmente usada | Alto: nem todo relatorio usa |
| Catalogo global | `global_categories` | Supabase | `GlobalCategoryQuickAdd`, `QuickCreateModal`, Finance | ativa nova | Medio: dominios existem, mas sem migracao total |
| Centro de custo | `cost_center_id` | `financial_obligations`, `budget_lines` | Financeiro, Dashboard/DRE | ativa | Medio: opcional e paralelo a categoria |
| Centro padrao fornecedor | `default_cost_center_id` | `suppliers` | MasterData, `useObligationForm` | ativa | Medio: ajuda sugestao, mas nao obriga preenchimento |
| Subcategoria padrao fornecedor | `default_sub_category` | `suppliers` | `QuickCreateModal`, `useObligationForm` | parcialmente usada | Alto: texto pode divergir da global |
| Categorias de cliente | `clients.category`, `clients.global_category_id` | clients, app_settings/global | MasterData, orcamento/PDF, financeiro sugestao | duplicada | Medio |
| Categorias de fornecedor | `suppliers.category`, `default_sub_category`, `global_category_id` | suppliers | MasterData, financeiro sugestao | duplicada | Alto |
| Categorias de produto | `products.category`, `global_category_id` | products, app_settings/global | MasterData, QuickCreate, BudgetEditor | duplicada | Medio |
| Categorias de insumo | `insumos.category`, `global_category_id` | insumos, lookup_values/global | Inventory, QuickCreate, BudgetEditor | duplicada | Medio |
| Categorias financeiras antigas | `financial_categories` | tabela propria | Repository e modal legado | legada/incerta | Medio |
| Categorias rapidas | estado local + `global_category_id` | QuickCreateModal | Financeiro, pedidos/orcamentos | ativa | Alto: cria dado real, mas incompleto |
| WMS categorias | `wms_categories`, `wms_items.category_id` | schema WMS | nao encontrei uso no app atual | legada/incerta | Baixo/medio |

## 3. Categorias globais

Fato: `global_categories` esta definida em `supabase/schema_live.sqlnpx` com `id`, `user_id`, `name`, `domain`, `parent_id`, `color`, `is_active`, `created_at`, `updated_at`. O enum `global_category_domain` possui `finance`, `inventory` e `crm`.

Onde e criada:

- `src/components/modals/GlobalCategoryQuickAdd.tsx`: cria categoria global com `name`, `domain` e `parent_id`.
- `src/repositories/globalCategoryRepository.ts`: salva em `global_categories`.

Onde e lida:

- `src/repositories/globalCategoryRepository.ts`: `getByDomain(domain)`.
- `src/hooks/finance/useFinanceData.ts`: carrega `getGlobalCategories('finance')`.
- `src/hooks/useMasterData.ts`: carrega `crm`, `inventory` e `finance`.
- `src/components/modals/QuickCreateModal.tsx`: carrega `crm` para cliente/fornecedor e `inventory` para produto/insumo.
- `src/components/modals/CostCenterQuickAdd.tsx`: carrega `finance`.

Onde e exibida/usada:

- Financeiro: `ObligationForm` monta opcoes hierarquicas de categorias globais financeiras.
- Cadastro rapido: `QuickCreateModal` permite escolher categoria global por dominio.
- Centro de custo: `CostCenterQuickAdd` vincula um centro de custo a uma categoria global financeira via `cost_centers.categories`.

Resposta direta: `global_categories` **nao e ainda o sistema oficial unico**. E uma camada nova parcialmente aplicada, convivendo com categorias legadas textuais.

## 4. Categoria legada `category`

Usos encontrados:

- `financial_obligations.category`: categoria textual do lancamento. Editada/criada no formulario financeiro junto de `global_category_id`. Usada por chips, Dashboard, DRE e agrupamentos legados.
- `clients.category`: segmentacao textual de CRM. Usada em MasterData, PDF e sugestao de categoria no financeiro.
- `suppliers.category`: categoria textual de fornecedor. Usada como fallback de sugestao financeira.
- `suppliers.default_sub_category`: subcategoria textual padrao para contas a pagar. Criada no cadastro rapido quando seleciona categoria global, mas pode divergir.
- `products.category`: tipo/categoria textual do produto. Usada por MasterData, ProductForm e BudgetEditor.
- `insumos.category`: categoria textual de estoque. Usada em busca, listagem, selecao de tecidos e cadastro de insumo.
- `budget_lines.category`: categoria textual de linha orcamentaria gerencial.

Risco geral: `category` concorre com `global_category_id`. Quando ambos existem, nao ha garantia de sincronismo apos edicao, importacao, cadastro rapido ou migracao.

## 5. Categorias no financeiro

Fluxo atual observado:

1. Usuario abre novo lancamento em `Finance.tsx`.
2. `ObligationForm` recebe `globalCategories` de dominio `finance`.
3. Ao selecionar categoria, `handleCategoryChange` grava dois estados: `category = found.name` e `globalCategoryId = found.id`.
4. `useObligationForm` envia `category` e `global_category_id` para `storageService.createRecurrenceObligations`.
5. `financeRepository.createRecurrenceObligations` envia `p_category` e `p_global_category_id` para a RPC.
6. `useFinanceData` le obrigacoes via `obligation_summary`.
7. `useFinanceFilters` resolve o nome global por `global_category_id` e cai para `category` se nao achar global.
8. `categoryBreakdown` usa `getCategoryName`, portanto prefere categoria global resolvida e soma `remaining_amount`.

Achado importante: no arquivo `supabase/schema_live.sqlnpx`, a assinatura da RPC `create_recurrence_obligations` tem `p_global_category_id`, mas o `INSERT` mostrado no schema local nao inclui a coluna `global_category_id`. O mesmo aparece em `supabase/security_hardening_single_tenant.sql`. Isso contradiz o contexto de que o SQL aplicado ja persiste `global_category_id`. Pode ser schema local desatualizado ou patch SQL local nao refletido.

Hoje o financeiro usa **as duas** categorias: global para UI/filtro novo e textual para compatibilidade, chips e relatorios legados.

Riscos especificos:

- `Dashboard.tsx` usa `t.category` para impostos, CPV, despesas e top despesas.
- `src/utils/finance.ts` agrupa por `t.category`, ignorando `global_category_id`.
- `ObligationCard` e `CategoryChip` exibem `ob.category`, nao nome global resolvido.
- Se a RPC nao persistir `global_category_id`, o filtro global perde consistencia.

## 6. Categorias em clientes

Cadastro completo:

- `MasterData.tsx` injeta `CategorySelect` com listas de `app_settings` em `ClientForm`.
- O campo salvo e `clients.category`.
- O formulario completo nao mostra seletor de `global_category_id`.

Cadastro rapido:

- `QuickCreateModal` para `client` carrega `globalCategories('crm')`.
- Salva `global_category_id`, mas nao salva `category` textual.

Uso:

- `BudgetPreviewModal` e `pdfService` exibem `client.category`.
- `useObligationForm.handleClientChange` usa `cli.category` como fallback de sugestao financeira.

Risco: cliente criado rapido pode ter `global_category_id` sem `category`; PDF/preview e sugestao financeira baseada em `category` podem nao enxergar a categoria.

## 7. Categorias em fornecedores

Campos:

- `suppliers.category`: categoria textual geral.
- `suppliers.global_category_id`: categoria global CRM.
- `suppliers.default_cost_center_id`: centro de custo sugerido.
- `suppliers.default_sub_category`: categoria/subcategoria textual sugerida para financeiro.

Cadastro completo:

- `SupplierForm` edita `category` textual via `CategorySelect`.
- Permite escolher `default_cost_center_id`.
- Nao encontrei campo visivel para editar `default_sub_category` no formulario completo.

Cadastro rapido:

- `QuickCreateModal` para `supplier` seleciona categoria global CRM, grava `global_category_id` e tambem grava `default_sub_category = category`.
- Nao grava `supplier.category`.

Uso no financeiro:

- `useObligationForm.handleSupplierChange` aplica `default_cost_center_id` e chama sugestao com `sup.default_sub_category || sup.category`.

Resposta direta: fornecedor consegue sugerir categoria e centro de custo **parcialmente**. Centro de custo funciona se preenchido; categoria depende de `default_sub_category`/`category`, nao diretamente de `global_category_id`.

## 8. Categorias em produtos

Campos:

- `products.category`: categoria/tipo textual.
- `products.global_category_id`: categoria global de dominio `inventory`.

Cadastro completo:

- `ProductForm` usa `CategorySelect` textual vindo de `app_settings`.
- `ProductForm` usa `productCategoryMetas[data.category]` para auto-preencher consumo de tecido.
- `MasterData` salva meta de categoria de produto em `app_settings` (`meta_cat_product`).

Cadastro rapido:

- `QuickCreateModal` para `product` seleciona categoria global de `inventory`.
- Ao selecionar global, seta `productType = found.name`.
- Salva `category = productType` e `global_category_id`.

Uso:

- `BudgetEditor` e producao usam produtos, precos e ficha tecnica; categoria de produto nao vira categoria financeira automaticamente.

Risco: categoria de produto e categoria financeira sao conceitos diferentes, mas podem ter nomes parecidos. Produto rapido cria dado real com preco/categoria, mas pode ficar sem ficha tecnica completa.

## 9. Categorias em insumos/estoque

Campos:

- `insumos.category`: categoria textual.
- `insumos.global_category_id`: categoria global inventory.

Cadastro/listagem:

- `Inventory.tsx` usa `lookup_values` com `category = 'insumo_category'` para opcoes.
- `InventoryTab.tsx` usa input textual livre para categoria.
- `QuickCreateModal` para `insumo` usa global inventory e salva `category = category || 'Tecidos'`.

Uso:

- `inventoryRepository.getInsumosPaginated` pesquisa por `name` ou `category`.
- `BudgetEditor` filtra tecidos por `!i.category` ou categoria `tecidos`/`tecido`.
- Listagens exibem `item.category`.

Risco: compras financeiras de insumos nao sao automaticamente classificadas pela categoria do insumo. Relatorio de estoque por categoria pode ser fraco se houver categoria textual livre ou vazia.

## 10. Centros de custo

Tabela: `cost_centers` possui `id`, `user_id`, `name`, `type`, `color`, `budget_limit`, `is_active`, `categories`.

Onde cria/edita:

- `MasterData.tsx`/`FinancialTab` criam centros de custo e permitem adicionar/remover subcategorias textuais/ids no array `categories`.
- `CostCenterQuickAdd` cria centro de custo rapido e vincula uma categoria global financeira em `categories`.
- `financeRepository.saveCostCenter` salva apenas colunas reais da tabela.

Onde usa:

- Financeiro permite selecionar `cost_center_id`.
- Fornecedor pode sugerir `default_cost_center_id`.
- `Dashboard.tsx` usa centro de custo de tipo `production` para CPV.
- `budget_lines` usa `cost_center_id` e `category`.

Resposta direta: centro de custo funciona como dimensao gerencial **opcional**, nao como dimensao obrigatoria real. Ele afeta alguns relatorios, mas nao ha regra exigindo preenchimento.

## 11. Categorias em filtros e relatorios

| Relatorio/Filtro | Arquivo | Campo usado | Valor somado | Risco |
|---|---|---|---|---|
| Filtro financeiro por categoria | `src/hooks/finance/useFinanceFilters.ts` | `category`, `global_category_id`, nome global | n/a | Medio: tenta cobrir ambos |
| Busca textual financeira | `src/hooks/finance/useFinanceFilters.ts` | nome global ou `category` | n/a | Baixo/medio |
| `categoryBreakdown` | `src/hooks/finance/useFinanceFilters.ts` | nome global preferencial, fallback `category` | `remaining_amount` | Medio: depende da view trazer `global_category_id` |
| DRE Dashboard | `src/pages/Dashboard.tsx` | `category`, `cost_center_id` | pago usa `paid_amount`, aberto usa `original_amount` | Alto: ignora global e mistura conceitos |
| Top receitas/despesas Dashboard | `src/utils/finance.ts` | `category` | pago usa `paid_amount`, aberto usa `remaining_amount` | Alto: ignora global |
| Export PDF executivo | `src/pages/Dashboard.tsx` | `category` | pago usa `paid_amount`, aberto usa `remaining_amount` | Medio |
| Chip no card financeiro | `FinanceComponents.tsx`, `ObligationCard.tsx` | `category` | n/a | Medio: pode nao exibir global |
| Estoque paginado | `inventoryRepository.ts` | `insumos.category` | n/a | Medio |
| PDF cliente/orcamento | `pdfService.ts` | `client.category` | n/a | Baixo/medio |

## 12. Categorias rapidas e criacao rapida

`QuickCreateModal` cria dados reais no banco, mas com campos reduzidos:

- Cliente rapido: nome, telefone, address como cidade/estado, contato, `global_category_id`; nao preenche `category`, CNPJ, email completo.
- Fornecedor rapido: nome, contato, `global_category_id`, `default_sub_category`; nao preenche `category`, centro de custo, CNPJ, email.
- Produto rapido: nome, preco, `category`, `global_category_id`; nao cria ficha tecnica/BOM.
- Insumo rapido: nome, custo, `category`, `global_category_id`, unidade default `m`, estoque 0, minimo 0.

Resposta direta: cadastro rapido cria dado real, mas incompleto. Isso pode afetar orcamento, producao, estoque e classificacao financeira.

## 13. Dependencias entre categorias

| Origem da categoria | Alimenta | Depende de | Falha se estiver vazio |
|---|---|---|---|
| `supplier.default_sub_category` | sugestao em conta a pagar | fornecedor selecionado | conta nasce sem categoria sugerida |
| `supplier.default_cost_center_id` | centro de custo em conta a pagar | fornecedor selecionado | conta nasce sem centro de custo |
| `financial_obligations.global_category_id` | filtro e breakdown financeiro novo | RPC/view persistirem e retornarem | relatorio agrupa por fallback textual |
| `financial_obligations.category` | chips, Dashboard, DRE legado | nome textual salvo | relatorios legados mostram "Sem categoria" |
| `products.category` | meta de produto e calculadora | lista em app_settings | consumo sugerido nao aplica |
| `insumos.category` | filtro/estoque e selecao de tecido | cadastro ou lookup | estoque por categoria fica fraco |
| `cost_centers.categories` | vinculo gerencial futuro | categoria global financeira | hoje pouco aproveitado em relatorios |

## 14. Inconsistencias e riscos encontrados

### Critico

Descricao: schema local da RPC nao persiste `global_category_id`.

Evidencia: `financeRepository.createRecurrenceObligations` envia `p_global_category_id`, mas `schema_live.sqlnpx` e `security_hardening_single_tenant.sql` mostram `INSERT` sem coluna `global_category_id`.

Arquivos: `src/repositories/financeRepository.ts`, `supabase/schema_live.sqlnpx`, `supabase/security_hardening_single_tenant.sql`.

Cenario: usuario cria obrigacao com categoria global; filtro tenta agrupar por global, mas registro nasce sem UUID.

Impacto: relatorios globais e filtros por categoria ficam incompletos.

Sugestao futura: confirmar schema real no Supabase e alinhar SQL local/aplicado.

Exige decisao de negocio: nao, e integridade tecnica.

### Alto

Descricao: Dashboard/DRE ainda usa `category` textual e ignora `global_category_id`.

Evidencia: `Dashboard.tsx` filtra impostos/CPV/despesas por `t.category`.

Cenario: lancamento com global preenchida e category vazia/diferente nao entra na linha correta.

Impacto: DRE e PDF executivo podem ficar errados.

Sugestao futura: criar resolvedor oficial de categoria financeira.

Exige decisao de negocio: sim, definir fonte oficial.

### Alto

Descricao: cadastro completo e cadastro rapido salvam categorias diferentes.

Evidencia: MasterData completo usa `app_settings`/`category`; QuickCreate usa `global_category_id` e em alguns casos nao preenche `category`.

Cenario: cliente criado rapido aparece sem categoria no PDF e nao sugere corretamente no financeiro.

Impacto: CRM e financeiro perdem segmentacao.

Sugestao futura: unificar estrategia de cadastro.

Exige decisao de negocio: sim.

### Medio

Descricao: `financial_categories` existe e repository salva, mas UI financeira atual usa `global_categories`.

Evidencia: `financeRepository.getFinancialCategories/saveFinancialCategory`, `CategoryModal`; `useFinanceData` carrega `financialCategories`, mas Finance usa `globalCategories`.

Impacto: manutencao confusa e risco de usuario/admin criar categoria no sistema errado.

Sugestao futura: declarar legada ou migrar.

### Medio

Descricao: `cost_centers.categories` guarda ids de categorias globais, mas o app ainda exibe como `REF` e nao usa consistentemente para relatorios.

Evidencia: `CostCenterQuickAdd` salva ids; `SupplierForm` mostra `cc.categories[0]`; Dashboard usa `cost_center_id` e tipo `production`, nao `categories`.

Impacto: expectativa de DRE automatico pode nao corresponder ao resultado.

### Medio

Descricao: categorias de insumo divididas entre `lookup_values`, texto livre e global inventory.

Evidencia: `Inventory.tsx` usa lookup; `InventoryTab.tsx` usa input livre; `QuickCreateModal` usa global.

Impacto: estoque por categoria e selecao de tecidos podem ficar inconsistentes.

## 15. Regras de negocio implicitas

| Regra implicita | Onde aparece | Risco | Deve virar regra formal? |
|---|---|---|---|
| Categoria financeira e opcional | `ObligationForm`, RPC aceita null | relatorios com "Sem categoria" | Sim |
| Categoria global convive com categoria textual | Finance, MasterData, schema | divergencia | Sim |
| Fornecedor pode sugerir categoria financeira | `useObligationForm` | sugestao incompleta se fornecedor sem default | Sim |
| Centro de custo e opcional | Financeiro e supplier | DRE gerencial incompleta | Sim |
| Categoria de produto nao e categoria financeira | ProductForm/Dashboard | nomes parecidos confundem | Sim |
| Categoria de insumo nao vira compra financeira | Inventory/Finance | compras por categoria nao batem estoque | Sim |
| Cadastro rapido pode criar registro incompleto | QuickCreateModal | operacao segue com dado fraco | Sim |

## 16. Perguntas de negocio sobre categorias

1. Categoria global deve substituir `category` legada?
2. `category` legada deve ser mantida, migrada ou removida?
3. Categoria financeira deve ser obrigatoria?
4. Centro de custo deve ser obrigatorio?
5. Cliente precisa de categoria obrigatoria?
6. Fornecedor precisa de categoria obrigatoria?
7. Produto precisa de categoria obrigatoria?
8. Insumo precisa de categoria obrigatoria?
9. Categoria de produto deve influenciar financeiro?
10. Categoria de insumo deve influenciar contas a pagar?
11. Fornecedor deve sugerir categoria automaticamente?
12. O sistema deve permitir categoria textual livre?
13. Deve existir dominio separado para financeiro, estoque, produto, cliente e fornecedor ou os dominios atuais bastam?
14. Como tratar categorias duplicadas com nomes semelhantes?
15. Como migrar registros antigos?
16. Relatorios devem agrupar por categoria global, categoria legada ou ambas?
17. Centro de custo deve ser dimensao obrigatoria para DRE?
18. Fornecedor sem categoria deve bloquear criacao de conta a pagar?

## 17. Recomendacoes futuras

### Camada 1 - Seguranca de relatorio

Prioridade: alta. Esforco: medio. Impacto: alto. Risco de nao fazer: DRE e categoriaBreakdown divergentes. Dependencias: decidir fonte oficial.

- Criar resolvedor unico para categoria financeira: preferir `global_category_id` quando existir, fallback controlado para `category`.
- Ajustar Dashboard/DRE/export para usar o resolvedor.
- Confirmar se `obligation_summary` retorna `global_category_id` real em producao.

### Camada 2 - Padronizacao

Prioridade: alta. Esforco: medio/alto. Impacto: alto. Risco de nao fazer: categorias duplicadas permanentes. Dependencias: decisao de negocio.

- Declarar `global_categories` como oficial ou manter `category` como oficial.
- Definir se `financial_categories` sera desativada, migrada ou reaproveitada.
- Definir obrigatoriedade por dominio.

### Camada 3 - Migracao

Prioridade: media. Esforco: alto. Impacto: alto. Risco de nao fazer: historico quebrado. Dependencias: mapeamento de categorias equivalentes.

- Mapear nomes textuais para `global_categories`.
- Preencher `global_category_id` em registros historicos.
- Manter fallback ate validar relatorios.

### Camada 4 - UX

Prioridade: media. Esforco: medio. Impacto: medio. Risco de nao fazer: dados incompletos. Dependencias: regras de obrigatoriedade.

- Avisar quando cadastro rapido criar cliente/produto/insumo incompleto.
- Evitar categoria textual livre se global for oficial.
- Mostrar nome da categoria global nos cadastros completos.

### Camada 5 - Gestao CFO

Prioridade: media. Esforco: alto. Impacto: alto. Risco de nao fazer: DRE, caixa e estoque com leituras fracas. Dependencias: categorias e centros de custo padronizados.

- Separar relatorios por categoria financeira, centro de custo, produto, cliente e insumo.
- Definir como compras de insumo conversam com categoria financeira.
- Definir categoria gerencial para impostos, CPV, despesas comerciais e administrativas.

## Arquivos inspecionados

- `src/pages/Finance.tsx`
- `src/pages/FinanceComponents.tsx`
- `src/hooks/finance/useFinanceData.ts`
- `src/hooks/finance/useFinanceFilters.ts`
- `src/hooks/finance/useObligationForm.ts`
- `src/hooks/finance/usePaymentModal.ts`
- `src/repositories/financeRepository.ts`
- `src/services/storage.ts`
- `src/components/modals/QuickCreateModal.tsx`
- `src/components/modals/GlobalCategoryQuickAdd.tsx`
- `src/components/modals/CostCenterQuickAdd.tsx`
- `src/components/masterdata/CategorySelect.tsx`
- `src/components/masterdata/ClientForm.tsx`
- `src/components/masterdata/SupplierForm.tsx`
- `src/components/masterdata/ProductForm.tsx`
- `src/components/masterdata/ProductInsumosForm.tsx`
- `src/pages/MasterData.tsx`
- `src/hooks/useMasterData.ts`
- `src/hooks/useMasterDataActions.ts`
- `src/pages/Budgets.tsx`
- `src/components/budgets/BudgetEditor.tsx`
- `src/hooks/useBudgetController.ts`
- `src/services/budgetService.ts`
- `src/pages/Orders.tsx`
- `src/hooks/useOrders.ts`
- `src/pages/Dashboard.tsx`
- `src/pages/Inventory.tsx`
- `src/pages/masterdata/InventoryTab.tsx`
- `src/repositories/inventoryRepository.ts`
- `src/repositories/crmRepository.ts`
- `src/repositories/settingsRepository.ts`
- `src/repositories/globalCategoryRepository.ts`
- `src/utils/constants.ts`
- `src/utils/finance.ts`
- `src/utils/index.ts`
- `src/types/index.ts`
- `supabase/schema_live.sqlnpx`
- `supabase/security_hardening_single_tenant.sql`

## Arquivos solicitados mas nao encontrados

- `src/hooks/useFinanceFilters.ts`
- `src/hooks/useObligationForm.ts`
- `src/hooks/usePaymentModal.ts`
- `src/repositories/productRepository.ts`
- `src/repositories/supplierRepository.ts`
- `src/repositories/clientRepository.ts`


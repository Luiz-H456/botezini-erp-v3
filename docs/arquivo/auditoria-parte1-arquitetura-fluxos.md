# Auditoria de Regra de Negócio do ERP - Parte 1

Escopo desta parte: arquitetura, estrutura real do projeto, modelo de dados, autenticação, permissões e fluxos principais ponta a ponta.

Data da leitura: 02/06/2026.

## 0. Estrutura Real Lida Antes Desta Parte

Esta auditoria foi guiada pela estrutura retornada por `rg --files`, não por nomes presumidos.

```text
raiz
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.api.json
├── index.html
├── postcss.config.js
├── README.md
├── .env.example
├── api/
│   ├── dbSchema.ts
│   └── tsconfig.json
├── docs/
│   ├── APP_ARCHITECTURE.md
│   ├── C4-Context.md
│   ├── INTEGRATION_PLAN.md
│   ├── MANUAL_OPERACAO_E_PROXIMOS_PASSOS.md
│   ├── RESTYLING_PLAN.md
│   ├── VISUAL_SYSTEM.md
│   └── implementation_plan.md
├── llm/
│   ├── AGENT_RULES.md
│   ├── PROJECT_CONTEXT.md
│   └── skills/
├── public/
│   └── favicon.png
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── config/env.ts
│   ├── services/
│   │   ├── auth.ts
│   │   ├── budgetService.ts
│   │   ├── idService.ts
│   │   ├── pdfService.ts
│   │   ├── storage.ts
│   │   └── supabase.ts
│   ├── repositories/
│   │   ├── attachmentRepository.ts
│   │   ├── budgetRepository.ts
│   │   ├── crmRepository.ts
│   │   ├── financeRepository.ts
│   │   ├── globalCategoryRepository.ts
│   │   ├── inventoryRepository.ts
│   │   ├── orderRepository.ts
│   │   ├── productionRepository.ts
│   │   └── settingsRepository.ts
│   ├── hooks/
│   │   ├── finance/
│   │   │   ├── useFinanceActions.ts
│   │   │   ├── useFinanceData.ts
│   │   │   ├── useFinanceFilters.ts
│   │   │   ├── useFinanceKPIs.ts
│   │   │   ├── useObligationForm.ts
│   │   │   └── usePaymentModal.ts
│   │   ├── useBudgetController.ts
│   │   ├── useFinanceQueries.ts
│   │   ├── useFilteredPaginatedData.ts
│   │   ├── useInventoryQueries.ts
│   │   ├── useMasterData.ts
│   │   ├── useMasterDataActions.ts
│   │   ├── useOrders.ts
│   │   ├── useProduction.ts
│   │   └── useToast.ts
│   ├── pages/
│   │   ├── Budgets.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Finance.tsx
│   │   ├── FinanceComponents.tsx
│   │   ├── Inventory.tsx
│   │   ├── Login.tsx
│   │   ├── MasterData.tsx
│   │   ├── Orders.tsx
│   │   ├── Production.tsx
│   │   └── masterdata/
│   ├── components/
│   │   ├── budgets/
│   │   ├── common/
│   │   ├── finance/
│   │   ├── masterdata/
│   │   ├── modals/
│   │   └── orders/
│   ├── types/
│   │   ├── finance.ts
│   │   └── index.ts
│   └── utils/
│       ├── constants.ts
│       ├── currency.ts
│       ├── date.test.ts
│       ├── date.ts
│       ├── errorHandling.ts
│       ├── finance.ts
│       └── index.ts
└── supabase/
    ├── cleanup_old_test_data.sql
    ├── fix_reverse_payment_function.sql
    ├── patch_insumo_movements.sql
    ├── patch_inventory_lookup.sql
    ├── schema_botezini.sql
    ├── schema_dev_snapshot.json
    ├── schema_live.sqlnpx
    ├── schema_official.sql
    ├── security_hardening_single_tenant.sql
    └── test_finance_queries.sql
```

## 1. Sumário Executivo

O sistema é um ERP web para operação de uma empresa de confecção/produção sob encomenda. O fluxo humano central é:

Cliente e produto -> orçamento -> pedido -> produção/fábrica -> entrega -> financeiro -> dashboard/relatórios.

O front-end é React + TypeScript com Vite. O backend real é Supabase: tabelas, views, RLS, RPCs e storage. Não há um backend próprio tradicional; `api/dbSchema.ts` existe, mas os fluxos de negócio lidos usam majoritariamente Supabase direto via repositories.

Fato: as regras de negócio não estão concentradas em uma única camada. Elas aparecem em:

- UI/páginas: navegação, status, conversão orçamento -> pedido, ações de confirmação.
- Hooks: montagem de payload financeiro, filtro, baixa, produção.
- Repositories: chamadas Supabase, criação de ids, upserts, RPCs.
- SQL/RPC: pagamento, estorno, cancelamento, recorrência, RLS, triggers de estoque.

Risco estrutural: como regras críticas estão espalhadas, a mesma regra pode divergir entre dashboard, financeiro, pedido e banco.

## 2. Stack e Dependências

Evidência: `package.json`.

| Camada | Fato encontrado | Evidência |
|---|---|---|
| Front-end | React 18 + Vite 7 + TypeScript | `package.json`, scripts `dev`, `build`, `preview` |
| UI | Tailwind/PostCSS + lucide-react + Recharts | `package.json` |
| Banco/backend | Supabase JS v2 | `@supabase/supabase-js`, `src/services/supabase.ts` |
| Relatórios | jsPDF + jspdf-autotable | `package.json`, `src/services/pdfService.ts` |
| Estado/dados | React hooks, React Query em partes de estoque/cadastros | `@tanstack/react-query`, `src/hooks/useInventoryQueries.ts` |
| Validação formal | `zod` instalado, mas uso não foi encontrado nos fluxos principais lidos | `package.json`; uso não confirmado |
| Deploy | Vercel provável, pela pasta `.vercel` e Vite build | `.vercel/`, `vite.config.ts`; configuração completa não foi auditada nesta parte |

## 3. Como o App Abre e Roteia

O app não usa React Router. Ele usa estado local `currentView` em `src/App.tsx`.

Fluxo real:

1. `App.tsx` inicia em `currentView = 'login'`.
2. `checkSession()` chama `authService.getCurrentProfile()`.
3. Se houver perfil, marca autenticado.
4. Se `role === 'factory'`, a tela inicial vira `production`.
5. Caso contrário, a tela inicial vira `dashboard`.
6. `renderContent()` escolhe a página por `switch`.

Evidência:

- Lazy imports de páginas: `src/App.tsx`, linhas aproximadas 4-12.
- `checkSession`: `src/App.tsx`, linhas aproximadas 35-62.
- bloqueio de navegação para factory: `src/App.tsx`, linhas aproximadas 74-79.
- layout separado para factory: `src/App.tsx`, linhas aproximadas 148-203.
- menu admin/manager: `src/App.tsx`, linhas aproximadas 214-223.

Mapa de páginas reais:

| View | Página | Papel humano |
|---|---|---|
| `login` | `src/pages/Login.tsx` | Entrada e validação de acesso |
| `dashboard` | `src/pages/Dashboard.tsx` | Indicadores executivos |
| `budgets` | `src/pages/Budgets.tsx` | Orçamentos |
| `orders` | `src/pages/Orders.tsx` | Pedidos |
| `production` | `src/pages/Production.tsx` | Fábrica/kanban produtivo |
| `inventory` | `src/pages/Inventory.tsx` | Insumos/estoque |
| `finance` | `src/pages/Finance.tsx` | Contas, bancos, pagamentos |
| `masterdata` | `src/pages/MasterData.tsx` | Cadastros gerais |

## 4. Supabase e Ambiente

O Supabase é inicializado apenas se `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existirem.

Evidência:

- `src/config/env.ts`: lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, define `SUPABASE_ENABLED`.
- `src/services/supabase.ts`: cria `createClient` com `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`.
- `src/services/auth.ts`: login indisponível quando `SUPABASE_ENABLED` é falso.

Regra humana:

- Sem `.env.local` válido, o sistema entra em modo restrito e o login falha.
- Com Supabase configurado, a sessão fica persistida pelo client Supabase.

## 5. Autenticação e Perfis

Roles encontradas em TypeScript:

- `admin`
- `manager`
- `factory`

Evidência:

- `src/types/index.ts`, linhas aproximadas 27-32: `UserRole = 'admin' | 'manager' | 'factory'`.
- `src/App.tsx`, linhas aproximadas 85-89: labels de role.
- `supabase/security_hardening_single_tenant.sql`, linhas aproximadas 8-40: `current_user_role`, `is_admin_or_manager`, `is_factory`.
- `supabase/schema_live.sqlnpx`, linhas aproximadas 1253-1263: tabela `profiles` com `role default 'factory'`.

Quadro de acesso:

| Role | Acesso no front | Acesso real no banco/RLS | Risco |
|---|---|---|---|
| `admin` | Layout completo | Policies `single_tenant_admin_manager_all` liberam tudo para admin/manager | Admin depende do perfil em `profiles`; se perfil incorreto, acesso muda |
| `manager` | Layout completo | Mesmas policies de admin/manager | Manager tem poder amplo; não há granularidade fina por módulo no código lido |
| `factory` | Apenas produção no front | Policies permitem SELECT em `clients`, `orders`, `products`, `insumos`, `product_insumos` e UPDATE em `orders` | Factory não vê menu financeiro, mas banco permite atualizar `orders`; escopo exato do UPDATE precisa ser vigiado |

Risco/observação: antes do hardening, havia indício de policies por `owner`. No schema vivo há tanto policies `owner` quanto `single_tenant_admin_manager_all` e `single_tenant_factory_*`. Em modelo single-tenant isso pode ser aceitável, mas precisa garantir que as policies antigas não contrariem a política operacional.

## 6. Camadas Reais

### UI/pages

As páginas fazem mais do que renderizar. Algumas criam registros em outros módulos:

- `Budgets.tsx` converte orçamento em pedido e cria recebível.
- `Finance.tsx` calcula caixa projetado localmente e dispara RPCs financeiras.
- `Dashboard.tsx` mistura dados de várias fontes e calcula DRE/indicadores.
- `Production.tsx` dispara avanço de etapa via hook.

### Hooks

Hooks coordenam estado, filtros, validações e chamadas:

- `useBudgetController.ts`: carrega budgets, products, clients, companyProfile, orders.
- `useOrders.ts`: carrega pedidos, recebíveis e ações de salvar/excluir.
- `useProduction.ts`: monta colunas, avanço de etapa, verificação de estoque.
- `useFinanceData.ts`: carrega obrigações, bancos, clientes, fornecedores, categorias.
- `useFinanceFilters.ts`: filtros, totais, categoryBreakdown.
- `useObligationForm.ts`: criação de obrigação, parcelamento, recorrência, split e baixa imediata.
- `usePaymentModal.ts`: baixa, upload de anexos, validação de excedente.

### Services

`storageService` é uma fachada. Ele expõe métodos de CRM, estoque, financeiro, categorias, anexos e orçamentos, delegando para repositories.

Evidência: `src/services/storage.ts`, linhas aproximadas 1-159.

### Repositories

Repositories fazem acesso real ao Supabase:

- `FinanceRepository`: `financial_obligations`, `obligation_summary`, `obligation_payments`, `bank_accounts`, RPCs.
- `InventoryRepository`: `insumos`, `insumo_movements`, `product_insumos`, `products`, `orders`.
- `OrderRepository`: `orders` e efeitos financeiros em pedidos concluídos/entregues.
- `ProductionRepository`: `orders`, `product_insumos`, `insumos` e criação de recebível na entrega.
- `BudgetRepository`: `budgets`.
- `CrmRepository`: `clients`, `suppliers`, `company_profile`.
- `AttachmentRepository`: bucket `financial-attachments`.
- `GlobalCategoryRepository`: `global_categories`.
- `SettingsRepository`: `lookup_values`, `app_settings`, defaults.

### SQL/Supabase

O banco concentra regras críticas:

- RLS e roles.
- `pay_obligation`
- `reverse_payment`
- `cancel_obligation`
- `create_recurrence_obligations`
- `recalculate_all_bank_balances`
- `get_cash_position`
- `get_cashflow_series`
- `get_liquidity_kpis`
- trigger `update_insumo_stock_and_cost`

## 7. Modelo de Dados Encontrado

Fonte: `supabase/schema_live.sqlnpx`, linhas aproximadas 739-1447 para tabelas, 1848-1900 para `obligation_summary`, 2234-2602 para RLS/policies.

| Tabela/view | Classificação | Finalidade humana | Quem usa no código | Observações/riscos |
|---|---|---|---|---|
| `profiles` | ativa | perfil do usuário e role | `authService.getCurrentProfile`, `App.tsx`, RLS | default `factory`; admin/manager precisam ajuste humano |
| `company_profile` | ativa | dados da empresa | `CrmRepository`, `Login`, `Dashboard`, `MasterData` | logo/dados institucionais |
| `clients` | ativa | clientes | CRM, orçamento, pedidos, financeiro, factory SELECT | cliente rápido pode ser incompleto |
| `suppliers` | ativa | fornecedores | CRM, estoque, financeiro | default cost center/categoria aparece em hooks financeiros |
| `products` | ativa | produtos vendáveis | orçamento, pedidos, produção, cadastros | produto rápido pode nascer sem ficha técnica |
| `insumos` | ativa | matéria-prima/estoque | estoque, ficha técnica, produção | estoque controlado por movimentos e trigger |
| `insumo_movements` | ativa | entradas/saídas de estoque | estoque | trigger atualiza `insumos.current_stock` |
| `product_insumos` | ativa | ficha técnica/BOM | produto, produção | ausência agora bloqueia avanço de produção; ainda não baixa estoque automaticamente |
| `budgets` | ativa | orçamentos | `BudgetRepository`, `Budgets.tsx` | itens/customizações/extras em JSON |
| `orders` | ativa | pedidos/produção | Orders, Production, InventoryRepository, OrderRepository | itens/customizações/extras em JSON dificultam relatório |
| `financial_obligations` | ativa | contas a pagar/receber | Finance, Budgets, Orders, Production | fonte principal do financeiro |
| `obligation_payments` | ativa | pagamentos/recebimentos/estornos | Finance RPCs e modal | estorno cria registro novo com `reversal_of` |
| `obligation_summary` | ativa, crítica | view de saldo/status financeiro | `FinanceRepository.getObligations` | divergência: schema versionado mostra filtro só por `reversed_at IS NULL`; regra esperada é também `reversal_of IS NULL` |
| `bank_accounts` | ativa | contas bancárias | Finance | saldo atual pode ser recalculado por RPC |
| `global_categories` | ativa | categoria unificada por domínio | CRM, estoque, financeiro | convive com campos legados `category` |
| `cost_centers` | ativa | centros de custo | Finance, cadastros, fornecedores | opcional na UI; recomendado definir regra |
| `financial_categories` | parcialmente usada | categoria financeira antiga | FinanceRepository ainda lê/salva | pode ser legado frente a `global_categories` |
| `budget_lines` | parcialmente usada | orçamento gerencial mensal | Finance/Dashboard | não é orçamento comercial |
| `cash_snapshots` | parcialmente usada | fechamento/conferência de caixa | FinanceRepository | código trata como deprecated/missing em catch |
| `invoices` | parcialmente usada/incerta | documento/fatura | OrderRepository deleta por order_id; InvoiceModal visual | integração fraca |
| `lookup_values` | ativa de suporte | listas de unidade/categoria | Settings/Inventory | escrita bloqueada por policy hardening em algumas versões |
| `app_settings` | ativa de suporte | configurações locais/sync | SettingsRepository | usa localStorage + banco |
| `audit_logs` | uso incerto | auditoria | schema/RLS | não encontrei escrita ativa no TypeScript principal |
| `transactions_table` | aparentemente legada | transações antigas | schema/view `transactions`; código atual não escreve | risco de confusão com financeiro ativo |
| `transactions` view | aparentemente legada | compatibilidade de transações | não encontrei uso direto atual | risco de relatórios antigos |
| `payable_accounts_table` | aparentemente legada | contas a pagar antigas | schema/view `payable_accounts`; código atual não escreve | risco de duplicidade conceitual |
| `payable_accounts` view | aparentemente legada | compatibilidade | não encontrei uso direto atual | manter bloqueado ou documentado |
| `product_materials` | uso incerto | materiais alternativos | schema | código usa `product_insumos`, não esta tabela |
| `sectors` | uso incerto | setores/WMS | schema | escrita bloqueada em policy |
| `wms_categories` | paralela/incerta | WMS | schema/RLS; não encontrei integração com pedidos | sistema paralelo ao estoque real |
| `wms_items` | paralela/incerta | WMS | schema/RLS | não conectado à produção lida |
| `wms_item_variations` | paralela/incerta | WMS | schema/RLS | não conectado à produção lida |
| `wms_stock_items` | paralela/incerta | WMS | schema/RLS | não conectado à produção lida |
| `wms_stock_movements` | paralela/incerta | WMS | schema/RLS | não conectado à produção lida |

## 8. Fluxo Principal Ponta a Ponta

### 8.1 Mapa operacional

```text
Usuário admin/manager
  -> Orçamentos
  -> cria orçamento com cliente, produtos, customizações, extras e pagamento
  -> salva em budgets
  -> converte para pedido
  -> cria orders
  -> cria financial_obligations receivable
  -> pedido aparece em Orders e Production
  -> produção avança etapas
  -> ao entregar/concluir pode garantir recebível se não existir
  -> financeiro baixa/estorna/cancela
  -> dashboard lê obrigações, bancos, pedidos e estoque
```

### 8.2 Mapa técnico

| Tela | Ação | Hook/service | Repository/RPC | Tabela/view | Efeito |
|---|---|---|---|---|---|
| Login | Entrar | `authService.signIn` | Supabase auth | `auth.users`, `profiles` | sessão e perfil |
| Budgets | Salvar orçamento | `storageService.saveBudget` | `BudgetRepository.save` | `budgets` | cria/atualiza orçamento |
| Budgets | Converter | `storageService.saveOrder`, `createObligation`, `saveBudget` | `InventoryRepository.saveOrder`, `FinanceRepository.createObligation`, `BudgetRepository.save` | `orders`, `financial_obligations`, `budgets` | cria pedido, recebível e marca orçamento convertido |
| Orders | Excluir/reverter | `useOrders.deleteOrder` | `OrderRepository.deleteOrderWithCascade` | `financial_obligations`, `invoices`, `orders`, `budgets` | cancela recebíveis, deleta invoice/order, reseta budget |
| Production | Avançar etapa | `useProduction.handleAdvanceStage` | `ProductionRepository.getShortages`, `saveOrderStage` | `product_insumos`, `insumos`, `orders` | valida BOM/estoque, atualiza etapa/status |
| Inventory | Entrada/saída | `useInventoryMutations` | `InventoryRepository.saveInsumoMovement` | `insumo_movements` + trigger em `insumos` | altera estoque e custo médio |
| Finance | Criar obrigação | `useObligationForm` | `create_recurrence_obligations` ou insert direto | `financial_obligations` | cria contas pagar/receber |
| Finance | Baixar | `usePaymentModal` | `pay_obligation` | `obligation_payments`, `bank_accounts` | cria pagamento e altera saldo |
| Finance | Estornar | `Finance.tsx` -> repository | `reverse_payment` | `obligation_payments`, `bank_accounts` | marca original, cria estorno, ajusta saldo |
| Finance | Cancelar | `Finance.tsx` -> repository | `cancel_obligation` | `financial_obligations` | cancela se sem pagamentos ativos |
| Finance | Conciliar | `Finance.tsx` -> repository | `toggle_reconciliation` | `financial_obligations` | altera flag de conciliação |
| Dashboard | Ver indicadores | `storageService` | repositories/RPCs | várias | calcula visão gerencial |

## 9. Fluxo de Orçamento

Fato: orçamento é criado/editado pelo componente `BudgetEditor`.

Evidências:

- `src/pages/Budgets.tsx`, linhas aproximadas 93-94: `handleSaveBudget` chama `storageService.saveBudget`.
- `src/components/budgets/BudgetEditor.tsx`, linhas aproximadas 192-218: monta `Budget` com itens, pagamento e totais.
- `src/components/budgets/BudgetEditor.tsx`, linhas aproximadas 337, 465, 503: cadastro rápido de cliente/produto/insumo.
- `src/components/modals/QuickCreateModal.tsx`, linhas aproximadas 55-111: cria cliente, fornecedor, produto ou insumo com campos mínimos.

Regras reais:

- Cliente é selecionado no orçamento; cadastro rápido de cliente exige nome, mas os demais campos são opcionais.
- Produto rápido cria `products` com `name`, `price_tier1`, `category`, `global_category_id`; não cria `product_insumos`.
- Insumo rápido cria `insumos` com `unit = 'm'`, `current_stock = 0`, `min_stock = 0`, `average_unit_cost` vindo de preço.
- Orçamento salva JSONs: `items`, `customizations`, `extras`.
- Orçamento não baixa estoque.
- Orçamento não cria financeiro ao salvar; financeiro nasce na conversão.

Risco: como itens são JSON em `budgets`, relatórios SQL por item/produto/customização ficam difíceis.

## 10. Conversão Orçamento -> Pedido

Fato: a conversão está em `src/pages/Budgets.tsx`.

Evidências:

- `handleConvertClick`: linhas aproximadas 108-193.
- Cria `Order`: linhas aproximadas 121-153.
- `storageService.saveOrder(order)`: linha aproximada 156.
- Cria recebível via `storageService.createObligation`: linhas aproximadas 160-170.
- Marca budget como `Converted`: linha aproximada 172.
- Rollback tenta cancelar recebível e excluir pedido: linhas aproximadas 181-192.

Regra real hoje:

- Pedido nasce com `status = OrderStatus.PENDING`.
- `payment_status` vira `PARTIAL` se `down_payment_value > 0`, senão `PENDING`.
- O recebível criado é pelo total do orçamento, com `order_id = order.id`.
- A entrada/sinal entra como nota sugerida, mas não vi criação separada de entrada + saldo.
- Se falhar após criar recebível, rollback tenta cancelar obrigação.
- Se falhar após criar pedido, rollback tenta excluir pedido.

Resposta clara:

- Financeiro nasce na conversão orçamento -> pedido.
- O código também tenta garantir recebível quando pedido é concluído/entregue em `OrderRepository.saveOrder` e `ProductionRepository.saveOrderStage`.
- Hoje o modelo implementado parece um recebível único por pedido.
- Não confirmado: regra de negócio final sobre múltiplos recebíveis por pedido, sinal + saldo ou 30/60/90.

Risco: sem constraint única em `financial_obligations.order_id`, a idempotência depende do código verificar existência antes de criar. O schema lido tem índice em `order_id`, mas não vi unique constraint.

## 11. Fluxo de Pedidos

Evidências:

- `src/hooks/useOrders.ts`, linhas aproximadas 34-38: carrega budgets, clients, products, companyProfile e receivables.
- `src/pages/Orders.tsx`, linhas aproximadas 187-193: busca recebível por descrição `Pedido #` ou `notes === order.id`.
- `src/repositories/orderRepository.ts`, linhas aproximadas 55-111: exclusão em cascata/cancelamento financeiro.
- `src/repositories/orderRepository.ts`, linhas aproximadas 132-166: cria recebível na conclusão/entrega se não existir.

Regras reais:

- Pedidos ficam em `orders`.
- Itens, customizações e extras também são JSON.
- Exclusão/reversão tenta cancelar recebíveis relacionados por `order_id` ou fallback `notes = order_id`.
- Invoices são deletadas por `order_id`, mas a criação/uso operacional de invoices não está forte no fluxo principal lido.
- Pedido não baixa estoque diretamente.
- Produção usa pedido como base.

Riscos:

- Pedido pode existir sem recebível se conversão falhar antes de financeiro e rollback falhar.
- Recebível pode existir sem pedido se delete/rollback falhar.
- Alterar valor de pedido depois da criação não garante atualização do recebível.
- Vínculo por descrição em alguns pontos é frágil.

## 12. Produção e Estoque no Fluxo Principal

Produção:

- `useProduction.ts` separa pedidos ativos e concluídos.
- Etapas: `WAITING`, `CUTTING`, `CUSTOMIZATION`, `SEWING`, `FINISHING`, `LOGISTICS`.
- Ao sair de `WAITING`, chama `ProductionRepository.getShortages`.
- `getShortages` lê `product_insumos` e `insumos`.
- Avanço atualiza `orders.production_stage` e status.

Estoque:

- Insumos vivem em `insumos`.
- Movimentos vivem em `insumo_movements`.
- Trigger SQL `update_insumo_stock_and_cost` altera `insumos.current_stock` e `average_unit_cost`.
- Produção verifica estoque, mas não encontrei baixa automática de estoque ao avançar etapa.

Risco: o ERP sabe dizer se falta material, mas ainda não transforma produção em consumo real de estoque.

## 13. Status Encontrados

Fonte principal: `src/types/index.ts`.

| Domínio | Status encontrados | Onde |
|---|---|---|
| Pedido | `Pendente`, `Em Produção`, `Concluído`, `Entregue`, `Cancelado` | `OrderStatus` |
| Produção | `Aguardando Material`, `Corte`, `Personalização`, `Costura`, `Finalização`, `Transporte` | `ProductionStage` |
| Pagamento do pedido | `Pendente`, `Parcial`, `Pago` | `PaymentStatus` |
| Financeiro salvo | `open`, `partial`, `paid`, `cancelled`/texto | `financial_obligations.status` |
| Financeiro derivado | `open`, `partial`, `paid`, `overdue`, `cancelled` | `obligation_summary.derived_status` |
| Orçamento | `Draft`, `Sent`, `Approved`, `Rejected`, `Converted` ou strings equivalentes na UI | `Budgets.tsx` |
| Conta bancária | `is_active` boolean | `bank_accounts` |
| Conciliação | `is_reconciled`, `unreconciled_reason`, `unreconciled_at` | `financial_obligations` |

Risco: há strings soltas e enums convivendo. Exemplo: `OrderRepository.saveOrder` compara status com strings literais `Concluído` e `Entregue`.

## 14. Dependências Entre Módulos

| Módulo | Depende de | Alimenta | Risco se incompleto |
|---|---|---|---|
| Cadastros | Supabase, categorias | Clientes, fornecedores, produtos, insumos | dados incompletos contaminam tudo |
| Orçamentos | clientes, produtos, insumos | pedidos, financeiro | orçamento com produto sem BOM vira problema na fábrica |
| Pedidos | orçamento, cliente, produto | produção, financeiro | pedido alterado não recalcula recebível automaticamente |
| Produção | pedido, `product_insumos`, `insumos` | status do pedido | verifica estoque, mas não baixa automaticamente |
| Estoque | insumos, movimentos | produção, custo de produto | estoque manual demais |
| Financeiro | pedido, cliente, fornecedor, banco, categoria | dashboard/CFO | inconsistências geram caixa errado |
| Dashboard | todos os módulos | decisão gerencial | mistura de conceitos pode induzir decisão errada |

Fonte de verdade por assunto:

- Autenticação/perfil: `profiles` + Supabase Auth.
- Cliente/fornecedor/produto/insumo: tabelas respectivas.
- Estoque físico sistêmico: `insumos.current_stock`, atualizado por `insumo_movements`.
- Ficha técnica: `product_insumos`.
- Pedido: `orders`.
- Financeiro: `financial_obligations` + `obligation_payments` + `obligation_summary`.
- Saldo bancário: `bank_accounts.current_balance`.

## 15. Conclusões da Parte 1

Fatos:

- A aplicação é um ERP single-tenant com três perfis: admin, manager e factory.
- O front usa roteamento por estado em `App.tsx`.
- O Supabase é o backend efetivo.
- `storageService` centraliza a API de aplicação, mas não centraliza as regras.
- O financeiro ativo é `financial_obligations`/`obligation_payments`/`obligation_summary`.
- O estoque ativo é `insumos`/`insumo_movements`/`product_insumos`.
- Existem sistemas paralelos/legados no schema: `transactions_table`, `payable_accounts_table`, `wms_*`, `product_materials`.

Suspeitas fundamentadas:

- Dashboard, financeiro e SQL ainda têm divergências conceituais em algumas métricas.
- A conversão orçamento -> pedido assume recebível único, mas o negócio ainda precisa confirmar se aceita múltiplos recebíveis.
- A produção ainda não consome estoque automaticamente.

Perguntas abertas para auditoria de regra:

1. O pedido deve gerar um único recebível ou múltiplos recebíveis por entrada/parcelas?
2. O financeiro deve nascer na conversão, aprovação, entrega ou conclusão?
3. Alterar pedido depois de convertido deve alterar o recebível?
4. Produção deve apenas verificar estoque ou também reservar/baixar estoque?
5. `wms_*` deve ser removido, integrado ou mantido como futuro módulo separado?
6. DRE deve ser competência por valor contratado ou caixa por valor pago/recebido?


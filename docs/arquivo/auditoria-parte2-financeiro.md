# Auditoria de Regras de Negocio ERP - Parte 2

Financeiro completo, coerencia entre TypeScript e Supabase, contas a pagar, contas a receber, saldos, categorias, relatorios e riscos.

Data da leitura: 02/06/2026

## 1. Estrutura real usada nesta parte

Antes de analisar o financeiro, estes foram os arquivos reais encontrados e usados como base. Arquivos citados em auditorias anteriores, mas nao existentes hoje, foram tratados como ausentes.

```text
src/pages/Finance.tsx
src/pages/FinanceComponents.tsx
src/pages/Dashboard.tsx
src/hooks/finance/useFinanceData.ts
src/hooks/finance/useFinanceFilters.ts
src/hooks/finance/useFinanceActions.ts
src/hooks/finance/useObligationForm.ts
src/hooks/finance/usePaymentModal.ts
src/hooks/useFinanceQueries.ts
src/components/finance/ObligationForm.tsx
src/components/finance/PaymentModal.tsx
src/components/finance/ObligationCard.tsx
src/components/finance/CashflowChart.tsx
src/components/finance/CashSimulator.tsx
src/components/finance/CategoryPieChart.tsx
src/components/finance/AttachmentViewer.tsx
src/repositories/financeRepository.ts
src/repositories/attachmentRepository.ts
src/repositories/orderRepository.ts
src/repositories/productionRepository.ts
src/services/storage.ts
src/types/index.ts
src/types/finance.ts
src/utils/currency.ts
src/utils/index.ts
supabase/schema_live.sqlnpx
supabase/security_hardening_single_tenant.sql
supabase/schema_botezini.sql
supabase/test_finance_queries.sql
```

Observacao importante: `src/utils/financeUtils.ts`, citado em anotacoes anteriores, nao existe na estrutura atual. As funcoes `groupTransactionsByCategory`, `calculateProjectMargins` e `calculateProductionOccupancy` sao importadas de `src/utils` por `src/pages/Dashboard.tsx`, mas nao ha arquivo separado `financeUtils.ts`.

## 2. Visao funcional do financeiro

Fato: o financeiro ativo do ERP gira em torno de obrigacoes financeiras.

- Contas a receber e contas a pagar ficam em `financial_obligations`.
- Pagamentos, baixas e estornos ficam em `obligation_payments`.
- A leitura principal do app usa a view `obligation_summary`.
- Saldos bancarios ficam em `bank_accounts`.
- Categorias aparecem em dois modelos ao mesmo tempo: campo textual legado `category` e FK `global_category_id`.
- Centro de custo fica em `cost_center_id`.
- Anexos ficam no bucket Supabase Storage `financial-attachments` e tambem sao referenciados em JSON nas obrigacoes ou pagamentos.

Suspeita: o desenho atual esta entre um financeiro operacional e um financeiro gerencial. Ele ja baixa, estorna, concilia e projeta caixa, mas ainda nao separa formalmente competencia, caixa realizado, saldo em aberto, desconto, juros e multa em campos auditaveis proprios.

## 3. Fonte da verdade financeira

### 3.1 Obrigacoes

Fonte principal no TypeScript:

- `src/repositories/financeRepository.ts:242` le `obligation_summary`.
- `src/hooks/finance/useFinanceData.ts` carrega obrigacoes via `storageService.getObligations()`.
- `src/pages/Finance.tsx` consome as obrigacoes ja resumidas.
- `src/pages/Dashboard.tsx` tambem usa `storageService.getObligations()`.

Campos criticos expostos em `src/types/index.ts`:

- `original_amount`: valor contratado/original.
- `paid_amount`: soma dos pagamentos ativos.
- `remaining_amount`: saldo restante.
- `payment_count`: quantidade de pagamentos ativos.
- `paid_pct`: percentual pago.
- `derived_status`: status calculado pelo banco.
- `status`: status gravado na tabela base.
- `cancelled_at`, `cancelled_reason`.
- `is_reconciled`, `unreconciled_reason`, `unreconciled_at`.
- `global_category_id`, `category`, `cost_center_id`.
- `order_id`.

Conclusao: o front depende corretamente da view para saldos e status na maior parte das telas. O risco aparece quando a view ou RPCs do banco nao usam a mesma regra de pagamento ativo.

### 3.2 Regra correta de pagamento ativo

Regra esperada pelos fixes SQL informados:

```sql
reversed_at IS NULL
AND reversal_of IS NULL
```

Significado:

- Pagamento original ativo: `reversed_at IS NULL` e `reversal_of IS NULL`.
- Pagamento original estornado: `reversed_at IS NOT NULL`.
- Registro de estorno: `reversal_of IS NOT NULL`.
- Registro de estorno nao deve contar como pagamento ativo.

### 3.3 Divergencia encontrada no SQL versionado

Fato: `src/hooks/finance/usePaymentModal.ts:47` ja filtra pagamentos ativos com `!p.reversed_at && !p.reversal_of`.

Fato: `supabase/schema_live.sqlnpx:500-501` no recalc de saldo bancario usa `op.reversed_at IS NULL AND op.reversal_of IS NULL`.

Risco: `supabase/schema_live.sqlnpx` ainda mostra varios pontos usando apenas `reversed_at IS NULL`:

- `supabase/schema_live.sqlnpx:60`: `cancel_obligation` considera qualquer pagamento sem `reversed_at`, incluindo registro de estorno.
- `supabase/schema_live.sqlnpx:280`: `get_cashflow_series` filtra apenas `op.reversed_at IS NULL`.
- `supabase/schema_live.sqlnpx:313`, `322`, `331`: `get_liquidity_kpis` filtra apenas `op.reversed_at IS NULL`.
- `supabase/schema_live.sqlnpx:436`: `pay_obligation` soma apenas `reversed_at IS NULL`.
- `supabase/schema_live.sqlnpx:1876-1878`: `obligation_summary` soma e conta apenas por `p.reversed_at IS NULL`.

Risco adicional: `supabase/security_hardening_single_tenant.sql:376` e `:530` tambem mostram filtros somente por `reversed_at IS NULL`.

Conclusao: ha divergencia entre a regra informada como aplicada no Supabase e os arquivos SQL atualmente versionados. Se o banco real ja foi corrigido, o reposititorio esta desatualizado. Se o arquivo `schema_live.sqlnpx` representa o banco real, o bug critico de estorno ainda existe.

## 4. Fluxos financeiros principais

### 4.1 Criar lancamento manual

Implementacao:

- UI real em `src/pages/FinanceComponents.tsx:952`.
- Wrapper em `src/components/finance/ObligationForm.tsx`.
- Hook em `src/hooks/finance/useObligationForm.ts`.
- Persistencia em `src/repositories/financeRepository.ts:319` via RPC `create_recurrence_obligations`.

Dados usados:

- Tipo: `payable` ou `receivable`.
- Descricao.
- Valor.
- Vencimento.
- Cliente ou fornecedor conforme tipo.
- Conta bancaria padrao opcional.
- Centro de custo opcional.
- Categoria textual e categoria global.
- Observacoes.
- Modo: simples, recorrente, parcelado ou dividido.
- Opcao "ja pago" para lancamento simples.

Campos obrigatorios no front:

- `description.trim()`
- `amount > 0`
- `due_date`

Campos opcionais:

- cliente, fornecedor, categoria, categoria global, centro de custo, conta bancaria, observacoes.

Efeitos:

- Para recorrencia, chama `createRecurrenceObligations`.
- Para lancamento simples e parcelado, tambem usa `createRecurrenceObligations` com `months: 1`.
- Se "ja pago" estiver ativo, apos criar a obrigacao chama `payObligation`.

Achado:

- O TypeScript envia `global_category_id` em `src/hooks/finance/useObligationForm.ts:115`, `:148` e `:174`.
- O repository passa `p_global_category_id` para a RPC em `src/repositories/financeRepository.ts:342`.
- Porem o SQL versionado `supabase/schema_live.sqlnpx:135-177` e `supabase/security_hardening_single_tenant.sql:626` recebem o parametro, mas o `INSERT` listado nao inclui a coluna `global_category_id`.
- Se o fix ja foi aplicado no Supabase, o schema versionado precisa ser atualizado para bater com a realidade.

### 4.2 Criar lancamento recorrente

Implementacao:

- `src/hooks/finance/useObligationForm.ts:111`.
- `src/repositories/financeRepository.ts:319`.
- RPC `create_recurrence_obligations`.

Regra observada:

- Aceita de 1 a 120 meses.
- Gera `recurrence_id` somente quando `p_months > 1`.
- Usa vencimento mensal por soma de meses.
- No TypeScript, o fluxo parcelado corrige overflow de datas como 31/01 para meses mais curtos.

Risco:

- O SQL versionado nao filtra ownership em checks de cliente, fornecedor, conta e pedido. Em single-tenant e com `assert_finance_access()` para admin/manager, isso e menos grave, mas ainda deixa a funcao dependente de papel global.
- O SQL versionado nao persiste `global_category_id`.

### 4.3 Dividir lancamento por categoria ou centro de custo

Implementacao:

- UI em `src/pages/FinanceComponents.tsx:1212-1253`.
- Logica em `src/hooks/finance/useObligationForm.ts:136-156`.

Regra observada:

- O usuario divide um lancamento em varias obrigacoes.
- Cada split tem valor, categoria, categoria global e centro de custo.
- O app valida visualmente que a soma dos splits bate com o valor total em `src/pages/FinanceComponents.tsx:1341` e desabilita salvar em `:1351`.
- O `split_group_id` nao existe como coluna no payload de split; o identificador e gravado em `notes` no formato `[SPLIT: id]`.

Risco:

- Como o agrupamento do split fica em texto de observacao, relatorios futuros de rateio ficam frageis.
- Pergunta de negocio: split deve ser uma relacao contabil formal ou apenas conveniencia visual?

### 4.4 Baixar pagamento

Implementacao:

- UI real em `src/components/finance/PaymentModal.tsx` e versao em `src/pages/FinanceComponents.tsx:553`.
- Logica em `src/hooks/finance/usePaymentModal.ts`.
- Persistencia em `src/repositories/financeRepository.ts:358`.
- RPC `pay_obligation`.

Regra no front:

- O valor inicial e `ob.remaining_amount`.
- Excedente e detectado quando `parsedAmount > ob.remaining_amount`.
- Pagamento parcial e aceito no modo normal.
- Fechamento com desconto e acrescimo estao bloqueados: `canSubmit` exige `settlementMode === 'normal'`.
- Pagamentos ativos exibidos filtram `!p.reversed_at && !p.reversal_of`.

Efeitos no banco:

- Insere `obligation_payments`.
- Atualiza saldo bancario com delta positivo em recebivel e negativo em pagavel.
- Atualiza `financial_obligations.status` com o `derived_status` da view.

Achado positivo:

- O bug de comparar excedente com `original_amount` nao aparece na estrutura atual. A comparacao usa `remaining_amount` em `src/hooks/finance/usePaymentModal.ts:35`.

Risco:

- Se a RPC `pay_obligation` no banco real estiver igual ao `schema_live.sqlnpx:432-438`, ela soma pagamentos ativos sem excluir `reversal_of IS NOT NULL`. Isso pode deixar o saldo restante errado apos estorno, apesar do front estar correto.

### 4.5 Estornar pagamento

Implementacao:

- Abertura por `src/hooks/finance/useFinanceActions.ts:106`.
- Execucao por `src/hooks/finance/useFinanceActions.ts:120-124`.
- Repository em `src/repositories/financeRepository.ts:387`.
- RPC `reverse_payment`.

Regra observada no SQL versionado:

- Bloqueia pagamento ja estornado.
- Bloqueia estornar um registro de estorno em `supabase/schema_live.sqlnpx:541`.
- Marca o pagamento original com `reversed_at`.
- Cria novo registro em `obligation_payments` com `reversal_of = pagamento_original`.
- Atualiza saldo bancario com delta inverso.
- Atualiza status da obrigacao pela view.

Risco:

- A logica de status apos estorno depende de `obligation_summary`. Se a view considerar registros de estorno como pagamento ativo, a obrigacao pode continuar como paga indevidamente.

### 4.6 Cancelar obrigacao

Implementacao:

- UI em `ObligationCard`, botao visivel quando nao esta cancelada.
- Handler em `src/hooks/finance/useFinanceActions.ts:74`.
- Execucao em `src/hooks/finance/useFinanceActions.ts:117-119`.
- Repository em `src/repositories/financeRepository.ts:397`.
- RPC `cancel_obligation`.

Regra observada:

- Front nao bloqueia localmente por `payment_count`.
- Banco decide se pode cancelar.

Risco:

- O SQL versionado `supabase/schema_live.sqlnpx:57-60` e `supabase/security_hardening_single_tenant.sql:525-530` ainda bloqueiam se existir pagamento com `reversed_at IS NULL`, o que inclui registro de estorno.
- Resultado esperado pela regra nova: obrigacao com todos os pagamentos estornados deve poder ser cancelada.
- Resultado possivel se schema versionado estiver no banco: cancelamento ainda falha apos estorno total.

### 4.7 Concilicao

Implementacao:

- Botao aparece se `ob.remaining_amount <= 0`, nao cancelada e nao conciliada em `src/pages/FinanceComponents.tsx:411`.
- Handler em `src/hooks/finance/useFinanceActions.ts:80`.
- RPCs em `financeRepository.ts`: `toggleReconciliation` e `undoReconciliation`.
- SQL em `supabase/schema_live.sqlnpx:621-645`.

Regra observada:

- Conciliacao e um booleano em `financial_obligations`.
- Desfazer conciliacao grava motivo e data.
- Nao foi encontrado vinculo formal com extrato bancario importado.

Risco:

- `toggle_reconciliation` e `undo_reconciliation` no schema versionado nao chamam `assert_finance_access()`. Com RLS e permissao de tabela pode funcionar, mas a RPC nao deixa a autorizacao explicita como `pay_obligation`, `reverse_payment` e `cancel_obligation`.
- Como nao ha extrato externo, conciliacao e declarativa/manual.

### 4.8 Recalcular saldos bancarios

Implementacao:

- Botao/confirmacao em `src/pages/Finance.tsx`, confirm target `recalculate_balances`.
- Repository em `src/repositories/financeRepository.ts:480`.
- RPC `recalculate_all_bank_balances`.

Regra observada:

- Recalcula `current_balance = initial_balance + somatorio dos pagamentos ativos`.
- Usa filtro correto no schema versionado: `op.reversed_at IS NULL AND op.reversal_of IS NULL`.

Achado positivo:

- O fallback `current_balance || initial_balance` nao foi encontrado em `financeRepository.ts`. O codigo usa `current_balance ?? initial_balance ?? 0` em `src/repositories/financeRepository.ts:137`, preservando saldo zero.

Risco:

- `saveBankAccount` permite gravar `current_balance` manualmente. Isso pode ser valido para ajuste inicial, mas precisa de regra de auditoria: saldo atual deve ser editavel manualmente depois que a conta tem movimentacao?

### 4.9 Anexos financeiros

Implementacao:

- Upload em `src/repositories/attachmentRepository.ts`.
- Bucket: `financial-attachments`.
- UI de anexos no pagamento em `src/hooks/finance/usePaymentModal.ts:99-120`.
- A RPC `pay_obligation` aceita `p_attachments`, mas o modal atual envia anexos como update da obrigacao, nao como anexo do pagamento no momento da baixa.

Risco:

- Ha dois lugares possiveis para anexos: `financial_obligations.attachments` e `obligation_payments.attachments`.
- O fluxo visual atual parece anexar comprovantes na obrigacao, nao necessariamente no pagamento especifico.
- Pergunta de negocio: comprovante deve pertencer ao pagamento, a obrigacao inteira, ou ambos?

## 5. Orcamento, pedido e recebivel

### 5.1 Conversao orcamento -> pedido

Implementacao:

- `src/pages/Budgets.tsx:109` bloqueia conversao se `budget.status === 'Converted'`.
- `src/pages/Budgets.tsx:156` salva pedido.
- `src/pages/Budgets.tsx:161-167` cria recebivel com `order_id`.
- `src/pages/Budgets.tsx:172` marca orcamento como convertido.
- Em erro, ha rollback tentando cancelar obrigacao e apagar pedido.

Efeito:

- Um pedido nasce a partir do orcamento.
- Um recebivel financeiro e criado imediatamente.
- O orcamento fica como convertido.

Risco de duplicidade:

- `src/repositories/orderRepository.ts:132-164` tambem cria recebivel quando pedido e salvo com status literal `'Concluído'` ou `'Entregue'`, mas antes verifica se ja existe obrigacao com `order_id`.
- `src/repositories/productionRepository.ts:88-115` tambem garante recebivel ao entregar/concluir, tambem checando `order_id`.
- Nao foi encontrada unique constraint em `financial_obligations.order_id`.
- Ha checagem por `order_id`, mas sem constraint a idempotencia ainda pode falhar em concorrencia ou chamadas simultaneas.

Recomendacao futura:

- Criar indice unico parcial para recebivel por pedido, se a regra for "um pedido gera no maximo um recebivel principal".
- Exemplo conceitual: `unique(order_id) where type = 'receivable' and cancelled_at is null`.
- Confirmar antes, pois pode haver regra de multiplos recebiveis por pedido em casos de parcelas.

### 5.2 Pedido concluido/entregue

Implementacao:

- `src/repositories/orderRepository.ts:132`.
- `src/repositories/productionRepository.ts:88`.

Regra observada:

- Se pedido chega a status final e nao existe recebivel por `order_id`, cria recebivel.
- Isso funciona como garantia para pedido que nao veio do fluxo de orcamento, ou para um recebivel ausente.

Risco:

- O sistema mistura status em portugues de pedido (`Concluído`, `Entregue`) com enums TypeScript que tambem existem em `src/types/index.ts`. Precisa padronizar para evitar fluxo financeiro nao disparar por string divergente.

## 6. Relatorios, indicadores e dashboard

### 6.1 Finance.tsx

Fato:

- `src/pages/Finance.tsx:131` soma saldos de contas ativas.
- `src/pages/Finance.tsx:146-159` calcula saldo projetado localmente com:
  - saldo bancario atual;
  - recebiveis futuros nao pagos/cancelados;
  - pagaveis em aberto;
  - usa `remaining_amount`.
- Listas de recebiveis e pagaveis exibem totais por `remaining_amount`.

Conclusao:

- O fluxo operacional principal do financeiro esta alinhado com a ideia de saldo em aberto.

### 6.2 useFinanceFilters

Fato:

- Filtros de valor minimo/maximo usam `remaining_amount`.
- Ordenacao por valor usa `remaining_amount`.
- KPIs de aberto, vencido e proximos vencimentos usam `remaining_amount`.
- `categoryBreakdown` usa `remaining_amount` em `src/hooks/finance/useFinanceFilters.ts:218`.

Ponto de atencao:

- `periodReceivable` e `periodPayable` usam `original_amount` para obrigacao paga e `remaining_amount` para nao paga em `src/hooks/finance/useFinanceFilters.ts:138-141`.
- Isso mistura "valor contratado/realizado" com "saldo em aberto" no mesmo indicador.

Pergunta de negocio:

- O card de periodo quer mostrar fluxo contratado do periodo ou saldo em aberto do periodo?
- Se for fluxo contratado, pago deveria usar `original_amount` e aberto tambem poderia usar `original_amount`.
- Se for caixa/saldo, pago deveria usar `paid_amount` e aberto `remaining_amount`.

### 6.3 Dashboard.tsx

Fato:

- Dashboard le obrigacoes e usa `remaining_amount` em projecoes e recebiveis.
- `src/pages/Dashboard.tsx:97-98` chama RPCs `getCashflowSeries` e `getLiquidityKPIs`.
- DRE em `src/pages/Dashboard.tsx:165` usa `paid_amount` quando pago e `original_amount` quando nao pago.
- Breakdown de despesas em `src/pages/Dashboard.tsx:269` usa `paid_amount` quando pago e `remaining_amount` quando nao pago.

Risco:

- A DRE esta mais proxima de uma visao de competencia/contratado, mas mistura pagamento realizado em itens pagos.
- O breakdown de despesas esta mais proximo de saldo em aberto/caixa.
- Os nomes dos indicadores precisam explicitar se medem:
  - valor contratado/original;
  - valor recebido/pago;
  - saldo em aberto.

Risco SQL:

- `getCashflowSeries` e `getLiquidityKPIs` no schema versionado nao excluem `reversal_of IS NOT NULL`. Se o banco real estiver assim, indicadores de caixa realizado e liquidez podem incluir registros de estorno como pagamento.

### 6.4 Funcoes utilitarias de dashboard

Fato:

- `src/pages/Dashboard.tsx:5` importa `groupTransactionsByCategory`, `calculateProjectMargins` e `calculateProductionOccupancy` de `src/utils`.
- O arquivo `src/utils/financeUtils.ts` nao existe.

Risco a investigar na Parte 4:

- Verificar onde essas funcoes estao definidas dentro de `src/utils`.
- Confirmar se ainda existe margem ficticia, capacidade fixa ou agrupamento por valor original.

## 7. Categorias, centros de custo e classificacao

### 7.1 Categorias globais

Usos encontrados:

- `clients.global_category_id`.
- `suppliers.global_category_id`.
- `products.global_category_id`.
- `insumos.global_category_id`.
- `financial_obligations.global_category_id`.
- `global_categories` carregada por dominio em `useFinanceData`.

No financeiro:

- O formulario permite selecionar/criar categoria global.
- O hook envia `global_category_id`.
- O repository envia `p_global_category_id`.
- O SQL versionado nao insere a coluna.

Impacto:

- Se o banco real nao tiver o fix, obrigacoes recorrentes/manuais criadas pela RPC perdem a categoria global.
- Isso quebra filtros, categoryBreakdown e relatorios por categoria.

### 7.2 Categoria textual legada

Campo:

- `financial_obligations.category`.

Uso:

- Ainda usado em busca/filtro e chip visual.
- Fallback para quando nao ha `global_category_id`.

Risco:

- Dupla fonte de verdade para classificacao financeira.
- A mesma obrigacao pode ter texto de categoria e `global_category_id` divergentes.

### 7.3 Centro de custo

Campo:

- `financial_obligations.cost_center_id`.

Uso:

- Criacao manual.
- Split de lancamento.
- Dashboard/DRE por centro de custo.

Risco:

- Pedido/orcamento nem sempre alimenta centro de custo automaticamente.
- Sem regra formal, relatorio por centro de custo depende de preenchimento manual.

## 8. Seguranca e permissoes no financeiro

Fato:

- O app tem papéis `admin`, `manager`, `factory`.
- `src/App.tsx` bloqueia usuario `factory` fora de producao.
- No banco, `assert_finance_access()` exige usuario autenticado e `is_admin_or_manager()`.
- RPCs criticas como `pay_obligation`, `reverse_payment`, `cancel_obligation` e `update_bank_balance` chamam `assert_finance_access()`.

Pontos positivos:

- Operacoes financeiras sensiveis estao atras de RPCs com `SECURITY DEFINER`.
- Usuario `factory` nao deveria executar financeiro.

Riscos:

- Algumas RPCs de conciliacao no schema versionado nao chamam `assert_finance_access()`.
- Em `single-tenant`, admin/manager possuem poder amplo. Isso esta alinhado com a confirmacao humana de que admin deve alterar/estornar o que precisar.
- Como o sistema e single-tenant, nao ha segregacao real por empresa. Nao tratar como multiempresa.

## 9. Bugs confirmados, descartados e pendentes

### Confirmados pelos arquivos atuais

1. Divergencia SQL sobre pagamento ativo.
   - Evidencia: `schema_live.sqlnpx` usa apenas `reversed_at IS NULL` em view, cashflow, liquidez, pay e cancel.
   - Impacto: estorno pode continuar entrando em saldos/status/relatorios.
   - Estado: precisa confirmar se o banco real ja esta diferente do arquivo.

2. Divergencia SQL sobre `global_category_id`.
   - Evidencia: TypeScript envia `p_global_category_id`, mas SQL versionado nao insere a coluna.
   - Impacto: categoria global pode nao persistir em obrigacoes criadas via RPC.
   - Estado: precisa confirmar no banco real.

3. Risco de duplicidade de recebivel por pedido sem constraint.
   - Evidencia: ha tres pontos que podem garantir/criar recebivel por `order_id`.
   - Impacto: duplicidade em concorrencia.
   - Estado: mitigado por checagem antes de criar, mas nao blindado.

4. Conceitos misturados em indicadores.
   - Evidencia: `useFinanceFilters` e `Dashboard` misturam `original_amount`, `paid_amount` e `remaining_amount` conforme status.
   - Impacto: indicador pode ser interpretado errado.
   - Estado: precisa decisao de negocio/nomeclatura.

5. Anexos de pagamento e obrigacao podem ter semantica duplicada.
   - Evidencia: RPC aceita anexos no pagamento, modal atual atualiza anexos da obrigacao.
   - Impacto: comprovante pode nao ficar vinculado ao pagamento especifico.

### Descartados pelos arquivos atuais

1. `current_balance || initial_balance`.
   - Resultado: nao encontrado.
   - Codigo atual usa `??` em `financeRepository.ts:137`.

2. Validacao de baixa excedente usando `original_amount`.
   - Resultado: nao encontrada no hook atual.
   - Codigo atual compara com `remaining_amount` em `usePaymentModal.ts:35`.

3. Front bloqueando cancelamento por `payment_count`.
   - Resultado: nao encontrado.
   - Cancelamento e delegado ao banco.

4. `financeUtils.ts` antigo.
   - Resultado: arquivo nao existe.

### Pendentes de confirmacao no Supabase real

1. `obligation_summary` no banco real ja usa `reversed_at IS NULL AND reversal_of IS NULL`?
2. `pay_obligation` no banco real ja soma pagamentos com o filtro duplo?
3. `cancel_obligation` no banco real ja ignora registros de estorno?
4. `get_cashflow_series` e `get_liquidity_kpis` no banco real ja excluem registros de estorno?
5. `create_recurrence_obligations` no banco real ja insere `global_category_id`?

## 10. Cenarios manuais de teste esperados

### 10.1 Pagamento total

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 100,00 em conta bancaria ativa.

Resultado esperado:

- `paid_amount = 100`.
- `remaining_amount = 0`.
- `derived_status = paid`.
- `payment_count = 1`.
- Saldo bancario muda em +100 para recebivel ou -100 para pagavel.
- Botao de conciliacao fica disponivel.

### 10.2 Estorno total

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 100,00.
3. Estornar o pagamento.

Resultado esperado:

- Pagamento original fica com `reversed_at`.
- Novo registro de estorno fica com `reversal_of = id_original`.
- `paid_amount = 0`.
- `remaining_amount = 100`.
- `derived_status = open` ou `overdue`, conforme vencimento.
- Saldo bancario volta ao valor anterior.

Observacao: este teste confirma se a view real esta corrigida.

### 10.3 Pagamento parcial

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 40,00.

Resultado esperado:

- `paid_amount = 40`.
- `remaining_amount = 60`.
- `derived_status = partial`.
- O modal informa saldo restante de R$ 60,00.

### 10.4 Estorno parcial

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 40,00.
3. Estornar o pagamento parcial.

Resultado esperado:

- `paid_amount = 0`.
- `remaining_amount = 100`.
- `derived_status = open` ou `overdue`.
- O registro de estorno nao entra como pagamento ativo.

### 10.5 Cancelamento apos estorno total

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 100,00.
3. Estornar o pagamento.
4. Tentar cancelar a obrigacao.

Resultado esperado:

- Cancelamento permitido.
- `derived_status = cancelled`.
- Se falhar com "existem pagamentos ativos", a RPC real ainda esta usando filtro antigo.

### 10.6 Tentativa de pagar acima do saldo restante

Passos:

1. Criar obrigacao de R$ 100,00.
2. Baixar R$ 40,00.
3. Tentar baixar R$ 70,00.

Resultado esperado:

- Front identifica excedente porque compara com `remaining_amount = 60`.
- `canSubmit` fica falso no modo excedente.
- Se houver chamada direta, RPC deve bloquear com "Payment amount exceeds remaining balance".

### 10.7 Conta bancaria com saldo zero

Passos:

1. Criar conta com `initial_balance = 100`.
2. Ajustar/recalcular para `current_balance = 0`.
3. Reabrir financeiro.

Resultado esperado:

- Exibir saldo 0.
- Nao voltar para 100 por fallback.
- Codigo atual usa `??`, entao o resultado esperado e preservacao do zero.

### 10.8 Obrigacao com categoria global

Passos:

1. Criar categoria global financeira.
2. Criar obrigacao manual com essa categoria.
3. Criar obrigacao recorrente com essa categoria.
4. Recarregar tela.

Resultado esperado:

- `global_category_id` persistido nas obrigacoes.
- Filtro por categoria encontra as obrigacoes.
- `categoryBreakdown` agrupa pelo nome da categoria global.

Observacao: se a categoria desaparecer, o banco real ainda nao insere `global_category_id` na RPC.

### 10.9 Tentativa de duplicar recebivel de pedido

Passos:

1. Converter um orcamento em pedido.
2. Verificar recebivel criado com `order_id`.
3. Salvar o mesmo pedido como `Concluído` ou `Entregue`.
4. Avancar pela producao ate entrega.

Resultado esperado:

- Permanece apenas um recebivel ativo por `order_id`, salvo regra contraria de parcelamento.
- Se houver duplicidade, falta constraint ou idempotencia transacional.

## 11. Perguntas para validar antes de correcoes novas

1. O banco real ja foi exportado depois dos fixes SQL de 02/06/2026?
2. Um pedido pode gerar mais de um recebivel por regra de parcelamento?
3. Desconto para liquidar deve alterar saldo da obrigacao ou gerar lancamento financeiro separado?
4. Juros/multa/acrescimo deve aumentar a obrigacao original ou virar lancamento separado?
5. Comprovante deve ficar no pagamento, na obrigacao ou em ambos?
6. Conciliacao precisa bater contra extrato bancario importado ou e apenas confirmacao manual?
7. Saldo bancario atual pode ser editado manualmente depois de haver pagamentos?
8. DRE deve seguir competencia, caixa realizado ou uma visao gerencial hibrida claramente nomeada?
9. Categorias textuais legadas devem continuar existindo ou migrar totalmente para `global_category_id`?
10. Centro de custo deve ser obrigatorio em contas a pagar, contas a receber ou apenas opcional?

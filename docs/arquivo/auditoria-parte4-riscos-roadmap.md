# Auditoria de Regras de Negocio ERP - Parte 4

Riscos, perguntas abertas, gaps gerenciais, limpeza, seguranca, deploy e roadmap de evolucao.

Data da leitura: 02/06/2026

## 1. Estrutura real usada nesta parte

Antes de consolidar riscos e roadmap, estes foram os arquivos reais usados como base.

```text
package.json
vite.config.ts
.env.example
api/dbSchema.ts
src/App.tsx
src/main.tsx
src/config/env.ts
src/services/auth.ts
src/services/supabase.ts
src/services/storage.ts
src/hooks/useFinanceQueries.ts
src/hooks/finance/*
src/pages/Login.tsx
src/pages/Dashboard.tsx
src/pages/Finance.tsx
src/pages/Production.tsx
src/pages/Inventory.tsx
src/pages/masterdata/InventoryTab.tsx
src/repositories/*
src/components/finance/*
src/pages/FinanceComponents.tsx
src/utils/finance.ts
supabase/schema_live.sqlnpx
supabase/security_hardening_single_tenant.sql
supabase/cleanup_old_test_data.sql
docs/MANUAL_OPERACAO_E_PROXIMOS_PASSOS.md
```

Tambem foram usadas as conclusoes das Partes 1, 2 e 3:

- `docs/auditoria-parte1-arquitetura-fluxos.md`
- `docs/auditoria-parte2-financeiro.md`
- `docs/auditoria-parte3-producao-estoque.md`

## 2. Riscos priorizados

### Criticos

| Risco | Evidencia | Arquivo/tabela | Impacto | Precisa investigar mais? |
| --- | --- | --- | --- | --- |
| Regra de pagamento ativo divergente entre SQL informado e SQL versionado | View/RPCs no `schema_live.sqlnpx` usam apenas `reversed_at IS NULL`; regra correta exige tambem `reversal_of IS NULL` | `obligation_summary`, `pay_obligation`, `cancel_obligation`, `get_cashflow_series`, `get_liquidity_kpis` | Estorno pode continuar contando como pagamento, distorcendo status, saldo e relatorios | Sim |
| `global_category_id` enviado pelo front pode nao persistir na RPC versionada | TypeScript envia `p_global_category_id`, mas SQL versionado nao insere a coluna no `INSERT` | `create_recurrence_obligations`, `financial_obligations` | Relatorios/filtros por categoria global podem ficar errados | Sim |
| Producao nao consome estoque automaticamente | Producao verifica `product_insumos` e `insumos`, mas nao cria `insumo_movements` | `productionRepository.ts`, `useProduction.ts`, `insumo_movements` | Pedido entregue sem baixa de estoque; estoque e CMV ficam irreais | Sim |
| Endpoint de diagnostico pode vazar informacao operacional se publicado | `api/dbSchema.ts` retorna `Object.keys(process.env)` quando nao encontra connection string | `/api/dbSchema` na Vercel, se ativo | Exposicao de nomes de variaveis e estrutura de banco | Sim |

### Altos

| Risco | Evidencia | Arquivo/tabela | Impacto | Precisa investigar mais? |
| --- | --- | --- | --- | --- |
| Recebivel de pedido sem unique constraint | Orcamento, orderRepository e productionRepository podem criar/garantir recebivel por `order_id`; ha checagem, mas nao constraint | `financial_obligations.order_id` | Duplicidade financeira em concorrencia ou bug de fluxo | Sim |
| Ruptura pode ser ignorada e pedido avanca | `StockShortageModal` chama `onForceAdvance` | `StockShortageModal.tsx`, `useProduction.ts` | Producao avanca sem estoque e sem pendencia formal | Sim |
| Tecido escolhido no orcamento pode nao afetar consumo | Producao usa BOM `product_insumos` por produto; nao usa `fabric_insumo_id` do item | `BudgetItem`, `OrderItem`, `getShortages()` | Verificacao de estoque pode usar material errado | Sim |
| Factory pode atualizar pedidos no banco | Policy `single_tenant_factory_update_orders` permite UPDATE em `orders` para role factory | `schema_live.sqlnpx:2598` | Factory pode mudar status/stage; precisa delimitar efeitos financeiros | Sim |
| Relatorios misturam conceitos financeiros | Dashboard e filtros usam combinacoes de `original_amount`, `paid_amount` e `remaining_amount` | `Dashboard.tsx`, `useFinanceFilters.ts`, `src/utils/finance.ts` | Gestor pode interpretar saldo aberto como receita ou competencia | Sim |

### Medios

| Risco | Evidencia | Arquivo/tabela | Impacto | Precisa investigar mais? |
| --- | --- | --- | --- | --- |
| Saldo/custo de insumo editavel diretamente | `saveInsumo` faz upsert do payload; telas editam cadastro de insumo | `insumos`, `inventoryRepository.ts` | Quebra trilha de estoque se saldo/custo forem editados fora de movimento | Sim |
| Sistemas paralelos/legados no schema | `transactions_table`, `payable_accounts_table`, `product_materials`, `wms_*` existem e tem policies/grants | Supabase schema | Manutencao confusa, relatorios consultando fonte errada | Sim |
| Concilicao e declarativa, nao ligada a extrato | `toggle_reconciliation` alterna booleano em obrigacao | `financial_obligations.is_reconciled` | Pode parecer conciliacao bancaria real sem ser | Sim |
| Capacidade de producao fixa | `factoryMaxCapacity = 5000` | `src/utils/finance.ts:111` | KPI de ocupacao pode ser ficticio | Sim |
| Duplicidade/transicao de componentes financeiros | `src/components/finance` importa utilitarios de `FinanceComponents.tsx`; wrappers indicam transicao | `components/finance`, `pages/FinanceComponents.tsx` | Duplicacao e risco de editar o componente errado | Sim |
| Logs de debug em runtime | `src/main.tsx`, `Inventory.tsx`, `InventoryTab.tsx`, `GlobalCategoryQuickAdd.tsx` | Front-end | Ruido em producao e exposicao de estado tecnico | Nao para risco, sim para limpeza |

### Baixos

| Risco | Evidencia | Arquivo/tabela | Impacto | Precisa investigar mais? |
| --- | --- | --- | --- | --- |
| `useFinanceQueries.ts` parece nao importado | Busca por import nao retornou uso; hook exporta queries antigas | `src/hooks/useFinanceQueries.ts` | Codigo morto/transicao | Sim antes de remover |
| Menções antigas a IA em documento | Encontradas em `docs/MANUAL_OPERACAO_E_PROXIMOS_PASSOS.md` | Docs | Ruido documental | Nao |
| Comentario "Assuming saveProduct exists" | Comentario em cadastro rapido | `QuickCreateModal.tsx` | Ruido/manutencao | Nao |

## 3. Estado atual de login e permissao

### Como o login funciona hoje

Fato:

- `src/pages/Login.tsx` chama `authService.signIn(email, password)`.
- `src/services/auth.ts` chama `supabase.auth.signInWithPassword`.
- Sessao e mantida pelo client Supabase em `src/services/supabase.ts` com persistencia local.
- Depois do login, `App.tsx` busca o profile do usuario em `profiles`.

### Por que aparece "Acesso negado"

Possibilidades com evidencia:

1. Chaves Supabase ausentes.
   - `authService.signIn()` joga erro de modo restrito quando `SUPABASE_ENABLED` e falso.
   - `Login.tsx` troca erros nao reconhecidos por "Acesso negado. Contate o administrador."
   - Isso bate com o erro de console relatado: "Sistema em Modo Restrito: Login indisponivel sem configuracao de servidor".

2. Usuario sem profile.
   - `authService.getCurrentProfile()` busca `profiles` por `id`.
   - Se profile nao existir ou RLS bloquear, retorna `null`.

3. Usuario novo com role `factory`.
   - Trigger `handle_new_user` cria profile com role default `factory`.
   - Isso nao deve impedir login; apenas manda o usuario para producao.
   - Para acessar financeiro/dashboard, o profile precisa ser `admin` ou `manager`.

Conclusao operacional:

- Para rodar localmente, `.env.local` precisa ter `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Para acessar areas administrativas, o usuario precisa existir em `auth.users` e ter linha em `profiles` com role `admin` ou `manager`.
- Se o usuario existe mas ve so producao, provavelmente esta como `factory`.

## 4. RLS e seguranca Supabase

### Pontos positivos

- RLS esta habilitado nas tabelas principais.
- Single-tenant foi assumido corretamente.
- Admin/manager tem policy ampla por `is_admin_or_manager()`.
- Factory tem select limitado e update em `orders`.
- RPCs financeiras mais sensiveis chamam `assert_finance_access()`.

### Pontos que exigem decisao

- Single-tenant significa que admin/manager pode ver e alterar todos os dados operacionais. Isso bate com sua confirmacao de que admin precisa poder alterar/estornar.
- Factory atualiza `orders`; precisa confirmar se pode entregar pedido, pois entrega pode garantir recebivel.
- `audit_logs` tem policy `deny_all` e tambem policy admin/manager no schema versionado. Precisa testar se admin consegue ler logs de auditoria, caso eles sejam usados.
- RPCs de conciliacao devem chamar `assert_finance_access()` explicitamente para manter padrao.

## 5. O que o ERP responde hoje para gestao

| Pergunta gerencial | Responde hoje? | Fonte atual | Confiabilidade |
| --- | --- | --- | --- |
| Quanto tenho em bancos/caixa? | Sim | `bank_accounts.current_balance` | Media/alta se saldos foram recalculados e pagamentos corretos |
| Quanto tenho a receber em aberto? | Sim | `obligation_summary.remaining_amount` | Alta se view corrigida |
| Quanto tenho a pagar em aberto? | Sim | `obligation_summary.remaining_amount` | Alta se view corrigida |
| O que vence hoje/atrasado? | Sim | `due_date` + `derived_status` | Alta se view corrigida |
| Quanto foi pago/recebido no periodo? | Parcial | `obligation_payments`, RPCs cashflow/liquidez | Media; RPCs precisam excluir `reversal_of` |
| Qual o lucro do mes? | Parcial | DRE em `Dashboard.tsx` | Media/baixa; mistura competencia, pago e aberto |
| Qual margem por pedido? | Parcial | `calculateProjectMargins` | Baixa/media; custo depende de contas vinculadas por cliente/nota/descricao |
| Qual produto vende mais? | Sim, gerencial | `orders.items` | Media; depende de pedidos criados corretamente |
| Qual produto da menos saida? | Sim, gerencial | `orders.items` | Media |
| Quanto tenho parado em estoque? | Sim | `insumos.current_stock * average_unit_cost` | Media; depende de estoque atualizado por movimentos |
| Qual insumo esta critico? | Sim | `current_stock <= min_stock` | Media/alta |
| Qual custo real de producao por pedido? | Nao plenamente | BOM/producao/financeiro desconectados | Baixa |
| Qual capacidade real da fabrica? | Nao | `factoryMaxCapacity = 5000` | Baixa |
| Qual pedido consumiu quais insumos? | Nao plenamente | `insumo_movements.reference_id` opcional | Baixa |

## 6. Codigo/tabelas candidatas a limpeza

Nao remover sem validacao final de importacao, build e regra de negocio.

### Limpeza de codigo

| Item | Evidencia | Acao recomendada |
| --- | --- | --- |
| Logs de bootstrap | `src/main.tsx` imprime modo e status Supabase sempre | Remover ou condicionar a DEV |
| Logs de cadastro de insumo | `src/pages/Inventory.tsx` e `src/pages/masterdata/InventoryTab.tsx` tem `console.log` de save | Remover em limpeza |
| Log de categoria global | `GlobalCategoryQuickAdd.tsx` imprime categoria criada | Remover |
| Comentario obsoleto | `QuickCreateModal.tsx` tem `// Assuming saveProduct exists` | Remover comentario |
| `useFinanceQueries.ts` | Nao foi encontrado import ativo; parece hook antigo com budget/cash snapshots | Confirmar com build/rg e remover se realmente morto |
| FinanceComponents monolitico | Componentes novos existem em `src/components/finance`, mas varios ainda dependem de `pages/FinanceComponents.tsx` | Consolidar depois da integridade financeira |
| `api/dbSchema.ts` | Endpoint diagnostico com pg e env inspection | Remover ou bloquear por auth/ambiente se nao for necessario |

### Limpeza documental

| Item | Evidencia | Acao recomendada |
| --- | --- | --- |
| Mencoes antigas a IA | `docs/MANUAL_OPERACAO_E_PROXIMOS_PASSOS.md` menciona `ai_jobs` | Remover se o objetivo e nao mencionar IA no projeto |

### Limpeza de banco

| Item | Evidencia | Acao recomendada |
| --- | --- | --- |
| `transactions_table` | Tabela e view legadas no schema; comentario em `orderRepository` diz removida/deprecated V3 | Confirmar se nao ha dados historicos uteis; depois desativar/arquivar |
| `payable_accounts_table` | Tabela legada de contas a pagar | Confirmar nao uso; migrar/arquivar/remover |
| `product_materials` | Schema tem tabela, codigo usa `product_insumos` | Confirmar legado; remover ou migrar |
| `wms_*` | Schema tem sistema WMS paralelo, codigo ativo usa `insumos` | Decidir: integrar, manter futuro modulo, ou remover |
| `budget_lines`, `cash_snapshots` | Repository trata como possivelmente deprecated/missing | Confirmar se ainda serao usados no financeiro gerencial |
| `ai_jobs` | Mencionado em manual como tabela antiga | Verificar se existe no Supabase real; remover se existir e nao for usada |

## 7. Roadmap recomendado

### Fase 0 - Sincronizar realidade do Supabase

Objetivo: parar de auditar contra arquivos divergentes.

1. Exportar schema real apos os fixes aplicados.
2. Comparar `obligation_summary`, `pay_obligation`, `cancel_obligation`, `get_cashflow_series`, `get_liquidity_kpis` e `create_recurrence_obligations`.
3. Atualizar `supabase/schema_live.sqlnpx` ou substituir por dump correto.
4. Rodar cenarios financeiros manuais da Parte 2.

Prioridade: critica.

### Fase 1 - Blindagem financeira

Objetivo: garantir que saldos e status nunca corrompem.

1. Confirmar filtro duplo em todos os calculos de pagamento ativo.
2. Criar teste SQL para pagamento, estorno, cancelamento e recalc.
3. Definir constraint/idempotencia de recebivel por pedido.
4. Definir semantica de DRE: competencia, caixa ou hibrido nomeado.
5. Padronizar categoria global e categoria textual.

Prioridade: critica/alta.

### Fase 2 - Regra de estoque/producao

Objetivo: alinhar producao com estoque real.

1. Decidir momento de consumo: reserva, inicio de producao, corte ou entrega.
2. Definir se consumo automatico cria `insumo_movements` com `reference_id = order.id`.
3. Definir rollback: cancelamento/reversao de pedido devolve estoque?
4. Decidir quem pode ignorar ruptura.
5. Usar `fabric_insumo_id` do pedido quando for diferente da BOM padrao.

Prioridade: alta.

### Fase 3 - Auditoria e permissao

Objetivo: tornar acoes sensiveis rastreaveis.

1. Revisar poderes de `factory`.
2. Colocar `assert_finance_access()` nas RPCs sensiveis que faltarem.
3. Criar trilha de auditoria para estorno, cancelamento, conciliacao, ajuste de saldo e estoque.
4. Remover endpoint diagnostico ou proteger por ambiente.
5. Definir quem pode editar saldo/custo de insumo.

Prioridade: alta/media.

### Fase 4 - Relatorios confiaveis

Objetivo: separar claramente indicadores.

1. Criar nomes explicitos: contratado, realizado, em aberto.
2. Revisar DRE.
3. Revisar margem por pedido para usar custo real ou marcar como "sem dados".
4. Substituir capacidade fixa por configuracao real.
5. Documentar definicoes de KPIs.

Prioridade: media.

### Fase 5 - Limpeza controlada

Objetivo: reduzir ruido sem quebrar historico.

1. Remover logs e comentarios obsoletos.
2. Remover docs antigas que mencionam modulo removido.
3. Confirmar e remover hooks nao importados.
4. Arquivar/remover tabelas legadas depois de backup.
5. Consolidar `FinanceComponents.tsx` e `src/components/finance`.

Prioridade: media/baixa.

## 8. Perguntas abertas para voce responder

### Financeiro

1. Um pedido pode ter mais de um recebivel ativo por parcelamento?
2. Desconto para liquidar vira lancamento separado ou altera a obrigacao?
3. Juros/multa/acrescimo vira lancamento separado ou altera a obrigacao?
4. DRE deve ser por competencia, caixa, ou gerencial hibrida?
5. Comprovante pertence ao pagamento, a obrigacao, ou ambos?
6. Saldo bancario pode ser editado manualmente depois de movimentado?
7. Categoria textual antiga deve desaparecer em favor de `global_category_id`?
8. Centro de custo deve ser obrigatorio em contas a pagar?

### Producao e estoque

1. Quando o estoque deve ser consumido?
2. Deve existir reserva de estoque antes do consumo?
3. Quem pode ignorar ruptura?
4. Tecido escolhido no orcamento deve substituir o tecido da ficha tecnica?
5. Pedido cancelado depois de consumir devolve estoque automaticamente?
6. Produto sem ficha tecnica pode ser vendido?
7. Saida manual deve exigir referencia e motivo?
8. WMS sera usado ou removido?

### Acesso e seguranca

1. Factory pode entregar pedido?
2. Factory pode alterar prazo/status ou apenas etapa?
3. Manager pode estornar/cancelar qualquer pagamento?
4. Admin deve poder alterar roles pelo app ou somente no Supabase?
5. Precisa de log obrigatorio para toda acao critica?

### Deploy e ambiente

1. O projeto sera somente Vite estatico na Vercel ou tera API serverless ativa?
2. `api/dbSchema.ts` ainda e necessario?
3. Existe ambiente staging separado do Supabase de producao?
4. O schema exportado `schema_live.sqlnpx` e realmente o dump mais recente?
5. Voce quer manter scripts de cleanup no repo ou mover para pasta de manutencao controlada?

## 9. Recomendacao objetiva de proximo passo

Nao comece por refatoracao visual.

Sequencia mais segura:

1. Confirmar se o Supabase real tem os fixes financeiros aplicados ou se o schema versionado esta desatualizado.
2. Rodar os 9 cenarios manuais da Parte 2.
3. Decidir a regra de consumo de estoque.
4. Corrigir somente o que for confirmado como critico/alto.
5. Depois limpar logs, endpoint diagnostico e codigo morto.

Sem essa ordem, o risco e melhorar aparencia/manutencao enquanto saldo financeiro e estoque continuam podendo divergir.

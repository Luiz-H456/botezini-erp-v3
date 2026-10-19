# Final review: Financeiro v3 (2adf801..d64389f)

Reviewer: senior code review, read-only. Branch `v3`, HEAD `d64389f`.

## How this was reviewed

- I read the packaged diff (`review-2adf801..d64389f.diff`, 4,980 lines) in five passes: (1) header, stat and the two SQL files; (2) pure utils and their tests; (3) the test-user script, App wiring and the four dialogs; (4) caixinhas components, ObligationForm/PaymentModal, kanban, hooks and repositories; (5) the four pages and the module shell.
- I also read the spec, the plan notes on reconciliation, `progress.md`, `restricoes.md`, the Task 10 review, and the code the diff calls but does not include: `usePcpKanban`, `usePaymentModal`, `useEnvelopes`, `ConfirmarOperacao`, `getObligations`/`getAllPaymentsComTeto`/`getContasPorObrigacao`, and `indexarContasPorObrigacao`.
- I ran read-only queries against the local `supabase_db_botezini-v3`:
  - security attributes and ACLs of the 5 replaced functions, compared with the 2026-10-06 production dump (they match);
  - every function or view that reads `obligation_summary` (the sweep is complete);
  - `reverse_payment` and `toggle_reconciliation` source;
  - `assert_finance_access`, `create_recurrence_obligations`, `revise_order_plan` source;
  - RLS on `financial_obligations`;
  - column types and the `max_rows` setting;
  - the conference SQL. Today it matches the controller checkpoint: 28,552.35 / 1,927.60 / 15,926.16 / 2,724.55 / livre 56,804.85.
- `node --test` passes 1357/1357. `tsc --noEmit` exits 0. The working tree was untouched.

---

## Declined to judge

- **Task 15 (menu wiring and deleting the old screens):** removed from scope by the user; it is replaced by the navigation project. The old and new screens coexist by design.
- **Duplicate client "Granha Ligas" (two cadastros) and the R$ 209,254.00 salary payment:** these are production data problems, not code problems. They are already reported to Luiz in the ledger.
- **`global_categories` "Imposto" and "Cartão de crédito" marked `custo_do_produto=true`:** this is a data decision. Ruling 10's tax-precedence rule already neutralises "Imposto". The credit-card marking is Luiz's call.
- **`get_cash_position` is not SECURITY DEFINER, has no `assert_finance_access`, and is executable by `anon`:** this is pre-existing and identical in the production dump. The migration preserves it exactly, and RLS on the invoker-view protects the data.
- **`revise_order_plan` does not check the plan sum against the order total on the server, and it gives new parcels `installment_no` 1..n that collide with preserved ones:** this is a pre-existing RPC that the spec reuses as it is.
- **`orders.payment_plan` (the "intention") is not updated when the delivery window revises the plan:** the spec makes the obligations the source of truth and does not ask for it.
- **`PaymentModal`'s "today" uses `toISOString()` (UTC), which gives tomorrow's date after 21:00 BRT:** this is a pre-existing shared component. It is now reachable from "+ mais opções", so it is worth a ticket, but it is not this diff.
- **The 1,000-row cap on `inventoryRepository.getOrders` (`.limit(1000)`):** there are 44 orders, so this is far off. It is pre-existing.
- **The Início/Dashboard DRE that the spec says `caixa.ts` "extrai e substitui":** the Dashboard is outside this design (section 10), and removing the old DRE belongs to the navigation project.
- **Score do cliente and the margin warning moving to Comercial:** these are explicitly deferred to the Comercial design.
- **"Divisão entre centros de custo":** the spec says "aguarda". Hiding "+ DIVIDIR" in `enxuto` mode is consistent with that.
- **The navigation spec `2026-10-06-navegacao-por-objetivos-design.md`:** it is a document awaiting Luiz's review, not code in this range.
- **The `navegacao.test.ts` ceiling raised from 3 to 4:** this is provisional, and the ledger tracks restoring it.

---

## Critical

None. I found no defect that corrupts stored money, leaks data across roles, or breaks the production migration.

## Important

### I1. "Conferido" can silently un-reconcile an account while telling the user it is reconciled

**Where:** `src/components/financas/JanelaConferirBanco.tsx:39-44`

**The failure:**
- `toggle_reconciliation` is a toggle: `SET is_reconciled = NOT is_reconciled`. I confirmed this in the database.
- When it returns `false`, this click has just changed a reconciled account back to **un**-reconciled.
- The window then shows "Esta conta já foi conferida por outro usuário ou aba. A lista foi atualizada." Both statements are false: the account is now *not* reconciled, and `onAlterado()` is never called, so the list is not refreshed.

**How it happens:** the old Financeiro screen (it coexists by design) or a second tab reconciles the account while this window is open. The user clicks "conferido". The account ends un-reconciled, and the message says the opposite.

This is the Task 10 I1 fix done halfway. The reviewer offered "call the toggle again **or** show a message", and only the message was implemented.

**Fix:** on `novoEstado === false`:
1. Immediately call `toggleReconciliation(id)` again to restore `true`.
2. Add the id to `feitas`.
3. Call `onAlterado()`.

The cleaner fix is a `set_reconciliation(p_id, p_value boolean)` RPC in the next migration.

### I2. The new reconciliation window lets you reconcile a partially paid account; later payments on it never show up "a conferir"

**Where:** `src/utils/financas/bancos.ts:15` (also `lista.ts` `nao_conferidas`)

**The failure:**
- Reconciliation is per obligation (`financial_obligations.is_reconciled`), and nothing resets it when a new payment arrives. Only `toggle_reconciliation` and `undo_reconciliation` touch the column.
- `situacaoDosBancos` lists `partial` accounts as pendentes, so Luiz will reconcile a 50% entrada.
- When the second 50% is received weeks later, the account stays `is_reconciled=true`. That payment never appears in "N a conferir" for its bank, and the bank shows "✓".

The old `ObligationCard` avoided this by offering "conciliar" only when `remaining_amount <= 0`.

**Fix (smallest):** restrict pendentes and `nao_conferidas` to `remaining_amount <= 0` (the old rule). The proper fix is per-payment reconciliation, a schema change for a later migration. A middle option: after a successful `payObligation` on an `is_reconciled` account, call `undo_reconciliation` with the reason "novo pagamento".

### I3. "Cadastro rápido" of client/supplier is a dead button in Nova conta

**Where:**
- `src/components/finance/ObligationForm.tsx:220` and `:237`
- `src/pages/financas/VisaoGeral.tsx:269`

**The failure:** `VisaoGeral` mounts `ObligationForm` without `onAddClient`/`onAddSupplier`. The form still renders "+ CADASTRO RÁPIDO", and clicking it does nothing.

Spec 5.4 ("Continua criando cliente, fornecedor ou categoria sem sair do formulário") lists this among the 16 functions that continue. Only the category creation works.

**Fix:** wire the same quick-create used in `src/pages/Finance.tsx:1562-1563` (`setShowQuickCreate('client' | 'supplier')`) and reload `clientes`/`fornecedores` after save. Alternatively, have `ObligationForm` hide the button when the handler is absent.

### I4. Undoing a reconciliation (with reason) has no path in the v3 module

**Where:**
- `src/components/financas/JanelaDaConta.tsx` (whole file)
- `JanelaConferirBanco.tsx`

**The failure:**
- Spec 5.3 says each line has "conferido **e desfazer** (desfazer pede o motivo, como hoje)".
- The plan moved "desfazer" to "janela da conta → histórico".
- Neither `JanelaDaConta` nor `PaymentModal` offers it. Today it exists only in the old `ObligationCard`/`useFinanceActions`.

It is reachable today only because the old screens coexist. As soon as the navigation project deletes them, this "Continua" function is gone, which violates success criterion 3.

**Fix:** add "Desfazer conferência" to `JanelaDaConta`, shown when `conta.is_reconciled`. It should reuse the old reason dialog and `undo_reconciliation`.

**Gate:** must land before the old screens are removed. Not required for this merge.

### I5. PostgREST `max_rows = 1000` silently truncates the module's data, and the "incomplete" warning can never fire

**Where:**
- `src/repositories/financeRepository.ts:228` (`getObligations` `.limit(5000)`)
- `:277` (`getContasPorObrigacao` `.limit(20000)`)
- `:310-321` (`getAllPaymentsComTeto`: `truncado: linhas.length >= limite` with `limite = 5000`)
- `supabase/config.toml:18`

**The failure:**
- The server caps every response at 1,000 rows, so 5,000 and 20,000 are never reached.
- `pagamentosIncompletos` is therefore always `false`, and the Resultado warning ("Há mais de 5.000 pagamentos…") is unreachable.
- `getObligations` sorts by `due_date` ascending, so once there are more than 1,000 obligations the **latest** rows are the ones dropped. That means today's vencidos, the next 7 days, and the projection.
- There are 643 obligations today (391 of them open recurring rows, created months ahead), so the margin is roughly one more year of recurrences.
- Supabase cloud also defaults `max_rows` to 1000. Confirm the production setting before relying on these numbers.

This is pre-existing for `getObligations`, but v3 makes it the single source for every total and introduced a warning that cannot fire.

**Fix:** page with `.range()` until a short page comes back (in all three loaders), or set `truncado` against `Math.min(limite, 1000)` as a stop-gap. Add a test of the paging helper.

### I6. Factory-floor delivery marks the order Entregue, then fails with "FINANCE_ERROR: Acesso financeiro negado"

**Where:**
- `src/repositories/productionRepository.ts:94-112`
- `JanelaConfirmarEntrega` `semFinanceiro`

**The failure:** spec 5.1 *modo fábrica* says the order becomes Entregue "com o plano que já existe". Here is what actually happens for the `factory` role:

1. `saveOrderStage` writes `status='Entregue'` and `delivered_at`. This is allowed by `restringir_update_da_fabrica`.
2. It then calls `ensureReceivableForDeliveredOrder`.
3. RLS (`is_admin_or_manager()`) makes the existing-receivable SELECT return `[]`.
4. So it calls `create_recurrence_obligations`, whose `assert_finance_access()` raises.
5. The kanban shows a FINANCE_ERROR banner for an order that *was* delivered.

This breaks spec 5.1 "Se qualquer passo falhar, nada é marcado como entregue" in the opposite direction: the order is delivered, but the screen reports failure. The behaviour is pre-existing, but this range rewrote exactly this function for this window.

**Fix:**
- Pass `gerarRecebivel: !semFinanceiro || papelNaoFabrica` from `confirmDelivery` to `saveOrderStage`, and skip `lerCobrancaDoPedido`/`ensureReceivable` for the factory role.
- For admin full-screen (which also maps to `semFinanceiro`), keep `ensureReceivable`; it works there.
- Ideally, do the ensure step before the status write.

### I7. Production rollout: deliveries made by the old app after the migration get no `delivered_at`

**Where:**
- `supabase/financeiro_v3_1_entrega.sql:33-37` (one-shot backfill)
- `productionRepository.ts:107` (only the v3 app writes `delivered_at`)

**The failure:**
- The migration will run in production while `botezinipvd-1` is still the live app.
- Every order the old kanban delivers between the migration and the v3 deploy gets `status='Entregue'` with `delivered_at IS NULL`, so "Vendas do mês" silently misses it.
- If the order is reversed (v3 app deployed before the SQL), the delivery `update` sends an unknown column, and delivery breaks.

**Fix:** add to the migration a `BEFORE UPDATE OF status ON orders` trigger: when `NEW.status = 'Entregue' AND OLD.status IS DISTINCT FROM 'Entregue' AND NEW.delivered_at IS NULL`, set it to the São Paulo date. This makes the column correct for every path and every app version, and the TS write becomes redundant. If you prefer no trigger, document in the handoff: "rodar o UPDATE de preenchimento de novo no dia do deploy da v3; SQL antes do app".

---

## Minor

### M1. The delivery window never shows its own error

**Where:**
- `src/hooks/pcp/usePcpKanban.ts:250`
- `JanelaConfirmarEntrega.tsx:95`

`confirmDelivery` calls `setDeliveryConfirm(null)` before `commitMove` and catches the error into the kanban banner. The window unmounts, so its `catch` never runs. Spec 5.1 says "a janela mostra o erro".

**Fix:** let `confirmDelivery` rethrow (or return the error), and close the window only on success.

### M2. Estorno and Cancelar conta failures are silent

**Where:**
- `src/components/common/ConfirmarOperacao.tsx:52` (`try/finally`, no `catch`)
- used at `JanelaDaConta.tsx:62-75`

A failed `reversePayment`/`cancelObligation` becomes an unhandled rejection. The button just re-enables, and the user does not know whether the estorno happened.

**Fix:** catch inside `JanelaDaConta`'s `onConfirmar` and show the message (or add `erro` state to `ConfirmarOperacao`).

### M3. "Para onde foi o dinheiro" bar → list mismatch

**Where:** `ResultadoDoMes.tsx:55` and `:118`

There are three gaps between the bar and the list it opens:
- A bar sums global-category accounts **plus** legacy accounts whose text category has the same name. Clicking filters `global_category_id` only, so the list shows a subset.
- `rapido: 'pagas'` hides partially paid accounts whose payments are in the bar.
- `categoriaPorNome` collapses same-name categories to the last id.

This adds to Ruling 11's accepted mismatch.

**Fix:** have the drill-down filter by `nomeDaCategoria(...)` equality (a new `categoriaNome` filter) plus "com pagamento no período". At least, say "todos os meses" in the filter line.

### M4. `recebidoAntecipado` counts discounts as money received

**Where:** `src/utils/financas/vendas.ts:25`

`original_amount - remaining_amount` includes `desconto - acrescimo`.

**Fix:** use `paid_amount` from the view (already active-only), or Σ payments with `affects_balance !== false`.

### M5. Informational baixas will show as "a conferir" in a bank forever

**Where:** `bancos.ts:15`

An account settled only by `affects_balance=false` payments never touched the bank, but it is listed under that bank. There are 0 such accounts today.

**Fix:** have `indexarContasPorObrigacao` (or the v3 caller) skip payments with `affects_balance === false`.

### M6. "Vencido" in `get_client_receivables` still uses `derived_status = 'overdue'`

**Where:** `supabase/financeiro_v3_1_entrega.sql:140-141`

This excludes partially paid overdue parcels, and counts them as "not due". The new Clientes page uses the spec definition (any due < today with balance), so old and new screens disagree on the same client.

**Fix:** while this function is already being replaced, use `FILTER (WHERE os.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date)` and its negation.

### M7. Visão geral keeps the last drill-down filter across menu navigation

**Where:** `VisaoGeral.tsx:52` and `Financas.tsx` (`filtrosIniciais`)

Clientes → client X → Caixinhas → menu "Visão geral" opens still filtered by client X.

**Fix:** reset `filtrosIniciais` to `{}` when the user changes page through the side menu.

### M8. Red on new pages, inherited from shared components

- `ObligationForm.tsx:136`, `:219`: `text-rose-500` on "Novo Pagamento" and the supplier asterisk.
- `Caixinhas.tsx:95`: "Excluir caixinha" uses `ConfirmDialog variant="danger"`.

The constraint is "nada em vermelho nas páginas novas".

**Fix:** pass `enxuto` styling, and use a neutral or amber variant.

### M9. A failed extrato read shows "Sem movimentos ainda"

**Where:** `ExtratoDaCaixinha.tsx:22`

**Fix:** keep an error state instead of `[]`.

### M10. The "+ mais opções" path loses two Recebi features

**Where:** `usePaymentModal.ts:17` and `JanelaDaConta` `pagar`

The full `PaymentModal`:
- proposes `default_account_id` or the first active bank, not `bancoSugerido`;
- offers no caixinha suggestion.

A discounted receipt therefore never suggests the caixinha.

**Fix:** pass `bancoInicial` into `PaymentModal`, and show the same suggestion block after `onSuccess` for receivables.

### M11. The h1 says "Resultado do mês" in Trimestre mode

**Where:** `ResultadoDoMes.tsx:63`

This is a dup of the deferred T12 minor. Listed here only so the list is complete.

---

## Triage of the ledger's "minor (deferred)"

**Must fix before merge: 3**

1. **T11, "recorte mantém os outros filtros (tipo velho pode esvaziar a lista)"** (`VisaoGeral.tsx:87`).
   - The four totals must equal the list they filter; this is the core promise of 4.1.3 and criterion 4. With `tipo='payable'`, a month, or a search left over, clicking "A receber · vencido R$ 28.552,35" can show "0 contas".
   - **Fix:** `alternarRecorte = r => setFiltros(filtros.recorte === r ? FILTROS_VAZIOS : { ...FILTROS_VAZIOS, recorte: r })`.
2. **T9, "janela fecha durante o salvamento"** (`JanelaDeBaixa.tsx:73-77`). Closing while `salvando`:
   - calls `onFechar` (because `baixaFeita` is still false), which triggers `recarregar()` immediately;
   - that reload can read before `payObligation` commits, so the row still shows **Recebi**, and a second click pays twice;
   - the caixinha-failure message is lost with the unmounted window.
   - **Fix:** ignore `onClose` and disable "Cancelar" while `salvando`.
3. **T8, "Voltar/X ativos durante o salvamento"** (`JanelaConfirmarEntrega.tsx:109`, `:169`).
   - If the user clicks Voltar after `reviseOrderPlan` has started, the window unmounts, but the in-flight `confirmar` still calls the captured `onConfirmar`, so the order is marked Entregue after the user cancelled.
   - **Fix:** same pattern as item 2: no close while `salvando`.

**Can wait** (track for the navigation/cleanup plan)

- T1: password in `docker exec` argv (local container only).
- T1: script does not guard against a missing `V3_TESTE_EMAIL` or a final line without a newline. This one is cheap and worth doing soon: without a final newline, `echo >>` glues onto the last variable of `.env.v3.local` and breaks the dev app's env.
- T1: no `.gitattributes`, so CRLF breaks `sh`.
- T1: `IS DISTINCT FROM 'Entregue'` would also mark a future 'Cancelado' order as awaiting. There are 0 rows today. `alertasOperacionais` already knows a 'Cancelado' status, so revisit when cancellation of orders is designed.
- T2: `centavos(1.005)` gives 1. Values come from numeric strings, not from JS arithmetic chains.
- T3: projection accumulator not rounded (each point is rounded), plus test gaps.
- T4: a category with a net negative in a month drops from the bars but stays in the totals.
- T5:
  - `progressoDaMeta` shows 100% at 99.5%, and can go negative;
  - `auto_fund_pct` has no cap (and neither does the sum across caixinhas);
  - the 'Entregue' literal;
  - test gaps.
- T6: index matching in `planoMudou` without an `installment_no` tiebreak. Both sides come from the same sorted array, so it is safe today. Also test gaps.
- T7:
  - test gaps;
  - bank balance without centavos;
  - `FILTROS_VAZIOS` not frozen;
  - 'hoje' vs 'semana' inconsistency with search.
- T8, the remaining six:
  - value inputs ignore privacy mode (they are editable fields);
  - 'tirar' has no aria-label;
  - numeric input not rounded to centavos (worth folding into the must-fix #3 commit);
  - misplaced docblock;
  - initial loading state;
  - mobile scrolling (already fixed in b388d82).
- T9:
  - `restante` float noise (the value originates from a PG decimal string, so it is benign);
  - sim/não without `aria-pressed`;
  - 85vh on short phones;
  - duplicated action buttons in `JanelaDaConta`;
  - unmasked editable value.
- T10:
  - 85vh;
  - aria and `role=alert`;
  - "onAlterado dentro do try" (already moved out; resolved);
  - the difference does not say "a mais / a menos";
  - the row shows the account's total `paid_amount`, not this bank's share.
- T11:
  - reload even on a plain cancel;
  - concurrent `recarregar()` resolving out of order. Low probability, but it is a stale-data double-payment path. Add a request-id guard in `useDadosDasFinancas.ts:28` with the next touch.
  - '✓' and Recebi/Paguei aria labels;
  - privacy leaks the sparkline shape and the amber colour.
- T12:
  - h1 does not follow the period;
  - `useMemo` deps lint;
  - bar and "Outros" focus/hints;
  - same-name categories collapse (see M3);
  - bar widths visible in privacy mode.
- T13:
  - zeros flash;
  - accessibility;
  - small buttons;
  - `depois` and form save swallow failures. The error lands in `env.error` behind the modal overlay; worth fixing with M2.
- T14:
  - "1 dias";
  - Cobrar aria and touch target;
  - empty `th`;
  - non-sticky first column on phones.

---

## Opinion on the rulings

- **(1) Controller owns browser checks:** right call. The checkpoints caught real defects (portal clipping, a parcel born overdue, an unreachable transfer button, tax misclassification) that unit tests could not.
- **(2) Skip T15:** agree. Nothing in T16 depends on it.
- **(3) Mês|Trimestre:** justified. The request is explicit and the spec was updated.
- **(4) Portal for every finance dialog:** agree. The root cause, `Modal` not portalling, is worth fixing once in `components/common` later.
- **(5) Proposed due date = max(prazo, hoje):** agree. A new parcel must not be born overdue.
- **(6), (7) Folding the minors into the I1 fixes:** agree in principle. But (7)'s parent fix is incomplete; see I1.
- **(8) Default list filter 'Agora':** agree. It matches "uma tela leve", and the spec does not fix the default.
- **(9) Search shows awaiting parcels in 'Agora':** acceptable. It should apply to all quick filters, not only 'agora' (T7 minor), so behaviour does not change with the chip.
- **(10) Imposto singular/plural with precedence, and legacy name → global mark:** agree. It matches the old DRE intent and fixes a real misclassification.
- **(11) Bar drill-down without a month filter:** acceptable as an interim. Because of M3, the list is not "the bar's payments" in three different ways, not one. The proper fix is a payment-date filter and name-based category matching. Until then, the filter line should say what is shown.
- **Task 1 note (compare the view and the 5 functions with live production before running):** strongly agree.
  - I verified the 10-06 dump: the 5 functions' `SECURITY DEFINER`/`search_path` match, and `security_invoker=on`.
  - The file's single-transaction structure makes a mismatch fail safely: `CREATE OR REPLACE VIEW` refuses to drop or retype columns, and a missing `trg_orders_updated_at` aborts.
  - Add I7 to the handoff.

---

## Production-bound SQL (`supabase/financeiro_v3_1_entrega.sql`): summary

- **Safe as written:**
  - single `BEGIN/COMMIT`;
  - `ADD COLUMN IF NOT EXISTS`;
  - the trigger is disabled only around the backfill, inside the transaction;
  - `updated_at` is `timestamptz`, so `AT TIME ZONE 'America/Sao_Paulo'` is the right direction;
  - the view appends `awaiting_delivery` last, so `CREATE OR REPLACE` is legal;
  - `GROUP BY o.id, ord.id` is valid through the primary-key functional dependency;
  - the dependent view `order_financial_status` is unaffected;
  - the replaced functions keep owner and ACL, and their attributes match the dump.
- **Sweep complete:** the only functions reading `obligation_summary` are the 3 changed ones, plus `get_client_score`, `get_pending_installments`, `reverse_payment` and `register_informational_payment`, as the spec says.
- **Add before handoff:**
  - I7 (trigger or re-run note, and "SQL before app");
  - optionally M6.
- **Note:** `DISABLE TRIGGER` needs table ownership. In the Supabase SQL editor this runs as `postgres`, which normally owns `public.orders`; confirm it with `SELECT relowner::regrole FROM pg_class WHERE relname='orders'` in production.

---

## Verdict

**Needs fixes before merging into the v3 line.** The core is sound:
- the utils are correct;
- reversal and informational signs match `reverse_payment`;
- the awaiting-delivery exclusion is applied consistently in the numbers, list, projection, clients and SQL;
- Livre is the same on both pages;
- the migration is safe.

The work needed before merge:
- **3 must-fix deferred minors:** recorte reset, and no-close-while-saving in the baixa and entrega windows.
- **I1 and I2:** the reconciliation correctness bugs.
- **I3:** the dead quick-create button.

**I4–I7** can go to the navigation/handoff plan, but each has a hard gate:
- **I4** before the old screens are deleted.
- **I5** before obligations approach 1,000.
- **I6** before factory users deliver through the new window.
- **I7** before the SQL goes to production.

# Plano Técnico — Pagamento pré-lançado, Caixinhas completas e Correções

> Status: **proposta para aprovação**. Nenhum código escrito ainda.
> Sequência recomendada: **Front 3 (correções, rápido)** → **Front 1 (pagamento, núcleo)** → **Front 2 (caixinhas)**.

---

## FRONT 1 — Fluxo de pagamento pré-lançado

**Meta:** meio de pagamento no orçamento (opcional) + no PDF; importar na conversão sem repetir o diálogo; parcelas nascem **pré-lançadas** com método previsto; boleto/recebimento só **disparado manualmente** (com data manual) na conclusão do pedido.

### 1.1 Dados (schema)
- `budgets`: `+ payment_plan jsonb`, `+ payment_method text` (ambos opcionais).
  - Se `payment_plan` presente → é a fonte na conversão. Senão → fallback no `down_payment_value` atual (compat).
- `financial_obligations`: `+ planned_method text` (meio previsto da parcela, ex.: 'Boleto').
  - **Não** precisa de flag "pré-lançado": a obrigação `open`/sem pagamento **já é** o pré-lançamento; "disparar" = registrar o pagamento.
- `obligation_summary` (view): incluir `planned_method` no SELECT.

### 1.2 Backend / RPC
- `apply_order_payment_plan` e `revise_order_plan`: ler `item->>'method'` e gravar em `planned_method` (alteração pequena).
- `pay_obligation`: sem mudança estrutural (já aceita `method` + `payment_date` manual). Opcional: se `p_method` nulo, herdar `planned_method`.
- **Nova** `get_pending_installments()`: parcelas `open`/`overdue` de pedidos **Concluídos/Entregues** (as "a disparar"), com método previsto, cliente, vencimento. `SECURITY DEFINER` + `assert_finance_access`.

### 1.3 Repo / serviço / tipos
- `Budget += payment_plan?, payment_method?`; `ObligationSummary += planned_method?`.
- `financeRepository.getPendingInstallments()` + facade.
- `budgetRepository.save` já persiste (spread) — sem mudança.

### 1.4 UI
- **Extrair `PaymentPlanEditor`** do `PaymentPlanModal` (corpo editável) para reutilizar no orçamento e no modal (mata duplicação).
- **BudgetEditor:** seção opcional "Plano de pagamento" (toggle) usando o `PaymentPlanEditor` — grava em `budget.payment_plan`/`payment_method`. Sem RPC (é só montar o plano).
- **PDF do orçamento:** estender a caixa de pagamento ([pdfService.ts:420](../src/services/pdfService.ts)) para listar as parcelas do `payment_plan` + método, quando houver.
- **Conversão:** se `budget.payment_plan` existir → `applyOrderPaymentPlan` direto, **sem abrir o modal**; senão → modal atual.
- **Disparar recebimento:** nova aba **"A disparar"** no painel de Recebíveis, alimentada por `get_pending_installments()` (só pedidos concluídos/entregues). Cada linha → botão "Disparar" que abre o `PaymentModal` existente pré-preenchido com `planned_method` e **data editável (manual)**. É o `pay_obligation`.

### 1.5 Testes
- apply/revise gravam `planned_method`.
- `get_pending_installments` só traz parcelas de pedidos concluídos/entregues.
- disparar com data manual → "recebido" sobe na data escolhida.
- PDF: verificação manual.

### 1.6 Riscos
- `pdfService` é grande e sensível → mudança visual, validar manualmente.
- Garantir que orçamento **sem** plano continua abrindo o modal na conversão.

---

## FRONT 2 — Caixinhas completas (referências de tesouraria)

**Meta:** extrato (recebimentos/retiradas), transferência na UI, finalidade, metas com prazo, provisionamento automático.

### 2.1 Dados
- `cash_envelopes`: `+ purpose text`, `+ target_date date`, `+ min_balance numeric default 0`, `+ auto_fund_pct numeric default 0`.
- `cash_envelope_movements`: **já existe** (delta, kind, notes) — `allocate` = recebimento/guardado, `release` = retirada. Só falta expor.

### 2.2 Backend / RPC
- Extrato: leitura direta de `cash_envelope_movements` por `envelope_id` (RLS já cobre) — sem RPC nova.
- **Nova** `fund_envelopes(p_base_amount numeric)`: aloca `auto_fund_pct * base` em cada caixinha com regra, respeitando o livre (provisionamento manual sobre um valor, ex.: último recebimento). Atômica.
- Aporte de sinking fund: calculado na UI (`(target − balance) / meses até target_date`).

### 2.3 Repo / facade / tipos
- `CashEnvelope += purpose, target_date, min_balance, auto_fund_pct`.
- `EnvelopeMovement` type + `getMovements(envelopeId)` + `fundEnvelopes(base)`.

### 2.4 UI
- **Extrato por caixinha** (drawer ao clicar): lista de movimentos com data/nota, rótulos "Recebido"/"Retirado"/"Transferência".
- **Transferência** entre caixinhas (botão + mini-modal) — `transfer_envelope` já existe.
- **Metas com prazo** + aporte mensal sugerido + barra de progresso.
- **Provisionamento**: campo `auto_fund_pct` por caixinha + botão "Provisionar sobre R$ …".
- **Alertas**: saldo < `min_balance`; "livre" negativo (já existe).
- **Finalidade** (impostos/folha/reserva/…) com ícone e agrupamento.
- Estética alinhada ao app.

### 2.5 Testes
- `getMovements` retorna histórico após allocate/release.
- `fund_envelopes` distribui por % e respeita o livre.

### 2.6 Risco: baixo (aditivo).

---

## FRONT 3 — Correções da auditoria (rápido, baixo risco)

1. **NaN nas metas** — [FinancialTab.tsx](../src/pages/masterdata/FinancialTab.tsx): `parseFloat(x) || 0` nos três campos.
2. **Presets de filtro → banco** — mover `finance_presets` (hoje só localStorage, [Finance.tsx:109](../src/pages/Finance.tsx)) para `company_profile.finance_presets jsonb`; ler do banco com fallback local; migrar os locais existentes na primeira carga.
3. **Dados zumbis** — parar de escrever/depender de `order.amount_paid`/`payment_status` (derivar de `order_financial_status`); remover o `FINANCE_ERROR` morto em [useOrders.ts](../src/hooks/useOrders.ts). Coluna mantida no banco, marcada como deprecada.
4. **Estética dos modais** — alinhar `PaymentPlanModal` e `EnvelopeForm` ao padrão do app (`createPortal` no body, `rounded-3xl`, ícone em círculo, botões `tracking-[0.2em]`).
5. **Categorias triplas (mini-projeto à parte)** — cache local `botezini_cat_*` + `financial_categories` + `global_categories`. Consolidar em `global_categories` e aposentar os outros, seguindo `docs/plano-unificacao-categorias.md`. **Escopo próprio** — não misturar com o resto.

---

## Arquivos SQL previstos
- `finance_phase7_payment_staging.sql` (Front 1: colunas + view + get_pending_installments + ajuste apply/revise)
- `finance_phase8_envelopes_pro.sql` (Front 2: colunas + fund_envelopes)
- (Front 3 é majoritariamente client-side; presets → 1 coluna em company_profile)

## Contagem de testes prevista
+6 a +10 testes de correção (pending installments, planned_method, fund_envelopes, movements).

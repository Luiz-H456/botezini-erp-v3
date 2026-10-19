# Rotina de Testes — Financeiro (Fases 1–4 + Segurança)

Passo a passo para verificar se o que foi implementado bate com o esperado.
Ordem importa: **aplicar SQL → automatizado → manual**.

---

## Passo 0 — Aplicar os SQLs no Supabase (nesta ordem)

No **SQL Editor** do Supabase, rode um de cada vez:

| Ordem | Arquivo | O que entrega |
|---|---|---|
| 1 | `supabase/fix_security_audit_2026_07.sql` | Correção do vazamento de RLS + revoke `update_bank_balance` |
| 2 | `supabase/finance_phase1_single_source_of_truth.sql` | `create_order_receivable` + view `order_financial_status` |
| 3 | `supabase/finance_phase2_receivables_control.sql` | RPCs de entregues/adiantamentos/por cliente/por meio |
| 4 | `supabase/finance_phase3_client_score_and_terms.sql` | Colunas de cliente, `get_client_score`, plano de pagamento |
| 5 | `supabase/finance_phase4_reconciliation.sql` | `get_order_reconciliation`, `apply_order_adjustment` |
| 6 | `supabase/finance_phase4b_reconciliation_list.sql` | `get_orders_needing_reconciliation` (lista os divergentes p/ o painel) |
| 7 | `supabase/finance_phase5_plan_editing.sql` | `revise_order_plan` (editar plano pós-emissão) |
| 8 | `supabase/finance_phase6_cash_envelopes.sql` | Caixinhas: tabelas + `get_envelope_overview`, `move_envelope`, `transfer_envelope` |
| 9 | `supabase/finance_phase7c_corrections.sql` | Front 3: `company_profile.finance_presets` |
| 10 | `supabase/finance_phase7_payment_staging.sql` | Front 1: `planned_method`, view atualizada, `get_pending_installments` |
| 11 | `supabase/finance_phase8_envelopes_pro.sql` | Front 2: caixinhas pro + `fund_envelopes` |
| — | `supabase/categories_diagnostic_readonly.sql` | Front 4: diagnóstico (SÓ LEITURA, não migra) |

Cada arquivo tem, no rodapé, as queries de verificação. Rode-as e confirme que
não há erro e o shape retornado faz sentido.

**Checagem rápida de sanidade (cole no SQL Editor):**
```sql
-- view da Fase 1 deve ter security_invoker
SELECT relname, reloptions FROM pg_class
WHERE relname IN ('obligation_summary','order_financial_status');

-- authenticated NÃO pode executar update_bank_balance
SELECT has_function_privilege('authenticated',
  'public.update_bank_balance(uuid, numeric)', 'EXECUTE');  -- esperado: false

-- funções novas existem
SELECT proname FROM pg_proc WHERE proname IN
 ('create_order_receivable','get_delivered_unpaid','get_advance_received',
  'get_client_receivables','get_payment_method_breakdown','get_client_score',
  'refresh_client_scores','apply_order_payment_plan',
  'get_order_reconciliation','apply_order_adjustment',
  'get_orders_needing_reconciliation','revise_order_plan',
  'get_envelope_overview','move_envelope','transfer_envelope')
ORDER BY proname;
```

---

## Passo 1 — Testes automatizados (Python)

```bash
cd tests
python -m pip install -r requirements.txt
# tests/.env já preenchido com URL, anon key e usuário admin/manager
python -m pytest -v
```

Cobertura (29 testes):

| Suíte | Verifica |
|---|---|
| `test_security_audit.py` | operador não lê `obligation_summary`/`order_financial_status`; admin lê; `update_bank_balance` negado; RPCs financeiras negam factory |
| `test_phase1_receivables.py` | split entrada/saldo, único, idempotência, validações, matemática da view, (opcional) pagamento→recebido |
| `test_phase2_controls.py` | shape e invariantes de entregues/adiantamentos/por cliente/por meio |
| `test_phase3_score_plan.py` | score null sem histórico, plano cria N parcelas, idempotência, validação |
| `test_phase4_reconciliation.py` | not-found e delta zero levantam erro |

> Para os testes que **escrevem** (Fase 1/3): defina `QA_ALLOW_WRITES=1` no `tests/.env`.
> Para o teste do operador (segurança): preencha `QA_FACTORY_*`. Sem isso, pulam.

**Esperado:** verde (ou `skipped` nos opcionais não configurados). Qualquer
`failed` em segurança = SQL do Passo 0 não aplicado corretamente.

---

## Passo 2 — Testes manuais (UI)

Siga [QA_FASE1_MANUAL.md](QA_FASE1_MANUAL.md) (blocos A–D). Complementos das Fases 2–4:

### Fase 2 — controles
- [ ] Entregar um pedido com saldo → aparece em "entregues não quitados".
- [ ] Registrar entrada num pedido não entregue → aparece em "adiantamentos".
- [ ] Recebíveis por cliente somam corretamente (aberto = vencido + a vencer).
- [ ] Relatório por meio de pagamento fecha com os pagamentos do período.

### Fase 3 — score e plano
- [ ] `SELECT * FROM get_client_score('<cliente com histórico>')` → score 0–100 coerente.
- [ ] Cliente sem histórico → score null.
- [ ] Aplicar plano (entrada + 2 parcelas) → 3 obrigações, datas corretas.
- [ ] `refresh_client_scores()` popula `clients.score_cached`.

### Fase 4 — reconciliação
- [ ] Alterar `total_amount` de um pedido com recebível → `get_order_reconciliation` mostra delta.
- [ ] `apply_order_adjustment` cria lançamento complementar; delta volta a 0.
- [ ] `original_amount` das obrigações antigas **não** muda (imutável).

---

## Critérios de aceite (resumo)

| # | Invariante |
|---|---|
| 1 | `total = recebido + a_receber` em todo pedido |
| 2 | Operador (`factory`) não lê nenhum dado financeiro |
| 3 | Entrada nasce pendente; "recebido" só sobe com pagamento real |
| 4 | Nenhuma duplicação de recebível ao concluir/entregar |
| 5 | `original_amount` nunca muda; ajustes são lançamentos novos |
| 6 | Score reproduzível a partir do histórico |

"""
Fase 5 — revisão de plano pós-emissão (revise_order_plan).
Prova de correção: parcelas EM ABERTO são trocadas; parcelas PAGAS são preservadas;
imutabilidade mantida (cancela + recria, nunca muta original_amount).
"""
import uuid
import datetime
import pytest
from conftest import QA_TAG, QA_BANK_ACCOUNT_ID


def _active(admin, order_id):
    """Obrigações NÃO canceladas do pedido."""
    rows = admin.table("financial_obligations").select("*").eq("order_id", order_id).execute().data or []
    return [o for o in rows if o.get("cancelled_at") is None]


def _apply(admin, order_id, plan):
    return admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_id, "p_client_id": None,
        "p_description": f"{QA_TAG} Pedido", "p_plan": plan}).execute().data


def _revise(admin, order_id, plan):
    return admin.rpc("revise_order_plan", {
        "p_order_id": order_id, "p_client_id": None,
        "p_description": f"{QA_TAG} Pedido", "p_plan": plan}).execute().data


def test_revise_replaces_open_plan(admin, order_ctx):
    _apply(admin, order_ctx, [{"label": "Único", "amount": 1000, "due": "2026-09-01"}])
    _revise(admin, order_ctx, [
        {"label": "Nova 1", "amount": 400, "due": "2026-09-01"},
        {"label": "Nova 2", "amount": 600, "due": "2026-10-01"},
    ])
    active = _active(admin, order_ctx)
    amounts = sorted(float(o["original_amount"]) for o in active)
    assert amounts == [400.0, 600.0], "abertas trocadas; a antiga de 1000 foi cancelada"


def test_revise_allows_two_installments_same_month(admin, order_ctx):
    _apply(admin, order_ctx, [{"label": "Único", "amount": 1000, "due": "2026-09-01"}])
    _revise(admin, order_ctx, [
        {"label": "1ª quinzena", "amount": 500, "due": "2026-09-05"},
        {"label": "2ª quinzena", "amount": 500, "due": "2026-09-20"},
    ])
    dues = sorted(o["due_date"] for o in _active(admin, order_ctx))
    assert dues == ["2026-09-05", "2026-09-20"], "duas parcelas no mesmo mês são permitidas"


@pytest.mark.parametrize("plan", [[], [{"label": "x", "amount": 0, "due": "2026-01-01"}]])
def test_revise_invalid_plan_raises(admin, order_ctx, plan):
    _apply(admin, order_ctx, [{"label": "Único", "amount": 1000, "due": "2026-09-01"}])
    with pytest.raises(Exception):
        _revise(admin, order_ctx, plan)
    # o plano original permanece intacto após erro
    assert len(_active(admin, order_ctx)) == 1


def test_revise_order_not_found_raises(admin):
    with pytest.raises(Exception) as exc:
        _revise(admin, str(uuid.uuid4()), [{"label": "x", "amount": 100, "due": "2026-01-01"}])
    assert "encontrado" in str(exc.value).lower() or "not found" in str(exc.value).lower()


@pytest.mark.skipif(not QA_BANK_ACCOUNT_ID, reason="QA_BANK_ACCOUNT_ID não configurado")
def test_revise_preserves_paid_installment(admin, order_ctx):
    """A parcela PAGA sobrevive à revisão; só as em aberto são trocadas."""
    _apply(admin, order_ctx, [
        {"label": "Entrada", "amount": 300, "due": "2026-09-01"},
        {"label": "Saldo", "amount": 700, "due": "2026-10-01"},
    ])
    entrada = next(o for o in _active(admin, order_ctx) if float(o["original_amount"]) == 300.0)
    pay = admin.rpc("pay_obligation", {
        "p_obligation_id": entrada["id"], "p_amount": 300,
        "p_account_id": QA_BANK_ACCOUNT_ID, "p_method": "PIX",
        "p_payment_date": datetime.date.today().isoformat(),
        "p_notes": f"{QA_TAG}"}).execute().data
    try:
        # revisa: a entrada paga fica; o saldo aberto vira uma nova parcela de 800
        _revise(admin, order_ctx, [{"label": "Novo saldo", "amount": 800, "due": "2026-11-01"}])
        active = _active(admin, order_ctx)
        amounts = sorted(float(o["original_amount"]) for o in active)
        assert amounts == [300.0, 800.0], "entrada paga preservada + novo saldo; 700 aberto cancelado"

        st = admin.table("order_financial_status").select("*").eq("order_id", order_ctx).execute().data[0]
        assert float(st["received"]) == 300.0
        assert float(st["total"]) == 1100.0
    finally:
        admin.rpc("reverse_payment", {"p_payment_id": pay, "p_reason": f"{QA_TAG}"}).execute()

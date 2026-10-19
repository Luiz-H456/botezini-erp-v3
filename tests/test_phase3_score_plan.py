"""
Fase 3 — score do cliente e plano de pagamento.
"""
import uuid
import datetime
import pytest


def _obligations_for(admin, order_id):
    return admin.table("financial_obligations").select("*").eq("order_id", order_id).execute().data or []


# ─────────────────────────────── Score ──────────────────────────────────────

def test_score_unknown_for_random_client(admin):
    rid = str(uuid.uuid4())
    row = admin.rpc("get_client_score", {"p_client_id": rid}).single().execute().data
    assert row is not None
    assert row["score"] is None, "cliente sem histórico → score desconhecido (null)"
    assert int(row["order_count"]) == 0


# ─────────────────────────── Plano de pagamento ─────────────────────────────

def test_apply_plan_creates_installments(admin, order_ctx):
    today = datetime.date.today()
    plan = [
        {"label": "Entrada", "amount": 200, "due": today.isoformat()},
        {"label": "Parcela 1", "amount": 300, "due": (today + datetime.timedelta(days=30)).isoformat()},
        {"label": "Parcela 2", "amount": 300, "due": (today + datetime.timedelta(days=60)).isoformat()},
    ]
    ids = admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_ctx,
        "p_client_id": None,
        "p_description": "[QA-TEST] Plano",
        "p_plan": plan,
    }).execute().data
    assert len(ids) == 3
    obs = _obligations_for(admin, order_ctx)
    assert sorted(float(o["original_amount"]) for o in obs) == [200.0, 300.0, 300.0]
    assert len({o["split_group_id"] for o in obs}) == 1


def test_apply_plan_idempotent(admin, order_ctx):
    plan = [{"label": "Único", "amount": 500, "due": datetime.date.today().isoformat()}]
    ids1 = admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_ctx, "p_client_id": None,
        "p_description": "[QA-TEST]", "p_plan": plan}).execute().data
    ids2 = admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_ctx, "p_client_id": None,
        "p_description": "[QA-TEST]", "p_plan": plan}).execute().data
    assert set(ids1) == set(ids2)
    assert len(_obligations_for(admin, order_ctx)) == 1


@pytest.mark.parametrize("plan", [
    [],
    [{"label": "x", "amount": 0, "due": "2026-01-01"}],
    [{"label": "x", "amount": -5, "due": "2026-01-01"}],
])
def test_apply_plan_invalid(admin, order_ctx, plan):
    with pytest.raises(Exception):
        admin.rpc("apply_order_payment_plan", {
            "p_order_id": order_ctx, "p_client_id": None,
            "p_description": "[QA-TEST]", "p_plan": plan}).execute()
    assert _obligations_for(admin, order_ctx) == []

"""
Fase 7 — pagamento pré-lançado: planned_method e get_pending_installments.
"""
import datetime
from conftest import QA_TAG


def test_apply_plan_stores_planned_method(admin, order_ctx):
    plan = [
        {"label": "Entrada", "amount": 300, "due": "2026-09-01", "method": "PIX"},
        {"label": "Saldo", "amount": 700, "due": "2026-10-01", "method": "Boleto"},
    ]
    admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_ctx, "p_client_id": None,
        "p_description": f"{QA_TAG} Pedido", "p_plan": plan}).execute()

    obs = admin.table("financial_obligations").select("original_amount,planned_method") \
        .eq("order_id", order_ctx).execute().data or []
    by_amt = {float(o["original_amount"]): o["planned_method"] for o in obs}
    assert by_amt[300.0] == "PIX"
    assert by_amt[700.0] == "Boleto"


def test_pending_installments_only_delivered(admin, order_ctx):
    """Parcela só entra em 'a disparar' quando o pedido está concluído/entregue."""
    admin.rpc("apply_order_payment_plan", {
        "p_order_id": order_ctx, "p_client_id": None,
        "p_description": f"{QA_TAG} Pedido",
        "p_plan": [{"label": "Único", "amount": 500, "due": "2026-09-01"}]}).execute()

    # pedido ainda Pendente → NÃO aparece
    pend = admin.rpc("get_pending_installments").execute().data or []
    assert not any(r["order_id"] == order_ctx for r in pend), "pendente não deve aparecer"

    # marca Entregue → aparece
    admin.table("orders").update({"status": "Entregue"}).eq("id", order_ctx).execute()
    pend2 = admin.rpc("get_pending_installments").execute().data or []
    mine = [r for r in pend2 if r["order_id"] == order_ctx]
    assert len(mine) == 1
    assert float(mine[0]["remaining_amount"]) == 500.0

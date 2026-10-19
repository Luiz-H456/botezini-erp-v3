"""
Fase 4 — reconciliação de pedido revisado. Testa os caminhos verificáveis sem
semear pedidos (not-found e validação). O fluxo completo com delta real → manual.
"""
import uuid
import pytest


def test_reconciliation_order_not_found_raises(admin):
    with pytest.raises(Exception) as exc:
        admin.rpc("get_order_reconciliation", {"p_order_id": str(uuid.uuid4())}).single().execute()
    assert "encontrado" in str(exc.value).lower() or "not found" in str(exc.value).lower()


def test_adjustment_zero_delta_raises(admin):
    with pytest.raises(Exception) as exc:
        admin.rpc("apply_order_adjustment", {
            "p_order_id": str(uuid.uuid4()),
            "p_delta": 0,
            "p_reason": "[QA-TEST]",
            "p_due_date": "2026-01-01",
        }).execute()
    assert "zero" in str(exc.value).lower() or "diferente" in str(exc.value).lower()


def test_adjustment_order_not_found_raises(admin):
    with pytest.raises(Exception) as exc:
        admin.rpc("apply_order_adjustment", {
            "p_order_id": str(uuid.uuid4()),
            "p_delta": 100,
            "p_reason": "[QA-TEST]",
            "p_due_date": "2026-01-01",
        }).execute()
    assert "encontrado" in str(exc.value).lower() or "not found" in str(exc.value).lower()


def test_full_reconciliation_flow(admin, order_ctx):
    """
    Correção real ponta-a-ponta: pedido recotado gera delta; o ajuste zera o delta
    SEM mutar o original_amount da obrigação existente (imutabilidade contábil).
    """
    from conftest import create_receivable
    create_receivable(admin, order_ctx, total=1000, entrada=0)
    orig = admin.table("financial_obligations").select("id,original_amount") \
        .eq("order_id", order_ctx).execute().data
    assert len(orig) == 1 and float(orig[0]["original_amount"]) == 1000.0

    # cliente "mudou o pedido": total sobe para 1200
    admin.table("orders").update({"total_amount": 1200}).eq("id", order_ctx).execute()

    rec = admin.rpc("get_order_reconciliation", {"p_order_id": order_ctx}).single().execute().data
    assert float(rec["order_total"]) == 1200.0
    assert float(rec["obligations_total"]) == 1000.0
    assert float(rec["delta"]) == 200.0

    # aparece na lista de divergentes
    lst = admin.rpc("get_orders_needing_reconciliation").execute().data or []
    assert any(r["order_id"] == order_ctx for r in lst)

    # aplica o ajuste (lançamento complementar de 200)
    admin.rpc("apply_order_adjustment", {
        "p_order_id": order_ctx, "p_delta": 200,
        "p_reason": "[QA-TEST] recotação", "p_due_date": "2026-12-01"}).execute()

    rec2 = admin.rpc("get_order_reconciliation", {"p_order_id": order_ctx}).single().execute().data
    assert float(rec2["delta"]) == 0.0, "delta deveria zerar após o ajuste"

    # imutabilidade: a obrigação original de 1000 NÃO mudou; existe uma nova de 200
    obs = admin.table("financial_obligations").select("original_amount") \
        .eq("order_id", order_ctx).execute().data
    amounts = sorted(float(o["original_amount"]) for o in obs)
    assert amounts == [200.0, 1000.0], "original imutável + ajuste complementar"

    # some da lista de divergentes
    lst2 = admin.rpc("get_orders_needing_reconciliation").execute().data or []
    assert not any(r["order_id"] == order_ctx for r in lst2)

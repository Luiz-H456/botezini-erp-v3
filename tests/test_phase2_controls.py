"""
Fase 2 — controles de recebíveis. Smoke/estrutura: as RPCs respondem para
admin/manager e devolvem o shape esperado. (Cenários com dados reais → manual.)
"""
import datetime


def _keys(rows, expected):
    """Se houver linhas, confere que as colunas esperadas existem."""
    if rows:
        assert expected.issubset(set(rows[0].keys())), f"colunas faltando: {expected - set(rows[0].keys())}"


def test_delivered_unpaid_shape(admin):
    rows = admin.rpc("get_delivered_unpaid").execute().data or []
    _keys(rows, {"order_id", "total", "received", "to_receive", "has_overdue"})
    # invariante quando há dados
    for r in rows:
        assert float(r["to_receive"]) > 0, "só deve listar pedidos com saldo em aberto"


def test_advance_received_shape(admin):
    rows = admin.rpc("get_advance_received").execute().data or []
    _keys(rows, {"order_id", "received", "to_receive"})
    for r in rows:
        assert float(r["received"]) > 0, "só deve listar pedidos com adiantamento"


def test_client_receivables_shape(admin):
    rows = admin.rpc("get_client_receivables").execute().data or []
    _keys(rows, {"client_id", "open_total", "overdue_total", "not_due_total"})


def test_payment_method_breakdown_shape(admin):
    start = (datetime.date.today() - datetime.timedelta(days=90)).isoformat()
    end = datetime.date.today().isoformat()
    rows = admin.rpc("get_payment_method_breakdown",
                     {"p_start": start, "p_end": end}).execute().data or []
    _keys(rows, {"method", "obligation_type", "cnt", "total_amount"})


def test_delivered_unpaid_reflects_real_order(admin, order_ctx):
    """Correção real: um pedido ENTREGUE com saldo aparece na lista com o valor certo."""
    from conftest import create_receivable
    # marca o pedido semeado como Entregue
    admin.table("orders").update({"status": "Entregue"}).eq("id", order_ctx).execute()
    create_receivable(admin, order_ctx, total=1000, entrada=0)

    rows = admin.rpc("get_delivered_unpaid").execute().data or []
    mine = next((r for r in rows if r["order_id"] == order_ctx), None)
    assert mine is not None, "pedido entregue com saldo deveria aparecer"
    assert float(mine["to_receive"]) == 1000.0
    assert float(mine["received"]) == 0.0

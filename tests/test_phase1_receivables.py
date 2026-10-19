"""
Fase 1 — verdade única: create_order_receivable + order_financial_status.

Cobre: split entrada/saldo, obrigação única, idempotência, validações e a
matemática da view (total = recebido + a_receber).
"""
import uuid
import datetime
import pytest
from conftest import create_receivable, QA_TAG, QA_BANK_ACCOUNT_ID


def _obligations_for(admin, order_id):
    return admin.table("financial_obligations").select("*").eq("order_id", order_id).execute().data or []


def _order_status(admin, order_id):
    rows = admin.table("order_financial_status").select("*").eq("order_id", order_id).execute().data or []
    return rows[0] if rows else None


# ─────────────────────────── Split entrada + saldo ──────────────────────────

def test_split_creates_two_obligations(admin, order_ctx):
    ids = create_receivable(admin, order_ctx, total=1000, entrada=300)
    assert len(ids) == 2, "com 0 < entrada < total deve criar Entrada + Saldo"

    obs = _obligations_for(admin, order_ctx)
    amounts = sorted(float(o["original_amount"]) for o in obs)
    assert amounts == [300.0, 700.0], "valores devem ser entrada=300 e saldo=700"

    # mesmo split_group_id, ambos receivable e pendentes
    assert len({o["split_group_id"] for o in obs}) == 1
    assert all(o["type"] == "receivable" for o in obs)
    assert all(o["status"] == "open" for o in obs)
    # descrições distinguíveis
    descs = " ".join(o["description"] for o in obs)
    assert "Entrada" in descs and "Saldo" in descs


def test_single_when_no_entrada(admin, order_ctx):
    ids = create_receivable(admin, order_ctx, total=500, entrada=0)
    assert len(ids) == 1
    obs = _obligations_for(admin, order_ctx)
    assert len(obs) == 1
    assert float(obs[0]["original_amount"]) == 500.0


def test_single_when_entrada_equals_total(admin, order_ctx):
    ids = create_receivable(admin, order_ctx, total=800, entrada=800)
    assert len(ids) == 1, "entrada == total não gera saldo zerado (viola CHECK > 0)"
    obs = _obligations_for(admin, order_ctx)
    assert len(obs) == 1
    assert float(obs[0]["original_amount"]) == 800.0


# ─────────────────────────────── Idempotência ───────────────────────────────

def test_idempotent_by_order_id(admin, order_ctx):
    ids1 = create_receivable(admin, order_ctx, total=1000, entrada=300)
    ids2 = create_receivable(admin, order_ctx, total=1000, entrada=300)
    assert set(ids1) == set(ids2), "segunda chamada deve devolver as MESMAS obrigações"
    obs = _obligations_for(admin, order_ctx)
    assert len(obs) == 2, "não pode duplicar recebível para o mesmo pedido"


# ─────────────────────────────── Validações ─────────────────────────────────

@pytest.mark.parametrize("total,entrada,frag", [
    (0, 0, "positivo"),
    (-50, 0, "positivo"),
    (1000, 1500, "Entrada inválida"),
    (1000, -1, "Entrada inválida"),
])
def test_invalid_inputs_raise(admin, order_ctx, total, entrada, frag):
    with pytest.raises(Exception) as exc:
        create_receivable(admin, order_ctx, total=total, entrada=entrada)
    assert frag.lower() in str(exc.value).lower()
    assert _obligations_for(admin, order_ctx) == [], "input inválido não pode criar nada"


# ───────────────────────── order_financial_status (view) ────────────────────

def test_view_math_unpaid(admin, order_ctx):
    create_receivable(admin, order_ctx, total=1000, entrada=300)
    st = _order_status(admin, order_ctx)
    assert st is not None, "view deve retornar o pedido"
    assert float(st["total"]) == 1000.0
    assert float(st["received"]) == 0.0
    assert float(st["to_receive"]) == 1000.0
    assert float(st["received_pct"]) == 0.0
    assert st["payment_status"] == "open"


def test_view_invariant_total_equals_received_plus_toreceive(admin, order_ctx):
    create_receivable(admin, order_ctx, total=1234.56, entrada=234.56)
    st = _order_status(admin, order_ctx)
    assert abs(float(st["total"]) - (float(st["received"]) + float(st["to_receive"]))) < 0.001


@pytest.mark.skipif(not QA_BANK_ACCOUNT_ID, reason="QA_BANK_ACCOUNT_ID não configurado")
def test_payment_updates_received(admin, order_ctx):
    """Opcional: paga a entrada e confirma que 'recebido' sobe e status vira 'partial'."""
    ids = create_receivable(admin, order_ctx, total=1000, entrada=300)
    obs = _obligations_for(admin, order_ctx)
    entrada_ob = next(o for o in obs if float(o["original_amount"]) == 300.0)

    pay = admin.rpc("pay_obligation", {
        "p_obligation_id": entrada_ob["id"],
        "p_amount": 300,
        "p_account_id": QA_BANK_ACCOUNT_ID,
        "p_method": "PIX",
        "p_payment_date": datetime.date.today().isoformat(),
        "p_notes": f"{QA_TAG} pagamento de teste",
    }).execute()
    payment_id = pay.data

    try:
        st = _order_status(admin, order_ctx)
        assert float(st["received"]) == 300.0
        assert float(st["to_receive"]) == 700.0
        assert st["payment_status"] == "partial"
    finally:
        # Estorna para não deixar resíduo no saldo bancário.
        admin.rpc("reverse_payment", {"p_payment_id": payment_id,
                                      "p_reason": f"{QA_TAG} estorno de teste"}).execute()

"""
Fase 6 — Caixinhas (envelopes virtuais). Prova de correção das invariantes:
livre = total_real - alocado; não alocar além do livre; não liberar além do saldo.
"""
import pytest


def _overview(admin):
    return admin.rpc("get_envelope_overview").single().execute().data


def _balance(admin, eid):
    return float(admin.table("cash_envelopes").select("balance").eq("id", eid).single().execute().data["balance"])


def test_overview_invariant(admin):
    ov = _overview(admin)
    assert abs(float(ov["free"]) - (float(ov["total_real"]) - float(ov["allocated"]))) < 0.001


def test_move_zero_raises(admin, make_envelope):
    eid = make_envelope()
    with pytest.raises(Exception) as exc:
        admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": 0}).execute()
    assert "zero" in str(exc.value).lower() or "diferente" in str(exc.value).lower()


def test_allocate_beyond_free_raises(admin, make_envelope):
    """Alocar mais que o livre é bloqueado (invariante central)."""
    eid = make_envelope()
    with pytest.raises(Exception) as exc:
        admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": 1_000_000_000_000}).execute()
    assert "insuficiente" in str(exc.value).lower()
    assert _balance(admin, eid) == 0.0, "nada deve ter sido alocado"


def test_release_more_than_balance_raises(admin, make_envelope):
    eid = make_envelope()  # saldo 0
    with pytest.raises(Exception) as exc:
        admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": -100}).execute()
    assert "liberar" in str(exc.value).lower() or "não tem" in str(exc.value).lower()


def test_allocate_release_roundtrip(admin, make_envelope):
    """Se houver saldo livre, aloca e libera de volta, conferindo o 'livre'."""
    ov = _overview(admin)
    free = float(ov["free"])
    if free < 50:
        pytest.skip(f"saldo livre insuficiente para o teste (livre={free})")

    eid = make_envelope()
    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": 50}).execute()
    assert _balance(admin, eid) == 50.0
    assert abs(float(_overview(admin)["free"]) - (free - 50)) < 0.001, "livre deve cair 50"

    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": -50}).execute()
    assert _balance(admin, eid) == 0.0
    assert abs(float(_overview(admin)["free"]) - free) < 0.001, "livre deve voltar ao original"


def test_movements_recorded(admin, make_envelope):
    """Cada alocação/liberação vira um movimento no extrato (recebimentos/retiradas)."""
    ov = _overview(admin)
    if float(ov["free"]) < 30:
        pytest.skip("saldo livre insuficiente")
    eid = make_envelope()
    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": 30}).execute()
    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": -10}).execute()
    movs = admin.table("cash_envelope_movements").select("*").eq("envelope_id", eid).execute().data or []
    kinds = sorted(m["kind"] for m in movs)
    assert kinds == ["allocate", "release"]
    # devolve o resíduo
    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": -20}).execute()


def test_fund_envelopes_provisions_by_pct(admin, make_envelope):
    """Provisionamento automático aloca auto_fund_pct do valor-base, respeitando o livre."""
    ov = _overview(admin)
    if float(ov["free"]) < 100:
        pytest.skip("saldo livre insuficiente")
    eid = make_envelope()
    admin.table("cash_envelopes").update({"auto_fund_pct": 10}).eq("id", eid).execute()
    admin.rpc("fund_envelopes", {"p_base": 1000}).execute()   # 10% de 1000 = 100
    assert _balance(admin, eid) == 100.0
    admin.rpc("move_envelope", {"p_envelope_id": eid, "p_delta": -100}).execute()


def test_transfer_between_envelopes(admin, make_envelope):
    ov = _overview(admin)
    if float(ov["free"]) < 50:
        pytest.skip("saldo livre insuficiente")
    a = make_envelope(name="[QA-TEST] A")
    b = make_envelope(name="[QA-TEST] B")
    admin.rpc("move_envelope", {"p_envelope_id": a, "p_delta": 50}).execute()
    admin.rpc("transfer_envelope", {"p_from": a, "p_to": b, "p_amount": 30}).execute()
    assert _balance(admin, a) == 20.0
    assert _balance(admin, b) == 30.0
    # devolve ao livre para não deixar resíduo alocado
    admin.rpc("move_envelope", {"p_envelope_id": a, "p_delta": -20}).execute()
    admin.rpc("move_envelope", {"p_envelope_id": b, "p_delta": -30}).execute()

"""
Auditoria de segurança — valida as correções aplicadas via SQL.

  #1  obligation_summary / order_financial_status NÃO podem vazar para o papel
      'factory' (operador). Após a correção (security_invoker), o operador vê 0 linhas.
  #5  update_bank_balance NÃO pode ser executável diretamente por 'authenticated'.

Estes testes exercem a fronteira de RLS/grants pela mesma API do app.
"""
import uuid
import pytest


# ─────────────────────────────── #1 — RLS view ──────────────────────────────

def test_factory_cannot_read_obligation_summary(factory):
    """Operador não deve ler NENHUMA obrigação financeira pela view."""
    rows = factory.table("obligation_summary").select("id").limit(5).execute().data or []
    assert rows == [], (
        "VAZAMENTO: 'factory' leu obligation_summary. Aplique "
        "fix_security_audit_2026_07.sql (security_invoker=on na view)."
    )


def test_factory_cannot_read_order_financial_status(factory):
    rows = factory.table("order_financial_status").select("order_id").limit(5).execute().data or []
    assert rows == [], (
        "VAZAMENTO: 'factory' leu order_financial_status. A view derivada expõe "
        "dados financeiros — confirme security_invoker na base."
    )


def test_admin_can_read_obligation_summary(admin):
    """Sanidade: admin/manager continua com acesso (não quebramos o legítimo)."""
    # Não deve levantar exceção; lista (possivelmente vazia) é aceitável.
    resp = admin.table("obligation_summary").select("id").limit(1).execute()
    assert resp is not None


# ────────────────────────── #5 — revoke bank balance ────────────────────────

def test_update_bank_balance_denied_for_authenticated(admin):
    """
    Mesmo autenticado como admin, a RPC direta deve falhar (EXECUTE revogado).
    O ajuste de saldo só pode vir das RPCs internas (pay/reverse).
    """
    with pytest.raises(Exception) as exc:
        admin.rpc("update_bank_balance", {
            "p_account_id": str(uuid.uuid4()),
            "p_delta": 0,
        }).execute()
    msg = str(exc.value).lower()
    assert any(k in msg for k in ["permission", "denied", "not find", "does not exist", "not allowed", "42501", "pgrst202"]), (
        f"Esperava erro de permissão/inexistência; veio: {exc.value}"
    )


# ─────────────────── Fase 2/3/4 — RPCs barram o operador ─────────────────────

def test_factory_denied_finance_reports(factory):
    """As RPCs financeiras (assert_finance_access) devem negar o papel 'factory'."""
    for fn, args in [
        ("get_delivered_unpaid", {}),
        ("get_client_receivables", {}),
        ("get_advance_received", {}),
    ]:
        with pytest.raises(Exception) as exc:
            factory.rpc(fn, args).execute()
        assert "negad" in str(exc.value).lower() or "denied" in str(exc.value).lower() \
            or "permission" in str(exc.value).lower() or "42501" in str(exc.value).lower(), (
            f"{fn} deveria negar factory; veio: {exc.value}"
        )

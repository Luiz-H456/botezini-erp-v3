"""
Fixtures compartilhadas dos testes de QA do módulo financeiro (Fase 1 + auditoria).

Filosofia:
  * Testes de INTEGRAÇÃO reais — batem no Supabase pela mesma API/RLS do app.
  * Seguros: toda escrita é marcada com [QA-TEST] e removida no teardown, e só
    ocorre se QA_ALLOW_WRITES=1.
  * Autenticam por login (email/senha), então RLS e grants são exercidos de verdade.
"""
import os
import uuid
import pytest
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
QA_ADMIN_EMAIL = os.getenv("QA_ADMIN_EMAIL", "").strip()
QA_ADMIN_PASSWORD = os.getenv("QA_ADMIN_PASSWORD", "").strip()
QA_FACTORY_EMAIL = os.getenv("QA_FACTORY_EMAIL", "").strip()
QA_FACTORY_PASSWORD = os.getenv("QA_FACTORY_PASSWORD", "").strip()
QA_ALLOW_WRITES = os.getenv("QA_ALLOW_WRITES", "0").strip() == "1"
QA_BANK_ACCOUNT_ID = os.getenv("QA_BANK_ACCOUNT_ID", "").strip()

QA_TAG = "[QA-TEST]"


def _require_conn():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        pytest.skip("SUPABASE_URL / SUPABASE_ANON_KEY não configurados em tests/.env")


def _login(email: str, password: str) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.sign_in_with_password({"email": email, "password": password})
    return client


@pytest.fixture(scope="session")
def admin() -> Client:
    """Cliente autenticado como admin/manager (acesso financeiro)."""
    _require_conn()
    if not QA_ADMIN_EMAIL or not QA_ADMIN_PASSWORD:
        pytest.skip("QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD não configurados")
    return _login(QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def factory():
    """Cliente autenticado como 'factory' (operador). Pula se não configurado."""
    _require_conn()
    if not QA_FACTORY_EMAIL or not QA_FACTORY_PASSWORD:
        pytest.skip("QA_FACTORY_EMAIL / QA_FACTORY_PASSWORD não configurados (teste de RLS do operador)")
    return _login(QA_FACTORY_EMAIL, QA_FACTORY_PASSWORD)


@pytest.fixture
def writes_enabled():
    if not QA_ALLOW_WRITES:
        pytest.skip("QA_ALLOW_WRITES != 1 — testes que escrevem no banco estão desabilitados")


@pytest.fixture
def order_ctx(admin, writes_enabled):
    """
    Semeia um PEDIDO real (financial_obligations.order_id tem FK → orders.id) e
    devolve seu id. Limpa no fim: obrigações → pedido → (cliente, se criado aqui).
    Reusa um cliente existente quando possível para minimizar escrita.
    """
    import datetime

    # 1) cliente: reusa um existente ou cria um descartável
    created_client = False
    rows = admin.table("clients").select("id").limit(1).execute().data or []
    if rows:
        client_id = rows[0]["id"]
    else:
        client_id = str(uuid.uuid4())
        admin.table("clients").insert({
            "id": client_id, "company_name": f"{QA_TAG} Cliente",
        }).execute()
        created_client = True

    # 2) pedido mínimo válido
    order_id = str(uuid.uuid4())
    admin.table("orders").insert({
        "id": order_id,
        "order_number": f"QA-{uuid.uuid4().hex[:8]}",
        "client_id": client_id,
        "deadline": datetime.date.today().isoformat(),
        "total_amount": 0,
        "status": "Pendente",
    }).execute()

    yield order_id

    # 3) teardown na ordem inversa das FKs: pagamentos → obrigações → pedido → cliente
    try:
        obl = admin.table("financial_obligations").select("id").eq("order_id", order_id).execute().data or []
        obl_ids = [o["id"] for o in obl]
        if obl_ids:
            admin.table("obligation_payments").delete().in_("obligation_id", obl_ids).execute()
        admin.table("financial_obligations").delete().eq("order_id", order_id).execute()
        admin.table("orders").delete().eq("id", order_id).execute()
        if created_client:
            admin.table("clients").delete().eq("id", client_id).execute()
    except Exception as e:  # pragma: no cover
        print(f"[teardown] falha ao limpar order_id={order_id}: {e}")


@pytest.fixture
def make_envelope(admin, writes_enabled):
    """Factory de caixinhas com limpeza automática (movimentos caem por cascade)."""
    created = []

    def _make(name=f"{QA_TAG} Caixinha", color="#8b5cf6", target=0):
        eid = str(uuid.uuid4())
        admin.table("cash_envelopes").insert({
            "id": eid, "name": name, "color": color, "target_amount": target,
        }).execute()
        created.append(eid)
        return eid

    yield _make
    for eid in created:
        try:
            admin.table("cash_envelopes").delete().eq("id", eid).execute()
        except Exception:  # pragma: no cover
            pass


def create_receivable(admin: Client, order_id: str, total: float,
                      entrada: float = 0, entrada_due=None, saldo_due=None):
    """Helper: chama a RPC create_order_receivable e devolve a lista de ids."""
    import datetime
    # Vencimento padrão no futuro para status determinístico ('open'), evitando
    # que a diferença de fuso servidor(UTC)×cliente marque como 'overdue'.
    future = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
    resp = admin.rpc("create_order_receivable", {
        "p_order_id": order_id,
        "p_client_id": None,
        "p_description": f"{QA_TAG} Pedido de teste",
        "p_total": total,
        "p_entrada": entrada,
        "p_entrada_due": entrada_due or future,
        "p_saldo_due": saldo_due or future,
    }).execute()
    return resp.data or []

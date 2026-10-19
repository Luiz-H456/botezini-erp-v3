# QA — Testes automatizados (módulo financeiro)

Testes de **integração** que batem no Supabase pela mesma API/RLS do app.
Validam a Fase 1 (recebível entrada+saldo, view de status por pedido) e as
correções de segurança (#1 vazamento de RLS, #5 revoke de `update_bank_balance`).

## Pré-requisitos

1. Os dois SQLs já aplicados no Supabase:
   - `supabase/fix_security_audit_2026_07.sql`
   - `supabase/finance_phase1_single_source_of_truth.sql`
2. Python 3.12 e as dependências:

```bash
cd tests
python -m pip install -r requirements.txt
```

## Configuração

```bash
cp .env.example .env
# edite tests/.env com URL, anon key e um usuário admin/manager
```

- `QA_ALLOW_WRITES=1` libera os testes que **criam/apagam** obrigações de teste
  (marcadas com `[QA-TEST]`, removidas no teardown). **Use staging quando possível.**
- `QA_FACTORY_*` (opcional): usuário `factory` para provar o vazamento de RLS.
  Sem ele, esses testes são **pulados** (não falham).
- `QA_BANK_ACCOUNT_ID` (opcional): conta ativa descartável para o teste de
  pagamento→recebido (o teste estorna o pagamento no fim).

## Rodar

```bash
cd tests
python -m pytest -v
```

Filtrar:
```bash
python -m pytest test_security_audit.py -v      # só segurança
python -m pytest test_phase1_receivables.py -v  # só Fase 1
```

## Segurança dos testes

- Nenhuma escrita ocorre com `QA_ALLOW_WRITES=0` (default).
- Toda obrigação criada é vinculada a um `order_id` fake e **hard-deletada** no
  teardown, mesmo se o teste falhar no meio.
- O teste de pagamento estorna o lançamento para não sujar saldo bancário.
- Ainda assim: **prefira um projeto Supabase de staging** a produção.

## O que cada teste cobre

| Arquivo | Cobre |
|---|---|
| `test_phase1_receivables.py` | split entrada/saldo, obrigação única, idempotência por `order_id`, validações (total/entrada), matemática da view `order_financial_status`, (opcional) pagamento→recebido |
| `test_security_audit.py` | operador não lê `obligation_summary`/`order_financial_status`; admin ainda lê; `update_bank_balance` negado a `authenticated` |

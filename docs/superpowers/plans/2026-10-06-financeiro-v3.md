# Financeiro v3 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as três telas financeiras de hoje (Financeiro, Recebíveis, Caixinhas) por um módulo Finanças com quatro páginas de uma pergunta cada, e fazer a parcela de pedido não entregue deixar de aparecer como "a receber" ou "atrasada".

**Architecture:** O banco ganha `orders.delivered_at` e a coluna `awaiting_delivery` em `obligation_summary`; toda a conta das telas mora em funções puras em `src/utils/financas/` (testadas com `node --test`); as páginas em `src/pages/financas/` só desenham o que essas funções devolvem. A janela Confirmar entrega, no kanban do PCP, é o único ponto que libera as parcelas.

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind v4; Supabase/PostgREST com RLS; testes `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-06-financeiro-v3-design.md` (leia antes de começar; este plano argumenta a partir dela).

## Global Constraints

- Pasta: `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`. Nada aqui toca a pasta `botezinipvd-1` nem o banco de produção.
- Banco: só o Supabase local da v3, contêiner `supabase_db_botezini-v3`, API `http://127.0.0.1:55321`. SQL entra por `docker exec` com a senha local padrão `postgres`. **Nunca** usar `BOTEZINI_DB_URI`, `supabase link` ou `--linked`.
- No Git Bash, todo `docker exec`/`docker cp` com caminho de contêiner precisa de `export MSYS_NO_PATHCONV=1` antes.
- Testes: `node --test --experimental-strip-types "src/**/*.test.ts"` na raiz. A suíte de hoje tem 1.310 testes passando; continua passando ao fim de toda tarefa.
- Tipos: `npx tsc --noEmit -p tsconfig.json` está com **zero erros** hoje e continua com zero ao fim de toda tarefa.
- Módulos em `src/utils/financas/` importam só arquivos relativos com extensão `.ts` e nunca `../types` em tempo de execução (é diretório e quebra o runner); usam tipos estruturais.
- Tema: o escuro de hoje (zinco). Vencido em `text-amber-400`, entrada em `text-emerald-400`, nada em vermelho nas páginas novas, números com `tabular-nums`.
- Modo privacidade: todo valor em reais passa por `useMostrarValor()` (Tarefa 8), que devolve `••••••` quando `usePrivacidade().oculto`.
- Textos de tela iguais aos da spec: "Livre para usar", "Fecha <mês> com", "só pedidos já entregues", "A receber · vencido", "A receber · 7 dias", "A pagar · vencido", "A pagar · 7 dias", "Recebi", "Paguei", "+ Nova conta", "Confirmar entrega".
- Dev server da v3: `npm run dev:v3` (porta 5175). Termine cada tarefa com ele de pé.
- Cada tarefa termina num commit cuja mensagem acaba com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pedido entregue que nunca teve conta a receber** (pedido antigo, sem plano) → a janela Confirmar entrega propõe uma "Parcela única" com o total do pedido e o prazo; confirmar cria a conta. Teste na Tarefa 6 (`planoInicial` sem contas).
2. **Pedido já todo pago antes da entrega** → não há parcela editável, a soma fecha e confirmar não chama `revise_order_plan` (que recusa plano vazio). Teste na Tarefa 6.
3. **Caixinhas maiores que o saldo dos bancos** → "Livre para usar" negativo, em âmbar, sem quebrar a projeção. Teste na Tarefa 3.
4. **Mês anterior sem movimento** → a comparação do Resultado mostra "—" em vez de dividir por zero. Teste na Tarefa 4 (`variacao`).
5. **Estorno num mês diferente do pagamento** → o caixa do mês do estorno desconta o valor; o mês do pagamento não muda. Teste na Tarefa 4.

---

### Task 1: Banco — data da entrega, parcela aguardando entrega, usuário de teste

**Files:**
- Create: `supabase/financeiro_v3_1_entrega.sql`
- Create: `supabase/conferencia_financeiro_v3.sql`
- Create: `scripts/v3/criar_usuario_teste.sh`
- Modify: `src/types/index.ts` (interfaces `Order`, `ObligationPayment`, `ObligationSummary`)
- Modify: `src/repositories/financeRepository.ts` (`getObligations`, mapa do retorno)
- Modify: `CLAUDE.md` (seção "Ambiente v3")

**Interfaces:**
- Produces: `obligation_summary.awaiting_delivery boolean`; `orders.delivered_at date`; `ObligationSummary.awaiting_delivery?: boolean`; `Order.delivered_at?: string | null`; `ObligationPayment.affects_balance?: boolean`; variáveis `V3_TESTE_EMAIL` e `V3_TESTE_SENHA` em `.env.v3.local`.

- [ ] **Step 1: Escrever a migração**

Crie `supabase/financeiro_v3_1_entrega.sql`:

```sql
-- =============================================================================
-- FINANCEIRO V3 · 1 — parcela de pedido não entregue não é "a receber"
--
-- 1. orders.delivered_at: a data em que o pedido foi entregue. As entregas
--    antigas recebem updated_at como APROXIMAÇÃO — não existe registro de
--    quando cada uma aconteceu (audit_logs vazio). A consulta do fim lista
--    todas para correção à mão.
-- 2. obligation_summary.awaiting_delivery: verdadeiro para conta a receber de
--    pedido que ainda não está 'Entregue'. derived_status NÃO muda, porque
--    reverse_payment e register_informational_payment copiam derived_status
--    para financial_obligations.status; um status novo vazaria para a tabela.
-- 3. Somas de "a receber" ignoram as que aguardam entrega.
-- 4. 'Concluído' sai dos filtros de status (nenhum pedido usa).
--
-- Somente na v3 local até o Luiz decidir levar para produção.
-- =============================================================================

-- ANTES (somente leitura)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivered_at') AS ja_tem_delivered_at,
  (SELECT count(*) FROM public.orders WHERE status = 'Entregue')  AS pedidos_entregues,
  (SELECT count(*) FROM public.orders WHERE status = 'Concluído') AS pedidos_concluidos;

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at date;

UPDATE public.orders
   SET delivered_at = (updated_at AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE status = 'Entregue' AND delivered_at IS NULL;

CREATE OR REPLACE VIEW public.obligation_summary WITH (security_invoker = on) AS
 SELECT o.id,
    o.user_id,
    o.type,
    o.status,
    o.description,
    o.original_amount,
    o.due_date,
    o.issue_date,
    o.category,
    o.cost_center_id,
    o.notes,
    o.client_id,
    o.supplier_id,
    o.default_account_id,
    o.is_recurring,
    o.recurrence_id,
    o.installment_no,
    o.total_installments,
    o.split_group_id,
    o.cancelled_at,
    o.cancelled_reason,
    o.is_reconciled,
    o.unreconciled_reason,
    o.unreconciled_at,
    o.attachments,
    o.created_at,
    o.updated_at,
    COALESCE(sum(p.amount) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS paid_amount,
    o.original_amount - COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS remaining_amount,
    count(p.id) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL) AS payment_count,
    round(
        CASE
            WHEN o.original_amount > 0::numeric THEN COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) / o.original_amount * 100::numeric
            ELSE 0::numeric
        END, 2) AS paid_pct,
        CASE
            WHEN o.cancelled_at IS NOT NULL THEN 'cancelled'::text
            WHEN (o.original_amount - COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric)) <= 0::numeric THEN 'paid'::text
            WHEN COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) > 0::numeric THEN 'partial'::text
            WHEN o.due_date < (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date THEN 'overdue'::text
            ELSE 'open'::text
        END AS derived_status,
    o.global_category_id,
    o.order_id,
    o.planned_method,
    COALESCE(sum(p.amount + p.desconto - p.acrescimo) FILTER (WHERE p.reversed_at IS NULL AND p.reversal_of IS NULL), 0::numeric) AS amortized_amount,
    (o.type = 'receivable' AND ord.id IS NOT NULL AND ord.status IS DISTINCT FROM 'Entregue') AS awaiting_delivery
   FROM public.financial_obligations o
     LEFT JOIN public.obligation_payments p ON o.id = p.obligation_id
     LEFT JOIN public.orders ord ON ord.id = o.order_id
  GROUP BY o.id, ord.id;

CREATE OR REPLACE FUNCTION public.get_cash_position(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS TABLE(projected_balance numeric, reconciled_balance numeric, net_flow numeric, total_receivable numeric, total_payable numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo      numeric;
  v_receber    numeric;
  v_pagar      numeric;
BEGIN
  SELECT COALESCE(SUM(current_balance), 0) INTO v_saldo
  FROM public.bank_accounts WHERE is_active;

  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_receber
  FROM public.obligation_summary
  WHERE type = 'receivable' AND derived_status NOT IN ('paid','cancelled')
    AND NOT awaiting_delivery
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  SELECT COALESCE(SUM(remaining_amount), 0) INTO v_pagar
  FROM public.obligation_summary
  WHERE type = 'payable' AND derived_status NOT IN ('paid','cancelled')
    AND (p_start IS NULL OR due_date >= p_start)
    AND (p_end   IS NULL OR due_date <= p_end);

  RETURN QUERY SELECT
    v_saldo + v_receber - v_pagar,
    v_saldo,
    v_receber - v_pagar,
    v_receber,
    v_pagar;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_receivables()
 RETURNS TABLE(client_id uuid, client_name text, open_total numeric, overdue_total numeric, not_due_total numeric, obligations_cnt bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    os.client_id,
    c.company_name,
    SUM(os.remaining_amount)                                              AS open_total,
    SUM(os.remaining_amount) FILTER (WHERE os.derived_status = 'overdue') AS overdue_total,
    SUM(os.remaining_amount) FILTER (WHERE os.derived_status <> 'overdue')AS not_due_total,
    COUNT(*)                                                              AS obligations_cnt
  FROM public.obligation_summary os
  LEFT JOIN public.clients c ON c.id = os.client_id
  WHERE os.type = 'receivable'
    AND os.derived_status <> 'cancelled'
    AND os.remaining_amount > 0
    AND os.client_id IS NOT NULL
    AND NOT os.awaiting_delivery
  GROUP BY os.client_id, c.company_name
  ORDER BY overdue_total DESC NULLS LAST, open_total DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_aging_buckets(p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(obligation_type text, bucket text, cnt bigint, total_amount numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    os.type AS obligation_type,
    CASE
      WHEN os.due_date >= p_reference_date                           THEN 'current'
      WHEN os.due_date >= p_reference_date - INTERVAL '30 days'     THEN '1_30'
      WHEN os.due_date >= p_reference_date - INTERVAL '60 days'     THEN '31_60'
      ELSE '60_plus'
    END AS bucket,
    COUNT(*)::bigint AS cnt,
    SUM(os.remaining_amount) AS total_amount
  FROM obligation_summary os
  WHERE os.derived_status NOT IN ('paid', 'cancelled')
    AND NOT os.awaiting_delivery
  GROUP BY os.type, bucket;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pending_installments()
 RETURNS TABLE(obligation_id uuid, order_id uuid, order_number text, client_name text, description text, due_date date, remaining_amount numeric, planned_method text, derived_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT os.id, os.order_id, o.order_number, c.company_name, os.description,
         os.due_date, os.remaining_amount, os.planned_method, os.derived_status
  FROM public.obligation_summary os
  JOIN public.orders o  ON o.id = os.order_id
  LEFT JOIN public.clients c ON c.id = os.client_id
  WHERE os.type = 'receivable'
    AND os.derived_status <> 'cancelled'
    AND os.remaining_amount > 0
    AND o.status = 'Entregue'
  ORDER BY os.due_date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_delivered_unpaid()
 RETURNS TABLE(order_id uuid, order_number text, client_id uuid, client_name text, status text, deadline date, total numeric, received numeric, to_receive numeric, next_due_date date, has_overdue boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_finance_access();
  RETURN QUERY
  SELECT
    o.id, o.order_number, o.client_id, c.company_name,
    o.status::text, o.deadline,
    ofs.total, ofs.received, ofs.to_receive, ofs.next_due_date, ofs.has_overdue
  FROM public.orders o
  JOIN public.order_financial_status ofs ON ofs.order_id = o.id
  LEFT JOIN public.clients c ON c.id = o.client_id
  WHERE o.status = 'Entregue'
    AND ofs.to_receive > 0
  ORDER BY ofs.has_overdue DESC, ofs.next_due_date NULLS LAST;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- DEPOIS (somente leitura): as entregas antigas, para conferir a data à mão
SELECT order_number, delivered_at, updated_at
  FROM public.orders WHERE status = 'Entregue' ORDER BY delivered_at, order_number;

SELECT count(*) FILTER (WHERE awaiting_delivery) AS aguardando_entrega,
       count(*) FILTER (WHERE type = 'receivable')  AS contas_a_receber
  FROM public.obligation_summary;
```

- [ ] **Step 2: Escrever a consulta de conferência (usada também nas Tarefas 11–14)**

Crie `supabase/conferencia_financeiro_v3.sql`:

```sql
-- Conferência do Financeiro v3 — SOMENTE LEITURA.
-- Devolve os números que a Visão geral tem que mostrar HOJE. Mudam com a data:
-- rode no mesmo dia em que conferir a tela.
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
abertas AS (
  SELECT os.* FROM public.obligation_summary os
  WHERE os.derived_status <> 'cancelled' AND os.remaining_amount > 0
)
SELECT 'receber_vencido' AS numero, count(*) AS contas, COALESCE(sum(remaining_amount), 0) AS total
  FROM abertas, hoje WHERE type = 'receivable' AND NOT awaiting_delivery AND due_date < hoje.d
UNION ALL
SELECT 'receber_7_dias', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'receivable' AND NOT awaiting_delivery AND due_date >= hoje.d AND due_date <= hoje.d + 6
UNION ALL
SELECT 'pagar_vencido', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'payable' AND due_date < hoje.d
UNION ALL
SELECT 'pagar_7_dias', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas, hoje WHERE type = 'payable' AND due_date >= hoje.d AND due_date <= hoje.d + 6
UNION ALL
SELECT 'em_producao', count(*), COALESCE(sum(remaining_amount), 0)
  FROM abertas WHERE awaiting_delivery
UNION ALL
SELECT 'livre', 0,
  (SELECT COALESCE(sum(current_balance), 0) FROM public.bank_accounts WHERE is_active)
  - (SELECT COALESCE(sum(balance), 0) FROM public.cash_envelopes WHERE NOT COALESCE(is_archived, false));
```

- [ ] **Step 3: Aplicar no banco da v3 e conferir**

```bash
cd "C:/Users/luuii/OneDrive/Documentos/botezinipvd-v3"
export MSYS_NO_PATHCONV=1
docker cp supabase/financeiro_v3_1_entrega.sql supabase_db_botezini-v3:/tmp/m1.sql
docker exec -e PGPASSWORD=postgres supabase_db_botezini-v3 psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/m1.sql
docker cp supabase/conferencia_financeiro_v3.sql supabase_db_botezini-v3:/tmp/c.sql
docker exec supabase_db_botezini-v3 psql -U postgres -f /tmp/c.sql
```

Expected: a migração termina sem `ERROR`; a lista do DEPOIS mostra 22 pedidos entregues com `delivered_at` preenchido; `aguardando_entrega` > 0. Na conferência, com a base de 06/10/2026: `receber_vencido` = 8 contas, 28552.35; `em_producao` = 20 contas, 51038.40. Em outra data os números diferem — o que importa é que `em_producao` exista e que nenhuma conta dele apareça em `receber_vencido`.

- [ ] **Step 4: Tipos e repositório**

Em `src/types/index.ts`:
- na `interface Order`, logo abaixo de `deadline: string;`, acrescente:
  ```ts
  /** Dia em que o pedido foi entregue (Confirmar entrega). Entregas antigas têm aproximação. */
  delivered_at?: string | null;
  ```
- na `interface ObligationPayment`, abaixo de `attachments?: string[];`, acrescente:
  ```ts
  /** false = lançamento informativo: baixou a conta sem mexer no saldo do banco. */
  affects_balance?: boolean;
  ```
- na `interface ObligationSummary`, abaixo de `paid_pct: number;`, acrescente:
  ```ts
  /** A receber de pedido ainda não entregue: não é "a receber" nem "atrasada". */
  awaiting_delivery?: boolean;
  ```

Em `src/repositories/financeRepository.ts`, no `map` do retorno de `getObligations`, abaixo de `is_recurring: Boolean(r.is_recurring),` acrescente:
```ts
            awaiting_delivery: Boolean(r.awaiting_delivery),
```

- [ ] **Step 5: Usuário de teste só da v3**

Crie `scripts/v3/criar_usuario_teste.sh`:

```sh
#!/bin/sh
# Cria (ou recria) o usuário de teste da v3 no Supabase LOCAL, com papel admin.
# Lê e-mail e senha de .env.v3.local (ignorado pelo git); se não existirem, gera.
# Só fala com o contêiner supabase_db_botezini-v3. Nunca com produção.
set -eu
cd "$(dirname "$0")/../.."
ENV=.env.v3.local
if ! grep -q '^V3_TESTE_SENHA=' "$ENV"; then
  echo "V3_TESTE_EMAIL=teste-v3@botezini.local" >> "$ENV"
  echo "V3_TESTE_SENHA=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")" >> "$ENV"
fi
EMAIL=$(grep '^V3_TESTE_EMAIL=' "$ENV" | cut -d= -f2-)
SENHA=$(grep '^V3_TESTE_SENHA=' "$ENV" | cut -d= -f2-)
export MSYS_NO_PATHCONV=1
docker exec -e PGPASSWORD=postgres -i supabase_db_botezini-v3 psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -v email="$EMAIL" -v senha="$SENHA" <<'SQL'
DELETE FROM auth.users WHERE email = :'email';
WITH u AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          :'email', extensions.crypt(:'senha', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"full_name":"Teste v3"}', now(), now(), '', '', '', '')
  RETURNING id, email
)
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now() FROM u;
INSERT INTO public.profiles (id, email, role, full_name)
SELECT id, email, 'admin', 'Teste v3' FROM auth.users WHERE email = :'email'
ON CONFLICT (id) DO UPDATE SET role = 'admin';
SQL
echo "usuário de teste pronto: $EMAIL (senha em $ENV)"
```

Run: `sh scripts/v3/criar_usuario_teste.sh`
Expected: `usuário de teste pronto: teste-v3@botezini.local (senha em .env.v3.local)`. Confira com
`docker exec supabase_db_botezini-v3 psql -U postgres -tAc "select role from public.profiles where email='teste-v3@botezini.local'"` → `admin`.

- [ ] **Step 6: Registrar no CLAUDE.md**

Em `CLAUDE.md`, na seção "Ambiente v3 (esta pasta)", acrescente ao fim da lista:

```markdown
- **Depois de recarregar o dump**, reaplique as migrações da v3 em ordem
  (`supabase/financeiro_v3_1_entrega.sql`, …) e recrie o usuário de teste com
  `sh scripts/v3/criar_usuario_teste.sh` — o reset apaga os dois.
- **Usuário de teste** (`V3_TESTE_EMAIL`/`V3_TESTE_SENHA` em `.env.v3.local`) é admin e
  existe só no banco local. É ele que verifica as telas; a conta real do Luiz não.
```

- [ ] **Step 7: Rodar a suíte, os tipos e commitar**

```bash
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
npx tsc --noEmit -p tsconfig.json
git add supabase/financeiro_v3_1_entrega.sql supabase/conferencia_financeiro_v3.sql scripts/v3/criar_usuario_teste.sh src/types/index.ts src/repositories/financeRepository.ts CLAUDE.md
git commit -m "feat(financeiro): parcela de pedido não entregue fica aguardando entrega

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `# fail 0`; `tsc` sem saída.

---

### Task 2: Base e situação de uma conta

**Files:**
- Create: `src/utils/financas/base.ts`
- Create: `src/utils/financas/situacao.ts`
- Test: `src/utils/financas/base.test.ts`, `src/utils/financas/situacao.test.ts`

**Interfaces:**
- Produces:
  - `interface ContaResumo { id; type: 'receivable'|'payable'; description; due_date; original_amount; remaining_amount; derived_status: string; awaiting_delivery?; is_reconciled?; payment_count?; client_id?; supplier_id?; order_id?; global_category_id?; category?; installment_no?; total_installments?; planned_method? }`
  - `interface PagamentoResumo { obligation_id; amount; payment_date; account_id?; reversal_of?; affects_balance?; created_at? }`
  - `interface CategoriaResumo { id; name; custo_do_produto? }`
  - `centavos(n): number`, `diasEntre(de, ate): number`, `somarDias(dia, n): string`, `ultimoDiaDoMes(dia): string`, `mesDe(dia): string`, `mesAnterior(mes): string`, `proximoMes(mes): string`, `nomeDoMes(mes): string`, `diaDaSemana(dia): string`, `diaEMes(dia): string`, `reais(n): string`, `trimestreDe(mes): string[]`, `nomeDoTrimestre(mes): string`
  - `type Situacao = 'cancelada'|'paga'|'aguardando_entrega'|'vencida'|'a_vencer'`; `situacaoDaConta(c, hoje): Situacao`; `diasDeAtraso(c, hoje): number`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/base.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    centavos, diasEntre, somarDias, ultimoDiaDoMes, mesAnterior, proximoMes,
    nomeDoMes, diaDaSemana, diaEMes, reais, trimestreDe, nomeDoTrimestre,
} from './base.ts';

test('centavos arredonda meio centavo para cima', () => {
    assert.equal(centavos(49.9995), 50);
    assert.equal(centavos(0.1 + 0.2), 0.3);
});

test('diasEntre conta dias de calendário, atravessando mês', () => {
    assert.equal(diasEntre('2026-09-30', '2026-10-06'), 6);
    assert.equal(diasEntre('2026-10-06', '2026-10-06'), 0);
    assert.equal(diasEntre('2026-10-06', '2026-10-01'), -5);
});

test('somarDias e ultimoDiaDoMes atravessam mês e ano', () => {
    assert.equal(somarDias('2026-10-28', 6), '2026-11-03');
    assert.equal(somarDias('2026-12-30', 3), '2027-01-02');
    assert.equal(ultimoDiaDoMes('2026-02-10'), '2026-02-28');
    assert.equal(ultimoDiaDoMes('2026-10-06'), '2026-10-31');
});

test('meses vizinhos e nome do mês', () => {
    assert.equal(mesAnterior('2026-01'), '2025-12');
    assert.equal(proximoMes('2026-12'), '2027-01');
    assert.equal(nomeDoMes('2026-10'), 'outubro 2026');
});

test('trimestre civil de um mês', () => {
    assert.deepEqual(trimestreDe('2026-08'), ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(trimestreDe('2026-01'), ['2026-01', '2026-02', '2026-03']);
    assert.equal(nomeDoTrimestre('2026-11'), '4º trimestre 2026');
});

test('dia da semana e dia/mês curtos', () => {
    assert.equal(diaDaSemana('2026-10-06'), 'ter');
    assert.equal(diaEMes('2026-10-06'), '06/10');
});

test('reais formata com ponto de milhar e vírgula', () => {
    assert.equal(reais(1234567.5), 'R$ 1.234.567,50');
    assert.equal(reais(300), 'R$ 300,00');
    assert.equal(reais(-300), '-R$ 300,00');
});
```

`src/utils/financas/situacao.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDaConta, diasDeAtraso } from './situacao.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: 'x', type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

test('cancelada e paga vêm antes de tudo', () => {
    assert.equal(situacaoDaConta(conta({ derived_status: 'cancelled', awaiting_delivery: true }), HOJE), 'cancelada');
    assert.equal(situacaoDaConta(conta({ derived_status: 'paid', remaining_amount: 0 }), HOJE), 'paga');
    assert.equal(situacaoDaConta(conta({ derived_status: 'partial', remaining_amount: 0 }), HOJE), 'paga');
});

test('a receber de pedido não entregue aguarda entrega mesmo vencida', () => {
    assert.equal(situacaoDaConta(conta({ due_date: '2026-09-01', awaiting_delivery: true }), HOJE), 'aguardando_entrega');
});

test('awaiting_delivery numa conta a pagar não muda nada', () => {
    assert.equal(situacaoDaConta(conta({ type: 'payable', due_date: '2026-09-01', awaiting_delivery: true }), HOJE), 'vencida');
});

test('paga em parte e vencida é vencida; vence hoje é a vencer', () => {
    assert.equal(situacaoDaConta(conta({ derived_status: 'partial', due_date: '2026-10-01', remaining_amount: 40 }), HOJE), 'vencida');
    assert.equal(situacaoDaConta(conta({ due_date: HOJE }), HOJE), 'a_vencer');
});

test('dias de atraso nunca é negativo', () => {
    assert.equal(diasDeAtraso(conta({ due_date: '2026-09-24' }), HOJE), 12);
    assert.equal(diasDeAtraso(conta({ due_date: '2026-10-20' }), HOJE), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/base.test.ts src/utils/financas/situacao.test.ts`
Expected: FAIL — `Cannot find module` para `./base.ts` e `./situacao.ts`.

- [ ] **Step 3: Implementar**

`src/utils/financas/base.ts`:
```ts
/**
 * Base das contas do Financeiro v3: tipos estruturais e datas.
 *
 * Tipos estruturais, e não ObligationSummary, para o módulo rodar no
 * `node --test` sem importar `../types` (que é diretório e quebra o runner).
 * Datas são texto ISO (YYYY-MM-DD) e as contas são feitas em UTC: assim fuso
 * nenhum empurra um vencimento para o dia vizinho.
 */

export interface ContaResumo {
    id: string;
    type: 'receivable' | 'payable';
    description: string;
    due_date: string;
    original_amount: number;
    remaining_amount: number;
    derived_status: string;
    awaiting_delivery?: boolean | null;
    is_reconciled?: boolean | null;
    payment_count?: number | null;
    client_id?: string | null;
    supplier_id?: string | null;
    order_id?: string | null;
    global_category_id?: string | null;
    category?: string | null;
    installment_no?: number | null;
    total_installments?: number | null;
    planned_method?: string | null;
}

export interface PagamentoResumo {
    obligation_id: string;
    amount: number;
    payment_date: string;
    account_id?: string | null;
    reversal_of?: string | null;
    affects_balance?: boolean | null;
    created_at?: string | null;
}

export interface CategoriaResumo {
    id: string;
    name: string;
    custo_do_produto?: boolean | null;
}

export const centavos = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const DIA_EM_MS = 86_400_000;

const emUtc = (dia: string): number => {
    const [y, m, d] = dia.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const paraIso = (t: number): string => new Date(t).toISOString().slice(0, 10);

export const diasEntre = (de: string, ate: string): number => Math.round((emUtc(ate) - emUtc(de)) / DIA_EM_MS);
export const somarDias = (dia: string, dias: number): string => paraIso(emUtc(dia) + dias * DIA_EM_MS);

export const ultimoDiaDoMes = (dia: string): string => {
    const [y, m] = dia.split('-').map(Number);
    return paraIso(Date.UTC(y, m, 0));
};

export const mesDe = (dia: string): string => dia.slice(0, 7);

export const mesAnterior = (mes: string): string => {
    const [y, m] = mes.split('-').map(Number);
    return paraIso(Date.UTC(y, m - 2, 1)).slice(0, 7);
};

export const proximoMes = (mes: string): string => {
    const [y, m] = mes.split('-').map(Number);
    return paraIso(Date.UTC(y, m, 1)).slice(0, 7);
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (mes: string): string => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Os três meses do trimestre civil (jan–mar, abr–jun, jul–set, out–dez) que contém `mes`. */
export const trimestreDe = (mes: string): string[] => {
    const [y, m] = mes.split('-').map(Number);
    const primeiro = Math.floor((m - 1) / 3) * 3 + 1;
    return [0, 1, 2].map(i => `${y}-${String(primeiro + i).padStart(2, '0')}`);
};
export const nomeDoTrimestre = (mes: string): string =>
    `${Math.floor((Number(mes.slice(5, 7)) - 1) / 3) + 1}º trimestre ${mes.slice(0, 4)}`;

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const diaDaSemana = (dia: string): string => SEMANA[new Date(emUtc(dia)).getUTCDay()];
export const diaEMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Real brasileiro sem depender do ICU do ambiente (que põe espaço inseparável). */
export function reais(n: number): string {
    const v = centavos(n);
    const [inteiro, decimal] = Math.abs(v).toFixed(2).split('.');
    const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${v < 0 ? '-' : ''}R$ ${comPontos},${decimal}`;
}
```

`src/utils/financas/situacao.ts`:
```ts
/**
 * Em que situação uma conta está HOJE, do ponto de vista de quem usa a tela.
 *
 * O banco já tem `derived_status`, mas ele responde outra pergunta: chama de
 * `partial` a conta paga em parte, vencida ou não, e não sabe de entrega. Aqui
 * "vencida" é vencimento passado com saldo em aberto, e a receber de pedido não
 * entregue nunca vence — ainda não é cobrança.
 */
import { diasEntre } from './base.ts';
import type { ContaResumo } from './base.ts';

export type Situacao = 'cancelada' | 'paga' | 'aguardando_entrega' | 'vencida' | 'a_vencer';

export function situacaoDaConta(c: ContaResumo, hoje: string): Situacao {
    if (c.derived_status === 'cancelled') return 'cancelada';
    if (c.derived_status === 'paid' || c.remaining_amount <= 0) return 'paga';
    if (c.type === 'receivable' && c.awaiting_delivery) return 'aguardando_entrega';
    return c.due_date < hoje ? 'vencida' : 'a_vencer';
}

export const diasDeAtraso = (c: ContaResumo, hoje: string): number => Math.max(0, diasEntre(c.due_date, hoje));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/base.test.ts src/utils/financas/situacao.test.ts`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/base.ts src/utils/financas/situacao.ts src/utils/financas/base.test.ts src/utils/financas/situacao.test.ts
git commit -m "feat(financeiro): base de datas e situação de uma conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Os números da Visão geral e a projeção do mês

**Files:**
- Create: `src/utils/financas/numeros.ts`, `src/utils/financas/projecao.ts`
- Test: `src/utils/financas/numeros.test.ts`, `src/utils/financas/projecao.test.ts`

**Interfaces:**
- Consumes: `ContaResumo`, `centavos`, `somarDias`, `ultimoDiaDoMes` (Task 2); `situacaoDaConta` (Task 2).
- Produces:
  - `type Recorte = 'receber_vencido'|'receber_7_dias'|'pagar_vencido'|'pagar_7_dias'`; `RECORTES: Recorte[]`; `ROTULO_DO_RECORTE: Record<Recorte, string>`
  - `contaNoRecorte(c: ContaResumo, r: Recorte, hoje: string): boolean`
  - `interface Soma { total: number; quantidade: number }`
  - `numerosDaVisaoGeral(e: { contas; nosBancos; nasCaixinhas; hoje }): { nosBancos; nasCaixinhas; livre; recortes: Record<Recorte, Soma>; emProducao: Soma }`
  - `interface PontoDaProjecao { data: string; saldo: number }`; `projecaoDoMes(e: { contas; livreHoje; hoje }): { pontos: PontoDaProjecao[]; fechaCom: number; ate: string }`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/numeros.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numerosDaVisaoGeral, contaNoRecorte } from './numeros.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `c${++n}`, type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

const contas = [
    conta({ due_date: '2026-09-24', remaining_amount: 9600 }),                                   // receber vencido
    conta({ due_date: '2026-10-01', remaining_amount: 4200, derived_status: 'partial' }),        // receber vencido (parcial)
    conta({ due_date: '2026-10-08', remaining_amount: 2400 }),                                   // receber 7 dias
    conta({ due_date: '2026-10-12', remaining_amount: 1000 }),                                   // hoje + 6: ainda 7 dias
    conta({ due_date: '2026-10-13', remaining_amount: 500 }),                                    // hoje + 7: fora
    conta({ due_date: '2026-09-01', remaining_amount: 35802.05, awaiting_delivery: true }),      // em produção
    conta({ type: 'payable', due_date: '2026-10-04', remaining_amount: 640 }),                   // pagar vencido
    conta({ type: 'payable', due_date: HOJE, remaining_amount: 2900 }),                          // pagar 7 dias (hoje conta)
    conta({ type: 'payable', due_date: '2026-10-02', remaining_amount: 0, derived_status: 'paid' }),
    conta({ type: 'payable', due_date: '2026-10-02', derived_status: 'cancelled' }),
];

test('os quatro números e o em produção', () => {
    const r = numerosDaVisaoGeral({ contas, nosBancos: 31900, nasCaixinhas: 13480, hoje: HOJE });
    assert.deepEqual(r.recortes.receber_vencido, { total: 13800, quantidade: 2 });
    assert.deepEqual(r.recortes.receber_7_dias, { total: 3400, quantidade: 2 });
    assert.deepEqual(r.recortes.pagar_vencido, { total: 640, quantidade: 1 });
    assert.deepEqual(r.recortes.pagar_7_dias, { total: 2900, quantidade: 1 });
    assert.deepEqual(r.emProducao, { total: 35802.05, quantidade: 1 });
    assert.equal(r.livre, 18420);
});

test('livre pode ser negativo quando as caixinhas passam do saldo', () => {
    const r = numerosDaVisaoGeral({ contas: [], nosBancos: 1000, nasCaixinhas: 1500.5, hoje: HOJE });
    assert.equal(r.livre, -500.5);
});

test('conta aguardando entrega não entra em recorte nenhum', () => {
    const c = conta({ due_date: '2026-09-01', awaiting_delivery: true });
    assert.equal(contaNoRecorte(c, 'receber_vencido', HOJE), false);
    assert.equal(contaNoRecorte(c, 'receber_7_dias', HOJE), false);
});
```

`src/utils/financas/projecao.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projecaoDoMes } from './projecao.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `p${++n}`, type: 'receivable', description: 'conta', due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});

test('vencidas contam hoje, futuras no dia, fora do mês e em produção não contam', () => {
    const p = projecaoDoMes({
        livreHoje: 18420, hoje: HOJE, contas: [
            conta({ due_date: '2026-09-24', remaining_amount: 9600 }),
            conta({ due_date: '2026-10-08', remaining_amount: 2400 }),
            conta({ type: 'payable', due_date: '2026-10-04', remaining_amount: 640 }),
            conta({ type: 'payable', due_date: '2026-10-20', remaining_amount: 3000 }),
            conta({ due_date: '2026-11-02', remaining_amount: 5000 }),
            conta({ due_date: '2026-10-10', remaining_amount: 35802.05, awaiting_delivery: true }),
        ],
    });
    assert.equal(p.ate, '2026-10-31');
    assert.equal(p.pontos.length, 26);
    assert.deepEqual(p.pontos[0], { data: HOJE, saldo: 27380 });
    assert.deepEqual(p.pontos[2], { data: '2026-10-08', saldo: 29780 });
    assert.equal(p.fechaCom, 26780);
});

test('livre negativo projeta sem quebrar', () => {
    const p = projecaoDoMes({ livreHoje: -500, hoje: '2026-10-31', contas: [] });
    assert.deepEqual(p.pontos, [{ data: '2026-10-31', saldo: -500 }]);
    assert.equal(p.fechaCom, -500);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/numeros.test.ts src/utils/financas/projecao.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

`src/utils/financas/numeros.ts`:
```ts
/**
 * Os números do topo da Visão geral.
 *
 * Os quatro recortes são também o filtro da lista (lista.ts usa
 * `contaNoRecorte`). Um lugar só decide o que é "vencido" e "7 dias", então o
 * número e a lista nunca discordam.
 */
import { centavos, somarDias } from './base.ts';
import type { ContaResumo } from './base.ts';
import { situacaoDaConta } from './situacao.ts';

export type Recorte = 'receber_vencido' | 'receber_7_dias' | 'pagar_vencido' | 'pagar_7_dias';

export const RECORTES: Recorte[] = ['receber_vencido', 'receber_7_dias', 'pagar_vencido', 'pagar_7_dias'];

export const ROTULO_DO_RECORTE: Record<Recorte, string> = {
    receber_vencido: 'A receber · vencido',
    receber_7_dias: 'A receber · 7 dias',
    pagar_vencido: 'A pagar · vencido',
    pagar_7_dias: 'A pagar · 7 dias',
};

/** "7 dias" = de hoje até hoje + 6, sem o vencido. */
export function contaNoRecorte(c: ContaResumo, recorte: Recorte, hoje: string): boolean {
    const tipo = recorte.startsWith('receber') ? 'receivable' : 'payable';
    if (c.type !== tipo) return false;
    const s = situacaoDaConta(c, hoje);
    if (recorte.endsWith('vencido')) return s === 'vencida';
    return s === 'a_vencer' && c.due_date <= somarDias(hoje, 6);
}

export interface Soma { total: number; quantidade: number }

export interface NumerosDaVisaoGeral {
    nosBancos: number;
    nasCaixinhas: number;
    livre: number;
    recortes: Record<Recorte, Soma>;
    emProducao: Soma;
}

const somar = (contas: ContaResumo[]): Soma => ({
    total: centavos(contas.reduce((s, c) => s + c.remaining_amount, 0)),
    quantidade: contas.length,
});

export function numerosDaVisaoGeral(e: {
    contas: ContaResumo[]; nosBancos: number; nasCaixinhas: number; hoje: string;
}): NumerosDaVisaoGeral {
    const recortes = Object.fromEntries(
        RECORTES.map(r => [r, somar(e.contas.filter(c => contaNoRecorte(c, r, e.hoje)))]),
    ) as Record<Recorte, Soma>;
    return {
        nosBancos: centavos(e.nosBancos),
        nasCaixinhas: centavos(e.nasCaixinhas),
        livre: centavos(e.nosBancos - e.nasCaixinhas),
        recortes,
        emProducao: somar(e.contas.filter(c => situacaoDaConta(c, e.hoje) === 'aguardando_entrega')),
    };
}
```

`src/utils/financas/projecao.ts`:
```ts
/**
 * "Fecha o mês com": o livre de hoje andando dia a dia até o fim do mês.
 *
 * Só entra conta liberada (aguardando entrega fica fora — decisão do Luiz: o
 * conservador). Conta vencida e não paga entra HOJE: é dinheiro esperado
 * agora, não no dia que já passou.
 */
import { centavos, somarDias, ultimoDiaDoMes } from './base.ts';
import type { ContaResumo } from './base.ts';
import { situacaoDaConta } from './situacao.ts';

export interface PontoDaProjecao { data: string; saldo: number }
export interface Projecao { pontos: PontoDaProjecao[]; fechaCom: number; ate: string }

export function projecaoDoMes(e: { contas: ContaResumo[]; livreHoje: number; hoje: string }): Projecao {
    const ate = ultimoDiaDoMes(e.hoje);
    const porDia = new Map<string, number>();
    for (const c of e.contas) {
        const s = situacaoDaConta(c, e.hoje);
        if (s !== 'vencida' && s !== 'a_vencer') continue;
        if (c.due_date > ate) continue;
        const dia = c.due_date < e.hoje ? e.hoje : c.due_date;
        const sinal = c.type === 'receivable' ? 1 : -1;
        porDia.set(dia, (porDia.get(dia) ?? 0) + sinal * c.remaining_amount);
    }
    const pontos: PontoDaProjecao[] = [];
    let saldo = e.livreHoje;
    for (let dia = e.hoje; dia <= ate; dia = somarDias(dia, 1)) {
        saldo += porDia.get(dia) ?? 0;
        pontos.push({ data: dia, saldo: centavos(saldo) });
    }
    return { pontos, fechaCom: pontos[pontos.length - 1].saldo, ate };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/numeros.test.ts src/utils/financas/projecao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/numeros.ts src/utils/financas/projecao.ts src/utils/financas/numeros.test.ts src/utils/financas/projecao.test.ts
git commit -m "feat(financeiro): números da visão geral e projeção do mês

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Caixa do mês (Resultado)

**Files:**
- Create: `src/utils/financas/caixa.ts`
- Test: `src/utils/financas/caixa.test.ts`

**Interfaces:**
- Consumes: `ContaResumo`, `PagamentoResumo`, `CategoriaResumo`, `centavos` (Task 2); `normalizeCategoryName` de `src/utils/categoryResolver.ts`.
- Produces:
  - `nomeDaCategoria(c: ContaResumo, categorias: Map<string, CategoriaResumo>, padrao?: string): string`
  - `type LinhaDeSaida = 'impostos'|'custo_pecas'|'despesas'|'financeiras'`; `classificarSaida(c, categorias: Map<string, CategoriaResumo>): LinhaDeSaida`
  - `valorDeCaixa(p: PagamentoResumo): number`
  - `interface FatiaDeCategoria { nome: string; valor: number }`
  - `interface CaixaDoMes { entrou; impostos; custoPecas; sobrouDaProducao; percentualDaProducao: number | null; despesas; financeiras; lucro; porCategoria: FatiaDeCategoria[] }`
  - `caixaDoPeriodo(e: { pagamentos; contas; categorias: CategoriaResumo[]; meses: string[] }): CaixaDoMes` — `meses` é `['2026-09']` para um mês ou os três meses de um trimestre
  - `variacao(atual: number, anterior: number): number | null`
  - `interface LinhaDoRelatorio { label; value; level; percent?; is_deduction?; is_total? }`; `linhasDoRelatorio(c: CaixaDoMes): LinhaDoRelatorio[]`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/caixa.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caixaDoPeriodo, classificarSaida, valorDeCaixa, variacao, linhasDoRelatorio } from './caixa.ts';
import type { CategoriaResumo, ContaResumo, PagamentoResumo } from './base.ts';

const categorias: CategoriaResumo[] = [
    { id: 'tec', name: 'Tecido', custo_do_produto: true },
    { id: 'imp', name: 'Impostos' },
    { id: 'alu', name: 'Aluguel' },
    { id: 'tar', name: 'Tarifas bancárias' },
];
const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'payable', description: id, due_date: '2026-09-01',
    original_amount: 100, remaining_amount: 0, derived_status: 'paid', ...c,
});
const contas = [
    conta('R1', { type: 'receivable' }),
    conta('P1', { global_category_id: 'tec' }),
    conta('P2', { global_category_id: 'imp' }),
    conta('P3', { global_category_id: 'alu' }),
    conta('P4', { global_category_id: 'tar' }),
    conta('P5', { category: 'Matéria Prima' }),
];
const pag = (obligation_id: string, amount: number, payment_date: string, extra: Partial<PagamentoResumo> = {}): PagamentoResumo =>
    ({ obligation_id, amount, payment_date, ...extra });

const pagamentos = [
    pag('R1', 1000, '2026-09-05'),
    pag('R1', 500, '2026-09-20', { affects_balance: false }),   // informativo: fora do caixa
    pag('P1', 300, '2026-09-10'),
    pag('P2', 100, '2026-09-11'),
    pag('P3', 200, '2026-09-12'),
    pag('P4', 10, '2026-09-13'),
    pag('P5', 50, '2026-09-14'),
    pag('P3', 80, '2026-08-30'),                                // agosto: não conta
    pag('P3', 80, '2026-09-15', { reversal_of: 'x' }),          // estorno em setembro: volta dinheiro
    pag('R1', 1000, '2026-10-01', { reversal_of: 'y' }),        // outubro: não conta
    pag('SUMIU', 999, '2026-09-01'),                            // conta inexistente: ignora
];

test('caixa de setembro', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-09'] });
    assert.equal(c.entrou, 1000);
    assert.equal(c.impostos, 100);
    assert.equal(c.custoPecas, 350);
    assert.equal(c.sobrouDaProducao, 550);
    assert.equal(c.percentualDaProducao, 55);
    assert.equal(c.despesas, 120);
    assert.equal(c.financeiras, 10);
    assert.equal(c.lucro, 420);
    assert.deepEqual(c.porCategoria, [
        { nome: 'Tecido', valor: 300 },
        { nome: 'Aluguel', valor: 120 },
        { nome: 'Impostos', valor: 100 },
        { nome: 'Matéria Prima', valor: 50 },
        { nome: 'Tarifas bancárias', valor: 10 },
    ]);
});

test('estorno conta no mês do estorno, não no do pagamento', () => {
    const agosto = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-08'] });
    assert.equal(agosto.despesas, 80);
    const outubro = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-10'] });
    assert.equal(outubro.entrou, -1000);
});

test('trimestre soma os três meses, com o estorno de setembro anulando o pagamento de agosto', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-07', '2026-08', '2026-09'] });
    assert.equal(c.entrou, 1000);
    assert.equal(c.despesas, 200);
    assert.equal(c.lucro, 340);
});

test('mês sem entrada não tem percentual', () => {
    const c = caixaDoPeriodo({ pagamentos: [], contas, categorias, meses: ['2026-07'] });
    assert.equal(c.percentualDaProducao, null);
    assert.equal(c.lucro, 0);
});

test('mais de seis categorias viram seis e Outros', () => {
    const muitas = Array.from({ length: 8 }, (_, i) => ({ id: `k${i}`, name: `Cat ${i}` }));
    const cs = muitas.map(k => conta(k.id, { global_category_id: k.id }));
    const ps = muitas.map((k, i) => pag(k.id, 80 - i * 10, '2026-09-02'));
    const c = caixaDoPeriodo({ pagamentos: ps, contas: cs, categorias: muitas, meses: ['2026-09'] });
    assert.equal(c.porCategoria.length, 7);
    assert.deepEqual(c.porCategoria[6], { nome: 'Outros', valor: 30 });
});

test('classificação e valor de caixa', () => {
    const mapa = new Map(categorias.map(k => [k.id, k]));
    assert.equal(classificarSaida(conta('a', { category: 'Juros de cartão' }), mapa), 'financeiras');
    assert.equal(classificarSaida(conta('b', { global_category_id: 'alu' }), mapa), 'despesas');
    assert.equal(valorDeCaixa(pag('a', 10, '2026-09-01', { affects_balance: false })), 0);
    assert.equal(valorDeCaixa(pag('a', 10, '2026-09-01', { reversal_of: 'z' })), -10);
});

test('variação contra o mês anterior', () => {
    assert.equal(variacao(420, 300), 40);
    assert.equal(variacao(-100, -200), 50);
    assert.equal(variacao(10, 0), null);
});

test('linhas do relatório em PDF fecham com o lucro', () => {
    const c = caixaDoPeriodo({ pagamentos, contas, categorias, meses: ['2026-09'] });
    const linhas = linhasDoRelatorio(c);
    assert.equal(linhas[0].value, 1000);
    assert.equal(linhas[linhas.length - 1].value, 420);
    assert.equal(linhas[linhas.length - 1].is_total, true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/caixa.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/utils/financas/caixa.ts`:
```ts
/**
 * Caixa do mês: o dinheiro que de fato entrou e saiu, pela data do pagamento.
 *
 * O mapeamento de categoria para linha é o mesmo do DRE antigo
 * (Dashboard.tsx, `dreData`): impostos pelo nome; custo das peças pela marca
 * `custo_do_produto` ou pelo nome "matéria-prima"; financeiras por "tarifas
 * bancárias", "juros" ou "financeir". O que muda é a data: o DRE antigo somava
 * contas por vencimento; aqui soma pagamentos por `payment_date`.
 *
 * Estorno é uma linha nova com `reversal_of`: conta negativa no mês em que foi
 * feito. Lançamento informativo (`affects_balance = false`) não é caixa.
 */
import { normalizeCategoryName } from '../categoryResolver.ts';
import { centavos } from './base.ts';
import type { CategoriaResumo, ContaResumo, PagamentoResumo } from './base.ts';

export type LinhaDeSaida = 'impostos' | 'custo_pecas' | 'despesas' | 'financeiras';

export function nomeDaCategoria(c: ContaResumo, categorias: Map<string, CategoriaResumo>, padrao = 'Sem categoria'): string {
    const global = c.global_category_id ? categorias.get(c.global_category_id) : undefined;
    return global?.name ?? (c.category?.trim() || padrao);
}

export function classificarSaida(c: ContaResumo, categorias: Map<string, CategoriaResumo>): LinhaDeSaida {
    const nome = normalizeCategoryName(nomeDaCategoria(c, categorias, ''));
    if (nome.includes('impostos')) return 'impostos';
    const global = c.global_category_id ? categorias.get(c.global_category_id) : undefined;
    if (global?.custo_do_produto || nome.includes('materia prima')) return 'custo_pecas';
    if (nome.includes('tarifas bancarias') || nome.includes('juros') || nome.includes('financeir')) return 'financeiras';
    return 'despesas';
}

export function valorDeCaixa(p: PagamentoResumo): number {
    if (p.affects_balance === false) return 0;
    return p.reversal_of ? -p.amount : p.amount;
}

export interface FatiaDeCategoria { nome: string; valor: number }

export interface CaixaDoMes {
    entrou: number;
    impostos: number;
    custoPecas: number;
    sobrouDaProducao: number;
    percentualDaProducao: number | null;
    despesas: number;
    financeiras: number;
    lucro: number;
    porCategoria: FatiaDeCategoria[];
}

const MAX_FATIAS = 6;

export function caixaDoPeriodo(e: {
    pagamentos: PagamentoResumo[]; contas: ContaResumo[]; categorias: CategoriaResumo[]; meses: string[];
}): CaixaDoMes {
    const noPeriodo = new Set(e.meses);
    const contaPorId = new Map(e.contas.map(c => [c.id, c]));
    const categorias = new Map(e.categorias.map(c => [c.id, c]));
    const soma = { entrou: 0, impostos: 0, custo_pecas: 0, despesas: 0, financeiras: 0 };
    const porNome = new Map<string, number>();

    for (const p of e.pagamentos) {
        if (!noPeriodo.has(p.payment_date.slice(0, 7))) continue;
        const conta = contaPorId.get(p.obligation_id);
        if (!conta) continue;
        const valor = valorDeCaixa(p);
        if (valor === 0) continue;
        if (conta.type === 'receivable') { soma.entrou += valor; continue; }
        soma[classificarSaida(conta, categorias)] += valor;
        const nome = nomeDaCategoria(conta, categorias);
        porNome.set(nome, (porNome.get(nome) ?? 0) + valor);
    }

    const entrou = centavos(soma.entrou);
    const sobrou = centavos(soma.entrou - soma.impostos - soma.custo_pecas);
    const fatias = [...porNome]
        .map(([nome, valor]) => ({ nome, valor: centavos(valor) }))
        .filter(f => f.valor > 0)
        .sort((a, b) => b.valor - a.valor);
    const porCategoria = fatias.length > MAX_FATIAS
        ? [...fatias.slice(0, MAX_FATIAS),
            { nome: 'Outros', valor: centavos(fatias.slice(MAX_FATIAS).reduce((s, f) => s + f.valor, 0)) }]
        : fatias;

    return {
        entrou,
        impostos: centavos(soma.impostos),
        custoPecas: centavos(soma.custo_pecas),
        sobrouDaProducao: sobrou,
        percentualDaProducao: entrou > 0 ? centavos((sobrou / entrou) * 100) : null,
        despesas: centavos(soma.despesas),
        financeiras: centavos(soma.financeiras),
        lucro: centavos(sobrou - soma.despesas - soma.financeiras),
        porCategoria,
    };
}

/** Variação percentual sobre o mês anterior; null quando não há base. */
export function variacao(atual: number, anterior: number): number | null {
    if (anterior === 0) return null;
    return centavos(((atual - anterior) / Math.abs(anterior)) * 100);
}

/** Mesmo formato de DRELine, para o `pdfService.generateExecutiveReport` de hoje. */
export interface LinhaDoRelatorio {
    label: string; value: number; level: number; percent?: number; is_deduction?: boolean; is_total?: boolean;
}

export function linhasDoRelatorio(c: CaixaDoMes): LinhaDoRelatorio[] {
    const pct = (v: number) => (c.entrou > 0 ? centavos((v / c.entrou) * 100) : 0);
    return [
        { label: 'ENTROU', value: c.entrou, level: 1, percent: 100 },
        { label: '(-) Impostos', value: c.impostos, level: 2, is_deduction: true, percent: pct(c.impostos) },
        { label: '(-) Custo das peças', value: c.custoPecas, level: 2, is_deduction: true, percent: pct(c.custoPecas) },
        { label: '(=) SOBROU DA PRODUÇÃO', value: c.sobrouDaProducao, level: 1, is_total: true, percent: pct(c.sobrouDaProducao) },
        { label: '(-) Despesas da empresa', value: c.despesas, level: 2, is_deduction: true, percent: pct(c.despesas) },
        { label: '(-) Juros e tarifas', value: c.financeiras, level: 2, is_deduction: true, percent: pct(c.financeiras) },
        { label: '(=) LUCRO DE CAIXA', value: c.lucro, level: 1, is_total: true, percent: pct(c.lucro) },
    ];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/caixa.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/caixa.ts src/utils/financas/caixa.test.ts
git commit -m "feat(financeiro): caixa do mês pela data do pagamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Vendas do mês, caixinhas e banco sugerido

**Files:**
- Create: `src/utils/financas/vendas.ts`, `src/utils/financas/caixinhas.ts`
- Test: `src/utils/financas/vendas.test.ts`, `src/utils/financas/caixinhas.test.ts`

**Interfaces:**
- Consumes: `ContaResumo`, `PagamentoResumo`, `centavos` (Task 2).
- Produces:
  - `interface PedidoResumo { id; status: string; delivered_at?: string | null; total_amount: number; items?: Array<{ quantity?: number | string | null }> | null }`
  - `vendasDoPeriodo(e: { pedidos; contas; meses: string[] }): { pedidos: number; pecas: number; vendido: number; recebidoAntecipado: number }`
  - `interface CaixinhaResumo { id; name; balance: number; target_amount?; auto_fund_pct?; is_archived? }`
  - `interface SugestaoDeCaixinha { caixinhaId: string; nome: string; percentual: number; valor: number }`
  - `sugestoesDeCaixinha(valorRecebido: number, caixinhas: CaixinhaResumo[]): SugestaoDeCaixinha[]`
  - `progressoDaMeta(c: CaixinhaResumo): { percentual: number; meta: number } | null`
  - `bancoSugerido(e: { pagamentos; contas; tipo: 'receivable'|'payable'; bancosAtivos: Array<{ id: string }> }): string | null`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/vendas.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vendasDoPeriodo } from './vendas.ts';
import type { ContaResumo } from './base.ts';

const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: 'x', type: 'receivable', description: 'c', due_date: '2026-09-01',
    original_amount: 800, remaining_amount: 500, derived_status: 'partial', ...c,
});

test('vendas contam pelo mês da entrega; antecipado é o já pago de pedido não entregue', () => {
    const r = vendasDoPeriodo({
        meses: ['2026-09'],
        pedidos: [
            { id: 'o1', status: 'Entregue', delivered_at: '2026-09-10', total_amount: 1000, items: [{ quantity: 10 }, { quantity: '5' }] },
            { id: 'o2', status: 'Entregue', delivered_at: '2026-10-01', total_amount: 500, items: [] },
            { id: 'o3', status: 'Em Produção', delivered_at: null, total_amount: 800 },
        ],
        contas: [
            conta({ awaiting_delivery: true }),
            conta({ id: 'y', awaiting_delivery: true, derived_status: 'cancelled' }),
            conta({ id: 'z', awaiting_delivery: false }),
        ],
    });
    assert.deepEqual(r, { pedidos: 1, pecas: 15, vendido: 1000, recebidoAntecipado: 300 });
});
```

`src/utils/financas/caixinhas.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugestoesDeCaixinha, progressoDaMeta, bancoSugerido } from './caixinhas.ts';
import type { ContaResumo } from './base.ts';

test('sugere o percentual de cada caixinha com regra, arredondado no centavo', () => {
    const caixinhas = [
        { id: 'i', name: 'Impostos', balance: 0, auto_fund_pct: 15 },
        { id: 'm', name: 'Máquina', balance: 0, auto_fund_pct: 0 },
        { id: 'a', name: 'Arquivada', balance: 0, auto_fund_pct: 10, is_archived: true },
        { id: 't', name: '13º', balance: 0, auto_fund_pct: 2.5 },
    ];
    assert.deepEqual(sugestoesDeCaixinha(1000, caixinhas), [
        { caixinhaId: 'i', nome: 'Impostos', percentual: 15, valor: 150 },
        { caixinhaId: 't', nome: '13º', percentual: 2.5, valor: 25 },
    ]);
    assert.equal(sugestoesDeCaixinha(333.33, caixinhas)[0].valor, 50);
    assert.deepEqual(sugestoesDeCaixinha(0, caixinhas), []);
});

test('progresso da meta', () => {
    assert.deepEqual(progressoDaMeta({ id: 'a', name: 'a', balance: 4800, target_amount: 12000 }), { percentual: 40, meta: 12000 });
    assert.deepEqual(progressoDaMeta({ id: 'a', name: 'a', balance: 15000, target_amount: 12000 }), { percentual: 100, meta: 12000 });
    assert.equal(progressoDaMeta({ id: 'a', name: 'a', balance: 10, target_amount: 0 }), null);
});

test('banco sugerido é o do último pagamento do mesmo tipo, ignorando estorno e banco inativo', () => {
    const contas: ContaResumo[] = [
        { id: 'r1', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'p1', type: 'payable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'r2', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
        { id: 'r3', type: 'receivable', description: '', due_date: '', original_amount: 1, remaining_amount: 0, derived_status: 'paid' },
    ];
    const pagamentos = [
        { obligation_id: 'r1', amount: 1, payment_date: '2026-09-10', account_id: 'itau' },
        { obligation_id: 'p1', amount: 1, payment_date: '2026-09-20', account_id: 'nu' },
        { obligation_id: 'r2', amount: 1, payment_date: '2026-09-25', account_id: 'nu', reversal_of: 'z' },
        { obligation_id: 'r3', amount: 1, payment_date: '2026-09-28', account_id: 'velho' },
    ];
    const bancosAtivos = [{ id: 'itau' }, { id: 'nu' }];
    assert.equal(bancoSugerido({ pagamentos, contas, tipo: 'receivable', bancosAtivos }), 'itau');
    assert.equal(bancoSugerido({ pagamentos, contas, tipo: 'payable', bancosAtivos }), 'nu');
    assert.equal(bancoSugerido({ pagamentos: [], contas, tipo: 'payable', bancosAtivos }), 'itau');
    assert.equal(bancoSugerido({ pagamentos: [], contas, tipo: 'payable', bancosAtivos: [] }), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/vendas.test.ts src/utils/financas/caixinhas.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

`src/utils/financas/vendas.ts`:
```ts
/**
 * Vendas do mês: o que foi ENTREGUE no mês, pela data da entrega.
 * "Recebido antecipado" é a foto de hoje: o que já entrou de pedidos que ainda
 * não saíram da fábrica (entrada, sinal). Não é lucro de ninguém ainda.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';

export interface PedidoResumo {
    id: string;
    status: string;
    delivered_at?: string | null;
    total_amount: number;
    items?: Array<{ quantity?: number | string | null }> | null;
}

export interface VendasDoMes { pedidos: number; pecas: number; vendido: number; recebidoAntecipado: number }

export function vendasDoPeriodo(e: { pedidos: PedidoResumo[]; contas: ContaResumo[]; meses: string[] }): VendasDoMes {
    const entregues = e.pedidos.filter(p => p.status === 'Entregue' && e.meses.includes((p.delivered_at ?? '').slice(0, 7)));
    const pecas = entregues.reduce(
        (s, p) => s + (p.items ?? []).reduce((t, i) => t + (Number(i.quantity) || 0), 0), 0);
    const antecipado = e.contas
        .filter(c => c.type === 'receivable' && c.awaiting_delivery && c.derived_status !== 'cancelled')
        .reduce((s, c) => s + (c.original_amount - c.remaining_amount), 0);
    return {
        pedidos: entregues.length,
        pecas,
        vendido: centavos(entregues.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)),
        recebidoAntecipado: centavos(antecipado),
    };
}
```

`src/utils/financas/caixinhas.ts`:
```ts
/**
 * Caixinhas: a sugestão que aparece no "Recebi", o progresso da meta e o
 * banco que a baixa propõe.
 */
import { centavos } from './base.ts';
import type { ContaResumo, PagamentoResumo } from './base.ts';

export interface CaixinhaResumo {
    id: string;
    name: string;
    balance: number;
    target_amount?: number | null;
    auto_fund_pct?: number | null;
    is_archived?: boolean | null;
}

export interface SugestaoDeCaixinha { caixinhaId: string; nome: string; percentual: number; valor: number }

export function sugestoesDeCaixinha(valorRecebido: number, caixinhas: CaixinhaResumo[]): SugestaoDeCaixinha[] {
    if (!(valorRecebido > 0)) return [];
    return caixinhas
        .filter(c => !c.is_archived && (Number(c.auto_fund_pct) || 0) > 0)
        .map(c => {
            const percentual = Number(c.auto_fund_pct);
            return { caixinhaId: c.id, nome: c.name, percentual, valor: centavos((valorRecebido * percentual) / 100) };
        })
        .filter(s => s.valor > 0);
}

export function progressoDaMeta(c: CaixinhaResumo): { percentual: number; meta: number } | null {
    const meta = Number(c.target_amount) || 0;
    if (meta <= 0) return null;
    return { meta, percentual: Math.min(100, Math.round((c.balance / meta) * 100)) };
}

/** O banco do pagamento mais recente do mesmo tipo; sem histórico, o primeiro ativo. */
export function bancoSugerido(e: {
    pagamentos: PagamentoResumo[]; contas: ContaResumo[]; tipo: 'receivable' | 'payable'; bancosAtivos: Array<{ id: string }>;
}): string | null {
    const ativos = new Set(e.bancosAtivos.map(b => b.id));
    const tipoDaConta = new Map(e.contas.map(c => [c.id, c.type]));
    const recentes = [...e.pagamentos].sort((a, b) =>
        b.payment_date.localeCompare(a.payment_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    for (const p of recentes) {
        if (p.reversal_of || !p.account_id || !ativos.has(p.account_id)) continue;
        if (tipoDaConta.get(p.obligation_id) === e.tipo) return p.account_id;
    }
    return e.bancosAtivos[0]?.id ?? null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/vendas.test.ts src/utils/financas/caixinhas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/vendas.ts src/utils/financas/caixinhas.ts src/utils/financas/vendas.test.ts src/utils/financas/caixinhas.test.ts
git commit -m "feat(financeiro): vendas pelo mês da entrega, sugestão de caixinha e banco sugerido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: As parcelas da entrega

**Files:**
- Create: `src/utils/financas/entrega.ts`
- Test: `src/utils/financas/entrega.test.ts`

**Interfaces:**
- Consumes: `ContaResumo`, `centavos`, `reais` (Task 2).
- Produces:
  - `interface ParcelaEditavel { label: string; amount: number; due: string; method: string }`
  - `separarParcelas<T extends ContaResumo>(contas: T[]): { fixas: T[]; abertas: T[] }`
  - `planoInicial(e: { abertas: ContaResumo[]; fixas: ContaResumo[]; totalDoPedido: number; prazo: string }): ParcelaEditavel[]`
  - `interface ConferenciaDaEntrega { soma: number; diferenca: number; confere: boolean; problema: string | null }`
  - `conferirEntrega(e: { totalDoPedido: number; fixas: ContaResumo[]; editaveis: ParcelaEditavel[] }): ConferenciaDaEntrega`
  - `planoMudou(abertas: ContaResumo[], editaveis: ParcelaEditavel[]): boolean`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/entrega.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separarParcelas, planoInicial, conferirEntrega, planoMudou } from './entrega.ts';
import type { ContaResumo } from './base.ts';

const parcela = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'receivable', description: id, due_date: '2026-11-06',
    original_amount: 4200, remaining_amount: 4200, derived_status: 'open', payment_count: 0, ...c,
});

const entrada = parcela('e1', { due_date: '2026-09-01', remaining_amount: 0, derived_status: 'paid', payment_count: 1, installment_no: 1 });
const segunda = parcela('e2', { installment_no: 2, planned_method: 'PIX' });
const cancelada = parcela('e3', { derived_status: 'cancelled' });

test('pagas (inteira ou parcial) ficam fixas; canceladas somem', () => {
    const s = separarParcelas([segunda, cancelada, entrada]);
    assert.deepEqual(s.fixas.map(c => c.id), ['e1']);
    assert.deepEqual(s.abertas.map(c => c.id), ['e2']);
});

test('plano inicial vem das parcelas abertas e confere com o total', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8400, prazo: '2026-10-20' });
    assert.deepEqual(plano, [{ label: 'Parcela 2', amount: 4200, due: '2026-11-06', method: 'PIX' }]);
    assert.deepEqual(conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: plano }),
        { soma: 8400, diferenca: 0, confere: true, problema: null });
});

test('total do pedido subiu: acusa quanto falta', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8700, prazo: '2026-10-20' });
    const c = conferirEntrega({ totalDoPedido: 8700, fixas: [entrada], editaveis: plano });
    assert.equal(c.confere, false);
    assert.equal(c.diferenca, 300);
    assert.equal(c.problema, 'Faltam R$ 300,00');
});

test('parcela sem valor ou sem data trava antes da soma', () => {
    const c = conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: [{ label: 'P', amount: 0, due: '2026-11-06', method: 'PIX' }] });
    assert.equal(c.problema, 'Parcela 1 sem valor');
    const d = conferirEntrega({ totalDoPedido: 8400, fixas: [entrada], editaveis: [{ label: 'P', amount: 4200, due: '', method: 'PIX' }] });
    assert.equal(d.problema, 'Parcela 1 sem vencimento');
});

test('pedido sem conta nenhuma: parcela única com o total e o prazo', () => {
    assert.deepEqual(planoInicial({ abertas: [], fixas: [], totalDoPedido: 1500, prazo: '2026-10-20' }),
        [{ label: 'Parcela única', amount: 1500, due: '2026-10-20', method: 'PIX' }]);
});

test('pedido todo pago antes da entrega: nada a editar e confere', () => {
    const paga = parcela('p', { original_amount: 1500, remaining_amount: 0, derived_status: 'paid', payment_count: 1 });
    const plano = planoInicial({ abertas: [], fixas: [paga], totalDoPedido: 1500, prazo: '2026-10-20' });
    assert.deepEqual(plano, []);
    assert.equal(conferirEntrega({ totalDoPedido: 1500, fixas: [paga], editaveis: plano }).confere, true);
});

test('planoMudou só quando valor, vencimento, meio ou quantidade mudam', () => {
    const plano = planoInicial({ abertas: [segunda], fixas: [entrada], totalDoPedido: 8400, prazo: '' });
    assert.equal(planoMudou([segunda], plano), false);
    assert.equal(planoMudou([segunda], [{ ...plano[0], due: '2026-11-10' }]), true);
    assert.equal(planoMudou([segunda], [{ ...plano[0], method: 'Boleto' }]), true);
    assert.equal(planoMudou([segunda], [...plano, plano[0]]), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/entrega.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

`src/utils/financas/entrega.ts`:
```ts
/**
 * As parcelas na hora de confirmar a entrega.
 *
 * `revise_order_plan` cancela e recria só as parcelas SEM pagamento ativo; a que
 * tem qualquer pagamento é preservada com o valor original. Por isso essas são
 * "fixas" aqui, e a soma que tem de fechar com o pedido é
 * Σ original das fixas + Σ editáveis = total do pedido.
 */
import { centavos, reais } from './base.ts';
import type { ContaResumo } from './base.ts';

export interface ParcelaEditavel { label: string; amount: number; due: string; method: string }

export function separarParcelas<T extends ContaResumo>(contas: T[]): { fixas: T[]; abertas: T[] } {
    const ativas = contas
        .filter(c => c.type === 'receivable' && c.derived_status !== 'cancelled')
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
    const temPagamento = (c: T) => (c.payment_count ?? 0) > 0;
    return { fixas: ativas.filter(temPagamento), abertas: ativas.filter(c => !temPagamento(c)) };
}

const somaOriginal = (contas: ContaResumo[]) => contas.reduce((s, c) => s + c.original_amount, 0);

export function planoInicial(e: {
    abertas: ContaResumo[]; fixas: ContaResumo[]; totalDoPedido: number; prazo: string;
}): ParcelaEditavel[] {
    if (e.abertas.length > 0) {
        return e.abertas.map((c, i) => ({
            label: `Parcela ${c.installment_no ?? i + 1}`,
            amount: centavos(c.original_amount),
            due: c.due_date,
            method: c.planned_method || 'PIX',
        }));
    }
    const falta = centavos(e.totalDoPedido - somaOriginal(e.fixas));
    return falta >= 0.01 ? [{ label: 'Parcela única', amount: falta, due: e.prazo, method: 'PIX' }] : [];
}

export interface ConferenciaDaEntrega { soma: number; diferenca: number; confere: boolean; problema: string | null }

export function conferirEntrega(e: {
    totalDoPedido: number; fixas: ContaResumo[]; editaveis: ParcelaEditavel[];
}): ConferenciaDaEntrega {
    const soma = centavos(somaOriginal(e.fixas) + e.editaveis.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    const diferenca = centavos(e.totalDoPedido - soma);
    const semValor = e.editaveis.findIndex(p => !(Number(p.amount) > 0));
    const semData = e.editaveis.findIndex(p => !p.due);
    let problema: string | null = null;
    if (semValor >= 0) problema = `Parcela ${semValor + 1} sem valor`;
    else if (semData >= 0) problema = `Parcela ${semData + 1} sem vencimento`;
    else if (Math.abs(diferenca) >= 0.01) problema = diferenca > 0 ? `Faltam ${reais(diferenca)}` : `Sobram ${reais(-diferenca)}`;
    return { soma, diferenca, confere: problema === null, problema };
}

export function planoMudou(abertas: ContaResumo[], editaveis: ParcelaEditavel[]): boolean {
    if (abertas.length !== editaveis.length) return true;
    return abertas.some((c, i) => {
        const p = editaveis[i];
        return centavos(c.original_amount) !== centavos(p.amount)
            || c.due_date !== p.due
            || (c.planned_method || 'PIX') !== p.method;
    });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/entrega.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/entrega.ts src/utils/financas/entrega.test.ts
git commit -m "feat(financeiro): conferência das parcelas na entrega

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Clientes que devem, situação dos bancos e a lista de contas

**Files:**
- Create: `src/utils/financas/clientes.ts`, `src/utils/financas/bancos.ts`, `src/utils/financas/lista.ts`
- Test: `src/utils/financas/clientes.test.ts`, `src/utils/financas/bancos.test.ts`, `src/utils/financas/lista.test.ts`

**Interfaces:**
- Consumes: Task 2 (`ContaResumo`, datas, `situacaoDaConta`, `diasDeAtraso`), Task 3 (`Recorte`, `contaNoRecorte`), `normalizeCategoryName`.
- Produces:
  - `interface LinhaDoCliente { clienteId; vencido; aVencer; emProducao; diasDoMaisAntigo: number | null; vencidas: ContaResumo[] }`; `clientesQueDevem<T extends ContaResumo>(contas: T[], hoje): LinhaDoCliente[]`
  - `interface BancoResumo { id; name; current_balance: number; is_active: boolean }`; `interface SituacaoDoBanco { id; nome; saldo; aConferir: string[] }`; `situacaoDosBancos(e: { bancos; contas; contasPorObrigacao: Record<string, string[]> }): SituacaoDoBanco[]`
  - `type FiltroRapido = 'todas'|'hoje'|'semana'|'vencidas'|'abertas'|'pagas'|'nao_conferidas'|'canceladas'`; `FILTROS_RAPIDOS: FiltroRapido[]`; `ROTULO_DO_FILTRO: Record<FiltroRapido, string>`
  - `interface FiltrosDaLista { recorte: Recorte | null; rapido: FiltroRapido; tipo: 'ambos'|'receivable'|'payable'; mes: string | null; busca: string; clienteId: string | null; categoriaId: string | null; bancoId: string | null }`; `FILTROS_VAZIOS: FiltrosDaLista`
  - `interface ContextoDaLista { hoje; contasPorObrigacao; nomeDaParte(c): string; nomeDaCategoria(c): string }`
  - `filtrarContas<T extends ContaResumo>(contas: T[], f: FiltrosDaLista, ctx: ContextoDaLista): T[]`
  - `interface GrupoDaLista<T> { titulo: string; contas: T[] }`; `agruparParaLista<T extends ContaResumo>(contas: T[], hoje: string, porAtraso: boolean): GrupoDaLista<T>[]`; `tituloDoDia(dia, hoje): string`

- [ ] **Step 1: Escrever os testes**

`src/utils/financas/clientes.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientesQueDevem } from './clientes.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
let n = 0;
const conta = (c: Partial<ContaResumo>): ContaResumo => ({
    id: `k${++n}`, type: 'receivable', description: 'c', due_date: HOJE,
    original_amount: 1, remaining_amount: 1, derived_status: 'open', ...c,
});

test('agrupa por cliente, separa em produção e ordena pelo atraso mais antigo', () => {
    const linhas = clientesQueDevem([
        conta({ client_id: 'c1', due_date: '2026-09-24', remaining_amount: 9600 }),
        conta({ client_id: 'c1', due_date: '2026-10-20', remaining_amount: 4800 }),
        conta({ client_id: 'c2', due_date: '2026-10-01', remaining_amount: 4200 }),
        conta({ client_id: 'c2', remaining_amount: 6200, awaiting_delivery: true }),
        conta({ client_id: 'c3', remaining_amount: 12400, awaiting_delivery: true }),
        conta({ client_id: 'c3', due_date: '2026-11-01', remaining_amount: 7500 }),
        conta({ client_id: null, due_date: '2026-09-01', remaining_amount: 100 }),
        conta({ client_id: 'c5', remaining_amount: 0, derived_status: 'paid' }),
        conta({ client_id: 'c6', type: 'payable', due_date: '2026-09-01' }),
    ], HOJE);
    assert.deepEqual(linhas.map(l => [l.clienteId, l.vencido, l.aVencer, l.emProducao, l.diasDoMaisAntigo]), [
        ['c1', 9600, 4800, 0, 12],
        ['c2', 4200, 0, 6200, 5],
        ['c3', 0, 7500, 12400, null],
    ]);
    assert.equal(linhas[0].vencidas.length, 1);
});
```

`src/utils/financas/bancos.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { situacaoDosBancos } from './bancos.ts';
import type { ContaResumo } from './base.ts';

const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'payable', description: id, due_date: '2026-10-01',
    original_amount: 1, remaining_amount: 0, derived_status: 'paid', ...c,
});

test('cada banco ativo lista as contas com pagamento nele ainda não conferidas', () => {
    const r = situacaoDosBancos({
        bancos: [
            { id: 'itau', name: 'Itaú PJ', current_balance: 24300, is_active: true },
            { id: 'nu', name: 'Nubank PJ', current_balance: 6100, is_active: true },
            { id: 'velho', name: 'Velho', current_balance: 0, is_active: false },
        ],
        contas: [
            conta('k1', { is_reconciled: false }),
            conta('k2', { derived_status: 'partial', remaining_amount: 5, is_reconciled: true }),
            conta('k3', { derived_status: 'open', remaining_amount: 1 }),
            conta('k4', { is_reconciled: false }),
        ],
        contasPorObrigacao: { k1: ['nu'], k2: ['nu'], k4: ['itau', 'nu'] },
    });
    assert.deepEqual(r, [
        { id: 'itau', nome: 'Itaú PJ', saldo: 24300, aConferir: ['k4'] },
        { id: 'nu', nome: 'Nubank PJ', saldo: 6100, aConferir: ['k1', 'k4'] },
    ]);
});
```

`src/utils/financas/lista.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarContas, agruparParaLista, tituloDoDia, FILTROS_VAZIOS } from './lista.ts';
import type { ContextoDaLista } from './lista.ts';
import type { ContaResumo } from './base.ts';

const HOJE = '2026-10-06';
const conta = (id: string, c: Partial<ContaResumo>): ContaResumo => ({
    id, type: 'receivable', description: id, due_date: HOJE,
    original_amount: 100, remaining_amount: 100, derived_status: 'open', ...c,
});
const contas = [
    conta('venc', { due_date: '2026-09-24', client_id: 'sc' }),
    conta('ontem', { due_date: '2026-10-05', client_id: 'cv' }),
    conta('prod', { due_date: '2026-09-01', awaiting_delivery: true, client_id: 'sc' }),
    conta('hoje', { type: 'payable', supplier_id: 'fio', global_category_id: 'tec' }),
    conta('paga', { derived_status: 'paid', remaining_amount: 0, is_reconciled: false }),
    conta('cancel', { derived_status: 'cancelled' }),
];
const ctx: ContextoDaLista = {
    hoje: HOJE,
    contasPorObrigacao: { paga: ['itau'] },
    nomeDaParte: c => ({ sc: 'Escola Santa Clara', cv: 'Clínica Vida', fio: 'Malharia Fio Bom' } as Record<string, string>)[c.client_id ?? c.supplier_id ?? ''] ?? '',
    nomeDaCategoria: c => (c.global_category_id === 'tec' ? 'Tecido' : 'Sem categoria'),
};
const ids = (cs: ContaResumo[]) => cs.map(c => c.id);

test('padrão: abertas, sem as que aguardam entrega, por vencimento', () => {
    assert.deepEqual(ids(filtrarContas(contas, FILTROS_VAZIOS, ctx)), ['venc', 'ontem', 'hoje']);
});

test('recorte manda sobre o filtro rápido', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, recorte: 'receber_vencido', rapido: 'pagas' }, ctx)), ['venc', 'ontem']);
});

test('busca sem acento acha pelo cliente e mostra a que aguarda entrega', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, busca: 'santa clara' }, ctx)), ['prod', 'venc']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, busca: 'clinica' }, ctx)), ['ontem']);
});

test('filtro por cliente também mostra a que aguarda entrega', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, clienteId: 'sc' }, ctx)), ['prod', 'venc']);
});

test('pagas, não conferidas, canceladas, banco, categoria e tipo', () => {
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'pagas' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'nao_conferidas' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'canceladas' }, ctx)), ['cancel']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'todas', bancoId: 'itau' }, ctx)), ['paga']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, categoriaId: 'tec' }, ctx)), ['hoje']);
    assert.deepEqual(ids(filtrarContas(contas, { ...FILTROS_VAZIOS, tipo: 'payable' }, ctx)), ['hoje']);
});

test('grupos por atraso e por dia', () => {
    const vencidas = filtrarContas(contas, { ...FILTROS_VAZIOS, rapido: 'vencidas' }, ctx);
    assert.deepEqual(agruparParaLista(vencidas, HOJE, true).map(g => g.titulo), ['venceu há 12 dias', 'venceu ontem']);
    assert.equal(tituloDoDia(HOJE, HOJE), 'Hoje · ter 06/10');
    assert.equal(tituloDoDia('2026-10-07', HOJE), 'Amanhã · qua 07/10');
    assert.equal(tituloDoDia('2026-10-08', HOJE), 'qui 08/10');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/financas/clientes.test.ts src/utils/financas/bancos.test.ts src/utils/financas/lista.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

`src/utils/financas/clientes.ts`:
```ts
/**
 * "Clientes que devem": um cliente por linha. "Em produção" é informativo —
 * parcela de pedido não entregue não é atraso nem cobrança.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';
import { diasDeAtraso, situacaoDaConta } from './situacao.ts';

export interface LinhaDoCliente {
    clienteId: string;
    vencido: number;
    aVencer: number;
    emProducao: number;
    diasDoMaisAntigo: number | null;
    vencidas: ContaResumo[];
}

export function clientesQueDevem<T extends ContaResumo>(contas: T[], hoje: string): LinhaDoCliente[] {
    const porCliente = new Map<string, LinhaDoCliente>();
    for (const c of contas) {
        if (c.type !== 'receivable' || !c.client_id) continue;
        const s = situacaoDaConta(c, hoje);
        if (s === 'paga' || s === 'cancelada') continue;
        const l = porCliente.get(c.client_id)
            ?? { clienteId: c.client_id, vencido: 0, aVencer: 0, emProducao: 0, diasDoMaisAntigo: null, vencidas: [] };
        if (s === 'vencida') {
            l.vencido += c.remaining_amount;
            l.vencidas.push(c);
            l.diasDoMaisAntigo = Math.max(l.diasDoMaisAntigo ?? 0, diasDeAtraso(c, hoje));
        } else if (s === 'a_vencer') {
            l.aVencer += c.remaining_amount;
        } else {
            l.emProducao += c.remaining_amount;
        }
        porCliente.set(c.client_id, l);
    }
    return [...porCliente.values()]
        .map(l => ({ ...l, vencido: centavos(l.vencido), aVencer: centavos(l.aVencer), emProducao: centavos(l.emProducao) }))
        .sort((a, b) => (b.diasDoMaisAntigo ?? -1) - (a.diasDoMaisAntigo ?? -1) || b.aVencer - a.aVencer);
}
```

`src/utils/financas/bancos.ts`:
```ts
/**
 * Situação de cada banco ativo: saldo do sistema e as contas com pagamento
 * naquele banco que ainda não foram conferidas com o extrato. A conferência é
 * por CONTA (financial_obligations.is_reconciled), não por pagamento.
 */
import type { ContaResumo } from './base.ts';

export interface BancoResumo { id: string; name: string; current_balance: number; is_active: boolean }
export interface SituacaoDoBanco { id: string; nome: string; saldo: number; aConferir: string[] }

export function situacaoDosBancos(e: {
    bancos: BancoResumo[]; contas: ContaResumo[]; contasPorObrigacao: Record<string, string[]>;
}): SituacaoDoBanco[] {
    const pendentes = e.contas.filter(c =>
        (c.derived_status === 'paid' || c.derived_status === 'partial') && !c.is_reconciled);
    return e.bancos.filter(b => b.is_active).map(b => ({
        id: b.id,
        nome: b.name,
        saldo: Number(b.current_balance) || 0,
        aConferir: pendentes.filter(c => (e.contasPorObrigacao[c.id] ?? []).includes(b.id)).map(c => c.id),
    }));
}
```

`src/utils/financas/lista.ts`:
```ts
/**
 * A lista de contas da Visão geral: filtro e agrupamento.
 *
 * Parcela aguardando entrega só aparece quando se procura por ela (busca ou
 * filtro de cliente): ela ainda pode receber baixa (entrada, sinal), mas não é
 * assunto da lista do dia.
 */
import { normalizeCategoryName } from '../categoryResolver.ts';
import { diaDaSemana, diaEMes, diasEntre, somarDias } from './base.ts';
import type { ContaResumo } from './base.ts';
import { contaNoRecorte } from './numeros.ts';
import type { Recorte } from './numeros.ts';
import { situacaoDaConta } from './situacao.ts';

export type FiltroRapido = 'todas' | 'hoje' | 'semana' | 'vencidas' | 'abertas' | 'pagas' | 'nao_conferidas' | 'canceladas';

export const FILTROS_RAPIDOS: FiltroRapido[] = ['abertas', 'hoje', 'semana', 'vencidas', 'pagas', 'nao_conferidas', 'canceladas', 'todas'];

export const ROTULO_DO_FILTRO: Record<FiltroRapido, string> = {
    todas: 'Todas', hoje: 'Hoje', semana: 'Semana', vencidas: 'Vencidas', abertas: 'Abertas',
    pagas: 'Pagas', nao_conferidas: 'Não conferidas', canceladas: 'Canceladas',
};

export interface FiltrosDaLista {
    recorte: Recorte | null;
    rapido: FiltroRapido;
    tipo: 'ambos' | 'receivable' | 'payable';
    mes: string | null;
    busca: string;
    clienteId: string | null;
    categoriaId: string | null;
    bancoId: string | null;
}

export const FILTROS_VAZIOS: FiltrosDaLista = {
    recorte: null, rapido: 'abertas', tipo: 'ambos', mes: null, busca: '',
    clienteId: null, categoriaId: null, bancoId: null,
};

export interface ContextoDaLista {
    hoje: string;
    contasPorObrigacao: Record<string, string[]>;
    nomeDaParte: (c: ContaResumo) => string;
    nomeDaCategoria: (c: ContaResumo) => string;
}

function passaNoRapido(c: ContaResumo, f: FiltroRapido, hoje: string): boolean {
    const s = situacaoDaConta(c, hoje);
    if (f === 'canceladas') return s === 'cancelada';
    if (s === 'cancelada') return false;
    switch (f) {
        case 'hoje': return c.due_date === hoje && s !== 'paga';
        case 'semana': return s === 'a_vencer' && c.due_date <= somarDias(hoje, 6);
        case 'vencidas': return s === 'vencida';
        case 'abertas': return s === 'vencida' || s === 'a_vencer' || s === 'aguardando_entrega';
        case 'pagas': return s === 'paga';
        case 'nao_conferidas': return (c.derived_status === 'paid' || c.derived_status === 'partial') && !c.is_reconciled;
        default: return true;
    }
}

export function filtrarContas<T extends ContaResumo>(contas: T[], f: FiltrosDaLista, ctx: ContextoDaLista): T[] {
    const busca = normalizeCategoryName(f.busca);
    const mostrarAguardando = busca !== '' || f.clienteId !== null;
    const saida = contas.filter(c => {
        if (!mostrarAguardando && situacaoDaConta(c, ctx.hoje) === 'aguardando_entrega') return false;
        if (f.recorte ? !contaNoRecorte(c, f.recorte, ctx.hoje) : !passaNoRapido(c, f.rapido, ctx.hoje)) return false;
        if (f.tipo !== 'ambos' && c.type !== f.tipo) return false;
        if (f.mes && !c.due_date.startsWith(f.mes)) return false;
        if (f.clienteId && c.client_id !== f.clienteId) return false;
        if (f.categoriaId && c.global_category_id !== f.categoriaId) return false;
        if (f.bancoId && !(ctx.contasPorObrigacao[c.id] ?? []).includes(f.bancoId)) return false;
        if (busca) {
            const alvo = normalizeCategoryName(`${c.description} ${ctx.nomeDaParte(c)} ${ctx.nomeDaCategoria(c)}`);
            if (!alvo.includes(busca)) return false;
        }
        return true;
    });
    const maisRecentesPrimeiro = !f.recorte && f.rapido === 'pagas';
    return saida.sort((a, b) =>
        (maisRecentesPrimeiro ? b.due_date.localeCompare(a.due_date) : a.due_date.localeCompare(b.due_date))
        || b.remaining_amount - a.remaining_amount);
}

export interface GrupoDaLista<T extends ContaResumo = ContaResumo> { titulo: string; contas: T[] }

export function tituloDoDia(dia: string, hoje: string): string {
    const base = `${diaDaSemana(dia)} ${diaEMes(dia)}`;
    if (dia === hoje) return `Hoje · ${base}`;
    if (dia === somarDias(hoje, 1)) return `Amanhã · ${base}`;
    return base;
}

const tituloDoAtraso = (dias: number): string => (dias === 1 ? 'venceu ontem' : `venceu há ${dias} dias`);

/** Agrupa contas JÁ ordenadas; grupos vizinhos com o mesmo título se juntam. */
export function agruparParaLista<T extends ContaResumo>(contas: T[], hoje: string, porAtraso: boolean): GrupoDaLista<T>[] {
    const grupos: GrupoDaLista<T>[] = [];
    for (const c of contas) {
        const titulo = porAtraso && c.due_date < hoje ? tituloDoAtraso(diasEntre(c.due_date, hoje)) : tituloDoDia(c.due_date, hoje);
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.titulo === titulo) ultimo.contas.push(c);
        else grupos.push({ titulo, contas: [c] });
    }
    return grupos;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/financas/clientes.test.ts src/utils/financas/bancos.test.ts src/utils/financas/lista.test.ts`
Expected: PASS. Depois a suíte inteira: `node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4` → `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/clientes.ts src/utils/financas/bancos.ts src/utils/financas/lista.ts src/utils/financas/clientes.test.ts src/utils/financas/bancos.test.ts src/utils/financas/lista.test.ts
git commit -m "feat(financeiro): clientes que devem, situação dos bancos e lista de contas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Janela Confirmar entrega no kanban

**Files:**
- Create: `src/hooks/financas/useMostrarValor.ts`
- Create: `src/components/financas/JanelaConfirmarEntrega.tsx`
- Modify: `src/repositories/productionRepository.ts` (novo `lerPedidoParaEntrega`; `saveOrderStage` grava `delivered_at`; `ensureReceivableForDeliveredOrder` relê o total)
- Modify: `src/repositories/financeRepository.ts` (`reviseOrderPlan`: `method?: string` no tipo do plano)
- Modify: `src/components/pcp/KanbanPanel.tsx` (troca o `ConfirmDialog` da entrega)
- Modify: `src/pages/PCP.tsx` (repassa `factoryMode`)

**Interfaces:**
- Consumes: Task 6 (`separarParcelas`, `planoInicial`, `conferirEntrega`, `planoMudou`, `ParcelaEditavel`); `usePcpKanban()` → `deliveryConfirm`, `confirmDelivery`, `cancelDelivery`, `busy`.
- Produces: `useMostrarValor(): { mostrar: (n: number) => string; oculto: boolean }`; `<JanelaConfirmarEntrega pedidoId numero cliente? semFinanceiro ocupado onCancelar onConfirmar />`; `productionRepository.lerPedidoParaEntrega(id): Promise<{ total_amount: number; deadline: string | null; client_id: string | null; order_number: string }>`.

- [ ] **Step 1: O hook de valor com privacidade**

`src/hooks/financas/useMostrarValor.ts`:
```ts
import { useCallback } from 'react';
import { usePrivacidade } from '@/hooks/usePrivacidade';
import { MASCARA } from '@/utils/privacidade';
import { formatCurrency } from '@/utils';

/** Todo valor em reais das telas do financeiro passa por aqui: respeita o modo privacidade. */
export function useMostrarValor() {
    const { oculto } = usePrivacidade();
    const mostrar = useCallback((n: number) => (oculto ? MASCARA : formatCurrency(n)), [oculto]);
    return { mostrar, oculto };
}
```

- [ ] **Step 2: Repositórios**

Em `src/repositories/productionRepository.ts`:

1. Acrescente o import, abaixo de `import { getNow } from '@/utils';`:
   ```ts
   import { getTodayStr } from '@/utils/date';
   ```
2. Dentro de `saveOrderStage`, troque o objeto do `.update({...})` por:
   ```ts
        const entregue = order.status === OrderStatus.DELIVERED;
        const { error } = await supabase.from('orders').update({
            production_stage: order.production_stage,
            status: order.status,
            items: order.items,
            user_id: user.id,
            updated_at: getNow().toISOString(),
            // A data da entrega mora no pedido: é por ela que "vendas do mês" conta.
            ...(entregue ? { delivered_at: getTodayStr(getNow()) } : {}),
        }).eq('id', order.id);
   ```
3. Em `ensureReceivableForDeliveredOrder`, logo depois da linha `if (existingObs && existingObs.length > 0) return;`, acrescente a releitura e use-a no RPC:
   ```ts
        // O total vem do banco, não do objeto do quadro: o quadro pode estar
        // aberto desde antes de um aditivo, e cobrar o total velho é perder dinheiro.
        const { data: atual, error: erroAtual } = await supabase
            .from('orders').select('total_amount, deadline').eq('id', order.id).single();
        if (erroAtual) throw new Error(erroAtual.message);
   ```
   e no objeto do `supabase.rpc('create_recurrence_obligations', {...})` troque
   `p_amount: order.total_amount || 0,` por `p_amount: Number(atual.total_amount) || 0,` e
   `p_first_due: order.deadline || getNow().toISOString().split('T')[0],` por
   `p_first_due: atual.deadline || getNow().toISOString().split('T')[0],`.
4. Acrescente o método novo dentro da classe, logo antes de `async getShortages(`:
   ```ts
    /** Total, prazo e cliente lidos agora do banco, para a janela de entrega. */
    async lerPedidoParaEntrega(orderId: string): Promise<{
        total_amount: number; deadline: string | null; client_id: string | null; order_number: string;
    }> {
        if (!supabase) throw new Error('Supabase não configurado');
        const { data, error } = await supabase
            .from('orders').select('total_amount, deadline, client_id, order_number').eq('id', orderId).single();
        if (error) throw new Error(error.message);
        return {
            total_amount: Number(data.total_amount) || 0,
            deadline: data.deadline ?? null,
            client_id: data.client_id ?? null,
            order_number: String(data.order_number),
        };
    }
   ```

Em `src/repositories/financeRepository.ts`, na assinatura de `reviseOrderPlan`, troque
`plan: Array<{ label: string; amount: number; due: string }>;` por
`plan: Array<{ label: string; amount: number; due: string; method?: string }>;`
(o SQL já grava `planned_method` a partir de `method`).

- [ ] **Step 3: A janela**

`src/components/financas/JanelaConfirmarEntrega.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { productionRepository } from '@/repositories/productionRepository';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import type { ObligationSummary } from '@/types';
import { separarParcelas, planoInicial, conferirEntrega, planoMudou } from '@/utils/financas/entrega';
import type { ParcelaEditavel } from '@/utils/financas/entrega';

const MEIOS = ['PIX', 'Boleto', 'Cartão', 'Dinheiro', 'TED', 'Cheque', 'Outro'];
const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600';

interface Props {
    pedidoId: string;
    numero: string;
    cliente?: string;
    /** Chão de fábrica (papel factory ou tela cheia): sem valores e sem editar parcelas. */
    semFinanceiro: boolean;
    ocupado: boolean;
    onCancelar: () => void;
    /** Marca o pedido como entregue — é o confirmDelivery do kanban. */
    onConfirmar: () => Promise<void> | void;
}

/**
 * É aqui que as parcelas de um pedido viram "a receber". Antes da entrega elas
 * existem, mas ficam aguardando — não vencem e não cobram ninguém.
 */
export function JanelaConfirmarEntrega({ pedidoId, numero, cliente, semFinanceiro, ocupado, onCancelar, onConfirmar }: Props) {
    const { mostrar, oculto } = useMostrarValor();
    const [carregando, setCarregando] = useState(!semFinanceiro);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const [total, setTotal] = useState(0);
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [fixas, setFixas] = useState<ObligationSummary[]>([]);
    const [abertas, setAbertas] = useState<ObligationSummary[]>([]);
    const [editaveis, setEditaveis] = useState<ParcelaEditavel[]>([]);

    useEffect(() => {
        if (semFinanceiro) return;
        let vivo = true;
        (async () => {
            try {
                const [pedido, contas] = await Promise.all([
                    productionRepository.lerPedidoParaEntrega(pedidoId),
                    storageService.getObligations({ order_id: pedidoId, type: 'receivable' }),
                ]);
                if (!vivo) return;
                const s = separarParcelas(contas as ObligationSummary[]);
                setTotal(pedido.total_amount);
                setClienteId(pedido.client_id);
                setFixas(s.fixas);
                setAbertas(s.abertas);
                setEditaveis(planoInicial({
                    abertas: s.abertas, fixas: s.fixas, totalDoPedido: pedido.total_amount,
                    prazo: pedido.deadline || getTodayStr(),
                }));
            } catch (e) {
                if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler as parcelas do pedido.');
            } finally {
                if (vivo) setCarregando(false);
            }
        })();
        return () => { vivo = false; };
    }, [pedidoId, semFinanceiro]);

    const conferencia = useMemo(
        () => conferirEntrega({ totalDoPedido: total, fixas, editaveis }), [total, fixas, editaveis]);

    const mudar = (i: number, mudanca: Partial<ParcelaEditavel>) =>
        setEditaveis(lista => lista.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));

    const confirmar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro('');
        try {
            if (!semFinanceiro) {
                if (!conferencia.confere) return;
                if (editaveis.length > 0 && planoMudou(abertas, editaveis)) {
                    await storageService.reviseOrderPlan({
                        order_id: pedidoId, client_id: clienteId ?? undefined,
                        description: `Pedido #${numero}`, plan: editaveis,
                    });
                }
            }
            await onConfirmar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui confirmar a entrega.');
        } finally {
            setSalvando(false);
        }
    };

    const podeTirar = !(editaveis.length <= 1 && abertas.length > 0);

    return (
        <Modal isOpen onClose={onCancelar} title={`Confirmar entrega · pedido ${numero}`} maxWidth="2xl">
            <div className="p-6 space-y-4">
                {cliente && <p className="text-sm text-zinc-400">{cliente}</p>}

                {semFinanceiro ? (
                    <p className="text-sm text-zinc-300">
                        O pedido sai do quadro e as parcelas combinadas passam a valer como contas a receber.
                    </p>
                ) : carregando ? (
                    <p className="text-sm text-zinc-500">Lendo as parcelas…</p>
                ) : (
                    <>
                        <p className="text-xs text-zinc-500">
                            É aqui que as parcelas viram “a receber”. Confira valor, vencimento e meio.
                        </p>
                        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl">
                            {fixas.map(c => (
                                <div key={c.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="text-zinc-400 truncate">{c.description}</span>
                                    <span className="tabular-nums text-emerald-400 shrink-0">
                                        {mostrar(c.original_amount)} · {c.remaining_amount > 0 ? `falta ${mostrar(c.remaining_amount)}` : 'recebida ✓'}
                                    </span>
                                </div>
                            ))}
                            {editaveis.map((p, i) => (
                                <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_auto] gap-2 items-center px-4 py-2.5">
                                    <span className="text-sm text-zinc-300 truncate">{p.label}</span>
                                    <input type="number" step="0.01" min="0" value={p.amount}
                                        onChange={e => mudar(i, { amount: Number(e.target.value) })}
                                        className={`${campo} text-right tabular-nums`} aria-label={`Valor da ${p.label}`} />
                                    <input type="date" value={p.due} onChange={e => mudar(i, { due: e.target.value })}
                                        className={campo} aria-label={`Vencimento da ${p.label}`} />
                                    <select value={p.method} onChange={e => mudar(i, { method: e.target.value })}
                                        className={campo} aria-label={`Meio da ${p.label}`}>
                                        {MEIOS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <button type="button" disabled={!podeTirar}
                                        onClick={() => setEditaveis(l => l.filter((_, j) => j !== i))}
                                        className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30">tirar</button>
                                </div>
                            ))}
                        </div>
                        <button type="button"
                            onClick={() => setEditaveis(l => [...l, {
                                label: `Parcela ${fixas.length + l.length + 1}`,
                                amount: Math.max(0, conferencia.diferenca), due: getTodayStr(), method: 'PIX',
                            }])}
                            className="text-xs text-amber-400 hover:text-amber-300">+ parcela</button>
                        <div className="flex justify-between gap-3 text-sm border-t border-zinc-800 pt-3">
                            <span className="text-zinc-400">Total do pedido {mostrar(total)}</span>
                            <span className={conferencia.confere ? 'text-emerald-400' : 'text-amber-400'}>
                                {conferencia.confere ? 'fecha com o pedido ✓' : oculto ? 'não fecha com o pedido' : conferencia.problema}
                            </span>
                        </div>
                    </>
                )}

                {erro && <p className="text-sm text-amber-400">{erro}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onCancelar}
                        className="px-4 py-2 rounded-xl text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700">Voltar</button>
                    <button type="button" onClick={confirmar}
                        disabled={salvando || ocupado || (!semFinanceiro && (carregando || !conferencia.confere))}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40">
                        Confirmar entrega
                    </button>
                </div>
            </div>
        </Modal>
    );
}
```

- [ ] **Step 4: Ligar no kanban**

Em `src/components/pcp/KanbanPanel.tsx`:
1. Acrescente o import: `import { JanelaConfirmarEntrega } from '@/components/financas/JanelaConfirmarEntrega';`
2. No tipo `Props` do painel, acrescente `semFinanceiro?: boolean;` e na assinatura troque `export function KanbanPanel({ onGoToProducts }: Props)` por `export function KanbanPanel({ onGoToProducts, semFinanceiro = false }: Props)`.
3. Substitua o bloco inteiro `<ConfirmDialog isOpen={!!kb.deliveryConfirm} ... isLoading={kb.busy} />` (o da entrega) por:
   ```tsx
            {kb.deliveryConfirm && (
                <JanelaConfirmarEntrega
                    pedidoId={kb.deliveryConfirm.id}
                    numero={kb.deliveryConfirm.order_number}
                    cliente={kb.deliveryConfirm.client_name}
                    semFinanceiro={semFinanceiro || full}
                    ocupado={kb.busy}
                    onCancelar={kb.cancelDelivery}
                    onConfirmar={kb.confirmDelivery}
                />
            )}
   ```
4. Se `ConfirmDialog` não for mais usado no arquivo, remova o import dele (o `tsc` acusa).

Em `src/pages/PCP.tsx`, troque `{tab === 'kanban' && <KanbanPanel onGoToProducts={onGoToProducts} />}` por
`{tab === 'kanban' && <KanbanPanel onGoToProducts={onGoToProducts} semFinanceiro={factoryMode} />}`.

- [ ] **Step 5: Tipos, suíte e verificação no navegador**

```bash
npx tsc --noEmit -p tsconfig.json
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
```
Expected: `tsc` sem saída; `# fail 0`.

Com `npm run dev:v3` de pé, entre em `http://localhost:5175` com `V3_TESTE_EMAIL`/`V3_TESTE_SENHA` de `.env.v3.local`. PCP → Kanban → leve um pedido "Em Produção" até a última coluna e peça a conclusão. Confirme na tela: as parcelas pagas aparecem com "recebida ✓"; as abertas são editáveis; mudar um valor para fazer a soma não fechar desabilita "Confirmar entrega" e mostra "Faltam R$ …"; voltar o valor libera. Confirme. Depois:
```bash
export MSYS_NO_PATHCONV=1
docker exec supabase_db_botezini-v3 psql -U postgres -tAc "select o.order_number, o.status, o.delivered_at, bool_or(os.awaiting_delivery) from orders o join obligation_summary os on os.order_id = o.id where o.delivered_at = current_date group by 1,2,3"
```
Expected: o pedido aparece com `Entregue`, `delivered_at` = hoje e `bool_or` = `f`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/financas/useMostrarValor.ts src/components/financas/JanelaConfirmarEntrega.tsx src/repositories/productionRepository.ts src/repositories/financeRepository.ts src/components/pcp/KanbanPanel.tsx src/pages/PCP.tsx
git commit -m "feat(financeiro): janela Confirmar entrega libera as parcelas do pedido

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Baixa rápida, janela da conta e formulário enxuto

**Files:**
- Create: `src/components/financas/JanelaDeBaixa.tsx`
- Create: `src/components/financas/JanelaDaConta.tsx`
- Modify: `src/components/finance/ObligationForm.tsx` (prop `enxuto`)
- Modify: `src/components/finance/PaymentModal.tsx` (saem os atalhos 100% e 50%)

**Interfaces:**
- Consumes: Task 5 (`sugestoesDeCaixinha`, `bancoSugerido`); Task 8 (`useMostrarValor`); `PaymentModal`, `EditarContaModal`, `ConfirmarOperacao`, `motivoParaNaoCancelar`; `storageService.payObligation`, `moveEnvelope`, `getObligationPayments`, `cancelObligation`, `reversePayment`.
- Produces:
  - `<JanelaDeBaixa conta bancos caixinhas bancoInicial onMaisOpcoes onFechar onConcluido />`
  - `<JanelaDaConta conta todas bancos aberturaEm?: 'pagar' onFechar onAlterado />`
  - `ObligationForm` aceita `enxuto?: boolean`.

- [ ] **Step 1: Baixa rápida**

`src/components/financas/JanelaDeBaixa.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import { parseBRL } from '@/utils/currency';
import type { BankAccount, ObligationSummary } from '@/types';
import type { CashEnvelope } from '@/types/finance';
import { sugestoesDeCaixinha } from '@/utils/financas/caixinhas';

const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600';

interface Props {
    conta: ObligationSummary;
    bancos: BankAccount[];
    caixinhas: CashEnvelope[];
    bancoInicial: string | null;
    /** Abre a janela completa (parcial com desconto, anexo, informativo, anotação, método). */
    onMaisOpcoes: () => void;
    onFechar: () => void;
    onConcluido: () => void;
}

/** Recebi / Paguei em um clique: tudo já preenchido, e a sugestão de caixinha junto. */
export function JanelaDeBaixa({ conta, bancos, caixinhas, bancoInicial, onMaisOpcoes, onFechar, onConcluido }: Props) {
    const { mostrar } = useMostrarValor();
    const recebendo = conta.type === 'receivable';
    const [valor, setValor] = useState(String(conta.remaining_amount).replace('.', ','));
    const [data, setData] = useState(getTodayStr());
    const [bancoId, setBancoId] = useState(bancoInicial ?? '');
    const [recusadas, setRecusadas] = useState<Set<string>>(new Set());
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const quantia = parseBRL(valor);
    const sugestoes = useMemo(
        () => (recebendo ? sugestoesDeCaixinha(quantia, caixinhas) : []), [recebendo, quantia, caixinhas]);
    const ativos = bancos.filter(b => b.is_active);
    const pode = quantia > 0 && quantia <= conta.remaining_amount + 0.001 && !!bancoId && !!data && !salvando;

    const confirmar = async () => {
        if (!pode) return;
        setSalvando(true);
        setErro('');
        try {
            await storageService.payObligation({
                obligation_id: conta.id, amount: quantia, account_id: bancoId,
                method: conta.planned_method || 'PIX', payment_date: data,
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui registrar a baixa.');
            setSalvando(false);
            return;
        }
        const falhas: string[] = [];
        for (const s of sugestoes) {
            if (recusadas.has(s.caixinhaId)) continue;
            try { await storageService.moveEnvelope(s.caixinhaId, s.valor, `Recebimento: ${conta.description}`); }
            catch { falhas.push(s.nome); }
        }
        setSalvando(false);
        if (falhas.length) {
            setErro(`Baixa feita. Não consegui guardar em: ${falhas.join(', ')}. Guarde à mão em Caixinhas.`);
            return;
        }
        onConcluido();
    };

    return (
        <Modal isOpen onClose={onFechar} title={`${recebendo ? 'Recebi' : 'Paguei'} · ${conta.description}`} maxWidth="md">
            <div className="p-6 space-y-3">
                <label className="block text-xs text-zinc-500">Valor
                    <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal"
                        className={`${campo} mt-1 text-right tabular-nums`} />
                </label>
                <label className="block text-xs text-zinc-500">Data
                    <input type="date" value={data} onChange={e => setData(e.target.value)} className={`${campo} mt-1`} />
                </label>
                <label className="block text-xs text-zinc-500">Banco
                    <select value={bancoId} onChange={e => setBancoId(e.target.value)} className={`${campo} mt-1`}>
                        <option value="">escolha</option>
                        {ativos.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </label>

                {sugestoes.map(s => {
                    const aceita = !recusadas.has(s.caixinhaId);
                    return (
                        <div key={s.caixinhaId} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950 px-3 py-2 text-sm">
                            <span className="text-zinc-300">Guardar <b className="tabular-nums">{mostrar(s.valor)}</b> em {s.nome} ({s.percentual}%)?</span>
                            <span className="flex gap-2 text-xs shrink-0">
                                <button type="button" onClick={() => setRecusadas(r => { const n = new Set(r); n.delete(s.caixinhaId); return n; })}
                                    className={aceita ? 'text-emerald-400 underline' : 'text-zinc-500'}>sim</button>
                                <button type="button" onClick={() => setRecusadas(r => new Set(r).add(s.caixinhaId))}
                                    className={!aceita ? 'text-zinc-200 underline' : 'text-zinc-500'}>não</button>
                            </span>
                        </div>
                    );
                })}

                <button type="button" onClick={onMaisOpcoes} className="text-xs text-amber-400 hover:text-amber-300">
                    + mais opções: quitar com desconto · anexar comprovante · já {recebendo ? 'recebido' : 'pago'} antes do ERP · anotação
                </button>

                {quantia > conta.remaining_amount + 0.001 && (
                    <p className="text-sm text-amber-400">O valor passa do que falta ({mostrar(conta.remaining_amount)}).</p>
                )}
                {erro && <p className="text-sm text-amber-400">{erro}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onFechar} className="px-4 py-2 rounded-xl text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700">
                        {erro.startsWith('Baixa feita') ? 'Fechar' : 'Cancelar'}
                    </button>
                    {!erro.startsWith('Baixa feita') && (
                        <button type="button" onClick={confirmar} disabled={!pode}
                            className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40">
                            Confirmar
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
```

- [ ] **Step 2: Janela da conta (detalhe)**

`src/components/financas/JanelaDaConta.tsx`:
```tsx
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/common';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';
import { PaymentModal } from '@/components/finance/PaymentModal';
import { EditarContaModal } from '@/components/finance/EditarContaModal';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { usePrivacidade } from '@/hooks/usePrivacidade';
import { motivoParaNaoCancelar } from '@/utils/pagamentoAtivo';
import type { BankAccount, ObligationPayment, ObligationSummary } from '@/types';

interface Props {
    conta: ObligationSummary;
    todas: ObligationSummary[];
    /** Todos os bancos, inclusive inativos (o histórico nomeia a conta usada). */
    bancos: BankAccount[];
    /** 'pagar' abre direto a janela completa de baixa (vindo do "+ mais opções"). */
    aberturaEm?: 'pagar';
    onFechar: () => void;
    onAlterado: () => void;
}

type Etapa = 'resumo' | 'pagar' | 'corrigir' | 'cancelar' | { estornar: string };

/** Tudo o que se faz com UMA conta: baixa completa, corrigir, cancelar, estornar, anexos. */
export function JanelaDaConta({ conta, todas, bancos, aberturaEm, onFechar, onAlterado }: Props) {
    const { mostrar } = useMostrarValor();
    const { oculto } = usePrivacidade();
    const [etapa, setEtapa] = useState<Etapa>(aberturaEm ?? 'resumo');
    const [pagamentos, setPagamentos] = useState<ObligationPayment[]>([]);
    const [aviso, setAviso] = useState('');

    const carregar = useCallback(async () => {
        setPagamentos(await storageService.getObligationPayments(conta.id));
    }, [conta.id]);
    useEffect(() => { void carregar(); }, [carregar]);

    if (etapa === 'pagar') {
        return (
            <PaymentModal obligation={conta} bankAccounts={bancos} existingPayments={pagamentos}
                isPrivacy={oculto} onClose={() => setEtapa('resumo')}
                onSuccess={() => { onAlterado(); onFechar(); }}
                onRefresh={() => { void carregar(); onAlterado(); }}
                onReversePayment={id => setEtapa({ estornar: id })} />
        );
    }
    if (etapa === 'corrigir') {
        return <EditarContaModal conta={conta} todas={todas} onClose={() => setEtapa('resumo')}
            onSaved={() => { onAlterado(); onFechar(); }} />;
    }
    if (etapa === 'cancelar') {
        return (
            <ConfirmarOperacao operacaoId="cancelar-lancamento" alvo={conta.description}
                onCancelar={() => setEtapa('resumo')}
                onConfirmar={async () => { await storageService.cancelObligation(conta.id); onAlterado(); onFechar(); }} />
        );
    }
    if (typeof etapa === 'object') {
        return (
            <ConfirmarOperacao operacaoId="estornar-pagamento" alvo={conta.description}
                onCancelar={() => setEtapa('pagar')}
                onConfirmar={async () => {
                    await storageService.reversePayment(etapa.estornar, 'Estorno solicitado pelo usuário');
                    await carregar(); onAlterado(); setEtapa('pagar');
                }} />
        );
    }

    const pedirCancelamento = () => {
        const motivo = motivoParaNaoCancelar(pagamentos);
        if (motivo) { setAviso(motivo); setEtapa('pagar'); return; }
        setEtapa('cancelar');
    };

    const acao = 'px-3 py-2 rounded-xl text-sm text-zinc-200 bg-zinc-800 hover:bg-zinc-700';
    return (
        <Modal isOpen onClose={onFechar} title={conta.description} maxWidth="md">
            <div className="p-6 space-y-4">
                <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-zinc-500">Valor</dt><dd className="text-right tabular-nums">{mostrar(conta.original_amount)}</dd>
                    <dt className="text-zinc-500">Falta</dt><dd className="text-right tabular-nums">{mostrar(conta.remaining_amount)}</dd>
                    <dt className="text-zinc-500">Vencimento</dt><dd className="text-right">{conta.due_date.split('-').reverse().join('/')}</dd>
                    <dt className="text-zinc-500">Pagamentos</dt><dd className="text-right">{pagamentos.filter(p => !p.reversed_at && !p.reversal_of).length}</dd>
                </dl>
                {aviso && <p className="text-sm text-amber-400">{aviso}</p>}
                <div className="flex flex-wrap gap-2">
                    {conta.remaining_amount > 0 && conta.derived_status !== 'cancelled' && (
                        <button type="button" className={acao} onClick={() => setEtapa('pagar')}>
                            {conta.type === 'receivable' ? 'Recebi' : 'Paguei'} (todas as opções)
                        </button>
                    )}
                    <button type="button" className={acao} onClick={() => setEtapa('pagar')}>Histórico, estorno e anexos</button>
                    {conta.derived_status !== 'cancelled' && (
                        <button type="button" className={acao} onClick={() => setEtapa('corrigir')}>Corrigir</button>
                    )}
                    {conta.derived_status !== 'cancelled' && (
                        <button type="button" className={acao} onClick={pedirCancelamento}>Cancelar conta</button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
```

- [ ] **Step 3: Formulário enxuto**

Em `src/components/finance/ObligationForm.tsx`:
1. Em `ObligationFormProps`, acrescente `/** v3: básico à vista; modos, observações e divisão em "mais opções". */ enxuto?: boolean;` e acrescente `enxuto = false` na desestruturação da função.
2. Logo abaixo de `const [confirmando, setConfirmando] = useState(false);` acrescente `const [maisOpcoes, setMaisOpcoes] = useState(!enxuto);`.
3. Envolva o elemento que contém os botões de modo (o que tem `onClick={() => setMode(val)}`) em `{maisOpcoes && ( … )}`.
4. Envolva o bloco do campo "Observações" (o `div` que contém `<label className={labelCls}>Observações</label>`) em `{maisOpcoes && ( … )}`.
5. Envolva o botão que liga a divisão de custos (o que chama `setIsSplit(true)`) em `{!enxuto && ( … )}`.
6. Logo antes do bloco de "Observações", acrescente:
   ```tsx
                    {enxuto && !maisOpcoes && (
                        <button type="button" onClick={() => setMaisOpcoes(true)}
                            className="text-[11px] text-amber-400 hover:text-amber-300">
                            + mais opções: parcelas · repetir todo mês · observações
                        </button>
                    )}
   ```
Sem `enxuto`, o formulário fica idêntico ao de hoje (`maisOpcoes` começa verdadeiro e a divisão continua).

Em `src/components/finance/PaymentModal.tsx` (a janela completa que o "+ mais opções" abre), apague os dois botões de atalho ao lado do campo de valor: o que tem `onClick={handleQuick100}` / `title="Pagar valor restante completo"` e o que tem `title="Pagar 50% do restante"`. O valor já começa no restante (`usePaymentModal`: `useState(ob.remaining_amount.toFixed(2)…)`). Se o `tsc` acusar `handleQuick100` sem uso, tire-o da desestruturação do `usePaymentModal` no componente.

- [ ] **Step 4: Tipos e suíte**

```bash
npx tsc --noEmit -p tsconfig.json
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
```
Expected: `tsc` sem saída; `# fail 0`. (A verificação no navegador destas janelas acontece na Tarefa 11, quando a Visão geral as abre.)

- [ ] **Step 5: Commit**

```bash
git add src/components/financas/JanelaDeBaixa.tsx src/components/financas/JanelaDaConta.tsx src/components/finance/ObligationForm.tsx src/components/finance/PaymentModal.tsx
git commit -m "feat(financeiro): baixa em um clique com sugestão de caixinha e janela da conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conferir banco

**Files:**
- Create: `src/components/financas/JanelaConferirBanco.tsx`

**Interfaces:**
- Consumes: Task 7 (`SituacaoDoBanco`); Task 8 (`useMostrarValor`); `ConfirmarOperacao`; `storageService.toggleReconciliation(id)`, `storageService.undoReconciliation(id, motivo)`.
- Produces: `<JanelaConferirBanco banco: SituacaoDoBanco contas: ObligationSummary[] onFechar onAlterado />`.

- [ ] **Step 1: A janela**

`src/components/financas/JanelaConferirBanco.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { parseBRL } from '@/utils/currency';
import { centavos } from '@/utils/financas/base';
import type { SituacaoDoBanco } from '@/utils/financas/bancos';
import type { ObligationSummary } from '@/types';

interface Props {
    banco: SituacaoDoBanco;
    /** Todas as contas carregadas; a janela mostra as de `banco.aConferir`. */
    contas: ObligationSummary[];
    onFechar: () => void;
    onAlterado: () => void;
}

/** O saldo do sistema contra o do extrato, e o que falta conferir neste banco. */
export function JanelaConferirBanco({ banco, contas, onFechar, onAlterado }: Props) {
    const { mostrar } = useMostrarValor();
    const [extrato, setExtrato] = useState('');
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [erro, setErro] = useState('');
    const pendentes = useMemo(() => contas.filter(c => banco.aConferir.includes(c.id)), [contas, banco.aConferir]);

    const digitado = extrato.trim() === '' ? null : parseBRL(extrato);
    const diferenca = digitado === null ? null : centavos(digitado - banco.saldo);

    const conferir = async (id: string) => {
        setOcupado(id); setErro('');
        try { await storageService.toggleReconciliation(id); onAlterado(); }
        catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui marcar como conferida.'); }
        finally { setOcupado(null); }
    };

    return (
        <Modal isOpen onClose={onFechar} title={`Conferir · ${banco.nome}`} maxWidth="lg">
            <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <p className="text-xs text-zinc-500">Saldo no sistema</p>
                        <p className="text-lg font-semibold tabular-nums">{mostrar(banco.saldo)}</p>
                    </div>
                    <label className="text-xs text-zinc-500">Saldo do extrato
                        <input value={extrato} onChange={e => setExtrato(e.target.value)} inputMode="decimal" placeholder="0,00"
                            className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white text-right tabular-nums" />
                    </label>
                </div>
                {diferenca !== null && (
                    <p className={`text-sm ${Math.abs(diferenca) < 0.01 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {Math.abs(diferenca) < 0.01 ? '✓ bate com o extrato' : `diferença de ${mostrar(Math.abs(diferenca))} — confira os lançamentos abaixo`}
                    </p>
                )}
                <div>
                    <p className="text-xs text-zinc-500 mb-2">
                        {pendentes.length === 0 ? 'Nada a conferir neste banco.' : `${pendentes.length} lançamento(s) a conferir`}
                    </p>
                    <ul className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl">
                        {pendentes.map(c => (
                            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="truncate text-zinc-300">{c.description}</span>
                                <span className="flex items-center gap-3 shrink-0">
                                    <span className="tabular-nums">{mostrar(c.paid_amount)}</span>
                                    <button type="button" disabled={ocupado === c.id} onClick={() => conferir(c.id)}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-40">conferido</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                {erro && <p className="text-sm text-amber-400">{erro}</p>}
                <div className="flex justify-end">
                    <button type="button" onClick={onFechar} className="px-4 py-2 rounded-xl text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700">Fechar</button>
                </div>
            </div>
        </Modal>
    );
}
```

Nota: "desfazer conferência com motivo" continua onde já está (janela da conta → histórico); esta janela só lista o que **falta** conferir.

- [ ] **Step 2: Tipos e commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/components/financas/JanelaConferirBanco.tsx
git commit -m "feat(financeiro): janela de conferência de um banco com o extrato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `tsc` sem saída.

---

### Task 11: Visão geral (e o módulo Finanças)

**Files:**
- Create: `src/hooks/financas/useDadosDasFinancas.ts`
- Create: `src/pages/financas/Financas.tsx` (moldura com o menu lateral do módulo)
- Create: `src/pages/financas/VisaoGeral.tsx`
- Modify: `src/utils/navegacao.ts`, `src/utils/navegacao.test.ts`, `src/components/layout/LateralDaSecao.tsx`, `src/App.tsx` (entrada provisória "Finanças v3")

**Interfaces:**
- Consumes: Tasks 3, 7, 8, 9, 10.
- Produces:
  - `interface DadosDasFinancas { contas; pagamentos; pagamentosIncompletos; bancos; caixinhas; visaoDasCaixinhas; contasPorObrigacao; clientes; fornecedores; categorias; pedidos }`; `useDadosDasFinancas(): { dados: DadosDasFinancas | null; erro: string; carregando: boolean; recarregar: () => Promise<void> }`
  - `type PaginaDasFinancas = 'visao' | 'resultado' | 'caixinhas' | 'clientes'`
  - `<Financas buscaInicial? limparBusca? />` (default export); `<VisaoGeral dados recarregar filtrosIniciais />`
  - View `'financas'` em `View`.

- [ ] **Step 1: Hook de dados**

`src/hooks/financas/useDadosDasFinancas.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import { storageService } from '@/services/storage';
import type { BankAccount, Client, GlobalCategory, ObligationPayment, ObligationSummary, Order, Supplier } from '@/types';
import type { CashEnvelope, EnvelopeOverview } from '@/types/finance';

export interface DadosDasFinancas {
    contas: ObligationSummary[];
    pagamentos: ObligationPayment[];
    /** O teto de 5.000 pagamentos foi atingido: somas de caixa podem estar incompletas. */
    pagamentosIncompletos: boolean;
    /** Todos os bancos, ativos e inativos. */
    bancos: BankAccount[];
    caixinhas: CashEnvelope[];
    visaoDasCaixinhas: EnvelopeOverview;
    contasPorObrigacao: Record<string, string[]>;
    clientes: Client[];
    fornecedores: Supplier[];
    categorias: GlobalCategory[];
    pedidos: Order[];
}

/** Uma carga só para as quatro páginas do módulo. */
export function useDadosDasFinancas() {
    const [dados, setDados] = useState<DadosDasFinancas | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(true);

    const recarregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            const [contas, pag, bancos, caixinhas, visao, porObrigacao, clientes, fornecedores, categorias, pedidos] = await Promise.all([
                storageService.getObligations(),
                storageService.getAllPaymentsComTeto(),
                storageService.getBankAccounts(false),
                storageService.getEnvelopes(),
                storageService.getEnvelopeOverview(),
                storageService.getContasPorObrigacao(),
                storageService.getClients(),
                storageService.getSuppliers(),
                storageService.getGlobalCategories('finance'),
                storageService.getOrders(),
            ]);
            setDados({
                contas, pagamentos: pag.pagamentos, pagamentosIncompletos: pag.truncado, bancos, caixinhas,
                visaoDasCaixinhas: visao, contasPorObrigacao: porObrigacao, clientes, fornecedores, categorias, pedidos,
            });
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui carregar o financeiro.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { void recarregar(); }, [recarregar]);
    return { dados, erro, carregando, recarregar };
}
```

- [ ] **Step 2: A Visão geral**

`src/pages/financas/VisaoGeral.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { ObligationForm } from '@/components/finance/ObligationForm';
import { Modal } from '@/components/common';
import { JanelaDeBaixa } from '@/components/financas/JanelaDeBaixa';
import { JanelaDaConta } from '@/components/financas/JanelaDaConta';
import { JanelaConferirBanco } from '@/components/financas/JanelaConferirBanco';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import { getTodayStr } from '@/utils/date';
import type { ObligationSummary, ObligationType } from '@/types';
import { nomeDoMes, mesDe } from '@/utils/financas/base';
import { numerosDaVisaoGeral, RECORTES, ROTULO_DO_RECORTE } from '@/utils/financas/numeros';
import type { Recorte } from '@/utils/financas/numeros';
import { projecaoDoMes } from '@/utils/financas/projecao';
import type { PontoDaProjecao } from '@/utils/financas/projecao';
import { situacaoDosBancos } from '@/utils/financas/bancos';
import { nomeDaCategoria } from '@/utils/financas/caixa';
import { bancoSugerido } from '@/utils/financas/caixinhas';
import { situacaoDaConta } from '@/utils/financas/situacao';
import {
    filtrarContas, agruparParaLista, FILTROS_VAZIOS, FILTROS_RAPIDOS, ROTULO_DO_FILTRO,
} from '@/utils/financas/lista';
import type { ContextoDaLista, FiltrosDaLista } from '@/utils/financas/lista';

interface Props {
    dados: DadosDasFinancas;
    recarregar: () => Promise<void>;
    filtrosIniciais: Partial<FiltrosDaLista>;
}

function LinhaDoSaldo({ pontos }: { pontos: PontoDaProjecao[] }) {
    if (pontos.length < 2) return null;
    const valores = pontos.map(p => p.saldo);
    const min = Math.min(...valores);
    const faixa = Math.max(...valores) - min || 1;
    const d = pontos.map((p, i) => `${(i / (pontos.length - 1)) * 200},${38 - ((p.saldo - min) / faixa) * 34}`).join(' ');
    return (
        <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-10 text-zinc-500" role="img"
            aria-label="Saldo projetado dia a dia até o fim do mês">
            <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

const seletor = 'bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200';

export function VisaoGeral({ dados, recarregar, filtrosIniciais }: Props) {
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const [filtros, setFiltros] = useState<FiltrosDaLista>({ ...FILTROS_VAZIOS, ...filtrosIniciais });
    useEffect(() => { setFiltros({ ...FILTROS_VAZIOS, ...filtrosIniciais }); }, [filtrosIniciais]);
    const [emColunas, setEmColunas] = useState(false);
    const [baixa, setBaixa] = useState<ObligationSummary | null>(null);
    const [detalhe, setDetalhe] = useState<{ conta: ObligationSummary; aberturaEm?: 'pagar' } | null>(null);
    const [escolhendoTipo, setEscolhendoTipo] = useState(false);
    const [novaConta, setNovaConta] = useState<ObligationType | null>(null);
    const [bancoAberto, setBancoAberto] = useState<string | null>(null);

    const numeros = useMemo(() => numerosDaVisaoGeral({
        contas: dados.contas, nosBancos: dados.visaoDasCaixinhas.total_real,
        nasCaixinhas: dados.visaoDasCaixinhas.allocated, hoje,
    }), [dados, hoje]);
    const projecao = useMemo(
        () => projecaoDoMes({ contas: dados.contas, livreHoje: numeros.livre, hoje }), [dados.contas, numeros.livre, hoje]);
    const bancos = useMemo(() => situacaoDosBancos({
        bancos: dados.bancos, contas: dados.contas, contasPorObrigacao: dados.contasPorObrigacao,
    }), [dados]);

    const ctx: ContextoDaLista = useMemo(() => {
        const clientes = new Map(dados.clientes.map(c => [c.id, c.company_name]));
        const fornecedores = new Map(dados.fornecedores.map(f => [f.id, f.company_name]));
        const categorias = new Map(dados.categorias.map(c => [c.id, c]));
        return {
            hoje,
            contasPorObrigacao: dados.contasPorObrigacao,
            nomeDaParte: c => (c.client_id ? clientes.get(c.client_id) : c.supplier_id ? fornecedores.get(c.supplier_id) : '') ?? '',
            nomeDaCategoria: c => nomeDaCategoria(c, categorias),
        };
    }, [dados, hoje]);

    const lista = useMemo(() => filtrarContas(dados.contas, filtros, ctx), [dados.contas, filtros, ctx]);
    const porAtraso = filtros.recorte?.endsWith('vencido') || (!filtros.recorte && filtros.rapido === 'vencidas');
    const grupos = useMemo(() => agruparParaLista(lista, hoje, !!porAtraso), [lista, hoje, porAtraso]);

    const mudar = (m: Partial<FiltrosDaLista>) => setFiltros(f => ({ ...f, ...m }));
    const alternarRecorte = (r: Recorte) => mudar({ recorte: filtros.recorte === r ? null : r });
    const descricaoDoFiltro = filtros.recorte ? ROTULO_DO_RECORTE[filtros.recorte].toLowerCase() : ROTULO_DO_FILTRO[filtros.rapido].toLowerCase();
    const bancoAtual = bancos.find(b => b.id === bancoAberto) ?? null;
    const aoMudar = () => { void recarregar(); };

    const linha = (c: ObligationSummary) => {
        const s = situacaoDaConta(c, hoje);
        const entra = c.type === 'receivable';
        return (
            <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-2.5 border-t border-zinc-800/70">
                <button type="button" onClick={() => setDetalhe({ conta: c })} className="text-left min-w-0">
                    <span className="block truncate text-sm text-zinc-200">{c.description}</span>
                    <span className="block truncate text-xs text-zinc-500">
                        {[ctx.nomeDaParte(c), ctx.nomeDaCategoria(c), s === 'aguardando_entrega' ? 'aguardando entrega' : '']
                            .filter(Boolean).join(' · ')}
                    </span>
                </button>
                <span className={`tabular-nums text-sm font-semibold ${entra ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {entra ? '+' : '−'} {mostrar(c.remaining_amount > 0 ? c.remaining_amount : c.original_amount)}
                </span>
                {s === 'paga' || s === 'cancelada' ? <span /> : (
                    <button type="button" onClick={() => setBaixa(c)} className="text-xs text-amber-400 hover:text-amber-300">
                        {entra ? 'Recebi' : 'Paguei'}
                    </button>
                )}
            </li>
        );
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-white">Visão geral</h1>
                <button type="button" onClick={() => setEscolhendoTipo(true)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-zinc-950 bg-zinc-100 hover:bg-white">+ Nova conta</button>
            </div>

            <section className="grid gap-6 sm:grid-cols-2 pb-5 border-b border-zinc-800">
                <div>
                    <p className="text-xs text-zinc-500">Livre para usar</p>
                    <p className={`text-3xl font-semibold tabular-nums ${numeros.livre < 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(numeros.livre)}</p>
                    <p className="text-xs text-zinc-500">{mostrar(numeros.nosBancos)} nos bancos − {mostrar(numeros.nasCaixinhas)} nas caixinhas</p>
                </div>
                <div>
                    <p className="text-xs text-zinc-500">Fecha {nomeDoMes(mesDe(hoje)).split(' ')[0]} com</p>
                    <div className="flex items-end gap-3">
                        <p className={`text-3xl font-semibold tabular-nums ${projecao.fechaCom < 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(projecao.fechaCom)}</p>
                        <div className="flex-1 min-w-0"><LinhaDoSaldo pontos={projecao.pontos} /></div>
                    </div>
                    <p className="text-xs text-zinc-500">só pedidos já entregues</p>
                </div>
            </section>

            <section className="grid grid-cols-2 lg:grid-cols-4 border-b border-zinc-800">
                {RECORTES.map(r => {
                    const soma = numeros.recortes[r];
                    const ativo = filtros.recorte === r;
                    return (
                        <button key={r} type="button" onClick={() => alternarRecorte(r)} aria-pressed={ativo}
                            className={`text-left px-3 py-3 border-b-2 ${ativo ? 'border-zinc-100' : 'border-transparent'} hover:bg-zinc-900/60`}>
                            <span className="block text-xs text-zinc-500">{ROTULO_DO_RECORTE[r]}</span>
                            <span className={`block text-lg font-semibold tabular-nums ${r.endsWith('vencido') && soma.total > 0 ? 'text-amber-400' : 'text-white'}`}>
                                {mostrar(soma.total)}
                            </span>
                        </button>
                    );
                })}
            </section>

            <section className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500">
                <span>Bancos:</span>
                {bancos.map(b => (
                    <button key={b.id} type="button" onClick={() => setBancoAberto(b.id)} className="hover:text-zinc-200">
                        <span className="text-zinc-200">{b.nome}</span> <span className="tabular-nums">{mostrar(b.saldo)}</span>{' '}
                        {b.aConferir.length === 0
                            ? <span className="text-emerald-400">✓</span>
                            : <span className="text-amber-400">{b.aConferir.length} a conferir</span>}
                    </button>
                ))}
            </section>

            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500 mr-1">
                        Mostrando <b className="text-zinc-200">{descricaoDoFiltro}</b> · {lista.length} conta(s)
                    </span>
                    {(filtros.recorte || JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS)) && (
                        <button type="button" onClick={() => setFiltros(FILTROS_VAZIOS)} className="text-xs underline text-zinc-400">limpar</button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {FILTROS_RAPIDOS.map(f => (
                        <button key={f} type="button" onClick={() => mudar({ rapido: f, recorte: null })}
                            className={`px-2.5 py-1 rounded-full text-xs border ${!filtros.recorte && filtros.rapido === f ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                            {ROTULO_DO_FILTRO[f]}
                        </button>
                    ))}
                    <input value={filtros.busca} onChange={e => mudar({ busca: e.target.value })} placeholder="buscar"
                        className={`${seletor} w-36`} aria-label="Buscar conta" />
                    <select value={filtros.tipo} onChange={e => mudar({ tipo: e.target.value as FiltrosDaLista['tipo'] })} className={seletor} aria-label="Pagar ou receber">
                        <option value="ambos">pagar e receber</option><option value="receivable">a receber</option><option value="payable">a pagar</option>
                    </select>
                    <input type="month" value={filtros.mes ?? ''} onChange={e => mudar({ mes: e.target.value || null })} className={seletor} aria-label="Mês do vencimento" />
                    <select value={filtros.clienteId ?? ''} onChange={e => mudar({ clienteId: e.target.value || null })} className={seletor} aria-label="Cliente">
                        <option value="">cliente</option>
                        {dados.clientes.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                    <select value={filtros.categoriaId ?? ''} onChange={e => mudar({ categoriaId: e.target.value || null })} className={seletor} aria-label="Categoria">
                        <option value="">categoria</option>
                        {dados.categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={filtros.bancoId ?? ''} onChange={e => mudar({ bancoId: e.target.value || null })} className={seletor} aria-label="Banco">
                        <option value="">banco</option>
                        {dados.bancos.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setEmColunas(v => !v)} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">
                        {emColunas ? '☰ lista' : '▤ colunas'}
                    </button>
                </div>

                {lista.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-500">Nenhuma conta neste filtro.</p>
                ) : emColunas ? (
                    <div className="grid gap-6 md:grid-cols-2">
                        {(['receivable', 'payable'] as const).map(tipo => (
                            <div key={tipo} className="min-w-0">
                                <p className="text-xs text-zinc-500 mb-1">{tipo === 'receivable' ? 'A receber' : 'A pagar'}</p>
                                <ul>{lista.filter(c => c.type === tipo).map(linha)}</ul>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div>
                        {grupos.map(g => (
                            <div key={g.titulo}>
                                <p className="pt-3 pb-1 text-xs text-zinc-500">{g.titulo}</p>
                                <ul>{g.contas.map(linha)}</ul>
                            </div>
                        ))}
                    </div>
                )}

                {numeros.emProducao.total > 0 && (
                    <p className="text-xs text-zinc-500">
                        {mostrar(numeros.emProducao.total)} de pedidos em produção não aparecem aqui · entram quando o pedido for entregue.
                    </p>
                )}
            </section>

            {baixa && (
                <JanelaDeBaixa conta={baixa} bancos={dados.bancos} caixinhas={dados.caixinhas}
                    bancoInicial={bancoSugerido({
                        pagamentos: dados.pagamentos, contas: dados.contas, tipo: baixa.type,
                        bancosAtivos: dados.bancos.filter(b => b.is_active),
                    })}
                    onMaisOpcoes={() => { setDetalhe({ conta: baixa, aberturaEm: 'pagar' }); setBaixa(null); }}
                    onFechar={() => { setBaixa(null); aoMudar(); }}
                    onConcluido={() => { setBaixa(null); aoMudar(); }} />
            )}
            {detalhe && (
                <JanelaDaConta conta={detalhe.conta} todas={dados.contas} bancos={dados.bancos}
                    aberturaEm={detalhe.aberturaEm} onFechar={() => setDetalhe(null)} onAlterado={aoMudar} />
            )}
            {bancoAtual && (
                <JanelaConferirBanco banco={bancoAtual} contas={dados.contas}
                    onFechar={() => setBancoAberto(null)} onAlterado={aoMudar} />
            )}
            {escolhendoTipo && (
                <Modal isOpen onClose={() => setEscolhendoTipo(false)} title="Nova conta" maxWidth="sm">
                    <div className="p-6 grid grid-cols-2 gap-3">
                        <button type="button" onClick={() => { setNovaConta('payable'); setEscolhendoTipo(false); }}
                            className="py-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-100">A pagar</button>
                        <button type="button" onClick={() => { setNovaConta('receivable'); setEscolhendoTipo(false); }}
                            className="py-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-100">A receber</button>
                    </div>
                </Modal>
            )}
            {novaConta && (
                <ObligationForm type={novaConta} enxuto clients={dados.clientes} suppliers={dados.fornecedores}
                    bankAccounts={dados.bancos.filter(b => b.is_active)} globalCategories={dados.categorias}
                    onClose={() => setNovaConta(null)} onRefreshCategories={aoMudar}
                    onSuccess={() => { setNovaConta(null); aoMudar(); }} />
            )}
        </div>
    );
}
```

- [ ] **Step 3: A moldura do módulo**

`src/pages/financas/Financas.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useDadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import type { FiltrosDaLista } from '@/utils/financas/lista';
import { VisaoGeral } from './VisaoGeral';

export type PaginaDasFinancas = 'visao' | 'resultado' | 'caixinhas' | 'clientes';

const PAGINAS: { id: PaginaDasFinancas; rotulo: string }[] = [
    { id: 'visao', rotulo: 'Visão geral' },
];

interface Props {
    /** Busca vinda de outra tela (ex.: Pedidos → "Pedido #123"). */
    buscaInicial?: string;
    limparBusca?: () => void;
}

/** Finanças: um menu de tarefas à esquerda (como o Stripe) e uma página por pergunta. */
export default function Financas({ buscaInicial, limparBusca }: Props) {
    const { dados, erro, carregando, recarregar } = useDadosDasFinancas();
    const [pagina, setPagina] = useState<PaginaDasFinancas>('visao');
    const [filtrosIniciais, setFiltrosIniciais] = useState<Partial<FiltrosDaLista>>(
        buscaInicial ? { busca: buscaInicial, rapido: 'todas' } : {});

    useEffect(() => { if (buscaInicial) limparBusca?.(); }, [buscaInicial, limparBusca]);

    const abrirVisaoGeral = (f: Partial<FiltrosDaLista>) => { setFiltrosIniciais(f); setPagina('visao'); };

    return (
        <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)] p-4 md:p-6">
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible" aria-label="Finanças">
                <p className="hidden md:block px-2 pb-2 text-[11px] uppercase tracking-wider text-zinc-500">Finanças</p>
                {PAGINAS.map(p => (
                    <button key={p.id} type="button" onClick={() => setPagina(p.id)} aria-current={pagina === p.id ? 'page' : undefined}
                        className={`px-2 py-1.5 rounded-md text-sm text-left whitespace-nowrap ${pagina === p.id ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}>
                        {p.rotulo}
                    </button>
                ))}
            </nav>
            <main className="min-w-0">
                {erro && <p className="text-sm text-amber-400 mb-4">{erro}</p>}
                {!dados ? (
                    <p className="text-sm text-zinc-500">{carregando ? 'Carregando…' : ''}</p>
                ) : pagina === 'visao' ? (
                    <VisaoGeral dados={dados} recarregar={recarregar} filtrosIniciais={filtrosIniciais} />
                ) : null}
            </main>
        </div>
    );
}
```
(As Tarefas 12–14 acrescentam as outras três páginas em `PAGINAS` e no `main`; é por elas que `abrirVisaoGeral` passa a ser usado. Até lá, se o `tsc` acusar `abrirVisaoGeral` sem uso, prefixe com `void abrirVisaoGeral;` logo abaixo da declaração e tire essa linha na Tarefa 12.)

- [ ] **Step 4: Entrada provisória no menu**

Em `src/utils/navegacao.ts`:
- no tipo `View`, troque `| 'receivables' | 'finance' | 'envelopes'` por `| 'financas' | 'receivables' | 'finance' | 'envelopes'`;
- em `ROTULO_DA_VIEW`, acrescente `financas: 'Finanças v3',`;
- na seção `financas`, troque `views: ['receivables', 'finance', 'envelopes'],` por `views: ['financas', 'receivables', 'finance', 'envelopes'],`.

Em `src/utils/navegacao.test.ts`:
- na lista de views do topo (linha com `'receivables', 'finance', 'envelopes', ...`), acrescente `'financas',` antes de `'receivables'`;
- troque `assert.equal(viewInicialDaSecao('financas'), 'receivables');` por `assert.equal(viewInicialDaSecao('financas'), 'financas');`.

Em `src/components/layout/LateralDaSecao.tsx`, no `ICONE_DA_VIEW: Record<View, LucideIcon>` (é `Record`, então a entrada é obrigatória), logo abaixo de `finance: DollarSign,`, acrescente `financas: DollarSign,`.

Em `src/App.tsx`:
- abaixo de `const Envelopes = lazy(...)`, acrescente `const Financas = lazy(() => import('@/pages/financas/Financas'));`;
- no `switch`, antes de `case 'finance':`, acrescente
  `case 'financas': return <Financas buscaInicial={autoSearchTerm} limparBusca={() => setAutoSearchTerm('')} />;`.

- [ ] **Step 5: Tipos, suíte e verificação no navegador**

```bash
npx tsc --noEmit -p tsconfig.json
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
export MSYS_NO_PATHCONV=1
docker cp supabase/conferencia_financeiro_v3.sql supabase_db_botezini-v3:/tmp/c.sql
docker exec supabase_db_botezini-v3 psql -U postgres -f /tmp/c.sql
```
Expected: `tsc` sem saída; `# fail 0`.

Com `npm run dev:v3` de pé e logado com o usuário de teste, abra Finanças → "Finanças v3". Confira na tela, contra a saída da conferência:
- os quatro números batem com `receber_vencido`, `receber_7_dias`, `pagar_vencido`, `pagar_7_dias`;
- "Livre para usar" bate com `livre`;
- a nota de pedidos em produção bate com `em_producao`;
- clicar em "A receber · vencido" deixa a lista só com essas contas, agrupadas por "venceu há N dias"; clicar de novo limpa;
- "Recebi" numa conta abre a baixa já preenchida; com uma caixinha com % configurado, aparece "Guardar R$ X em …? sim · não";
- um banco com "N a conferir" abre a conferência;
- "+ Nova conta" → "A pagar" abre o formulário só com o básico e o link "+ mais opções";
- em 390 px de largura não há rolagem horizontal (`document.documentElement.scrollWidth <= innerWidth`);
- ligue o modo privacidade: todos os valores viram `••••••`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/financas/useDadosDasFinancas.ts src/pages/financas/Financas.tsx src/pages/financas/VisaoGeral.tsx src/utils/navegacao.ts src/utils/navegacao.test.ts src/components/layout/LateralDaSecao.tsx src/App.tsx
git commit -m "feat(financeiro): Visão geral do módulo Finanças v3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Resultado do mês

**Files:**
- Create: `src/pages/financas/ResultadoDoMes.tsx`
- Modify: `src/pages/financas/Financas.tsx` (página nova no menu)

**Interfaces:**
- Consumes: Task 4 (`caixaDoPeriodo`, `variacao`, `linhasDoRelatorio`), Task 5 (`vendasDoPeriodo`), Task 2 (`mesAnterior`, `proximoMes`, `nomeDoMes`, `mesDe`, `trimestreDe`, `nomeDoTrimestre`), `pdfService.generateExecutiveReport(dreData, periodStr, profile, topExpenses, kpis)`, `storageService.getCompanyProfile()`.
- Produces: `<ResultadoDoMes dados abrirVisaoGeral={(f: Partial<FiltrosDaLista>) => void} />`.

- [ ] **Step 1: A página**

`src/pages/financas/ResultadoDoMes.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import { pdfService } from '@/services/pdfService';
import { storageService } from '@/services/storage';
import { getTodayStr } from '@/utils/date';
import { mesAnterior, mesDe, nomeDoMes, nomeDoTrimestre, proximoMes, trimestreDe } from '@/utils/financas/base';
import { caixaDoPeriodo, linhasDoRelatorio, variacao } from '@/utils/financas/caixa';
import { vendasDoPeriodo } from '@/utils/financas/vendas';
import type { FiltrosDaLista } from '@/utils/financas/lista';

interface Props {
    dados: DadosDasFinancas;
    abrirVisaoGeral: (f: Partial<FiltrosDaLista>) => void;
}

/** A empresa deu lucro, quanto vendeu, e para onde foi o dinheiro? */
export function ResultadoDoMes({ dados, abrirVisaoGeral }: Props) {
    const { mostrar } = useMostrarValor();
    const [mes, setMes] = useState(mesDe(getTodayStr()));
    const [porTrimestre, setPorTrimestre] = useState(false);
    const [erroPdf, setErroPdf] = useState('');

    /** Anda n meses (n negativo volta). */
    const andar = (m: string, n: number) => {
        let r = m;
        for (let i = 0; i < Math.abs(n); i++) r = n < 0 ? mesAnterior(r) : proximoMes(r);
        return r;
    };
    const passo = porTrimestre ? 3 : 1;
    const meses = porTrimestre ? trimestreDe(mes) : [mes];
    const mesesAnteriores = porTrimestre ? trimestreDe(andar(mes, -3)) : [mesAnterior(mes)];
    const rotulo = porTrimestre ? nomeDoTrimestre(mes) : nomeDoMes(mes);
    const rotuloAnterior = porTrimestre ? nomeDoTrimestre(andar(mes, -3)) : nomeDoMes(mesAnterior(mes)).split(' ')[0];
    const chave = meses.join(',');

    const caixa = useMemo(() => caixaDoPeriodo({ pagamentos: dados.pagamentos, contas: dados.contas, categorias: dados.categorias, meses }), [dados, chave]);
    const anterior = useMemo(() => caixaDoPeriodo({ pagamentos: dados.pagamentos, contas: dados.contas, categorias: dados.categorias, meses: mesesAnteriores }), [dados, chave]);
    const vendas = useMemo(() => vendasDoPeriodo({ pedidos: dados.pedidos, contas: dados.contas, meses }), [dados, chave]);
    const delta = variacao(caixa.lucro, anterior.lucro);
    const maior = caixa.porCategoria[0]?.valor || 1;

    const exportar = async () => {
        setErroPdf('');
        try {
            pdfService.generateExecutiveReport(
                linhasDoRelatorio(caixa), rotulo, await storageService.getCompanyProfile(),
                caixa.porCategoria.map(f => ({ name: f.nome, value: f.valor })),
                { revenue: caixa.entrou, expenses: caixa.despesas, ebitda: caixa.sobrouDaProducao - caixa.despesas, result: caixa.lucro });
        } catch (e) {
            setErroPdf(e instanceof Error ? e.message : 'Não consegui gerar o PDF.');
        }
    };

    const categoriaPorNome = new Map(dados.categorias.map(c => [c.name, c.id]));
    const linha = (rotulo: string, valor: number, tom = 'text-zinc-500') => (
        <div className={`flex justify-between gap-3 py-1.5 tabular-nums ${tom}`}><span>{rotulo}</span><span>{mostrar(valor)}</span></div>
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-white">Resultado do mês</h1>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex rounded-lg border border-zinc-800 overflow-hidden text-xs">
                        <button type="button" onClick={() => setPorTrimestre(false)} aria-pressed={!porTrimestre}
                            className={`px-2.5 py-1 ${!porTrimestre ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}>Mês</button>
                        <button type="button" onClick={() => setPorTrimestre(true)} aria-pressed={porTrimestre}
                            className={`px-2.5 py-1 ${porTrimestre ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400'}`}>Trimestre</button>
                    </span>
                    <button type="button" onClick={() => setMes(andar(mes, -passo))} className="px-2 text-zinc-400 hover:text-white" aria-label="Período anterior">‹</button>
                    <span className="min-w-36 text-center text-zinc-200">{rotulo}</span>
                    <button type="button" onClick={() => setMes(andar(mes, passo))} className="px-2 text-zinc-400 hover:text-white" aria-label="Próximo período">›</button>
                    <button type="button" onClick={exportar} className="ml-2 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800">Exportar PDF</button>
                </div>
            </div>
            {erroPdf && <p className="text-sm text-amber-400">{erroPdf}</p>}
            {dados.pagamentosIncompletos && (
                <p className="text-sm text-amber-400">Há mais de 5.000 pagamentos: os meses mais antigos podem estar incompletos.</p>
            )}

            <div className="grid gap-8 lg:grid-cols-2">
                <section className="min-w-0">
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{porTrimestre ? 'Caixa do trimestre' : 'Caixa do mês'}</h2>
                    {linha('Entrou', caixa.entrou, 'text-zinc-200')}
                    {linha('− impostos', caixa.impostos)}
                    {linha('− custo das peças', caixa.custoPecas)}
                    <div className="flex justify-between gap-3 py-2 border-t border-zinc-800 font-semibold tabular-nums text-zinc-200">
                        <span>Sobrou da produção</span>
                        <span>{mostrar(caixa.sobrouDaProducao)}{caixa.percentualDaProducao !== null && <span className="ml-2 text-xs text-zinc-500">{caixa.percentualDaProducao}%</span>}</span>
                    </div>
                    {linha('− despesas da empresa', caixa.despesas)}
                    {linha('− juros e tarifas', caixa.financeiras)}
                    <div className="flex justify-between gap-3 pt-3 mt-1 border-t-2 border-zinc-200 text-lg font-semibold tabular-nums">
                        <span className="text-white">Lucro de caixa</span>
                        <span className={caixa.lucro < 0 ? 'text-amber-400' : 'text-emerald-400'}>{mostrar(caixa.lucro)}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        {rotuloAnterior} {mostrar(anterior.lucro)} · {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}%`}
                    </p>

                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 mt-8 mb-2">{porTrimestre ? 'Vendas do trimestre' : 'Vendas do mês'} (pela entrega)</h2>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                        <div><p className="text-xs text-zinc-500">Pedidos entregues</p><p className="text-lg font-semibold tabular-nums">{vendas.pedidos}</p></div>
                        <div><p className="text-xs text-zinc-500">Peças</p><p className="text-lg font-semibold tabular-nums">{vendas.pecas}</p></div>
                        <div><p className="text-xs text-zinc-500">Vendido</p><p className="text-lg font-semibold tabular-nums">{mostrar(vendas.vendido)}</p></div>
                    </div>
                    <p className="flex justify-between gap-3 mt-3 pt-2 border-t border-dashed border-zinc-800 text-xs text-zinc-500">
                        <span>Recebido antecipado de pedidos ainda não entregues</span>
                        <span className="tabular-nums">{mostrar(vendas.recebidoAntecipado)}</span>
                    </p>
                </section>

                <section className="min-w-0">
                    <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Para onde foi o dinheiro</h2>
                    {caixa.porCategoria.length === 0 && <p className="text-sm text-zinc-500">Nenhuma saída neste mês.</p>}
                    {caixa.porCategoria.map(f => {
                        const id = categoriaPorNome.get(f.nome);
                        return (
                            <button key={f.nome} type="button" disabled={!id}
                                onClick={() => id && abrirVisaoGeral({ categoriaId: id, mes: porTrimestre ? null : mes, rapido: 'todas' })}
                                className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 py-1.5 text-left text-sm disabled:cursor-default">
                                <span className="truncate text-zinc-300">{f.nome}</span>
                                <span className="h-2 rounded-sm bg-zinc-300/80" style={{ width: `${Math.max(2, (f.valor / maior) * 100)}%` }} />
                                <span className="text-right tabular-nums text-zinc-300">{mostrar(f.valor)}</span>
                            </button>
                        );
                    })}
                    <p className="text-xs text-zinc-500 mt-2">Clicar numa barra abre a Visão geral filtrada por aquela categoria.</p>
                </section>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Ligar no menu do módulo**

Em `src/pages/financas/Financas.tsx`:
- acrescente `import { ResultadoDoMes } from './ResultadoDoMes';`;
- em `PAGINAS`, acrescente `{ id: 'resultado', rotulo: 'Resultado do mês' },`;
- no `main`, troque `) : null}` por:
  ```tsx
                ) : pagina === 'resultado' ? (
                    <ResultadoDoMes dados={dados} abrirVisaoGeral={abrirVisaoGeral} />
                ) : null}
  ```

- [ ] **Step 3: Tipos e verificação**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: sem saída. No navegador (usuário de teste): Resultado do mês mostra setembro/outubro com as linhas do caixa; trocar de mês muda os números; "Trimestre" mostra "3º trimestre 2026" com o "Entrou" igual à soma de julho, agosto e setembro, e as setas andam de três em três meses; "Exportar PDF" baixa o PDF; clicar numa barra volta à Visão geral filtrada por categoria e mês. Confira o "Entrou" de um mês contra:
```bash
docker exec supabase_db_botezini-v3 psql -U postgres -tAc "select sum(case when p.reversal_of is null then p.amount else -p.amount end) from obligation_payments p join financial_obligations o on o.id = p.obligation_id where o.type = 'receivable' and coalesce(p.affects_balance, true) and to_char(p.payment_date, 'YYYY-MM') = '2026-09'"
```
Expected: igual ao "Entrou" de setembro 2026.

- [ ] **Step 4: Commit**

```bash
git add src/pages/financas/ResultadoDoMes.tsx src/pages/financas/Financas.tsx
git commit -m "feat(financeiro): Resultado do mês com caixa e vendas pela entrega

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Caixinhas

**Files:**
- Create: `src/components/financas/caixinhas/FormularioDaCaixinha.tsx`, `ExtratoDaCaixinha.tsx`, `TransferirEntreCaixinhas.tsx`
- Create: `src/pages/financas/Caixinhas.tsx`
- Modify: `src/pages/financas/Financas.tsx`

**Interfaces:**
- Consumes: `useEnvelopes()` → `{ envelopes, overview, error, reload, saveEnvelope, deleteEnvelope, move, transfer, getMovements, loading, busy }`; Task 5 (`progressoDaMeta`); Task 8 (`useMostrarValor`).
- Produces: `<Caixinhas aoMudar={() => void} />`.

- [ ] **Step 1: Mover as janelas das caixinhas para arquivos próprios**

De `src/components/finance/EnvelopesPanel.tsx`, copie sem mudar o corpo:
- `function ExtratoModal` (linhas 331–382, junto com `const KIND_LABEL`) para `src/components/financas/caixinhas/ExtratoDaCaixinha.tsx`, exportado como `export function ExtratoDaCaixinha` (mesmas props), com os imports de que precisa: `useState`, `useEffect`, `createPortal`, `X` de `lucide-react`, `formatCurrency` de `@/utils`, `CashEnvelope`, `EnvelopeMovement` de `@/types/finance`;
- `function TransferModal` (linhas 384–434) para `src/components/financas/caixinhas/TransferirEntreCaixinhas.tsx`, exportado como `export function TransferirEntreCaixinhas`, com `useState`, `createPortal`, `X`, `formatCurrency`, `parseBRL` de `@/utils/currency`, `CashEnvelope`, `SearchableSelect` de `@/components/common`;
- `function EnvelopeForm` (linhas 223–329) para `src/components/financas/caixinhas/FormularioDaCaixinha.tsx`, exportado como `export function FormularioDaCaixinha`, com estas mudanças:
  - apague os estados `targetDate` e `minBalance` e as linhas `target_date: …` e `min_balance: …` do `onSave` (o banco mantém as colunas; a tela deixa de pedir);
  - apague o `div` de "Prazo da meta" e o `div` de "Saldo mínimo (alerta)"; o campo "Meta (R$)" e o de "Provisionar (% auto)" ficam lado a lado no mesmo `grid grid-cols-2`;
  - no rótulo "Provisionar (% auto)" troque o texto do `InfoTooltip` por: `% de cada recebimento que o "Recebi" sugere guardar aqui. Deixe 0 para nunca sugerir.`;
  - copie também `const COLORS` e `const PURPOSES` para o topo do arquivo.

`EnvelopesPanel.tsx` fica intacto até a Tarefa 15 (que o apaga).

- [ ] **Step 2: A página**

`src/pages/financas/Caixinhas.tsx`:
```tsx
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common';
import { useEnvelopes } from '@/hooks/finance/useEnvelopes';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { parseBRL } from '@/utils/currency';
import { progressoDaMeta } from '@/utils/financas/caixinhas';
import type { CashEnvelope } from '@/types/finance';
import { FormularioDaCaixinha } from '@/components/financas/caixinhas/FormularioDaCaixinha';
import { ExtratoDaCaixinha } from '@/components/financas/caixinhas/ExtratoDaCaixinha';
import { TransferirEntreCaixinhas } from '@/components/financas/caixinhas/TransferirEntreCaixinhas';

/** Quanto do que está no banco já tem destino, e quanto está livre? */
export function Caixinhas({ aoMudar }: { aoMudar: () => void }) {
    const env = useEnvelopes();
    const { mostrar } = useMostrarValor();
    const [editando, setEditando] = useState<Partial<CashEnvelope> | null>(null);
    const [extrato, setExtrato] = useState<CashEnvelope | null>(null);
    const [transferindo, setTransferindo] = useState<CashEnvelope | null>(null);
    const [excluindo, setExcluindo] = useState<CashEnvelope | null>(null);
    const [movendo, setMovendo] = useState<{ id: string; sinal: 1 | -1 } | null>(null);
    const [valor, setValor] = useState('');

    const depois = async (acao: () => Promise<unknown>) => { await acao(); aoMudar(); };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-white">Caixinhas</h1>
                <button type="button" onClick={() => setEditando({ target_amount: 0 })}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-zinc-950 bg-zinc-100 hover:bg-white">+ Nova caixinha</button>
            </div>

            <section className="flex flex-wrap gap-x-10 gap-y-3 pb-5 border-b border-zinc-800">
                <div><p className="text-xs text-zinc-500">Livre para usar</p>
                    <p className={`text-3xl font-semibold tabular-nums ${env.overview.free < 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(env.overview.free)}</p></div>
                <div><p className="text-xs text-zinc-500">Nas caixinhas</p><p className="text-3xl font-semibold tabular-nums text-zinc-400">{mostrar(env.overview.allocated)}</p></div>
                <div><p className="text-xs text-zinc-500">Nos bancos</p><p className="text-3xl font-semibold tabular-nums text-zinc-400">{mostrar(env.overview.total_real)}</p></div>
            </section>

            {env.error && <p className="text-sm text-amber-400">{env.error}</p>}
            {env.loading ? <p className="text-sm text-zinc-500">Carregando…</p> : env.envelopes.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-500">Nenhuma caixinha ainda — crie a primeira para separar seu dinheiro.</p>
            ) : (
                <ul>
                    {env.envelopes.map(c => {
                        const meta = progressoDaMeta(c);
                        const pct = Number(c.auto_fund_pct) || 0;
                        const aberto = movendo?.id === c.id;
                        return (
                            <li key={c.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_8rem_10rem_auto] items-center gap-3 py-3 border-t border-zinc-800">
                                <button type="button" onClick={() => setEditando(c)} className="text-left min-w-0">
                                    <span className="block text-sm font-medium text-zinc-100 truncate">{c.name}</span>
                                    <span className="block text-xs text-zinc-500">{pct > 0 ? `guarda ${pct}% de cada recebimento` : 'manual'}</span>
                                </button>
                                <span className="tabular-nums text-sm text-zinc-100">{mostrar(c.balance)}</span>
                                <span className="text-xs text-zinc-500">
                                    {meta ? (<>
                                        <span className="block h-1.5 rounded-full bg-zinc-800 overflow-hidden"><span className="block h-full bg-zinc-300/80" style={{ width: `${meta.percentual}%` }} /></span>
                                        {meta.percentual}% de {mostrar(meta.meta)}
                                    </>) : 'sem meta'}
                                </span>
                                <span className="flex flex-wrap gap-3 text-xs text-amber-400">
                                    <button type="button" onClick={() => { setMovendo({ id: c.id, sinal: 1 }); setValor(''); }}>guardar</button>
                                    <button type="button" onClick={() => { setMovendo({ id: c.id, sinal: -1 }); setValor(''); }}>tirar</button>
                                    <button type="button" onClick={() => setExtrato(c)}>extrato</button>
                                    <button type="button" onClick={() => setExcluindo(c)} className="text-zinc-500">excluir</button>
                                </span>
                                {aberto && (
                                    <div className="sm:col-span-4 flex items-center gap-2">
                                        <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" autoFocus
                                            className="w-32 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums" />
                                        <button type="button" disabled={env.busy || parseBRL(valor) <= 0}
                                            onClick={() => depois(async () => { await env.move(c.id, movendo!.sinal * parseBRL(valor)); setMovendo(null); })}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-950 bg-emerald-500 disabled:opacity-40">
                                            {movendo!.sinal > 0 ? 'Guardar' : 'Tirar'}
                                        </button>
                                        <button type="button" onClick={() => setMovendo(null)} className="text-xs text-zinc-500">cancelar</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="text-xs text-zinc-500">Transferir entre caixinhas fica no extrato de cada uma. Nenhuma caixinha move dinheiro de verdade: é um rótulo sobre o saldo dos bancos.</p>

            {editando && <FormularioDaCaixinha initial={editando} busy={env.busy}
                onSave={data => depois(async () => { await env.saveEnvelope(data); setEditando(null); })}
                onClose={() => setEditando(null)} />}
            {extrato && <ExtratoDaCaixinha envelope={extrato} getMovements={env.getMovements} onClose={() => setExtrato(null)} />}
            {extrato && env.envelopes.length > 1 && (
                <button type="button" onClick={() => { setTransferindo(extrato); setExtrato(null); }}
                    className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-xl text-sm bg-zinc-800 text-zinc-100">Transferir desta caixinha</button>
            )}
            {transferindo && <TransferirEntreCaixinhas from={transferindo} others={env.envelopes.filter(e => e.id !== transferindo.id)} busy={env.busy}
                onConfirm={(para, quanto) => depois(async () => { await env.transfer(transferindo.id, para, quanto); setTransferindo(null); })}
                onClose={() => setTransferindo(null)} />}
            <ConfirmDialog isOpen={!!excluindo} title="Excluir caixinha" variant="danger" confirmLabel="Excluir" isLoading={env.busy}
                message={excluindo ? `Excluir "${excluindo.name}"? O valor reservado volta para o livre.` : ''}
                onConfirm={() => depois(async () => { if (excluindo) { await env.deleteEnvelope(excluindo.id); setExcluindo(null); } })}
                onCancel={() => setExcluindo(null)} />
        </div>
    );
}
```

- [ ] **Step 3: Ligar no menu do módulo**

Em `src/pages/financas/Financas.tsx`: `import { Caixinhas } from './Caixinhas';`; em `PAGINAS` acrescente `{ id: 'caixinhas', rotulo: 'Caixinhas' },`; no `main`, antes de `) : null}`, acrescente
```tsx
                ) : pagina === 'caixinhas' ? (
                    <Caixinhas aoMudar={() => { void recarregar(); }} />
```

- [ ] **Step 4: Tipos, verificação e commit**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: sem saída. No navegador: o "Livre para usar" da página é igual ao da Visão geral; guardar R$ 10 numa caixinha baixa o livre em R$ 10 nas duas páginas; o formulário não tem mais prazo nem saldo mínimo; o extrato abre e oferece transferir.

```bash
git add src/components/financas/caixinhas src/pages/financas/Caixinhas.tsx src/pages/financas/Financas.tsx
git commit -m "feat(financeiro): página Caixinhas com livre para usar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Clientes que devem

**Files:**
- Create: `src/pages/financas/ClientesQueDevem.tsx`
- Modify: `src/pages/financas/Financas.tsx`

**Interfaces:**
- Consumes: Task 7 (`clientesQueDevem`), `msgCobrancaVencida`, `linkDoWhatsApp` de `src/utils/mensagensCliente.ts`, `BotaoMensagem` (como o kanban usa) — ou link direto.
- Produces: `<ClientesQueDevem dados abrirVisaoGeral />`.

- [ ] **Step 1: A página**

`src/pages/financas/ClientesQueDevem.tsx`:
```tsx
import { useMemo } from 'react';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';
import { getTodayStr } from '@/utils/date';
import { linkDoWhatsApp, msgCobrancaVencida } from '@/utils/mensagensCliente';
import { clientesQueDevem } from '@/utils/financas/clientes';
import type { FiltrosDaLista } from '@/utils/financas/lista';

interface Props {
    dados: DadosDasFinancas;
    abrirVisaoGeral: (f: Partial<FiltrosDaLista>) => void;
}

/** Quem eu cobro, e quanto cada um ainda vai pagar? */
export function ClientesQueDevem({ dados, abrirVisaoGeral }: Props) {
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const linhas = useMemo(() => clientesQueDevem(dados.contas, hoje), [dados.contas, hoje]);
    const clientes = useMemo(() => new Map(dados.clientes.map(c => [c.id, c])), [dados.clientes]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-white">Clientes que devem</h1>
                <span className="text-xs text-zinc-500">ordenado por quem está há mais tempo vencido</span>
            </div>
            {linhas.length === 0 ? <p className="py-10 text-center text-sm text-zinc-500">Ninguém devendo.</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-zinc-500 text-left">
                                <th className="py-2 pr-3 font-normal">Cliente</th>
                                <th className="py-2 pr-3 font-normal text-right">Vencido</th>
                                <th className="py-2 pr-3 font-normal text-right">A vencer</th>
                                <th className="py-2 pr-3 font-normal text-right">Em produção</th>
                                <th className="py-2 font-normal" />
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map(l => {
                                const cliente = clientes.get(l.clienteId);
                                const maisAntiga = [...l.vencidas].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                                const link = maisAntiga && cliente ? linkDoWhatsApp(cliente.phone, msgCobrancaVencida(cliente,
                                    { description: l.vencidas.length > 1 ? `${l.vencidas.length} parcelas` : maisAntiga.description, remaining_amount: l.vencido, due_date: maisAntiga.due_date },
                                    l.diasDoMaisAntigo ?? undefined)) : null;
                                return (
                                    <tr key={l.clienteId} className="border-t border-zinc-800">
                                        <td className="py-2.5 pr-3">
                                            <button type="button" onClick={() => abrirVisaoGeral({ clienteId: l.clienteId, rapido: 'abertas' })} className="text-left">
                                                <span className="block text-zinc-100">{cliente?.company_name ?? 'Cliente'}</span>
                                                <span className="block text-xs text-zinc-500">{l.diasDoMaisAntigo === null ? 'nada vencido' : `mais antigo: ${l.diasDoMaisAntigo} dias`}</span>
                                            </button>
                                        </td>
                                        <td className={`py-2.5 pr-3 text-right tabular-nums ${l.vencido > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>{l.vencido > 0 ? mostrar(l.vencido) : '—'}</td>
                                        <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-200">{l.aVencer > 0 ? mostrar(l.aVencer) : '—'}</td>
                                        <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-500">{l.emProducao > 0 ? mostrar(l.emProducao) : '—'}</td>
                                        <td className="py-2.5 text-right">
                                            {l.vencido > 0 && (link
                                                ? <a href={link} target="_blank" rel="noreferrer" className="text-xs text-amber-400 hover:text-amber-300">Cobrar</a>
                                                : <span className="text-xs text-zinc-600" title="Cliente sem telefone cadastrado">sem telefone</span>)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-zinc-500">"Em produção" é informativo: não é cobrança nem atraso. Vira "a vencer" quando o pedido for entregue.</p>
        </div>
    );
}
```

- [ ] **Step 2: Ligar no menu do módulo**

Em `src/pages/financas/Financas.tsx`: `import { ClientesQueDevem } from './ClientesQueDevem';`; em `PAGINAS` acrescente `{ id: 'clientes', rotulo: 'Clientes que devem' },`; no `main`, antes de `) : null}`, acrescente
```tsx
                ) : pagina === 'clientes' ? (
                    <ClientesQueDevem dados={dados} abrirVisaoGeral={abrirVisaoGeral} />
```

- [ ] **Step 3: Tipos, verificação e commit**

```bash
npx tsc --noEmit -p tsconfig.json
docker exec supabase_db_botezini-v3 psql -U postgres -tAc "select c.company_name, sum(os.remaining_amount) filter (where os.due_date < current_date) from obligation_summary os join clients c on c.id = os.client_id where os.type = 'receivable' and os.derived_status <> 'cancelled' and os.remaining_amount > 0 and not os.awaiting_delivery group by 1 order by 2 desc nulls last limit 5"
```
Expected: `tsc` sem saída; os vencidos por cliente da tela batem com a consulta. Clicar num cliente abre a Visão geral filtrada por ele, mostrando também as parcelas aguardando entrega. "Cobrar" abre o WhatsApp com a mensagem de cobrança.

```bash
git add src/pages/financas/ClientesQueDevem.tsx src/pages/financas/Financas.tsx
git commit -m "feat(financeiro): página Clientes que devem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Menu e retirada das telas antigas

> **Depende do redesenho da navegação por objetivos** (o próximo brainstorm). Esta tarefa liga o módulo na seção **Finanças** de hoje e tira as telas velhas; se o desenho da navegação mudar onde o Finanças mora, um plano daquele desenho move o módulo — o conteúdo das páginas não muda.

**Files:**
- Modify: `src/utils/navegacao.ts`, `src/utils/navegacao.test.ts`, `src/components/layout/LateralDaSecao.tsx`, `src/App.tsx`, `src/utils/alertasOperacionais.ts`, `src/pages/Dashboard.tsx`, `src/pages/Orders.tsx`
- Delete: `src/pages/Finance.tsx`, `src/components/finance/ReceivablesControlPanel.tsx`, `src/components/finance/EnvelopesPanel.tsx`, `src/components/finance/CashSimulator.tsx`, `src/components/finance/SaudeDoCaixaPanel.tsx`

- [ ] **Step 1: Navegação**

Em `src/utils/navegacao.ts`: no tipo `View`, troque `| 'financas' | 'receivables' | 'finance' | 'envelopes'` por `| 'financas'`; em `ROTULO_DA_VIEW`, apague `receivables`, `finance` e `envelopes` e troque `financas: 'Finanças v3'` por `financas: 'Finanças'`; na seção `financas`, `views: ['financas'],`.

Em `src/utils/navegacao.test.ts`: tire `'receivables', 'finance', 'envelopes'` da lista do topo; troque as asserções que citam essas views (`secaoDaView('finance')`, `secaoDaView('receivables')`, `secaoDaView('envelopes')`, `v.indexOf('receivables') < v.indexOf('finance')`) por uma só:
```ts
    assert.equal(secaoDaView('financas'), 'financas');
```

Em `src/components/layout/LateralDaSecao.tsx`, apague `receivables`, `finance` e `envelopes` do mapa de ícones.

Em `src/App.tsx`: apague os `lazy` de `Finance`, `Receivables` e `Envelopes` e os três `case` deles.

- [ ] **Step 2: Quem apontava para as telas antigas**

- `src/utils/alertasOperacionais.ts`: no tipo `DestinoDoAlerta`, troque `'receivables' | 'finance'` por `'financas'`; troque cada `destino: 'finance'` e `destino: 'receivables'` por `destino: 'financas'`.
- `src/pages/Orders.tsx`: no tipo de `onNavigate`, troque `'finance'` por `'financas'`; em `onNavigate('finance', …)` troque por `onNavigate('financas', …)`.
- `src/pages/Dashboard.tsx`: no tipo de `onNavigate`, troque `'receivables'` por `'financas'`; troque toda chamada `onNavigate('receivables'…)` por `onNavigate('financas'…)`. Tire as abas `'caixa'` e `'dre'`: do array `(['overview', 'caixa', 'dre', 'products'] as const)` deixe `(['overview', 'products'] as const)`, ajuste o rótulo da linha 458 para `tab === 'overview' ? 'Visão Geral' : 'Produtos & Mercado'`, apague os blocos `{activeTab === 'caixa' && …}` e `{activeTab === 'dre' && ( … )}` inteiros, o import de `SaudeDoCaixaPanel` e, no `useState` de `activeTab`, os tipos `'dre' | 'costs' | 'caixa'`. O cálculo `dreData` **fica** — os cartões da Visão Geral do Início ainda o usam; ele sai quando o Início for redesenhado.
- Rode `grep -rn "'receivables'\|'envelopes'\|onNavigate('finance'" src --include=*.ts --include=*.tsx` e corrija o que sobrar (os `'finance'` de domínio de categoria — `getGlobalCategories('finance')`, `DominioDeCategoria`, `Setor` — **não** são views e ficam).

- [ ] **Step 3: Apagar as telas antigas**

```bash
git rm src/pages/Finance.tsx src/components/finance/ReceivablesControlPanel.tsx src/components/finance/EnvelopesPanel.tsx src/components/finance/CashSimulator.tsx src/components/finance/SaudeDoCaixaPanel.tsx
grep -rn "CashSimulator\|SaudeDoCaixaPanel\|ReceivablesControlPanel\|EnvelopesPanel\|pages/Finance'" src --include=*.ts --include=*.tsx
```
Expected: o `grep` não encontra nada. Se algum barrel (`components/finance/index.ts`) reexportar um deles, apague a linha.

- [ ] **Step 4: Tipos, suíte e verificação**

```bash
npx tsc --noEmit -p tsconfig.json
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
```
Expected: `tsc` sem saída; `# fail 0`. No navegador: a seção Finanças tem uma entrada só, "Finanças", que abre a Visão geral; os alertas do Início com destino financeiro abrem o Finanças; Pedidos → "ver no financeiro" abre a Visão geral com a busca do pedido; o Início não tem mais as abas Saúde do Caixa e DRE.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(financeiro): Finanças substitui Financeiro, Recebíveis e Caixinhas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Status "Concluído" sai, e conferência final

**Files:**
- Modify: `src/types/index.ts` (enum `OrderStatus`), `src/components/orders/OrderPreviewModal.tsx`, `src/hooks/useOrders.ts`, `src/pages/Orders.tsx`, `src/repositories/productionRepository.ts`, `src/utils/finance.ts`

- [ ] **Step 1: Tirar o membro do enum**

Em `src/types/index.ts`, apague a linha `COMPLETED = 'Concluído',` do `enum OrderStatus`.

- [ ] **Step 2: Corrigir cada uso que o tsc acusar**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: erros exatamente nestes pontos, corrigidos assim:
- `OrderPreviewModal.tsx:39` e `:49`: apague os `case OrderStatus.COMPLETED: …`;
- `OrderPreviewModal.tsx:92`: troque `order.status === OrderStatus.COMPLETED ? <CheckCircle size={12} /> : ` por nada (deixe só o resto da expressão);
- `useOrders.ts:85`: apague a linha `if (status === OrderStatus.COMPLETED) return 2;`;
- `Orders.tsx:231`: apague `{ value: OrderStatus.COMPLETED, label: OrderStatus.COMPLETED },`;
- `productionRepository.ts:101`: troque `if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.COMPLETED) {` por `if (order.status === OrderStatus.DELIVERED) {`;
- `finance.ts:124`: apague `&& o.status !== OrderStatus.COMPLETED` (a linha anterior termina em `o.status !== OrderStatus.DELIVERED`).
Os textos `'Concluído'` em `alertasOperacionais.ts` (`ENCERRADOS`) ficam: toleram dado antigo, que não existe na base mas não custa nada aceitar.

Run de novo: `npx tsc --noEmit -p tsconfig.json` → sem saída.

- [ ] **Step 3: Conferência final**

```bash
node --test --experimental-strip-types "src/**/*.test.ts" 2>&1 | tail -4
npx tsc --noEmit -p tsconfig.json
export MSYS_NO_PATHCONV=1
docker cp supabase/conferencia_financeiro_v3.sql supabase_db_botezini-v3:/tmp/c.sql
docker exec supabase_db_botezini-v3 psql -U postgres -f /tmp/c.sql
```
Expected: `# fail 0` com os testes novos somados aos 1.310; `tsc` sem saída; os números da conferência iguais aos da Visão geral na tela, no mesmo dia. Passe pelas quatro páginas em 1440, 1024 e 390 px de largura sem rolagem horizontal, e com o modo privacidade ligado.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "refactor(pedidos): status Concluído sai do enum (nenhum fluxo chegava nele)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

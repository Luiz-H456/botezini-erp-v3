-- =============================================================================
-- MIGRAÇÃO — Passo 3: gerar as contas a receber
-- Rode no Supabase de DESTINO, DEPOIS de colar os INSERTs do passo 2.
--
-- ⚠️ REESCRITO depois de analisar seus dados reais.
--
-- A versão anterior montava a conta a partir de budgets.down_payment_value:
-- gerava uma parcela "Entrada" em aberto + uma "Restante". Isso estava ERRADO,
-- porque os pedidos já trazem `amount_paid` preenchido — R$ 70.034,79 dos
-- R$ 170.222,54 em aberto JÁ FORAM RECEBIDOS. Gerar a entrada como conta
-- aberta teria inventado R$ 70 mil de dívida que não existe.
--
-- REGRA AGORA
--   · só pedido em aberto (Pendente / Em Produção) — decisão sua
--   · UMA conta por pedido, no valor que realmente falta receber:
--         total_amount - amount_paid
--   · pedido com saldo zero não gera conta nenhuma
--
-- O que já foi recebido não vira lançamento aqui: o sistema de pagamento
-- antigo não está sendo migrado, então o ERP começa a contar a partir do
-- saldo devedor. O histórico de recebimento fica no sistema antigo.
--
-- Idempotente: não duplica conta para pedido que já tem uma.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 — Conferência ANTES de gravar. Rode sozinho.
--       Pelos dados de produção, deve dar 24 pedidos e R$ 100.187,75.
-- ---------------------------------------------------------------------------
SELECT
  o.order_number                                   AS pedido,
  c.company_name                                   AS cliente,
  o.status,
  o.deadline                                       AS vencimento,
  o.total_amount                                   AS total,
  o.amount_paid                                    AS ja_recebido,
  o.total_amount - COALESCE(o.amount_paid, 0)      AS a_receber,
  CASE WHEN o.deadline < CURRENT_DATE THEN 'VENCIDO' ELSE 'a vencer' END AS situacao
FROM public.orders o
JOIN public.clients c ON c.id::text = o.client_id::text
WHERE o.status IN ('Pendente', 'Em Produção')
  AND o.total_amount - COALESCE(o.amount_paid, 0) > 0
ORDER BY o.deadline;

-- Totais da conferência
SELECT
  count(*)                                                   AS pedidos,
  sum(o.total_amount)                                        AS valor_dos_pedidos,
  sum(COALESCE(o.amount_paid, 0))                            AS ja_recebido,
  sum(o.total_amount - COALESCE(o.amount_paid, 0))           AS sera_lancado,
  count(*) FILTER (WHERE o.deadline < CURRENT_DATE)          AS nascem_vencidos
FROM public.orders o
WHERE o.status IN ('Pendente', 'Em Produção')
  AND o.total_amount - COALESCE(o.amount_paid, 0) > 0;


-- ---------------------------------------------------------------------------
-- 3.2 — Gravar. Só depois de conferir o 3.1.
-- ---------------------------------------------------------------------------
INSERT INTO public.financial_obligations
  (type, status, description, original_amount, due_date, issue_date,
   client_id, order_id, notes)
SELECT
  'receivable',
  'open',
  'Saldo — Pedido ' || o.order_number,
  o.total_amount - COALESCE(o.amount_paid, 0),
  o.deadline,
  COALESCE(o.created_at::date, CURRENT_DATE),
  o.client_id,
  o.id,
  'Gerado na migração. Total do pedido R$ ' || o.total_amount
    || ', ja recebido R$ ' || COALESCE(o.amount_paid, 0)
    || ' no sistema anterior.'
FROM public.orders o
WHERE o.status IN ('Pendente', 'Em Produção')
  AND o.total_amount - COALESCE(o.amount_paid, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_obligations f
    WHERE f.order_id::text = o.id::text);


-- ---------------------------------------------------------------------------
-- 3.3 — Resultado
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                          AS contas_criadas,
  sum(original_amount)                              AS total_a_receber,
  count(*) FILTER (WHERE due_date < CURRENT_DATE)   AS ja_vencidas,
  sum(original_amount) FILTER (WHERE due_date < CURRENT_DATE) AS valor_vencido,
  min(due_date)                                     AS vencimento_mais_antigo,
  max(due_date)                                     AS vencimento_mais_novo
FROM public.financial_obligations
WHERE notes LIKE 'Gerado na migração%';

-- =============================================================================
-- ESPERE VER CONTA VENCIDA — e não é bug.
-- Pelos dados de produção, 11 dos 24 pedidos já passaram do prazo de entrega,
-- somando R$ 60.608,34 em aberto. Os prazos venceram de fato; o financeiro
-- só está mostrando a realidade. O maior é o PED-BZ-2026-021: R$ 20.394,00,
-- vencido em 14/07 e sem nenhuma entrada recebida.
-- =============================================================================

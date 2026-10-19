-- =============================================================================
-- Órfãos deixados pela exclusão de pedidos/orçamentos
--
-- CAUSA RAIZ
-- financial_obligations.order_id e .client_id são ON DELETE SET NULL.
-- Apagar o pedido NÃO apaga a conta: ela sobrevive com order_id = NULL,
-- status 'open' e a data de vencimento original. Resultado: recebível
-- fantasma, vencido, sem pedido e sem cliente — exatamente o que você viu.
--
-- Há ainda uma segunda amarração, legada: algumas contas guardam o id do
-- pedido no campo `notes` em vez de order_id (ver ensureReceivableForDelivered
-- OrderNoRepositório). Essas nem SET NULL sofrem — ficam apontando para um
-- pedido que não existe mais. O diagnóstico abaixo pega os dois casos.
--
-- production_logs e invoices são ON DELETE CASCADE: esses se limpam sozinhos.
-- =============================================================================


-- =============================================================================
-- PASSO 1 — DIAGNÓSTICO (somente leitura). Rode e me mande o resultado.
-- =============================================================================

-- A) Panorama do financeiro
SELECT 'contas totais'                       AS metrica, count(*)::text AS valor FROM public.financial_obligations
UNION ALL SELECT 'contas SEM pedido (order_id nulo)', count(*)::text
          FROM public.financial_obligations WHERE order_id IS NULL
UNION ALL SELECT 'contas SEM cliente',        count(*)::text
          FROM public.financial_obligations WHERE client_id IS NULL
UNION ALL SELECT 'contas com pedido INEXISTENTE', count(*)::text
          FROM public.financial_obligations f
          WHERE f.order_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text)
UNION ALL SELECT 'contas apontando pedido via notes (legado)', count(*)::text
          FROM public.financial_obligations f
          WHERE f.notes ~ '^[0-9a-f-]{36}$'
            AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.notes)
UNION ALL SELECT 'contas ABERTAS e vencidas', count(*)::text
          FROM public.financial_obligations
          WHERE status = 'open' AND due_date < CURRENT_DATE
UNION ALL SELECT 'pagamentos registrados',    count(*)::text FROM public.obligation_payments
UNION ALL SELECT 'notas fiscais orfas',       count(*)::text
          FROM public.invoices i
          WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = i.order_id::text);

-- B) Quem são as contas órfãs (as que vão sumir do Recebíveis)
SELECT
  f.id,
  f.type,
  f.status,
  f.description,
  f.original_amount,
  f.due_date,
  CASE WHEN f.due_date < CURRENT_DATE THEN 'VENCIDA' ELSE 'a vencer' END AS situacao,
  (SELECT count(*) FROM public.obligation_payments p
   WHERE p.obligation_id::text = f.id::text AND p.reversed_at IS NULL) AS pagamentos_ativos
FROM public.financial_obligations f
WHERE f.order_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text)
ORDER BY f.due_date;

-- C) Estoque: consumo lançado que não tem mais pedido por trás.
--    insumo_movements não tem chave para pedido, então não dá para casar
--    automaticamente. Isto lista o que existe para você julgar.
SELECT
  i.name                       AS insumo,
  i.unit,
  i.current_stock              AS estoque_atual,
  count(*) FILTER (WHERE m.type = 'OUT') AS baixas,
  COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'OUT'), 0) AS total_baixado,
  COALESCE(sum(m.quantity) FILTER (WHERE m.type = 'IN'), 0)  AS total_entrada
FROM public.insumos i
LEFT JOIN public.insumo_movements m ON m.insumo_id::text = i.id::text
GROUP BY i.id, i.name, i.unit, i.current_stock
HAVING count(m.id) > 0
ORDER BY i.name;


-- =============================================================================
-- PASSO 2 — LIMPEZA. Troque false por true depois de conferir o passo 1.
--
-- Estratégia: NÃO apago conta que tem pagamento ativo — essas viram
-- 'cancelled' com motivo, preservando o rastro financeiro. As sem pagamento
-- nenhum são lixo puro e podem sumir.
-- =============================================================================
DO $$
DECLARE
  v_confirmo boolean := false;   -- <<<<<< TROQUE PARA true

  v_canceladas int; v_apagadas int; v_nf int;
BEGIN
  IF NOT v_confirmo THEN
    RAISE NOTICE 'NADA FOI ALTERADO. Rode o PASSO 1, confira, e troque v_confirmo para true.';
    RETURN;
  END IF;

  -- Backup antes de qualquer coisa
  DROP TABLE IF EXISTS public._bkp_orfas_financial_obligations;
  CREATE TABLE public._bkp_orfas_financial_obligations AS
    SELECT * FROM public.financial_obligations f
    WHERE f.order_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text);

  -- 2.1 Órfãs COM pagamento ativo -> cancela (mantém histórico financeiro)
  UPDATE public.financial_obligations f
  SET status           = 'cancelled',
      cancelled_at     = now(),
      cancelled_reason = 'Pedido de origem excluído — limpeza de órfãos',
      updated_at       = now()
  WHERE (f.order_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text))
    AND f.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM public.obligation_payments p
                WHERE p.obligation_id::text = f.id::text AND p.reversed_at IS NULL);
  GET DIAGNOSTICS v_canceladas = ROW_COUNT;

  -- 2.2 Órfãs SEM pagamento nenhum -> apaga (é lixo, some do Recebíveis)
  DELETE FROM public.financial_obligations f
  WHERE (f.order_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text))
    AND NOT EXISTS (SELECT 1 FROM public.obligation_payments p
                    WHERE p.obligation_id::text = f.id::text);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  -- 2.3 Notas fiscais sem pedido
  DELETE FROM public.invoices i
  WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = i.order_id::text);
  GET DIAGNOSTICS v_nf = ROW_COUNT;

  RAISE NOTICE 'LIMPEZA -> canceladas:% apagadas:% notas_fiscais:%',
               v_canceladas, v_apagadas, v_nf;
END;
$$;


-- =============================================================================
-- PASSO 3 — CONFERÊNCIA. Todos têm que dar 0.
-- =============================================================================
SELECT 'contas orfas restantes' AS check, count(*)::text AS deve_ser_zero
FROM public.financial_obligations f
WHERE f.status <> 'cancelled'
  AND (f.order_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = f.order_id::text))
UNION ALL SELECT 'notas fiscais orfas', count(*)::text
FROM public.invoices i
WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = i.order_id::text);

-- Saldo bancário: a limpeza NÃO mexe em saldo. Se as contas apagadas tinham
-- movimentado caixa, confira e ajuste:
--   SELECT id, name, current_balance FROM bank_accounts;

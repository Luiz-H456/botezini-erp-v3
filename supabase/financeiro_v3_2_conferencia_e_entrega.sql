-- Financeiro v3.2: conferência que só MARCA e data de entrega por gatilho.
--
-- 1) public.marcar_conferida(p_obligation_id): define is_reconciled = true e
--    devolve true. Idempotente: se já estava conferida, continua conferida.
--    Ao contrário de toggle_reconciliation (que alterna e, num clique
--    concorrente, DESFAZ a conferência), esta nunca desmarca. Espelha o
--    toggle: SECURITY INVOKER, sem search_path próprio, mesmas permissões
--    (a RLS de financial_obligations é quem protege o acesso). Limpa o motivo
--    e a data do último "desfazer", como a conta recém-conferida pede.
-- 2) Gatilho BEFORE UPDATE em public.orders: quando o pedido vira 'Entregue'
--    e delivered_at está vazio, grava a data de hoje em São Paulo. Vale para
--    qualquer caminho e qualquer versão do app (o app antigo, que ainda não
--    conhece a coluna, passa a gerar a data certa). Não briga com
--    trg_orders_updated_at: cada um escreve uma coluna diferente.
--
-- Rodar DEPOIS de financeiro_v3_1_entrega.sql (precisa de orders.delivered_at).

-- ANTES (somente leitura)
SELECT p.proname, p.prosecdef AS security_definer, p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('toggle_reconciliation', 'marcar_conferida');

SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
 ORDER BY tgname;

BEGIN;

CREATE OR REPLACE FUNCTION public.marcar_conferida(p_obligation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE financial_obligations
    SET is_reconciled       = true,
        unreconciled_reason = NULL,
        unreconciled_at     = NULL,
        updated_at          = NOW()
  WHERE id = p_obligation_id
    AND is_reconciled IS DISTINCT FROM true;
  -- Já conferida (ou id inexistente): nada a fazer, e nunca desmarca.
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_data_de_entrega()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'Entregue'
     AND OLD.status IS DISTINCT FROM 'Entregue'
     AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_delivered_at ON public.orders;
CREATE TRIGGER trg_orders_delivered_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.definir_data_de_entrega();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- DEPOIS (somente leitura)
SELECT p.proname, p.prosecdef AS security_definer, p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('toggle_reconciliation', 'marcar_conferida');

SELECT tgname, pg_get_triggerdef(oid) AS definicao FROM pg_trigger
 WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
 ORDER BY tgname;

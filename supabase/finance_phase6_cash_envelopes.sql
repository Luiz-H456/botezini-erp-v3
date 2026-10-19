-- =============================================================================
-- Finance — Fase 6: Caixinhas (envelopes virtuais sobre o saldo real)
-- Run no SQL Editor do Supabase.
--
-- Conceito: o dinheiro real vive nas bank_accounts. As "caixinhas" NÃO movem
-- dinheiro real — são uma camada de ALOCAÇÃO virtual (como no Mercado Pago):
--   total_real  = SUM(bank_accounts.current_balance) das contas ativas
--   alocado     = SUM(cash_envelopes.balance)
--   livre       = total_real - alocado   (pode ficar negativo se o saldo real cair)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_envelopes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT '#8b5cf6',
  target_amount numeric(15,2) NOT NULL DEFAULT 0,   -- meta (opcional, 0 = sem meta)
  balance       numeric(15,2) NOT NULL DEFAULT 0,   -- quanto está reservado agora
  notes         text,
  sort_order    int NOT NULL DEFAULT 0,
  is_archived   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_envelopes_balance_nonneg  CHECK (balance >= 0),
  CONSTRAINT cash_envelopes_target_nonneg   CHECK (target_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.cash_envelope_movements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  envelope_id uuid NOT NULL REFERENCES public.cash_envelopes(id) ON DELETE CASCADE,
  delta       numeric(15,2) NOT NULL,               -- + aloca (livre→caixinha), - libera
  kind        text NOT NULL,                         -- 'allocate' | 'release' | 'transfer_in' | 'transfer_out'
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_envelope_mov_envelope ON public.cash_envelope_movements(envelope_id);

-- ---------------------------------------------------------------------------
-- RLS (mesmo padrão single-tenant admin/manager das demais tabelas financeiras)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cash_envelopes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_envelope_movements  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_envelopes' AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.cash_envelopes
      FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cash_envelope_movements' AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.cash_envelope_movements
      FOR ALL TO authenticated USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_envelopes          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_envelope_movements TO authenticated;

-- ---------------------------------------------------------------------------
-- Visão geral: total real / alocado / livre
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_envelope_overview()
RETURNS TABLE (total_real numeric, allocated numeric, free numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real numeric;
  v_alloc numeric;
BEGIN
  PERFORM public.assert_finance_access();
  SELECT COALESCE(SUM(current_balance), 0) INTO v_real
    FROM public.bank_accounts WHERE is_active;
  SELECT COALESCE(SUM(balance), 0) INTO v_alloc
    FROM public.cash_envelopes WHERE NOT is_archived;
  RETURN QUERY SELECT v_real, v_alloc, v_real - v_alloc;
END;
$$;

-- ---------------------------------------------------------------------------
-- Mover dinheiro entre "livre" e uma caixinha.
--   p_delta > 0  → aloca (livre → caixinha); exige livre suficiente
--   p_delta < 0  → libera (caixinha → livre); exige saldo na caixinha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_envelope(
  p_envelope_id uuid,
  p_delta       numeric,
  p_notes       text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_env    public.cash_envelopes%ROWTYPE;
  v_free   numeric;
BEGIN
  PERFORM public.assert_finance_access();

  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'Valor deve ser diferente de zero';
  END IF;

  SELECT * INTO v_env FROM public.cash_envelopes WHERE id = p_envelope_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixinha não encontrada';
  END IF;

  IF p_delta > 0 THEN
    -- alocar: precisa de saldo livre
    SELECT o.free INTO v_free FROM public.get_envelope_overview() o;
    IF p_delta > v_free THEN
      RAISE EXCEPTION 'Saldo livre insuficiente (livre: %, pedido: %)', v_free, p_delta;
    END IF;
  ELSE
    -- liberar: não pode deixar a caixinha negativa
    IF v_env.balance + p_delta < 0 THEN
      RAISE EXCEPTION 'A caixinha não tem esse valor para liberar';
    END IF;
  END IF;

  UPDATE public.cash_envelopes
    SET balance = balance + p_delta, updated_at = now()
    WHERE id = p_envelope_id;

  INSERT INTO public.cash_envelope_movements (user_id, envelope_id, delta, kind, notes)
  VALUES (auth.uid(), p_envelope_id, p_delta,
          CASE WHEN p_delta > 0 THEN 'allocate' ELSE 'release' END, p_notes);
END;
$$;

-- ---------------------------------------------------------------------------
-- Transferir entre caixinhas (atômico)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_envelope(
  p_from   uuid,
  p_to     uuid,
  p_amount numeric,
  p_notes  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.cash_envelopes%ROWTYPE;
BEGIN
  PERFORM public.assert_finance_access();
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;
  IF p_from = p_to THEN
    RAISE EXCEPTION 'Origem e destino não podem ser iguais';
  END IF;

  SELECT * INTO v_from FROM public.cash_envelopes WHERE id = p_from FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixinha de origem não encontrada'; END IF;
  IF v_from.balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente na caixinha de origem';
  END IF;

  PERFORM 1 FROM public.cash_envelopes WHERE id = p_to FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caixinha de destino não encontrada'; END IF;

  UPDATE public.cash_envelopes SET balance = balance - p_amount, updated_at = now() WHERE id = p_from;
  UPDATE public.cash_envelopes SET balance = balance + p_amount, updated_at = now() WHERE id = p_to;

  INSERT INTO public.cash_envelope_movements (user_id, envelope_id, delta, kind, notes)
  VALUES (auth.uid(), p_from, -p_amount, 'transfer_out', p_notes),
         (auth.uid(), p_to,    p_amount, 'transfer_in',  p_notes);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_envelope_overview()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_envelope(uuid, numeric, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_envelope(uuid, uuid, numeric, text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_envelope_overview()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_envelope(uuid, numeric, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_envelope(uuid, uuid, numeric, text) TO authenticated;

-- =============================================================================
-- Verificação:
--   INSERT INTO cash_envelopes (name) VALUES ('Impostos') RETURNING id;
--   SELECT move_envelope('<id>', 500);         -- aloca 500
--   SELECT * FROM get_envelope_overview();      -- livre caiu 500
--   SELECT move_envelope('<id>', -200);        -- libera 200
-- =============================================================================

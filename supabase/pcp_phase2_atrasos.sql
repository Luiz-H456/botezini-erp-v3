-- =============================================================================
-- PCP — Fase 2: Atrasos justificados no cronograma
-- Run no SQL Editor do Supabase. Depende de pcp_phase1_capacity_sectors.sql.
--
-- O cronograma até aqui só sabia de prazo e capacidade. Quando o tecido não
-- chegava ou a máquina quebrava, o plano continuava dizendo que ia dar certo —
-- e só descobria o atraso depois de estourado.
--
-- Esta tabela é a entrada disso no motor: cada atraso registra POR QUANTOS DIAS
-- o pedido travou e POR QUÊ. O recálculo lê essas travas e reempurra o plano.
--
-- POR QUE GUARDA `liberado_em` (data) E NÃO SÓ `dias`
-- Se o motor lesse "3 dias" e somasse a partir de hoje, cada recálculo jogaria
-- o pedido 3 dias mais pra frente e o cronograma nunca pararia de andar. A data
-- é congelada no momento do registro, então recalcular dez vezes dá o mesmo
-- plano. `dias` fica guardado só para exibir "atrasou 3 dias".
--
-- É um HISTÓRICO: um pedido pode atrasar várias vezes, cada uma com seu motivo.
-- A trava que vale é a de maior `liberado_em` (a view abaixo resolve isso).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_delays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  dias          int  NOT NULL,
  motivo        text NOT NULL,
  liberado_em   date NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Atraso de zero (ou negativo) dia não é atraso; deixar passar encheria a
  -- tela de trava que não trava nada.
  CONSTRAINT order_delays_dias_positivo CHECK (dias > 0),
  -- Justificativa é obrigatória de verdade: `text NOT NULL` sozinho aceita
  -- string vazia, e aí o histórico vira uma lista de atrasos sem explicação.
  CONSTRAINT order_delays_motivo_preenchido CHECK (length(btrim(motivo)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_delays_order ON public.order_delays(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delays_liberado ON public.order_delays(liberado_em);

COMMENT ON TABLE public.order_delays IS
  'Histórico de atrasos justificados por pedido. Alimenta a trava do recálculo do cronograma (PCP).';
COMMENT ON COLUMN public.order_delays.liberado_em IS
  'Data em que o pedido volta a poder ser planejado. Congelada no registro para o recálculo ser idempotente.';

-- ---------------------------------------------------------------------------
-- RLS + grants (padrão single-tenant admin/manager — Blueprint §6)
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_delays ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_delays'
      AND policyname = 'single_tenant_admin_manager_all'
  ) THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.order_delays
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager())
      WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_delays TO authenticated;

-- ---------------------------------------------------------------------------
-- Trigger de updated_at — reusa a função que o schema já tem.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_delays_updated_at') THEN
    CREATE TRIGGER trg_order_delays_updated_at
      BEFORE UPDATE ON public.order_delays
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- View: a trava vigente de cada pedido.
--
-- Um pedido pode ter atrasado 3 vezes; o que importa para o planejamento é a
-- data mais distante. DISTINCT ON resolve isso numa passada só.
-- ---------------------------------------------------------------------------
-- security_invoker: a view respeita a RLS de order_delays de quem consulta (alerta Security
-- Definer View do Supabase; ver seguranca_view_atrasos.sql, 19/10/2026).
CREATE OR REPLACE VIEW public.order_delay_current WITH (security_invoker = on) AS
SELECT DISTINCT ON (d.order_id)
  d.order_id,
  d.id            AS delay_id,
  d.dias,
  d.motivo,
  d.liberado_em,
  d.registrado_em,
  (SELECT COUNT(*) FROM public.order_delays x WHERE x.order_id = d.order_id) AS total_atrasos
FROM public.order_delays d
ORDER BY d.order_id, d.liberado_em DESC, d.registrado_em DESC;

GRANT SELECT ON public.order_delay_current TO authenticated;
REVOKE ALL ON public.order_delay_current FROM anon;

-- =============================================================================
-- Verificação:
--   SELECT * FROM public.order_delay_current;
--
--   -- rejeita motivo em branco:
--   INSERT INTO order_delays (order_id, dias, motivo, liberado_em)
--   VALUES ('<id>', 3, '   ', CURRENT_DATE + 3);   -- deve falhar
-- =============================================================================

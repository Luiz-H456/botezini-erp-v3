-- =============================================================================
-- COMERCIAL — ACOMPANHAMENTO  (2.0 — blocos C1 e C2)
-- Rodar no SQL Editor do Supabase. Só acrescenta: nenhuma coluna é removida e
-- nenhum campo existente muda de significado.
--
-- Depois que o orçamento é enviado, o sistema para de acompanhar. Estes dois
-- fecham a lacuna: um sabe QUANDO a proposta saiu, o outro sabe COM QUEM falar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- C1 — Quando o orçamento virou "Enviado"
--
-- O status 'Sent' não guarda o momento em que passou a ser 'Sent'. Sem isso,
-- "parado há dez dias" é literalmente incalculável — e é a única pergunta que
-- importa numa fila de follow-up.
--
-- `updated_at` não serve de substituto: qualquer edição posterior o move, e a
-- proposta enviada há três semanas e corrigida ontem apareceria como fresca.
-- ---------------------------------------------------------------------------
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

COMMENT ON COLUMN public.budgets.sent_at IS
  'Quando o orçamento passou a Enviado. Preenchido pelo trigger na primeira transição; não se move em edições posteriores.';

CREATE INDEX IF NOT EXISTS idx_budgets_sent_at
  ON public.budgets(sent_at DESC) WHERE status = 'Sent';

-- O trigger existe para o dado não depender de a tela lembrar de gravá-lo.
-- Marcar como enviado por qualquer caminho — a tela, um script, o próprio SQL —
-- carimba a data do mesmo jeito.
CREATE OR REPLACE FUNCTION public.marcar_envio_do_orcamento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Só na PRIMEIRA vez. Reenviar o mesmo orçamento não reinicia o relógio: a
  -- pergunta é há quanto tempo a proposta está na mão do cliente, e ela não
  -- volta ao zero porque alguém reabriu o PDF.
  IF NEW.status = 'Sent' AND COALESCE(OLD.status, '') <> 'Sent' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;

  -- Voltar para rascunho apaga a marca: a proposta deixou de estar com o
  -- cliente, e mantê-la na fila de cobrança seria cobrar um envio que não houve.
  IF NEW.status = 'Draft' AND COALESCE(OLD.status, '') = 'Sent' THEN
    NEW.sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_budgets_sent_at ON public.budgets;
CREATE TRIGGER trg_budgets_sent_at
  BEFORE INSERT OR UPDATE OF status ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.marcar_envio_do_orcamento();

-- Retroativo: os orçamentos que JÁ estão em 'Sent' hoje nunca passaram pelo
-- trigger. Sem preencher, eles nasceriam na fila com "parado há 0 dias" — o que
-- é falso e faz a fila começar mentindo. `updated_at` é o palpite menos ruim
-- que existe, e só é usado aqui, uma vez.
UPDATE public.budgets
   SET sent_at = COALESCE(updated_at, (date || ' 12:00:00')::timestamptz)
 WHERE status = 'Sent' AND sent_at IS NULL;

-- ---------------------------------------------------------------------------
-- C2 — Vários contatos por cliente
--
-- Vendendo para hospital e faculdade, compras, RH e financeiro são três pessoas
-- diferentes, e hoje cabe uma. O campo antigo (clients.contact_person) CONTINUA
-- funcionando e vira o contato principal na migração — nada quebra.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id     uuid,
  nome        text NOT NULL,
  cargo       text,
  telefone    text,
  email       text,
  -- Quem responde quando não se sabe para quem ligar. É o que o campo antigo
  -- guardava, e o que a mensagem de WhatsApp usa por padrão.
  principal   boolean NOT NULL DEFAULT false,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_contacts_nome_nao_vazio CHECK (btrim(nome) <> '')
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client
  ON public.client_contacts(client_id);

-- Um principal por cliente. A trava é um índice único parcial e não uma regra
-- de tela: dois "principais" fazem a mensagem automática escolher um deles em
-- silêncio, e o cliente recebe a cobrança no telefone do RH.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_um_principal
  ON public.client_contacts(client_id) WHERE principal;

DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON public.client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='client_contacts' AND policyname='client_contacts_admin_manager') THEN
    CREATE POLICY client_contacts_admin_manager ON public.client_contacts
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager())
      WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.client_contacts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_contacts TO authenticated;

-- Migração do campo antigo: cada cliente com contact_person preenchido ganha o
-- seu contato principal. Idempotente — rodar de novo não duplica.
INSERT INTO public.client_contacts (client_id, nome, telefone, email, principal)
SELECT c.id, btrim(c.contact_person), c.phone, c.email, true
  FROM public.clients c
 WHERE COALESCE(btrim(c.contact_person), '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.client_contacts cc WHERE cc.client_id = c.id);

-- =============================================================================
-- Fila de follow-up direto no SQL, para conferir a tela:
--
--   SELECT serial_number,
--          (now()::date - sent_at::date)         AS dias_parado,
--          (date::date + validity_days) - now()::date AS dias_ate_vencer
--     FROM public.budgets
--    WHERE status = 'Sent'
--    ORDER BY sent_at ASC;
-- =============================================================================

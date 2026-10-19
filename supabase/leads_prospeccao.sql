-- =============================================================================
-- LEADS — PROSPECÇÃO  (2.0 — bloco B1)
-- Rodar no SQL Editor do Supabase. Não altera nenhuma tabela existente.
--
-- O QUE É
-- A aba que faltava antes do orçamento: empresas que talvez virem cliente.
-- Hoje isso mora numa planilha, e planilha não sabe dizer o que fazer HOJE.
--
-- O FUNIL TEM SEIS ETAPAS, E O QUE DEFINE CADA UMA É QUEM TEM A BOLA
--   novo         importado, ninguém tocou           — bola sua
--   contatado    abordagem feita, sem resposta       — bola do cliente, com prazo
--   qualificado  respondeu e tem perfil              — bola sua
--   orcando      pediu proposta                      — vira orçamento de verdade
--   cliente      fechou                              — o lead NÃO some
--   descartado   com motivo obrigatório
--
-- O LEAD SOBREVIVE A VIRAR CLIENTE. Apagá-lo ao converter jogaria fora
-- exatamente o que torna a prospecção mensurável: quantos de cem viraram
-- cliente, e em quantos dias. Por isso `client_id` aponta para o cadastro em
-- vez de a linha ser removida.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid,

  -- ── identidade ────────────────────────────────────────────────────────────
  razao_social        text NOT NULL,
  nome_fantasia       text,
  -- Só dígitos, sempre. A máscara é assunto de tela; aqui o CNPJ precisa poder
  -- ser comparado com o de `clients` sem ninguém varrer pontuação.
  cnpj                text,
  -- Os 8 primeiros dígitos identificam a PESSOA JURÍDICA; o resto é o
  -- estabelecimento. É esta coluna que revela "isto é filial de um cliente que
  -- já tenho" — a venda mais fácil de qualquer lista de prospecção. Gerada, e
  -- não preenchida, para não existir a chance de ficar dessincronizada.
  cnpj_raiz           text GENERATED ALWAYS AS (LEFT(regexp_replace(COALESCE(cnpj,''), '\D', '', 'g'), 8)) STORED,

  segmento            text,
  porte_funcionarios  int,
  cidade              text,
  uf                  text,

  -- ── contato ───────────────────────────────────────────────────────────────
  -- Um contato basta aqui. Prospecção é uma ligação para uma pessoa; a agenda
  -- de vários contatos por empresa é problema de CLIENTE (ver client_contacts),
  -- e trazê-la para cá encheria a importação de campos vazios.
  contato_nome        text,
  contato_cargo       text,
  telefone            text,
  email               text,
  site                text,

  -- ── funil ─────────────────────────────────────────────────────────────────
  status              text NOT NULL DEFAULT 'novo',
  origem              text DEFAULT 'csv',

  -- `proxima_acao` vazia é a definição de lead esquecido, e é por isso que ela
  -- e a data existem como colunas próprias em vez de virarem uma nota.
  proxima_acao        text,
  proxima_acao_em     date,
  ultimo_contato_em   date,

  client_id           uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  motivo_perda        text,
  notas               text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT leads_status_valido CHECK (
    status IN ('novo','contatado','qualificado','orcando','cliente','descartado')),

  -- A trava mora no BANCO e não só na tela. Uma lista de perdas sem motivo não
  -- ensina nada — e é justamente ela que diz se você perde por preço ou por
  -- prazo, que são decisões diferentes.
  CONSTRAINT leads_descarte_com_motivo CHECK (
    status <> 'descartado' OR COALESCE(btrim(motivo_perda), '') <> ''),

  CONSTRAINT leads_cliente_tem_cadastro CHECK (
    status <> 'cliente' OR client_id IS NOT NULL),

  CONSTRAINT leads_razao_social_nao_vazia CHECK (btrim(razao_social) <> '')
);

CREATE INDEX IF NOT EXISTS idx_leads_status     ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_cnpj_raiz  ON public.leads(cnpj_raiz) WHERE cnpj_raiz <> '';
-- Índice parcial para a consulta que roda toda manhã: a fila de hoje.
CREATE INDEX IF NOT EXISTS idx_leads_fila       ON public.leads(proxima_acao_em)
  WHERE status NOT IN ('cliente','descartado');
CREATE INDEX IF NOT EXISTS idx_leads_client     ON public.leads(client_id) WHERE client_id IS NOT NULL;

-- Um CNPJ completo é uma empresa só. Sem esta trava, importar o mesmo arquivo
-- duas vezes duplicaria o funil inteiro — e o número de conversão passaria a
-- medir quantas vezes alguém clicou em importar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cnpj_unico
  ON public.leads(cnpj) WHERE cnpj IS NOT NULL AND length(cnpj) = 14;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrão do resto: admin e gerente veem tudo, fábrica não entra
--
-- Prospecção carrega nome, telefone e e-mail de gente que ainda não é cliente.
-- Não é dado de chão de fábrica, e o papel `factory` não tem o que fazer aqui.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='leads' AND policyname='leads_admin_manager') THEN
    CREATE POLICY leads_admin_manager ON public.leads
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager())
      WITH CHECK (public.is_admin_or_manager());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;

-- ---------------------------------------------------------------------------
-- Importação em lote, idempotente
--
--   p_linhas  [{razao_social, nome_fantasia, cnpj, segmento, porte_funcionarios,
--               cidade, uf, contato_nome, contato_cargo, telefone, email, site,
--               notas, origem}]
--
-- REGRA CENTRAL: o que foi editado à mão NUNCA é sobrescrito. Reimportar o mesmo
-- arquivo só preenche buraco — porque quem corrigiu um telefone errado na tela
-- não pode perder a correção por rodar a importação de novo.
--
-- A classificação (novo / já é cliente / filial / já é lead / incompleto) é
-- feita ANTES, no cliente, e mostrada para conferência. Aqui chega só o que foi
-- confirmado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.importar_leads(p_linhas jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_linha     jsonb;
  v_cnpj      text;
  v_id        uuid;
  v_criados   int := 0;
  v_completados int := 0;
  v_uid       uuid := auth.uid();
BEGIN
  IF NOT public.is_admin_or_manager() THEN
    RAISE EXCEPTION 'Sem permissão para importar leads';
  END IF;

  FOR v_linha IN SELECT * FROM jsonb_array_elements(COALESCE(p_linhas, '[]'::jsonb))
  LOOP
    CONTINUE WHEN COALESCE(btrim(v_linha->>'razao_social'), '') = '';

    v_cnpj := NULLIF(regexp_replace(COALESCE(v_linha->>'cnpj',''), '\D', '', 'g'), '');
    IF v_cnpj IS NOT NULL AND length(v_cnpj) <> 14 THEN v_cnpj := NULL; END IF;

    v_id := NULL;
    IF v_cnpj IS NOT NULL THEN
      SELECT id INTO v_id FROM public.leads WHERE cnpj = v_cnpj;
    END IF;

    IF v_id IS NOT NULL THEN
      -- COALESCE na ordem "o que já está lá primeiro": preenche o vazio e não
      -- toca no preenchido.
      UPDATE public.leads SET
        nome_fantasia      = COALESCE(nome_fantasia,      NULLIF(btrim(v_linha->>'nome_fantasia'), '')),
        segmento           = COALESCE(segmento,           NULLIF(btrim(v_linha->>'segmento'), '')),
        porte_funcionarios = COALESCE(porte_funcionarios, NULLIF(v_linha->>'porte_funcionarios','')::int),
        cidade             = COALESCE(cidade,             NULLIF(btrim(v_linha->>'cidade'), '')),
        uf                 = COALESCE(uf,                 NULLIF(upper(btrim(v_linha->>'uf')), '')),
        contato_nome       = COALESCE(contato_nome,       NULLIF(btrim(v_linha->>'contato_nome'), '')),
        contato_cargo      = COALESCE(contato_cargo,      NULLIF(btrim(v_linha->>'contato_cargo'), '')),
        telefone           = COALESCE(telefone,           NULLIF(regexp_replace(COALESCE(v_linha->>'telefone',''), '\D', '', 'g'), '')),
        email              = COALESCE(email,              NULLIF(btrim(v_linha->>'email'), '')),
        site               = COALESCE(site,               NULLIF(btrim(v_linha->>'site'), '')),
        updated_at         = now()
      WHERE id = v_id;
      v_completados := v_completados + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.leads (
      user_id, razao_social, nome_fantasia, cnpj, segmento, porte_funcionarios,
      cidade, uf, contato_nome, contato_cargo, telefone, email, site, notas, origem)
    VALUES (
      v_uid,
      btrim(v_linha->>'razao_social'),
      NULLIF(btrim(v_linha->>'nome_fantasia'), ''),
      v_cnpj,
      NULLIF(btrim(v_linha->>'segmento'), ''),
      NULLIF(v_linha->>'porte_funcionarios','')::int,
      NULLIF(btrim(v_linha->>'cidade'), ''),
      NULLIF(upper(btrim(v_linha->>'uf')), ''),
      NULLIF(btrim(v_linha->>'contato_nome'), ''),
      NULLIF(btrim(v_linha->>'contato_cargo'), ''),
      NULLIF(regexp_replace(COALESCE(v_linha->>'telefone',''), '\D', '', 'g'), ''),
      NULLIF(btrim(v_linha->>'email'), ''),
      NULLIF(btrim(v_linha->>'site'), ''),
      NULLIF(btrim(v_linha->>'notas'), ''),
      COALESCE(NULLIF(btrim(v_linha->>'origem'), ''), 'csv'));
    v_criados := v_criados + 1;
  END LOOP;

  RETURN jsonb_build_object('criados', v_criados, 'completados', v_completados);
END;
$$;

GRANT EXECUTE ON FUNCTION public.importar_leads(jsonb) TO authenticated;

-- =============================================================================
-- Taxa de conversão direto no SQL, para conferir a tela:
--
--   SELECT status, count(*), round(100.0*count(*)/sum(count(*)) OVER (), 1) AS pct
--     FROM public.leads GROUP BY status ORDER BY 2 DESC;
--
-- Motivos de perda — a leitura que diz se você perde por preço ou por prazo:
--
--   SELECT motivo_perda, count(*) FROM public.leads
--    WHERE status = 'descartado' GROUP BY 1 ORDER BY 2 DESC;
-- =============================================================================

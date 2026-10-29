-- =============================================================================
-- TABELA VERDADE DE TECIDOS  (v3.1 — decisão do Luiz em 29/10/2026)
-- Spec: docs/superpowers/specs/2026-10-29-tabela-verdade-v3-1-design.md
-- Fornecedor › linha › tipo (o tecido) › faixas de cor × condições de pagamento,
-- com frete e histórico de reajuste. Cada faixa aponta para o insumo que o estoque,
-- a compra e a ficha já usam. Só acrescenta; nada é apagado. Pode rodar mais de uma vez.
-- Pré-requisito: supabase/compras_por_pedido.sql (compras, compra_itens) já aplicado.
-- =============================================================================

-- ANTES (somente leitura)
SELECT (SELECT count(DISTINCT btrim(fabric_family)) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '') AS familias,
       (SELECT count(*) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '')                        AS insumos_de_tecido,
       (SELECT coalesce(sum(current_stock),0) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '')    AS saldo_tecidos,
       (SELECT count(*) FROM public.fabric_colors WHERE is_active)                                                  AS cores_ativas,
       (SELECT count(*) FROM public.compra_itens)                                                                   AS itens_de_compra;
-- Famílias cujas faixas têm fornecedores diferentes (ficam no fornecedor da faixa Padrão)
SELECT btrim(fabric_family) AS familia, count(DISTINCT supplier_id) AS fornecedores
FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY 1 HAVING count(DISTINCT supplier_id) > 1;
-- Famílias que colidem sem diferenciar maiúsculas (viram um tipo só)
SELECT lower(btrim(fabric_family)) AS chave, array_agg(DISTINCT fabric_family) AS grafias
FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY 1 HAVING count(DISTINCT fabric_family) > 1;
-- Insumos de tecido fora de família (não migram)
SELECT id, name FROM public.insumos WHERE lower(coalesce(category,'')) = 'tecidos' AND btrim(coalesce(fabric_family,'')) = '';

-- 1. Tabelas -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tecido_linhas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id               uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  nome                        text NOT NULL CHECK (btrim(nome) <> ''),
  ordem                       int  NOT NULL DEFAULT 0,
  usa_frete_do_fornecedor     boolean NOT NULL DEFAULT true,
  usa_condicoes_do_fornecedor boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tecido_linhas_nome_unico UNIQUE (fornecedor_id, nome)
);

CREATE TABLE IF NOT EXISTS public.fornecedor_condicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  linha_id      uuid REFERENCES public.tecido_linhas(id) ON DELETE CASCADE,
  origem_id     uuid REFERENCES public.fornecedor_condicoes(id) ON DELETE SET NULL,
  nome          text NOT NULL CHECK (btrim(nome) <> ''),
  ordem         int  NOT NULL DEFAULT 0,
  padrao        boolean NOT NULL DEFAULT false,
  ativa         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_condicao_nome ON public.fornecedor_condicoes
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
CREATE UNIQUE INDEX IF NOT EXISTS uq_condicao_padrao ON public.fornecedor_condicoes
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE padrao AND ativa;

CREATE TABLE IF NOT EXISTS public.fornecedor_frete (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  linha_id          uuid REFERENCES public.tecido_linhas(id) ON DELETE CASCADE,
  modo              text NOT NULL CHECK (modo IN ('cif','por_kg','fixo','cotacao')),
  valor             numeric(15,4) CHECK (valor IS NULL OR valor >= 0),
  remessa_tipica_kg numeric(15,4) CHECK (remessa_tipica_kg IS NULL OR remessa_tipica_kg > 0),
  CONSTRAINT frete_valor_do_modo CHECK (modo IN ('cif','cotacao') OR valor IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_frete ON public.fornecedor_frete
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.tecido_tipos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id            uuid NOT NULL REFERENCES public.tecido_linhas(id) ON DELETE RESTRICT,
  nome                text NOT NULL CHECK (btrim(nome) <> ''),
  unidade             text NOT NULL CHECK (unidade IN ('kg','m')),
  rendimento_m_por_kg numeric(15,4) CHECK (rendimento_m_por_kg IS NULL OR rendimento_m_por_kg > 0),
  composicao          text,
  ordem               int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipo_kg_tem_rendimento CHECK (unidade = 'm' OR rendimento_m_por_kg IS NOT NULL)
);
-- Único no sistema todo: o nome é a fabric_family que liga cor e insumo no orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecido_tipo_nome ON public.tecido_tipos (lower(btrim(nome)));

CREATE TABLE IF NOT EXISTS public.tecido_faixas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id   uuid NOT NULL REFERENCES public.tecido_tipos(id) ON DELETE CASCADE,
  nome      text NOT NULL CHECK (btrim(nome) <> ''),
  ordem     int  NOT NULL CHECK (ordem BETWEEN 1 AND 6),
  insumo_id uuid NOT NULL UNIQUE REFERENCES public.insumos(id) ON DELETE RESTRICT,
  CONSTRAINT faixa_nome_unico  UNIQUE (tipo_id, nome)  DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT faixa_ordem_unica UNIQUE (tipo_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS public.tecido_precos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_id    uuid NOT NULL REFERENCES public.tecido_faixas(id) ON DELETE CASCADE,
  condicao_id uuid NOT NULL REFERENCES public.fornecedor_condicoes(id) ON DELETE RESTRICT,
  vale_desde  date NOT NULL,
  valor       numeric(15,4) NOT NULL CHECK (valor > 0),
  origem      text NOT NULL DEFAULT 'tabela' CHECK (origem IN ('tabela','importado_da_compra')),
  user_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preco_unico UNIQUE (faixa_id, condicao_id, vale_desde)
);
CREATE INDEX IF NOT EXISTS idx_tecido_precos_faixa ON public.tecido_precos (faixa_id, condicao_id, vale_desde DESC);

-- 2. Ligações com o que existe ---------------------------------------------------
ALTER TABLE public.insumos       ADD COLUMN IF NOT EXISTS faixa_id uuid REFERENCES public.tecido_faixas(id) ON DELETE SET NULL;
ALTER TABLE public.fabric_colors ADD COLUMN IF NOT EXISTS faixa_id uuid REFERENCES public.tecido_faixas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_insumos_faixa ON public.insumos (faixa_id) WHERE faixa_id IS NOT NULL;
-- A faixa deixa de ser uma de três: até 6 nomes livres por tipo.
ALTER TABLE public.fabric_colors DROP CONSTRAINT IF EXISTS fabric_colors_tier_valid;

-- 3. RLS -----------------------------------------------------------------------
ALTER TABLE public.tecido_linhas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_tipos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_faixas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_precos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_condicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_frete     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tecido_linhas_leitura ON public.tecido_linhas;
DROP POLICY IF EXISTS tecido_tipos_leitura ON public.tecido_tipos;
DROP POLICY IF EXISTS tecido_faixas_leitura ON public.tecido_faixas;
DROP POLICY IF EXISTS tecido_precos_leitura ON public.tecido_precos;
DROP POLICY IF EXISTS fornecedor_condicoes_leitura ON public.fornecedor_condicoes;
DROP POLICY IF EXISTS fornecedor_frete_leitura ON public.fornecedor_frete;
CREATE POLICY tecido_linhas_leitura ON public.tecido_linhas FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_tipos_leitura  ON public.tecido_tipos  FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_faixas_leitura ON public.tecido_faixas FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_precos_leitura ON public.tecido_precos FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY fornecedor_condicoes_leitura ON public.fornecedor_condicoes FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY fornecedor_frete_leitura ON public.fornecedor_frete FOR SELECT TO authenticated USING (public.is_admin_or_manager());
-- Sem política de escrita: só as funções abaixo gravam.
REVOKE INSERT, UPDATE, DELETE ON public.tecido_linhas, public.tecido_tipos, public.tecido_faixas,
  public.tecido_precos, public.fornecedor_condicoes, public.fornecedor_frete FROM anon, authenticated;
GRANT SELECT ON public.tecido_linhas, public.tecido_tipos, public.tecido_faixas,
  public.tecido_precos, public.fornecedor_condicoes, public.fornecedor_frete TO authenticated;

-- 4. Funções internas ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hoje_sp() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Modelo do fornecedor: "À vista" padrão e frete "a cotar", se ainda não houver.
CREATE OR REPLACE FUNCTION public._garantir_modelo_do_fornecedor(p_fornecedor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor AND linha_id IS NULL) THEN
    INSERT INTO fornecedor_condicoes (fornecedor_id, nome, ordem, padrao) VALUES (p_fornecedor, 'À vista', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fornecedor_frete WHERE fornecedor_id = p_fornecedor AND linha_id IS NULL) THEN
    INSERT INTO fornecedor_frete (fornecedor_id, modo) VALUES (p_fornecedor, 'cotacao');
  END IF;
END $$;

-- Copia o modelo do fornecedor para a linha, nas partes em que a linha usa o do fornecedor.
CREATE OR REPLACE FUNCTION public._sincronizar_comercial_da_linha(p_linha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l tecido_linhas; t fornecedor_condicoes; v_id uuid;
BEGIN
  SELECT * INTO l FROM tecido_linhas WHERE id = p_linha;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM _garantir_modelo_do_fornecedor(l.fornecedor_id);

  IF l.usa_frete_do_fornecedor THEN
    DELETE FROM fornecedor_frete WHERE linha_id = l.id;
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    SELECT fornecedor_id, l.id, modo, valor, remessa_tipica_kg FROM fornecedor_frete
    WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM fornecedor_frete WHERE linha_id = l.id) THEN
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    SELECT fornecedor_id, l.id, modo, valor, remessa_tipica_kg FROM fornecedor_frete
    WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL;
  END IF;

  IF l.usa_condicoes_do_fornecedor OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE linha_id = l.id) THEN
    -- Sem padrão durante a cópia: o índice de "uma padrão" não pode ver duas no meio do caminho.
    UPDATE fornecedor_condicoes SET padrao = false WHERE linha_id = l.id;
    FOR t IN SELECT * FROM fornecedor_condicoes WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL ORDER BY ordem LOOP
      SELECT id INTO v_id FROM fornecedor_condicoes WHERE linha_id = l.id AND origem_id = t.id;
      IF v_id IS NULL THEN
        -- Adota a condição de mesmo nome que a linha já tinha: os preços dela continuam valendo.
        SELECT id INTO v_id FROM fornecedor_condicoes WHERE linha_id = l.id AND lower(nome) = lower(t.nome);
      END IF;
      IF v_id IS NULL THEN
        INSERT INTO fornecedor_condicoes (fornecedor_id, linha_id, origem_id, nome, ordem, padrao, ativa)
        VALUES (l.fornecedor_id, l.id, t.id, t.nome, t.ordem, false, t.ativa) RETURNING id INTO v_id;
      ELSE
        UPDATE fornecedor_condicoes SET origem_id = t.id, nome = t.nome, ordem = t.ordem, ativa = t.ativa WHERE id = v_id;
      END IF;
    END LOOP;
    -- O que a linha tem e o modelo não tem: some se não tiver preço; senão fica inativo.
    DELETE FROM fornecedor_condicoes c WHERE c.linha_id = l.id
      AND (c.origem_id IS NULL OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.linha_id IS NULL))
      AND NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.condicao_id = c.id);
    UPDATE fornecedor_condicoes c SET ativa = false WHERE c.linha_id = l.id
      AND (c.origem_id IS NULL OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.linha_id IS NULL));
    UPDATE fornecedor_condicoes c SET padrao = true WHERE c.linha_id = l.id AND c.ativa
      AND EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.padrao);
  END IF;
END $$;

-- Garante uma padrão entre as ativas de (fornecedor, linha): a marcada, ou a de menor ordem.
CREATE OR REPLACE FUNCTION public._acertar_padrao(p_fornecedor uuid, p_linha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor
                 AND linha_id IS NOT DISTINCT FROM p_linha AND padrao AND ativa) THEN
    UPDATE fornecedor_condicoes SET padrao = true WHERE id = (
      SELECT id FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor
      AND linha_id IS NOT DISTINCT FROM p_linha AND ativa ORDER BY ordem, created_at LIMIT 1);
  END IF;
END $$;

-- 5. Funções públicas ------------------------------------------------------------
-- Frete e condições: do fornecedor (linha_id ausente) ou de uma linha.
CREATE OR REPLACE FUNCTION public.salvar_comercial(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_forn uuid := (p->>'fornecedor_id')::uuid; v_linha uuid := NULLIF(p->>'linha_id','')::uuid;
        v_frete jsonb := p->'frete'; v_cond jsonb := p->'condicoes'; c jsonb; v_ids uuid[] := '{}'; v_id uuid; r record;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF v_forn IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_forn) THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;
  IF v_linha IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tecido_linhas WHERE id = v_linha AND fornecedor_id = v_forn) THEN
    RAISE EXCEPTION 'Linha não pertence ao fornecedor';
  END IF;
  PERFORM _garantir_modelo_do_fornecedor(v_forn);

  IF v_linha IS NOT NULL THEN
    UPDATE tecido_linhas SET
      usa_frete_do_fornecedor     = coalesce((p->>'usa_frete_do_fornecedor')::boolean, usa_frete_do_fornecedor),
      usa_condicoes_do_fornecedor = coalesce((p->>'usa_condicoes_do_fornecedor')::boolean, usa_condicoes_do_fornecedor)
    WHERE id = v_linha;
    -- Ao desligar, a linha parte do que já tem (cópia do modelo).
    PERFORM _sincronizar_comercial_da_linha(v_linha);
  END IF;

  IF v_frete IS NOT NULL AND jsonb_typeof(v_frete) = 'object'
     AND (v_linha IS NULL OR NOT (SELECT usa_frete_do_fornecedor FROM tecido_linhas WHERE id = v_linha)) THEN
    DELETE FROM fornecedor_frete WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha;
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    VALUES (v_forn, v_linha, v_frete->>'modo', NULLIF(v_frete->>'valor','')::numeric, NULLIF(v_frete->>'remessa_tipica_kg','')::numeric);
  END IF;

  IF v_cond IS NOT NULL AND jsonb_typeof(v_cond) = 'array'
     AND (v_linha IS NULL OR NOT (SELECT usa_condicoes_do_fornecedor FROM tecido_linhas WHERE id = v_linha)) THEN
    IF jsonb_array_length(v_cond) = 0 THEN RAISE EXCEPTION 'Informe ao menos uma condição de pagamento'; END IF;
    UPDATE fornecedor_condicoes SET padrao = false WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha;
    FOR c IN SELECT * FROM jsonb_array_elements(v_cond) LOOP
      v_id := NULLIF(c->>'id','')::uuid;
      IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE id = v_id
                                      AND fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha) THEN
        UPDATE fornecedor_condicoes SET nome = btrim(c->>'nome'), ordem = coalesce((c->>'ordem')::int, 0),
          padrao = coalesce((c->>'padrao')::boolean, false), ativa = true WHERE id = v_id;
      ELSE
        INSERT INTO fornecedor_condicoes (fornecedor_id, linha_id, nome, ordem, padrao)
        VALUES (v_forn, v_linha, btrim(c->>'nome'), coalesce((c->>'ordem')::int, 0), coalesce((c->>'padrao')::boolean, false))
        RETURNING id INTO v_id;
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;
    -- Fora da lista: some sem preço; com preço, fica inativa (o histórico continua explicável).
    DELETE FROM fornecedor_condicoes c WHERE c.fornecedor_id = v_forn AND c.linha_id IS NOT DISTINCT FROM v_linha
      AND c.id <> ALL (v_ids) AND NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.condicao_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM fornecedor_condicoes f WHERE f.origem_id = c.id
                      AND EXISTS (SELECT 1 FROM tecido_precos p2 WHERE p2.condicao_id = f.id));
    UPDATE fornecedor_condicoes SET ativa = false, padrao = false
      WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha AND id <> ALL (v_ids);
    PERFORM _acertar_padrao(v_forn, v_linha);
  END IF;

  -- Mudou o modelo: toda linha que usa o do fornecedor recebe a mudança.
  IF v_linha IS NULL THEN
    FOR r IN SELECT id FROM tecido_linhas WHERE fornecedor_id = v_forn LOOP
      PERFORM _sincronizar_comercial_da_linha(r.id);
    END LOOP;
  ELSE
    PERFORM _acertar_padrao(v_forn, v_linha);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.salvar_linha(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid := NULLIF(p->>'id','')::uuid; v_forn uuid := (p->>'fornecedor_id')::uuid; v_nome text := btrim(p->>'nome');
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF coalesce(v_nome,'') = '' THEN RAISE EXCEPTION 'Dê um nome à linha'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO tecido_linhas (fornecedor_id, nome, ordem)
    VALUES (v_forn, v_nome, coalesce((p->>'ordem')::int, (SELECT coalesce(max(ordem),0)+1 FROM tecido_linhas WHERE fornecedor_id = v_forn)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE tecido_linhas SET nome = v_nome, ordem = coalesce((p->>'ordem')::int, ordem) WHERE id = v_id AND fornecedor_id = v_forn;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  END IF;
  PERFORM _sincronizar_comercial_da_linha(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.salvar_tecido_tipo(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid := NULLIF(p->>'id','')::uuid; v_linha uuid := (p->>'linha_id')::uuid;
  v_nome text := btrim(p->>'nome'); v_unid text := p->>'unidade';
  v_rend numeric := NULLIF(p->>'rendimento_m_por_kg','')::numeric;
  v_forn uuid; v_antigo text; f jsonb; c jsonb; pr jsonb; v_faixa uuid; v_insumo uuid; v_ids uuid[] := '{}';
  r record; v_n int; v_hoje date := _hoje_sp();
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  SELECT fornecedor_id INTO v_forn FROM tecido_linhas WHERE id = v_linha;
  IF v_forn IS NULL THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  IF coalesce(v_nome,'') = '' THEN RAISE EXCEPTION 'Dê um nome ao tecido'; END IF;
  IF v_unid NOT IN ('kg','m') THEN RAISE EXCEPTION 'Unidade tem de ser kg ou m'; END IF;
  IF v_unid = 'kg' AND (v_rend IS NULL OR v_rend <= 0) THEN RAISE EXCEPTION 'Tecido em kg precisa do rendimento (metros por kg)'; END IF;
  v_n := jsonb_array_length(coalesce(p->'faixas','[]'::jsonb));
  IF v_n < 1 OR v_n > 6 THEN RAISE EXCEPTION 'O tecido tem de ter de 1 a 6 faixas'; END IF;
  IF (SELECT count(DISTINCT lower(btrim(x->>'nome'))) FROM jsonb_array_elements(p->'faixas') x) <> v_n THEN
    RAISE EXCEPTION 'Duas faixas com o mesmo nome';
  END IF;
  -- Toda cor tem de cair numa faixa da lista.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'cores','[]'::jsonb)) c2
             WHERE lower(btrim(c2->>'faixa')) NOT IN (SELECT lower(btrim(x->>'nome')) FROM jsonb_array_elements(p->'faixas') x)) THEN
    RAISE EXCEPTION 'Há cores numa faixa que não existe: mova as cores antes de salvar';
  END IF;
  -- Nome único no sistema (é a fabric_family do orçamento).
  IF EXISTS (SELECT 1 FROM tecido_tipos WHERE lower(btrim(nome)) = lower(v_nome) AND id IS DISTINCT FROM v_id)
     OR EXISTS (SELECT 1 FROM insumos i WHERE lower(btrim(i.fabric_family)) = lower(v_nome)
                AND (i.faixa_id IS NULL OR i.faixa_id NOT IN (SELECT id FROM tecido_faixas WHERE tipo_id IS NOT DISTINCT FROM v_id))) THEN
    RAISE EXCEPTION 'Já existe um tecido chamado %', v_nome;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO tecido_tipos (linha_id, nome, unidade, rendimento_m_por_kg, composicao, ordem)
    VALUES (v_linha, v_nome, v_unid, v_rend, NULLIF(btrim(p->>'composicao'),''),
            coalesce((p->>'ordem')::int, (SELECT coalesce(max(ordem),0)+1 FROM tecido_tipos WHERE linha_id = v_linha)))
    RETURNING id INTO v_id;
    v_antigo := v_nome;
  ELSE
    SELECT nome INTO v_antigo FROM tecido_tipos WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tecido não encontrado'; END IF;
    UPDATE tecido_tipos SET linha_id = v_linha, nome = v_nome, unidade = v_unid, rendimento_m_por_kg = v_rend,
      composicao = NULLIF(btrim(p->>'composicao'),'') WHERE id = v_id;
    -- Renomear o tecido leva a cartela junto (inclusive cores inativas, para relatório antigo achar).
    UPDATE fabric_colors SET fabric_family = v_nome WHERE fabric_family = v_antigo;
  END IF;

  -- Faixas: as informadas ficam; as de fora saem se nada as usa.
  FOR f IN SELECT * FROM jsonb_array_elements(p->'faixas') LOOP
    v_faixa := NULLIF(f->>'id','')::uuid;
    IF v_faixa IS NOT NULL AND EXISTS (SELECT 1 FROM tecido_faixas WHERE id = v_faixa AND tipo_id = v_id) THEN
      UPDATE tecido_faixas SET nome = btrim(f->>'nome'), ordem = (f->>'ordem')::int WHERE id = v_faixa;
    ELSE
      INSERT INTO insumos (user_id, name, unit, rendimento, category, fabric_family, color_tier, supplier_id, current_stock, min_stock, average_unit_cost)
      VALUES (auth.uid(), upper(v_nome || ' ' || btrim(f->>'nome')), v_unid, coalesce(v_rend, 1), 'Tecidos', v_nome, btrim(f->>'nome'), v_forn, 0, 0, 0)
      RETURNING id INTO v_insumo;
      INSERT INTO tecido_faixas (tipo_id, nome, ordem, insumo_id) VALUES (v_id, btrim(f->>'nome'), (f->>'ordem')::int, v_insumo)
      RETURNING id INTO v_faixa;
    END IF;
    v_ids := v_ids || v_faixa;
  END LOOP;

  FOR r IN SELECT tf.id, tf.nome, tf.insumo_id FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND tf.id <> ALL (v_ids) LOOP
    IF EXISTS (SELECT 1 FROM insumos WHERE id = r.insumo_id AND current_stock <> 0)
       OR EXISTS (SELECT 1 FROM insumo_movements WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM compra_itens WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM product_insumos WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM insumos WHERE canonical_insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM products WHERE default_fabric_insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM budgets WHERE items::text LIKE '%' || r.insumo_id::text || '%')
       OR EXISTS (SELECT 1 FROM orders  WHERE items::text LIKE '%' || r.insumo_id::text || '%') THEN
      RAISE EXCEPTION 'A faixa % já foi usada (saldo, compra, ficha ou orçamento) e não pode sair. Mova as cores para outra faixa e deixe-a sem cor.', r.nome;
    END IF;
    DELETE FROM tecido_faixas WHERE id = r.id;
    DELETE FROM insumos WHERE id = r.insumo_id;
  END LOOP;

  -- Insumos (e apelidos) seguem o nome do tecido e da faixa.
  UPDATE insumos i SET name = upper(v_nome || ' ' || tf.nome), fabric_family = v_nome, color_tier = tf.nome,
    unit = v_unid, rendimento = coalesce(v_rend, 1), supplier_id = v_forn, faixa_id = tf.id
  FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND i.id = tf.insumo_id;
  UPDATE insumos i SET fabric_family = v_nome, color_tier = tf.nome, faixa_id = tf.id
  FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND i.canonical_insumo_id = tf.insumo_id;

  -- Cartela: o conjunto da tela vira o conjunto do banco (o resto fica inativo).
  UPDATE fabric_colors SET is_active = false, updated_at = now() WHERE fabric_family = v_nome;
  v_n := 0;
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p->'cores','[]'::jsonb)) LOOP
    SELECT id INTO v_faixa FROM tecido_faixas WHERE tipo_id = v_id AND lower(nome) = lower(btrim(c->>'faixa'));
    INSERT INTO fabric_colors (user_id, fabric_family, color_name, hex, color_tier, faixa_id, sort_order, is_active, updated_at)
    VALUES (auth.uid(), v_nome, upper(btrim(c->>'nome')), coalesce(NULLIF(c->>'hex',''), '#CCCCCC'),
            (SELECT nome FROM tecido_faixas WHERE id = v_faixa), v_faixa, v_n, true, now())
    ON CONFLICT (fabric_family, color_name) DO UPDATE SET hex = EXCLUDED.hex, color_tier = EXCLUDED.color_tier,
      faixa_id = EXCLUDED.faixa_id, sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now();
    v_n := v_n + 1;
  END LOOP;

  -- Preços da grade: corrige o vigente (mesmo vale_desde) ou cria hoje; valor vazio apaga aquela data.
  FOR pr IN SELECT * FROM jsonb_array_elements(coalesce(p->'precos','[]'::jsonb)) LOOP
    SELECT id INTO v_faixa FROM tecido_faixas WHERE tipo_id = v_id AND lower(nome) = lower(btrim(pr->>'faixa'));
    IF v_faixa IS NULL THEN RAISE EXCEPTION 'Preço para uma faixa que não existe: %', pr->>'faixa'; END IF;
    IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE id = (pr->>'condicao_id')::uuid AND linha_id = v_linha) THEN
      RAISE EXCEPTION 'Condição de pagamento não pertence a esta linha';
    END IF;
    IF NULLIF(pr->>'valor','') IS NULL OR (pr->>'valor')::numeric <= 0 THEN
      DELETE FROM tecido_precos WHERE faixa_id = v_faixa AND condicao_id = (pr->>'condicao_id')::uuid
        AND vale_desde = coalesce(NULLIF(pr->>'vale_desde','')::date, v_hoje);
    ELSE
      INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem, user_id)
      VALUES (v_faixa, (pr->>'condicao_id')::uuid, coalesce(NULLIF(pr->>'vale_desde','')::date, v_hoje), (pr->>'valor')::numeric, 'tabela', auth.uid())
      ON CONFLICT (faixa_id, condicao_id, vale_desde) DO UPDATE SET valor = EXCLUDED.valor, origem = 'tabela', user_id = auth.uid();
    END IF;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.reajustar_precos(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_data date := (p->>'vale_desde')::date; pr jsonb;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF v_data IS NULL THEN RAISE EXCEPTION 'Informe a data em que o reajuste passa a valer'; END IF;
  FOR pr IN SELECT * FROM jsonb_array_elements(coalesce(p->'precos','[]'::jsonb)) LOOP
    IF NULLIF(pr->>'valor','') IS NULL OR (pr->>'valor')::numeric <= 0 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM tecido_precos WHERE faixa_id = (pr->>'faixa_id')::uuid
               AND condicao_id = (pr->>'condicao_id')::uuid AND vale_desde > v_data) THEN
      RAISE EXCEPTION 'Já existe um reajuste depois de %: a data tem de ser a mais recente', to_char(v_data, 'DD/MM/YYYY');
    END IF;
    INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem, user_id)
    VALUES ((pr->>'faixa_id')::uuid, (pr->>'condicao_id')::uuid, v_data, (pr->>'valor')::numeric, 'tabela', auth.uid())
    ON CONFLICT (faixa_id, condicao_id, vale_desde) DO UPDATE SET valor = EXCLUDED.valor, origem = 'tabela', user_id = auth.uid();
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.salvar_comercial(jsonb), public.salvar_linha(jsonb), public.salvar_tecido_tipo(jsonb),
  public.reajustar_precos(jsonb), public._garantir_modelo_do_fornecedor(uuid), public._sincronizar_comercial_da_linha(uuid),
  public._acertar_padrao(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_comercial(jsonb), public.salvar_linha(jsonb), public.salvar_tecido_tipo(jsonb),
  public.reajustar_precos(jsonb) TO authenticated;

-- 6. Migração dos tecidos de hoje (só famílias que ainda não viraram tipo) ---------
DO $$
DECLARE r record; f record; v_forn uuid; v_linha uuid; v_tipo uuid; v_faixa uuid; v_cond uuid;
        v_unid text; v_rend numeric; v_ordem int; v_custo numeric; v_data date;
BEGIN
  FOR r IN SELECT min(btrim(fabric_family)) AS familia, lower(btrim(fabric_family)) AS chave FROM public.insumos
           WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY lower(btrim(fabric_family)) LOOP
    IF EXISTS (SELECT 1 FROM tecido_tipos WHERE lower(btrim(nome)) = r.chave) THEN CONTINUE; END IF;

    SELECT i.supplier_id INTO v_forn FROM insumos i JOIN suppliers s ON s.id = i.supplier_id
    WHERE lower(btrim(i.fabric_family)) = r.chave
    ORDER BY (i.color_tier = 'Padrão') DESC, (i.canonical_insumo_id IS NULL) DESC, i.created_at LIMIT 1;
    IF v_forn IS NULL THEN
      SELECT id INTO v_forn FROM suppliers WHERE company_name = 'Sem fornecedor' ORDER BY created_at LIMIT 1;
      IF v_forn IS NULL THEN INSERT INTO suppliers (company_name) VALUES ('Sem fornecedor') RETURNING id INTO v_forn; END IF;
    END IF;

    INSERT INTO tecido_linhas (fornecedor_id, nome, ordem) VALUES (v_forn, 'Geral', 0)
    ON CONFLICT (fornecedor_id, nome) DO NOTHING;
    SELECT id INTO v_linha FROM tecido_linhas WHERE fornecedor_id = v_forn AND nome = 'Geral';
    PERFORM _sincronizar_comercial_da_linha(v_linha);
    SELECT id INTO v_cond FROM fornecedor_condicoes WHERE linha_id = v_linha AND padrao AND ativa;

    SELECT CASE WHEN lower(unit) = 'kg' THEN 'kg' ELSE 'm' END, NULLIF(rendimento, 0) INTO v_unid, v_rend
    FROM insumos WHERE lower(btrim(fabric_family)) = r.chave
    ORDER BY (color_tier = 'Padrão') DESC, (canonical_insumo_id IS NULL) DESC, created_at LIMIT 1;
    INSERT INTO tecido_tipos (linha_id, nome, unidade, rendimento_m_por_kg)
    VALUES (v_linha, r.familia, v_unid, CASE WHEN v_unid = 'kg' THEN coalesce(v_rend, 1) ELSE v_rend END)
    RETURNING id INTO v_tipo;

    v_ordem := 0;
    FOR f IN SELECT faixa, insumo_id FROM (
               SELECT DISTINCT ON (coalesce(NULLIF(btrim(color_tier),''), 'Padrão'))
                      coalesce(NULLIF(btrim(color_tier),''), 'Padrão') AS faixa, id AS insumo_id
               FROM insumos WHERE lower(btrim(fabric_family)) = r.chave
               ORDER BY coalesce(NULLIF(btrim(color_tier),''), 'Padrão'), (canonical_insumo_id IS NULL) DESC, created_at) x
             ORDER BY CASE faixa WHEN 'Branco' THEN 1 WHEN 'Padrão' THEN 2 WHEN 'Especial' THEN 3 ELSE 4 END, faixa LOOP
      v_ordem := v_ordem + 1;
      IF v_ordem > 6 THEN RAISE EXCEPTION 'Família % tem mais de 6 faixas', r.familia; END IF;
      INSERT INTO tecido_faixas (tipo_id, nome, ordem, insumo_id) VALUES (v_tipo, f.faixa, v_ordem, f.insumo_id)
      RETURNING id INTO v_faixa;
      UPDATE insumos SET faixa_id = v_faixa, fabric_family = r.familia
      WHERE lower(btrim(fabric_family)) = r.chave AND coalesce(NULLIF(btrim(color_tier),''), 'Padrão') = f.faixa;
      UPDATE fabric_colors SET faixa_id = v_faixa, fabric_family = r.familia
      WHERE lower(btrim(fabric_family)) = r.chave AND color_tier = f.faixa;

      -- Preço inicial: o último pago (compra; senão entrada manual com custo), em qualquer insumo da faixa.
      SELECT custo, dia INTO v_custo, v_data FROM (
        SELECT ci.custo_unitario AS custo, c.data AS dia, c.created_at AS quando
        FROM compra_itens ci JOIN compras c ON c.id = ci.compra_id
        WHERE ci.insumo_id IN (SELECT id FROM insumos WHERE faixa_id = v_faixa) AND ci.custo_unitario > 0
        UNION ALL
        SELECT m.unit_cost, (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date, m.created_at
        FROM insumo_movements m
        WHERE m.insumo_id IN (SELECT id FROM insumos WHERE faixa_id = v_faixa) AND m.type = 'IN' AND m.unit_cost > 0
      ) u ORDER BY dia DESC, quando DESC LIMIT 1;
      IF v_custo IS NOT NULL AND v_cond IS NOT NULL THEN
        INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem)
        VALUES (v_faixa, v_cond, v_data, v_custo, 'importado_da_compra') ON CONFLICT DO NOTHING;
      END IF;
      v_custo := NULL; v_data := NULL;
    END LOOP;
  END LOOP;
END $$;

-- DEPOIS (somente leitura) — todas as colunas "problemas_*" têm de dar 0.
SELECT
  (SELECT count(*) FROM insumos WHERE btrim(coalesce(fabric_family,'')) <> '' AND faixa_id IS NULL)              AS problemas_insumo_sem_faixa,
  (SELECT count(*) FROM fabric_colors WHERE is_active AND faixa_id IS NULL
     AND fabric_family IN (SELECT nome FROM tecido_tipos))                                                       AS problemas_cor_sem_faixa,
  (SELECT count(*) FROM (SELECT tipo_id FROM tecido_faixas GROUP BY 1 HAVING count(*) > 6) x)                    AS problemas_tipo_com_mais_de_6,
  (SELECT count(*) FROM tecido_linhas l WHERE NOT EXISTS (SELECT 1 FROM fornecedor_condicoes c
     WHERE c.linha_id = l.id AND c.padrao AND c.ativa))                                                          AS problemas_linha_sem_padrao,
  (SELECT count(*) FROM tecido_tipos)                                                                            AS tipos,
  (SELECT count(*) FROM tecido_faixas)                                                                           AS faixas,
  (SELECT count(*) FROM tecido_precos WHERE origem = 'importado_da_compra')                                      AS precos_importados,
  (SELECT count(*) FROM tecido_faixas tf WHERE NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.faixa_id = tf.id)) AS faixas_sem_preco,
  (SELECT coalesce(sum(current_stock),0) FROM insumos WHERE btrim(coalesce(fabric_family,'')) <> '')             AS saldo_tecidos_igual_ao_antes,
  (SELECT count(*) FROM compra_itens)                                                                            AS itens_de_compra_igual_ao_antes;

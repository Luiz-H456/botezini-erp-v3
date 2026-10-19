-- =============================================================================
-- TRAVA DE AMBIENTE — cole no TOPO de qualquer script que apague ou altere dados
--
-- POR QUE ISTO EXISTE
-- Os scripts de limpeza e migração foram escritos para o banco de
-- desenvolvimento, e a única proteção era um `v_confirmo := false` que o
-- usuário troca para true. Isso protege contra rodar sem querer — não protege
-- contra rodar no BANCO ERRADO. Em 2026-07-31 um script de deduplicação de
-- clientes foi executado na produção e apagou os clientes de lá.
--
-- COMO USAR
--   1. Rode UMA VEZ, em cada banco, o bloco "MARCAR AMBIENTE" abaixo,
--      com o valor correto ('dev' ou 'prod').
--   2. Cole o bloco "VERIFICAR" no topo de todo script destrutivo.
--
-- A marca fica numa tabela do próprio banco, então ela viaja com ele: um dump
-- restaurado noutro projeto continua sabendo o que é.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- MARCAR AMBIENTE — rode uma vez por banco, ajustando o valor
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._ambiente (
  id          int PRIMARY KEY DEFAULT 1,
  tipo        text NOT NULL,
  descricao   text,
  marcado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT _ambiente_unica_linha CHECK (id = 1),
  CONSTRAINT _ambiente_tipo_valido CHECK (tipo IN ('dev', 'prod'))
);

INSERT INTO public._ambiente (id, tipo, descricao)
VALUES (1, 'dev', 'AJUSTE AQUI: dev ou prod')      -- <<<<<< troque antes de rodar
ON CONFLICT (id) DO UPDATE
  SET tipo = EXCLUDED.tipo, descricao = EXCLUDED.descricao, marcado_em = now();

COMMENT ON TABLE public._ambiente IS
  'Identifica este banco como dev ou prod. Lida pela trava dos scripts destrutivos.';


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICAR — cole este bloco no TOPO de todo script que apaga ou altera dados
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_tipo text;
BEGIN
  IF to_regclass('public._ambiente') IS NULL THEN
    RAISE EXCEPTION
      'Banco sem marca de ambiente. Rode supabase/_TRAVA_ambiente.sql antes. '
      'Recusando executar script destrutivo em banco nao identificado.';
  END IF;

  SELECT tipo INTO v_tipo FROM public._ambiente WHERE id = 1;

  IF v_tipo <> 'dev' THEN
    RAISE EXCEPTION
      'ESTE BANCO ESTA MARCADO COMO "%". Script destrutivo abortado. '
      'Se realmente precisa rodar em producao, faca backup e remova esta trava '
      'conscientemente — nao por engano.', v_tipo;
  END IF;

  RAISE NOTICE 'Ambiente conferido: % — pode prosseguir.', v_tipo;
END $$;

-- ============================================================================
-- Parte E (30/10): tabelas de custo de silk e DTF, por estamparia.
--
-- O QUE FAZ
--   custo_silk: a grade de cada estamparia — tamanho × número de cores → valor por
--               peça. Uma linha por (estamparia, tamanho, cores).
--   custo_dtf:  o que cada estamparia de DTF cobra — valor do metro linear, largura
--               útil do rolo, espaço entre artes e frete por pedido. Uma linha por
--               estamparia. O app calcula o encaixe (quantas cabem, quantos metros).
--   Bordado não ganha tabela: usa as notas do bordado que já existem
--   (preco_por_mil_pontos, valor_minimo, valor_da_arte) e os pontos da estampa.
--
-- ACESSO
--   Custo é dado de dinheiro: só admin e gerente leem e gravam, como o preço da
--   tabela verdade (is_admin_or_manager, de v3_1_tabela_verdade.sql). A fábrica
--   não vê.
--
-- O QUE ASSUME
--   supabase/v3_1_tabela_verdade.sql já rodou (cria is_admin_or_manager).
--   Estamparia é um fornecedor (public.suppliers). Só cria tabelas novas.
--
-- COMO RODAR
--   Inteiro, no SQL Editor. Pode rodar de novo (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

-- ANTES (somente leitura): a função de acesso existe? as tabelas já existem?
SELECT to_regprocedure('public.is_admin_or_manager()') IS NOT NULL AS tem_funcao_de_acesso,
       to_regclass('public.custo_silk') IS NOT NULL AS ja_tem_custo_silk,
       to_regclass('public.custo_dtf')  IS NOT NULL AS ja_tem_custo_dtf;

BEGIN;

CREATE TABLE IF NOT EXISTS public.custo_silk (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  fornecedor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  tamanho       text NOT NULL CHECK (btrim(tamanho) <> ''),
  cores         integer NOT NULL CHECK (cores BETWEEN 1 AND 12),
  valor         numeric(12,4) NOT NULL CHECK (valor >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custo_silk_unico UNIQUE (fornecedor_id, tamanho, cores)
);

CREATE TABLE IF NOT EXISTS public.custo_dtf (
  fornecedor_id      uuid PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id            uuid,
  largura_util_cm    numeric(8,2)  NOT NULL CHECK (largura_util_cm > 0),
  valor_metro_linear numeric(12,4) NOT NULL CHECK (valor_metro_linear >= 0),
  espaco_entre_cm    numeric(6,2)  NOT NULL DEFAULT 1 CHECK (espaco_entre_cm >= 0),
  frete              numeric(12,2) NOT NULL DEFAULT 0 CHECK (frete >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custo_silk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custo_dtf  ENABLE ROW LEVEL SECURITY;

-- Uma política por tabela, para tudo: políticas somam por OU, e uma frouxa esquecida anularia esta.
DROP POLICY IF EXISTS custo_silk_gestao ON public.custo_silk;
CREATE POLICY custo_silk_gestao ON public.custo_silk FOR ALL TO authenticated
  USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());
DROP POLICY IF EXISTS custo_dtf_gestao ON public.custo_dtf;
CREATE POLICY custo_dtf_gestao ON public.custo_dtf FOR ALL TO authenticated
  USING (public.is_admin_or_manager()) WITH CHECK (public.is_admin_or_manager());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custo_silk, public.custo_dtf TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- DEPOIS (somente leitura): as duas tabelas, cada uma com UMA política e RLS ligado.
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ligado,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
FROM pg_class c WHERE c.relname IN ('custo_silk', 'custo_dtf') ORDER BY 1;

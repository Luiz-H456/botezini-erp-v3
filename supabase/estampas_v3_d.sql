-- ============================================================================
-- Parte D (30/10): biblioteca de estampas, com arquivos.
--
-- O QUE FAZ
--   A tabela artes_bordado passa a guardar estampa de qualquer técnica (bordado,
--   silk, DTF, sublimação), e cada uma ganha a lista de arquivos dela (PDF, foto,
--   Corel .cdr, matriz .dst). Os arquivos ficam no bucket financial-attachments,
--   como as fotos de orçamento e de cliente. A coluna guarda só o caminho.
--
-- POR QUE NA MESMA TABELA
--   A arte de bordado JÁ É uma estampa (cliente, medidas, pontos, onde está o
--   arquivo), e o histórico de personalização aponta para ela (arte_id). Uma
--   tabela nova de "estampas" deixaria duas listas para a mesma coisa. O nome da
--   tabela fica por compatibilidade; na tela ela se chama Estampas.
--
-- O QUE ASSUME
--   supabase/personalizacao_precos_e_artes.sql já rodou (a tabela existe).
--   Puramente aditivo: só ADD COLUMN com padrão. Nenhuma linha muda de valor;
--   as artes que existem ficam como bordado, que é o que elas são.
--
-- COMO RODAR
--   Inteiro, no SQL Editor. Pode rodar de novo (IF NOT EXISTS).
-- ============================================================================

-- ANTES (somente leitura): quantas artes existem e se as colunas já estão lá.
SELECT (SELECT count(*) FROM public.artes_bordado) AS artes,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'artes_bordado' AND column_name = 'tecnica')  AS ja_tem_tecnica,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'artes_bordado' AND column_name = 'arquivos') AS ja_tem_arquivos;

BEGIN;

ALTER TABLE public.artes_bordado
  ADD COLUMN IF NOT EXISTS tecnica text NOT NULL DEFAULT 'bordado',
  ADD COLUMN IF NOT EXISTS arquivos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS numero_de_cores integer;

DO $$ BEGIN
  ALTER TABLE public.artes_bordado
    ADD CONSTRAINT artes_bordado_tecnica_valida CHECK (tecnica IN ('bordado', 'silk', 'dtf', 'sublimacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.artes_bordado
    ADD CONSTRAINT artes_bordado_cores_pos CHECK (numero_de_cores IS NULL OR numero_de_cores > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.artes_bordado IS
  'Biblioteca de estampas de todas as técnicas (parte D, 30/10). O nome é histórico: começou só com bordado.';
COMMENT ON COLUMN public.artes_bordado.arquivos IS
  'Caminhos no bucket financial-attachments (PDF, foto, .cdr, .dst). Gravado só por definirArquivosDaEstampa.';

COMMIT;

-- Recarrega o cache do PostgREST para as colunas novas aparecerem na API.
NOTIFY pgrst, 'reload schema';

-- DEPOIS (somente leitura): todas as artes viraram bordado, sem arquivo, e nada sumiu.
SELECT tecnica, count(*) AS artes, sum(cardinality(arquivos)) AS arquivos
FROM public.artes_bordado GROUP BY tecnica;

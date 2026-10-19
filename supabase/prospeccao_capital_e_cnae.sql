-- =============================================================================
-- PROSPECÇÃO: CAPITAL SOCIAL, CNAE E DATA DE ABERTURA
--
-- Rodar no SQL Editor do Supabase. Só acrescenta colunas — nenhuma existente é
-- alterada, nenhum dado é tocado.
--
-- A fase 4 do plano da Prospecção 2.0. Vem DEPOIS da fila do dia de propósito:
-- ela é a única que exige trabalho de fora do sistema (mudar o pré-prompt que
-- gera as planilhas de leads), e na primeira versão do plano estava bloqueando
-- justamente a parte que mais muda a rotina.
--
-- O QUE CADA UMA RESPONDE
--
--   capital_social   separa a indústria da prestadora de mesmo porte. Oitenta
--                    funcionários com capital de milhões e oitenta com capital
--                    de dez mil pedem conversas diferentes, e hoje aparecem
--                    lado a lado, iguais.
--
--   cnae_principal   é mais fino que o segmento: "fabricação de produtos
--                    alimentícios" e "restaurante" caem os dois em alimentação,
--                    e o uniforme de um não se parece com o do outro.
--
--   data_abertura    empresa nova costuma não ter fornecedor fixo de uniforme.
--
-- NENHUMA É OBRIGATÓRIA, e isso é uma decisão. Lead sem capital social continua
-- entrando e aparece numa faixa própria — do mesmo jeito que "sem porte
-- informado" já é hoje uma categoria e não um resto escondido. Se fossem
-- obrigatórias, a importação passaria a recusar exatamente os leads que já
-- estão cadastrados.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ANTES — quantos leads existem, e quantos já teriam os campos
--    (somente leitura)
-- ---------------------------------------------------------------------------
SELECT count(*)                                              AS leads,
       count(*) FILTER (WHERE porte_funcionarios > 0)        AS com_porte,
       count(*) FILTER (WHERE segmento IS NOT NULL)          AS com_segmento,
       count(*) FILTER (WHERE cnpj_raiz IS NOT NULL)         AS com_raiz_de_cnpj,
       count(DISTINCT cnpj_raiz)                             AS raizes_distintas
  FROM public.leads;
-- A diferença entre `com_raiz_de_cnpj` e `raizes_distintas` é o tamanho do
-- ganho da fase 3: cada unidade a mais na mesma raiz é uma abordagem repetida
-- que deixa de ser feita.


-- ---------------------------------------------------------------------------
-- 2. AS COLUNAS
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capital_social  numeric(15,2);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cnae_principal  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_abertura   date;

-- Capital negativo não existe. O CHECK aceita NULL — que é "não informado",
-- diferente de zero, que seria uma afirmação sobre a empresa.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_capital_social_nonneg;
ALTER TABLE public.leads ADD  CONSTRAINT leads_capital_social_nonneg
  CHECK (capital_social IS NULL OR capital_social >= 0);

COMMENT ON COLUMN public.leads.capital_social IS
  'Capital social em reais. NULL = não informado, e não zero.';
COMMENT ON COLUMN public.leads.cnae_principal IS
  'CNAE principal. Mais fino que segmento: separa fábrica de alimento de restaurante.';
COMMENT ON COLUMN public.leads.data_abertura IS
  'Abertura da empresa. Empresa nova costuma não ter fornecedor fixo.';

-- Índice só no capital: é o único dos três que a fila do dia ordena. CNAE e
-- data de abertura são lidos junto com a linha, não filtrados em massa —
-- índice ali seria peso de escrita sem ganho de leitura.
CREATE INDEX IF NOT EXISTS idx_leads_capital_social
  ON public.leads (capital_social DESC NULLS LAST);


-- ---------------------------------------------------------------------------
-- 3. DEPOIS — as três colunas existem?
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'leads'
   AND column_name IN ('capital_social', 'cnae_principal', 'data_abertura')
 ORDER BY column_name;
-- Espera-se três linhas, todas com is_nullable = YES.

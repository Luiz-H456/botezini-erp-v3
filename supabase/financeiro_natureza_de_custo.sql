-- =============================================================================
-- FINANCEIRO — natureza do custo (fixo x variável)
-- Run no SQL Editor do Supabase.
--
-- Por que existe: sem separar custo fixo de variável não há ponto de
-- equilíbrio, e sem ponto de equilíbrio não dá para responder "a operação se
-- sustenta?". É a única informação que falta para essa conta.
--
-- Por que na CATEGORIA e não na conta: a categoria é classificada uma vez
-- (~20 delas) e toda conta nova já nasce classificada. Marcar conta a conta
-- seria trabalho para sempre, e a que alguém esquecesse ficaria fora do
-- cálculo — o ponto de equilíbrio degradaria em silêncio com o tempo.
--
-- Por que NULL é permitido e não tem default: categoria não classificada fica
-- FORA do cálculo e aparece numa lista com o valor que representa. Chutar um
-- default ('variavel', por exemplo) produziria um ponto de equilíbrio errado
-- com aparência de certo, que é pior do que um número faltando — com o valor à
-- vista, quem lê sabe o tamanho da dúvida e decide se o resultado serve.
-- =============================================================================

-- Tudo ou nada: são duas tabelas, e metade aplicada deixaria o painel lendo uma
-- coluna que existe de um lado e não do outro.
BEGIN;

ALTER TABLE public.global_categories
  ADD COLUMN IF NOT EXISTS natureza text;

-- A trava é aqui: só três estados possíveis, e NULL é um deles de propósito.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'global_categories_natureza_check'
  ) THEN
    ALTER TABLE public.global_categories
      ADD CONSTRAINT global_categories_natureza_check
      CHECK (natureza IS NULL OR natureza IN ('fixo', 'variavel'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.global_categories.natureza IS
  'fixo | variavel | NULL (não classificado — fica fora do ponto de equilíbrio, por escolha).';

-- Uma conta pode fugir da categoria: "Serviços" pode ter contador (fixo) e
-- frete (variável). Aqui a obrigação individual sobrescreve.
ALTER TABLE public.financial_obligations
  ADD COLUMN IF NOT EXISTS natureza_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_obligations_natureza_check'
  ) THEN
    ALTER TABLE public.financial_obligations
      ADD CONSTRAINT financial_obligations_natureza_check
      CHECK (natureza_override IS NULL OR natureza_override IN ('fixo', 'variavel'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.financial_obligations.natureza_override IS
  'Sobrescreve a natureza da categoria nesta conta. NULL = segue a categoria.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Verificação:
--
-- 1. Quanto ainda está sem classificar, e onde doer mais:
--    SELECT COALESCE(gc.name, o.category, 'SEM CATEGORIA') AS categoria,
--           COALESCE(gc.natureza, 'NAO CLASSIFICADO')      AS natureza,
--           SUM(o.original_amount)                          AS total
--    FROM public.financial_obligations o
--    LEFT JOIN public.global_categories gc ON gc.id = o.global_category_id
--    WHERE o.type = 'payable' AND o.cancelled_at IS NULL
--    GROUP BY 1, 2
--    ORDER BY total DESC;
--
--    Categoria de R$ 200/mês sem classificar pode ficar; de R$ 8.000, não —
--    o ponto de equilíbrio estaria mentindo.
-- =============================================================================

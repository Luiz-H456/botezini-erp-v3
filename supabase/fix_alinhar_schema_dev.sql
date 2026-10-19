-- =============================================================================
-- Alinhar o schema do DEV antes de receber a migração
--
-- O QUE A COMPARAÇÃO DE FKs REVELOU
-- Os dois bancos divergiram em direções OPOSTAS:
--
--   invoices.order_id -> orders CASCADE
--     · PROD: existe    · DEV: AUSENTE
--     Sem essa FK, apagar pedido no dev deixa a nota fiscal pendurada para
--     sempre. É a origem das "coisas no financeiro" que sobraram. A coluna
--     também virou `text` no dev (foi o que causou o erro uuid = text).
--
--   financial_obligations.order_id -> orders SET NULL
--     · PROD: AUSENTE   · DEV: existe
--     No prod não há FK nenhuma: apagar pedido deixa order_id apontando para
--     um id que não existe mais. Pior que SET NULL — é ponteiro quebrado.
--
-- Este arquivo conserta o DEV, que é o destino da migração. O conserto do
-- PROD está no fim, comentado, porque mexer em schema de produção é decisão
-- sua e pede janela.
-- =============================================================================


-- =============================================================================
-- PASSO 1 — DIAGNÓSTICO (leitura). Rode primeiro.
-- =============================================================================
SELECT
  'invoices.order_id'                                   AS coluna,
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='invoices' AND column_name='order_id') AS tipo_atual,
  (SELECT count(*) FROM public.invoices)                AS linhas_na_tabela,
  (SELECT count(*) FROM public.invoices i
   WHERE i.order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.orders o
                     WHERE o.id::text = i.order_id::text)) AS linhas_orfas;

-- production_logs não entrou na consulta anterior. Confira se existe e se a
-- FK está de pé (ela deveria ser ON DELETE CASCADE):
SELECT tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name = 'production_logs';


-- =============================================================================
-- PASSO 2 — CONSERTAR O DEV. Troque false por true.
--
-- Ordem: limpar órfão -> converter tipo -> recriar a FK.
-- Não dá para criar a FK com órfão na tabela: o Postgres recusa.
-- =============================================================================
DO $$
DECLARE
  v_confirmo boolean := false;   -- <<<<<< TROQUE PARA true

  v_tipo text;
  v_orfas int;
BEGIN
  IF NOT v_confirmo THEN
    RAISE NOTICE 'NADA FOI ALTERADO. Rode o PASSO 1, confira, e troque para true.';
    RETURN;
  END IF;

  -- 2.1 Fora os órfãos (a FK não nasce com eles presentes)
  DELETE FROM public.invoices i
  WHERE i.order_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = i.order_id::text);
  GET DIAGNOSTICS v_orfas = ROW_COUNT;
  RAISE NOTICE 'notas fiscais orfas removidas: %', v_orfas;

  -- 2.2 Se a coluna virou text, volta para uuid
  SELECT data_type INTO v_tipo FROM information_schema.columns
  WHERE table_schema='public' AND table_name='invoices' AND column_name='order_id';

  IF v_tipo = 'text' THEN
    ALTER TABLE public.invoices
      ALTER COLUMN order_id TYPE uuid USING NULLIF(order_id, '')::uuid;
    RAISE NOTICE 'invoices.order_id convertido de text para uuid';
  ELSE
    RAISE NOTICE 'invoices.order_id ja e % — sem conversao', v_tipo;
  END IF;

  -- 2.3 Recria a FK que existe no prod
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
      AND tc.table_name='invoices' AND kcu.column_name='order_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK invoices.order_id -> orders (CASCADE) criada';
  ELSE
    RAISE NOTICE 'FK invoices.order_id ja existe';
  END IF;
END;
$$;


-- =============================================================================
-- PASSO 3 — CONFERÊNCIA. Tem que aparecer a FK com CASCADE e tipo uuid.
-- =============================================================================
SELECT
  (SELECT data_type FROM information_schema.columns
   WHERE table_schema='public' AND table_name='invoices' AND column_name='order_id') AS tipo,
  (SELECT rc.delete_rule
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
   JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
   WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
     AND tc.table_name='invoices' AND kcu.column_name='order_id') AS ao_apagar_pedido;


-- =============================================================================
-- PASSO 4 — CONSERTO DO PROD (opcional, decisão sua)
--
-- O prod não tem FK em financial_obligations.order_id. Sem ela, apagar pedido
-- deixa a conta com um order_id apontando para o vazio — e é assim que nasce
-- recebível fantasma também lá.
--
-- `NOT VALID` faz a regra valer só para linhas NOVAS, sem travar o histórico
-- que já está sujo. É a forma segura de aplicar em produção.
--
-- Rode ANTES o diagnóstico, para saber o tamanho do estrago:
--
--   SELECT count(*) FROM financial_obligations f
--   WHERE f.order_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id::text = f.order_id::text);
--
-- Se o número for aceitável, aplique:
--
--   ALTER TABLE public.financial_obligations
--     ADD CONSTRAINT financial_obligations_order_id_fkey
--     FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
--     NOT VALID;
--
-- Depois de limpar o histórico, para passar a valer para tudo:
--   ALTER TABLE public.financial_obligations
--     VALIDATE CONSTRAINT financial_obligations_order_id_fkey;
-- =============================================================================

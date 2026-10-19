-- =============================================================================
-- CADASTROS — inscrição estadual e padrões do fornecedor
-- Run no SQL Editor do Supabase. Puramente aditivo: nenhuma coluna é removida
-- ou alterada, e todas nascem NULL.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Inscrição estadual do cliente
--
-- Uniforme é venda de mercadoria, então a nota tem ICMS e a IE do destinatário
-- entra nela. Sem o campo, esse dado ficava no WhatsApp ou na cabeça de alguém,
-- e a nota travava na hora de emitir — que é o pior momento para descobrir.
--
-- Fica separada do CNPJ porque "ISENTO" é um valor legítimo e frequente
-- (empresa do Simples, cliente não contribuinte), e não caberia num campo
-- numérico.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS inscricao_estadual text;

COMMENT ON COLUMN public.clients.inscricao_estadual IS
  'IE do cliente para a nota fiscal. Aceita "ISENTO" — é um valor válido, não ausência.';

-- ---------------------------------------------------------------------------
-- 2. Padrões do fornecedor
--
-- `default_cost_center_id` já existia e resolvia um terço do problema. Faltavam
-- os outros dois campos que se repete em TODO lançamento do mesmo fornecedor.
--
-- São nove decisões para registrar que chegou a conta de luz; com estes
-- padrões, escolher "Cemig" preenche categoria, centro de custo e meio de
-- pagamento, e sobra confirmar. É sugestão, não trava: qualquer lançamento pode
-- divergir do padrão sem alterar o cadastro.
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_global_category_id uuid
    REFERENCES public.global_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_planned_method text;

COMMENT ON COLUMN public.suppliers.default_global_category_id IS
  'Categoria financeira sugerida ao lançar conta deste fornecedor.';
COMMENT ON COLUMN public.suppliers.default_planned_method IS
  'Meio de pagamento habitual deste fornecedor (PIX, Boleto...).';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- Verificação:
--   SELECT company_name, default_cost_center_id, default_global_category_id,
--          default_planned_method
--     FROM public.suppliers LIMIT 10;
-- =============================================================================

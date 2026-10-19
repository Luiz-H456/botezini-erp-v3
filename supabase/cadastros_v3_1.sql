-- =============================================================================
-- Cadastros v3 (S2) — banco que sai no orçamento
--
-- O QUE FAZ
--  - bank_accounts ganha TITULAR e CHAVE_PIX: o orçamento passa a imprimir os
--    dados de um banco cadastrado, e não um texto solto em Minha empresa.
--  - company_profile ganha BANCO_DO_ORCAMENTO_ID: qual banco o orçamento usa.
--    Se o banco for apagado, a escolha volta a vazio e o PDF usa os campos
--    antigos da empresa, que continuam guardados.
--
-- Só acrescenta colunas. Nada é apagado. Pode rodar mais de uma vez.
-- Rode no banco LOCAL da v3 (supabase_db_botezini-v3). Produção fica fora.
-- =============================================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS titular text;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS chave_pix text;

ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS banco_do_orcamento_id uuid
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- O PostgREST guarda o esquema em cache: sem isto as colunas novas só
-- aparecem para o app depois de reiniciar a API.
NOTIFY pgrst, 'reload schema';

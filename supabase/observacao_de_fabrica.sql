-- =============================================================================
-- Observação geral de fábrica
--
-- POR QUE UM CAMPO NOVO, E NÃO O `notes` QUE JÁ EXISTE
-- `notes` é comercial: sai no PDF do orçamento, junto das condições de
-- pagamento, no papel que o cliente lê. Recado de produção escrito ali ou
-- vazava para o cliente, ou simplesmente não era escrito para não vazar — e
-- então não chegava a quem corta.
--
-- São dois leitores diferentes. Um campo só obrigava a escolher qual deles
-- ficaria sem a informação.
--
-- `factory_notes` é interno: aparece na ficha de produção e em lugar nenhum
-- mais. Aceita várias linhas e recuo por Tab; a ficha preserva a formatação.
--
-- A coluna vai nas DUAS tabelas porque a observação nasce no orçamento e
-- precisa atravessar a conversão: quem corta lê a ficha do PEDIDO, não a do
-- orçamento. Copiar no momento da conversão (em vez de seguir a referência)
-- é deliberado — o pedido é o registro do que foi combinado, e editar o
-- orçamento meses depois não pode reescrever a ficha do que já foi produzido.
--
-- Seguro de rodar mais de uma vez. Não altera nem apaga nada existente.
-- Rode no SQL Editor do Supabase.
-- =============================================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS factory_notes text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS factory_notes text;

COMMENT ON COLUMN public.budgets.factory_notes IS
  'Observação geral de fábrica. Interna: sai só na ficha de produção, nunca no PDF do cliente.';

COMMENT ON COLUMN public.orders.factory_notes IS
  'Observação geral de fábrica, copiada do orçamento na conversão. Só na ficha de produção.';

-- =============================================================================
-- Até rodar isto, o app continua funcionando: o repositório detecta a coluna
-- ausente, salva o orçamento e o pedido SEM a observação de fábrica e registra
-- um aviso no console apontando para este arquivo. O que não pode acontecer é
-- o cadastro inteiro parar por causa de um campo novo.
--
-- VERIFICAÇÃO
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('budgets', 'orders')
--     AND column_name = 'factory_notes';
--
-- Devem voltar duas linhas.
-- =============================================================================

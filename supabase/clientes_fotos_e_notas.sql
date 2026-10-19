-- =============================================================================
-- Fotos e observações do cliente
--
-- O QUE É
-- Duas coisas que hoje só existem na cabeça de quem atende o cliente:
--
--  - NOTES: modelo de peça combinado, posição do bordado, jeito de pedir. Texto
--    livre, porque cada cliente tem o seu.
--  - REFERENCE_PHOTOS: logo, arte aprovada, peça de amostra, print que o
--    cliente mandou.
--
-- POR QUE NO CLIENTE E NÃO NO ORÇAMENTO
-- O orçamento já tem fotos de referência (ver phase11_fotos_referencia.sql),
-- mas elas morrem com aquele orçamento específico. O logo do cliente e a arte
-- que ele aprovou servem para TODOS os pedidos futuros — sem isto, cada
-- orçamento novo reabre a conversa "me manda a arte de novo" com quem já
-- mandou uma vez.
--
-- ARMAZENAMENTO
-- Mesmo bucket `financial-attachments` que orçamento e financeiro já usam —
-- reaproveitar evita bucket novo com política própria. Aqui guardamos só os
-- CAMINHOS, nunca o binário.
--
-- Rode no banco onde o app roda.
-- =============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS notes text;

-- jsonb, não text[]: o repositório faz upsert do objeto inteiro vindo do JS, e
-- um array JS serializa direto para jsonb sem conversão manual.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS reference_photos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clients.notes IS
  'Observações livres: modelo combinado, preferência de acabamento, jeito de pedir.';
COMMENT ON COLUMN public.clients.reference_photos IS
  'Caminhos das fotos no bucket financial-attachments (logo, arte aprovada, amostra). Array JSON de strings.';

-- Trava de formato: tem de ser array JSON, não objeto nem escalar. Sem isto um
-- bug no cliente poderia gravar {"a":1} e a tela quebraria ao chamar .length.
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_reference_photos_array;
ALTER TABLE public.clients ADD  CONSTRAINT clients_reference_photos_array
  CHECK (jsonb_typeof(reference_photos) = 'array');

NOTIFY pgrst, 'reload schema';

-- Notas da tabela de preços do produto.
--
-- As três faixas (T1/T2/T3) são só números: não dizem a partir de quantas peças
-- cada uma vale, para que tipo de cliente, nem o que já está incluso. Esse
-- critério hoje mora na cabeça de quem cadastrou, e quem orça depois não tem
-- como saber por que o T2 é o que é.
--
-- Fica em coluna própria e não no `notes` do produto porque são coisas
-- diferentes: `notes` descreve a peça, esta descreve o preço. Juntas, quem
-- consulta na hora de orçar teria que garimpar.
--
-- O app tolera esta migração não aplicada: salva o produto sem o campo e avisa
-- no console (ver saveProduct em inventoryRepository.ts).

BEGIN;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS price_notes text;

COMMENT ON COLUMN public.products.price_notes IS
    'Critério das faixas T1/T2/T3: quantidade mínima, tipo de cliente, o que está incluso.';

COMMIT;

-- O PostgREST guarda o schema em cache; sem isto a coluna nova só aparece no
-- próximo restart e o app continua achando que ela não existe.
NOTIFY pgrst, 'reload schema';

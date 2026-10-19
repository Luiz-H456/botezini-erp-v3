-- "Este produto é o mesmo que aquele."
--
-- A mesma peça acabou cadastrada mais de uma vez com nomes ligeiramente
-- diferentes — "CAMISA BRIM", "Camisa de Brim", "CAMISA BRIM PROFISSIONAL".
-- Cada cadastro leva um pedaço do histórico, então nenhum tem amostra para
-- dizer nada sobre preço, e a mesma peça aparece três vezes na busca.
--
-- A ligação é por apelido, não por fusão: nada é apagado e os orçamentos
-- antigos continuam apontando para o cadastro que usaram na época. O que muda
-- é que histórico, médias e curva de desconto passam a somar os dois como um.
-- Desfazer é limpar a coluna.
--
-- ON DELETE SET NULL: se o canônico for removido, o apelido volta a ser
-- independente em vez de virar referência quebrada.
--
-- O app tolera esta migração não aplicada: salva o produto sem o vínculo e
-- avisa no console (ver saveProduct em inventoryRepository.ts).

BEGIN;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS canonical_product_id uuid
        REFERENCES public.products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.canonical_product_id IS
    'Produto que vale como oficial quando este é uma variação de nome do mesmo item.';

-- Um produto não pode ser apelido de si mesmo: seria um ciclo de tamanho 1 e
-- deixaria a resolução do canônico em laço infinito.
ALTER TABLE public.products
    DROP CONSTRAINT IF EXISTS products_canonical_nao_e_ele_mesmo;
ALTER TABLE public.products
    ADD CONSTRAINT products_canonical_nao_e_ele_mesmo
        CHECK (canonical_product_id IS NULL OR canonical_product_id <> id);

-- A busca "quais apelidos apontam para este?" roda a cada abertura do cadastro.
CREATE INDEX IF NOT EXISTS products_canonical_product_id_idx
    ON public.products (canonical_product_id)
    WHERE canonical_product_id IS NOT NULL;

COMMIT;

-- O PostgREST guarda o schema em cache; sem isto a coluna nova só aparece no
-- próximo restart e o app continua achando que ela não existe.
NOTIFY pgrst, 'reload schema';

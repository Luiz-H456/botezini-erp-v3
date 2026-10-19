-- =============================================================================
-- "Este insumo é o mesmo que aquele."
--
-- O MESMO TECIDO acabou cadastrado várias vezes com nomes ligeiramente
-- diferentes — "BRIM LEVE", "Brim Leve 100% Algodão", "brim leve azul". Cada
-- cadastro carrega o seu próprio saldo e o seu próprio custo médio, então:
--
--  - o estoque real fica repartido entre três linhas e nenhuma bate com a
--    prateleira;
--  - o custo médio de cada um é calculado sobre uma fração das compras, e o
--    CMV da peça sai errado dependendo de qual foi escolhido na ficha técnica;
--  - o seletor de tecido do orçamento mostra o mesmo pano três vezes.
--
-- A ligação é por apelido, não por fusão: nada é apagado, as fichas técnicas
-- antigas continuam apontando para o cadastro que usaram, e as movimentações
-- de estoque de cada um seguem intactas. O que muda é que as telas passam a
-- somar os dois como um só. Desfazer é limpar a coluna.
--
-- POR QUE NÃO SOMAR O SALDO AUTOMATICAMENTE: saldo é resultado de movimentação,
-- não um número que se digita. Mexer nele aqui criaria uma entrada de estoque
-- sem nota e sem lançamento — o tipo de ajuste silencioso que faz o inventário
-- deixar de ser auditável. A soma acontece na leitura; o saldo de cada cadastro
-- continua sendo a verdade do que entrou e saiu naquele cadastro.
--
-- ON DELETE SET NULL: se o canônico for removido, o apelido volta a ser
-- independente em vez de virar referência quebrada.
--
-- O app tolera esta migração não aplicada: salva o insumo sem o vínculo e
-- avisa no console (ver saveInsumo em inventoryRepository.ts).
-- =============================================================================

BEGIN;

ALTER TABLE public.insumos
    ADD COLUMN IF NOT EXISTS canonical_insumo_id uuid
        REFERENCES public.insumos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.insumos.canonical_insumo_id IS
    'Insumo que vale como oficial quando este é uma variação de nome do mesmo material.';

-- Um insumo não pode ser apelido de si mesmo: seria um ciclo de tamanho 1 e
-- deixaria a resolução do canônico em laço infinito.
ALTER TABLE public.insumos
    DROP CONSTRAINT IF EXISTS insumos_canonical_nao_e_ele_mesmo;
ALTER TABLE public.insumos
    ADD CONSTRAINT insumos_canonical_nao_e_ele_mesmo
        CHECK (canonical_insumo_id IS NULL OR canonical_insumo_id <> id);

-- "Quais apelidos apontam para este?" roda a cada abertura do estoque.
CREATE INDEX IF NOT EXISTS insumos_canonical_insumo_id_idx
    ON public.insumos (canonical_insumo_id)
    WHERE canonical_insumo_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

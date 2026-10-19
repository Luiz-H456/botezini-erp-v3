-- =============================================================================
-- Clientes: mesclagem (duplicados) e grupo econômico (filiais)
--
-- SÃO DUAS COISAS DIFERENTES, e é por isso que são duas colunas:
--
--  MESCLAGEM (canonical_client_id) — "este cadastro é o MESMO que aquele".
--  A mesma empresa acabou cadastrada duas vezes com grafias diferentes
--  ("Frigorífico Aurora", "AURORA FRIGORIFICO LTDA"). Cada cadastro levou um
--  pedaço do histórico, então nenhum tem a conta completa do cliente. Ligar em
--  vez de apagar: nada se perde, os orçamentos antigos continuam apontando
--  para o cadastro que usaram, e histórico/financeiro passam a somar os dois
--  como um só. Desfazer é limpar a coluna.
--
--  GRUPO (grupo_economico) — "são empresas DIFERENTES do mesmo dono".
--  A granja tem três CNPJs e duas subempresas. Cada uma compra por si, tem sua
--  nota e sua conta a receber, e continuam clientes separados — mas quem
--  negocia quer ver o total do grupo. Texto simples e não FK porque o grupo não
--  é uma entidade com atributos próprios: é um nome que amarra os cadastros, do
--  mesmo jeito que fabric_family amarra as três faixas do mesmo tecido.
--
-- Misturar as duas quebraria as duas: mesclar filiais somaria CNPJs distintos
-- num cadastro só e a nota sairia errada; agrupar duplicatas deixaria o mesmo
-- cliente contado duas vezes dentro do próprio grupo.
--
-- O app tolera esta migração não aplicada: salva o cliente sem os campos novos
-- e avisa no console (ver saveClient em crmRepository.ts).
-- =============================================================================

BEGIN;

-- ── Mesclagem ────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS canonical_client_id uuid
        REFERENCES public.clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clients.canonical_client_id IS
    'Cliente que vale como oficial quando este é uma duplicata do mesmo CNPJ/empresa.';

-- Um cliente não pode ser apelido de si mesmo: seria um ciclo de tamanho 1 e
-- deixaria a resolução do canônico em laço infinito.
ALTER TABLE public.clients
    DROP CONSTRAINT IF EXISTS clients_canonical_nao_e_ele_mesmo;
ALTER TABLE public.clients
    ADD CONSTRAINT clients_canonical_nao_e_ele_mesmo
        CHECK (canonical_client_id IS NULL OR canonical_client_id <> id);

-- "Quais duplicatas apontam para este?" roda a cada abertura do cadastro.
CREATE INDEX IF NOT EXISTS clients_canonical_client_id_idx
    ON public.clients (canonical_client_id)
    WHERE canonical_client_id IS NOT NULL;

-- ── Grupo econômico ──────────────────────────────────────────────────────────
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS grupo_economico text;

COMMENT ON COLUMN public.clients.grupo_economico IS
    'Nome do grupo/holding. Empresas diferentes do mesmo dono (matriz e filiais) '
    'compartilham o nome e ganham uma página consolidada. Não confundir com '
    'canonical_client_id, que é duplicata do MESMO cliente.';

-- A página do grupo filtra por este nome; sem índice seria varredura da tabela
-- inteira a cada abertura.
CREATE INDEX IF NOT EXISTS clients_grupo_economico_idx
    ON public.clients (grupo_economico)
    WHERE grupo_economico IS NOT NULL;

COMMIT;

-- O PostgREST guarda o schema em cache; sem isto as colunas novas só aparecem
-- no próximo restart e o app continua achando que elas não existem.
NOTIFY pgrst, 'reload schema';

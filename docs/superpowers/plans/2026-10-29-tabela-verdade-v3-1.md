# Tabela verdade de tecidos (v3.1) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada fornecedor passa a ter a tabela de preços dos seus tecidos (linha › tipo › faixas de cor × condições de pagamento, com frete e histórico de reajuste), e o custo de referência que sai dela alimenta orçamento, cadastro de produto, lançar compra e lucro do pedido.

**Architecture:** Tabelas novas por cima de `insumos` (caminho A da spec): cada faixa aponta para o insumo que estoque, compra e ficha já usam. Toda escrita passa por funções `SECURITY DEFINER` no banco. A conta (preço vigente, frete na unidade, custo de referência, comparação com o comprado) mora numa regra pura em `src/utils/tabelaVerdade.ts`; as telas e os quatro consumidores leem o mesmo mapa `insumo_id → custo de referência`.

**Tech Stack:** React 18 + TS + Vite + Tailwind v4 (tokens em `src/components/finance/ui/estilo.ts`), Supabase/PostgREST, PostgreSQL 17 (banco local da v3 no Docker), testes com `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-29-tabela-verdade-v3-1-design.md` (commit `1d757df`).

## Global Constraints

- Branch `feat/v3.1-tabela-verdade`. Nunca `main`, nunca `publicar-v3` (publica na Vercel). Push só quando o Luiz pedir.
- Nada no banco de produção. SQL roda primeiro no banco local da v3 (`127.0.0.1:55322`, Docker); o Luiz roda no novo.
- Regra de negócio em `src/utils/`, sem import do app; testável com `node --test`.
- Nenhuma página fala com o Supabase: repositório → hook → página.
- Escrita da tabela verdade só por RPC (`salvar_comercial`, `salvar_linha`, `salvar_tecido_tipo`, `reajustar_precos`).
- Dinheiro é da gestão: `tecido_precos`, `fornecedor_condicoes`, `fornecedor_frete` só para `is_admin_or_manager()`.
- Visual pelo `estilo.ts`; números com `src/utils/numeros.ts`.
- Ausência é informação: falta de preço/frete vira pendência, nunca zero.
- `MAX_FAIXAS = 6`, `LIMITE_ACIMA_PCT = 2`, `JANELA_DIAS = 90`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca `git add` em `supabase/snippets/`.
- Suíte: `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts" "src/utils/fabrica/*.test.ts"`; depois `npx tsc --noEmit` e `npx vite build`.

## Decisões tomadas no plano (rulings sobre a spec)

1. **Condições e frete moram sempre na linha; "usa o do fornecedor" é sincronização.** O fornecedor guarda um *modelo* (`linha_id IS NULL`); cada linha tem as suas próprias linhas de condição e de frete. Com a opção ligada, a função `_sincronizar_comercial_da_linha` copia o modelo para a linha (casando por `origem_id`, e adotando condição de mesmo nome). Motivo: os preços apontam sempre para uma condição da própria linha, então ligar/desligar a opção nunca precisa remapear preço. Custo se errado: uma coluna `origem_id` a mais.
2. **Nome do tipo é único no sistema todo** (não só na linha), sem diferenciar maiúsculas. Motivo: `fabric_family` é a chave que o orçamento usa para casar cor e insumo; dois tipos de mesmo nome misturariam cartelas.
3. **Faixa sem preço → custo de referência `null`**, e o consumidor cai para a próxima origem (custo médio etc.). A spec dizia "valor só do frete"; um piso feito só de frete esconderia o tecido inteiro. A pendência `faixa sem preço` continua visível na tabela.
4. **Remover faixa:** recusado se o insumo tiver saldo, movimento, compra, ficha, apelido, produto com tecido padrão, ou aparecer em orçamento/pedido. Sem nada disso, a faixa **e o insumo** saem (não há coluna de "desativado" em `insumos`, e nada aponta para ele).
5. **Edição na grade corrige o preço vigente** (mesmo `vale_desde`); **Reajustar** cria `vale_desde` novo. Célula sem preço digitada na grade cria preço com `vale_desde` = hoje.
6. O `NovoTecidoModal` dá lugar a `EditorDeTecido` (faixas livres de 1 a 6). "Novo tecido" no Estoque leva à página do fornecedor.

## Review Focus

1. **Família antiga com o mesmo nome escrita de jeitos diferentes** (`Brim Leve` × `BRIM LEVE `): a migração agrupa por `btrim(fabric_family)` e o índice único é `lower(nome)`. Esperado: um tipo só, nenhuma falha de unicidade. → teste na Task 1 (passo de consulta "famílias que colidem sem diferenciar maiúsculas").
2. **Rodar o SQL duas vezes:** a segunda vez não pode duplicar tipo, faixa, condição nem preço. → Task 1, passo de idempotência.
3. **Tecido comprado em metro com frete por kg e sem rendimento:** esperado pendência `tecido em kg sem rendimento`, não divisão por zero/`Infinity`. → teste na Task 2.
4. **Compra anterior a qualquer preço da tabela** (preço importado só a partir de uma data): ela entra em menor/média/maior, mas não na comparação; com só compras assim, `acima = false`. → teste na Task 2.
5. **Renomear a faixa ou o tipo** depois de ter cartela, orçamento e estoque: o orçamento continua achando a cor (insumo, cartela e `fabric_family` atualizados juntos). → Task 1, consulta de depois do teste manual de renomear.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/v3_1_tabela_verdade.sql` (novo) | tabelas, RLS, funções, migração, consultas de antes/depois |
| `src/utils/tabelaVerdade.ts` (+ `.test.ts`) (novo) | regra pura: preço vigente, frete, custo de referência, comparação |
| `src/utils/custoDaPeca.ts` (+ teste) | `custo_referencia` vence `average_unit_cost` |
| `src/utils/fabrica/lancarCompra.ts` (+ teste) | `custoSugerido(...candidatos)` |
| `src/utils/financas/lucroPorPedido.ts` (+ teste) | origem `'tabela'` entre o pago e a última compra |
| `src/utils/nomeDeTecido.ts` (+ teste) | faixa vira texto livre; `nomeDoInsumoDaFaixa(familia, faixa: string)` |
| `src/types/index.ts` | tipos da tabela verdade; `ColorTier` vira `string`; `faixa_id` |
| `src/repositories/tabelaVerdadeRepository.ts` (novo) | leitura do catálogo, RPCs, compras dos insumos |
| `src/utils/escritasDeRisco.test.ts` | trava: tabela verdade só grava por RPC |
| `src/hooks/useTabelaVerdade.ts` (novo) | catálogo da página + mapa de referência com cache |
| `src/components/tabelaVerdade/*` (novo) | `ConfigComercial`, `TabelaDePrecos`, `CartaoDoTipo`, `ComprasReais`, `ReajusteModal`, `EditorDeTecido`, `ComprasDoFornecedor` |
| `src/pages/masterdata/PaginaDoFornecedor.tsx` (novo) | página com abas Dados / Tabela de preços / Compras |
| `src/pages/MasterData.tsx`, `src/App.tsx` | abrir a página do fornecedor (lista e link do Estoque) |
| `src/pages/Inventory.tsx` | tecidos agrupados por fornecedor › linha › tipo; "abrir na tabela" |
| `src/components/budgets/BudgetEditor.tsx`, `CustoDaPecaBadge.tsx`, `src/components/masterdata/ProductForm.tsx`, `src/components/pcp/LancarCompraModal.tsx`, `src/components/vendas/LucroPorPedido.tsx` | consumidores |

---

### Task 1: Banco — tabelas, funções, migração (`supabase/v3_1_tabela_verdade.sql`)

**Files:**
- Create: `supabase/v3_1_tabela_verdade.sql`

**Interfaces:**
- Produces (tabelas): `tecido_linhas`, `fornecedor_condicoes`, `fornecedor_frete`, `tecido_tipos`, `tecido_faixas`, `tecido_precos`; colunas `insumos.faixa_id`, `fabric_colors.faixa_id`.
- Produces (RPCs, todas `jsonb → uuid|void`):
  - `salvar_comercial(p jsonb) → void` — `{ fornecedor_id, linha_id?, usa_frete_do_fornecedor?, usa_condicoes_do_fornecedor?, frete?: {modo, valor, remessa_tipica_kg}, condicoes?: [{id?, nome, ordem, padrao}] }`
  - `salvar_linha(p jsonb) → uuid` — `{ id?, fornecedor_id, nome, ordem? }`
  - `salvar_tecido_tipo(p jsonb) → uuid` — `{ id?, linha_id, nome, unidade, rendimento_m_por_kg?, composicao?, faixas: [{id?, nome, ordem}], cores: [{nome, hex, faixa}], precos?: [{faixa, condicao_id, vale_desde?, valor}] }` (`faixa` = nome)
  - `reajustar_precos(p jsonb) → void` — `{ vale_desde, precos: [{faixa_id, condicao_id, valor}] }`

- [ ] **Step 1: Subir o banco local e recarregar o dump**

Docker Desktop aberto. Depois:

```powershell
npx supabase start
powershell -ExecutionPolicy Bypass -File .\scripts\v3_carregar_dump.ps1
```

Reaplicar as migrações da v3 em ordem (CLAUDE.md, "Depois de recarregar o dump") e `sh scripts/v3/criar_usuario_teste.sh` e `sh scripts/v3/criar_usuario_teste.sh fabrica`.

- [ ] **Step 2: Escrever o arquivo SQL completo**

```sql
-- =============================================================================
-- TABELA VERDADE DE TECIDOS  (v3.1 — decisão do Luiz em 29/10/2026)
-- Spec: docs/superpowers/specs/2026-10-29-tabela-verdade-v3-1-design.md
-- Fornecedor › linha › tipo (o tecido) › faixas de cor × condições de pagamento,
-- com frete e histórico de reajuste. Cada faixa aponta para o insumo que o estoque,
-- a compra e a ficha já usam. Só acrescenta; nada é apagado. Pode rodar mais de uma vez.
-- Pré-requisito: supabase/compras_por_pedido.sql (compras, compra_itens) já aplicado.
-- =============================================================================

-- ANTES (somente leitura)
SELECT (SELECT count(DISTINCT btrim(fabric_family)) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '') AS familias,
       (SELECT count(*) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '')                        AS insumos_de_tecido,
       (SELECT coalesce(sum(current_stock),0) FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '')    AS saldo_tecidos,
       (SELECT count(*) FROM public.fabric_colors WHERE is_active)                                                  AS cores_ativas,
       (SELECT count(*) FROM public.compra_itens)                                                                   AS itens_de_compra;
-- Famílias cujas faixas têm fornecedores diferentes (ficam no fornecedor da faixa Padrão)
SELECT btrim(fabric_family) AS familia, count(DISTINCT supplier_id) AS fornecedores
FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY 1 HAVING count(DISTINCT supplier_id) > 1;
-- Famílias que colidem sem diferenciar maiúsculas (viram um tipo só)
SELECT lower(btrim(fabric_family)) AS chave, array_agg(DISTINCT fabric_family) AS grafias
FROM public.insumos WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY 1 HAVING count(DISTINCT fabric_family) > 1;
-- Insumos de tecido fora de família (não migram)
SELECT id, name FROM public.insumos WHERE lower(coalesce(category,'')) = 'tecidos' AND btrim(coalesce(fabric_family,'')) = '';

-- 1. Tabelas -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tecido_linhas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id               uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  nome                        text NOT NULL CHECK (btrim(nome) <> ''),
  ordem                       int  NOT NULL DEFAULT 0,
  usa_frete_do_fornecedor     boolean NOT NULL DEFAULT true,
  usa_condicoes_do_fornecedor boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tecido_linhas_nome_unico UNIQUE (fornecedor_id, nome)
);

CREATE TABLE IF NOT EXISTS public.fornecedor_condicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  linha_id      uuid REFERENCES public.tecido_linhas(id) ON DELETE CASCADE,
  origem_id     uuid REFERENCES public.fornecedor_condicoes(id) ON DELETE SET NULL,
  nome          text NOT NULL CHECK (btrim(nome) <> ''),
  ordem         int  NOT NULL DEFAULT 0,
  padrao        boolean NOT NULL DEFAULT false,
  ativa         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_condicao_nome ON public.fornecedor_condicoes
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
CREATE UNIQUE INDEX IF NOT EXISTS uq_condicao_padrao ON public.fornecedor_condicoes
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE padrao AND ativa;

CREATE TABLE IF NOT EXISTS public.fornecedor_frete (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  linha_id          uuid REFERENCES public.tecido_linhas(id) ON DELETE CASCADE,
  modo              text NOT NULL CHECK (modo IN ('cif','por_kg','fixo','cotacao')),
  valor             numeric(15,4) CHECK (valor IS NULL OR valor >= 0),
  remessa_tipica_kg numeric(15,4) CHECK (remessa_tipica_kg IS NULL OR remessa_tipica_kg > 0),
  CONSTRAINT frete_valor_do_modo CHECK (modo IN ('cif','cotacao') OR valor IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_frete ON public.fornecedor_frete
  (fornecedor_id, coalesce(linha_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.tecido_tipos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id            uuid NOT NULL REFERENCES public.tecido_linhas(id) ON DELETE RESTRICT,
  nome                text NOT NULL CHECK (btrim(nome) <> ''),
  unidade             text NOT NULL CHECK (unidade IN ('kg','m')),
  rendimento_m_por_kg numeric(15,4) CHECK (rendimento_m_por_kg IS NULL OR rendimento_m_por_kg > 0),
  composicao          text,
  ordem               int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tipo_kg_tem_rendimento CHECK (unidade = 'm' OR rendimento_m_por_kg IS NOT NULL)
);
-- Único no sistema todo: o nome é a fabric_family que liga cor e insumo no orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tecido_tipo_nome ON public.tecido_tipos (lower(btrim(nome)));

CREATE TABLE IF NOT EXISTS public.tecido_faixas (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id   uuid NOT NULL REFERENCES public.tecido_tipos(id) ON DELETE CASCADE,
  nome      text NOT NULL CHECK (btrim(nome) <> ''),
  ordem     int  NOT NULL CHECK (ordem BETWEEN 1 AND 6),
  insumo_id uuid NOT NULL UNIQUE REFERENCES public.insumos(id) ON DELETE RESTRICT,
  CONSTRAINT faixa_nome_unico  UNIQUE (tipo_id, nome)  DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT faixa_ordem_unica UNIQUE (tipo_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS public.tecido_precos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_id    uuid NOT NULL REFERENCES public.tecido_faixas(id) ON DELETE CASCADE,
  condicao_id uuid NOT NULL REFERENCES public.fornecedor_condicoes(id) ON DELETE RESTRICT,
  vale_desde  date NOT NULL,
  valor       numeric(15,4) NOT NULL CHECK (valor > 0),
  origem      text NOT NULL DEFAULT 'tabela' CHECK (origem IN ('tabela','importado_da_compra')),
  user_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT preco_unico UNIQUE (faixa_id, condicao_id, vale_desde)
);
CREATE INDEX IF NOT EXISTS idx_tecido_precos_faixa ON public.tecido_precos (faixa_id, condicao_id, vale_desde DESC);

-- 2. Ligações com o que existe ---------------------------------------------------
ALTER TABLE public.insumos       ADD COLUMN IF NOT EXISTS faixa_id uuid REFERENCES public.tecido_faixas(id) ON DELETE SET NULL;
ALTER TABLE public.fabric_colors ADD COLUMN IF NOT EXISTS faixa_id uuid REFERENCES public.tecido_faixas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_insumos_faixa ON public.insumos (faixa_id) WHERE faixa_id IS NOT NULL;
-- A faixa deixa de ser uma de três: até 6 nomes livres por tipo.
ALTER TABLE public.fabric_colors DROP CONSTRAINT IF EXISTS fabric_colors_tier_valid;

-- 3. RLS -----------------------------------------------------------------------
ALTER TABLE public.tecido_linhas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_tipos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_faixas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecido_precos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_condicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedor_frete     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tecido_linhas_leitura ON public.tecido_linhas;
DROP POLICY IF EXISTS tecido_tipos_leitura ON public.tecido_tipos;
DROP POLICY IF EXISTS tecido_faixas_leitura ON public.tecido_faixas;
DROP POLICY IF EXISTS tecido_precos_leitura ON public.tecido_precos;
DROP POLICY IF EXISTS fornecedor_condicoes_leitura ON public.fornecedor_condicoes;
DROP POLICY IF EXISTS fornecedor_frete_leitura ON public.fornecedor_frete;
CREATE POLICY tecido_linhas_leitura ON public.tecido_linhas FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_tipos_leitura  ON public.tecido_tipos  FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_faixas_leitura ON public.tecido_faixas FOR SELECT TO authenticated USING (true);
CREATE POLICY tecido_precos_leitura ON public.tecido_precos FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY fornecedor_condicoes_leitura ON public.fornecedor_condicoes FOR SELECT TO authenticated USING (public.is_admin_or_manager());
CREATE POLICY fornecedor_frete_leitura ON public.fornecedor_frete FOR SELECT TO authenticated USING (public.is_admin_or_manager());
-- Sem política de escrita: só as funções abaixo gravam.
REVOKE INSERT, UPDATE, DELETE ON public.tecido_linhas, public.tecido_tipos, public.tecido_faixas,
  public.tecido_precos, public.fornecedor_condicoes, public.fornecedor_frete FROM anon, authenticated;
GRANT SELECT ON public.tecido_linhas, public.tecido_tipos, public.tecido_faixas,
  public.tecido_precos, public.fornecedor_condicoes, public.fornecedor_frete TO authenticated;

-- 4. Funções internas ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._hoje_sp() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $$;

-- Modelo do fornecedor: "À vista" padrão e frete "a cotar", se ainda não houver.
CREATE OR REPLACE FUNCTION public._garantir_modelo_do_fornecedor(p_fornecedor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor AND linha_id IS NULL) THEN
    INSERT INTO fornecedor_condicoes (fornecedor_id, nome, ordem, padrao) VALUES (p_fornecedor, 'À vista', 1, true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fornecedor_frete WHERE fornecedor_id = p_fornecedor AND linha_id IS NULL) THEN
    INSERT INTO fornecedor_frete (fornecedor_id, modo) VALUES (p_fornecedor, 'cotacao');
  END IF;
END $$;

-- Copia o modelo do fornecedor para a linha, nas partes em que a linha usa o do fornecedor.
CREATE OR REPLACE FUNCTION public._sincronizar_comercial_da_linha(p_linha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE l tecido_linhas; t fornecedor_condicoes; v_id uuid;
BEGIN
  SELECT * INTO l FROM tecido_linhas WHERE id = p_linha;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM _garantir_modelo_do_fornecedor(l.fornecedor_id);

  IF l.usa_frete_do_fornecedor THEN
    DELETE FROM fornecedor_frete WHERE linha_id = l.id;
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    SELECT fornecedor_id, l.id, modo, valor, remessa_tipica_kg FROM fornecedor_frete
    WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM fornecedor_frete WHERE linha_id = l.id) THEN
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    SELECT fornecedor_id, l.id, modo, valor, remessa_tipica_kg FROM fornecedor_frete
    WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL;
  END IF;

  IF l.usa_condicoes_do_fornecedor OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE linha_id = l.id) THEN
    -- Sem padrão durante a cópia: o índice de "uma padrão" não pode ver duas no meio do caminho.
    UPDATE fornecedor_condicoes SET padrao = false WHERE linha_id = l.id;
    FOR t IN SELECT * FROM fornecedor_condicoes WHERE fornecedor_id = l.fornecedor_id AND linha_id IS NULL ORDER BY ordem LOOP
      SELECT id INTO v_id FROM fornecedor_condicoes WHERE linha_id = l.id AND origem_id = t.id;
      IF v_id IS NULL THEN
        -- Adota a condição de mesmo nome que a linha já tinha: os preços dela continuam valendo.
        SELECT id INTO v_id FROM fornecedor_condicoes WHERE linha_id = l.id AND lower(nome) = lower(t.nome);
      END IF;
      IF v_id IS NULL THEN
        INSERT INTO fornecedor_condicoes (fornecedor_id, linha_id, origem_id, nome, ordem, padrao, ativa)
        VALUES (l.fornecedor_id, l.id, t.id, t.nome, t.ordem, false, t.ativa) RETURNING id INTO v_id;
      ELSE
        UPDATE fornecedor_condicoes SET origem_id = t.id, nome = t.nome, ordem = t.ordem, ativa = t.ativa WHERE id = v_id;
      END IF;
    END LOOP;
    -- O que a linha tem e o modelo não tem: some se não tiver preço; senão fica inativo.
    DELETE FROM fornecedor_condicoes c WHERE c.linha_id = l.id
      AND (c.origem_id IS NULL OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.linha_id IS NULL))
      AND NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.condicao_id = c.id);
    UPDATE fornecedor_condicoes c SET ativa = false WHERE c.linha_id = l.id
      AND (c.origem_id IS NULL OR NOT EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.linha_id IS NULL));
    UPDATE fornecedor_condicoes c SET padrao = true WHERE c.linha_id = l.id AND c.ativa
      AND EXISTS (SELECT 1 FROM fornecedor_condicoes t2 WHERE t2.id = c.origem_id AND t2.padrao);
  END IF;
END $$;

-- Garante uma padrão entre as ativas de (fornecedor, linha): a marcada, ou a de menor ordem.
CREATE OR REPLACE FUNCTION public._acertar_padrao(p_fornecedor uuid, p_linha uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor
                 AND linha_id IS NOT DISTINCT FROM p_linha AND padrao AND ativa) THEN
    UPDATE fornecedor_condicoes SET padrao = true WHERE id = (
      SELECT id FROM fornecedor_condicoes WHERE fornecedor_id = p_fornecedor
      AND linha_id IS NOT DISTINCT FROM p_linha AND ativa ORDER BY ordem, created_at LIMIT 1);
  END IF;
END $$;

-- 5. Funções públicas ------------------------------------------------------------
-- Frete e condições: do fornecedor (linha_id ausente) ou de uma linha.
CREATE OR REPLACE FUNCTION public.salvar_comercial(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_forn uuid := (p->>'fornecedor_id')::uuid; v_linha uuid := NULLIF(p->>'linha_id','')::uuid;
        v_frete jsonb := p->'frete'; v_cond jsonb := p->'condicoes'; c jsonb; v_ids uuid[] := '{}'; v_id uuid; r record;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF v_forn IS NULL OR NOT EXISTS (SELECT 1 FROM suppliers WHERE id = v_forn) THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;
  IF v_linha IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tecido_linhas WHERE id = v_linha AND fornecedor_id = v_forn) THEN
    RAISE EXCEPTION 'Linha não pertence ao fornecedor';
  END IF;
  PERFORM _garantir_modelo_do_fornecedor(v_forn);

  IF v_linha IS NOT NULL THEN
    UPDATE tecido_linhas SET
      usa_frete_do_fornecedor     = coalesce((p->>'usa_frete_do_fornecedor')::boolean, usa_frete_do_fornecedor),
      usa_condicoes_do_fornecedor = coalesce((p->>'usa_condicoes_do_fornecedor')::boolean, usa_condicoes_do_fornecedor)
    WHERE id = v_linha;
    -- Ao desligar, a linha parte do que já tem (cópia do modelo).
    PERFORM _sincronizar_comercial_da_linha(v_linha);
  END IF;

  IF v_frete IS NOT NULL AND jsonb_typeof(v_frete) = 'object'
     AND (v_linha IS NULL OR NOT (SELECT usa_frete_do_fornecedor FROM tecido_linhas WHERE id = v_linha)) THEN
    DELETE FROM fornecedor_frete WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha;
    INSERT INTO fornecedor_frete (fornecedor_id, linha_id, modo, valor, remessa_tipica_kg)
    VALUES (v_forn, v_linha, v_frete->>'modo', NULLIF(v_frete->>'valor','')::numeric, NULLIF(v_frete->>'remessa_tipica_kg','')::numeric);
  END IF;

  IF v_cond IS NOT NULL AND jsonb_typeof(v_cond) = 'array'
     AND (v_linha IS NULL OR NOT (SELECT usa_condicoes_do_fornecedor FROM tecido_linhas WHERE id = v_linha)) THEN
    IF jsonb_array_length(v_cond) = 0 THEN RAISE EXCEPTION 'Informe ao menos uma condição de pagamento'; END IF;
    UPDATE fornecedor_condicoes SET padrao = false WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha;
    FOR c IN SELECT * FROM jsonb_array_elements(v_cond) LOOP
      v_id := NULLIF(c->>'id','')::uuid;
      IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE id = v_id
                                      AND fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha) THEN
        UPDATE fornecedor_condicoes SET nome = btrim(c->>'nome'), ordem = coalesce((c->>'ordem')::int, 0),
          padrao = coalesce((c->>'padrao')::boolean, false), ativa = true WHERE id = v_id;
      ELSE
        INSERT INTO fornecedor_condicoes (fornecedor_id, linha_id, nome, ordem, padrao)
        VALUES (v_forn, v_linha, btrim(c->>'nome'), coalesce((c->>'ordem')::int, 0), coalesce((c->>'padrao')::boolean, false))
        RETURNING id INTO v_id;
      END IF;
      v_ids := v_ids || v_id;
    END LOOP;
    -- Fora da lista: some sem preço; com preço, fica inativa (o histórico continua explicável).
    DELETE FROM fornecedor_condicoes c WHERE c.fornecedor_id = v_forn AND c.linha_id IS NOT DISTINCT FROM v_linha
      AND c.id <> ALL (v_ids) AND NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.condicao_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM fornecedor_condicoes f WHERE f.origem_id = c.id
                      AND EXISTS (SELECT 1 FROM tecido_precos p2 WHERE p2.condicao_id = f.id));
    UPDATE fornecedor_condicoes SET ativa = false, padrao = false
      WHERE fornecedor_id = v_forn AND linha_id IS NOT DISTINCT FROM v_linha AND id <> ALL (v_ids);
    PERFORM _acertar_padrao(v_forn, v_linha);
  END IF;

  -- Mudou o modelo: toda linha que usa o do fornecedor recebe a mudança.
  IF v_linha IS NULL THEN
    FOR r IN SELECT id FROM tecido_linhas WHERE fornecedor_id = v_forn LOOP
      PERFORM _sincronizar_comercial_da_linha(r.id);
    END LOOP;
  ELSE
    PERFORM _acertar_padrao(v_forn, v_linha);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.salvar_linha(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid := NULLIF(p->>'id','')::uuid; v_forn uuid := (p->>'fornecedor_id')::uuid; v_nome text := btrim(p->>'nome');
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF coalesce(v_nome,'') = '' THEN RAISE EXCEPTION 'Dê um nome à linha'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO tecido_linhas (fornecedor_id, nome, ordem)
    VALUES (v_forn, v_nome, coalesce((p->>'ordem')::int, (SELECT coalesce(max(ordem),0)+1 FROM tecido_linhas WHERE fornecedor_id = v_forn)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE tecido_linhas SET nome = v_nome, ordem = coalesce((p->>'ordem')::int, ordem) WHERE id = v_id AND fornecedor_id = v_forn;
    IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  END IF;
  PERFORM _sincronizar_comercial_da_linha(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.salvar_tecido_tipo(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid := NULLIF(p->>'id','')::uuid; v_linha uuid := (p->>'linha_id')::uuid;
  v_nome text := btrim(p->>'nome'); v_unid text := p->>'unidade';
  v_rend numeric := NULLIF(p->>'rendimento_m_por_kg','')::numeric;
  v_forn uuid; v_antigo text; f jsonb; c jsonb; pr jsonb; v_faixa uuid; v_insumo uuid; v_ids uuid[] := '{}';
  r record; v_n int; v_hoje date := _hoje_sp();
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  SELECT fornecedor_id INTO v_forn FROM tecido_linhas WHERE id = v_linha;
  IF v_forn IS NULL THEN RAISE EXCEPTION 'Linha não encontrada'; END IF;
  IF coalesce(v_nome,'') = '' THEN RAISE EXCEPTION 'Dê um nome ao tecido'; END IF;
  IF v_unid NOT IN ('kg','m') THEN RAISE EXCEPTION 'Unidade tem de ser kg ou m'; END IF;
  IF v_unid = 'kg' AND (v_rend IS NULL OR v_rend <= 0) THEN RAISE EXCEPTION 'Tecido em kg precisa do rendimento (metros por kg)'; END IF;
  v_n := jsonb_array_length(coalesce(p->'faixas','[]'::jsonb));
  IF v_n < 1 OR v_n > 6 THEN RAISE EXCEPTION 'O tecido tem de ter de 1 a 6 faixas'; END IF;
  IF (SELECT count(DISTINCT lower(btrim(x->>'nome'))) FROM jsonb_array_elements(p->'faixas') x) <> v_n THEN
    RAISE EXCEPTION 'Duas faixas com o mesmo nome';
  END IF;
  -- Toda cor tem de cair numa faixa da lista.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p->'cores','[]'::jsonb)) c2
             WHERE lower(btrim(c2->>'faixa')) NOT IN (SELECT lower(btrim(x->>'nome')) FROM jsonb_array_elements(p->'faixas') x)) THEN
    RAISE EXCEPTION 'Há cores numa faixa que não existe: mova as cores antes de salvar';
  END IF;
  -- Nome único no sistema (é a fabric_family do orçamento).
  IF EXISTS (SELECT 1 FROM tecido_tipos WHERE lower(btrim(nome)) = lower(v_nome) AND id IS DISTINCT FROM v_id)
     OR EXISTS (SELECT 1 FROM insumos i WHERE lower(btrim(i.fabric_family)) = lower(v_nome)
                AND (i.faixa_id IS NULL OR i.faixa_id NOT IN (SELECT id FROM tecido_faixas WHERE tipo_id IS NOT DISTINCT FROM v_id))) THEN
    RAISE EXCEPTION 'Já existe um tecido chamado %', v_nome;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO tecido_tipos (linha_id, nome, unidade, rendimento_m_por_kg, composicao, ordem)
    VALUES (v_linha, v_nome, v_unid, v_rend, NULLIF(btrim(p->>'composicao'),''),
            coalesce((p->>'ordem')::int, (SELECT coalesce(max(ordem),0)+1 FROM tecido_tipos WHERE linha_id = v_linha)))
    RETURNING id INTO v_id;
    v_antigo := v_nome;
  ELSE
    SELECT nome INTO v_antigo FROM tecido_tipos WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tecido não encontrado'; END IF;
    UPDATE tecido_tipos SET linha_id = v_linha, nome = v_nome, unidade = v_unid, rendimento_m_por_kg = v_rend,
      composicao = NULLIF(btrim(p->>'composicao'),'') WHERE id = v_id;
    -- Renomear o tecido leva a cartela junto (inclusive cores inativas, para relatório antigo achar).
    UPDATE fabric_colors SET fabric_family = v_nome WHERE fabric_family = v_antigo;
  END IF;

  -- Faixas: as informadas ficam; as de fora saem se nada as usa.
  FOR f IN SELECT * FROM jsonb_array_elements(p->'faixas') LOOP
    v_faixa := NULLIF(f->>'id','')::uuid;
    IF v_faixa IS NOT NULL AND EXISTS (SELECT 1 FROM tecido_faixas WHERE id = v_faixa AND tipo_id = v_id) THEN
      UPDATE tecido_faixas SET nome = btrim(f->>'nome'), ordem = (f->>'ordem')::int WHERE id = v_faixa;
    ELSE
      INSERT INTO insumos (user_id, name, unit, rendimento, category, fabric_family, color_tier, supplier_id, current_stock, min_stock, average_unit_cost)
      VALUES (auth.uid(), upper(v_nome || ' ' || btrim(f->>'nome')), v_unid, coalesce(v_rend, 1), 'Tecidos', v_nome, btrim(f->>'nome'), v_forn, 0, 0, 0)
      RETURNING id INTO v_insumo;
      INSERT INTO tecido_faixas (tipo_id, nome, ordem, insumo_id) VALUES (v_id, btrim(f->>'nome'), (f->>'ordem')::int, v_insumo)
      RETURNING id INTO v_faixa;
    END IF;
    v_ids := v_ids || v_faixa;
  END LOOP;

  FOR r IN SELECT tf.id, tf.nome, tf.insumo_id FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND tf.id <> ALL (v_ids) LOOP
    IF EXISTS (SELECT 1 FROM insumos WHERE id = r.insumo_id AND current_stock <> 0)
       OR EXISTS (SELECT 1 FROM insumo_movements WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM compra_itens WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM product_insumos WHERE insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM insumos WHERE canonical_insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM products WHERE default_fabric_insumo_id = r.insumo_id)
       OR EXISTS (SELECT 1 FROM budgets WHERE items::text LIKE '%' || r.insumo_id::text || '%')
       OR EXISTS (SELECT 1 FROM orders  WHERE items::text LIKE '%' || r.insumo_id::text || '%') THEN
      RAISE EXCEPTION 'A faixa % já foi usada (saldo, compra, ficha ou orçamento) e não pode sair. Mova as cores para outra faixa e deixe-a sem cor.', r.nome;
    END IF;
    DELETE FROM tecido_faixas WHERE id = r.id;
    DELETE FROM insumos WHERE id = r.insumo_id;
  END LOOP;

  -- Insumos (e apelidos) seguem o nome do tecido e da faixa.
  UPDATE insumos i SET name = upper(v_nome || ' ' || tf.nome), fabric_family = v_nome, color_tier = tf.nome,
    unit = v_unid, rendimento = coalesce(v_rend, 1), supplier_id = v_forn, faixa_id = tf.id
  FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND i.id = tf.insumo_id;
  UPDATE insumos i SET fabric_family = v_nome, color_tier = tf.nome, faixa_id = tf.id
  FROM tecido_faixas tf WHERE tf.tipo_id = v_id AND i.canonical_insumo_id = tf.insumo_id;

  -- Cartela: o conjunto da tela vira o conjunto do banco (o resto fica inativo).
  UPDATE fabric_colors SET is_active = false, updated_at = now() WHERE fabric_family = v_nome;
  v_n := 0;
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p->'cores','[]'::jsonb)) LOOP
    SELECT id INTO v_faixa FROM tecido_faixas WHERE tipo_id = v_id AND lower(nome) = lower(btrim(c->>'faixa'));
    INSERT INTO fabric_colors (user_id, fabric_family, color_name, hex, color_tier, faixa_id, sort_order, is_active, updated_at)
    VALUES (auth.uid(), v_nome, upper(btrim(c->>'nome')), coalesce(NULLIF(c->>'hex',''), '#CCCCCC'),
            (SELECT nome FROM tecido_faixas WHERE id = v_faixa), v_faixa, v_n, true, now())
    ON CONFLICT (fabric_family, color_name) DO UPDATE SET hex = EXCLUDED.hex, color_tier = EXCLUDED.color_tier,
      faixa_id = EXCLUDED.faixa_id, sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now();
    v_n := v_n + 1;
  END LOOP;

  -- Preços da grade: corrige o vigente (mesmo vale_desde) ou cria hoje; valor vazio apaga aquela data.
  FOR pr IN SELECT * FROM jsonb_array_elements(coalesce(p->'precos','[]'::jsonb)) LOOP
    SELECT id INTO v_faixa FROM tecido_faixas WHERE tipo_id = v_id AND lower(nome) = lower(btrim(pr->>'faixa'));
    IF v_faixa IS NULL THEN RAISE EXCEPTION 'Preço para uma faixa que não existe: %', pr->>'faixa'; END IF;
    IF NOT EXISTS (SELECT 1 FROM fornecedor_condicoes WHERE id = (pr->>'condicao_id')::uuid AND linha_id = v_linha) THEN
      RAISE EXCEPTION 'Condição de pagamento não pertence a esta linha';
    END IF;
    IF NULLIF(pr->>'valor','') IS NULL OR (pr->>'valor')::numeric <= 0 THEN
      DELETE FROM tecido_precos WHERE faixa_id = v_faixa AND condicao_id = (pr->>'condicao_id')::uuid
        AND vale_desde = coalesce(NULLIF(pr->>'vale_desde','')::date, v_hoje);
    ELSE
      INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem, user_id)
      VALUES (v_faixa, (pr->>'condicao_id')::uuid, coalesce(NULLIF(pr->>'vale_desde','')::date, v_hoje), (pr->>'valor')::numeric, 'tabela', auth.uid())
      ON CONFLICT (faixa_id, condicao_id, vale_desde) DO UPDATE SET valor = EXCLUDED.valor, origem = 'tabela', user_id = auth.uid();
    END IF;
  END LOOP;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.reajustar_precos(p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_data date := (p->>'vale_desde')::date; pr jsonb;
BEGIN
  IF NOT public.is_admin_or_manager() THEN RAISE EXCEPTION 'Sem permissão para mexer na tabela de preços'; END IF;
  IF v_data IS NULL THEN RAISE EXCEPTION 'Informe a data em que o reajuste passa a valer'; END IF;
  FOR pr IN SELECT * FROM jsonb_array_elements(coalesce(p->'precos','[]'::jsonb)) LOOP
    IF NULLIF(pr->>'valor','') IS NULL OR (pr->>'valor')::numeric <= 0 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM tecido_precos WHERE faixa_id = (pr->>'faixa_id')::uuid
               AND condicao_id = (pr->>'condicao_id')::uuid AND vale_desde > v_data) THEN
      RAISE EXCEPTION 'Já existe um reajuste depois de %: a data tem de ser a mais recente', to_char(v_data, 'DD/MM/YYYY');
    END IF;
    INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem, user_id)
    VALUES ((pr->>'faixa_id')::uuid, (pr->>'condicao_id')::uuid, v_data, (pr->>'valor')::numeric, 'tabela', auth.uid())
    ON CONFLICT (faixa_id, condicao_id, vale_desde) DO UPDATE SET valor = EXCLUDED.valor, origem = 'tabela', user_id = auth.uid();
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.salvar_comercial(jsonb), public.salvar_linha(jsonb), public.salvar_tecido_tipo(jsonb),
  public.reajustar_precos(jsonb), public._garantir_modelo_do_fornecedor(uuid), public._sincronizar_comercial_da_linha(uuid),
  public._acertar_padrao(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_comercial(jsonb), public.salvar_linha(jsonb), public.salvar_tecido_tipo(jsonb),
  public.reajustar_precos(jsonb) TO authenticated;

-- 6. Migração dos tecidos de hoje (só famílias que ainda não viraram tipo) ---------
DO $$
DECLARE r record; f record; v_forn uuid; v_linha uuid; v_tipo uuid; v_faixa uuid; v_cond uuid;
        v_unid text; v_rend numeric; v_ordem int; v_custo numeric; v_data date;
BEGIN
  FOR r IN SELECT min(btrim(fabric_family)) AS familia, lower(btrim(fabric_family)) AS chave FROM public.insumos
           WHERE btrim(coalesce(fabric_family,'')) <> '' GROUP BY lower(btrim(fabric_family)) LOOP
    IF EXISTS (SELECT 1 FROM tecido_tipos WHERE lower(btrim(nome)) = r.chave) THEN CONTINUE; END IF;

    SELECT i.supplier_id INTO v_forn FROM insumos i JOIN suppliers s ON s.id = i.supplier_id
    WHERE lower(btrim(i.fabric_family)) = r.chave
    ORDER BY (i.color_tier = 'Padrão') DESC, (i.canonical_insumo_id IS NULL) DESC, i.created_at LIMIT 1;
    IF v_forn IS NULL THEN
      SELECT id INTO v_forn FROM suppliers WHERE company_name = 'Sem fornecedor' ORDER BY created_at LIMIT 1;
      IF v_forn IS NULL THEN INSERT INTO suppliers (company_name) VALUES ('Sem fornecedor') RETURNING id INTO v_forn; END IF;
    END IF;

    INSERT INTO tecido_linhas (fornecedor_id, nome, ordem) VALUES (v_forn, 'Geral', 0)
    ON CONFLICT (fornecedor_id, nome) DO NOTHING;
    SELECT id INTO v_linha FROM tecido_linhas WHERE fornecedor_id = v_forn AND nome = 'Geral';
    PERFORM _sincronizar_comercial_da_linha(v_linha);
    SELECT id INTO v_cond FROM fornecedor_condicoes WHERE linha_id = v_linha AND padrao AND ativa;

    SELECT CASE WHEN lower(unit) = 'kg' THEN 'kg' ELSE 'm' END, NULLIF(rendimento, 0) INTO v_unid, v_rend
    FROM insumos WHERE lower(btrim(fabric_family)) = r.chave
    ORDER BY (color_tier = 'Padrão') DESC, (canonical_insumo_id IS NULL) DESC, created_at LIMIT 1;
    INSERT INTO tecido_tipos (linha_id, nome, unidade, rendimento_m_por_kg)
    VALUES (v_linha, r.familia, v_unid, CASE WHEN v_unid = 'kg' THEN coalesce(v_rend, 1) ELSE v_rend END)
    RETURNING id INTO v_tipo;

    v_ordem := 0;
    FOR f IN SELECT faixa, insumo_id FROM (
               SELECT DISTINCT ON (coalesce(NULLIF(btrim(color_tier),''), 'Padrão'))
                      coalesce(NULLIF(btrim(color_tier),''), 'Padrão') AS faixa, id AS insumo_id
               FROM insumos WHERE lower(btrim(fabric_family)) = r.chave
               ORDER BY coalesce(NULLIF(btrim(color_tier),''), 'Padrão'), (canonical_insumo_id IS NULL) DESC, created_at) x
             ORDER BY CASE faixa WHEN 'Branco' THEN 1 WHEN 'Padrão' THEN 2 WHEN 'Especial' THEN 3 ELSE 4 END, faixa LOOP
      v_ordem := v_ordem + 1;
      IF v_ordem > 6 THEN RAISE EXCEPTION 'Família % tem mais de 6 faixas', r.familia; END IF;
      INSERT INTO tecido_faixas (tipo_id, nome, ordem, insumo_id) VALUES (v_tipo, f.faixa, v_ordem, f.insumo_id)
      RETURNING id INTO v_faixa;
      UPDATE insumos SET faixa_id = v_faixa, fabric_family = r.familia
      WHERE lower(btrim(fabric_family)) = r.chave AND coalesce(NULLIF(btrim(color_tier),''), 'Padrão') = f.faixa;
      UPDATE fabric_colors SET faixa_id = v_faixa, fabric_family = r.familia
      WHERE lower(btrim(fabric_family)) = r.chave AND color_tier = f.faixa;

      -- Preço inicial: o último pago (compra; senão entrada manual com custo), em qualquer insumo da faixa.
      SELECT custo, dia INTO v_custo, v_data FROM (
        SELECT ci.custo_unitario AS custo, c.data AS dia, c.created_at AS quando
        FROM compra_itens ci JOIN compras c ON c.id = ci.compra_id
        WHERE ci.insumo_id IN (SELECT id FROM insumos WHERE faixa_id = v_faixa) AND ci.custo_unitario > 0
        UNION ALL
        SELECT m.unit_cost, (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date, m.created_at
        FROM insumo_movements m
        WHERE m.insumo_id IN (SELECT id FROM insumos WHERE faixa_id = v_faixa) AND m.type = 'IN' AND m.unit_cost > 0
      ) u ORDER BY dia DESC, quando DESC LIMIT 1;
      IF v_custo IS NOT NULL AND v_cond IS NOT NULL THEN
        INSERT INTO tecido_precos (faixa_id, condicao_id, vale_desde, valor, origem)
        VALUES (v_faixa, v_cond, v_data, v_custo, 'importado_da_compra') ON CONFLICT DO NOTHING;
      END IF;
      v_custo := NULL; v_data := NULL;
    END LOOP;
  END LOOP;
END $$;

-- DEPOIS (somente leitura) — todas as colunas "problemas_*" têm de dar 0.
SELECT
  (SELECT count(*) FROM insumos WHERE btrim(coalesce(fabric_family,'')) <> '' AND faixa_id IS NULL)              AS problemas_insumo_sem_faixa,
  (SELECT count(*) FROM fabric_colors WHERE is_active AND faixa_id IS NULL
     AND fabric_family IN (SELECT nome FROM tecido_tipos))                                                       AS problemas_cor_sem_faixa,
  (SELECT count(*) FROM (SELECT tipo_id FROM tecido_faixas GROUP BY 1 HAVING count(*) > 6) x)                    AS problemas_tipo_com_mais_de_6,
  (SELECT count(*) FROM tecido_linhas l WHERE NOT EXISTS (SELECT 1 FROM fornecedor_condicoes c
     WHERE c.linha_id = l.id AND c.padrao AND c.ativa))                                                          AS problemas_linha_sem_padrao,
  (SELECT count(*) FROM tecido_tipos)                                                                            AS tipos,
  (SELECT count(*) FROM tecido_faixas)                                                                           AS faixas,
  (SELECT count(*) FROM tecido_precos WHERE origem = 'importado_da_compra')                                      AS precos_importados,
  (SELECT count(*) FROM tecido_faixas tf WHERE NOT EXISTS (SELECT 1 FROM tecido_precos p WHERE p.faixa_id = tf.id)) AS faixas_sem_preco,
  (SELECT coalesce(sum(current_stock),0) FROM insumos WHERE btrim(coalesce(fabric_family,'')) <> '')             AS saldo_tecidos_igual_ao_antes,
  (SELECT count(*) FROM compra_itens)                                                                            AS itens_de_compra_igual_ao_antes;
```

- [ ] **Step 3: Rodar no banco local e conferir**

```powershell
Get-Content supabase\v3_1_tabela_verdade.sql -Raw | docker exec -i supabase_db_botezini-v3 psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Expected: termina sem erro; na consulta DEPOIS, todas as `problemas_*` = 0, `saldo_tecidos_igual_ao_antes` e `itens_de_compra_igual_ao_antes` iguais aos números da consulta ANTES.

- [ ] **Step 4: Idempotência — rodar de novo**

Mesmo comando. Expected: sem erro, e `tipos`, `faixas`, `precos_importados` iguais aos da primeira rodada.

- [ ] **Step 5: Testar as RPCs com o usuário admin de teste (renomear e remover)**

Num `psql` como `authenticated` com o `sub` do usuário de teste (o script `scripts/v3/criar_usuario_teste.sh` imprime o id):

```sql
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '<id do usuario de teste>', 'role', 'authenticated')::text, true);
-- pega um tipo migrado e renomeia a primeira faixa
WITH t AS (SELECT tt.id, tt.linha_id, tt.nome, tt.unidade, tt.rendimento_m_por_kg FROM tecido_tipos tt LIMIT 1)
SELECT public.salvar_tecido_tipo(jsonb_build_object(
  'id', t.id, 'linha_id', t.linha_id, 'nome', t.nome, 'unidade', t.unidade, 'rendimento_m_por_kg', t.rendimento_m_por_kg,
  'faixas', (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', CASE WHEN f.ordem = 1 THEN f.nome || ' X' ELSE f.nome END, 'ordem', f.ordem) ORDER BY f.ordem) FROM tecido_faixas f WHERE f.tipo_id = t.id),
  'cores', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', c.color_name, 'hex', c.hex,
            'faixa', CASE WHEN f.ordem = 1 THEN f.nome || ' X' ELSE f.nome END)) FROM fabric_colors c JOIN tecido_faixas f ON f.id = c.faixa_id
            WHERE c.is_active AND f.tipo_id = t.id), '[]'::jsonb))) FROM t;
-- o insumo e a cartela acompanharam:
SELECT i.name, i.color_tier, c.color_tier AS cor_faixa FROM tecido_faixas f JOIN insumos i ON i.id = f.insumo_id
LEFT JOIN fabric_colors c ON c.faixa_id = f.id WHERE f.ordem = 1 LIMIT 3;
ROLLBACK;
```

Expected: `i.color_tier` e `cor_faixa` terminam em ` X`. Depois, o mesmo bloco tirando uma faixa que tem saldo deve falhar com `já foi usada`.

Com o usuário de fábrica (`criar_usuario_teste.sh fabrica`), `SELECT count(*) FROM tecido_precos` deve dar 0 e `SELECT public.salvar_linha('{}')` deve falhar com `Sem permissão`.

- [ ] **Step 6: Commit**

```bash
git add supabase/v3_1_tabela_verdade.sql
git commit -m "feat(v3.1): banco da tabela verdade de tecidos (tabelas, RLS, RPCs, migração)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regra pura — `src/utils/tabelaVerdade.ts`

**Files:**
- Create: `src/utils/tabelaVerdade.ts`
- Test: `src/utils/tabelaVerdade.test.ts`

**Interfaces:**
- Produces:

```ts
export type ModoFrete = 'cif' | 'por_kg' | 'fixo' | 'cotacao';
export interface TVLinha { id: string; fornecedor_id: string; nome: string; ordem: number; usa_frete_do_fornecedor: boolean; usa_condicoes_do_fornecedor: boolean }
export interface TVCondicao { id: string; fornecedor_id: string; linha_id: string | null; nome: string; ordem: number; padrao: boolean; ativa: boolean }
export interface TVFrete { fornecedor_id: string; linha_id: string | null; modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null }
export interface TVTipo { id: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao: string | null; ordem: number }
export interface TVFaixa { id: string; tipo_id: string; nome: string; ordem: number; insumo_id: string }
export interface TVPreco { faixa_id: string; condicao_id: string; vale_desde: string; valor: number; origem: 'tabela' | 'importado_da_compra' }
export interface TVCor { nome: string; hex: string; faixa_id: string }
export interface Catalogo { linhas: TVLinha[]; condicoes: TVCondicao[]; fretes: TVFrete[]; tipos: TVTipo[]; faixas: TVFaixa[]; precos: TVPreco[]; cores?: TVCor[] }
export type Pendencia = 'faixa sem preço' | 'frete a cotar' | 'frete fixo sem remessa típica' | 'frete não cadastrado' | 'tecido sem rendimento' | 'sem condição padrão';
export interface CustoDeReferencia { valor: number | null; preco: number | null; frete: number; condicao: TVCondicao | null; pendencias: Pendencia[] }
export interface CompraDaFaixa { data: string; quantidade: number; custo_unitario: number }
export interface Comparacao { menor: { valor: number; data: string }; maior: { valor: number; data: string }; media: number; previstoMedio: number | null; diferencaPct: number | null; acima: boolean; compras: number }
export const MAX_FAIXAS = 6; export const LIMITE_ACIMA_PCT = 2; export const JANELA_DIAS = 90;
export function precoVigente(precos: TVPreco[], faixaId: string, condicaoId: string, data: string): TVPreco | null;
export function condicoesDaLinha(linhaId: string, condicoes: TVCondicao[]): TVCondicao[];
export function condicaoPadrao(linhaId: string, condicoes: TVCondicao[]): TVCondicao | null;
export function freteDaLinha(linhaId: string, fretes: TVFrete[]): TVFrete | null;
export function freteNaUnidade(frete: TVFrete | null, tipo: Pick<TVTipo, 'unidade' | 'rendimento_m_por_kg'>): { valor: number; pendencia?: Pendencia };
export function custoDeReferencia(faixa: TVFaixa, cat: Catalogo, data: string): CustoDeReferencia;
export function mapaDeReferencia(cat: Catalogo, insumosComFaixa: { id: string; faixa_id: string }[], data: string): Map<string, number>;
export function comparacaoComComprado(compras: CompraDaFaixa[], previstoNaData: (data: string) => number | null, hoje: string, dias?: number): Comparacao | null;
export function menosDias(dataIso: string, dias: number): string;
```

- [ ] **Step 1: Escrever os testes**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    precoVigente, condicaoPadrao, freteNaUnidade, custoDeReferencia, mapaDeReferencia,
    comparacaoComComprado, menosDias, type Catalogo, type TVFrete,
} from './tabelaVerdade.ts';

const linha = { id: 'L', fornecedor_id: 'F', nome: 'Brim', ordem: 0, usa_frete_do_fornecedor: true, usa_condicoes_do_fornecedor: true };
const avista = { id: 'C1', fornecedor_id: 'F', linha_id: 'L', nome: 'À vista', ordem: 1, padrao: false, ativa: true };
const trinta = { id: 'C2', fornecedor_id: 'F', linha_id: 'L', nome: '30 dias', ordem: 2, padrao: true, ativa: true };
const modelo = { id: 'C0', fornecedor_id: 'F', linha_id: null, nome: 'À vista', ordem: 1, padrao: true, ativa: true };
const tipoKg = { id: 'T', linha_id: 'L', nome: 'Brim Leve', unidade: 'kg' as const, rendimento_m_por_kg: 3.2, composicao: null, ordem: 0 };
const medias = { id: 'FX', tipo_id: 'T', nome: 'Médias', ordem: 3, insumo_id: 'I1' };
const frete = (f: Partial<TVFrete>): TVFrete => ({ fornecedor_id: 'F', linha_id: 'L', modo: 'por_kg', valor: 0.15, remessa_tipica_kg: null, ...f });

const cat = (extra: Partial<Catalogo> = {}): Catalogo => ({
    linhas: [linha], condicoes: [modelo, avista, trinta], fretes: [frete({})], tipos: [tipoKg], faixas: [medias],
    precos: [
        { faixa_id: 'FX', condicao_id: 'C2', vale_desde: '2026-09-01', valor: 29, origem: 'tabela' },
        { faixa_id: 'FX', condicao_id: 'C2', vale_desde: '2026-11-01', valor: 31, origem: 'tabela' },
        { faixa_id: 'FX', condicao_id: 'C1', vale_desde: '2026-09-01', valor: 28.4, origem: 'tabela' },
    ],
    ...extra,
});

test('preço vigente: o de vale_desde mais recente até a data; reajuste futuro não vale antes', () => {
    const { precos } = cat();
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-08-31'), null);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-09-01')?.valor, 29);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-10-29')?.valor, 29);
    assert.equal(precoVigente(precos, 'FX', 'C2', '2026-11-01')?.valor, 31);
});

test('condição padrão é a da linha, nunca a do modelo do fornecedor', () => {
    assert.equal(condicaoPadrao('L', cat().condicoes)?.id, 'C2');
    assert.equal(condicaoPadrao('L', [modelo, { ...trinta, ativa: false }]), null);
});

test('frete: cif zero; por kg em kg; por kg em metro divide pelo rendimento', () => {
    assert.deepEqual(freteNaUnidade(frete({ modo: 'cif', valor: null }), tipoKg), { valor: 0 });
    assert.deepEqual(freteNaUnidade(frete({}), tipoKg), { valor: 0.15 });
    const r = freteNaUnidade(frete({ valor: 0.32 }), { unidade: 'm', rendimento_m_por_kg: 3.2 });
    assert.equal(r.valor.toFixed(4), '0.1000');
});

test('frete em metro sem rendimento vira pendência, nunca Infinity', () => {
    assert.deepEqual(freteNaUnidade(frete({}), { unidade: 'm', rendimento_m_por_kg: null }), { valor: 0, pendencia: 'tecido sem rendimento' });
});

test('frete fixo divide pela remessa típica; sem remessa é pendência; a cotar é pendência; sem cadastro é pendência', () => {
    assert.deepEqual(freteNaUnidade(frete({ modo: 'fixo', valor: 150, remessa_tipica_kg: 300 }), tipoKg), { valor: 0.5 });
    assert.deepEqual(freteNaUnidade(frete({ modo: 'fixo', valor: 150 }), tipoKg), { valor: 0, pendencia: 'frete fixo sem remessa típica' });
    assert.deepEqual(freteNaUnidade(frete({ modo: 'cotacao', valor: null }), tipoKg), { valor: 0, pendencia: 'frete a cotar' });
    assert.deepEqual(freteNaUnidade(null, tipoKg), { valor: 0, pendencia: 'frete não cadastrado' });
});

test('custo de referência = preço na condição padrão + frete', () => {
    const r = custoDeReferencia(medias, cat(), '2026-10-29');
    assert.equal(r.valor, 29.15);
    assert.equal(r.condicao?.id, 'C2');
    assert.deepEqual(r.pendencias, []);
});

test('faixa sem preço: valor null (o consumidor cai para a próxima origem) e pendência', () => {
    const r = custoDeReferencia(medias, cat({ precos: [] }), '2026-10-29');
    assert.equal(r.valor, null);
    assert.ok(r.pendencias.includes('faixa sem preço'));
});

test('mapa de referência cobre o insumo da faixa e os apelidos dele', () => {
    const m = mapaDeReferencia(cat(), [{ id: 'I1', faixa_id: 'FX' }, { id: 'I1-apelido', faixa_id: 'FX' }], '2026-10-29');
    assert.equal(m.get('I1'), 29.15);
    assert.equal(m.get('I1-apelido'), 29.15);
});

test('comparação usa o previsto DA DATA de cada compra, ponderado pela quantidade', () => {
    const previsto = (d: string) => (d < '2026-10-01' ? 29 : 30);
    const r = comparacaoComComprado([
        { data: '2026-09-10', quantidade: 100, custo_unitario: 29.4 },
        { data: '2026-10-03', quantidade: 100, custo_unitario: 31.2 },
    ], previsto, '2026-10-29');
    assert.equal(r?.menor.data, '2026-09-10');
    assert.equal(r?.maior.valor, 31.2);
    assert.equal(r?.media, 30.3);
    assert.equal(r?.previstoMedio, 29.5);
    assert.equal(r?.diferencaPct, 2.71);
    assert.equal(r?.acima, true);
});

test('limite de 2%: exatamente 2% não avisa; acima avisa', () => {
    const p = () => 100;
    assert.equal(comparacaoComComprado([{ data: '2026-10-01', quantidade: 1, custo_unitario: 102 }], p, '2026-10-29')?.acima, false);
    assert.equal(comparacaoComComprado([{ data: '2026-10-01', quantidade: 1, custo_unitario: 102.5 }], p, '2026-10-29')?.acima, true);
});

test('compra antes de qualquer preço entra em menor/média/maior, mas não na comparação', () => {
    const r = comparacaoComComprado([{ data: '2026-08-01', quantidade: 10, custo_unitario: 40 }], () => null, '2026-10-29');
    assert.equal(r?.media, 40);
    assert.equal(r?.previstoMedio, null);
    assert.equal(r?.acima, false);
});

test('sem compra na janela de 90 dias: null', () => {
    assert.equal(comparacaoComComprado([{ data: '2026-07-01', quantidade: 1, custo_unitario: 1 }], () => 1, '2026-10-29'), null);
    assert.equal(menosDias('2026-10-29', 90), '2026-07-31');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/tabelaVerdade.test.ts`
Expected: FAIL — `Cannot find module './tabelaVerdade.ts'`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Tabela verdade de tecidos (v3.1, spec 2026-10-29): o preço que o fornecedor cobra hoje,
 * por faixa de cor e condição de pagamento, mais o frete — o "custo de referência".
 *
 * PREVER × APURAR. Orçamento, custo da peça e a sugestão da compra usam esta referência;
 * o lucro do pedido usa o que foi pago e só cai aqui sem compra vinculada (lucroPorPedido).
 *
 * AUSÊNCIA É INFORMAÇÃO (como custoDaPeca): o que falta vira pendência, nunca zero. Faixa
 * sem preço devolve valor null para o consumidor cair na próxima origem.
 *
 * Condições e frete moram sempre na linha: "usa o do fornecedor" é uma cópia mantida pelo
 * banco (_sincronizar_comercial_da_linha). Por isso aqui só se olha a linha.
 *
 * Sem import do app, para testar com node --test.
 */

export type ModoFrete = 'cif' | 'por_kg' | 'fixo' | 'cotacao';
export interface TVLinha { id: string; fornecedor_id: string; nome: string; ordem: number; usa_frete_do_fornecedor: boolean; usa_condicoes_do_fornecedor: boolean }
export interface TVCondicao { id: string; fornecedor_id: string; linha_id: string | null; nome: string; ordem: number; padrao: boolean; ativa: boolean }
export interface TVFrete { fornecedor_id: string; linha_id: string | null; modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null }
export interface TVTipo { id: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao: string | null; ordem: number }
export interface TVFaixa { id: string; tipo_id: string; nome: string; ordem: number; insumo_id: string }
export interface TVPreco { faixa_id: string; condicao_id: string; vale_desde: string; valor: number; origem: 'tabela' | 'importado_da_compra' }
export interface TVCor { nome: string; hex: string; faixa_id: string }
/** `cores` é opcional: a conta não precisa dela; as telas (cartão e editor) sim. */
export interface Catalogo { linhas: TVLinha[]; condicoes: TVCondicao[]; fretes: TVFrete[]; tipos: TVTipo[]; faixas: TVFaixa[]; precos: TVPreco[]; cores?: TVCor[] }

export type Pendencia =
    | 'faixa sem preço' | 'frete a cotar' | 'frete fixo sem remessa típica'
    | 'frete não cadastrado' | 'tecido sem rendimento' | 'sem condição padrão';

export interface CustoDeReferencia { valor: number | null; preco: number | null; frete: number; condicao: TVCondicao | null; pendencias: Pendencia[] }
export interface CompraDaFaixa { data: string; quantidade: number; custo_unitario: number }
export interface Comparacao {
    menor: { valor: number; data: string };
    maior: { valor: number; data: string };
    /** Média ponderada pela quantidade, de todas as compras da janela. */
    media: number;
    /** Previsto ponderado, só das compras que tinham preço de tabela na data. */
    previstoMedio: number | null;
    diferencaPct: number | null;
    acima: boolean;
    compras: number;
}

export const MAX_FAIXAS = 6;
/** Acima disto a média comprada vira aviso; abaixo é arredondamento, não notícia. */
export const LIMITE_ACIMA_PCT = 2;
export const JANELA_DIAS = 90;

const c4 = (n: number) => Math.round(n * 10000) / 10000;
const c2 = (n: number) => Math.round(n * 100) / 100;

export function precoVigente(precos: TVPreco[], faixaId: string, condicaoId: string, data: string): TVPreco | null {
    let melhor: TVPreco | null = null;
    for (const p of precos) {
        if (p.faixa_id !== faixaId || p.condicao_id !== condicaoId || p.vale_desde > data) continue;
        if (!melhor || p.vale_desde > melhor.vale_desde) melhor = p;
    }
    return melhor;
}

export function condicoesDaLinha(linhaId: string, condicoes: TVCondicao[]): TVCondicao[] {
    return condicoes.filter(c => c.linha_id === linhaId && c.ativa).sort((a, b) => a.ordem - b.ordem);
}

export function condicaoPadrao(linhaId: string, condicoes: TVCondicao[]): TVCondicao | null {
    return condicoesDaLinha(linhaId, condicoes).find(c => c.padrao) ?? null;
}

export function freteDaLinha(linhaId: string, fretes: TVFrete[]): TVFrete | null {
    return fretes.find(f => f.linha_id === linhaId) ?? null;
}

/** Frete por unidade do tecido (kg ou metro). Metro precisa do rendimento para sair do kg. */
export function freteNaUnidade(
    frete: TVFrete | null,
    tipo: Pick<TVTipo, 'unidade' | 'rendimento_m_por_kg'>,
): { valor: number; pendencia?: Pendencia } {
    if (!frete) return { valor: 0, pendencia: 'frete não cadastrado' };
    if (frete.modo === 'cif') return { valor: 0 };
    if (frete.modo === 'cotacao') return { valor: 0, pendencia: 'frete a cotar' };
    let porKg: number;
    if (frete.modo === 'por_kg') porKg = Number(frete.valor) || 0;
    else {
        const remessa = Number(frete.remessa_tipica_kg);
        if (!(remessa > 0)) return { valor: 0, pendencia: 'frete fixo sem remessa típica' };
        porKg = (Number(frete.valor) || 0) / remessa;
    }
    if (tipo.unidade === 'kg') return { valor: c4(porKg) };
    const rend = Number(tipo.rendimento_m_por_kg);
    if (!(rend > 0)) return { valor: 0, pendencia: 'tecido sem rendimento' };
    return { valor: c4(porKg / rend) };
}

export function custoDeReferencia(faixa: TVFaixa, cat: Catalogo, data: string): CustoDeReferencia {
    const pendencias: Pendencia[] = [];
    const tipo = cat.tipos.find(t => t.id === faixa.tipo_id);
    if (!tipo) return { valor: null, preco: null, frete: 0, condicao: null, pendencias: ['faixa sem preço'] };
    const condicao = condicaoPadrao(tipo.linha_id, cat.condicoes);
    if (!condicao) pendencias.push('sem condição padrão');
    const f = freteNaUnidade(freteDaLinha(tipo.linha_id, cat.fretes), tipo);
    if (f.pendencia) pendencias.push(f.pendencia);
    const preco = condicao ? precoVigente(cat.precos, faixa.id, condicao.id, data)?.valor ?? null : null;
    if (preco === null) pendencias.push('faixa sem preço');
    return { valor: preco === null ? null : c4(preco + f.valor), preco, frete: f.valor, condicao, pendencias };
}

/** insumo_id → custo de referência, para os consumidores (inclui apelidos: todo insumo com faixa_id). */
export function mapaDeReferencia(cat: Catalogo, insumosComFaixa: { id: string; faixa_id: string }[], data: string): Map<string, number> {
    const porFaixa = new Map<string, number>();
    for (const fx of cat.faixas) {
        const v = custoDeReferencia(fx, cat, data).valor;
        if (v !== null && v > 0) porFaixa.set(fx.id, v);
    }
    const mapa = new Map<string, number>();
    for (const i of insumosComFaixa) {
        const v = porFaixa.get(i.faixa_id);
        if (v !== undefined) mapa.set(i.id, v);
    }
    return mapa;
}

export function menosDias(dataIso: string, dias: number): string {
    const d = new Date(`${dataIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
}

export function comparacaoComComprado(
    compras: CompraDaFaixa[],
    previstoNaData: (data: string) => number | null,
    hoje: string,
    dias = JANELA_DIAS,
): Comparacao | null {
    const desde = menosDias(hoje, dias);
    const janela = compras.filter(c => c.data >= desde && c.data <= hoje && c.quantidade > 0 && c.custo_unitario > 0);
    if (janela.length === 0) return null;
    let menor = janela[0], maior = janela[0], q = 0, pago = 0, qPrev = 0, pagoPrev = 0, prev = 0;
    for (const c of janela) {
        if (c.custo_unitario < menor.custo_unitario) menor = c;
        if (c.custo_unitario > maior.custo_unitario) maior = c;
        q += c.quantidade; pago += c.quantidade * c.custo_unitario;
        const p = previstoNaData(c.data);
        if (p !== null && p > 0) { qPrev += c.quantidade; pagoPrev += c.quantidade * c.custo_unitario; prev += c.quantidade * p; }
    }
    const previstoMedio = qPrev > 0 ? c2(prev / qPrev) : null;
    const diferencaPct = qPrev > 0 ? c2((pagoPrev / prev - 1) * 100) : null;
    return {
        menor: { valor: menor.custo_unitario, data: menor.data },
        maior: { valor: maior.custo_unitario, data: maior.data },
        media: c2(pago / q),
        previstoMedio,
        diferencaPct,
        acima: diferencaPct !== null && diferencaPct > LIMITE_ACIMA_PCT,
        compras: janela.length,
    };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test --experimental-strip-types src/utils/tabelaVerdade.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tabelaVerdade.ts src/utils/tabelaVerdade.test.ts
git commit -m "feat(v3.1): regra pura da tabela verdade (preço vigente, frete, referência, comparação)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Consumidores puros — custo da peça, sugestão da compra, lucro do pedido

**Files:**
- Modify: `src/utils/custoDaPeca.ts` (interface `InsumoDeCusto`, `custoDoTecidoPorMetro`)
- Modify: `src/utils/fabrica/lancarCompra.ts:91-93` (`custoSugerido`)
- Modify: `src/utils/financas/lucroPorPedido.ts` (`OrigemDoPreco`, parâmetro `referencia`, `ORDEM`)
- Test: `src/utils/custoDaPeca.test.ts`, `src/utils/fabrica/lancarCompra.test.ts`, `src/utils/financas/lucroPorPedido.test.ts`

**Interfaces:**
- Produces: `InsumoDeCusto.custo_referencia?: number | null`; `custoSugerido(...candidatos: (number | null | undefined)[]): string`; `lucroPorPedido({ ..., referencia?: Map<string, number> })`; `OrigemDoPreco` inclui `'tabela'`.

- [ ] **Step 1: Testes (acrescentar ao fim de cada arquivo)**

`src/utils/custoDaPeca.test.ts`:

```ts
test('tabela verdade: custo de referência vence o custo médio; sem ela, vale o médio', () => {
    const base = { unit: 'kg', rendimento: 2, average_unit_cost: 20 };
    assert.equal(custoDoTecidoPorMetro({ ...base, custo_referencia: 30 }).valor, 15);
    assert.equal(custoDoTecidoPorMetro({ ...base, custo_referencia: null }).valor, 10);
});
```

(Se `custoDoTecidoPorMetro` ainda não estiver importado no teste, acrescentar ao import existente de `./custoDaPeca.ts`.)

`src/utils/fabrica/lancarCompra.test.ts`:

```ts
test('custo sugerido: o primeiro candidato positivo (tabela antes do custo médio)', () => {
    assert.equal(custoSugerido(29.15, 27), custoSugerido(29.15));
    assert.equal(custoSugerido(undefined, 27), custoSugerido(27));
    assert.equal(custoSugerido(null, 0), '');
});
```

`src/utils/financas/lucroPorPedido.test.ts` — usar os construtores que o arquivo já tem para um pedido entregue com ficha de 2 unidades do insumo `I1`, sem vínculo:

```ts
test('tabela entra entre o pago no pedido e a última compra', () => {
    const base = cenarioSimples(); // pedido entregue, ficha: 2 × I1, I1 com custo médio 10
    const comTabela = lucroPorPedido({ ...base, referencia: new Map([['I1', 12]]), ultimoPreco: new Map([['I1', 11]]) });
    assert.equal(comTabela.linhas[0].material, 24);
    assert.deepEqual(comTabela.linhas[0].origens, ['tabela']);
    const semTabela = lucroPorPedido({ ...base, ultimoPreco: new Map([['I1', 11]]) });
    assert.deepEqual(semTabela.linhas[0].origens, ['última compra']);
});
```

Se o arquivo não tiver um `cenarioSimples`, escrever um no topo do teste a partir do primeiro teste existente que monta pedido entregue + ficha (copiar os mesmos campos, trocando só o que o teste precisa), sem mudar os testes existentes.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/custoDaPeca.test.ts src/utils/fabrica/lancarCompra.test.ts src/utils/financas/lucroPorPedido.test.ts`
Expected: FAIL nos três testes novos.

- [ ] **Step 3: Implementar**

`src/utils/custoDaPeca.ts` — na interface:

```ts
export interface InsumoDeCusto {
    average_unit_cost?: number | null;
    /** Custo de referência da tabela verdade (preço na condição padrão + frete). Vence o custo médio. */
    custo_referencia?: number | null;
    unit?: string | null;
    /** Metros por kg. Só faz sentido para o que é comprado em peso. */
    rendimento?: number | null;
}
```

e em `custoDoTecidoPorMetro`:

```ts
    const custo = positivo(insumo.custo_referencia) ?? positivo(insumo.average_unit_cost);
```

`src/utils/fabrica/lancarCompra.ts`:

```ts
/** O primeiro candidato positivo, na ordem dada (a tela passa: tabela verdade, custo médio). */
export function custoSugerido(...candidatos: (number | null | undefined)[]): string {
    const v = candidatos.find(c => c != null && c > 0);
    return v ? numero(v, 4) : '';
}
```

`src/utils/financas/lucroPorPedido.ts`:

```ts
/** De onde veio o preço do material: o que o pedido pagou, a tabela verdade, a última compra, o custo médio. */
export type OrigemDoPreco = 'compra do pedido' | 'tabela' | 'última compra' | 'custo médio';
```

no parâmetro, depois de `ultimoPreco`:

```ts
    /** Por insumo: custo de referência da tabela verdade (mapaDeReferencia). Vem antes da última compra. */
    referencia?: Map<string, number>;
```

`const ORDEM: OrigemDoPreco[] = ['compra do pedido', 'tabela', 'última compra', 'custo médio'];` e, logo depois de `if (resta <= 0) continue;`:

```ts
            const tabela = e.referencia?.get(insumoId) ?? 0;
            if (tabela > 0) { material += resta * tabela; origens.add('tabela'); continue; }
```

Atualizar o comentário do cabeçalho (linhas 15–20) para listar a tabela entre "compra do pedido" e "última compra".

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/custoDaPeca.ts src/utils/custoDaPeca.test.ts src/utils/fabrica/lancarCompra.ts src/utils/fabrica/lancarCompra.test.ts src/utils/financas/lucroPorPedido.ts src/utils/financas/lucroPorPedido.test.ts
git commit -m "feat(v3.1): custo da peça, sugestão da compra e lucro passam a usar a tabela verdade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Faixa de cor livre — `nomeDeTecido`, tipos e orçamento

**Files:**
- Modify: `src/utils/nomeDeTecido.ts:67-79,146-178`
- Modify: `src/types/index.ts:171-197` (`ColorTier`, `faixa_id`)
- Modify: `src/components/budgets/BudgetEditor.tsx:722,782`
- Test: `src/utils/nomeDeTecido.test.ts`

**Interfaces:**
- Produces: `CorDaCartela.faixa: string`; `nomeDoInsumoDaFaixa(familia: string, faixa: string)`; `interpretarListaDeCores(texto, faixaPadrao?: string, faixas?: string[])`; `type ColorTier = string`; `Insumo.faixa_id?: string | null`; `FabricColor.faixa_id?: string | null`.

- [ ] **Step 1: Teste**

```ts
test('faixas livres: "; ESCURAS" reconhece a faixa do tecido, sem acento e sem caixa', () => {
    const r = interpretarListaDeCores('MARINHO ; escuras\nAREIA', 'Claras', ['Claras', 'Escuras', 'Especiais']);
    assert.deepEqual(r.map(c => [c.nome, c.faixa]), [['MARINHO', 'Escuras'], ['AREIA', 'Claras']]);
});

test('faixa desconhecida depois do separador fica no nome (não inventa faixa)', () => {
    const r = interpretarListaDeCores('VINHO ; ROXAS', 'Claras', ['Claras']);
    assert.equal(r[0].faixa, 'Claras');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --experimental-strip-types src/utils/nomeDeTecido.test.ts` — Expected: FAIL no primeiro teste novo.

- [ ] **Step 3: Implementar**

Em `nomeDeTecido.ts`: manter `FAIXAS_DE_COR` (cartela antiga e testes existentes), mas:

```ts
/** O nome do insumo de cada faixa: a família mais o sufixo da faixa (igual ao que salvar_tecido_tipo grava). */
export function nomeDoInsumoDaFaixa(familia: string, faixa: string): string {
    return `${limpa(familia).toUpperCase()} ${faixa.toUpperCase()}`.trim();
}

export interface CorDaCartela {
    nome: string;
    hex: string;
    /** Nome da faixa do tecido (até 6 por tecido, livres desde a v3.1). */
    faixa: string;
}
```

e em `interpretarListaDeCores`:

```ts
export function interpretarListaDeCores(
    texto: string,
    faixaPadrao: string = 'Padrão',
    faixas: readonly string[] = FAIXAS_DE_COR,
): CorDaCartela[] {
    const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    const porTexto = new Map(faixas.map(f => [semAcento(f), f]));
    for (const [k, v] of Object.entries(FAIXA_POR_TEXTO)) if (faixas.includes(v)) porTexto.set(semAcento(k), v);
```

e trocar `const achada = FAIXA_POR_TEXTO[depois];` por `const achada = porTexto.get(semAcento(depois));`.

Em `src/types/index.ts`:

```ts
  fabric_family?: string;
  color_tier?: ColorTier;
  /** Faixa da tabela verdade (v3.1). Null em aviamento. */
  faixa_id?: string | null;
```

`export type ColorTier = string;` (comentário: "nome da faixa; até 6 por tecido desde a v3.1") e `faixa_id?: string | null;` em `FabricColor`.

Em `BudgetEditor.tsx`:
- linha 722, o representante da família no seletor deixa de ser "Padrão": trocar `i.color_tier === 'Padrão'` por `ehRepresentante(i)`, com, logo acima do `useMemo` que contém a linha:

```ts
  // Um item por tecido no seletor: a faixa de menor ordem (antes, a chamada "Padrão").
  const representantes = useMemo(() => {
    const porFamilia = new Map<string, Insumo>();
    for (const i of localInsumos) {
      if (!i.fabric_family) continue;
      const atual = porFamilia.get(i.fabric_family);
      if (!atual || (i.name || '') < (atual.name || '')) porFamilia.set(i.fabric_family, i);
    }
    return new Set([...porFamilia.values()].map(i => i.id));
  }, [localInsumos]);
  const ehRepresentante = (i: Insumo) => representantes.has(i.id);
```

  (ordem pelo nome é estável e, com o insumo chamado `TECIDO FAIXA`, mantém um item por família; o seletor só precisa de um.)
- linha 782, o selo de faixa: mostrar sempre que houver faixa e a família tiver mais de uma faixa:

```ts
    return ins?.color_tier && localInsumos.some(o => o.fabric_family === ins.fabric_family && o.id !== ins.id) ? ins.color_tier : null;
```

- [ ] **Step 4: Rodar e ver passar; `tsc`**

Run: `node --test --experimental-strip-types src/utils/nomeDeTecido.test.ts` e `npx tsc --noEmit`.
Expected: PASS e sem erro de tipo (o `NovoTecidoModal` ainda compila: `FaixaDeCor` é subconjunto de `string`).

- [ ] **Step 5: Commit**

```bash
git add src/utils/nomeDeTecido.ts src/utils/nomeDeTecido.test.ts src/types/index.ts src/components/budgets/BudgetEditor.tsx
git commit -m "feat(v3.1): faixa de cor livre (até 6) no nome do tecido, nos tipos e no orçamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Repositório, trava de escrita e hook

**Files:**
- Create: `src/repositories/tabelaVerdadeRepository.ts`
- Create: `src/hooks/useTabelaVerdade.ts`
- Modify: `src/utils/escritasDeRisco.test.ts` (novo caso)

**Interfaces:**
- Consumes: tipos de `src/utils/tabelaVerdade.ts` (Task 2); RPCs da Task 1.
- Produces:

```ts
export interface PayloadComercial { fornecedor_id: string; linha_id?: string | null; usa_frete_do_fornecedor?: boolean; usa_condicoes_do_fornecedor?: boolean;
  frete?: { modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null }; condicoes?: { id?: string; nome: string; ordem: number; padrao: boolean }[] }
export interface PayloadTipo { id?: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao?: string | null;
  faixas: { id?: string; nome: string; ordem: number }[]; cores: { nome: string; hex: string; faixa: string }[];
  precos?: { faixa: string; condicao_id: string; vale_desde?: string; valor: number | null }[] }
export interface CompraDoInsumoTV { insumo_id: string; data: string; quantidade: number; custo_unitario: number; fornecedor_id: string | null; compra_id: string }
tabelaVerdadeRepository.catalogo(fornecedorId?: string): Promise<Catalogo>
tabelaVerdadeRepository.insumosComFaixa(): Promise<{ id: string; faixa_id: string }[]>
tabelaVerdadeRepository.comprasDosInsumos(insumoIds: string[], desde: string): Promise<CompraDoInsumoTV[]>
tabelaVerdadeRepository.comprasDoFornecedor(fornecedorId: string): Promise<CompraDoInsumoTV[]>
tabelaVerdadeRepository.salvarComercial(p: PayloadComercial): Promise<void>
tabelaVerdadeRepository.salvarLinha(p: { id?: string; fornecedor_id: string; nome: string }): Promise<string>
tabelaVerdadeRepository.salvarTipo(p: PayloadTipo): Promise<string>
tabelaVerdadeRepository.reajustar(p: { vale_desde: string; precos: { faixa_id: string; condicao_id: string; valor: number }[] }): Promise<void>
useCatalogoDoFornecedor(fornecedorId: string): { catalogo: Catalogo | null; erro: string; recarregar: () => void }
useCustoDeReferencia(): Map<string, number>   // cache de 60 s, compartilhado
invalidarCustoDeReferencia(): void
```

- [ ] **Step 1: Trava em `escritasDeRisco.test.ts` (acrescentar ao fim)**

```ts
test('tabela verdade só grava por RPC: nenhum insert/update/upsert/delete direto nas tabelas dela', () => {
    const TABELAS = ['tecido_linhas', 'tecido_tipos', 'tecido_faixas', 'tecido_precos', 'fornecedor_condicoes', 'fornecedor_frete'];
    const padrao = new RegExp(`from\\(['"](${TABELAS.join('|')})['"]\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`);
    // Prova de que o padrão sabe reprovar (teste que varre texto precisa provar que casa).
    assert.ok(padrao.test(`supabase.from('tecido_precos').upsert(x)`));
    for (const f of arquivos) {
        assert.ok(!padrao.test(semComentarios(fonte(f))), `${f} grava direto numa tabela da tabela verdade: use a RPC`);
    }
});
```

- [ ] **Step 2: Rodar (passa já: o repositório ainda não existe; o caso de prova garante que o padrão casa)**

Run: `node --test --experimental-strip-types src/utils/escritasDeRisco.test.ts` — Expected: PASS.

- [ ] **Step 3: Repositório**

```ts
import { supabase } from '@/services/supabase';
import { lerEmPaginas } from '@/utils/financas/paginas';
import type { Catalogo, ModoFrete, TVPreco } from '@/utils/tabelaVerdade';

export interface PayloadComercial {
    fornecedor_id: string; linha_id?: string | null;
    usa_frete_do_fornecedor?: boolean; usa_condicoes_do_fornecedor?: boolean;
    frete?: { modo: ModoFrete; valor: number | null; remessa_tipica_kg: number | null };
    condicoes?: { id?: string; nome: string; ordem: number; padrao: boolean }[];
}
export interface PayloadTipo {
    id?: string; linha_id: string; nome: string; unidade: 'kg' | 'm'; rendimento_m_por_kg: number | null; composicao?: string | null;
    faixas: { id?: string; nome: string; ordem: number }[];
    cores: { nome: string; hex: string; faixa: string }[];
    precos?: { faixa: string; condicao_id: string; vale_desde?: string; valor: number | null }[];
}
export interface CompraDoInsumoTV { insumo_id: string; data: string; quantidade: number; custo_unitario: number; fornecedor_id: string | null; compra_id: string }

const LIMITE = 50000;

async function tudo<T>(buscar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const { linhas, truncado, erro } = await lerEmPaginas<T>(buscar, LIMITE);
    if (erro) throw new Error(erro);
    if (truncado) throw new Error('Tabela de preços: volume acima do limite de leitura');
    return linhas;
}

async function rpc<T>(nome: string, p: unknown): Promise<T> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase.rpc(nome, { p });
    if (error) throw new Error(error.message);
    return data as T;
}

type LinhaDeCompra = { insumo_id: string; quantidade: number | string; custo_unitario: number | string;
    compra: { id: string; data: string; fornecedor_id: string | null } | { id: string; data: string; fornecedor_id: string | null }[] | null };
const daCompra = (l: LinhaDeCompra): CompraDoInsumoTV | null => {
    const c = Array.isArray(l.compra) ? l.compra[0] : l.compra;
    if (!c) return null;
    return { insumo_id: l.insumo_id, data: c.data, quantidade: Number(l.quantidade), custo_unitario: Number(l.custo_unitario), fornecedor_id: c.fornecedor_id, compra_id: c.id };
};

/** Tabela verdade de tecidos (supabase/v3_1_tabela_verdade.sql). Toda escrita é RPC. */
export const tabelaVerdadeRepository = {
    /** Sem `fornecedorId`, o catálogo inteiro (para o mapa de referência). Preço/condição/frete voltam vazios para quem não é gestão (RLS). */
    async catalogo(fornecedorId?: string): Promise<Catalogo> {
        if (!supabase) return { linhas: [], condicoes: [], fretes: [], tipos: [], faixas: [], precos: [] };
        const s = supabase;
        let ql = s.from('tecido_linhas').select('*').order('ordem');
        if (fornecedorId) ql = ql.eq('fornecedor_id', fornecedorId);
        const { data: linhas, error: e1 } = await ql;
        if (e1) throw new Error(e1.message);
        const idsLinhas = (linhas || []).map(l => l.id);
        if (idsLinhas.length === 0) return { linhas: [], condicoes: [], fretes: [], tipos: [], faixas: [], precos: [] };
        let qTipos = s.from('tecido_tipos').select('*').order('ordem');
        if (fornecedorId) qTipos = qTipos.in('linha_id', idsLinhas);
        const [cond, fretes, tipos] = await Promise.all([
            s.from('fornecedor_condicoes').select('*').order('ordem'),
            s.from('fornecedor_frete').select('*'),
            qTipos,
        ]);
        for (const r of [cond, fretes, tipos]) if (r.error) throw new Error(r.error.message);
        const idsTipos = (tipos.data || []).map(t => t.id);
        const faixas = idsTipos.length
            ? await tudo((de, ate) => s.from('tecido_faixas').select('*').in('tipo_id', idsTipos).order('ordem').range(de, ate))
            : [];
        const idsFaixas = faixas.map((f: { id: string }) => f.id);
        const precos = idsFaixas.length
            ? await tudo<TVPreco>((de, ate) => s.from('tecido_precos').select('faixa_id, condicao_id, vale_desde, valor, origem')
                .in('faixa_id', idsFaixas).order('vale_desde').range(de, ate))
            : [];
        const cores = idsFaixas.length
            ? await tudo<{ color_name: string; hex: string; faixa_id: string }>((de, ate) => s.from('fabric_colors')
                .select('color_name, hex, faixa_id').in('faixa_id', idsFaixas).eq('is_active', true).order('sort_order').range(de, ate))
            : [];
        return {
            cores: cores.map(c => ({ nome: c.color_name, hex: c.hex, faixa_id: c.faixa_id })),
            linhas: linhas || [],
            condicoes: (cond.data || []).filter(c => !fornecedorId || c.fornecedor_id === fornecedorId),
            fretes: (fretes.data || []).filter(f => !fornecedorId || f.fornecedor_id === fornecedorId)
                .map(f => ({ ...f, valor: f.valor === null ? null : Number(f.valor), remessa_tipica_kg: f.remessa_tipica_kg === null ? null : Number(f.remessa_tipica_kg) })),
            tipos: (tipos.data || []).map(t => ({ ...t, rendimento_m_por_kg: t.rendimento_m_por_kg === null ? null : Number(t.rendimento_m_por_kg) })),
            faixas,
            precos: precos.map(p => ({ ...p, valor: Number(p.valor) })),
        };
    },

    async insumosComFaixa(): Promise<{ id: string; faixa_id: string }[]> {
        if (!supabase) return [];
        const s = supabase;
        return tudo((de, ate) => s.from('insumos').select('id, faixa_id').not('faixa_id', 'is', null).order('id').range(de, ate));
    },

    async comprasDosInsumos(insumoIds: string[], desde: string): Promise<CompraDoInsumoTV[]> {
        if (!supabase || insumoIds.length === 0) return [];
        const s = supabase;
        const linhas = await tudo<LinhaDeCompra>((de, ate) => s.from('compra_itens')
            .select('insumo_id, quantidade, custo_unitario, compra:compras!inner(id, data, fornecedor_id)')
            .in('insumo_id', insumoIds).gte('compra.data', desde).order('id').range(de, ate));
        return linhas.map(daCompra).filter((c): c is CompraDoInsumoTV => c !== null);
    },

    async comprasDoFornecedor(fornecedorId: string): Promise<CompraDoInsumoTV[]> {
        if (!supabase) return [];
        const s = supabase;
        const linhas = await tudo<LinhaDeCompra>((de, ate) => s.from('compra_itens')
            .select('insumo_id, quantidade, custo_unitario, compra:compras!inner(id, data, fornecedor_id)')
            .eq('compra.fornecedor_id', fornecedorId).order('id').range(de, ate));
        return linhas.map(daCompra).filter((c): c is CompraDoInsumoTV => c !== null)
            .sort((a, b) => b.data.localeCompare(a.data));
    },

    salvarComercial: (p: PayloadComercial) => rpc<void>('salvar_comercial', p),
    salvarLinha: (p: { id?: string; fornecedor_id: string; nome: string }) => rpc<string>('salvar_linha', p),
    salvarTipo: (p: PayloadTipo) => rpc<string>('salvar_tecido_tipo', p),
    reajustar: (p: { vale_desde: string; precos: { faixa_id: string; condicao_id: string; valor: number }[] }) => rpc<void>('reajustar_precos', p),
};
```

- [ ] **Step 4: Hook `src/hooks/useTabelaVerdade.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { mapaDeReferencia, type Catalogo } from '@/utils/tabelaVerdade';
import { getTodayStr } from '@/utils/date';

export function useCatalogoDoFornecedor(fornecedorId: string) {
    const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
    const [erro, setErro] = useState('');
    const [versao, setVersao] = useState(0);
    useEffect(() => {
        let vivo = true;
        setErro('');
        tabelaVerdadeRepository.catalogo(fornecedorId)
            .then(c => { if (vivo) setCatalogo(c); })
            .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler a tabela de preços.'); });
        return () => { vivo = false; };
    }, [fornecedorId, versao]);
    const recarregar = useCallback(() => { invalidarCustoDeReferencia(); setVersao(v => v + 1); }, []);
    return { catalogo, erro, recarregar };
}

// Um mapa só para a aba inteira: o orçamento monta um selo por linha, e cada um buscar
// o catálogo seria uma consulta por item. 60 s é menos que o tempo de alguém reajustar
// uma tabela numa aba e olhar o orçamento na outra; salvar na tabela invalida na hora.
let cache: { quando: number; mapa: Promise<Map<string, number>> } | null = null;
const ouvintes = new Set<() => void>();

export function invalidarCustoDeReferencia() {
    cache = null;
    ouvintes.forEach(f => f());
}

function carregar(): Promise<Map<string, number>> {
    if (cache && Date.now() - cache.quando < 60_000) return cache.mapa;
    const mapa = Promise.all([tabelaVerdadeRepository.catalogo(), tabelaVerdadeRepository.insumosComFaixa()])
        .then(([cat, insumos]) => mapaDeReferencia(cat, insumos, getTodayStr()))
        // Sem tabela (ou sem acesso a preço) os consumidores seguem com o custo médio.
        .catch(() => new Map<string, number>());
    cache = { quando: Date.now(), mapa };
    return mapa;
}

export function useCustoDeReferencia(): Map<string, number> {
    const [mapa, setMapa] = useState<Map<string, number>>(new Map());
    useEffect(() => {
        let vivo = true;
        const ler = () => { carregar().then(m => { if (vivo) setMapa(m); }); };
        ler();
        ouvintes.add(ler);
        return () => { vivo = false; ouvintes.delete(ler); };
    }, []);
    return mapa;
}
```

Conferir que `getTodayStr` existe em `src/utils/date` (é o que `comprasRepository` importa) e que `camadas.test.ts` aceita `hooks → repositories` (é o padrão da base).

- [ ] **Step 5: `tsc`, suíte e commit**

Run: `npx tsc --noEmit` e a suíte inteira. Expected: sem erro; todos passam.

```bash
git add src/repositories/tabelaVerdadeRepository.ts src/hooks/useTabelaVerdade.ts src/utils/escritasDeRisco.test.ts
git commit -m "feat(v3.1): repositório e hook da tabela verdade; trava de escrita só por RPC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ligar os consumidores na tela

**Files:**
- Modify: `src/components/budgets/CustoDaPecaBadge.tsx:67`
- Modify: `src/components/masterdata/ProductForm.tsx:95`
- Modify: `src/components/pcp/LancarCompraModal.tsx:74`
- Modify: `src/components/vendas/LucroPorPedido.tsx:40-75`

**Interfaces:**
- Consumes: `useCustoDeReferencia()` (Task 5); `tabelaVerdadeRepository.catalogo/insumosComFaixa` (Task 5); `mapaDeReferencia` (Task 2); `custoSugerido(...)`, `lucroPorPedido({ referencia })` (Task 3).

- [ ] **Step 1: Custo da peça (orçamento e produto)**

`CustoDaPecaBadge.tsx` — importar `useCustoDeReferencia` de `@/hooks/useTabelaVerdade` e, antes do `useMemo` do custo:

```ts
    const referencia = useCustoDeReferencia();
    const tecidoComTabela = useMemo(
        () => (tecido ? { ...tecido, custo_referencia: tecido.id ? referencia.get(tecido.id) ?? null : null } : tecido),
        [tecido, referencia],
    );
```

e passar `tecido: tecidoComTabela` (dependência `tecidoComTabela` no lugar de `tecido`). Se a prop `tecido` não tiver `id` no tipo, ampliar o tipo da prop para `(InsumoDeCusto & { id?: string }) | null`.

`ProductForm.tsx` — o mesmo, com `selectedFabric`:

```ts
  const referencia = useCustoDeReferencia();
  const tecidoComTabela = useMemo(
    () => (selectedFabric ? { ...selectedFabric, custo_referencia: referencia.get(selectedFabric.id) ?? null } : selectedFabric),
    [selectedFabric, referencia],
  );
```

e `tecido: tecidoComTabela` no `custoDaPeca`.

- [ ] **Step 2: Lançar compra**

`LancarCompraModal.tsx`: `const referencia = useCustoDeReferencia();` no corpo e, na linha 74:

```ts
            insumoId, custo: custoSugerido(referencia.get(insumoId), insumoPorId.get(insumoId)?.average_unit_cost),
```

Se essa linha estiver dentro do inicializador do `useState` (que roda antes de o mapa chegar), acrescentar um efeito que preenche o custo das linhas ainda vazias quando o mapa chega:

```ts
    useEffect(() => {
        if (referencia.size === 0) return;
        setItens(prev => prev.map(it => (it.custo ? it : { ...it, custo: custoSugerido(referencia.get(it.insumoId), insumoPorId.get(it.insumoId)?.average_unit_cost) })));
    }, [referencia, insumoPorId]);
```

- [ ] **Step 3: Lucro do pedido**

`LucroPorPedido.tsx`, no `Promise.all` interno:

```ts
            const [fichas, vinculado, ultimoPreco, catalogo, comFaixa] = await Promise.all([
                comprasRepository.fichasDoPedidoEstrito(entregues.flatMap(p => (p.items || []).map(i => i.product_id))),
                comprasRepository.custoVinculadoPorPedido(entregues.filter(p => !p.compras_legado).map(p => p.id)),
                comprasRepository.ultimoPrecoPorInsumo(),
                tabelaVerdadeRepository.catalogo(),
                tabelaVerdadeRepository.insumosComFaixa(),
            ]);
```

e em `setDados({...})`: `referencia: mapaDeReferencia(catalogo, comFaixa, getTodayStr()),`. Acrescentar `referencia?: Map<string, number>` ao tipo do estado `dados` e os imports (`tabelaVerdadeRepository`, `mapaDeReferencia`, `getTodayStr`). Onde o componente mostra as origens (`origens`), o texto `'tabela'` aparece como "tabela" — conferir se há um mapa de rótulo das origens no componente e acrescentar `'tabela': 'tabela de preços'`.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`, suíte inteira, `npx vite build`.
No navegador (`preview_start` `botezini-v3`, usuário admin de teste): abrir um orçamento com tecido migrado → o selo de custo da peça mostra o custo; Lucro por pedido abre sem erro e lista "tabela de preços" entre as origens de algum pedido sem compra vinculada.

- [ ] **Step 5: Commit**

```bash
git add src/components/budgets/CustoDaPecaBadge.tsx src/components/masterdata/ProductForm.tsx src/components/pcp/LancarCompraModal.tsx src/components/vendas/LucroPorPedido.tsx
git commit -m "feat(v3.1): orçamento, produto, lançar compra e lucro leem o custo de referência

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Página do fornecedor — navegação e aba Dados (frete e condições)

**Files:**
- Create: `src/pages/masterdata/PaginaDoFornecedor.tsx`
- Create: `src/components/tabelaVerdade/ConfigComercial.tsx`
- Modify: `src/pages/MasterData.tsx:44,90,147,416-430`
- Modify: `src/App.tsx:80-84,207,240`

**Interfaces:**
- Consumes: `useCatalogoDoFornecedor`, `tabelaVerdadeRepository.salvarComercial` (Task 5); `condicoesDaLinha`, `freteDaLinha` (Task 2).
- Produces: `AberturaDeCadastro.fornecedorId?: string`; `<PaginaDoFornecedor fornecedor onVoltar onEditar />`; `<ConfigComercial fornecedorId linha? catalogo onSalvou />` (sem `linha` = modelo do fornecedor).

- [ ] **Step 1: Abrir a página a partir da lista e por link**

`MasterData.tsx`:
- `export type AberturaDeCadastro = { clienteId?: string; fornecedorId?: string; dormentes?: boolean; completude?: boolean };`
- `const [fornecedorAberto, setFornecedorAberto] = useState<string | null>(null);`
- no efeito da linha 147: `if (abertura.fornecedorId && suppliers.some(s => s.id === abertura.fornecedorId)) setFornecedorAberto(abertura.fornecedorId);` (usar a lista de fornecedores que o componente já tem; o nome da variável é o que `EntityListTab` recebe para a aba `suppliers`).
- no `EntityListTab`: `onAbrirPagina={activeTab === 'clients' ? (item) => setClienteAberto(item.id) : activeTab === 'suppliers' ? (item) => setFornecedorAberto(item.id) : undefined}` e acrescentar `&& !fornecedorAberto` à condição que mostra a lista.
- antes da lista:

```tsx
      {activeTab === 'suppliers' && fornecedorAberto && suppliers.find(s => s.id === fornecedorAberto) && (
        <PaginaDoFornecedor
          fornecedor={suppliers.find(s => s.id === fornecedorAberto)!}
          onVoltar={() => setFornecedorAberto(null)}
          onEditar={() => handleOpenModal('supplier', suppliers.find(s => s.id === fornecedorAberto))}
        />
      )}
```

`App.tsx`: `const [aberturaFornecedores, setAberturaFornecedores] = useState<AberturaDeCadastro | null>(null);`, limpar ao sair da view (mesmo padrão da linha 84), `case 'fornecedores': return <MasterData key="fornecedores" aba="suppliers" abertura={aberturaFornecedores} limparAbertura={() => setAberturaFornecedores(null)} {...comuns} />;` e passar ao `Inventory` `onAbrirFornecedor={(id) => { setAberturaFornecedores({ fornecedorId: id }); setCurrentView('fornecedores'); }}` (usar o setter de view que o `App` já usa nas outras aberturas).

- [ ] **Step 2: `ConfigComercial.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Plus, Trash2, Truck, CalendarClock } from 'lucide-react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { condicoesDaLinha, freteDaLinha, type Catalogo, type ModoFrete, type TVLinha } from '@/utils/tabelaVerdade';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

const MODOS: { valor: ModoFrete; rotulo: string }[] = [
    { valor: 'cif', rotulo: 'CIF (por conta deles)' },
    { valor: 'por_kg', rotulo: 'Por kg' },
    { valor: 'fixo', rotulo: 'Fixo por remessa' },
    { valor: 'cotacao', rotulo: 'A cotar' },
];

type CondUI = { id?: string; nome: string; padrao: boolean };

/** Frete e condições de pagamento: do fornecedor (sem `linha`) ou de uma linha, com "usa o do fornecedor". */
export function ConfigComercial({ fornecedorId, linha, catalogo, onSalvou }: {
    fornecedorId: string; linha?: TVLinha; catalogo: Catalogo; onSalvou: () => void;
}) {
    const chaveLinha = linha?.id ?? null;
    const condAtuais = catalogo.condicoes.filter(c => c.fornecedor_id === fornecedorId && c.linha_id === chaveLinha && c.ativa)
        .sort((a, b) => a.ordem - b.ordem);
    const freteAtual = catalogo.fretes.find(f => f.fornecedor_id === fornecedorId && f.linha_id === chaveLinha) ?? null;

    const [usaFrete, setUsaFrete] = useState(linha?.usa_frete_do_fornecedor ?? false);
    const [usaCond, setUsaCond] = useState(linha?.usa_condicoes_do_fornecedor ?? false);
    const [modo, setModo] = useState<ModoFrete>(freteAtual?.modo ?? 'cotacao');
    const [valor, setValor] = useState(freteAtual?.valor != null ? String(freteAtual.valor) : '');
    const [remessa, setRemessa] = useState(freteAtual?.remessa_tipica_kg != null ? String(freteAtual.remessa_tipica_kg) : '');
    const [conds, setConds] = useState<CondUI[]>(condAtuais.map(c => ({ id: c.id, nome: c.nome, padrao: c.padrao })));
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        setConds(condAtuais.map(c => ({ id: c.id, nome: c.nome, padrao: c.padrao })));
        setModo(freteAtual?.modo ?? 'cotacao');
        setValor(freteAtual?.valor != null ? String(freteAtual.valor) : '');
        setRemessa(freteAtual?.remessa_tipica_kg != null ? String(freteAtual.remessa_tipica_kg) : '');
        setUsaFrete(linha?.usa_frete_do_fornecedor ?? false);
        setUsaCond(linha?.usa_condicoes_do_fornecedor ?? false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [catalogo, chaveLinha]);

    const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
    const salvar = async () => {
        setErro('');
        const lista = conds.filter(c => c.nome.trim());
        if (!(linha && usaCond) && lista.length === 0) { setErro('Informe ao menos uma condição de pagamento.'); return; }
        if (!(linha && usaFrete) && (modo === 'por_kg' || modo === 'fixo') && !(num(valor)! >= 0)) { setErro('Informe o valor do frete.'); return; }
        setSalvando(true);
        try {
            await tabelaVerdadeRepository.salvarComercial({
                fornecedor_id: fornecedorId,
                linha_id: chaveLinha,
                ...(linha ? { usa_frete_do_fornecedor: usaFrete, usa_condicoes_do_fornecedor: usaCond } : {}),
                frete: { modo, valor: modo === 'cif' || modo === 'cotacao' ? null : num(valor), remessa_tipica_kg: modo === 'fixo' ? num(remessa) : null },
                condicoes: lista.map((c, i) => ({ id: c.id, nome: c.nome.trim(), ordem: i + 1, padrao: c.padrao })),
            });
            onSalvou();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui salvar.');
        } finally {
            setSalvando(false);
        }
    };

    const freteTravado = !!linha && usaFrete;
    const condTravadas = !!linha && usaCond;
    return (
        <div className="space-y-4">
            <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`${ROTULO_PEQUENO} flex items-center gap-1.5`}><Truck size={14} /> Frete</span>
                    {linha && (
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input type="checkbox" checked={usaFrete} onChange={e => setUsaFrete(e.target.checked)} /> usa o do fornecedor
                        </label>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <select className={CAMPO} value={modo} disabled={freteTravado} onChange={e => setModo(e.target.value as ModoFrete)}>
                        {MODOS.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                    </select>
                    {(modo === 'por_kg' || modo === 'fixo') && (
                        <input className={`${CAMPO} w-32`} inputMode="decimal" disabled={freteTravado} value={valor}
                            placeholder={modo === 'por_kg' ? 'R$ por kg' : 'R$ por remessa'} onChange={e => setValor(e.target.value)} />
                    )}
                    {modo === 'fixo' && (
                        <input className={`${CAMPO} w-40`} inputMode="decimal" disabled={freteTravado} value={remessa}
                            placeholder="remessa típica (kg)" onChange={e => setRemessa(e.target.value)} />
                    )}
                </div>
                {modo === 'fixo' && !remessa && !freteTravado && (
                    <p className="text-xs text-amber-400/90">Sem a remessa típica o frete fixo não entra no custo de referência (fica como pendência).</p>
                )}
            </section>

            <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={`${ROTULO_PEQUENO} flex items-center gap-1.5`}><CalendarClock size={14} /> Condições de pagamento</span>
                    {linha && (
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            <input type="checkbox" checked={usaCond} onChange={e => setUsaCond(e.target.checked)} /> usa as do fornecedor
                        </label>
                    )}
                </div>
                {conds.map((c, i) => (
                    <div key={c.id ?? `nova-${i}`} className="flex items-center gap-2">
                        <input className={`${CAMPO} flex-1 min-w-0`} value={c.nome} disabled={condTravadas} placeholder="Ex.: 30 dias"
                            onChange={e => setConds(prev => prev.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
                        <label className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
                            <input type="radio" name={`padrao-${chaveLinha ?? 'f'}`} checked={c.padrao} disabled={condTravadas}
                                onChange={() => setConds(prev => prev.map((x, k) => ({ ...x, padrao: k === i })))} /> padrão
                        </label>
                        {!condTravadas && (
                            <button type="button" aria-label="Tirar condição" className="h-11 w-11 inline-flex items-center justify-center text-zinc-500 hover:text-rose-400"
                                onClick={() => setConds(prev => prev.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
                        )}
                    </div>
                ))}
                {!condTravadas && (
                    <button type="button" className={BOTAO_SUAVE} onClick={() => setConds(prev => [...prev, { nome: '', padrao: prev.length === 0 }])}>
                        <Plus size={14} /> Condição
                    </button>
                )}
                <p className="text-xs text-zinc-500">A condição padrão é a que entra nos cálculos; as outras ficam para consulta.</p>
            </section>

            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            <button type="button" className={BOTAO_PRINCIPAL} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar frete e condições'}</button>
        </div>
    );
}

export { condicoesDaLinha, freteDaLinha };
```

(Remover a última linha de reexport se o `tsc` acusar uso não necessário; ela só existe se alguma tela importar dali.)

- [ ] **Step 3: `PaginaDoFornecedor.tsx` (abas; Tabela e Compras entram nas Tasks 8 e 10)**

```tsx
import { useState } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import type { Supplier } from '@/types';
import { useCatalogoDoFornecedor } from '@/hooks/useTabelaVerdade';
import { ConfigComercial } from '@/components/tabelaVerdade/ConfigComercial';
import { BOTAO_SECUNDARIO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

type Aba = 'dados' | 'tabela' | 'compras';

export function PaginaDoFornecedor({ fornecedor, onVoltar, onEditar }: { fornecedor: Supplier; onVoltar: () => void; onEditar: () => void }) {
    const [aba, setAba] = useState<Aba>('tabela');
    const { catalogo, erro, recarregar } = useCatalogoDoFornecedor(fornecedor.id);
    const ABAS: { id: Aba; rotulo: string }[] = [{ id: 'dados', rotulo: 'Dados' }, { id: 'tabela', rotulo: 'Tabela de preços' }, { id: 'compras', rotulo: 'Compras' }];
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <button type="button" aria-label="Voltar" onClick={onVoltar} className="h-11 w-11 inline-flex items-center justify-center text-zinc-400 hover:text-white"><ArrowLeft size={18} /></button>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-white truncate">{fornecedor.company_name}</h2>
                        <p className="text-xs text-zinc-500">{catalogo ? `${catalogo.linhas.length} linha(s) · ${catalogo.tipos.length} tecido(s)` : 'Fornecedor'}</p>
                    </div>
                </div>
                <button type="button" className={BOTAO_SECUNDARIO} onClick={onEditar}><Pencil size={14} /> Editar dados</button>
            </div>
            <div role="tablist" className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
                {ABAS.map(a => (
                    <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                        className={`px-3 h-11 text-sm whitespace-nowrap border-b-2 ${aba === a.id ? 'border-amber-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
                        {a.rotulo}
                    </button>
                ))}
            </div>
            {erro && <p className="text-sm text-rose-400">{erro}</p>}
            {aba === 'dados' && (
                <div className="grid gap-6 md:grid-cols-2">
                    <dl className="space-y-2 text-sm">
                        {([['CNPJ', fornecedor.cnpj], ['Contato', fornecedor.contact_person], ['Telefone', fornecedor.phone], ['E-mail', fornecedor.email], ['Endereço', fornecedor.address]] as const)
                            .map(([r, v]) => (<div key={r}><dt className={ROTULO_PEQUENO}>{r}</dt><dd className="text-zinc-200">{v || '—'}</dd></div>))}
                    </dl>
                    {catalogo && (
                        <div>
                            <p className="text-xs text-zinc-500 mb-3">Padrão do fornecedor. Cada linha usa isto enquanto estiver marcada "usa o do fornecedor".</p>
                            <ConfigComercial fornecedorId={fornecedor.id} catalogo={catalogo} onSalvou={recarregar} />
                        </div>
                    )}
                </div>
            )}
            {aba === 'tabela' && catalogo && <p className="text-sm text-zinc-500">Tabela de preços (Task 8).</p>}
            {aba === 'compras' && <p className="text-sm text-zinc-500">Compras (Task 10).</p>}
        </div>
    );
}
```

Os dois `<p>` provisórios são substituídos nas Tasks 8 e 10, no mesmo ramo, antes de qualquer push.

- [ ] **Step 4: Verificar no navegador**

`npx tsc --noEmit`; `preview_start` `botezini-v3`; admin de teste: Cadastros › Fornecedores › clicar num fornecedor migrado → abre a página; aba Dados → trocar frete para "Por kg 0,15", acrescentar "30 dias" como padrão, Salvar → recarrega com os valores. Console sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/pages/masterdata/PaginaDoFornecedor.tsx src/components/tabelaVerdade/ConfigComercial.tsx src/pages/MasterData.tsx src/App.tsx
git commit -m "feat(v3.1): página do fornecedor com frete e condições de pagamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Aba Tabela de preços — linhas, grade, compras reais, aviso, reajuste

**Files:**
- Create: `src/components/tabelaVerdade/TabelaDePrecos.tsx`
- Create: `src/components/tabelaVerdade/CartaoDoTipo.tsx`
- Create: `src/components/tabelaVerdade/ComprasReais.tsx`
- Create: `src/components/tabelaVerdade/ReajusteModal.tsx`
- Modify: `src/pages/masterdata/PaginaDoFornecedor.tsx` (trocar o `<p>` da aba tabela)

**Interfaces:**
- Consumes: `Catalogo`, `condicoesDaLinha`, `custoDeReferencia`, `precoVigente`, `comparacaoComComprado`, `freteNaUnidade`, `freteDaLinha`, `menosDias`, `JANELA_DIAS` (Task 2); `tabelaVerdadeRepository.salvarLinha/salvarTipo/reajustar/comprasDosInsumos` (Task 5); `ConfigComercial` (Task 7); `EditorDeTecido` (Task 9 — nesta task o botão "Novo tecido"/"Editar tecido" chama `onEditarTipo`, que a Task 9 liga).
- Produces: `<TabelaDePrecos fornecedorId catalogo onMudou onEditarTipo={(linhaId, tipoId?) => void} />`.

- [ ] **Step 1: `ComprasReais.tsx`**

```tsx
import type { Comparacao } from '@/utils/tabelaVerdade';
import { dinheiro, dataCurta } from '@/utils/numeros';

/** Menor, média e maior pagos na janela, com datas e o previsto (pedido do Luiz, 29/10). */
export function ComprasReais({ c }: { c: Comparacao }) {
    const caixa = 'flex-1 min-w-[8rem] rounded-xl border border-zinc-800 p-3';
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            <div className={caixa}><p className="text-xs text-zinc-500">Menor</p><p className="text-white font-bold">{dinheiro(c.menor.valor)}</p><p className="text-xs text-zinc-500">{dataCurta(c.menor.data)}</p></div>
            <div className={`${caixa} ${c.acima ? 'border-amber-500/50' : ''}`}>
                <p className="text-xs text-zinc-500">Média (90 dias)</p>
                <p className={`font-bold ${c.acima ? 'text-amber-400' : 'text-white'}`}>{dinheiro(c.media)}</p>
                <p className="text-xs text-zinc-500">{c.previstoMedio !== null ? `previsto ${dinheiro(c.previstoMedio)} · ` : ''}{c.compras} compra(s)</p>
            </div>
            <div className={caixa}><p className="text-xs text-zinc-500">Maior</p><p className="text-white font-bold">{dinheiro(c.maior.valor)}</p><p className="text-xs text-zinc-500">{dataCurta(c.maior.data)}</p></div>
        </div>
    );
}
```

Conferir em `src/utils/numeros.ts` os nomes reais das funções de moeda e de data curta (a regra do 1.000); se forem outros, usar os de lá — não criar formatador novo.

- [ ] **Step 2: `ReajusteModal.tsx`**

```tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { precoVigente, type TVCondicao, type TVFaixa, type TVPreco } from '@/utils/tabelaVerdade';
import { getTodayStr } from '@/utils/date';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

/** Reajuste: grade nova com data de vigência; a anterior fica no histórico. */
export function ReajusteModal({ nomeTipo, faixas, condicoes, precos, onClose, onFeito }: {
    nomeTipo: string; faixas: TVFaixa[]; condicoes: TVCondicao[]; precos: TVPreco[]; onClose: () => void; onFeito: () => void;
}) {
    const hoje = getTodayStr();
    const [data, setData] = useState(hoje);
    const [grade, setGrade] = useState<Record<string, string>>(() => Object.fromEntries(faixas.flatMap(f => condicoes.map(c => [
        `${f.id}|${c.id}`, String(precoVigente(precos, f.id, c.id, hoje)?.valor ?? '')]))));
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
        setErro(''); setSalvando(true);
        try {
            await tabelaVerdadeRepository.reajustar({
                vale_desde: data,
                precos: Object.entries(grade).filter(([, v]) => Number(v.replace(',', '.')) > 0).map(([k, v]) => {
                    const [faixa_id, condicao_id] = k.split('|');
                    return { faixa_id, condicao_id, valor: Number(v.replace(',', '.')) };
                }),
            });
            onFeito();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui reajustar.'); } finally { setSalvando(false); }
    };
    return createPortal(
        <div className="fixed inset-0 z-sobreposto bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
                <h3 className="text-white font-black">Reajustar {nomeTipo}</h3>
                <label className="block"><span className={ROTULO_PEQUENO}>Passa a valer em</span>
                    <input type="date" className={`${CAMPO} mt-1`} value={data} onChange={e => setData(e.target.value)} /></label>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr><th className="text-left text-zinc-500 font-bold p-2">Faixa</th>{condicoes.map(c => <th key={c.id} className="text-right text-zinc-500 font-bold p-2">{c.nome}</th>)}</tr></thead>
                        <tbody>{faixas.map(f => (
                            <tr key={f.id} className="border-t border-zinc-800"><td className="p-2 text-zinc-300">{f.nome}</td>
                                {condicoes.map(c => (<td key={c.id} className="p-1"><input className={`${CAMPO} w-24 text-right`} inputMode="decimal"
                                    aria-label={`${f.nome} ${c.nome}`} value={grade[`${f.id}|${c.id}`] ?? ''}
                                    onChange={e => setGrade(g => ({ ...g, [`${f.id}|${c.id}`]: e.target.value }))} /></td>))}
                            </tr>))}</tbody>
                    </table>
                </div>
                <p className="text-xs text-zinc-500">Os preços de antes continuam guardados; compras antigas seguem comparadas com o preço da data delas.</p>
                {erro && <p className="text-xs text-rose-400">{erro}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className={BOTAO_SECUNDARIO} onClick={onClose}>Cancelar</button>
                    <button type="button" className={BOTAO_PRINCIPAL} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Aplicar reajuste'}</button>
                </div>
            </div>
        </div>, document.body);
}
```

- [ ] **Step 3: `CartaoDoTipo.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Pencil, TrendingUp } from 'lucide-react';
import {
    condicoesDaLinha, custoDeReferencia, precoVigente, comparacaoComComprado, freteNaUnidade, freteDaLinha,
    type Catalogo, type TVTipo, type Comparacao,
} from '@/utils/tabelaVerdade';
import type { CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { getTodayStr } from '@/utils/date';
import { dinheiro } from '@/utils/numeros';
import { CAMPO, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { ComprasReais } from './ComprasReais';
import { ReajusteModal } from './ReajusteModal';

export function comparacoesDoTipo(tipo: TVTipo, cat: Catalogo, compras: CompraDoInsumoTV[], hoje: string): Map<string, Comparacao | null> {
    const linhaId = tipo.linha_id;
    const padrao = condicoesDaLinha(linhaId, cat.condicoes).find(c => c.padrao);
    const frete = freteNaUnidade(freteDaLinha(linhaId, cat.fretes), tipo).valor;
    const mapa = new Map<string, Comparacao | null>();
    for (const fx of cat.faixas.filter(f => f.tipo_id === tipo.id)) {
        const daFaixa = compras.filter(c => c.insumo_id === fx.insumo_id);
        const previsto = (d: string) => {
            const p = padrao ? precoVigente(cat.precos, fx.id, padrao.id, d) : null;
            return p ? p.valor + frete : null;
        };
        mapa.set(fx.id, comparacaoComComprado(daFaixa, previsto, hoje));
    }
    return mapa;
}

export function CartaoDoTipo({ tipo, catalogo, compras, aberto, onAlternar, onMudou, onEditar }: {
    tipo: TVTipo; catalogo: Catalogo; compras: CompraDoInsumoTV[]; aberto: boolean;
    onAlternar: () => void; onMudou: () => void; onEditar: () => void;
}) {
    const hoje = getTodayStr();
    const faixas = catalogo.faixas.filter(f => f.tipo_id === tipo.id).sort((a, b) => a.ordem - b.ordem);
    const condicoes = condicoesDaLinha(tipo.linha_id, catalogo.condicoes);
    const comparacoes = useMemo(() => comparacoesDoTipo(tipo, catalogo, compras, hoje), [tipo, catalogo, compras, hoje]);
    const acima = [...comparacoes.values()].filter(c => c?.acima).length;
    const refs = faixas.map(f => custoDeReferencia(f, catalogo, hoje).valor).filter((v): v is number => v !== null);
    const [expandida, setExpandida] = useState<string | null>(null);
    const [reajuste, setReajuste] = useState(false);
    const [erro, setErro] = useState('');
    const cores = (faixaId: string) => (catalogo.cores ?? []).filter(c => c.faixa_id === faixaId).length;

    // Corrige o preço vigente (mesmo vale_desde); célula vazia sem preço cria um hoje.
    const gravar = async (faixaNome: string, faixaId: string, condicaoId: string, texto: string) => {
        setErro('');
        const vigente = precoVigente(catalogo.precos, faixaId, condicaoId, hoje);
        const valor = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
        if (valor !== null && !(valor > 0)) { setErro('Preço tem de ser maior que zero.'); return; }
        if (valor === (vigente?.valor ?? null)) return;
        try {
            await tabelaVerdadeRepository.salvarTipo({
                id: tipo.id, linha_id: tipo.linha_id, nome: tipo.nome, unidade: tipo.unidade,
                rendimento_m_por_kg: tipo.rendimento_m_por_kg, composicao: tipo.composicao,
                faixas: faixas.map(f => ({ id: f.id, nome: f.nome, ordem: f.ordem })),
                // A cartela vai inteira: salvar_tecido_tipo trata a lista como o conjunto do banco.
                cores: (catalogo.cores ?? [])
                    .filter(c => faixas.some(f => f.id === c.faixa_id))
                    .map(c => ({ nome: c.nome, hex: c.hex, faixa: faixas.find(f => f.id === c.faixa_id)!.nome })),
                precos: [{ faixa: faixaNome, condicao_id: condicaoId, vale_desde: vigente?.vale_desde, valor }],
            });
            onMudou();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui salvar o preço.'); }
    };

    return (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <button type="button" onClick={onAlternar} aria-expanded={aberto} className="w-full flex flex-wrap items-center justify-between gap-2 p-4 text-left min-h-11">
                <span className="min-w-0"><span className="text-white font-bold">{tipo.nome}</span>
                    <span className="text-xs text-zinc-500"> · {tipo.unidade}{tipo.rendimento_m_por_kg ? ` · ${tipo.rendimento_m_por_kg} m/kg` : ''}{tipo.composicao ? ` · ${tipo.composicao}` : ''} · {faixas.length} faixa(s)</span></span>
                <span className="flex items-center gap-2 text-xs">
                    {acima > 0 && <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={14} /> {acima} acima</span>}
                    {!aberto && refs.length > 0 && <span className="text-zinc-400">ref. {dinheiro(Math.min(...refs))}{refs.length > 1 ? ` a ${dinheiro(Math.max(...refs))}` : ''}/{tipo.unidade}</span>}
                    <ChevronDown size={16} className={`text-zinc-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                </span>
            </button>
            {aberto && (
                <div className="px-4 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={BOTAO_SECUNDARIO} onClick={onEditar}><Pencil size={14} /> Editar tecido</button>
                        <button type="button" className={BOTAO_SECUNDARIO} disabled={condicoes.length === 0} onClick={() => setReajuste(true)}><TrendingUp size={14} /> Reajustar</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-zinc-500">
                                <th className="text-left font-bold p-2">Faixa</th>
                                {condicoes.map(c => <th key={c.id} className={`text-right font-bold p-2 ${c.padrao ? 'text-amber-400' : ''}`}>{c.nome}{c.padrao ? ' · padrão' : ''}</th>)}
                                <th className="text-right font-bold p-2">Ref. c/ frete</th><th className="text-right font-bold p-2">Compras</th>
                            </tr></thead>
                            <tbody>{faixas.map(f => {
                                const ref = custoDeReferencia(f, catalogo, hoje);
                                const comp = comparacoes.get(f.id) ?? null;
                                return (
                                    <tr key={f.id} className="border-t border-zinc-800 align-middle">
                                        <td className="p-2 text-zinc-200 whitespace-nowrap">{f.nome}<span className="text-zinc-500 text-xs"> · {cores(f.id)} cor(es)</span></td>
                                        {condicoes.map(c => (
                                            <td key={c.id} className="p-1 text-right">
                                                <input className={`${CAMPO} w-24 text-right ${c.padrao ? 'text-amber-300' : ''}`} inputMode="decimal"
                                                    aria-label={`Preço ${f.nome} ${c.nome}`} defaultValue={precoVigente(catalogo.precos, f.id, c.id, hoje)?.valor ?? ''}
                                                    onBlur={e => gravar(f.nome, f.id, c.id, e.target.value)} />
                                            </td>))}
                                        <td className="p-2 text-right text-white whitespace-nowrap" title={ref.pendencias.join(', ')}>
                                            {ref.valor !== null ? dinheiro(ref.valor) : <span className="text-zinc-500">{ref.pendencias[0] ?? '—'}</span>}
                                            {ref.valor !== null && ref.pendencias.length > 0 && <AlertTriangle size={12} className="inline ml-1 text-amber-400" />}
                                        </td>
                                        <td className="p-2 text-right whitespace-nowrap">
                                            {comp === null ? <span className="text-zinc-500">sem compra</span> : (
                                                <button type="button" className={`underline-offset-2 hover:underline min-h-11 ${comp.acima ? 'text-amber-400' : 'text-zinc-300'}`}
                                                    aria-expanded={expandida === f.id} onClick={() => setExpandida(x => (x === f.id ? null : f.id))}>
                                                    {comp.acima ? `+${comp.diferencaPct?.toFixed(1).replace('.', ',')}%` : 'ok'} · ver
                                                </button>)}
                                        </td>
                                    </tr>);
                            })}</tbody>
                        </table>
                    </div>
                    {expandida && comparacoes.get(expandida) && (
                        <div><p className="text-xs text-zinc-500">Compras reais · {faixas.find(f => f.id === expandida)?.nome}</p><ComprasReais c={comparacoes.get(expandida)!} /></div>
                    )}
                    {erro && <p className="text-xs text-rose-400">{erro}</p>}
                </div>
            )}
            {reajuste && (
                <ReajusteModal nomeTipo={tipo.nome} faixas={faixas} condicoes={condicoes} precos={catalogo.precos}
                    onClose={() => setReajuste(false)} onFeito={() => { setReajuste(false); onMudou(); }} />
            )}
        </div>
    );
}
```

As cores por faixa já vêm no catálogo (`catalogo.cores`, lido em `tabelaVerdadeRepository.catalogo`, Task 5).

- [ ] **Step 4: `TabelaDePrecos.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Settings2 } from 'lucide-react';
import type { Catalogo } from '@/utils/tabelaVerdade';
import { JANELA_DIAS, menosDias } from '@/utils/tabelaVerdade';
import { tabelaVerdadeRepository, type CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import { getTodayStr } from '@/utils/date';
import { CAMPO, BOTAO_SUAVE, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { ConfigComercial } from './ConfigComercial';
import { CartaoDoTipo, comparacoesDoTipo } from './CartaoDoTipo';

export function TabelaDePrecos({ fornecedorId, catalogo, onMudou, onEditarTipo }: {
    fornecedorId: string; catalogo: Catalogo; onMudou: () => void; onEditarTipo: (linhaId: string, tipoId?: string) => void;
}) {
    const hoje = getTodayStr();
    const [linhaId, setLinhaId] = useState(catalogo.linhas[0]?.id ?? '');
    const [config, setConfig] = useState(false);
    const [aberto, setAberto] = useState<string | null>(null);
    const [novaLinha, setNovaLinha] = useState<string | null>(null);
    const [compras, setCompras] = useState<CompraDoInsumoTV[]>([]);
    const [erro, setErro] = useState('');
    useEffect(() => { if (!catalogo.linhas.some(l => l.id === linhaId)) setLinhaId(catalogo.linhas[0]?.id ?? ''); }, [catalogo, linhaId]);
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.comprasDosInsumos(catalogo.faixas.map(f => f.insumo_id), menosDias(hoje, JANELA_DIAS))
            .then(c => { if (vivo) setCompras(c); }).catch(() => { if (vivo) setCompras([]); });
        return () => { vivo = false; };
    }, [catalogo, hoje]);

    const linha = catalogo.linhas.find(l => l.id === linhaId);
    const tipos = catalogo.tipos.filter(t => t.linha_id === linhaId).sort((a, b) => a.ordem - b.ordem);
    const faixasAcima = useMemo(() => catalogo.tipos.reduce((n, t) =>
        n + [...comparacoesDoTipo(t, catalogo, compras, hoje).values()].filter(c => c?.acima).length, 0), [catalogo, compras, hoje]);

    const criarLinha = async () => {
        if (!novaLinha?.trim()) return;
        setErro('');
        try { const id = await tabelaVerdadeRepository.salvarLinha({ fornecedor_id: fornecedorId, nome: novaLinha.trim() }); setNovaLinha(null); setLinhaId(id); onMudou(); }
        catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui criar a linha.'); }
    };

    return (
        <div className="space-y-4">
            {faixasAcima > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    <AlertTriangle size={16} /> {faixasAcima} faixa(s) comprando acima da tabela (média dos últimos {JANELA_DIAS} dias)
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {catalogo.linhas.map(l => (
                    <button key={l.id} type="button" aria-pressed={l.id === linhaId} onClick={() => { setLinhaId(l.id); setConfig(false); }}
                        className={`h-11 px-4 rounded-full border text-sm ${l.id === linhaId ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-zinc-700 text-zinc-400'}`}>{l.nome}</button>
                ))}
                {novaLinha === null
                    ? <button type="button" className={BOTAO_SUAVE} onClick={() => setNovaLinha('')}><Plus size={14} /> Linha</button>
                    : <span className="flex gap-2"><input autoFocus className={CAMPO} placeholder="Ex.: Tricoline" value={novaLinha}
                        onChange={e => setNovaLinha(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criarLinha(); if (e.key === 'Escape') setNovaLinha(null); }} />
                        <button type="button" className={BOTAO_SECUNDARIO} onClick={criarLinha}>Criar</button></span>}
            </div>
            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            {!linha && <p className="text-sm text-zinc-500">Nenhuma linha ainda. Crie a primeira (ex.: Brim) para cadastrar os tecidos dela.</p>}
            {linha && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
                        <span>Frete e condições: {linha.usa_frete_do_fornecedor && linha.usa_condicoes_do_fornecedor ? 'os do fornecedor' : 'próprios desta linha'}</span>
                        <button type="button" className={BOTAO_SUAVE} aria-expanded={config} onClick={() => setConfig(c => !c)}><Settings2 size={14} /> Frete e condições da linha</button>
                    </div>
                    {config && <div className="rounded-2xl border border-zinc-800 p-4"><ConfigComercial fornecedorId={fornecedorId} linha={linha} catalogo={catalogo} onSalvou={onMudou} /></div>}
                    {tipos.map(t => (
                        <CartaoDoTipo key={t.id} tipo={t} catalogo={catalogo} compras={compras} aberto={aberto === t.id}
                            onAlternar={() => setAberto(a => (a === t.id ? null : t.id))} onMudou={onMudou} onEditar={() => onEditarTipo(linha.id, t.id)} />
                    ))}
                    <button type="button" className={BOTAO_SUAVE} onClick={() => onEditarTipo(linha.id)}><Plus size={14} /> Novo tecido em {linha.nome}</button>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Ligar na página**

Em `PaginaDoFornecedor.tsx`, trocar o `<p>` da aba tabela por:

```tsx
            {aba === 'tabela' && catalogo && (
                <TabelaDePrecos fornecedorId={fornecedor.id} catalogo={catalogo} onMudou={recarregar}
                    onEditarTipo={(linhaId, tipoId) => setEditando({ linhaId, tipoId })} />
            )}
```

com `const [editando, setEditando] = useState<{ linhaId: string; tipoId?: string } | null>(null);` (o editor que usa este estado entra na Task 9).

- [ ] **Step 6: Verificar no navegador**

`npx tsc --noEmit`, `npx vite build`. Admin de teste, fornecedor migrado, aba Tabela: linha "Geral" com os tipos migrados; abrir um tipo → grade com a coluna da condição padrão em destaque e "Ref. c/ frete" preenchida para faixas com preço importado; mudar um preço e sair do campo → recarrega com o valor novo; Reajustar com data de amanhã → a grade de hoje não muda; "+ Linha" cria "Tricoline". Lançar uma compra (Fábrica › Lista de compras) de um tecido a um preço 5% acima → na tabela, a faixa mostra `+5,0% · ver`, e o aviso no topo conta 1. Com 390 px de largura, a grade rola na horizontal dentro do cartão, sem rolar a página.

- [ ] **Step 7: Commit**

```bash
git add src/components/tabelaVerdade src/pages/masterdata/PaginaDoFornecedor.tsx src/repositories/tabelaVerdadeRepository.ts src/utils/tabelaVerdade.ts
git commit -m "feat(v3.1): aba Tabela de preços (linhas, grade, compras reais, aviso, reajuste)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Editor do tecido e Estoque agrupado

**Files:**
- Create: `src/components/tabelaVerdade/EditorDeTecido.tsx`
- Modify: `src/pages/masterdata/PaginaDoFornecedor.tsx` (montar o editor)
- Modify: `src/pages/Inventory.tsx` (agrupamento, "abrir na tabela", "Novo tecido")
- Delete (no fim da task, se nada mais importar): `src/components/inventory/NovoTecidoModal.tsx`

**Interfaces:**
- Consumes: `tabelaVerdadeRepository.salvarTipo` (Task 5); `montarNomeDeTecido`, `separarNomeDeTecido`, `limparCartela`, `interpretarListaDeCores`, `CARTELA_PADRAO` (Task 4); `MAX_FAIXAS` (Task 2).
- Produces: `<EditorDeTecido linhaId catalogo tipoId? onClose onSalvou />`; prop nova `onAbrirFornecedor?: (id: string) => void` em `Inventory`.

- [ ] **Step 1: `EditorDeTecido.tsx`**

Base: o layout e os atalhos de cartela do `NovoTecidoModal` atual (partes do nome, colar lista, copiar cartela de outro tecido, cartela padrão) — copiar o JSX dessas partes dele, trocando:
- custos por faixa → **lista de faixas** editável (1 a `MAX_FAIXAS`), cada uma com nome e botões subir/descer/tirar;
- `FAIXAS_DE_COR` → os nomes das faixas da lista, no seletor de faixa de cada cor e em `interpretarListaDeCores(texto, faixas[0].nome, faixas.map(f => f.nome))`;
- fornecedor → some (vem da linha);
- salvar → uma chamada:

```ts
    const salvar = async () => {
        setErro('');
        const nome = montarNomeDeTecido(partes);
        if (!nome) { setErro('Dê ao menos um tipo ao tecido: é o nome que liga insumo, cartela e busca.'); return; }
        const lista = faixas.map(f => ({ ...f, nome: f.nome.trim() })).filter(f => f.nome);
        if (lista.length < 1 || lista.length > MAX_FAIXAS) { setErro(`O tecido tem de ter de 1 a ${MAX_FAIXAS} faixas.`); return; }
        if (unidade === 'kg' && !(Number(rendimento.replace(',', '.')) > 0)) { setErro('Tecido em kg precisa do rendimento (metros por kg).'); return; }
        const cartela = limparCartela(cores);
        const semFaixa = cartela.filter(c => !lista.some(f => f.nome.toLowerCase() === c.faixa.toLowerCase()));
        if (semFaixa.length) { setErro(`${semFaixa.length} cor(es) numa faixa que não existe: mova antes de salvar.`); return; }
        setSalvando(true);
        try {
            await tabelaVerdadeRepository.salvarTipo({
                id: tipo?.id, linha_id: linhaId, nome, unidade,
                rendimento_m_por_kg: unidade === 'kg' ? Number(rendimento.replace(',', '.')) : (Number(rendimento.replace(',', '.')) || null),
                composicao: partes.composicao || null,
                faixas: lista.map((f, i) => ({ id: f.id, nome: f.nome, ordem: i + 1 })),
                cores: cartela.map(c => ({ nome: c.nome, hex: c.hex, faixa: c.faixa })),
            });
            onSalvou();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar o tecido.'); } finally { setSalvando(false); }
    };
```

Estado inicial: com `tipoId`, `tipo = catalogo.tipos.find(...)`, `faixas = catalogo.faixas.filter(tipo_id).sort(ordem)`, `cores = catalogo.cores.filter(faixa_id ∈ faixas)` mapeadas para `{ nome, hex, faixa: nomeDaFaixa }`, `partes = separarNomeDeTecido(tipo.nome)`, `unidade/rendimento` do tipo. Sem `tipoId`: uma faixa "Única"? — não: começa com **três faixas `Branco`, `Claras`, `Escuras`** editáveis (ponto de partida comum de tabela de malharia; a pessoa renomeia/tira). Antes de salvar, as cores sem faixa ficam com borda âmbar e o contador "x cor(es) sem faixa" aparece acima da cartela.

Tirar uma faixa na tela que já existe no banco: o banco recusa se a faixa já foi usada; a mensagem do banco aparece no `erro` (já diz o que fazer).

- [ ] **Step 2: Montar o editor na página**

Em `PaginaDoFornecedor.tsx`:

```tsx
            {editando && catalogo && (
                <EditorDeTecido linhaId={editando.linhaId} tipoId={editando.tipoId} catalogo={catalogo}
                    onClose={() => setEditando(null)} onSalvou={() => { setEditando(null); recarregar(); }} />
            )}
```

- [ ] **Step 3: Estoque agrupado**

`Inventory.tsx`:
- carregar o catálogo (`tabelaVerdadeRepository.catalogo()` + `getSuppliers` que a tela já tem) num `useEffect`, guardando `catalogo`;
- na lista de tecidos, agrupar por `fornecedor › linha › tipo` usando `insumo.faixa_id → faixa → tipo → linha → fornecedor` (insumos sem `faixa_id` continuam onde estão hoje, como aviamentos);
- em cada grupo de tipo, mostrar o saldo de cada faixa e o botão **Abrir na tabela** (`onAbrirFornecedor?.(linha.fornecedor_id)`);
- o botão "Novo tecido" do Estoque vira **Novo tecido no fornecedor…**: abre um seletor de fornecedor (`SearchableSelect` com a lista de fornecedores) e chama `onAbrirFornecedor(id)`;
- remover o import e o uso de `NovoTecidoModal` (linhas 25 e 649); se `grep -rn NovoTecidoModal src` não achar mais nada, apagar o arquivo.

- [ ] **Step 4: Verificar no navegador**

`npx tsc --noEmit`, suíte, `npx vite build`. Admin: na tabela, "Novo tecido em Brim" → nome "Brim Teste", kg, 3,2 m/kg, 4 faixas, colar `MARINHO ; Escuras` e `AREIA` → salvar → cartão aparece com 4 faixas e 2 cores. Abrir um orçamento → escolher "Brim Teste" → a cor MARINHO aparece e escolhe o insumo da faixa Escuras. Editar o tecido e tirar uma faixa sem uso → some; tirar uma faixa com saldo (ajustar contagem antes no Estoque) → mensagem "já foi usada". Estoque → tecidos agrupados por fornecedor › linha › tipo; "Abrir na tabela" leva à página do fornecedor. Usuário de fábrica: Estoque mostra os tecidos e o saldo, sem nenhum preço; a página do fornecedor (se acessível pelo menu dele) mostra a grade vazia de preço e nenhum valor.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/tabelaVerdade src/pages/masterdata/PaginaDoFornecedor.tsx src/pages/Inventory.tsx src/App.tsx src/components/inventory
git commit -m "feat(v3.1): editor do tecido com faixas livres e Estoque agrupado por fornecedor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Conferir com `git status` antes que `supabase/snippets/` não entrou.)

---

### Task 10: Aba Compras do fornecedor

**Files:**
- Create: `src/components/tabelaVerdade/ComprasDoFornecedor.tsx`
- Modify: `src/pages/masterdata/PaginaDoFornecedor.tsx` (trocar o `<p>` da aba compras)

**Interfaces:**
- Consumes: `tabelaVerdadeRepository.comprasDoFornecedor` (Task 5); `catalogo.faixas/tipos` para nomear o insumo.
- Produces: `<ComprasDoFornecedor fornecedorId catalogo />`.

- [ ] **Step 1: Componente**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { tabelaVerdadeRepository, type CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import type { Catalogo } from '@/utils/tabelaVerdade';
import { dinheiro, dataCurta } from '@/utils/numeros';

/** Compras lançadas com este fornecedor, da mais recente para a mais antiga (só leitura). */
export function ComprasDoFornecedor({ fornecedorId, catalogo }: { fornecedorId: string; catalogo: Catalogo }) {
    const [compras, setCompras] = useState<CompraDoInsumoTV[] | null>(null);
    const [erro, setErro] = useState('');
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.comprasDoFornecedor(fornecedorId).then(c => { if (vivo) setCompras(c); })
            .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler as compras.'); });
        return () => { vivo = false; };
    }, [fornecedorId]);
    const nome = useMemo(() => {
        const m = new Map<string, string>();
        for (const f of catalogo.faixas) m.set(f.insumo_id, `${catalogo.tipos.find(t => t.id === f.tipo_id)?.nome ?? ''} · ${f.nome}`);
        return m;
    }, [catalogo]);
    if (erro) return <p className="text-sm text-rose-400">{erro}</p>;
    if (!compras) return <p className="text-sm text-zinc-500">Carregando…</p>;
    if (compras.length === 0) return <p className="text-sm text-zinc-500">Nenhuma compra lançada com este fornecedor.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead><tr className="text-zinc-500"><th className="text-left p-2 font-bold">Data</th><th className="text-left p-2 font-bold">Item</th>
                    <th className="text-right p-2 font-bold">Qtd</th><th className="text-right p-2 font-bold">Preço</th><th className="text-right p-2 font-bold">Total</th></tr></thead>
                <tbody>{compras.map((c, i) => (
                    <tr key={`${c.compra_id}-${c.insumo_id}-${i}`} className="border-t border-zinc-800">
                        <td className="p-2 whitespace-nowrap">{dataCurta(c.data)}</td>
                        <td className="p-2">{nome.get(c.insumo_id) ?? 'aviamento / outro'}</td>
                        <td className="p-2 text-right">{c.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="p-2 text-right">{dinheiro(c.custo_unitario)}</td>
                        <td className="p-2 text-right">{dinheiro(c.quantidade * c.custo_unitario)}</td>
                    </tr>))}</tbody>
            </table>
        </div>
    );
}
```

(Mesma observação da Task 8 sobre os nomes reais em `numeros.ts`.)

- [ ] **Step 2: Ligar e verificar**

Trocar o `<p>` da aba compras por `{aba === 'compras' && catalogo && <ComprasDoFornecedor fornecedorId={fornecedor.id} catalogo={catalogo} />}`. `npx tsc --noEmit`; no navegador, a compra lançada na Task 8 aparece no topo.

- [ ] **Step 3: Commit**

```bash
git add src/components/tabelaVerdade/ComprasDoFornecedor.tsx src/pages/masterdata/PaginaDoFornecedor.tsx
git commit -m "feat(v3.1): aba Compras na página do fornecedor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificação final

- [ ] **Step 1: Suíte, tipos e build**

```bash
node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts" "src/utils/fabrica/*.test.ts"
npx tsc --noEmit
npx vite build
```

Expected: todos passam; sem erro de tipo; build ok.

- [ ] **Step 2: SQL do zero de novo**

Recarregar o dump (`scripts\v3_carregar_dump.ps1`), reaplicar as migrações da v3 e rodar `supabase/v3_1_tabela_verdade.sql` duas vezes. Expected: `problemas_*` = 0 nas duas; contagens iguais.

- [ ] **Step 3: Roteiro no navegador (admin e fábrica), 1440 / 1024 / 390 px**

Admin: página do fornecedor (3 abas), frete e condições do fornecedor e de uma linha com a opção desligada, editar preço na grade, reajuste futuro, novo tecido com 4 faixas, orçamento com o tecido novo (cor → faixa → custo da peça), lançar compra (valor sugerido = referência), lucro do pedido (origem "tabela de preços"). Fábrica: Estoque sem preço; nenhuma chamada a `tecido_precos` devolve linha. Console sem erro.

- [ ] **Step 4: Entregar ao Luiz**

Lista na ordem de rodar no banco novo: `supabase/v3_1_tabela_verdade.sql` (o que faz, o que assume: `compras_por_pedido.sql` aplicado; o que conferir na consulta de depois). Push só quando ele pedir.

# Tabela verdade de tecidos — desenho (v3.1)

- **Data:** 29/10/2026.
- **Branch:** `feat/v3.1-tabela-verdade` (a partir de `publicar-v3`).
- **Pedido do Luiz (29/10):** "quero mudar o estoque para uma 'tabela verdade' de valores e preços. Ao adicionar
  um tecido, pode ter até 6 níveis de preço diferente dependendo da marca. O tecido pode ter valor à vista ou a
  prazo ou em certa condição. O frete deve ser considerado, pode ser valor fixo ou por kg de malha. Podemos ter a
  página do fornecedor dessa tabela, tendo vários fornecedores e cada um sua própria tabela, exemplo a Cedro com a
  linha de brim, 3 tipos de brim e linha de tricoline etc., e cada um com suas faixas de cores e possíveis valores
  à vista ou a prazo. Esses custos podem entrar nas outras abas como informação para cálculos."
- **Respostas do Luiz (brainstorm de 29/10):**
  1. Os até 6 níveis são **faixas de cor**; cada marca define as suas (1 a 6) e cada cor da cartela cai numa delas.
  2. **Cada condição de pagamento tem seu próprio preço digitado** (não é % sobre o à vista).
  3. Frete tem quatro modos: **CIF** (por conta deles), **por kg** (centavos/kg), **fixo** por remessa e **por cotação**.
  4. A tabela é **o próprio cadastro do tecido** (caminho A: a tabela por cima do insumo).
  5. **Tabela para prever, pago para apurar.** Quando a média do comprado vier acima do previsto, avisar; mostrar,
     perto da tabela, um botão expansível com menor valor, média e maior valor de compra, com as datas.
  6. **Tecido agora, aviamento depois.**
  7. **Reajuste guarda histórico** (preço com "vale desde").
  8. **Frete e condições por linha**, com a opção de usar o do fornecedor quando for o mesmo ("pra não dar muito
     trabalho").
- Esboço da aba aprovado no chat (29/10).

## 1. Regras

- **Uma verdade por tecido.** O tecido nasce e muda pela tabela do fornecedor. O insumo de cada faixa é a
  peça interna que o estoque, a compra e a ficha técnica usam; ninguém o edita por fora.
- **Preço sempre tem data.** Reajuste é linha nova com `vale_desde`; a anterior fica. O preço "de hoje" é o de
  `vale_desde` mais recente até hoje; preço com data futura não vale antes da data.
- **Prever × apurar.** Orçamento, custo da peça e sugestão da compra usam o **custo de referência** da tabela. O
  lucro do pedido usa o **pago** na compra vinculada; sem ela, a tabela; depois última compra; depois custo médio.
- **Ausência é informação** (como `custoDaPeca`). Faixa sem preço, frete fixo sem remessa típica e frete a cotar
  são **pendências**; o custo vira piso declarado, nunca zero.
- **Dinheiro é da gestão.** Preço, condição, frete e compras reais só para `is_admin_or_manager()`. A fábrica vê
  linha, tipo, faixa, cor e saldo.
- **Nada no banco de produção.** O SQL é escrito e testado no banco local da v3; o Luiz roda.
- Visual pelo `estilo.ts`; números pelo `src/utils/numeros.ts`.

## 2. Banco — `supabase/v3_1_tabela_verdade.sql`

Consulta de antes e de depois, só leitura. Pode rodar mais de uma vez (`IF NOT EXISTS`, `ON CONFLICT`).

### Tabelas novas

| Tabela | Colunas principais |
|---|---|
| `tecido_linhas` | `id`, `fornecedor_id` → `suppliers` (not null), `nome`, `ordem`, `usa_frete_do_fornecedor` (bool, padrão true), `usa_condicoes_do_fornecedor` (bool, padrão true). Único: (fornecedor, nome). |
| `fornecedor_condicoes` | `id`, `fornecedor_id` (not null), `linha_id` (null = padrão do fornecedor; preenchido = da linha), `nome`, `ordem`, `padrao` (bool), `ativa` (bool). No máximo uma `padrao` por (fornecedor, linha). |
| `fornecedor_frete` | `id`, `fornecedor_id` (not null), `linha_id` (null = do fornecedor), `modo` (`cif`/`por_kg`/`fixo`/`cotacao`), `valor` (≥ 0, null em `cif` e `cotacao`), `remessa_tipica_kg` (só `fixo`, opcional). Único: (fornecedor, linha). |
| `tecido_tipos` | `id`, `linha_id` (not null), `nome`, `unidade` (`kg`/`m`), `rendimento_m_por_kg` (> 0, obrigatório se `kg`), `composicao`, `ordem`. Único: (linha, nome). |
| `tecido_faixas` | `id`, `tipo_id` (not null), `nome`, `ordem` (1–6), `insumo_id` → `insumos` (not null, único). No máximo 6 por tipo; nome único no tipo. |
| `tecido_precos` | `id`, `faixa_id`, `condicao_id`, `vale_desde` (date), `valor` (> 0), `origem` (`tabela`/`importado_da_compra`), `user_id`, `created_at`. Único: (faixa, condição, vale_desde). |

Linhas de preço não se apagam pela interface: o reajuste insere.

### Colunas novas em tabelas existentes

- `insumos.faixa_id` → `tecido_faixas` (null para aviamentos).
- `fabric_colors.faixa_id` → `tecido_faixas`.
- `fabric_colors`: sai a trava `fabric_colors_tier_valid` (`color_tier IN ('Branco','Padrão','Especial')`); a
  faixa passa a ser nome livre, coerente com `faixa_id`.
- `insumos.fabric_family` (= nome do tipo) e `insumos.color_tier` / `fabric_colors.color_tier` (= nome da faixa)
  **continuam**, mantidos pela função abaixo. São as chaves que o orçamento já usa para casar cor e insumo.

### Condições e frete efetivos

`usa_*_do_fornecedor = true` → valem as linhas com `linha_id IS NULL`; `false` → as da própria linha. Desligar
copia as do fornecedor para a linha (ponto de partida); religar não apaga as da linha, só deixa de usá-las.
Preço aponta para a condição; uma condição com preços não é apagada, só fica `ativa = false`.

### Escrita por função (RPC)

- `salvar_tecido_tipo(p jsonb)` — `SECURITY DEFINER`, checa `is_admin_or_manager()`, uma transação: cria ou
  atualiza o tipo, as faixas (cria o insumo de cada faixa nova; renomear a faixa atualiza `insumos.name`,
  `insumos.fabric_family`, `insumos.color_tier` e `fabric_colors.color_tier`), a cartela (`fabric_colors` com
  `faixa_id`) e os preços informados. Remover faixa com saldo, compra ou ficha é **recusado** com mensagem;
  sem nada disso, a faixa sai e o insumo é desativado (não apagado).
- `reajustar_precos(p jsonb)` — insere a grade nova com `vale_desde` informado. Recusa data anterior ao último
  reajuste da mesma faixa e condição (corrigir um valor é editar a linha daquela data, pela mesma RPC).
- Leitura direta pelas tabelas, com RLS.

### RLS

- `tecido_linhas`, `tecido_tipos`, `tecido_faixas`: leitura `authenticated`; escrita só pela RPC.
- `tecido_precos`, `fornecedor_condicoes`, `fornecedor_frete`: leitura e escrita só `is_admin_or_manager()`.
- Conferir que nenhuma política frouxa antiga dá escrita a `authenticated` (CLAUDE.md: políticas somam por OU).

### Migração dos tecidos de hoje

1. Cada `fabric_family` distinta vira um `tecido_tipos`, na linha **"Geral"** do fornecedor do insumo
   (`insumos.supplier_id`). Família sem fornecedor vai para o fornecedor **"Sem fornecedor"** (criado se não
   existir). Família com insumos de fornecedores diferentes: fica no fornecedor da faixa "Padrão" e a consulta de
   antes lista o caso.
2. `unidade` e `rendimento` vêm do insumo da faixa "Padrão" (`unit`, `rendimento`).
3. Cada insumo da família vira uma `tecido_faixas` com o mesmo `insumo_id` (ordem: Branco 1, Padrão 2,
   Especial 3). Estoque, compras e fichas não mudam.
4. `fabric_colors.faixa_id` é preenchido por (família, `color_tier`).
5. Cada fornecedor envolvido ganha a condição **"À vista"** como padrão e frete `cotacao` (pendência visível
   até o Luiz preencher).
6. Preço inicial de cada faixa = **último custo unitário pago** (`compra_itens`, depois `insumo_movements` IN),
   `vale_desde` = data dessa compra, `origem = 'importado_da_compra'`. Faixa sem compra fica sem preço.
7. Insumos de tecido fora de qualquer família (sem `fabric_family`) não migram; a consulta de antes os lista.

A consulta de depois confere: todo insumo com `fabric_family` tem `faixa_id`; toda faixa tem insumo; toda cor da
cartela com família tem `faixa_id`; nenhum tipo com mais de 6 faixas; saldos e quantidade de compras iguais aos
de antes.

## 3. Regra pura — `src/utils/tabelaVerdade.ts`

Sem import do app; testada com `node --test`.

- `precoVigente(precos, faixaId, condicaoId, data)` → `{ valor, valeDesde, origem } | null`.
- `condicoesEfetivas(linha, condicoes)` e `freteEfetivo(linha, fretes)` — aplicam o "usa o do fornecedor".
- `freteNaUnidade(frete, unidade, rendimento)` → `{ valor, pendencia? }`:
  `cif` 0; `por_kg` valor/kg, ou valor ÷ rendimento quando a unidade é metro; `fixo` valor ÷ remessa típica
  (convertida para metro se for o caso), sem remessa → pendência `frete fixo sem remessa típica`; `cotacao` →
  pendência `frete a cotar`.
- `custoDeReferencia(faixa, contexto, data)` → `{ valor, pendencias[] }` = preço vigente na condição padrão +
  frete. Sem preço → `valor` só do frete e pendência `faixa sem preço` (o consumidor trata como piso).
- `comparacaoComComprado(compras, precos, frete, data, dias = 90)` → `{ menor, media, maior, quantidade,
  acima: boolean, diferencaPct }`: cada compra é comparada com o previsto **na data dela**; média ponderada pela
  quantidade; `acima` quando a média passa do previsto em mais de **2%**. Sem compra no período → `null`.
- Constantes `LIMITE_ACIMA_PCT = 2`, `JANELA_DIAS = 90`, `MAX_FAIXAS = 6`.

### Quem consome

| Lugar | Hoje | v3.1 |
|---|---|---|
| Orçamento — custo da peça e margem (`custoDaPeca`, `CustoDaPecaBadge`) | custo médio | referência da tabela → custo médio |
| Cadastro de produto (`ProductForm`) | custo médio | igual ao orçamento |
| Lançar compra — valor sugerido (`custoSugerido`) | último preço pago | referência da tabela → último preço pago |
| Lucro do pedido (`lucroPorPedido`) | pago no pedido → última compra → custo médio | pago no pedido → **tabela** → última compra → custo médio |

`OrigemDoPreco` ganha `'tabela'`. A tabela entra nesses cálculos como um mapa `insumo_id → custo de referência`
montado num hook só (`useCustoDeReferencia`), para os quatro lugares darem a mesma resposta.

## 4. Telas

### Página do fornecedor (nova) — Cadastros › Fornecedores › fornecedor

Mesmo padrão da página do cliente (`PaginaDoCliente`).

- **Dados:** o `SupplierForm` de hoje + frete e condições padrão do fornecedor.
- **Tabela de preços** (como o esboço aprovado):
  - faixa de aviso no topo quando houver faixa comprando acima ("2 faixas comprando acima da tabela");
  - linhas como abas (+ linha); em cada linha, frete e condições com o seletor "usa o do fornecedor";
  - cada tipo é um cartão (aberto/fechado) com a grade **faixa × condição** editável, coluna da condição padrão
    destacada, coluna **Ref. c/ frete** e coluna **Compras** (`ok`, `+x%` em aviso, `sem compra`);
  - **Compras reais** expansível por faixa: menor, média (90 dias) e maior, com datas e o previsto;
  - **Reajustar:** data de vigência + grade nova; "ver reajustes" lista o histórico por data;
  - **Novo tecido** na linha abre o editor.
- **Compras:** compras lançadas com este fornecedor (leitura).

### Editor do tecido

O `NovoTecidoModal` atual passa a editar um `tecido_tipos`: nome, unidade, rendimento, composição, faixas (1 a 6,
nome e ordem) e cartela (cada cor numa faixa; colar lista continua). Salva por `salvar_tecido_tipo`. Cor sem faixa
aparece como pendência antes de salvar.

### Estoque

Tecidos agrupados fornecedor › linha › tipo, com saldo por faixa e o link **abrir na tabela**. "Novo tecido" leva
à tabela do fornecedor. Aviamentos como hoje.

### Orçamento

O seletor de tecido deixa de supor que a faixa representativa se chama "Padrão" (`BudgetEditor`, filtro e selo de
faixa): usa a faixa de menor ordem do tipo. O resto (cor → faixa → insumo) segue igual.

## 5. Testes

- `tabelaVerdade.test.ts`: cada modo de frete; kg↔m; vigência (data antes, igual, depois; reajuste futuro);
  condições e frete herdados × próprios; pendências; comparação com o comprado usando o previsto da data de cada
  compra; limite de 2% (abaixo, igual, acima); sem compra no período.
- `lucroPorPedido.test.ts`: a ordem das origens com a tabela entre o pago e a última compra.
- `custoDaPeca` / `lancarCompra`: a referência da tabela vence o custo médio / o último preço quando existe.
- `escritasDeRisco.test.ts`: as novas gravações listam campos, sem espalhar objeto.
- SQL: rodado no banco local da v3 (dump restaurado), consultas de antes e de depois, e de novo (idempotência).
- Suíte inteira, `tsc`, `vite build`; verificação no navegador com o usuário de teste (admin e fábrica).

## 6. Fora desta etapa

- Aviamentos na tabela (2ª etapa: mesma página, tipo com faixa única).
- Trocar a condição de pagamento no orçamento (simular à vista).
- Importar tabela do fornecedor de PDF ou planilha.

## 7. Ordem de entrega

1. SQL + migração no banco local, com as consultas de antes e de depois.
2. Regra pura `tabelaVerdade.ts` com testes.
3. Repositório e hook (`useCustoDeReferencia`).
4. Página do fornecedor com a tabela (leitura, depois edição e reajuste).
5. Editor do tecido sobre a RPC; Estoque agrupado.
6. Consumidores: orçamento, produto, lançar compra, lucro do pedido.
7. Aviso e Compras reais.

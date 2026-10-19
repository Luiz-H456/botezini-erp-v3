# Sugestões do lucro por pedido — plano (17/10/2026)

Continuação de `2026-10-17-lucro-por-pedido.md`. Três melhorias, nesta ordem, porque a 1 muda de onde vem o preço que
a 2 e a 3 usam.

## Achado que muda a ordem

No modelo de compras por pedido, **compra vinculada a pedido não passa pelo estoque**: não gera movimento de entrada e,
por isso, **não atualiza o custo médio do insumo**. Um tecido comprado só para pedidos fica com custo médio zero para
sempre, e o lucro desses pedidos sairia sempre como "até". Só o preço pago na compra resolve isso.

## Tarefa 1 — Preço real das compras no material do pedido

**Regra** (em `src/utils/financas/lucroPorPedido.ts`, com teste):
- Consumido continua sendo o da ficha (o que sobra volta ao estoque).
- **Preço do insumo no pedido**, nesta ordem:
  1. média ponderada do que foi **vinculado a este pedido**: itens de compra (`compra_itens.quantidade × custo_unitario`)
     mais usos do estoque (`insumo_movements` `uso_estoque`, `quantity × unit_cost`);
  2. **último preço pago** pelo insumo em qualquer compra (`compra_itens`, a mais recente);
  3. custo médio do insumo.
- **Produto sem ficha, com algo vinculado:** todo o vinculado conta como gasto (resposta 6 do desenho de compras); a falta
  "sem ficha" sai desse pedido. Sem nada vinculado, continua "sem ficha".
- A linha guarda **de onde veio o preço** (`compra do pedido` · `última compra` · `custo médio`), e a tela mostra isso
  no título da célula de material.

**Repositório** (`src/repositories/comprasRepository.ts`, só gestão, lido à risca e paginado como `vinculadoPorPedido`):
- `custoVinculadoPorPedido(ids)` → por pedido, por insumo: `{ quantidade, valor }`.
- `ultimoPrecoPorInsumo()` → por insumo: o `custo_unitario` da compra mais recente (`compras.data`, desempate pelo `id`).

**Testes:** preço do pedido vence o último preço, que vence o custo médio; vínculo parcial (vinculado menor que a ficha:
o resto vai pelo próximo preço da fila); sem ficha com vínculo vira gasto integral; sem ficha e sem vínculo continua
falta; uso do estoque entra na média do pedido; pedido legado sem vínculo continua no custo médio.

## Tarefa 2 — Imposto sobre a venda no lucro do pedido

- **Alíquota** do perfil da empresa (`company_profile.default_tax_rate`, a mesma do custo da peça no orçamento).
- **imposto do pedido = valor × alíquota**; lucro = valor − material − mão de obra − imposto.
- Nova coluna **Imposto** e o total no resumo. Sem alíquota cadastrada: imposto zero, com aviso "Defina a alíquota em
  Cadastros › Empresa" (o lucro sai sem imposto, e a tela diz isso).
- **Por que alíquota, e não o imposto pago no mês:** o pago (categoria Impostos e guias) é do mês da guia, não do
  pedido. O Resultado continua mostrando o pago; aqui a pergunta é quanto cada pedido deixou.
- **Testes:** alíquota aplicada sobre o valor; alíquota ausente vira zero com o aviso; margem já líquida do imposto.

## Tarefa 3 — Início: "Definir preço" dos tecidos usados em pedidos

- **Regra pura** em `src/utils/completudeDoCadastro.ts`: `tecidosSemPrecoUsados(e)` → tecidos usados nos pedidos ativos
  ou entregues nos últimos 90 dias (pela ficha ou pelo tecido escolhido no item) que não têm **nenhum** preço pela fila
  da Tarefa 1 (sem compra e sem custo médio). Mesmo raciocínio de `produtosSemFichaQueVenderam`: só o que importa agora.
- **Fila do Início** (`src/utils/inicio/fila.ts`): item em Cadastros, `Definir preço: N tecidos usados em pedidos`, não
  urgente, levando ao Estoque.
- **Onde definir o preço:** os tecidos homologados já têm o preço por faixa em Estoque › Editar tecido. Para os demais:
  ação **"Definir preço"** no ⋯ da linha do Estoque, só quando o saldo é zero (com saldo, o caminho é Ajustar contagem,
  que já pede o custo). A gravação muda **só** `average_unit_cost` (lista o campo, não espalha o objeto — regra de
  `escritasDeRisco.test.ts`).
- **Testes:** tecido com compra não entra; tecido só com custo médio não entra; tecido de pedido legado entregue há mais
  de 90 dias não entra; o tecido escolhido no item conta mesmo fora da ficha.

## Conferência (vale para as três)

Suíte inteira, `tsc`, build. Navegador na v3 local em 1440 e 375 px: Lucratividade (coluna Imposto, origem do preço) e
Início (o item novo leva ao Estoque). Nada de SQL: tudo lê o que já existe.

## Fora do plano

Rateio da folha por tempo de costura (não há tempo por produto cadastrado) e demais custos fixos no lucro do pedido
(o Resultado já cobre o mês inteiro).

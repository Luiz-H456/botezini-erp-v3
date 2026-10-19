# Compras por pedido — desenho (S7)

- **Data:** 14/10/2026.
- **Branch:** `v3`.
- **Pedido do Luiz (14/10):** "quero tirar o estoque automático, quero lançar as compras semanalmente e
  vincular elas a cada pedido, o que sobrar vai automaticamente para o estoque. Isso de ter o estoque e baixa
  automática etc, não deve ocorrer."
- **Respostas do Luiz (14/10):**
  1. A sobra é **comprado − ficha técnica**, calculada sozinha na entrega.
  2. A sobra em estoque **pode** ser usada num pedido futuro, sempre **à mão** ("usar do estoque").
  3. Lançar a compra **não** cria conta a pagar: o Dinheiro continua separado, como hoje.
  4. A Lista de compras vira **"o que falta comprar"**; a trava de falta de material **sai**.
  5. Uma linha de compra pode ser **dividida** entre pedidos, e o que não for para pedido nenhum vai ao estoque.
  6. Produto **sem ficha técnica**: o material do pedido conta como **todo gasto** (nada volta).
  7. Caminho A: tabelas próprias de compra.

## 1. Regras

- **O estoque nunca mexe sozinho por produção.** Mover o cartão no Quadro não toca no estoque.
- **O saldo de um insumo muda em cinco casos, e só neles:**
  1. compra (ou parte dela) sem pedido → entra;
  2. sobra apurada na entrega → entra;
  3. "usar do estoque" num pedido → sai (decisão de alguém);
  4. pedido excluído antes da entrega → o que estava vinculado a ele volta;
  5. ajuste de contagem na tela Estoque → entra ou sai a diferença.
- **A sobra é apurada uma vez por pedido.** Pedido que volta e é entregue de novo não gera segunda sobra.
- **Compra tem dinheiro:** só gestão vê (admin/manager). A fábrica não vê compras nem custo.
- **Nada no banco de produção.** O SQL é escrito e testado aqui; o Luiz roda. O
  `baixa_automatica_de_producao.sql` não vai para a produção (o plano de 14/10 já o suspendeu).
- Visual e ícones pelo `estilo.ts` e pela regra de 10/10; números pelo `src/utils/numeros.ts` (regra do 1.000).

## 2. Banco — `supabase/compras_por_pedido.sql`

Consulta de antes e de depois, só leitura. Pode rodar mais de uma vez.

### Tabelas

- **`compras`**: `id`, `fornecedor_id` (→ `suppliers`, opcional), `fornecedor_nome` (texto livre quando não há
  cadastro), `data` (date, padrão hoje em São Paulo), `notas`, `user_id`, `created_at`. A "semana" sai da data;
  não há coluna.
- **`compra_itens`**: `id`, `compra_id` (→ `compras`, cascade), `insumo_id` (→ `insumos`), `quantidade` (> 0),
  `custo_unitario` (> 0), `pedido_id` (→ `orders`, **vazio = foi para o estoque**). Dividir uma linha entre
  pedidos é gravar um item por destino; a tela agrupa.
- **`pedido_sobra_apurada`**: `order_id` (PK → `orders`, cascade), `created_at`, `user_id`. É a trava de
  "já apurou": o índice único decide, como na trava da baixa.
- **`insumo_movements`** ganha `source` (`compra`, `sobra`, `uso_estoque`, `devolucao`, `ajuste`, e `manual`
  para os antigos) e `compra_item_id` (opcional). `reference_id` continua sendo o pedido quando houver.

### Funções (todas numa transação; `SECURITY DEFINER`; checam admin/manager)

- **`lancar_compra(p_compra jsonb, p_itens jsonb)`**: grava a compra e os itens. Para cada item **sem pedido**,
  gera a entrada no estoque (`source='compra'`, custo do item, recalcula o custo médio pelo gatilho que já
  existe). Item com pedido **não** mexe no estoque.
- **`excluir_compra(p_compra_id)`**: só se nenhum dos pedidos dela já teve a sobra apurada e se o estoque ainda
  tem o que ela pôs lá; desfaz as entradas e apaga. Senão, recusa dizendo por quê.
- **`usar_do_estoque(p_order_id, p_insumo_id, p_quantidade)`**: saída `source='uso_estoque'`, `reference_id` =
  pedido. Recusa se o saldo não cobre (aqui a recusa é certa: é uma decisão, não a fábrica andando).
- **`apurar_sobras_do_pedido(p_order_id, p_sobras jsonb)`**: grava a trava; se já existia, devolve
  `ja_feita=true` e não faz nada. Para cada `{insumo_id, quantidade, custo_unitario}` com quantidade > 0, gera a
  entrada `source='sobra'`. **A conta é feita no app** (util pura, testada) e chega pronta, como era na baixa.
- **Gatilho `BEFORE DELETE` em `orders`**: se o pedido não teve a sobra apurada, devolve ao estoque tudo o que
  estava vinculado a ele — itens de compra (pelo custo do item) e usos do estoque (pelo custo da saída) —
  como `source='devolucao'`, e solta o vínculo dos itens (`pedido_id` vazio). Vale para qualquer caminho de
  exclusão.

### Acesso

RLS nas três tabelas novas: leitura e escrita direta só para admin/manager; as funções acima são o caminho de
escrita. A fábrica não lê `compras` nem `compra_itens`.

## 3. Contas puras — `src/utils/fabrica/compras.ts` (com testes)

- **`previstoDoPedido(pedido, fichas)`** → por insumo, o que a ficha prevê para as peças do pedido. Reaproveita
  a conta que já existe em `src/utils/baixaDeProducao.ts` (`planejarBaixa`), sem a parte de estoque. Devolve
  também se algum produto do pedido não tem ficha.
- **`sugerirDivisao(insumoId, quantidade, pedidosDaSemana, previstos, jaVinculado)`** → divide a quantidade
  entre os pedidos pela falta de cada um (previsto − já vinculado), na ordem de entrega; o resto vai ao estoque.
- **`calcularSobras(vinculado, previsto, temProdutoSemFicha)`** → por insumo,
  `vinculado − previsto` quando positivo; vinculado = itens de compra do pedido + usos do estoque. Custo da
  sobra = custo médio do que foi vinculado àquele insumo no pedido. **Com produto sem ficha, devolve vazio**
  (resposta 6). Insumo vinculado que nenhuma ficha do pedido usa: sobra inteira.
- **`faltaComprar(pedidos, previstos, vinculados)`** → a nova Lista de compras: por insumo, previsto − vinculado,
  só o que falta, com os pedidos que pedem cada um.

Bordas com teste: pedido sem itens; quantidade zero; ficha com quantidade zero; insumo apagado; centavos e
casas de quantidade (3 casas); sobra negativa (gastou mais que o previsto) vira zero, nunca saída.

## 4. Telas

### Planejar a semana › Lista de compras (vira "o que falta comprar")

- A lista passa a ser `faltaComprar` para o filtro de semana que já existe (Em aberto / Esta semana / Próxima).
- Por linha: insumo, quanto falta, para quais pedidos, e **"em estoque: X"** quando houver sobra guardada.
  Com estoque, a linha oferece **"Usar do estoque"** (escolhe o pedido e a quantidade, já sugeridos).
- Botão principal **"Lançar compra"** abre a janela da compra. O PDF da lista continua.
- Abaixo, **"Compras desta semana"**: as compras lançadas, com os itens agrupados e o destino de cada parte
  (pedido ou estoque). No ⋯ de cada uma: "Excluir compra" (com confirmação e a recusa explicada).
- Sai: "Receber compra" (`ReceberCompraModal`) e o aviso de falta de estoque.

### Janela "Lançar compra"

- Cabeçalho: fornecedor (seletor dos cadastrados ou texto livre), data (hoje), notas.
- Itens: insumo, quantidade, custo unitário. Ao escolher o insumo, a tela mostra a **divisão sugerida** entre os
  pedidos (e o resto para o estoque); cada parte é editável e a soma tem de fechar com a quantidade.
- Rodapé fixo: total da compra e "Lançar". Números com a regra do 1.000; custo com vírgula.
- Pode partir da Lista: "Lançar compra" com o que falta já preenchido (quantidade = o que falta).

### Quadro (Como está a produção)

- Sai a baixa ao sair do 1º setor (`baixarEstoque`) e a trava de falta (`getShortages` + `StockShortageModal`).
- **Fica** o previsto do corte para o Rendimento do corte, gravado como hoje ao sair do 1º setor, a partir de
  `previstoDoPedido` (não depende mais do estoque).
- **Na entrega** (`confirmDelivery`), depois de marcar Entregue: `apurar_sobras_do_pedido` com
  `calcularSobras`. Falhar aqui não desfaz a entrega: o aviso diz "Entregue, mas a sobra não foi para o
  estoque: …" e oferece tentar de novo (a função é idempotente).
- O aviso da entrega diz o que voltou: "Sobrou para o estoque: Malha PV — Especial 1,4 kg" (ou nada).

### Estoque

- Saem os botões "Entrada" e "Saída" por linha. Entram, por linha: **"Ajustar contagem"** (informa o saldo real;
  o sistema lança a diferença como `ajuste`) e, no ⋯, **"Usar num pedido"** (a mesma `usar_do_estoque`).
- O histórico do insumo passa a mostrar a origem de cada movimento (compra, sobra, uso, devolução, ajuste).

### Como está a produção

- Sai a aba **"Consumo não apurado"** (`ConsumoNaoApuradoPanel`, `'nao-apurado'` em `PcpTab`).

## 5. O que sai do código

- `usePcpKanban.baixarEstoque`, `productionRepository.baixarEstoqueDaProducao`, `getConsumoNaoApurado`,
  `resolverConsumoNaoApurado`, `getShortages`, `nomesDosInsumos` (se nada mais usar).
- `ConsumoNaoApuradoPanel.tsx`, `ReceberCompraModal.tsx`, `StockShortageModal.tsx` (se nada mais usar),
  `src/utils/fabrica/recebimento.ts` (se nada mais usar), as partes de estoque de `baixaDeProducao.ts`.
- Antes de cada remoção, `grep` confirma que nada mais usa.
- Os dados locais da baixa (tabelas `producao_baixas`, `consumo_nao_apurado`) ficam no banco local, sem uso.

## 6. Conferência

- Suíte, `tsc` e build limpos.
- SQL: testado num contêiner descartável com o dump de produção mais recente, rodando duas vezes; casos:
  compra só para estoque; compra dividida entre dois pedidos e estoque; sobra na entrega (com e sem produto sem
  ficha); segunda entrega sem segunda sobra; usar do estoque com e sem saldo; excluir pedido antes da entrega
  (devolve); excluir compra (pode e não pode).
- Navegador no banco local, com dados ENSAIO: um pedido ENSAIO novo, uma compra dividida entre ele e o estoque,
  a entrega e a sobra entrando; Quadro e modo fábrica sem nenhum valor; 1440 e 390.
- O plano da ida à produção (`docs/superpowers/plans/2026-10-14-ida-para-producao.md`) troca o arquivo 4 pelo
  `compras_por_pedido.sql`.

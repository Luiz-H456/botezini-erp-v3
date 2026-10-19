# Auditoria de Regras de Negocio ERP - Parte 3

Producao, estoque, ficha tecnica, consumo de insumos, pedidos em producao, cadastros rapidos e tabelas paralelas.

Data da leitura: 02/06/2026

## 1. Estrutura real usada nesta parte

Antes de analisar producao e estoque, estes foram os arquivos reais encontrados e usados como base.

```text
src/pages/Production.tsx
src/hooks/useProduction.ts
src/repositories/productionRepository.ts
src/pages/Inventory.tsx
src/pages/masterdata/InventoryTab.tsx
src/hooks/useInventoryQueries.ts
src/repositories/inventoryRepository.ts
src/components/modals/StockShortageModal.tsx
src/components/modals/DeliveryConfirmModal.tsx
src/components/modals/InsumoMovementModal.tsx
src/components/modals/QuickCreateModal.tsx
src/components/masterdata/ProductForm.tsx
src/components/masterdata/ProductInsumosForm.tsx
src/pages/MasterData.tsx
src/hooks/useMasterDataActions.ts
src/types/index.ts
src/utils/finance.ts
supabase/schema_live.sqlnpx
supabase/patch_insumo_movements.sql
supabase/patch_inventory_lookup.sql
```

Observacao: a producao e o estoque usam tabelas ativas `orders`, `products`, `insumos`, `insumo_movements` e `product_insumos`. O schema tambem contem um bloco `wms_*`, mas nao foi encontrada integracao visivel dele com pedidos/producao no codigo TypeScript lido.

## 2. Modelo funcional encontrado

### 2.1 Producao

A producao e um kanban de pedidos.

Estagios em `src/types/index.ts:10-16`:

```text
Aguardando Material
Corte
Personalização
Costura
Finalização
Transporte
```

Pedido ativo:

- Fica em `orders`.
- Tem `production_stage` no nivel do pedido.
- Tambem tem `production_stage` em cada item de `order.items`.
- E considerado ativo enquanto `status` nao e `Entregue` nem `Concluído`.

Pedido concluido:

- Sai das colunas ativas.
- Entra na coluna de concluidos/entregues.
- Pode disparar garantia de recebivel financeiro.

### 2.2 Estoque

O estoque ativo e de insumos/materias-primas.

Tabelas ativas:

- `insumos`: cadastro e saldo atual.
- `insumo_movements`: entradas e saidas.
- `product_insumos`: ficha tecnica/BOM do produto.

Campos criticos:

- `insumos.current_stock`
- `insumos.min_stock`
- `insumos.average_unit_cost`
- `insumos.rendimento`
- `insumo_movements.type`: `IN` ou `OUT`
- `insumo_movements.quantity`
- `insumo_movements.unit_cost`
- `insumo_movements.total_cost`
- `product_insumos.product_id`
- `product_insumos.insumo_id`
- `product_insumos.quantity`

## 3. Fluxo de producao ponta a ponta

### 3.1 Carregar pedidos da producao

Implementacao:

- `src/hooks/useProduction.ts:21` chama `productionRepository.getEnrichedOrders()`.
- `src/repositories/productionRepository.ts:10` busca `orders` e `clients`.
- `src/repositories/productionRepository.ts:19-48` hidrata `product_name` nos itens buscando `products`.
- `src/repositories/productionRepository.ts:55-61` adiciona `clientName` e stage default.

Regras observadas:

- Se o pedido nao tem `production_stage`, entra em `Aguardando Material`.
- Se o item do pedido nao tem `product_name`, o repository tenta buscar pelo `product_id`.
- Cliente ausente vira texto `Cliente Desconhecido`.

Riscos:

- `items` e um JSON dentro de `orders`; alteracoes de stage por item e por pedido dependem de update do JSON inteiro.
- Se um produto for apagado ou ficar sem nome, a producao ainda tenta operar usando cache/id.

### 3.2 Montar colunas do kanban

Implementacao:

- `src/hooks/useProduction.ts:47-75`.
- Renderizacao em `src/pages/Production.tsx:476-600`.

Regras observadas:

- As colunas sao montadas por `production_stage`.
- Pedidos sao ordenados por prazo (`deadline`) ascendente ou descendente.
- Drag and drop chama `handleMoveStage`.
- Botao do card chama `handleAdvanceStage`.

Efeitos:

- Mover ou avancar atualiza `orders.production_stage`.
- Todos os itens do pedido recebem o mesmo `production_stage`.
- O update e otimista no front.

### 3.3 Avancar de Aguardando Material para a producao

Implementacao:

- `src/hooks/useProduction.ts:117-151` para drag.
- `src/hooks/useProduction.ts:159-186` para botao.
- `src/repositories/productionRepository.ts:124-191` para verificacao de estoque.

Dados usados:

- `order.items[].product_id`
- `order.items[].quantity`
- `product_insumos` do produto.
- `insumos.current_stock`
- `insumos.average_unit_cost`

Regra observada:

1. O app coleta os produtos do pedido.
2. Busca `product_insumos` de todos esses produtos.
3. Para cada item do pedido, exige que exista ficha tecnica.
4. Busca os insumos envolvidos.
5. Calcula necessidade: `product_insumos.quantity * orderItem.quantity`.
6. Agrupa necessidade por insumo.
7. Compara com `insumos.current_stock`.
8. Se faltar, mostra modal de ruptura.

Achado positivo:

- Produto sem ficha tecnica e bloqueado com erro em `productionRepository.ts:143-146`.
- Isso fecha o bug antigo em que produto sem BOM podia passar sem consumo aparente.

Ponto critico:

- O app verifica estoque, mas nao baixa estoque automaticamente ao avancar.
- Nao foi encontrado `saveInsumoMovement` ou insert em `insumo_movements` dentro de `useProduction.ts` ou `productionRepository.ts` durante o avanco.

Conclusao:

- A producao hoje usa estoque como controle de disponibilidade, nao como consumo automatico.

### 3.4 Ruptura de estoque

Implementacao:

- `src/components/modals/StockShortageModal.tsx`.
- Aberto quando `stockShortages.length > 0` e existe `pendingAdvanceOrder`.
- `src/hooks/useProduction.ts:193-197` executa `onForceAdvance`.

Regra observada:

- Modal mostra insumo, disponivel, requisitado, deficit e custo estimado.
- Botao "Comprar Antes" fecha.
- Botao "Ignorar Alerta" chama `onForceAdvance`.

Risco alto de regra de negocio:

- O usuario pode ignorar alerta e avancar mesmo sem estoque.
- Como o avanco nao gera saida em `insumo_movements`, ignorar alerta nao deixa rastreio de consumo negativo nem pendencia formal de compra.

Pergunta de negocio:

- Quem pode ignorar ruptura: admin, manager, factory, todos?
- Ignorar ruptura deve gerar pendencia de compra, ordem de compra, ou log de excecao?

### 3.5 Avancar entre etapas internas

Implementacao:

- `src/hooks/useProduction.ts:78-101` define o proximo stage.

Sequencia:

```text
Aguardando Material -> Corte
Corte -> Personalização
Personalização -> Costura
Costura -> Finalização
Finalização -> Transporte
Transporte -> Entregue
```

Efeitos:

- Enquanto ha proximo stage, `status` vira `Em Produção`.
- Ao sair de `Transporte`, `status` vira `Entregue`.

Risco:

- Nao ha controle de datas por etapa, responsavel, motivo de atraso, retrabalho, parada, capacidade real por setor ou historico de transicoes.
- O stage atual e substituido, nao registrado como timeline auditavel.

### 3.6 Confirmar entrega

Implementacao:

- `src/hooks/useProduction.ts:162-164` abre confirmacao quando stage e `Transporte`.
- `src/hooks/useProduction.ts:188-194` confirma entrega.
- `src/repositories/productionRepository.ts:64-75` salva stage/status.
- `src/repositories/productionRepository.ts:77-116` garante recebivel financeiro.

Efeitos:

- Pedido sai da lista ativa.
- Pedido entra em concluidos.
- Se status final for `Entregue` ou `Concluído`, tenta garantir recebivel em `financial_obligations`.

Risco:

- A entrega dispara financeiro, mas nao foi encontrado consumo automatico de estoque.
- Um pedido pode ficar entregue com estoque intacto se ninguem registrar saida manual.

## 4. Fluxo de estoque

### 4.1 Criar/editar insumo

Implementacao:

- Tela dedicada `src/pages/Inventory.tsx`.
- Aba em cadastros `src/pages/masterdata/InventoryTab.tsx`.
- Repository em `src/repositories/inventoryRepository.ts:71-88`.

Campos usados:

- nome.
- unidade.
- categoria.
- categoria global.
- estoque atual.
- estoque minimo.
- custo medio.
- rendimento.
- fornecedor.
- observacoes.

Validacao no front:

- Nome obrigatorio em `InventoryTab.tsx:103-106`.

Risco:

- `saveInsumo` permite upsert direto de `current_stock` e `average_unit_cost`.
- Como tambem existe trigger para movimentos, editar saldo/custo diretamente pode quebrar trilha de estoque se usado depois de movimentacoes.
- Pergunta: saldo/custo devem ser editaveis diretamente ou apenas via ajuste/movimento?

### 4.2 Entrada de estoque

Implementacao:

- Modal `src/components/modals/InsumoMovementModal.tsx`.
- Hook `useInventoryMutations`.
- Repository `inventoryRepository.saveInsumoMovement`.
- Trigger SQL `update_insumo_stock_and_cost`.

Regra no front:

- Tipo `IN`.
- Quantidade obrigatoria e positiva.
- Custo unitario obrigatorio e positivo para entrada.
- `total_cost = quantity * unit_cost`.

Regra no banco:

- `supabase/schema_live.sqlnpx:674-728` valida quantidade positiva.
- Para `IN`, exige `unit_cost > 0`.
- Soma ao estoque.
- Recalcula custo medio ponderado.
- Atualiza `insumos.current_stock` e `insumos.average_unit_cost`.

Achado positivo:

- O calculo sensivel de custo medio esta no banco, via trigger, nao so no front.

### 4.3 Saida de estoque

Implementacao:

- Mesmo modal `InsumoMovementModal.tsx`, tipo `OUT`.
- Repository insere movimento em `insumo_movements`.
- Trigger atualiza saldo.

Regra no banco:

- Para `OUT`, se `current_stock < quantity`, levanta erro `Insufficient stock`.
- Subtrai estoque.
- Mantem custo medio.
- Define `unit_cost` e `total_cost` da saida usando custo medio atual.

Achado positivo:

- O banco impede estoque negativo para saida manual.
- A tabela `insumos` tem check `current_stock >= 0` no schema versionado.

Risco:

- Saida manual nao exige `reference_id`.
- Sem referencia obrigatoria a pedido/ordem de producao, consumo real pode ficar separado do pedido que originou a saida.

### 4.4 Valor total de estoque e estoque critico

Implementacao:

- `src/pages/Inventory.tsx:161-162`.
- `src/pages/masterdata/InventoryTab.tsx:145-146`.

Regra:

- Valor total = soma `current_stock * average_unit_cost`.
- Estoque critico = `current_stock <= min_stock` quando `min_stock > 0`.

Risco:

- Se saldos/custos forem alterados diretamente no cadastro, os KPIs refletem alteracao manual sem trilha.

## 5. Ficha tecnica do produto

### 5.1 Cadastro completo de produto

Implementacao:

- `src/components/masterdata/ProductForm.tsx`.
- `src/components/masterdata/ProductInsumosForm.tsx`.
- `src/pages/MasterData.tsx`.
- `src/hooks/useMasterDataActions.ts`.

Dados do produto:

- nome.
- SKU.
- categoria textual/global.
- precos.
- custo medio estimado (`average_unit_cost`).
- consumo de tecido (`fabric_consumption_m`).
- insumo de tecido padrao (`default_fabric_insumo_id`).
- mao de obra por hora.
- quantidade de trabalhadores.
- capacidade diaria em pecas.
- overhead.
- observacoes.

Regra observada:

- `ProductForm` tem calculadora de custo de producao.
- A calculadora usa insumo de tecido, rendimento, consumo em metros, overhead, mao de obra, impostos e markup.
- Ao aplicar calculadora, atualiza `average_unit_cost`, preco sugerido e campos de producao.
- Se produto ja existe, `MasterData.tsx:112-125` salva o tecido da calculadora em `product_insumos`.
- Ao salvar produto com `default_fabric_insumo_id`, `useMasterDataActions.ts:71-77` tambem salva `product_insumos`.

Risco:

- O custo do produto (`products.average_unit_cost`) e uma estimativa/calculadora, enquanto o custo de consumo real vem de `insumos.average_unit_cost`.
- Se a ficha tecnica for alterada depois, nao foi encontrada recomposicao automatica do custo do produto.

### 5.2 ProductInsumosForm

Implementacao:

- `src/components/masterdata/ProductInsumosForm.tsx`.

Regra:

- Mostra insumos vinculados ao produto.
- Calcula custo total da ficha tecnica com `stockItem.average_unit_cost * mat.quantity`.
- Permite adicionar insumo com quantidade.
- Permite excluir insumo.
- Se produto ainda nao foi salvo, mostra aviso: apos salvar, podera adicionar insumos.

Risco:

- Nao foi encontrada constraint de unicidade `product_id + insumo_id`.
- Se o mesmo insumo for adicionado duas vezes, o app pode somar duas linhas ou depender de comportamento de upsert sem `onConflict`.
- Pergunta: a ficha tecnica deve permitir linhas duplicadas do mesmo insumo?

### 5.3 Produto criado rapidamente

Implementacao:

- `src/components/modals/QuickCreateModal.tsx:88-99`.

Regra:

- Cria produto com nome, preco base, categoria e categoria global.
- Nao cria `product_insumos`.
- Nao exige ficha tecnica.

Impacto:

- Produto rapido pode ser usado em orcamento/pedido sem ficha tecnica.
- Ao entrar na producao, `productionRepository.getShortages()` deve bloquear ao tentar sair de `Aguardando Material`.

Risco:

- O bloqueio so acontece quando a producao tenta avancar.
- Ate la, orcamento, pedido e financeiro podem existir para produto incompleto.

Pergunta:

- Produto sem ficha tecnica deve poder ser vendido/orcado, ou deve aparecer com alerta desde o orcamento?

## 6. Relacao entre orcamento, pedido, producao e estoque

### 6.1 Dados do orcamento que chegam ao pedido

Em `src/types/index.ts`, `BudgetItem` possui:

- `product_id`
- `product_name`
- `model`
- `fabric_insumo_id`
- `fabric_name`
- `fabric`
- `color`
- `size`
- `quantity`
- `unit_price`
- `total`
- especificacoes de manga, genero, caimento, observacoes de producao.

`OrderItem` carrega parte desses dados para producao:

- produto.
- modelo.
- quantidade.
- tamanho.
- tecido.
- cor.
- especificacoes.
- `production_stage`.

### 6.2 Producao usa a ficha tecnica do cadastro, nao o tecido escolhido no orcamento

Fato:

- `productionRepository.getShortages()` busca `product_insumos` por `product_id`.
- Nao foi encontrado uso de `order.items[].fabric_insumo_id` na verificacao de estoque.

Impacto:

- Se o orcamento escolhe um tecido especifico diferente da ficha tecnica padrao do produto, a producao pode verificar estoque do insumo cadastrado na BOM, nao necessariamente do tecido escolhido no pedido.

Pergunta critica:

- O tecido escolhido no orcamento deve substituir/adicionar o insumo da ficha tecnica no consumo?

## 7. WMS paralelo no schema

Tabelas encontradas em `supabase/schema_live.sqlnpx`:

- `wms_categories`
- `wms_item_variations`
- `wms_items`
- `wms_stock_items`
- `wms_stock_movements`

Fato:

- O TypeScript lido usa `insumos`, `insumo_movements` e `product_insumos`.
- Nao foi encontrada integracao de `wms_*` com `Production.tsx`, `Inventory.tsx`, `ProductInsumosForm.tsx` ou repositories ativos.

Risco:

- Dois modelos de estoque no mesmo banco podem confundir manutencao e futuras queries.
- Policies e grants existem para `wms_*`, entao essas tabelas podem ser acessiveis por usuarios autenticados/admin-manager mesmo sem uso operacional.

Pergunta:

- O WMS sera usado futuramente ou deve ser considerado legado/desativado?

## 8. Seguranca e permissoes

Fato:

- `factory` tem acesso visual direcionado para producao via `src/App.tsx`.
- No banco, schema mostra policies de select para factory em `insumos`, `product_insumos`, `products`, `orders` e update em `orders`.
- Admin/manager tem acesso amplo single-tenant.

Risco:

- Como factory pode atualizar `orders`, precisa confirmar se pode avancar/entregar pedido e, por consequencia, disparar garantia de recebivel financeiro pela camada de repository.
- Pelo front, factory fica restrito a producao, mas regra sensivel deve ser confirmada tambem no banco/RPC.

## 9. Bugs/riscos confirmados nesta parte

### Alto: producao nao consome estoque automaticamente

- Evidencia: `useProduction.ts` e `productionRepository.ts` verificam estoque, mas nao inserem `insumo_movements`.
- Impacto: estoque pode continuar cheio mesmo com pedidos entregues.
- Tipo: dado inconsistente/regra de negocio.
- Precisa confirmar: sim. Talvez a regra atual seja consumo manual.

### Alto: botao "Ignorar Alerta" permite avancar com ruptura

- Evidencia: `StockShortageModal.tsx` chama `onForceAdvance`; `useProduction.ts:193-197` executa avanco.
- Impacto: producao pode seguir sem estoque e sem pendencia formal.
- Tipo: regra de negocio/autorizacao.
- Precisa confirmar: sim.

### Alto: tecido do orcamento pode nao afetar consumo

- Evidencia: `getShortages()` usa `product_insumos` por produto e nao `fabric_insumo_id` do item do pedido.
- Impacto: consumo/verificacao pode usar insumo padrao errado.
- Tipo: regra de negocio/estoque.
- Precisa confirmar: sim.

### Medio: saldo e custo do insumo podem ser alterados direto no cadastro

- Evidencia: `saveInsumo` faz upsert do payload; telas editam `min_stock` e exibem `current_stock`/`average_unit_cost`.
- Impacto: trilha de estoque pode ser quebrada se saldo/custo forem editaveis depois de movimentos.
- Tipo: integridade/auditoria.
- Precisa confirmar: sim.

### Medio: ficha tecnica pode ter duplicidade de insumo

- Evidencia: `product_insumos` nao mostrou unique constraint no schema lido; repository faz upsert sem `onConflict` composto.
- Impacto: consumo duplicado ou custo duplicado.
- Tipo: dados inconsistentes.
- Precisa confirmar: sim.

### Medio: WMS paralelo sem integracao

- Evidencia: schema tem `wms_*`; TypeScript ativo usa `insumos`.
- Impacto: manutencao, seguranca e relatorios podem consultar tabela errada.
- Tipo: arquitetura/manutencao.
- Precisa confirmar: sim.

### Baixo/medio: ocupacao da producao usa capacidade fixa

- Evidencia: `src/utils/finance.ts:111` define `factoryMaxCapacity = 5000`.
- Impacto: dashboard de ocupacao pode ser ficticio.
- Tipo: relatorio/gestao.
- Precisa confirmar: sim.

## 10. Perguntas objetivas para fechar regra de producao/estoque

1. O estoque deve ser baixado automaticamente quando o pedido sai de `Aguardando Material`, quando entra em `Corte`, ou quando e entregue?
2. Se o pedido for cancelado depois do consumo, o estoque deve voltar automaticamente?
3. O sistema deve reservar estoque antes de consumir?
4. Quem pode ignorar ruptura de estoque?
5. Ignorar ruptura deve gerar log, aprovacao ou pendencia de compra?
6. O tecido escolhido no orcamento deve substituir o tecido padrao da ficha tecnica?
7. Produto sem ficha tecnica pode ser vendido ou deve ser bloqueado antes do pedido?
8. Produto com ficha tecnica vazia deve aparecer em relatorio de cadastros incompletos?
9. Saida manual de estoque deve exigir `reference_id` e motivo?
10. Saldo atual e custo medio podem ser editados diretamente no cadastro?
11. A ficha tecnica pode repetir o mesmo insumo em duas linhas?
12. O WMS sera usado ou deve ser desativado/ignorado?
13. A capacidade de producao deve vir de `company_profile.monthly_capacity`, produto, setor ou configuracao propria?
14. O historico de mudanca de etapa precisa ser auditavel?
15. Factory pode entregar pedido ou apenas mover etapas intermediarias?

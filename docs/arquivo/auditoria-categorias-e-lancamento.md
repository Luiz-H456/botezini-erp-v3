# Categorias e lançamento financeiro — o que duplica e o que dá para simplificar

Auditoria do estado atual, com o que eu recomendo mudar e em que ordem. Nada
aqui foi executado — são propostas, porque mexer em classificação de dinheiro
sem sua decisão é como se perde histórico.

---

## O diagnóstico: três sistemas de categoria vivendo juntos

### 1. `global_categories` — o sistema bom

Tem domínio (`finance` / `inventory` / `crm`), hierarquia pai→filha e agora
`natureza` (fixo/variável). É o que os relatórios usam. **Este é o que fica.**

### 2. `record.category` — texto solto, legado

Existe em **cinco** entidades: `Client`, `Product`, `Insumo`, `Supplier` e
`FinancialObligation`. Cada registro carrega o nome da categoria **em texto**,
além do `global_category_id`.

A prova de que isso custa caro está em `src/utils/categoryResolver.ts`, que
existe só para desempatar:

```ts
return globalCategory?.name ?? legacyCategory ?? fallback;
```

Todo lugar que lê categoria precisa desse resolvedor. Renomear uma categoria
não atualiza o texto congelado nos registros antigos — então o mesmo gasto pode
aparecer com dois nomes no relatório, dependendo de quando foi lançado.

### 3. `settingsRepository.getCategories(type)` — código morto que ainda faz I/O

`useMasterData` carrega três listas do localStorage/settings:

```ts
setClientCategories(storageService.getCategories('client'));
setSupplierCategories(storageService.getCategories('supplier'));
setProductCategories(storageService.getCategories('product'));
```

**Nenhuma das três é usada em tela nenhuma** — procurei em todos os `.tsx` e não
há um uso sequer. São três leituras por carregamento de Cadastros, mais uma
sincronização em segundo plano com o banco, para alimentar variáveis que ninguém
lê.

---

## Sobreposição entre as três dimensões de despesa

Hoje uma conta a pagar pode ser classificada por **três** eixos:

| Campo | Pergunta que responde | Exemplo |
|---|---|---|
| `global_category_id` | **O QUE** foi gasto | Tecidos, Energia, Contador |
| `cost_center_id` | **ONDE** foi gasto | Corte, Costura, Administrativo |
| `natureza` (novo) | **COMO SE COMPORTA** | fixo / variável |

Esses três são legítimos e não se substituem — é a estrutura correta.

**O problema é o quarto:** `cost_centers.type`, com valores
`production | administrative | commercial | financial`. Ele responde quase a
mesma coisa que `natureza`: produção tende a ser variável, administrativo tende
a ser fixo. Mas "tende" não é "é" — comissão é comercial e variável, aluguel da
fábrica é produção e fixo.

Hoje `cost_centers.type` é usado em **um** lugar só:

```ts
const prodCC = costCenters.find(cc => cc.type === 'production');   // Dashboard
```

Ou seja: um campo com quatro valores, preenchido em todo cadastro de centro de
custo, usado uma vez para achar o primeiro centro de produção.

E ainda há `Supplier.default_sub_category` — um quinto nível, só para
fornecedor, sem ligação com nada.

---

## O que eu recomendo, em ordem de risco crescente

### 1. Apagar as listas mortas (risco zero, ganho imediato)

Remover `clientCategories`, `supplierCategories`, `productCategories` de
`useMasterData` e o `getCategories/saveCategories` de `settingsRepository`.
Ninguém lê. São três idas ao banco por abertura de Cadastros que não produzem
nada na tela.

**Ganho:** menos I/O, menos um sistema de categoria para alguém descobrir e
achar que deve usar.

### 2. Parar de GRAVAR `category` em texto (risco baixo)

Não apagar a coluna — os dados antigos dependem dela, e o `categoryResolver`
continua lendo. Mas parar de **escrever** nela em registros novos: só
`global_category_id`.

**Por que não apagar de uma vez:** apagar quebraria todo lançamento antigo que
tem texto e não tem FK. O resolvedor pode continuar existindo por anos sem
incomodar ninguém; o que incomoda é continuar criando dado novo em dois lugares
que podem divergir.

**Ganho:** renomear uma categoria passa a valer para trás. Some a classe de bug
"o mesmo gasto aparece com dois nomes".

### 3. Aposentar `cost_centers.type` (risco baixo, precisa da sua decisão)

O único uso é achar o centro de produção no Dashboard, e isso dá para resolver
melhor: o Dashboard pode somar **todos** os centros de produção em vez do
primeiro que encontrar — que hoje é escolhido arbitrariamente por ordem de
retorno do banco, o que já é um bug silencioso.

Substituto: `natureza` no centro de custo, igual à da categoria. Um eixo com
dois valores claros em vez de quatro que se confundem.

**Ganho:** um campo a menos para preencher, e a pergunta "isso é fixo?" passa a
ter uma resposta só no sistema inteiro.

### 4. Remover `Supplier.default_sub_category` (risco baixo)

Quinto nível de classificação, sem uso em relatório nenhum. Se a intenção era
separar "Aviamentos" de "Tecidos" dentro de um fornecedor, isso já é o que a
hierarquia pai→filha de `global_categories` faz.

---

## Lançamento financeiro — o que simplificaria de verdade

### O problema real não é a tela, é quantas decisões ela exige

Para lançar uma conta a pagar você preenche: descrição, valor, vencimento,
categoria, centro de custo, fornecedor, conta bancária padrão, meio previsto,
recorrência. **Nove decisões** para registrar que chegou a conta de luz.

Três ideias, da mais simples à mais ambiciosa:

**a) Herdar do fornecedor.** `Supplier` já tem `default_cost_center_id`. Faltam
`default_global_category_id` e `default_planned_method`. Escolher "Cemig" deveria
preencher categoria, centro de custo e meio sozinho — você só confirma. É a
mudança de melhor relação esforço/ganho da lista inteira.

**b) Repetir o último lançamento igual.** Ao digitar uma descrição parecida com
algo já lançado, oferecer os campos do anterior. A conta de luz de agosto é a de
julho com outro valor e outra data.

**c) Aprender com o histórico.** Depois de três lançamentos de "Cemig" na
categoria Energia, o sistema para de perguntar e passa a sugerir. É o mesmo
princípio da previsão de recebimento que já existe — o comportamento passado
prevendo o próximo.

### Uma inconsistência que vale corrigir junto

`FinancialObligation` tem `category` **e** `global_category_id` **e**
`cost_center_id`. Mas o **centro de custo não tem natureza** — então, no ponto de
equilíbrio, uma despesa classificada só por centro de custo fica sem
classificação fixo/variável e cai em "fora do cálculo", mesmo estando
perfeitamente organizada.

Isso conecta com a recomendação 3: dar `natureza` ao centro de custo fecha esse
buraco.

---

## O que NÃO recomendo mexer

**A hierarquia pai→filha das categorias globais.** Funciona, os relatórios
somam pelas filhas e agrupam pelo pai, e o tooltip já explica bem. Mexer aqui
seria trocar seis por meia dúzia.

**Separar categoria de centro de custo.** Vi sistemas que fundem os dois e o
resultado é sempre pior: "Energia" e "Corte" respondem perguntas diferentes, e
juntá-los obriga a criar "Energia do Corte", "Energia do Escritório" — a
explosão combinatória clássica.

---

## Ordem sugerida

1. **Apagar as listas mortas** — risco zero, faço quando quiser.
2. **Herdar do fornecedor** — o maior ganho diário, sem tocar em dado existente.
3. **Parar de gravar `category` em texto** — precisa de um passe nos formulários.
4. **`natureza` no centro de custo + aposentar `type`** — precisa da sua decisão
   sobre o que fazer com os centros já cadastrados.

As duas primeiras dá para fazer hoje sem risco. As duas últimas mexem em
classificação de dado existente e merecem backup antes.

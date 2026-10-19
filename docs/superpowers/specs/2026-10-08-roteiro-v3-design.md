# Roteiro da v3 — spec sheet

Data: 08/10/2026 · Branch: `v3` · Pasta: `Documentos\botezinipvd-v3`

Este documento é o mapa da v3. Ele não descreve telas; ele diz **o que vem, em que ordem, de que
depende e quando cada coisa conta como pronta**. Cada subprojeto ganha a sua própria spec e o seu
próprio plano, escritos quando chegar a vez dele.

Atualize a coluna **Estado** a cada passo. A tabela é a fonte da verdade sobre onde estamos.

## 1. Objetivo da v3

Nas palavras do Luiz (06/10): o objetivo não é ter o maior número de funções possível, e sim ser
fácil de usar, funcionar e tudo se casar. O fluxo deve conversar sozinho, com funções e limites bem
definidos.

**Regras que valem para todo o roteiro:**
- **Adaptar, não refazer.** Parte-se da tela que existe e adapta-se o esqueleto dela. Telas
  paralelas feitas do zero ficam de fora.
- **Nenhuma nuance some sem decisão.** Cada subprojeto tem o inventário das subfunções, e cada uma
  continua alcançável ou tem um "sai" escrito.
- **Visual:**
  - o idioma do resto do app, pelas classes de `src/components/finance/ui/estilo.ts` e pelo
    componente `Indicador`;
  - escala de espaço de 4 a 24;
  - vencido em rosa, ação principal em âmbar.
- **Banco:** só o banco local da v3 (`supabase_db_botezini-v3`). Nada na produção até o Luiz decidir.
- **A v2 de referência continua de pé** (porta 5176, pasta `Documentos\botezinipvd-v2ref`, commit
  `7f43da0`, banco local). Ela não é apagada.

## 2. Subprojetos

| # | Subprojeto | Estado | Depende de |
|---|---|---|---|
| S0 | Finanças v3 | **Pronto** (até `0afd187`) · 5 pendências pequenas | — |
| S1 | Navegação por objetivos | **Pronto** (08/10, até `9844b6b`) · pendências no S6 | S0 |
| S2 | Cadastros | **Pronto** (09/10, até `822dd72`) · `cadastros_v3_1.sql` rodado no local v3 | S1 |
| S3 | Vender | **Pronto** (09/10, até `d012bfb`) | S1, S2 |
| S4 | Fábrica | **Pronto** (10/10, até `33af9a8`) | S1, S2 |
| S5 | Como estamos indo | **Pronto** (13/10, até `46225f8`) | S1, S3, S4 |
| S6 | Limpeza | **Pronto** (13/10, até `7c2cfc5`) | S5 |
| S7 | Compras por pedido | **Pronto** (14/10, `ebb1bb7..c4ae209`) · SQL `compras_por_pedido.sql` ainda por rodar no local e ensaiar | S4, S6 |

A ordem S2 → S3 → S4 é decisão do Luiz (08/10): arrumar a base (cadastros) antes do que depende
dela.

### S0 · Finanças v3 (pronto)

- **Specs:**
  - `2026-10-06-financeiro-v3-design.md`;
  - `2026-10-07-financas-v3-adaptacao-design.md`.
- **Planos:**
  - `2026-10-06-financeiro-v3.md`;
  - `2026-10-07-financas-v3-adaptacao.md`.
- **Comparação v2 × v3:** <https://claude.ai/artifact/SfFnWr6WXAXn59LgYDV5jC>.
- **Pendências pequenas.** Entram no S6, a menos que algum subprojeto mexa no mesmo lugar antes:
  1. Na nova conta, "Já foi pago?" não pergunta o meio de pagamento. Já era assim na v2.
  2. "Recalcular scores" não dá retorno na tela.
  3. O botão de desfazer conferência diz "Confirmar reversão".
  4. `AttachmentViewer` e `ConfirmDialog` ainda não abrem em portal.
  5. O painel Filtros fecha com Esc mesmo com uma lista aberta dentro dele, e não prende o foco.

### S1 · Navegação por objetivos

- **Estado:** pronto em 08/10. Plano `2026-10-08-navegacao-por-objetivos.md`, 10 tarefas e uma
  rodada final de correções. Comparação v2 × v3 do menu e do Início:
  <https://claude.ai/artifact/SStYP9sxhZYcwLAHN2MrhL>.
- **Ficou para depois:**
  - **S3:** "Ver o que receber" abrir já no cliente; "Marcar aprovado" como segundo botão do
    Retomar; mensagem de entrega com o saldo real (vindo das parcelas, não do campo antigo).
  - **S4:** os avisos fixos do Cronograma e da Lista de compras; "Dar entrada no estoque" já
    preenchido.
  - **S6:** o `Dashboard` velho e o que só ele usa; o `SimuladorPanel`; os reexports de `PcpTab`
    em `PCP.tsx`; comentários e documentos que citam `LateralDaSecao`, `AbasDaSecao` e
    `factoryMode`; a gaveta do menu no celular prender o Tab dentro dela; e as pendências menores
    da revisão final:
    - `production_stage` comparado sem `trim`;
    - o id da linha da fila depende da ordem;
    - "Atenção" conta como linha;
    - testes de borda da fila;
    - recarga da fila:
      - corrida no sair/entrar;
      - `hoje` parado depois da meia-noite;
    - cores fixas no gráfico de Produtos & mercado;
    - o tipo do telefone do cliente no próximo passo.
  - **S2:** as linhas "Conferir saldo" e "sem saldo de partida" levam a Contas, que ainda não diz
    qual banco diverge e mantém o botão "Sincronizar saldos" à vista. Isso se resolve quando os
    bancos forem para Cadastros: a lista do que diverge, com o aviso de conferir antes de
    sincronizar.
- **Achado no banco local da v3 (não mexido):** a tabela `consumo_nao_apurado` não existe lá
  (a leitura dá 404 e a tela trata como zero). O SQL está em `supabase/baixa_automatica_de_producao.sql`;
  rodar é decisão do Luiz.

- **Base:** `docs/superpowers/specs/2026-10-06-navegacao-por-objetivos-design.md` (commit
  `36c619f`), escrito antes da adaptação da Finanças.
- **O que precisa ser atualizado na spec antes da revisão do Luiz:**
  - "Dinheiro" passa a ter os passos **Contas · Clientes que devem · Caixinhas**, que são as views
    `finance`, `receivables` e `envelopes` de hoje. Não são mais as páginas `pages/financas/*`,
    que foram apagadas.
  - **Barra de passos:** a `BarraDePassos` nasce da `AbasDaSecao` que já existe. O formato de
    pílula âmbar fica, e entra a numeração 1 → 2 → 3 onde há ordem.
  - **Resultado:** a view `resultado` vai para "Como estamos indo". O teto do teste "lista longa"
    volta a 3.
  - **Início:** a fila usa as contas puras da Finanças (`numeros.ts`, `clientes.ts`, `bancos.ts`,
    `projecao.ts`).
  - **Portão I4:** já resolvido, porque desfazer conferência com motivo continua no cartão da conta.
- **Decisões já tomadas** (não reabrir):
  - Prospecção sai do menu, e o código fica.
  - O Quadro de notas continua.
  - O Simulador vira "cabe na semana?" dentro do orçamento.
  - Os indicadores da fábrica vão para "Como estamos indo".
  - A fila do Início fica agrupada por objetivo, com um resumo de 3 números.
  - Dar entrada no estoque não cria conta a pagar.
- **Entrega:**
  - o menu por objetivo, com contadores;
  - o Início como fila;
  - a barra de passos;
  - o componente `ProximoPasso` ao fim de cada etapa;
  - o PCP recebendo `abas`.

### S2 · Cadastros

- **Estado (09/10):**
  - **Execução:** 10 tarefas por subagentes, revisão geral e uma rodada final de correções. Testes: 1393 passando; tipos limpos.
  - **Plano:** `2026-10-08-cadastros-v3.md`.
  - **Comparação v2 × v3:** <https://claude.ai/artifact/CQyNUuZGUKGb4WNp3j5Rw3>.
  - **SQL:** `supabase/cadastros_v3_1.sql` foi rodado pelo Luiz no banco local da v3 em 09/10. Rodou como
    `supabase_admin`, porque o `postgres` não é dono das tabelas, usando a senha que já está dentro do container.
    A v3 já mostra titular e PIX no banco e o seletor "Banco que sai no orçamento".
- **Ficou para depois:**
  - **S3:**
    - "Ver o que receber" abrindo já no cliente (a abertura `clienteId` já existe em Cadastros);
    - o banco escolhido aparecer no orçamento logo após editar (hoje só depois de recarregar o perfil).
  - **S6:**
    - leituras que engolem erro (`getSectors`, `getByDomain` e outras) passam a lançar por padrão, depois de
      auditar quem chama. No S2 só o fichário lê no modo estrito; a tela Setores ainda pode dizer "nenhum setor"
      quando a leitura falha, e a meta sugerida ainda lê as categorias sem modo estrito;
    - o painel de Completude recarrega remontando: perde a rolagem e o "ver mais" (dá para trocar por recarga via ref);
    - `Dashboard.tsx` e o que só ele usa;
    - `usePcpCapacity.loads`, se mais ninguém usar;
    - campos mortos em `Finance.tsx` (`confirmTarget.title/message`, a guarda sempre verdadeira, `includeInactive`);
    - renomear `CompletudeTab.tsx`, que agora é o painel do topo de Produtos;
    - casts `as any` nos ganchos da completude e da meta;
    - teste de `calcularMetaSugerida`;
    - detalhes visuais anotados (cores de valor nos campos, recuo da lista, botões de confirmar em Categorias).

- **Telas de hoje:** `pages/MasterData.tsx` e `pages/masterdata/*`, mais `components/masterdata/*`
  (cerca de 4.000 linhas).
- **Itens da triagem:**
  - Minha empresa;
  - Clientes, incluindo a página do cliente e a do grupo;
  - Fornecedores;
  - Produtos e ficha técnica;
  - Completude;
  - Categorias;
  - Mensagens (modelos de WhatsApp).
- **Itens que chegam de outros módulos:**
  - **Bancos:** cadastrar, editar, inativar, reativar e sincronizar saldos. A triagem da Finanças
    (itens 24 e 25) mandou para cá; hoje eles estão no "⋯" de Contas.
  - **Setores e capacidade:** hoje é a aba "Capacidade & Setores" do PCP.
- **Triagem (08/10):** 60 funções, em `.superpowers/brainstorm/triagem-cadastros.md`. Principais decisões:
  - **Granha Ligas:** é matriz + 2 filiais, no mesmo grupo econômico. Não é duplicata.
  - **Página do cliente:** o "Vencido" segue a regra da entrega da Finanças. As 9 abas viram 5.
  - **Bancos** vêm para Cadastros. O orçamento passa a escolher um banco cadastrado, que ganha titular e PIX.
  - **Clientes dormentes:** continuam na lista e ganham uma linha na fila do Início.
  - **Completude:** vira o topo de Produtos e ganha uma linha na fila do Início.
  - **Saem da tela** (os dados ficam guardados): comissão base, limite de crédito e moeda do banco.
  - **Meta de faturamento:** fica, com valor sugerido pelo sistema. O uso dela vai para o S5.
  - **Contrato recorrente:** fica para uma sessão própria, depois. O S2 não mexe nele.

### S3 · Vender

- **Estado (09/10):**
  - **Execução:** 10 tarefas por subagentes (spec `2026-10-09-vender-v3-design.md`, plano `2026-10-09-vender-v3.md`),
    revisão geral e uma rodada final de correções. Testes: 1416 passando; tipos limpos. Nada no banco.
  - **Comparação v2 × v3:** <https://claude.ai/artifact/Vwog6tS156xJ4XpoosTupP>.
  - **Respostas às perguntas abertas:** o editor ficou uma tela só, em 4 blocos com o total fixo no rodapé; Pedidos
    continua lista própria.
  - **Pendências que chegaram do S1 e do S2:** feitas. "Ver o que receber" abre no cliente; "Marcar aprovado" na
    fila; a mensagem de entrega usa o saldo real; o banco do orçamento já valia sem recarregar, porque o orçamento
    lê o perfil toda vez que abre.
- **Ajuste visual depois da entrega (09/10, `d012bfb`), a pedido do Luiz ("melhorias mescladas" v2 + v3):**
  - **Filtros de Orçamentos e Pedidos:** não vazam mais.
  - **Cartões:** o passo do momento fica à vista com ver, editar ou ficha, mensagem e PDF; no ⋯ só o raro e o que apaga.
  - **Editor:** cliente, data, validade e Salvar voltam ao cabeçalho do topo, como na v2. O rodapé fica só com os
    totais.
  - **Tabela de itens:** rola para o lado no celular.
- **Decidido (Luiz, 09/10): manter como está.** O orçamento novo mostra "Entrada 50%" e só grava o plano de parcelas
  se a entrada ou as parcelas forem mexidas; a conversão continua oferecendo a condição padrão do cliente.
- **Ficou para depois:**
  - **S4:** a mensagem "entregue" do Quadro ignora as contas a receber antigas sem `order_id`. Ela erra pelo lado
    seguro: não cobra.
  - **S6:**
    - o orçamento antigo, ao ser regravado, sai com PIX como forma de pagamento padrão (passar `payment_method` para
      `planoParaMostrar`);
    - o prazo de entrega da janela "Editar parcelas" ainda conta de hoje;
    - um erro depois de salvar mostra "Não consegui salvar";
    - o Ctrl+S que falha na validação tira o cursor do campo;
    - os orçamentos antigos com `has_band:false`;
    - a troca de produto religa a Faixa;
    - "Orçamento de origem" aparece no chip e no ⋯;
    - o envio sem telefone não marca "Enviado";
    - a rolagem de "Ver o que receber" para fora do centro;
    - "Abrir ficha" sem estado de carregando;
    - o PDF destaca a 1ª parcela como entrada mesmo quando não é.

- **Telas de hoje:**
  - `pages/Budgets.tsx` e `components/budgets/*` (editor, custo da peça, histórico do produto,
    fotos de referência, importar personalização, fila de retomada, resumo da conversão);
  - `pages/Orders.tsx` e `components/orders/*` (ficha de produção, ficha de entrega, reverter para
    orçamento, visualização rápida).
  - Somam cerca de 6.000 linhas.
- **O que já está decidido na navegação:**
  - **Passos:** 1. Orçamentos · 2. Pedidos.
  - **Cadeia de mensagens:** enviar → retomar → virar pedido → cobrar entrada, usando as mensagens
    que já existem.
  - **Simulador:** vira a linha "cabe na semana de dd/mm" no editor do orçamento, com o motor
    `simulateInsertion`.
- **Perguntas abertas:**
  - o editor de orçamento (cerca de 1.800 linhas) se divide em passos ou continua uma tela só?
  - Pedidos continua como lista própria ou vira uma visão do Quadro?

### S4 · Fábrica

- **Estado (10/10):**
  - **Execução:** 7 tarefas por subagentes (spec `2026-10-09-fabrica-v3-design.md`, plano `2026-10-09-fabrica-v3.md`),
    revisão geral e uma rodada final de correções. Testes: 1425 passando; tipos limpos. Nada no banco.
  - **Comparação v2 × v3:** <https://claude.ai/artifact/1gtk5P1jhesDCSiMLy4cRU>.
  - **Respostas às perguntas abertas:**
    - O Estoque mantém as duas abas.
    - Da Lista de compras saiu o "Receber compra", que dá entrada de uma vez sem criar conta a pagar.
  - **Ícones:** a causa dos "ícones minúsculos" era o `px-4` do botão vencendo o `px-0` dos botões só de ícone. Foi
    corrigida na raiz em `estilo.ts` (`33af9a8`).
- **Ficou para depois** (próxima rodada, a de ícones e toque em todo o app):
  - **Controle parcial:**
    - numa baixa de várias peças, os campos piscam vazios durante a gravação, porque a chave muda a cada lançamento
      (os dados estão certos);
    - um erro antigo pode reaparecer ao reabrir a janela;
    - a solução é o padrão do Quadro: erro local e chave trocada só na falha.
  - **Área de toque:** menor que 40px nos botões dos cartões do Quadro e do Cronograma.
  - **Tabela do Estoque:** com 1 linha só, o menu ⋯ ainda pode ficar cortado (conferir).
  - **parseBRL:** lê "1.000" (com ponto, sem vírgula) como 1. Isso vem de antes e vale para todas as entradas de
    estoque.

- **Telas de hoje:** `pages/PCP.tsx` com 10 abas (`components/pcp/*`), mais `pages/Inventory.tsx`
  e `components/inventory/*`. Somam cerca de 5.000 linhas.
- **Destino na navegação:**
  - "Como está a produção": Quadro, Controle parcial, Consumo não apurado;
  - "Planejar a semana": Cronograma, Lista de compras, Estoque;
  - Painel, Desempenho e Rendimento do corte vão para o S5;
  - Capacidade vai para o S2;
  - o Simulador vai para o S3.
- **O papel `factory`** (chão de fábrica) continua vendo só o Quadro.
- **Perguntas abertas:**
  - Estoque mantém as duas abas (Insumos e Personalização)?
  - O que da Lista de compras precisa existir antes da entrada no estoque?

### S5 · Como estamos indo

- **Estado (13/10):**
  - **Pronto.** Spec `2026-10-13-como-estamos-indo-v3-design.md` e plano `2026-10-13-como-estamos-indo-v3.md`, com
    5 tarefas por subagentes, revisão geral e uma rodada final de correções. Testes: 1434; tipos limpos. Nada no
    banco.
  - **Comparação v2 × v3:** <https://claude.ai/artifact/3kqYYanbmNPciX9kywSJjS>.
  - **Saúde do caixa:** volta como aba em Dinheiro, e o Início ganha "Caixa fica negativo em dd/mm". O aviso usa a
    mesma conta da aba e abre a aba no mês do negativo.
  - **Resultado:** ganha a meta do período e do ano, o aviso de margem abaixo da margem alvo e a vista DRE.
  - **Ficou para o S6:**
    - unificar ou tirar a linha antiga do Início "<mês> fecha em −R$ X" (`projecaoDoMes`, saldo livre, até o fim
      do mês);
    - remover o `Dashboard.tsx` velho.
- **Estado (10/10):**
  - A triagem está pronta em `.superpowers/brainstorm/triagem-como-estamos-indo.md`, com 23 funções e as perguntas
    P1 a P4.
  - **Achado:** a Saúde do caixa, com a projeção do saldo, só existe no `Dashboard.tsx` velho, que está fora do menu.
    Hoje ela **não é alcançável na v3**. A P1 decide onde volta.
  - O visual das três abas já está no padrão (`7e6e61d`).

- **Telas de hoje:**
  - `pages/Resultado.tsx` (da Finanças);
  - `pages/ItensVendidos.tsx` e `components/vendas/QuadranteDeProdutos.tsx`;
  - aba Produtos & mercado do `Dashboard`;
  - abas Painel, Desempenho e Rendimento do corte do PCP.
- **O que já está decidido:** o alerta "margem bruta baixa" mora aqui, e não na fila do Início.
- **Meta de faturamento (triagem do S2):** meta × realizado e o lucro, junto da saúde do caixa. A meta é
  guardada e sugerida em Cadastros › Minha empresa.
- **Pergunta aberta:** são três passos (Resultado · Vendas · Fábrica) ou uma tela com blocos?

### S6 · Limpeza

- **Estado (13/10):**
  - **Pronto.** Spec `2026-10-13-limpeza-v3-design.md` e plano `2026-10-13-limpeza-v3.md`, com 7 tarefas por
    subagentes, revisão geral e uma rodada final de correções. Testes: 1430; tipos e `vite build` limpos. Nada no
    banco.
  - **Respostas do Luiz:**
    - saiu a linha "<mês> fecha em";
    - "1.000" = mil;
    - copiar a mensagem sem telefone marca Enviado;
    - "Já foi pago?" pergunta o meio de pagamento, sugerindo o mais usado.
  - **Removidos:** o `Dashboard.tsx` velho, o `SimuladorPanel` e o código que só eles usavam. Os documentos antigos
    foram para `docs/arquivo/`.
  - **Achado e corrigido:** o preço da ficha de entrega não aceitava centavos ("12,50" virava R$ 1.250,00).
  - **Decidido (Luiz, 13/10):** a Entrada e a Saída do Estoque também leem "1.000" como mil (`7c2cfc5`). Antes de
    gravar, a janela mostra como o número foi entendido ("Vai lançar 1.000 m").

- As pendências pequenas de cada subprojeto, incluindo as 5 do S0.
- O código que ficou sem uso depois do S1 ao S5. O `Dashboard` velho sai quando o Início novo
  substituir todas as abas dele.
- A documentação antiga que cita código apagado (`docs/arquitetura`, `docs/auditoria-*`).
- A Prospecção continua em espera; o código fica.

### S7 · Compras por pedido

- **Estado (14/10):** **Pronto.** Spec `2026-10-14-compras-por-pedido-design.md` e plano `2026-10-14-compras-por-pedido.md`
  (7 tarefas, `ebb1bb7..c4ae209`). A compra é lançada por semana e vinculada a cada pedido; a Lista de compras mostra
  o que falta; o Quadro apura a sobra na entrega e o Estoque ganhou ajuste de contagem e uso num pedido.
- **Saíram:** a aba e a tela "Consumo não apurado" e a linha do Início que apontava para ela. A linha "Comprar N
  insumos abaixo do mínimo" virou "Comprar N insumos para os pedidos desta semana" (some se a conta não puder ser feita).
- **Falta:** rodar o SQL no banco local da v3 e conferir no navegador; ensaio no backup mais novo antes da produção.

## 3. O caminho de cada subprojeto

É o mesmo processo que fechou a Finanças:

1. **Triagem com o Luiz**, função por função: continua, mescla, exclui ou aguarda. Fica registrada
   em `.superpowers/brainstorm/triagem-<modulo>.md`.
2. **Spec**, em `docs/superpowers/specs/AAAA-MM-DD-<modulo>-v3-design.md`. Ela traz o inventário
   das subfunções (onde cada uma fica: à vista, no "⋯", em "mais opções" ou "sai") e as regras de
   negócio. O Luiz revisa.
3. **Plano**, em `docs/superpowers/plans/AAAA-MM-DD-<modulo>-v3.md`, com tarefas pequenas,
   restrições globais e um foco de revisão. O Luiz revisa e escolhe a forma de execução.
4. **Execução por subagentes:** revisão de cada tarefa, rodadas de correção e uma revisão geral no
   fim.
5. **Visual** no padrão do app (`estilo.ts` e `Indicador`).
6. **Comparação v2 × v3** publicada, com antes e depois.
7. **Conferência no navegador** com o usuário de teste, em 1440, 1024 e 390 px, sem rolagem para o
   lado e sem erro no console.
8. **Relatório final:** o que mudou, antes → depois, e o próximo passo.

**Pronto quer dizer:**
- testes (`node --test`) e tipos (`tsc --noEmit`) limpos;
- todas as linhas do inventário alcançáveis;
- comparação publicada;
- commit no branch `v3`;
- o Estado atualizado na tabela da seção 2.

## 4. Fora do roteiro (por decisão do Luiz, 08/10)

- **Produção:**
  - rodar `financeiro_v3_1` e `financeiro_v3_2`;
  - juntar o branch `v3`;
  - publicar.
- **Achados nos dados de produção:**
  - o pagamento de R$ 209.254,00;
  - as categorias marcadas como custo do produto;
  - o cliente duplicado (ver S2: pode não ser duplicado);
  - os pedidos cujas parcelas não fecham com o total (o roteiro anotou 16; o mapa de 08/10 fala
    em 17, somando cerca de R$ 60.879);
  - possíveis lançamentos em dobro na folha e nas parcelas 13/18 e 14/18 do empréstimo
    Santander (o mapa recomenda falar com o contador antes de mexer);
  - a caixinha do 13º com R$ 1.320 guardados de uma meta de R$ 15.840;
  - a conta "Sueli" no negativo, e as saídas por PIX em 90 dias 4,5 vezes maiores que as
    entradas.

  Eles voltam quando a v3 inteira estiver pronta.

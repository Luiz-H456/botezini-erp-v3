# Ida da v3 para a produção — plano

- **Data:** 14/10/2026.
- **Estado:** pronto para executar. A baixa automática ficou de fora (decisão do Luiz, 14/10): entrou no lugar
  o SQL de compras por pedido (item 4 da seção 3). Nada aqui foi executado na produção. Cada passo marcado **[Luiz]** é ele quem roda.
- **Ensaio:** a sequência final (1→5) foi rodada em 14/10 num contêiner descartável com o dump de produção de
  06/10 (`botezinipvd-1/backups/botezini_2026-10-06_0114.sql`). Resultado na seção 6. Antes da produção ela
  se repete, uma vez mais, contra o backup mais novo (passo 2).

## 1. O que vai

| Lado | Hoje na produção | Depois |
|---|---|---|
| App | `botezinipvd-1`, ramo `feat/financeiro-pcp-2026-07`, commit `91d5029` (17/09) | ramo `v3` do worktree `botezinipvd-v3` (200+ commits à frente, sem divergência: avanço direto) |
| Banco | sem os 5 arquivos da v3 (o dump de 06/10 confirma) | os 5 arquivos da seção 3, nesta ordem |
| Vercel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | as mesmas; nada novo |

## 2. Perguntas antes de começar

1. **De qual ramo a Vercel publica a produção?** O `main` do GitHub está parado em 31/03 e o ramo em uso é o
   `feat/financeiro-pcp-2026-07`. Confirmar em Vercel › Settings › Git › Production Branch. O plano assume esse
   ramo; se for outro, o passo 5 muda de alvo.
2. **Quando?** Fora do horário de uso (o app fica com o banco novo e o app velho por alguns minutos, ver 4).
3. **A pasta `supabase/.temp`** (com o project-ref da nuvem) está commitada em `botezinipvd-1`; a v3 a removeu e
   passou a ignorá-la. Depois do avanço, o `supabase` da linha de comando daquela pasta deixa de estar vinculado
   à nuvem. É uma trava de segurança a mais; se o Luiz usa o vínculo para algo, refaz com `supabase link` à mão.

## 3. Ordem dos SQLs (todos em `botezinipvd-v3/supabase/`)

| # | Arquivo | O que faz | Escreve dados? |
|---|---|---|---|
| 1 | `financeiro_v3_1_entrega.sql` | `orders.delivered_at` (+ preenche os entregues com `updated_at`, gatilho desligado durante), `awaiting_delivery` na view, somas de "a receber" ignoram o que espera entrega | sim: preenche `delivered_at` dos entregues |
| 2 | `financeiro_v3_2_conferencia_e_entrega.sql` | `marcar_conferida` (só marca, nunca desmarca) e gatilho que grava `delivered_at` ao entregar | sim: limpa motivo/data de "desfazer" das contas já conferidas |
| 3 | `cadastros_v3_1.sql` | `bank_accounts.titular`, `chave_pix`; `company_profile.banco_do_orcamento_id` | não (só colunas) |
| 4 | `compras_por_pedido.sql` | compras por pedido, sobra na entrega, ajuste de contagem | não: só estrutura e funções |
| 5 | `entrada_vale_antes_da_entrega.sql` | a entrada (até 3 dias do pedido) vale como a receber; coluna `pedido_em_aberto` | não (só a view) |
| 6 | `limpeza_de_dados_v3.sql` | limpeza pedida pelo Luiz em 15/10: estoque só de tecidos (1 por tecido, 3 faixas nos homologados), folha em dobro cancelada, estorno dos R$ 209.254,00, árvore de categorias financeiras, clientes repetidos por maiúscula juntados, status alinhado | **sim: apaga insumos e clientes repetidos**, move pagamento, estorna, recategoriza |

O `baixa_automatica_de_producao.sql` foi descartado (decisão do Luiz, 14/10) e NÃO vai para a produção.

Regras:
- Cada arquivo roda **uma vez, na ordem**. Os arquivos 2, 3, 4 e 5 podem ser repetidos sem estrago. O 1, depois que o 5 já rodou, é recusado pelo Postgres ("cannot drop columns from view", porque o 5 acrescentou uma coluna à view) e nada muda: não repita o 1.
- Cada um tem consulta de antes/depois; guardar a saída de cada um.
- O 6 roda DEPOIS do backup e no mesmo dia do app novo (ele marca como legado os pedidos que existem na hora).
- O 6 é uma transação só (tem `BEGIN`/`COMMIT` dentro) e termina numa tabela "antes × depois"; o SQL Editor
  mostra só ela — guardar o print. Pode ser repetido: a segunda passada não muda nada.
- O 6 NÃO muda o saldo atual dos bancos: o estorno dos R$ 209.254,00 só reancora o ponto de partida. O saldo
  que vale é o que o Luiz informa do extrato em Cadastros › Bancos › Saldo atual (decisão de 15/10: começar a
  contar a partir do saldo real). Ordem: primeiro dar baixa nas contas que foram pagas por fora no período
  sem uso, DEPOIS informar o saldo — baixa lançada depois do saldo informado desconta de novo.
- Na produção, pelo SQL Editor do Supabase (o Studio da nuvem é dono das tabelas, ao contrário do local).

## 4. Por que o banco vai antes do app

Tudo que os 5 arquivos fazem é **acrescentar** (coluna, função, gatilho, tabela, coluna na view) ou preencher
`delivered_at`. O app velho ignora o que não conhece: continua funcionando com o banco novo. O contrário não
vale — o app novo sem o banco novo mostraria tudo como "a receber" e a conferência falharia. Então: banco
primeiro, app logo depois. A janela entre os dois é de minutos.

### Atenção na virada (decisão aberta do Luiz)

No dia em que o `compras_por_pedido.sql` entra, nada está vinculado ainda. Então todo pedido que já está em
produção (alguns já cortados ou costurados) aparece inteiro na Lista de compras como "falta comprar"; o Início
diz "Comprar N insumos para os pedidos desta semana"; e "Usar do estoque" nesses pedidos tiraria do estoque, uma
segunda vez, material que a fábrica já usou.

**Decidido (Luiz, 15/10): só pedidos novos.** O arquivo 6 cria `orders.compras_legado` — todo pedido que já
existe nasce `true`, os próximos `false` — e zera o estoque antigo com um movimento de ajuste ("os antigos eu
nunca lancei ou dei importância para o estoque"). O app (`entraNasCompras`) deixa os pedidos legado fora da
Lista de compras, do "Comprar" do Início e dos destinos de uma compra.

## 5. Passo a passo

1. **[Luiz] Backup novo** — `botezinipvd-1/scripts/backup.ps1`, depois `scripts/conferir_backup.ps1`.
2. **[Claude] Ensaio no backup novo** — repetir a seção 6 inteira (os seis arquivos, duas vezes, e o teste de
   compras) com o dump do passo 1, num contêiner descartável. Se algo mudar desde 15/10, parar e revisar.
3. **[Luiz] Diagnóstico (opcional, só leitura)** — `supabase/diagnostico_achados.sql` no SQL Editor, para ter a
   foto dos achados do dia antes da mudança.
4. **[Luiz] Os SQLs**, na ordem da seção 3, guardando a saída de cada um.
5. **[Luiz] App** — em `botezinipvd-1`:
   ```
   git fetch
   git merge --ff-only v3        (o ramo v3 é local do worktree; está no mesmo repositório)
   git push origin feat/financeiro-pcp-2026-07
   ```
   A Vercel publica o push (confirmar a pergunta 1).
6. **[Luiz + Claude] Conferência no ar** — login; Início; um orçamento aberto (sem salvar); Quadro e Modo
   fábrica sem valores; Dinheiro › Contas com as entradas em aberto; Resultado. Usuário de fábrica não vê
   financeiro; anônimo não vê dados (o manual de operação pede os dois).

## 6. Ensaio feito em 14/10 (dump de 06/10)

A sequência final (arquivos 1→5, na ordem da seção 3), num contêiner descartável com o dump de 06/10.

| Conferência | Resultado |
|---|---|
| Restauração do dump inteiro | ok |
| Arquivos 1→5, cada um numa transação | todos ok, nenhum erro |
| Segunda passada, na mesma ordem 1→5, antes do 5 ter rodado | ok, nenhum erro |
| Passada com o 5 já aplicado | 2, 3, 4 e 5 ok; o 1 é recusado pelo Postgres (view ganhou coluna) e nada muda |
| `supabase/testes/compras_por_pedido_teste.sql` (inclui fábrica negada, linhas repetidas, pedido apagado depois da sobra) | terminou em "TODOS OS CASOS PASSARAM" (antes do ajuste abaixo) |
| Pedidos entregues sem `delivered_at` depois do 1 | 0 |
| Funções de compras (as 6) | presentes |
| `baixar_estoque_da_producao` | ausente (nunca existiu na produção) |
| Contas esperando entrega / entradas que passam a valer | 22 / 5 |
| View `obligation_summary` | `security_invoker=on` mantido |
| `diagnostico_achados.sql` em modo só leitura | ok, 73 linhas |

Depois deste ensaio, o `compras_por_pedido.sql` mudou: pedido já "Entregue" que é excluído não devolve nada ao estoque (a fábrica já usou o material), e o teste ganhou o caso (f) para isso. Em 15/10 o arquivo corrigido rodou duas vezes sem erro no mesmo contêiner e o teste inteiro, com o caso (f), terminou em "TODOS OS CASOS PASSARAM". Antes da produção, a sequência inteira se repete uma vez mais num contêiner descartável novo, contra o backup MAIS NOVO (passo 2 da seção 5).

### Ensaio da limpeza (15/10, dump de 15/10 01:46)

Contêiner descartável, arquivos 1→5 e depois o 6 duas vezes: a primeira como o SQL Editor manda (o arquivo
inteiro numa mensagem só), a segunda como arquivo. Nenhum erro; a segunda passada não mudou nada.

| | antes | depois |
|---|---|---|
| insumos (não tecido) | 49 (12) | 30 (0) |
| salários em dobro (pessoa+mês) | 72 | 0 |
| pagamento de R$ 209.254,00 ativo | 1 | 0 |
| categorias financeiras | 19 | 35 |
| clientes | 73 | 64 |
| pedidos / orçamentos | 44 / 96 | 44 / 96 |
| status gravado ≠ calculado | 156 | 0 |
| soma dos saldos | R$ 63.860,05 | R$ 63.860,05 (não muda; só o ponto de partida) |

## 7. Como voltar atrás

- **App:** na Vercel, "Promote" no deploy anterior (instantâneo). O banco novo serve ao app velho (seção 4).
- **Limpeza (arquivo 6):** apaga insumos e clientes repetidos; voltar só pelo backup do passo 1.
- **Banco:** os 5 primeiros arquivos não apagam nada. O único dado que mudou é `delivered_at` (aproximado nos entregues
  antigos — o arquivo 1 lista todos para correção à mão) e a limpeza de motivo/data de "desfazer" das contas
  conferidas. Voltar a estrutura não é necessário para o app velho funcionar; se for preciso mesmo assim, o
  backup do passo 1 é a referência, e o SQL de volta se escreve e se testa como os outros.

## 8. Fora deste plano

- Os achados nos dados (`diagnostico_achados.sql`): cada correção, quando o Luiz decidir, vira um arquivo
  próprio com antes/depois.
- Os dados de ENSAIO só existem no banco local da v3; não vão para a produção.

# Auditoria de qualidade de vida — ERP Botezini v3

**Perspectiva:** UX (jornada de quem usa, não aparência)
**Data:** 29/10/2026
**Escopo:** o app inteiro na v3 + tabela verdade (v3.1), no app local com o usuário admin de teste.
**Como foi feita:** varredura do código por padrões que geram atrito (fechar sem salvar, erro cru, campos numéricos,
navegação, avisos) + percurso das 8 seções na tela + teste de fluxos reais (orçamento novo, conta nova, login sem
servidor, compra, tabela de preços). Cada item traz onde está a prova.

**Para escolher:** marque `[x]` nos itens que quer. Eu implemento na ordem que você marcar (cada um com teste).

---

## Resumo

O app está bem resolvido no "caminho feliz": cada tela diz o que fazer a seguir, operações sem volta avisam a
consequência, e o Início guia o dia. O que falta é **proteção contra perder trabalho** e **memória de onde você
estava**. Os 5 críticos abaixo têm em comum: o usuário faz algo certo (dar F5, clicar fora, apertar Esc, fechar) e
perde o que estava fazendo, sem aviso.

## Mapa da jornada (o que um dia de uso toca)

| Passo | Situação |
|---|---|
| Abrir o app / login | ⚠ sem internet ou servidor fora, a tela diz "Acesso negado" (C4) |
| Início → clicar num aviso → tela certa já filtrada | OK |
| Trabalhar numa tela e dar F5 / voltar do navegador | ✗ volta ao Início / sai do app (C1) |
| Montar orçamento longo → fechar ou F5 | ✗ perde tudo, sem perguntar (C2) |
| Validar orçamento sem cliente | ⚠ janela "Atenção" bloqueia, não aponta o campo (R2) |
| Converter orçamento em pedido → próximo passo | OK (janela "Pedido criado" com o que fazer) |
| Lançar compra da semana → Esc sem querer | ✗ perde a compra inteira (C3) |
| Lançar conta a pagar → clicar fora do painel | ✗ perde o que digitou (C3) |
| Pagar a folha (9 salários no mesmo dia) | ⚠ 9 vezes o mesmo fluxo (R3) |
| Destravar 17 pedidos atrasados | ⚠ um por um (R4) |
| Erro ao salvar | ⚠ mensagem some em 3 s, às vezes em linguagem de banco (C5) |
| Achar um cliente/pedido estando em outra tela | ⚠ cada tela tem a sua busca; não há uma geral (R1) |

## Veredito: APROVAR COM MUDANÇAS
Nada impede o uso, mas os 5 críticos custam trabalho refeito toda semana.

---

## Críticos — perda de trabalho ou engano (recomendo todos)

- [x] **C1. F5 e o botão voltar do navegador perdem a tela.**
  O app não guarda a tela no endereço: `App.tsx:49` começa sempre em `login` e não há rota/histórico (nenhum
  `pushState`/`popstate`/router no código). Dar F5 em Contas filtradas volta ao Início; o "voltar" do navegador
  (ou do mouse) **sai do app**; não dá para mandar o link de um pedido para alguém.
  **Conserto:** endereço por tela (`#/dinheiro/contas`, `#/vender/pedidos/PED-…`), o voltar do navegador anda dentro do
  app, F5 mantém a tela (e o filtro principal). Esforço: médio. Ganho: todo dia.

- [x] **C2. O editor de orçamento fecha sem salvar e sem perguntar — e não guarda rascunho.**
  Testado: digitei nas observações e cliquei no "‹" → fechou, texto perdido (`BudgetEditor.tsx:954`, título
  "Fechar sem salvar"). F5 ou fechar a aba com um orçamento de 19 itens aberto também perde tudo (não há
  `beforeunload` nem rascunho no código).
  **Conserto:** (a) com alteração não salva, fechar pergunta "Sair sem salvar? As alterações em ORC-… se perdem";
  (b) rascunho automático no navegador a cada alteração, oferecido ao reabrir ("Recuperar o que você estava fazendo?");
  (c) aviso do navegador ao fechar a aba com alteração pendente. Esforço: médio.

- [x] **C3. Janelas com formulário fecham com Esc ou com um clique fora, perdendo o que foi digitado.**
  - Lançar compra: Esc fecha a compra inteira da semana (`LancarCompraModal.tsx:67-68`).
  - Conta nova (a pagar/receber): clique no fundo fecha o painel (`ObligationForm.tsx:148`).
  - Registrar pagamento: clique no fundo fecha (`PaymentModal.tsx:87`).
  - Também: Ajustar contagem, Definir preço, Editor do tecido (Esc).
  **Conserto:** uma regra só para o app (um hook): Esc/clique fora **só fecham se nada foi alterado**; com alteração,
  perguntam. Esforço: pequeno.

- [x] **C4. Login sem servidor diz "Acesso negado. Contate o administrador."**
  Visto hoje com o banco local fora do ar; o código cai nessa frase para qualquer erro que não seja senha/e-mail
  (`Login.tsx:44`). Parece senha bloqueada; é falta de conexão.
  **Conserto:** distinguir "Sem conexão com o servidor — confira a internet e tente de novo" de acesso negado de
  verdade. Esforço: pequeno.

- [x] **C5. Erro some em 3 segundos e às vezes vem em linguagem de banco.**
  O aviso padrão (`useToast.ts:4`, 3000 ms) some sozinho também quando é erro; quem desviou o olho não sabe o que
  falhou. ~43 pontos mostram a mensagem do banco crua (`e?.message || …`, ex.: `BudgetEditor.tsx:502`,
  `BancosPanel.tsx:111`), e o tradutor que já existe (`utils/errorHandling.ts`) só é usado em 2 lugares.
  **Conserto:** erro fica até fechar (sucesso continua sumindo sozinho); toda mensagem de erro passa pelo tradutor
  ("violates unique constraint" → "Já existe um cadastro com esse nome"). Esforço: pequeno/médio.

## Recomendações — ganham tempo toda semana

- [x] **R1. Busca geral (Ctrl+K).** Cada tela tem a sua busca (Orçamentos, Pedidos, Contas, Estoque, Cadastros), mas não
  há uma que ache "Laticínio Dona Rosa" ou "PED-047" de qualquer lugar. Uma caixa só: cliente, pedido, orçamento,
  fornecedor, tecido → abre a página. Junto com C1, vira o jeito mais rápido de andar no app. Esforço: médio.
- [x] **R2. Validação no campo, não em janela.** "Finalizar proposta" sem cliente abre a janela "Atenção — Selecione
  um cliente — Entendido" (`Budgets.tsx`, `openAlert`), uma falta por vez. Melhor: marcar o campo em vermelho, rolar
  até ele e listar tudo o que falta de uma vez. Esforço: pequeno.
- [x] **R3. Pagar várias contas de uma vez.** Hoje há 9 salários vencidos em 05/10; cada um é "Paguei" + janela. A lista
  de Contas não tem seleção (`Finance.tsx` não tem nenhum "selecionar"). Seleção com caixas + "Paguei as 9 — R$ 13.019,44,
  do banco X, em DD/MM" numa confirmação só (cada conta continua com o seu rastro). Esforço: médio.
- [x] **R4. Destravar pedidos atrasados em lote.** O Início pede "Destravar 17 pedidos", alguns de agosto. No Quadro
  é um por um. Selecionar vários → "nova data de entrega" ou "registrar atraso" de uma vez. Esforço: médio.
- [x] **R5. Um jeito só de avisar.** Hoje são três: aviso que some (`Toast`), aviso do Financeiro (`AlertToast`) e janela
  com "Entendido" (Orçamentos). O mesmo tipo de coisa (salvou / falhou) aparece de jeitos diferentes conforme a tela.
  Esforço: médio.
- [x] **R6. Campos de número padronizados.** 65 campos `type="number"` em 21 arquivos convivem com campos de texto que
  aceitam vírgula (`parseBRL`, 10 arquivos). No `number`, a rodinha do mouse muda o valor sem querer (rolar a página
  com o cursor em cima de um preço altera o preço), e a vírgula funciona ou não conforme o navegador. Padronizar no
  campo de texto com vírgula que já existe. Esforço: médio (mecânico).
- [x] **R7. Lembrar filtros e a aba de cada tela.** Hoje só o modo privado e os avisos ignorados são lembrados. Voltar a
  Contas, Orçamentos ou Estoque reabre tudo no padrão. Lembrar por aparelho o último filtro/aba de cada tela.
  Esforço: pequeno (complementa C1).
- [x] **R8. Rascunhos de orçamento parados.** A lista tem vários RASCUNHO de 02 a 16/10 nunca enviados; o Início avisa
  orçamento enviado e parado, mas não rascunho esquecido. Uma linha no Início: "Enviar 6 rascunhos parados há +7 dias".
  Esforço: pequeno.

## Bom ter

- [x] **N1. Título da aba do navegador por tela** ("Contas · Botezini", "PED-047 · Botezini"). Hoje é sempre "BOTEZINI ERP";
  com 3 abas abertas não dá para saber qual é qual. Pequeno.
- [x] **N2. Atalhos:** `N` = novo (orçamento, conta, tecido) na tela atual; `/` = buscar; Ctrl+S salvar em todos os
  editores (hoje só no orçamento). Pequeno.
- [x] **N3. Textos de 8 e 9 px:** 286 ocorrências (mais em `ProductForm.tsx` 28, `BudgetEditor.tsx` 23,
  `QuickCreateModal.tsx` 22, `BudgetPreviewModal.tsx` 21). Abaixo de 10 px cansa a leitura no dia a dia, sobretudo no
  celular. Subir o piso para 10–11 px. Mecânico.
- [x] **N4. Exportar a lista de Contas (CSV/planilha)** filtrada, para o contador. Hoje só o Resultado exporta (PDF).
  Pequeno.
- [x] **N5. Pendências pequenas da v3.1:** no orçamento, as faixas no seletor de cor na ordem do tecido (hoje seguem a
  cartela); no editor do tecido, ligar os rótulos aos campos de nome (leitor de tela). Pequeno.

---

## Consistência entre telas

- **Fechar janelas:** umas fecham com Esc e clique fora, outras só no botão, nenhuma pergunta antes de descartar (C3).
- **Avisos:** três padrões diferentes (R5).
- **Números:** dois tipos de campo (R6).
- **Busca:** cada tela tem a sua, com atalhos diferentes (Contas usa ⌘F; as outras, nenhum) (R1, N2).
- **O que está bem consistente:** operações sem volta com consequência escrita (`operacoesSemVolta.ts`), "próximo passo"
  depois de converter/salvar, fila do Início levando à tela certa já filtrada, modo privado em todo o app.

## Veredito por critério

- Descoberta das funções: **OK** (Início e "próximo passo" guiam bem; falta a busca geral — R1)
- Fluxos completos: **ATENÇÃO** (F5/voltar e fechar sem salvar quebram o fluxo — C1, C2)
- Recuperação de erro: **ATENÇÃO** (perda de digitação — C3; erro some/cru — C5; login — C4)
- Retorno ao usuário: **ATENÇÃO** (avisos inconsistentes — R5)
- Consistência: **ATENÇÃO** (janelas, avisos, números)

## Sugestão de ordem

1. C3 + C4 + C5 (pequenos, tiram as perdas mais frequentes)
2. C2 (orçamento é onde há mais trabalho a perder)
3. C1 + R7 (endereço por tela e filtros lembrados)
4. R1, R3, R4 (ganho de tempo)
5. O resto, conforme você marcar.

---

## Estado em 30/10/2026 (ramo `feat/qualidade-de-vida`)

Todos os 18 itens acima foram feitos, testados e verificados na tela. Diferenças em relação ao texto:
- **R2:** linha sem produto ou com quantidade zero entra na lista só quando o salvar já está barrado
  (cliente/itens); sozinha não barra — hoje o app salva essas linhas e mudar isso não foi pedido.
- **R6:** em vez de trocar os 65 campos de número, a rodinha do mouse tira o foco do campo (a página
  rola e o número fica). A vírgula já funciona no Chrome em português.
- **R8:** janela de 7 a 60 dias. Rascunho mais velho é abandonado, não parado (eram 52 no dump).
- **N2:** N abre o "novo" em Orçamentos, Contas e Estoque; Ctrl+S salva conta nova e tecido.

### Segunda passada (achados novos, já feitos)

- [x] **S1.** O Modal compartilhado (cadastro de cliente, produto, fornecedor…), o cadastro rápido de dentro
  do orçamento, Registrar atraso e Usar do estoque também perdiam o digitado no X/Esc/clique fora. Agora
  perguntam, como os de C3.
- [x] **S2.** Excluir linha da tabela de personalização e lançamento do histórico de personalização apagavam
  de vez com um clique. Agora confirmam (registro de operações sem volta).
- [x] **S3.** Sessão que acabava sozinha (saiu em outra aba, token vencido) deixava a tela aberta com tudo
  falhando. Agora volta ao login com aviso e, ao entrar, retoma a mesma tela.
- [x] **S4.** Um atalho novo (N no Estoque) quebrava a tela por estar depois de um `return` — achado ao
  percorrer as 25 telas e corrigido antes de qualquer push. As 25 telas abrem.

# 🧪 Bateria de Testes Manuais — Botezini ERP

> Marque `[x]` conforme for testando. Anote bugs na seção **Notas** no fim.
> Legenda: **Ação** = o que fazer · **Esperado** = o que deve acontecer.

---

## 0. Pré-requisitos (antes de tudo)

### 0.1 Aplicar os SQLs pendentes (SQL Editor do Supabase, nesta ordem)
- [ ] `supabase/finance_phase7c_corrections.sql` (presets de filtro no banco)
- [ ] `supabase/finance_phase5_plan_editing.sql` (revisar plano)
- [ ] `supabase/finance_phase6_cash_envelopes.sql` (caixinhas)
- [ ] `supabase/finance_phase7_payment_staging.sql` (pré-lançado + planned_method)
- [ ] `supabase/finance_phase8_envelopes_pro.sql` (caixinhas pro + provisionar)
- [ ] *(opcional)* `supabase/finance_phase9_drop_financial_categories.sql` (derrubar tabela legada vazia)

### 0.2 Rodar os testes automatizados
- [ ] `cd tests && python -m pytest -v` → **deve dar 47 passed** (menos skips de `QA_FACTORY_*` / `QA_BANK_ACCOUNT_ID` se não configurados)

### 0.3 Login
- [ ] **Ação:** entrar com admin/manager. **Esperado:** vê todos os menus laterais.
- [ ] **Ação:** entrar com usuário `factory` (se tiver). **Esperado:** vê **só** a Produção.

---

## 1. Smoke test rápido (5 min — passa em tudo sem erro)
- [ ] Abrir cada aba do menu (Dashboard, Financeiro, Recebíveis, Caixinhas, Orçamentos, Pedidos, Produção, Estoque, Cadastros) sem erro/tela branca.
- [ ] Abrir o console do navegador (F12) e confirmar **zero erros vermelhos** ao navegar.

---

## 2. Cadastros — Categorias unificadas ⭐ (mexemos muito)

### 2.1 Um único campo de categoria (era dois)
- [ ] **Ação:** Cadastros → Clientes → Novo/Editar. Olhar o campo **Categoria**.
- [ ] **Esperado:** UM dropdown de categoria + UM botão `+` ao lado. **Não** deve ter dois campos, nem engrenagem + lápis fazendo a mesma coisa.
- [ ] **Ação:** repetir em Fornecedores e Produtos.
- [ ] **Esperado:** mesmo padrão (dropdown único + `+`).

### 2.2 Criar categoria (com hover explicativo)
- [ ] **Ação:** clicar no `+` ao lado da categoria → abre "Categorias Unificadas".
- [ ] **Ação:** passar o mouse no **ℹ️** ao lado do título.
- [ ] **Esperado:** aparece explicação de Pai × Filha, **por cima de tudo, sem cortar** e sem criar barra de rolagem.
- [ ] **Ação:** criar uma categoria **Pai** (ex.: "Segmento") e depois uma **Filha** dela (ex.: "Atacado").
- [ ] **Esperado:** a filha aparece na lista com o `↳` indicando hierarquia.

### 2.3 Categoria grava e sincroniza
- [ ] **Ação:** escolher a categoria criada, salvar o cliente, reabrir.
- [ ] **Esperado:** a categoria continua selecionada.
- [ ] **Ação (hover legado):** no form de cliente, passar o mouse no **ℹ️** do rótulo "Categoria".
- [ ] **Esperado:** tooltip "Categorização para o CRM…" **por cima de tudo, sem cortar** (era esse que estava bugado).

---

## 3. Cadastros — Produtos e Ficha Técnica ⭐

### 3.1 Ficha técnica (BOM) do produto
- [ ] **Ação:** Cadastros → Produtos → editar um produto → seção **Ficha Técnica**.
- [ ] **Ação:** adicionar um insumo (dropdown de insumo é o `SearchableSelect` com busca) + quantidade por peça → salvar.
- [ ] **Esperado:** o insumo aparece listado na ficha.

### 3.2 Dropdowns padronizados nos forms de dados
- [ ] **Esperado:** nos forms de Cliente (Condição de Pagamento), Fornecedor (Centro de Custo), Produto (Tecido da calculadora) e Ficha Técnica (Insumo) — todos os dropdowns têm a **mesma cara** (busca, fundo escuro, seta âmbar). Nenhum `<select>` "nativo" feio do navegador.

---

## 4. Quick Create (criação rápida no orçamento) ⭐

### 4.1 Validação
- [ ] **Ação:** em Orçamentos → Novo → adicionar item → botão `+` de novo produto → tentar salvar **sem nome**.
- [ ] **Esperado:** mostra erro "Informe o nome" e **não** salva.

### 4.2 Produto sem preço duplicado
- [ ] **Esperado:** no Novo Produto Rápido existe **um só** campo de preço (não dois "Preço Base" + "Preço Venda").

### 4.3 Ficha técnica semi-preenchida
- [ ] **Ação:** no Novo Produto Rápido, na seção **"Ficha técnica (opcional)"**, escolher um **tecido principal** + m/peça → salvar.
- [ ] **Esperado:** produto criado. Ao editá-lo em Cadastros → Produtos, a ficha técnica já tem essa 1ª linha (o tecido).

### 4.4 Categoria no quick create grava texto
- [ ] **Ação:** criar cliente pelo quick create escolhendo uma "Categoria CRM".
- [ ] **Esperado:** ao ver o cliente na lista/orçamento/PDF, a categoria aparece (não fica em branco).

---

## 5. Orçamentos ⭐ (pagamento reformulado)

### 5.1 Tecido puxado da ficha técnica
- [ ] **Ação:** novo orçamento → adicionar item → selecionar um produto **que tem tecido na ficha técnica**.
- [ ] **Esperado:** o campo **Tecido** da linha é **preenchido sozinho** com o tecido da ficha.
- [ ] **Ação:** trocar o tecido manualmente e depois trocar o produto por outro que também tem ficha.
- [ ] **Esperado:** se você já tinha escolhido um tecido manual, ele **não** é sobrescrito (só preenche quando está vazio).

### 5.2 Entrada saiu da barra inferior
- [ ] **Esperado:** na barra inferior do editor **não** existe mais o campo "Entrada Mínima %". Só Prazo de Entrega e Desconto.

### 5.3 Plano de pagamento (default PIX + 50%)
- [ ] **Ação:** clicar em **Plano de Pagamento**.
- [ ] **Esperado:** o modal abre por cima do editor (não some/trava) já com **Entrada 50% + Saldo 50%** e meio **PIX** pré-selecionado.
- [ ] **Ação:** trocar a Condição para "30/60/90".
- [ ] **Esperado:** vira 3 parcelas; dropdowns de condição e de meio têm a estética do app.
- [ ] **Ação:** ajustar valores/datas livremente e salvar no orçamento.

### 5.4 PDF do orçamento com o plano nas caixas
- [ ] **Ação:** gerar/baixar o PDF do orçamento que tem plano.
- [ ] **Esperado:** o plano aparece **dentro da caixa de pagamento** (1ª parcela destacada em dourado como entrada), **não** jogado solto como texto inline. Sem conflito com "50%".
- [ ] **Ação:** gerar PDF de um orçamento **sem** plano definido.
- [ ] **Esperado:** mostra a divisão simples entrada/entrega antiga (compatibilidade).

### 5.5 Conversão em pedido
- [ ] **Ação:** converter um orçamento **que tem plano**.
- [ ] **Esperado:** aparece uma **confirmação** ("usar o plano de N parcelas?") — **não** reabre o modal de criação. Confirmar → vira pedido.
- [ ] **Ação:** converter um orçamento **sem plano**.
- [ ] **Esperado:** abre o modal de plano para você montar antes de gerar o pedido.

---

## 6. Recebíveis ⭐ (pré-lançado / disparar)

### 6.1 Aba "A disparar"
- [ ] **Ação:** Recebíveis → aba **A disparar**.
- [ ] **Esperado:** lista parcelas **apenas de pedidos Concluídos/Entregues**, com o meio previsto (ex.: PIX/Boleto) e vencimento.
- [ ] **Ação:** num pedido ainda em produção (não entregue), confirmar que a parcela **não** aparece aqui.

### 6.2 Disparar recebimento (data manual)
- [ ] **Ação:** clicar **Disparar** numa parcela → modal.
- [ ] **Esperado:** já vem com valor restante, meio previsto e **data editável** (você escolhe a data real). Dropdowns de conta e meio no padrão do app.
- [ ] **Ação:** confirmar.
- [ ] **Esperado:** o "recebido" do pedido sobe; a parcela sai da lista "A disparar".

### 6.3 Demais abas
- [ ] Entregues não quitados / Adiantamentos / Por cliente / Por meio / Reconciliação — abrir cada uma sem erro.
- [ ] **Ação:** em Entregues/Adiantamentos, botão **Plano** → abre o editor em modo revisão; parcelas **pagas ficam travadas**.

---

## 7. Caixinhas ⭐ (novo módulo)

### 7.1 Visão geral
- [ ] **Esperado:** 3 cartões no topo: **Saldo real** (contas), **Reservado** (caixinhas), **Livre**.
- [ ] **Esperado:** se as caixinhas somarem mais que o saldo real, aparece o alerta vermelho de "livre negativo".

### 7.2 Criar e configurar
- [ ] **Ação:** Nova caixinha → nome, cor, finalidade, meta + prazo, saldo mínimo, **Provisionar % auto**.
- [ ] **Ação:** passar o mouse no **ℹ️** do campo "Provisionar (% auto)".
- [ ] **Esperado:** explica que é a % reservada ao usar o botão Provisionar (ex.: 15% em Impostos).

### 7.3 Alocar / Liberar
- [ ] **Ação:** num cartão, digitar um valor e **Alocar**.
- [ ] **Esperado:** saldo da caixinha sobe, **Livre** cai no mesmo valor.
- [ ] **Ação:** **Liberar** um valor.
- [ ] **Esperado:** volta pro Livre. Tentar liberar mais do que tem → bloqueia.
- [ ] **Ação:** tentar alocar mais do que o **Livre**.
- [ ] **Esperado:** bloqueia (saldo livre insuficiente).

### 7.4 Extrato, Transferência
- [ ] **Ação:** ícone de **histórico** no cartão → ver extrato (Recebido/Retirado com data).
- [ ] **Ação:** ícone de **transferência** → mover valor de uma caixinha para outra.
- [ ] **Esperado:** origem cai, destino sobe; ambos aparecem no extrato.

### 7.5 Provisionar (i explicativo)
- [ ] **Ação:** configurar 1+ caixinhas com % auto (ex.: Impostos 15%, Reserva 10%).
- [ ] **Ação:** botão **Provisionar** → modal.
- [ ] **Ação:** passar o mouse no **ℹ️** do título.
- [ ] **Esperado:** explica "pague-se primeiro", com o aviso de não repetir com a mesma base.
- [ ] **Ação:** digitar um valor-base (ex.: 1000).
- [ ] **Esperado:** a **prévia** mostra quanto cada caixinha vai receber (Impostos R$150, Reserva R$100…) e o total.
- [ ] **Ação:** confirmar.
- [ ] **Esperado:** as caixinhas sobem exatamente como na prévia; Livre cai; aparece no extrato como "Provisionamento automático".
- [ ] **Ação:** botão Provisionar quando **nenhuma** caixinha tem % → deve ficar **desabilitado** com tooltip explicando.

---

## 8. Produção ⭐ (ficha técnica faltando)

### 8.1 Bloqueio explicado
- [ ] **Ação:** ter um pedido com um produto **sem ficha técnica**; tentar **avançar** da coluna inicial (arrastar ou botão avançar).
- [ ] **Esperado:** abre um **modal explicativo** (não um toast cru) dizendo o que é a ficha técnica, por que trava, e **onde criar**. Lista todos os produtos sem ficha.

### 8.2 Deep-link "Criar ficha técnica"
- [ ] **Ação:** clicar **Criar ficha técnica** no modal.
- [ ] **Esperado:** vai direto para Cadastros → **Produtos** com a **edição daquele produto já aberta** (onde está a Ficha Técnica).
- [ ] **Ação:** adicionar o insumo na ficha, salvar, voltar à Produção e avançar de novo.
- [ ] **Esperado:** agora avança (ou mostra o modal de faltas de estoque, se for o caso — que é outro fluxo).

### 8.3 Fluxo normal
- [ ] Avançar um pedido com ficha OK pelas colunas até Entregue.
- [ ] **Esperado:** ao entregar, pede confirmação; o pedido some do quadro ativo.

---

## 9. Financeiro (regressão)

### 9.1 Presets de filtro no banco
- [ ] **Ação:** Financeiro → montar um filtro → salvar como **preset** com um nome.
- [ ] **Ação:** recarregar a página (F5).
- [ ] **Esperado:** o preset **continua salvo** (agora fica no banco, não só no navegador).

### 9.2 Metas sem NaN
- [ ] **Ação:** Cadastros → Financeiro & Metas → apagar o valor de "Meta Receita" (deixar vazio) e salvar.
- [ ] **Esperado:** salva como **0**, não quebra/gera "NaN".

### 9.3 Geral
- [ ] Lançar uma obrigação a pagar/receber, pagar, estornar — sem erro.
- [ ] Dashboard carrega os KPIs sem UUID aparecendo em categorias.

---

## 10. Estoque (regressão)
- [ ] Cadastrar insumo, dar entrada/saída de estoque, ver movimentos.
- [ ] Custo médio atualiza após entrada.

---

## 11. Checagem transversal (em qualquer tela)
- [ ] **Dropdowns:** todos com busca e visual consistente (nada de select nativo do navegador).
- [ ] **Tooltips ℹ️:** todos aparecem por cima de tudo, sem corte e sem barra de rolagem indesejada — testar perto da **borda direita** da tela.
- [ ] **Modais:** abrem centralizados, por cima do conteúdo, com botão X e fecham no clique fora.
- [ ] **Nenhum `window.prompt`/alerta feio do navegador** — tudo em modal próprio (ex.: Provisionar).

---

## 📝 Notas / Bugs encontrados

| # | Tela | O que fiz | O que esperava | O que aconteceu |
|---|------|-----------|----------------|-----------------|
| 1 |      |           |                |                 |
| 2 |      |           |                |                 |
| 3 |      |           |                |                 |

---

### Legenda de prioridade dos ⭐
As seções com ⭐ são as que mexemos recentemente — **teste-as primeiro**. As demais são regressão (garantir que nada quebrou).

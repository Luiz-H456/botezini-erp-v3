# Migração PROD → DEV — passo a passo

Dois projetos Supabase. **ORIGEM** = produção (61 orçamentos, 29 pedidos,
R$ 187.665,54). **DESTINO** = projeto novo, onde já foram semeados produtos,
fichas técnicas, insumos, cartela de cores e setores.

Regra de ouro: **nunca rode nada na origem que não seja `SELECT`.** Todos os
arquivos de exportação são somente leitura.

---

## Etapa 0 — Limpar o destino

| | |
|---|---|
| Onde | **DESTINO** |
| Arquivo | `supabase/migracao_0_limpar_dados_teste.sql` |
| Reversível | Sim, cria tabelas `_bkp_*` |

1. Rode **só o passo 1** do arquivo. Confira dois blocos: o que será apagado e
   o que será preservado. Os seeds (produtos, insumos, cartela, setores) têm
   que aparecer na lista de preservados.
2. Rode o **passo 2** (backup). Ele cria `_bkp_clients`, `_bkp_budgets`, etc.
3. No **passo 3**, troque `v_confirmo := false` para `true` e rode. Se você
   pular o backup, ele aborta de propósito.
4. Rode o **passo 4**. Clientes, orçamentos, pedidos e contas têm que dar 0;
   os seeds têm que continuar com a contagem original.

> Se você já apagou pedidos/orçamentos por fora e sobraram contas fantasma,
> rode antes o `supabase/fix_orfaos_pos_exclusao.sql`. Ele acha e limpa as
> contas que ficaram penduradas sem pedido.

---

## Etapa 1 — Diagnóstico da origem

| | |
|---|---|
| Onde | **ORIGEM** |
| Arquivo | `supabase/migracao_1_diagnostico.sql` |
| Reversível | Não altera nada |

São **três** consultas. Rode as três:

- **A)** contagem de todas as tabelas
- **B)** lista de colunas de `clients`, `budgets`, `orders` — serve para
  detectar deriva de schema entre os dois projetos
- **C)** sanidade (já validada: zero problema)

Guarde o número do **faturamento total** — ele é a prova final lá na etapa 4.

---

## Etapa 2 — Exportar e colar

| | |
|---|---|
| Onde | Rodar na **ORIGEM**, colar no **DESTINO** |
| Arquivo | `supabase/migracao_2_exportar.sql` |

São **sete** consultas separadas. Cada uma devolve uma coluna onde cada linha
já é um `INSERT` pronto: selecione a coluna inteira, copie, cole no destino,
execute. Depois volte e faça a próxima.

**A ordem não é negociável** — é a ordem das chaves estrangeiras:

| # | Consulta | Por que nesta posição |
|---|---|---|
| 1 | 2.1 clientes | Pedido e orçamento apontam para cliente |
| 2 | 2.2 fornecedores | Independente, mas vem antes de insumo |
| 3 | 2.3 produtos | Os itens do pedido guardam `product_id` |
| 4 | 2.3b **insumos** | Os itens guardam `fabric_insumo_id` — sem isto o tecido do histórico quebra |
| 5 | 2.3c fichas técnicas | Depende de produto + insumo |
| 6 | 2.4 orçamentos | Depende de cliente |
| 7 | 2.5 pedidos | Depende de cliente e orçamento |

Se colar fora de ordem, o Postgres recusa com erro de chave estrangeira e
**nada é gravado** — não corrompe, só falha. Aí é recomeçar na ordem.

---

## Etapa 3 — Gerar as contas a receber

| | |
|---|---|
| Onde | **DESTINO** |
| Arquivo | `supabase/migracao_3_contas_a_receber.sql` |

1. Rode **só o 3.1** (conferência). Ele lista pedido, cliente, entrega, total,
   entrada e restante — apenas dos pedidos ainda em aberto.
2. Confira a lista. Se fizer sentido, rode o **3.2** para gravar.
3. Rode o **3.3** para ver o total gerado.

Regra aplicada: conta só para pedido `Pendente` ou `Em Produção`. Pedido
`Concluído`/`Entregue` entra como histórico, sem conta — foi o que você
decidiu, e é o que evita o financeiro nascer com dívida fantasma.

> **A entrada normalmente já foi paga.** Dê baixa nela **pelo app**, nunca por
> SQL: é a RPC `pay_obligation` que atualiza o saldo do banco. `INSERT` direto
> em `obligation_payments` registra o pagamento mas deixa o saldo errado.

---

## Etapa 4 — Conferir

| | |
|---|---|
| Onde | **DESTINO** |
| Arquivo | `supabase/migracao_4_conferencia.sql` |

- **A)** contagens + faturamento. O faturamento tem que bater **exatamente**
  com o da etapa 1. É a prova de que nada se perdeu.
- **B)** pedido órfão → tem que voltar vazio
- **C)** pedido apontando orçamento ausente
- **D)** produtos duplicados (catálogo semeado × os da produção)
- **E)** produtos sem ficha técnica → é a lista de trabalho da reconciliação
- **F)** o que o PCP vai enxergar

---

## Etapa 5 — Reconciliar (depois, sem pressa)

A migração termina funcionando na etapa 4. O que sobra é convivência de dados:

1. **Produtos duplicados.** O destino tem os 24 do catálogo novo e agora
   recebeu os da produção. Decida quais manter. Não fundi automaticamente:
   trocar identidade de produto errado bagunça ficha técnica e histórico.
2. **Insumos duplicados.** Os 14 tecidos da produção vieram junto com os 15
   semeados por faixa de cor. Sugestão: histórico mantém o tecido antigo
   (é o que foi realmente usado); orçamento novo usa o tecido novo, com faixa
   de cor e a referência Cedro.
3. **`DRY` está duplicado já na origem** — dois ids diferentes para o mesmo
   tecido. Vale unificar antes de tudo, na produção.
4. **Custo dos tecidos.** Os 15 semeados estão zerados. Enquanto estiverem,
   Lista de Compras e CMV fecham em R$ 0,00.

---

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| Erro de chave estrangeira ao colar | Colou fora de ordem. Volte para a 2.1 e siga a tabela |
| Faturamento não bate na etapa 4 | Alguma consulta da etapa 2 não foi colada por inteiro. Repita a 2.5 |
| Recebível fantasma, vencido, sem cliente | `fix_orfaos_pos_exclusao.sql` |
| Quero desfazer a limpeza do destino | Passo 5 do `migracao_0`, restaura das `_bkp_*` |
| Saldo bancário errado | Nenhum script mexe em saldo. `UPDATE bank_accounts SET current_balance = <real>` |

Só apague as tabelas `_bkp_*` quando a etapa 4 estiver validada.

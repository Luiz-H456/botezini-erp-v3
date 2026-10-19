# Finance UI — Iteração 1: Mapeamento e Primeira Melhoria Incremental

> Branch: `refactor/finance-minimal-ui-iteration-1`  
> Princípio: uma melhoria pequena, isolada, reversível.

---

## 1. MÓDULOS DO SISTEMA (FOCO UI/UX)

### 1.1 KPI Bar — Cards de Decisão
**Faz hoje:** 4 cards no topo: Saldo Projetado, Vence em 7d, Em Atraso, Fluxo Líquido.  
**Arquivos:** `Finance.tsx:417–516`  
**Problemas:**
- Os dois cards clicáveis (semana, atrasados) não têm separação visual clara dos não-clicáveis
- O label "VENCE EM 7D" usa `in7Str` calculado no hook, mas o KPI "HOJE" não existe como card separado — está escondido como filtro no Smart Filter bar
- O card "Fluxo Líquido" mistura dados DB (via `cashPos`) com dados calculados cliente; risco de inconsistência
- "Saldo Projetado" renderiza `projectedBalance` (DB), mas a legenda sempre mostra `totalBalance >= 0` para a cor — isto pode criar divergência visual

**O que pode melhorar sem tocar arquitetura:**
- Adicionar `daysUntilDue` derivado na `ObligationCard` para mostrar "vence em X dias" em vez de só a data bruta
- Urgency label human-readable embaixo da data

### 1.2 Barra de Filtro (SmartFilter + Period + Type)
**Faz hoje:** Barra horizontal scrollável com 5 controles: Filtros, Período+Nav, Tipo, SmartFilter Pills, Busca, ViewMode, Toggle.  
**Arquivos:** `Finance.tsx:626–714`  
**Problemas:**
- Os smart filter pills ficam escondidos em telas menores (sem indicação visual que existe scroll horizontal)
- "Overdue" e "Week" existem nos KPI cards (clicáveis) e também nas pills — duplicação de acesso visual sem hierarquia clara

### 1.3 ObligationCard
**Faz hoje:** Card com: Avatar da parte + Descrição + Status badge + Barra de progresso (se parcial) + Rodapé com data/categoria/valor/ações hover.  
**Arquivos:** `FinanceComponents.tsx:311–467`  
**Problemas:**
- A **data de vencimento é exibida como string ISO truncada** (`formatDate(ob.due_date).substring(0, 5)`) — mostra só `DD/MM`, sem o ano e sem contexto relativo. Para um atrasado de 3 meses atrás, não há diferença visual entre esse e um atrasado de ontem
- Botão "Pagar" só aparece no hover — invisível em mobile
- Para obrigações `overdue`, há glow rosa + borda, mas nenhuma informação de **quantos dias de atraso**
- Para obrigações `week`, nenhum indicador de urgência além da borda `amber`

### 1.4 Colunas Receber/Pagar
**Faz hoje:** Duas colunas com título + total + lista de cards.  
**Arquivos:** `Finance.tsx:900–1050` (seção `viewMode === 'columns'`)  
**Problemas:**
- O total da coluna some quando filtros são aplicados (usa `receivableList` que já está filtrado, mas o header não indica isso claramente)
- Não há indicação visual de quantos itens estão ocultos pelo filtro

### 1.5 Timeline View
**Faz hoje:** Grupos: Atrasados / Vence Hoje / Esta Semana / Este Mês / Futuro.  
**Arquivos:** `FinanceComponents.tsx:766–787` (`groupByTimeline`)  
**Problemas:** Sem problema crítico de UI. A lógica é cliente-side mas correta para uso.

### 1.6 Sidebar (Contas Bancárias + CashflowChart + CashSimulator)
**Faz hoje:** Painel direito fixo 240px com cashflow 7 dias, simluador e lista de contas.  
**Arquivos:** `Finance.tsx:1050–1200` (right column)  
**Problemas:** Sem impacto na iteração 1.

---

## 2. FLUXOS PRINCIPAIS (COMO FUNCIONAM HOJE — SEM SUGESTÕES)

### Pedido → Obrigação Financeira
1. Usuário salva pedido com status `Concluído` ou `Entregue`
2. `orderRepository.saveOrder()` detecta o status
3. Chama `SELECT financial_obligations WHERE notes = order.id`
4. Se não existe: chama RPC `create_recurrence_obligations` com os dados do pedido
5. RPC insere em `financial_obligations` com `notes = order.id` (acoplamento por string)
6. Erros causam tentativa de rollback manual (não-atômica): se falhar, pedido pode ficar sem obrigação

### Pagamento
1. Usuário clica "Pagar" no card → `handleOpenPay()` busca `getObligationPayments(ob.id)`
2. Abre `PaymentModal` com histórico de pagamentos
3. Usuário preenche valor + conta + método
4. `usePaymentModal.handleSubmit()` → `financeRepository.payObligation()` → RPC `pay_obligation`
5. RPC: INSERT em `obligation_payments` + UPDATE `bank_accounts.current_balance` (atômico)
6. Sucesso: fecha modal + `loadData()` recarrega tudo

### Conciliação
1. Card com `remaining <= 0` exibe botão Conciliar (hover-only)
2. Clique → `handleReconcile()` → `storageService.toggleReconciliation(ob.id)` → RPC `toggle_reconciliation`
3. `is_reconciled = true`. Card mostra ícone verde de shield
4. Para desfazer: botão amarelo de alerta → modal com campo de texto obrigatório
5. `undoReconciliation(id, reason)` → RPC `undo_reconciliation` → `is_reconciled = false`, `unreconciled_reason = reason`

---

## 3. PONTOS DE FRAGILIDADE (CONFORME RAIO-X)

| ID | Problema | Localização | Severidade |
|----|----------|-------------|------------|
| C1 | FK pedido-obrigação via campo `notes` | `orderRepository.ts:111,123` | 🔴 Crítico |
| C2 | Rollback não-atômico ao criar pedido+obrigação | `orderRepository.ts:105-131` | 🔴 Crítico |
| C3 | Tabelas legadas (transactions, invoices) expostas no facade | `storage.ts:107-139` | 🔴 Crítico |
| C4 | `financialService.ts` é código morto V1 | `financialService.ts` inteiro | 🔴 Crítico |
| C5 | KPIs calculados cliente-side com lógica divergente do banco | `useFinanceFilters.ts:140-154` | 🔴 Crítico |
| H1 | Finance.tsx God Component (40+ estados, 1281 linhas) | `Finance.tsx` | 🟠 Alto |
| H2 | Lógica de negócio em arquivo de UI | `FinanceComponents.tsx:742-787` | 🟠 Alto |
| H3 | Margem de lucro fictícia (40% hardcode) | `utils/finance.ts:56-58` | 🟠 Alto |
| H4 | Loop não-atômico para parcelamento | `useObligationForm.ts:130-168` | 🟠 Alto |
| M1 | 4 RPCs paralelas em cada mudança de filtro | `Finance.tsx:147-161` | 🟡 Médio |
| M2 | Sem paginação (LIMIT 5000) | `financeRepository.ts:497` | 🟡 Médio |

---

## 4. LIMITES DO SISTEMA

### NÃO pode ser alterado nesta iteração:
- Qualquer tabela, coluna, FK ou migration no banco
- Assinatura de RPCs (pay_obligation, create_recurrence_obligations, etc.)
- Contratos de tipos em `types/index.ts` e `types/finance.ts`
- `financeRepository.ts` (camada de dados)
- `storage.ts` (facade)
- `useFinanceData.ts` (fetch layer)
- `useFinanceFilters.ts` (lógica de filtro — não nesta iteração)

### Depende do banco (NÃO tocar):
- `ObligationSummary.derived_status` — calculado pela VIEW
- `ObligationSummary.paid_amount`, `remaining_amount`, `paid_pct` — calculados pela VIEW
- `cashPos`, `agingRows`, `cashflowSeries`, `liquidityKPIs` — todos de RPCs

### Acoplamentos que impedem mudanças cascade:
- `ObligationCard` recebe `ob: ObligationSummary` completo — props bem definidas
- `FinanceComponents.tsx` exporta `SmartFilter`, `applySmartFilter`, `groupByTimeline` usados em `useFinanceFilters.ts` — não reorganizar sem ajustar o hook

---

## 5. ALTERAÇÃO EXECUTADA — ITERAÇÃO 1

### Problema escolhido
**ObligationCard não comunica urgência temporal em linguagem humana.**

Situação atual: a data de vencimento aparece como `DD/MM` apenas. Para uma obrigação atrasada, não há diferença visual entre uma atrasada há 1 dia e uma atrasada há 60 dias. Para uma que vence em breve, o usuário precisa subtrair datas mentalmente.

### O que foi mudado
**Arquivo:** `src/pages/FinanceComponents.tsx`

Adicionado na `ObligationCard`, no bloco da data de vencimento:
- Um label relativo human-readable calculado a partir de `ob.due_date` e `today`
- Para **overdue**: mostra `"Venceu há X dias"` com texto rose
- Para **due today**: mostra `"HOJE"` com destaque amber
- Para **due in 1–7 days**: mostra `"em X dia(s)"` com cor yellow
- Para outros: mantém a data `DD/MM` como estava

**Escopo:** somente o trecho do date badge no rodapé do card (linhas 408–411 de FinanceComponents.tsx). Sem alteração de props, contratos, hooks ou backend.

---

## 6. PATCH DE CÓDIGO

```tsx
// ANTES — Finance.tsx:408–411
<div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${isOverdue ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : isDueToday ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
    <Calendar size={12} />
    <span>{isOverdue ? 'Venceu ' : isDueToday ? 'Hoje' : formatDate(ob.due_date).substring(0, 5)}</span>
</div>

// DEPOIS — com label relativo humanizado
<div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${isOverdue ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : isDueToday ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : isDueSoon ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-zinc-950 border-zinc-800 text-zinc-500'}`}>
    <Calendar size={12} />
    <span>{relativeDueLabel}</span>
</div>
```

---

## 7. GARANTIA DE SEGURANÇA

- **Não quebra o sistema:** A mudança é puramente cosmética/derivada. `relativeDueLabel` e `isDueSoon` são calculados localmente dentro do componente usando `ob.due_date` e `today` (já presentes). Nenhum dado externo é lido ou escrito.
- **Não altera comportamento:** A lógica de negócio (filtros, KPIs, pagamentos) não é tocada. O badge de data é apenas display.
- **Não afeta outros módulos:** `ObligationCard` não é exportado para fora de `FinanceComponents.tsx` exceto para `Finance.tsx`. A interface (props) não muda.
- **Reversível em 1 commit:** Basta reverter o trecho do badge.

---

## 8. O QUE FOI IGNORADO NESTA ITERAÇÃO

| Problema | Motivo de não tratar agora |
|----------|---------------------------|
| C1 — FK via `notes` | Requer migration no banco |
| C2 — rollback não-atômico | Requer nova DB function |
| C3/C4 — código morto V1 | Impacto em múltiplos arquivos; risco de quebrar chamadas residuais não mapeadas |
| C5 — KPIs divergentes | Requer mudança em `useFinanceFilters.ts` + análise do contrato com o banco |
| H1 — God Component | Decomposição grande; iteração própria |
| H2 — lógica em arquivo UI | Requer reorganizar exports usados pelo hook; risco de break |
| H3 — margem fictícia | Depende de dados de produção para real cost |
| H4 — parcelamento não-atômico | Requer nova RPC no banco |
| M1 — 4 RPCs por filtro | Trade-off aceitável para o volume atual |
| Paginação (M2) | Não há UI de paginação no momento; mudança grande |

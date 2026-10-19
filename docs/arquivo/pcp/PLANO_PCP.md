# 📋 Plano & Validação — Módulo PCP (Planejamento e Controle da Produção)

> Documento de **planejamento**, seguindo o Blueprint de Engenharia (`docs/arquitetura/BLUEPRINT.html`).
> Nada de código ainda — este é o passo "planejar antes de construir" do §3.2.
> Escopo recebido: 17 áreas funcionais, ~130 features.

---

## 1. Veredito de viabilidade (validação honesta)

O escopo é **coeso e faz sentido** para uma confecção — é um PCP de verdade. Mas três verdades precisam ficar claras antes de começar:

| Classificação | O quê | Observação |
|---|---|---|
| ✅ **Viável já, com o que existe** | Kanban, agrupamento inteligente, controle parcial, prioridades, indicadores básicos, relatórios | Os dados de agrupamento (tecido, cor, tipo, bordado, silk) **já existem** nos itens/customizações |
| 🟡 **Viável, mas exige fundação nova** | Dashboard PCP, gestão de capacidade, cronograma, planejamento automático, simulador, alertas | Dependem de um **modelo de capacidade** que hoje não existe (setores/máquinas/operadores/turnos/feriados) |
| 🔴 **Precisa de expectativa realista** | "Motor Inteligente", "prever atrasos", "sugestões automáticas de planejamento" | **Não é IA/ML.** É um **motor de heurísticas determinístico** (greedy + balanceamento + agrupamento por setup). Isso é *melhor* para fábrica: explicável e auditável. Vender como "IA que prevê" gera frustração. |

**Conclusão:** aprovado para construir **em fases**. Tentar entregar as 17 áreas de uma vez é 6–12 meses e quebra o princípio de entregar valor incremental. O caminho é: **fundação de capacidade → motor → visualizações → refinamentos**.

---

## 2. O que já existe (reaproveitar, não reinventar)

| Recurso atual | Uso no PCP |
|---|---|
| `orders` + `production_stage` + `deadline` | Base do cronograma e do Kanban |
| `ProductionStage` (6 estágios) | Estágios do Kanban — **mas o PCP pede 8** (ver §3) |
| `productionRepository` + `useProduction` | Kanban atual, checagem de BOM e faltas de estoque |
| `BudgetItem`: `fabric_insumo_id`, `color`, `product_id`, `size`, `sleeve_type`, `has_band`, `gender`, `fit` | **Agrupamento** por tecido/cor/tipo/manga |
| `BudgetCustomization`: `type` (Embroidery=bordado, ScreenPrint=silk, DTF), `position` | **Agrupamento** por bordado/silk |
| `product_insumos` (ficha técnica/BOM) | Consumo de material (Compras Integradas) + Engenharia |
| `products.pieces_daily_capacity`, `fabric_consumption_m` | Semente de tempo/capacidade por produto |
| `cost_centers` (type=production) | Pode virar a base de **setores** |
| `FichaTecnicaMissingModal` + deep-link | Já cobre "ficha técnica integrada" parcialmente |
| `SearchableSelect`, `InfoTooltip`, `ConfirmDialog`, `createPortal` | Blocos de UI padrão do app |

**Não existe** (é tudo net-new): capacidade (semanal/diária/setor/máquina/operador), turnos, feriados, cronograma/agenda, sequenciamento, logs de produção parcial, motor de planejamento, simulador.

---

## 3. Conflitos e decisões de negócio

### D1 — Modelo de estágios ⏳ EM ABERTO (você vai revisar)
Hoje: `WAITING · CUTTING · CUSTOMIZATION · SEWING · FINISHING · LOGISTICS` (6).
PCP pede: `Aguardando · Corte · Bordado · Costura · Acabamento · Conferência · Expedição · Finalizado` (8).
**Opções:** migrar o enum (afeta pedidos existentes) **ou** estágios **configuráveis** por tabela.
→ **Recomendação:** tabela `production_sectors` com os 6 atuais como seed migrável — flexível, sem travar a fábrica num enum.
→ **Status:** aguardando sua definição / modificações.

### D2 — PCP absorve a Produção atual ✅ DECIDIDO
O PCP **é** a nova Produção. A aba atual vira a visão "Kanban" dentro do PCP. Sem Kanban duplicado.

### D3 — Granularidade de capacidade no MVP ✅ DECIDIDO
**Fábrica + setor** no MVP. Máquina/operador ficam para a Fase 3.

### D4 — Unidade de capacidade ✅ DECIDIDO (revisado)
**Capacidade SEMANAL em peças** (não diária). Base atual ≈ **350 peças/semana**, mas **varia por tipo de peça**.
- `capacity_config.weekly_capacity_pieces` (default 350, configurável).
- Cada produto já traz `pieces_daily_capacity` (produção média diária) → usado para ponderar quanto cada tipo de peça "custa" de capacidade.
- Tempo por operação (minutos) só na Engenharia (Fase 3).

### D5 — "Tempo real" ✅ DECIDIDO
**Polling** (React Query) no MVP. Realtime só se houver muitos operadores lançando simultaneamente.

---

## 4. Arquitetura proposta (aderente ao Blueprint §2)

```
  Páginas PCP            src/pages/PCP.tsx  +  components/pcp/*
        ↓ hooks
  usePCP*                src/hooks/pcp/  (usePcpBoard, usePcpCapacity, usePcpSchedule, usePcpSimulator)
        ↓ storageService
  facade                 storage.ts  (novos métodos pcp*)
        ↓ repositório
  pcpRepository          src/repositories/pcpRepository.ts
        ↓ RPCs + tabelas
  Postgres               tabelas de capacidade/agenda/logs + RPCs do motor
```

**Aderência a invariantes (Blueprint §1):**
- **Capacidade/ocupação = derivada** (view/RPC), como `obligation_summary` — nunca uma coluna "ocupação_atual" que desincroniza.
- **Baixa de produção = RPC atômica** com log imutável (`production_logs`) — nunca UPDATE direto de saldo. Igual ao padrão de `obligation_payments`.
- **Recalcular cronograma = RPC transacional idempotente** — rodar 2× dá o mesmo resultado.
- **Motor = função determinística** — mesma entrada, mesma saída (testável, auditável).
- **Segurança:** `factory` vê o Kanban/lançamentos, **não** vê faturamento/prioridade-por-cliente. RLS + navegação (§6).

---

## 5. Modelo de dados (novas tabelas)

> Todas com RLS single-tenant + grants (Blueprint §6). `IF NOT EXISTS`, idempotente.

**Fundação (MVP)**
- `production_sectors` — setores/estágios configuráveis: `id, name, sort_order, daily_capacity_pieces, color, is_active`. (Substitui o enum fixo — D1)
- `capacity_config` — parâmetros globais: `working_days jsonb, holidays date[], shifts jsonb, overtime_enabled bool`.
- `production_schedule` — cronograma: `id, order_id, sector_id, planned_week date, planned_start date, planned_end date, sequence_index int, is_manual_override bool`.
- `production_logs` — baixas parciais (imutável): `id, order_id, sector_id, size, qty_done, qty_expedited, operation, logged_by, logged_at`.

**Fase 2**
- `grouping_config` — prioridade de agrupamento: `jsonb` ordenado (tecido > cor > tipo…).
- `priority_config` — regras de prioridade combináveis: `jsonb` com pesos (prazo, urgência, cliente, faturamento…).

**Fase 3**
- `machines` — `id, sector_id, name, capacity, setup_time_min`.
- `operators` — `id, sector_id, name, productivity`.
- `operation_sequence` — engenharia: `product_id, operation, sector_id, expected_time_min, machine_id`.

**Derivado (views/RPC, nunca coluna):**
- `pcp_capacity_load` (view) — ocupação % por setor/semana = Σ pedidos planejados ÷ capacidade.
- Campos de agrupamento **não são armazenados** — resolvidos dos itens/customizações em tempo de cálculo.

---

## 6. Motor de planejamento (o "inteligente", sem marketing)

Uma RPC/serviço determinístico, em 4 passos explicáveis:

1. **Priorizar** — ordena pedidos abertos por score combinado (`priority_config`): prazo, urgência, cliente, faturamento, quantidade, tempo de produção.
2. **Agrupar** — agrupa por similaridade de setup (`grouping_config`: tecido → cor → tipo → bordado…) para minimizar trocas de regulagem.
3. **Distribuir** — empacota nos slots semana×setor respeitando `daily_capacity_pieces` (bin-packing greedy), balanceando carga entre semanas.
4. **Sequenciar** — dentro da semana, ordena para minimizar trocas; calcula tempo perdido em setup e economia do agrupamento.

**Saídas:** `production_schedule` preenchido + métricas (ocupação, gargalo, trocas evitadas, atrasos previstos = pedidos cujo `planned_end > deadline`).

**"Prever atrasos"** = comparar `planned_end` com `deadline` após distribuir. **"Detectar gargalos"** = setor com ocupação > 100%. **"Sugestões"** = "mova X para semana N" quando um setor estoura. Tudo aritmética explicável, não caixa-preta.

**Recalcular ao inserir/alterar/cancelar pedido:** a mesma RPC roda de novo (idempotente), preservando `is_manual_override = true` (o que você arrastou na mão não é sobrescrito — igual ao "preserva parcela paga" do revise_order_plan).

---

## 7. Faseamento recomendado + CHECKLIST

### 🟢 Fase 1 — Fundação + Lista de Compras + Kanban evoluído (MVP)

**1A — Lista de Compras semanal** ✅ IMPLEMENTADA (zero schema novo)
Usa dados existentes: itens dos pedidos abertos × ficha técnica (BOM) → consumo de tecido/linha/aviamentos → vs estoque → lista de compras + custo estimado. Exportável em PDF. Atende "Compras Integradas" + "Relatório semanal".
- [x] `utils/purchaseList.ts` — função pura: agrega consumo por insumo (BOM × qtd), calcula falta e custo, com override de tecido escolhido no item
- [x] `hooks/pcp/usePurchaseList.ts` — carrega pedidos ativos + insumos + BOMs, filtro (todos em aberto / esta semana / próxima)
- [x] `components/pcp/PurchaseListPanel.tsx` — tabela + KPIs + aviso de produtos sem ficha
- [x] PDF da lista de compras (`pdfService.generatePurchaseListPDF`)
- [x] `pages/PCP.tsx` + nav (ícone CalendarClock) + rota + label do header
- [x] **teste da função pura — 4/4 passam** (`purchaseList.test.ts`): agregação, soma multi-pedido, override de tecido, produto sem ficha ignorado

**1B — Fundação de capacidade + setores** ✅ IMPLEMENTADA (D1 = configurável)
- [x] `pcp_phase1_capacity_sectors.sql`: `production_sectors` (semanal) + `capacity_config` + RLS/grants + **seed dos 6 estágios atuais**
- [x] `pcpRepository` (setores + config) + facade
- [x] `utils/pcpCapacity.ts` (ocupação derivada) — **3/3 testes**
- [x] `hooks/pcp/usePcpCapacity.ts`
- [x] `CapacityPanel`: ocupação por setor (barras + sobrecarga/ocioso) + CRUD de setores + config global

**1C — Controle parcial** ✅ IMPLEMENTADA
- [x] `pcp_phase1c_production_logs.sql`: `production_logs` (imutável) + RPC `log_production` atômica (acessível ao `factory`) + RLS
- [x] `utils/pcpProduction.ts` (saldo derivado, nunca negativo) — **3/3 testes**
- [x] `hooks/pcp/usePcpProduction.ts` + repo/facade
- [x] `ProductionControlPanel`: baixa por tamanho/peça/operação/setor + saldo restante + barra de progresso
- [ ] agrupamento inteligente (leitura) — adiado para o início da Fase 2 (é insumo do sequenciamento)
→ *Fase 1 entrega valor: lista de compras real + capacidade configurável + baixa parcial. **10/10 testes**.*

### 🟡 Fase 2 — Motor + Cronograma + Dashboard ✅ NÚCLEO IMPLEMENTADO
- [x] **Dashboard PCP** ([DashboardPanel]) — ocupação da fábrica, gargalo, atrasados, próximos do vencimento, carga por setor. Derivado ([pcpDashboard.ts], 3/3 testes).
- [x] **Motor de planejamento** ([pcpScheduler.ts], 4/4 testes) — decisões aplicadas: prioriza por **prazo** → agrupa por **tecido→cor→tipo** → empacota por capacidade, **empurra excedente** p/ próxima semana. Determinístico e explicável.
- [x] **Cronograma** ([CronogramaPanel]) — visão semanal com sequência por semana, ocupação, atrasos previstos e trocas de regulagem evitadas.
- [ ] Persistir `production_schedule` + drag-and-drop com override manual (hoje o cronograma é recalculado ao vivo, display-only)
- [ ] Alertas dedicados (a base já aparece no Dashboard)
- [ ] Visualizações extras (Gantt/Calendário)

### 🔵 Fase 3 — Refinamento fino
- [x] **Simulador** de novos pedidos ([SimuladorPanel] + `simulateInsertion`, teste incluído) — mede onde o pedido cai, Δ atrasos, Δ semanas e quais pedidos passariam a atrasar. Reusa o motor.
- [x] Empresa + responsável exibidos nas telas (Dashboard, Cronograma, Controle Parcial) — não só o código do pedido.
- [x] **Kanban de Produção** ([KanbanPanel]) — colunas = setores configuráveis; cartões com empresa/responsável/prazo; mover pedido entre setores (← →) persiste o `production_stage`. Bucket p/ estágios órfãos.
- [ ] Máquinas/operadores · Engenharia (tempo previsto×realizado) · Gantt/Timeline · indicadores avançados · histórico/auditoria
- [ ] Absorção total da aba Fábrica (mover checagem de estoque + ficha + entrega p/ o Kanban do PCP e aposentar a Produção antiga)

### 📄 Transversal — Relatórios
Ordem de Produção, Listas (corte/bordado/costura/expedição), cronograma PDF — via `pdfService` existente, incrementalmente por fase.

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Escopo gigante vira projeto infinito | Faseamento rígido; Fase 1 entrega sozinha |
| Motor "mágico" frustra expectativa | Comunicar que é heurística explicável, mostrar o "porquê" de cada sugestão |
| Mudar estágios quebra pedidos atuais | Estágios em tabela + migração dos 6 atuais como seed |
| Capacidade errada = plano irreal | Começar simples (peças/dia por setor) e refinar com dados reais |
| Duplicar a Produção atual | PCP **absorve** a Produção (D2), não coexiste |
| `factory` ver faturamento nas prioridades | RLS: score de prioridade calculado no banco, `factory` recebe só ordem, não os pesos |

---

## 9. Aderência ao Blueprint (checklist do que será exigido em cada PR)

- [ ] Camadas respeitadas: componente → hook → `storageService` → `pcpRepository` → Postgres
- [ ] Capacidade/ocupação **derivada** (view/RPC), nunca coluna
- [ ] Baixa de produção = **RPC atômica** + log imutável
- [ ] Recalc do cronograma **idempotente** + preserva override manual
- [ ] Toda tabela nova: RLS + policy `is_admin_or_manager` + grants
- [ ] `factory` bloqueado de dados financeiros (RLS + navegação)
- [ ] Dropdowns `SearchableSelect`, dicas `InfoTooltip`, modais `createPortal`, confirmações `ConfirmDialog`
- [ ] `parseFloat(...) || 0` em todo input numérico
- [ ] Testes que provam a **regra** (capacidade não estoura; recalc idempotente; baixa parcial fecha saldo)
- [ ] SQL numerado (`pcp_phaseN_*.sql`) e adicionado à ordem do QA

---

## 10. Estado das decisões

| Decisão | Status |
|---|---|
| D2 — PCP absorve a Produção | ✅ decidido |
| D3 — MVP fábrica+setor | ✅ decidido |
| D4 — peças/dia por setor | ✅ decidido |
| D5 — polling no MVP | ✅ decidido |
| **D1 — modelo de estágios** | ⏳ **em revisão sua** (+ modificações gerais ao plano) |

**Próximo passo:** você revisa este plano e traz as modificações. Assim que fecharmos o D1 e seus ajustes, começo a **Fase 1** pelo schema (`production_sectors` + `capacity_config` + `production_logs`), seguindo o §3.2 do blueprint: SQL → repo → facade → hook → UI → teste.

> Nada de código do PCP será escrito até você aprovar o plano com as modificações.

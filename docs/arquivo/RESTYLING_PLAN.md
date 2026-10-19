# Plano de Reestilização Bruta e Melhoria UI/UX

Este plano guia a migração estética de todo o app para o padrão **Botezini Premium (V2)**, focado em alta densidade de informação, design escuro premium e automação.

## Ordem de Prioridade (Sprint 1: Fluxo de Pedidos)

### 1. Orçamentos (Budgets.tsx)
- **Status**: Visual antigo, cores inconsistentes.
- **Ações Brutas**:
  - Trocar `rounded-sm` por `rounded-xl`.
  - Aplicar `CategoryChip` para tipos de produtos.
  - Sidebar de filtros no estilo "Finance" (compacto e persistente).
  - Implementar o `MiniStats` no topo para ver quantos orçamentos foram aprovados na semana.

### 2. Pedidos (Orders.tsx)
- **Status**: Componentes simples, falta hierarquia visual.
- **Ações Brutas**:
  - Unificar o estilo do `OrderCard` com o `ObligationCard` do financeiro.
  - Adicionar indicadores de "Saúde do Pedido" (Financeiro OK? Prazo OK?).
  - Melhorar as ações de linha (Printer, Trash, Link) para usarem `GhostButtons`.

### 3. Fábrica (Production.tsx)
- **Status**: Colunas de Kanban básicas.
- **Ações Brutas**:
  - Modernizar o Kanban: Cards com bordas mais largas, status com cores mais neon/vibrantes sobre o fundo escuro.
  - Modo Fábrica: Maximizar contraste para visualização em tablets/monitores de chão de fábrica.
  - Adicionar progresso visual (ProgressBar) em cada card de produção.

## Melhorias de Features e Recursos (UX)

### Automação de Recebíveis (INTEGRATION_PLAN.md)
- Todo pedido criado gera um recebível.
- **UI**: Exibir o status desse recebível diretamente no card do pedido (Ex: "A Receber - R$ 1.500 [Icon Pagar]").

### Inteligência de Prazo
- Usar o motor de cálculo de datas para sugerir o `deadline` baseado na carga de trabalho atual da fábrica (Capacity Planning).

### Central de Documentos
- Uma aba lateral nos Pedidos para ver Orçamento, NF (referência) e Fotos de Produção em um só lugar.

## Critérios de Aceite (Visual)
- [ ] Nenhum elemento usa `rounded-sm`.
- [ ] Todas as fontes de rótulo usam `uppercase font-black`.
- [ ] O app parece um dashboard de alto nível (Bloomberg/SaaS Premium).
- [ ] Feedback visual em todos os hovers e cliques.

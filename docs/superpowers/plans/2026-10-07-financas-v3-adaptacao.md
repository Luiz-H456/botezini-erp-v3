# Finanças v3 — adaptação da tela atual — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Finanças de hoje (`Finance.tsx`, Recebíveis, Caixinhas) vira a Finanças v3. Ela usa as contas puras da v3, ganha abas no topo e fica mais leve, sem perder nenhuma nuance da seção 3 da spec.

**Architecture:** O esqueleto atual fica e ganha a lógica de `src/utils/financas/*`, que já está testada. `useFinanceFilters` vira uma casca sobre `filtrarContas`/`agruparParaLista`. A seção Finanças da navegação passa a ser desenhada como abas (`AbasDaSecao`) em vez de lateral. Recebíveis e Caixinhas são as mesmas telas, enxugadas. A view `financas` e as páginas de `src/pages/financas/` saem no fim, exceto o Resultado, que muda de lugar.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4 (tema zinc escuro), Supabase/PostgREST, testes `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-07-financas-v3-adaptacao-design.md` (leia as seções 2, 3 e 4 antes de qualquer tarefa de tela)

## Global Constraints

- Pasta: `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`. Nunca tocar na produção nem rodar `supabase link`/`--linked`. **Nenhuma tarefa mexe no banco**: não há SQL neste plano.
- Testes: `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts"`. Tipos: `npx tsc --noEmit`. Os dois limpos ao fim de cada tarefa.
- Os implementadores não sobem dev server. O servidor `botezini-v3` (porta 5175) é do controlador, e a conferência no navegador é dele.
- **Nuance é lei:** nenhuma subfunção da seção 3 da spec pode sumir. Antes de apagar um botão, procure a linha dela na seção 3 e coloque a subfunção no lugar que a tabela manda.
- **Visual (spec seção 4), com as classes exatas:**
  - rótulo: `text-xs text-zinc-500` (letra normal, sem `uppercase`, sem `tracking-*`, sem `font-black`);
  - número grande: `text-3xl font-semibold tabular-nums`;
  - número médio: `text-lg font-semibold tabular-nums`;
  - texto de linha: `text-sm text-zinc-200`;
  - entre seções: `space-y-10` (40px), sem `border-b` separando seções;
  - dentro da seção: `space-y-4` ou `gap-4` (16px);
  - página Contas: `mx-auto w-full max-w-[1400px] grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px]`;
  - botão principal: `h-10 px-4 rounded-lg bg-zinc-100 text-zinc-950 text-sm font-semibold hover:bg-white`;
  - botão secundário: `h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900`;
  - campo: `h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm`;
  - janela: margem interna `p-6`.
- **Cor:**
  - sem `rose-*`/`red-*` nas telas tocadas, exceto erro (`role="alert"`) e ação destrutiva (Cancelar, Estornar, Excluir);
  - vencido é `text-amber-400`;
  - receber/pagar se diferenciam por `+`/`−` e texto; o valor de receber pode ser `text-emerald-400`, o de pagar é `text-zinc-300`.
- Toda janela nova ou tocada abre com `createPortal(…, document.body)`. Arquivo portado sai de `DIVIDA_CONHECIDA` em `src/utils/sobreposicoes.test.ts` (o teste obriga).
- Privacidade: todo valor em R$ passa por `mostrar()` de `useMostrarValor` (`src/hooks/financas/useMostrarValor.ts`) ou pelo `isPrivacy` que a tela já recebe.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Busca vinda de Pedidos** (`onNavigate('finance', 'Pedido #123')`) com o padrão "Agora": a conta precisa aparecer. A busca liga `rapido: 'todas'` (Task 3, teste em `lista.test.ts`).
2. **Clicar num dos quatro números e depois num filtro rápido:** o número desliga, e a lista mostra só o filtro rápido. Recorte e rápido nunca valem juntos (Task 1, `contarFiltrosExtras` não conta recorte; Task 3 zera o recorte no clique).
3. **Conta conferida:** o botão Recebi/Paguei some e o ícone de "desfazer conferência" aparece. Desfazer exige motivo, e o botão fica desabilitado com motivo vazio (Task 4, conferência no navegador; Task 9, roteiro).
4. **Modo privacidade ligado:** nenhum R$ aparece no topo, nos bancos, nos gastos por categoria, nas caixinhas nem em Clientes que devem. Os ganchos de conta ficam iguais, só a tela mascara (roteiro da Task 9).
5. **Celular (390px):**
   - sem rolagem para o lado;
   - Clientes que devem em cartões;
   - os ícones da linha (corrigir, cancelar, conferir) visíveis sem passar o mouse.

   Roteiro da Task 9.

---

## Arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `src/utils/financas/lista.ts` (+ teste) | filtros à vista, filtros do painel, contador do painel | 1 |
| `src/utils/navegacao.ts` (+ teste) | views da seção Finanças, `SECOES_COM_ABAS`, `temAbas` | 2 |
| `src/components/layout/AbasDaSecao.tsx` (novo) | abas no topo de uma seção | 2 |
| `src/components/layout/LateralDaSecao.tsx` | ícones das views | 2 |
| `src/App.tsx` | abas, view `resultado`, `filtrosParaContas` | 2 |
| `src/pages/Resultado.tsx` (novo, vindo de `pages/financas/ResultadoDoMes.tsx`) | aba Resultado | 2, 8 |
| `src/components/common/MenuMais.tsx` (novo) | menu "⋯" com `<details>` nativo | 5 |
| `src/hooks/finance/useFinanceData.ts` | + pagamentos, caixinhas, visão das caixinhas | 3 |
| `src/hooks/finance/useFinanceFilters.ts` | casca sobre `filtrarContas`/`agruparParaLista`/`numerosDaVisaoGeral`/`projecaoDoMes` | 3 |
| `src/pages/Finance.tsx` | topo, filtros, lista, lateral | 3, 4, 5 |
| `src/components/finance/ObligationCard.tsx` | linha nova | 4 |
| `src/components/finance/ReceivablesControlPanel.tsx`, `src/hooks/finance/useReceivablesControl.ts` | Clientes que devem | 6 |
| `src/components/finance/EnvelopesPanel.tsx` | Caixinhas | 7 |
| janelas (`PaymentModal`, `EditarContaModal`, `ObligationForm`, `ConfirmModal`, `ConfirmarLiquidacao`, `BankAccountModal`) + `sobreposicoes.test.ts` | visual e portal | 8 |
| `src/pages/financas/*`, `src/components/financas/JanelaDaConta.tsx`, `src/components/financas/caixinhas/*`, componentes antigos sem uso | apagar | 9 |

---

### Task 1: Filtros à vista e contador do painel

**Files:**
- Modify: `src/utils/financas/lista.ts`
- Test: `src/utils/financas/lista.test.ts`

**Interfaces:**
- Produces:
  - `FILTROS_A_VISTA: FiltroRapido[]` = `['agora', 'abertas', 'vencidas', 'pagas']`;
  - `FILTROS_NO_PAINEL: FiltroRapido[]` = `['hoje', 'semana', 'nao_conferidas', 'canceladas', 'todas']`;
  - `contarFiltrosExtras(f: FiltrosDaLista, emColunas: boolean): number`;
  - `filtrosDaBusca(busca: string): Partial<FiltrosDaLista>`.

- [ ] **Step 1: Escrever os testes que falham.** Acrescente ao fim de `src/utils/financas/lista.test.ts` (o arquivo já importa `test` e `assert`; acrescente os nomes novos ao import de `./lista.ts`):

```ts
import { FILTROS_A_VISTA, FILTROS_NO_PAINEL, contarFiltrosExtras, filtrosDaBusca, FILTROS_VAZIOS, FILTROS_RAPIDOS } from './lista.ts';

test('à vista e no painel cobrem todos os filtros rápidos, sem repetir', () => {
    const todos = [...FILTROS_A_VISTA, ...FILTROS_NO_PAINEL];
    assert.equal(new Set(todos).size, todos.length);
    assert.deepEqual([...todos].sort(), [...FILTROS_RAPIDOS].sort());
    assert.deepEqual(FILTROS_A_VISTA, ['agora', 'abertas', 'vencidas', 'pagas']);
});

test('filtros vazios: nada a contar no painel', () => {
    assert.equal(contarFiltrosExtras(FILTROS_VAZIOS, false), 0);
});

test('conta cada filtro do painel que está ligado', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, tipo: 'payable', mes: '2026-10', clienteId: 'x' }, false), 3);
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, categoriaId: 'c', bancoId: 'b' }, true), 3);
});

test('filtro rápido do painel conta; o à vista não', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, rapido: 'canceladas' }, false), 1);
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, rapido: 'pagas' }, false), 0);
});

test('recorte e busca ficam fora do contador: têm o seu próprio lugar na tela', () => {
    assert.equal(contarFiltrosExtras({ ...FILTROS_VAZIOS, recorte: 'pagar_vencido', busca: 'abc' }, false), 0);
});

test('busca vinda de outra tela abre em Todas, para achar até conta paga ou futura', () => {
    assert.deepEqual(filtrosDaBusca('Pedido #123'), { busca: 'Pedido #123', rapido: 'todas', recorte: null });
    assert.deepEqual(filtrosDaBusca('   '), {});
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test --experimental-strip-types src/utils/financas/lista.test.ts`. O esperado é FAIL, com "does not provide an export named 'FILTROS_A_VISTA'".

- [ ] **Step 3: Implementar.** Em `src/utils/financas/lista.ts`, logo depois de `FILTROS_VAZIOS`:

```ts
/** Os quatro que ficam à vista; o resto mora no painel Filtros. */
export const FILTROS_A_VISTA: FiltroRapido[] = ['agora', 'abertas', 'vencidas', 'pagas'];
export const FILTROS_NO_PAINEL: FiltroRapido[] = ['hoje', 'semana', 'nao_conferidas', 'canceladas', 'todas'];

/** Quantos filtros do painel estão ligados — o número no botão "Filtros". */
export function contarFiltrosExtras(f: FiltrosDaLista, emColunas: boolean): number {
    return [
        f.tipo !== 'ambos', f.mes !== null, f.clienteId !== null, f.categoriaId !== null, f.bancoId !== null,
        FILTROS_NO_PAINEL.includes(f.rapido), emColunas,
    ].filter(Boolean).length;
}

/** Busca que chega de outra tela (ex.: Pedidos → "Pedido #123"). */
export function filtrosDaBusca(busca: string): Partial<FiltrosDaLista> {
    return busca.trim() ? { busca, rapido: 'todas', recorte: null } : {};
}
```

- [ ] **Step 4: Rodar e ver passar.** Rode o mesmo comando: PASS. Depois a suíte inteira (Global Constraints) e `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/financas/lista.ts src/utils/financas/lista.test.ts
git commit -m "feat(financas): filtros à vista, painel e contador"
```

---

### Task 2: Abas no topo da seção Finanças e a aba Resultado

**Files:**
- Modify: `src/utils/navegacao.ts`, `src/utils/navegacao.test.ts`, `src/components/layout/LateralDaSecao.tsx`, `src/App.tsx`, `src/pages/Finance.tsx` (só a interface de props), `src/components/finance/ReceivablesControlPanel.tsx` (só a assinatura)
- Create: `src/components/layout/AbasDaSecao.tsx`, `src/pages/Resultado.tsx`
- Delete: `src/pages/financas/ResultadoDoMes.tsx` (o conteúdo vai para `src/pages/Resultado.tsx`)

**Interfaces:**
- Consumes: `FiltrosDaLista` (`src/utils/financas/lista.ts`); `useDadosDasFinancas()` (`src/hooks/financas/useDadosDasFinancas.ts`).
- Produces:
  - `View` ganha `'resultado'` e perde `'financas'`;
  - `SECOES_COM_ABAS: SecaoId[]` e `temAbas(id): boolean`;
  - `<AbasDaSecao secao viewAtual onNavegar />`;
  - `FinanceProps` ganha `filtrosIniciais?: Partial<FiltrosDaLista>`, `limparFiltros?: () => void` e `onNavegar?: (v: View) => void`;
  - `ReceivablesControlPanel` passa a receber `{ abrirContas: (f: Partial<FiltrosDaLista>) => void }`;
  - `export default function Resultado({ abrirContas })`.

- [ ] **Step 1: Reescrever os testes de navegação.** Em `src/utils/navegacao.test.ts`:
  - na lista de todas as views (linha ~12), troque `'financas', 'receivables', 'finance', 'envelopes'` por `'finance', 'receivables', 'envelopes', 'resultado'`;
  - **troque** o teste `'recebíveis vem antes de financeiro — é a tarefa diária'` por:

```ts
test('Finanças abre em Contas, o lugar de todo dia; Resultado é o último', () => {
    assert.deepEqual(viewsDaSecao('financas'), ['finance', 'receivables', 'envelopes', 'resultado']);
});
```

  - no teste `'clicar na seção abre a primeira tela dela'`, troque o `'financas'` esperado por `'finance'`;
  - no teste `'seção com várias telas mostra lateral'`, troque a linha de `'financas'` por `assert.equal(temLateral('comercial'), true);`;
  - no teste `'nenhuma seção volta a ser uma lista longa'`, mantenha o teto 4 e acrescente acima o comentário `// Finanças tem 4 abas enquanto o Resultado morar aqui; volta a 3 no plano da navegação por objetivos.`;
  - acrescente:

```ts
test('Finanças mostra abas no topo, não lateral', () => {
    assert.equal(temAbas('financas'), true);
    assert.equal(temLateral('financas'), false);
    assert.equal(temAbas('comercial'), false);
    assert.equal(temAbas(null), false);
});
```

  - e acrescente `temAbas` ao import.

- [ ] **Step 2: Rodar e ver falhar.** `node --test --experimental-strip-types src/utils/navegacao.test.ts`. O esperado é FAIL (`temAbas` não existe e as views mudaram).

- [ ] **Step 3: Implementar em `src/utils/navegacao.ts`.**
  - **No tipo `View`:** troque `| 'financas' | 'receivables' | 'finance' | 'envelopes'` por `| 'finance' | 'receivables' | 'envelopes' | 'resultado'`.
  - **Em `ROTULO_DA_VIEW`:**
    - remova `financas`;
    - mude `finance: 'Contas'`, `receivables: 'Clientes que devem'`, `envelopes: 'Caixinhas'`;
    - acrescente `resultado: 'Resultado'`.
  - **Na seção `financas`:**
    - `views: ['finance', 'receivables', 'envelopes', 'resultado']`;
    - troque o comentário por `// Contas primeiro: é a tela de todo dia (o Cobrar e o Recebi moram nela). Resultado vai para "Como estamos indo" no plano da navegação.`.
  - **Depois de `temLateral`, substitua por:**

```ts
/** Seções desenhadas como abas no topo (embrião da BarraDePassos da navegação por objetivos). */
export const SECOES_COM_ABAS: SecaoId[] = ['financas'];

export const temAbas = (id: SecaoId | null | undefined): boolean =>
    !!id && SECOES_COM_ABAS.includes(id) && viewsDaSecao(id).length > 1;

export const temLateral = (id: SecaoId | null | undefined): boolean =>
    viewsDaSecao(id).length > 1 && !temAbas(id);
```

  (apague a definição antiga de `temLateral`, mantendo o comentário dela acima da nova).

- [ ] **Step 4: Rodar e ver passar.** `node --test --experimental-strip-types src/utils/navegacao.test.ts`: PASS.

- [ ] **Step 5: Criar `src/components/layout/AbasDaSecao.tsx`.**

```tsx
import { viewsDaSecao, ROTULO_DA_VIEW } from '@/utils/navegacao';
import type { SecaoId, View } from '@/utils/navegacao';

interface Props { secao: SecaoId; viewAtual: View; onNavegar: (v: View) => void }

/** As telas de uma seção como abas no topo — uma coluna de menu a menos. */
export function AbasDaSecao({ secao, viewAtual, onNavegar }: Props) {
    return (
        <nav aria-label="Telas da seção" className="shrink-0 border-b border-zinc-900 px-5 print:hidden">
            <div className="mx-auto flex max-w-[1400px] gap-6 overflow-x-auto">
                {viewsDaSecao(secao).map(v => (
                    <button key={v} type="button" onClick={() => onNavegar(v)}
                        aria-current={v === viewAtual ? 'page' : undefined}
                        className={`h-11 whitespace-nowrap border-b-2 text-sm ${v === viewAtual
                            ? 'border-zinc-100 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>
                        {ROTULO_DA_VIEW[v]}
                    </button>
                ))}
            </div>
        </nav>
    );
}
```

- [ ] **Step 6: Criar `src/pages/Resultado.tsx`** a partir de `src/pages/financas/ResultadoDoMes.tsx`. O arquivo novo tem:
  - o conteúdo inteiro de `ResultadoDoMes`;
  - uma casca que carrega os dados;
  - o callback renomeado.
  Depois, apague o arquivo antigo.

```tsx
// topo do arquivo: os mesmos imports de ResultadoDoMes.tsx, mais:
import { useDadosDasFinancas } from '@/hooks/financas/useDadosDasFinancas';

interface Props { abrirContas: (f: Partial<FiltrosDaLista>) => void }

export default function Resultado({ abrirContas }: Props) {
    const { dados, erro, carregando } = useDadosDasFinancas();
    if (erro) return <p role="alert" className="text-sm text-amber-400">{erro}</p>;
    if (!dados) return <p className="text-sm text-zinc-500">{carregando ? 'Carregando…' : ''}</p>;
    return <ResultadoDoMes dados={dados} abrirVisaoGeral={abrirContas} />;
}

// abaixo: function ResultadoDoMes(...) exatamente como estava (sem `export`)
```

  - Em `src/pages/financas/Financas.tsx` (que fica sem uso e é apagado na Task 9), remova o import de `ResultadoDoMes`, a entrada `'resultado'` de `PAGINAS` e o ramo `pagina === 'resultado'`, só para continuar compilando.

- [ ] **Step 7: Ícones da lateral.** Em `src/components/layout/LateralDaSecao.tsx`, no `ICONE_DA_VIEW`: remova `financas: DollarSign,` e acrescente `resultado: BarChart3,`.

- [ ] **Step 8: Ligar no `src/App.tsx`.**
  - **Imports e estado:**
    - remova `const Financas = lazy(...)` e o `case 'financas'`;
    - acrescente `const Resultado = lazy(() => import('@/pages/Resultado'));`;
    - acrescente `temAbas` ao import de `@/utils/navegacao` e `import { AbasDaSecao } from '@/components/layout/AbasDaSecao';`;
    - acrescente `import type { FiltrosDaLista } from '@/utils/financas/lista';`;
    - acrescente o estado `const [filtrosParaContas, setFiltrosParaContas] = useState<Partial<FiltrosDaLista> | null>(null);` e a função:

```tsx
  /** Outra tela pede a aba Contas já filtrada (barra do Resultado, cliente em Clientes que devem). */
  const abrirContas = (f: Partial<FiltrosDaLista>) => { setFiltrosParaContas(f); setCurrentView('finance'); };
```

  - **Os `case` do `renderContent`:**

```tsx
      case 'finance': return <Finance initialSearch={autoSearchTerm} clearSearch={() => setAutoSearchTerm('')}
          filtrosIniciais={filtrosParaContas ?? undefined} limparFiltros={() => setFiltrosParaContas(null)}
          onNavegar={handleNavigate} />;
      case 'receivables': return <Receivables abrirContas={abrirContas} />;
      case 'resultado': return <Resultado abrirContas={abrirContas} />;
```

  - **Abas:** logo depois do `<div className="h-8 ...">` da migalha (e antes do `<div className="flex-1 min-w-0 overflow-auto p-5 ...">`), acrescente:

```tsx
          {temAbas(secaoAtual) && secaoAtual && (
            <AbasDaSecao secao={secaoAtual} viewAtual={currentView} onNavegar={handleNavigate} />
          )}
```

- [ ] **Step 9: Props que a Task 3 e a Task 6 usam.**
  - Em `src/pages/Finance.tsx`, na interface `FinanceProps`, acrescente (sem usar ainda):

```ts
    /** Filtros pedidos por outra tela (Resultado, Clientes que devem). */
    filtrosIniciais?: Partial<import('@/utils/financas/lista').FiltrosDaLista>;
    limparFiltros?: () => void;
    onNavegar?: (v: import('@/utils/navegacao').View) => void;
```

  - Em `src/components/finance/ReceivablesControlPanel.tsx`:
    - mude a assinatura para `export function ReceivablesControlPanel(_props: { abrirContas: (f: Partial<FiltrosDaLista>) => void })`;
    - acrescente `import type { FiltrosDaLista } from '@/utils/financas/lista';`.
    - Isso só existe para compilar: a Task 6 troca `_props` por `{ abrirContas }`.

- [ ] **Step 10: Suíte e tipos.** Rode a suíte inteira e `npx tsc --noEmit`, os dois limpos. Corrija qualquer outro `Record<View, …>` que o tsc apontar (o mesmo padrão do Step 7: tirar `financas`, pôr `resultado`).

- [ ] **Step 11: Commit**

```bash
git add -A src/utils/navegacao.ts src/utils/navegacao.test.ts src/components/layout src/App.tsx src/pages/Resultado.tsx src/pages/financas src/pages/Finance.tsx src/components/finance/ReceivablesControlPanel.tsx
git commit -m "feat(financas): seção vira abas no topo; Resultado é uma aba"
```

---

### Task 3: Contas — dados, lógica, topo e filtros

**Files:**
- Modify: `src/hooks/finance/useFinanceData.ts`, `src/hooks/finance/useFinanceFilters.ts`, `src/pages/Finance.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `FILTROS_A_VISTA`, `FILTROS_NO_PAINEL`, `contarFiltrosExtras`, `filtrosDaBusca`;
  - `numerosDaVisaoGeral`, `RECORTES`, `ROTULO_DO_RECORTE` (`numeros.ts`);
  - `projecaoDoMes` (`projecao.ts`);
  - `filtrarContas`, `agruparParaLista`, `FILTROS_VAZIOS`, `ROTULO_DO_FILTRO` (`lista.ts`);
  - `nomeDaCategoria` (`caixa.ts`);
  - `nomeDoMes`, `mesDe`, `mesAnterior`, `proximoMes` (`base.ts`).
- Produces:
  - `useFinanceData()` também devolve `payments: ObligationPayment[]`, `envelopes: CashEnvelope[]` e `envelopeOverview: EnvelopeOverview`;
  - `useFinanceFilters(obligations, clients, suppliers, globalCategories, filtros: FiltrosDaLista, contasPorObrigacao, totais: { nosBancos: number; nasCaixinhas: number })` devolve `{ lista, grupos, numeros, projecao, nomeDaParte, nomeDaCategoria }`.

- [ ] **Step 1: `useFinanceData` carrega o que falta.** No `Promise.all` de `loadData`, acrescente `storageService.getAllPaymentsComTeto()`, `storageService.getEnvelopes()` e `storageService.getEnvelopeOverview()`. Guarde em estados novos:
  - `payments`, de `pag.pagamentos`;
  - `envelopes`;
  - `envelopeOverview`, com o valor inicial `{ total_real: 0, allocated: 0, free: 0 }`.

  Devolva os três no objeto de retorno. Os tipos vêm de `@/types` (`ObligationPayment`) e `@/types/finance` (`CashEnvelope`, `EnvelopeOverview`).

- [ ] **Step 2: Reescrever `src/hooks/finance/useFinanceFilters.ts`** por inteiro:

```ts
import { useMemo } from 'react';
import type { ObligationSummary, Client, Supplier, GlobalCategory } from '../../types';
import { getTodayStr } from '@/utils/date';
import { filtrarContas, agruparParaLista } from '@/utils/financas/lista';
import type { ContextoDaLista, FiltrosDaLista } from '@/utils/financas/lista';
import { numerosDaVisaoGeral } from '@/utils/financas/numeros';
import { projecaoDoMes } from '@/utils/financas/projecao';
import { nomeDaCategoria as nomeDaCategoriaV3 } from '@/utils/financas/caixa';

/** A lista e os números da aba Contas — casca sobre as contas puras de utils/financas. */
export function useFinanceFilters(
    obligations: ObligationSummary[],
    clients: Client[],
    suppliers: Supplier[],
    globalCategories: GlobalCategory[],
    filtros: FiltrosDaLista,
    contasPorObrigacao: Record<string, string[]>,
    totais: { nosBancos: number; nasCaixinhas: number },
) {
    const hoje = getTodayStr();
    const ctx: ContextoDaLista = useMemo(() => {
        const cli = new Map(clients.map(c => [c.id, c.company_name]));
        const forn = new Map(suppliers.map(f => [f.id, f.company_name]));
        const cats = new Map(globalCategories.map(c => [c.id, c]));
        return {
            hoje, contasPorObrigacao,
            nomeDaParte: c => (c.client_id ? cli.get(c.client_id) : c.supplier_id ? forn.get(c.supplier_id) : '') ?? '',
            nomeDaCategoria: c => nomeDaCategoriaV3(c, cats, ''),
        };
    }, [clients, suppliers, globalCategories, contasPorObrigacao, hoje]);

    const lista = useMemo(() => filtrarContas(obligations, filtros, ctx), [obligations, filtros, ctx]);
    const porAtraso = filtros.recorte?.endsWith('vencido')
        || (!filtros.recorte && (filtros.rapido === 'vencidas' || filtros.rapido === 'agora'));
    const grupos = useMemo(() => agruparParaLista(lista, hoje, !!porAtraso), [lista, hoje, porAtraso]);
    const numeros = useMemo(() => numerosDaVisaoGeral({ contas: obligations, ...totais, hoje }),
        [obligations, totais.nosBancos, totais.nasCaixinhas, hoje]);
    const projecao = useMemo(() => projecaoDoMes({ contas: obligations, livreHoje: numeros.livre, hoje }),
        [obligations, numeros.livre, hoje]);

    return { lista, grupos, numeros, projecao, nomeDaParte: ctx.nomeDaParte, nomeDaCategoria: ctx.nomeDaCategoria };
}
```

  Confira que `nomeDaCategoria(c, categorias, padrao)` aceita o terceiro argumento (aceita: `padrao = 'Sem categoria'`). Com `''`, a linha não mostra "Sem categoria".

- [ ] **Step 3: Estado de filtro do `Finance.tsx`.**
  - **Apague:**
    - os estados `typeTab`, `smartFilter`, `periodFilter`, `periodOffset`, `search`, `sortBy`, `minAmount`, `maxAmount`, `dateFrom`, `dateTo`, `clientFilter`, `contaFilter`, `categoryFilter`, `savedPresets`, `presetName`, `cashPos`, `agingRows`, `cashflowSeries`, `liquidityKPIs`, `showSecondaryKPIs`, `showPaid` e `viewMode`;
    - `getInitialFilters`/`initFilters`;
    - o `useEffect` dos presets (`getFinancePresets`), `persistPresets`, `savePreset`, `loadPreset`;
    - o `useEffect` que grava `finance_filter_state`;
    - o `useEffect` de `getCashPosition`/`getAgingBuckets`/`getCashflowSeries`/`getLiquidityKPIs`;
    - `getPeriodLabel`, `projectedBalance`, `reconciledBalance`, `periodReceivable`, `periodPayable`;
    - o import de `FilterState`, `SmartFilter`, `getSmartFilterLabel`, `CashPosition`, `AgingRow`, `AGING_BUCKETS`, `summarizeAging`, `CashflowPoint` e `LiquidityKPIs`.
  - **Mantenha:** `contasPorObrigacao` e o seu `useEffect` (`getContasPorObrigacao`), `filterExpanded` (renomeie para `painelAberto`), `searchInputRef`, e o atalho ⌘F/Esc.
  - **Acrescente:**

```tsx
    const [filtros, setFiltros] = useState<FiltrosDaLista>({ ...FILTROS_VAZIOS, ...(filtrosIniciais ?? {}) });
    const [emColunas, setEmColunas] = useState(false);
    const mudar = (m: Partial<FiltrosDaLista>) => setFiltros(f => ({ ...f, recorte: null, ...m }));
    // O total e a lista têm de bater: o recorte parte de filtros zerados.
    const alternarRecorte = (r: Recorte) =>
        setFiltros(f => (f.recorte === r ? FILTROS_VAZIOS : { ...FILTROS_VAZIOS, recorte: r }));

    useEffect(() => {
        if (filtrosIniciais) { setFiltros({ ...FILTROS_VAZIOS, ...filtrosIniciais }); limparFiltros?.(); }
    }, [filtrosIniciais, limparFiltros]);
    useEffect(() => {
        if (initialSearch) { setFiltros({ ...FILTROS_VAZIOS, ...filtrosDaBusca(initialSearch) }); clearSearch?.(); }
    }, [initialSearch, clearSearch]);
```

  (o `useEffect` antigo de `initialSearch`, que chamava `setSearch`, sai).
  - **A chamada do gancho:**

```tsx
    const { lista, grupos, numeros, projecao, nomeDaParte, nomeDaCategoria } = useFinanceFilters(
        obligations, clients, suppliers, globalCategories, filtros, contasPorObrigacao,
        { nosBancos: envelopeOverview.total_real, nasCaixinhas: envelopeOverview.allocated });
```

  - **`clearAllFilters`** vira `() => setFiltros(FILTROS_VAZIOS)`.

- [ ] **Step 4: Topo novo.** Substitua o bloco `{/* DECISORY KPIs ... */}` inteiro e o `{showSecondaryKPIs && (...)}` inteiro por:

```tsx
                        <section className="grid gap-8 sm:grid-cols-2">
                            <div>
                                <p className="text-xs text-zinc-500">Livre para usar</p>
                                <p className={`text-3xl font-semibold tabular-nums ${numeros.livre < 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(numeros.livre)}</p>
                                <p className="text-xs text-zinc-500">{mostrar(numeros.nosBancos)} nos bancos − {mostrar(numeros.nasCaixinhas)} nas caixinhas</p>
                            </div>
                            <div>
                                <p className="text-xs text-zinc-500">Fecha {nomeDoMes(mesDe(hoje)).split(' ')[0]} com</p>
                                <div className="flex items-end gap-3">
                                    <p className={`text-3xl font-semibold tabular-nums ${projecao.fechaCom < 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(projecao.fechaCom)}</p>
                                    <div className="flex-1 min-w-0"><LinhaDoSaldo pontos={projecao.pontos} /></div>
                                </div>
                                <p className="text-xs text-zinc-500">só pedidos já entregues</p>
                            </div>
                        </section>

                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {RECORTES.map(r => {
                                const soma = numeros.recortes[r];
                                const ativo = filtros.recorte === r;
                                return (
                                    <button key={r} type="button" onClick={() => alternarRecorte(r)} aria-pressed={ativo}
                                        className={`text-left px-3 py-3 rounded-lg border-b-2 ${ativo ? 'border-zinc-100 bg-zinc-900/60' : 'border-transparent hover:bg-zinc-900/40'}`}>
                                        <span className="block text-xs text-zinc-500">{ROTULO_DO_RECORTE[r]}</span>
                                        <span className={`block text-lg font-semibold tabular-nums ${r.endsWith('vencido') && soma.total > 0 ? 'text-amber-400' : 'text-white'}`}>{mostrar(soma.total)}</span>
                                        <span className="block text-xs text-zinc-500">{soma.quantidade} conta(s)</span>
                                    </button>
                                );
                            })}
                        </section>
```

  - Copie a função `LinhaDoSaldo` de `src/pages/financas/VisaoGeral.tsx` (as linhas que começam em `function LinhaDoSaldo`) para o topo de `Finance.tsx`, fora do componente.
  - Use `const { mostrar } = useMostrarValor();` e `const hoje = getTodayStr();`.
  - O container da coluna esquerda troca `space-y-6` por `space-y-10`.
  - O wrapper `w-full px-4 py-4` + `grid ... lg:grid-cols-[1fr_240px] gap-5` vira `mx-auto w-full max-w-[1400px] grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] items-start`.
  - O `min-h-screen ... bg-zinc-950` externo fica.

- [ ] **Step 5: Barra de filtros e painel.** Substitua tudo, da `{/* ── SMART FILTER LAYER` até o fim da gaveta (`{/* Footer Actions */}` inclusive), por:
  - a barra à vista;
  - as etiquetas;
  - os botões de nova conta;
  - o painel.

  A barra, as etiquetas e os botões:

```tsx
                        <section className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                {FILTROS_A_VISTA.map(f => (
                                    <button key={f} type="button" onClick={() => mudar({ rapido: f })}
                                        aria-pressed={!filtros.recorte && filtros.rapido === f}
                                        className={`h-9 px-3 rounded-full text-sm border ${!filtros.recorte && filtros.rapido === f ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                                        {ROTULO_DO_FILTRO[f]}
                                    </button>
                                ))}
                                <input ref={searchInputRef} value={filtros.busca} onChange={e => mudar({ busca: e.target.value })}
                                    placeholder="Buscar (⌘F)" aria-label="Buscar conta"
                                    className="h-9 w-44 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200 placeholder:text-zinc-600" />
                                <button type="button" onClick={() => setPainelAberto(true)}
                                    className="h-9 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">
                                    Filtros{extras > 0 && <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 text-xs text-zinc-950">{extras}</span>}
                                </button>
                                <IndicadorRecarga ativo={recarregando} />
                                <div className="ml-auto flex gap-2">
                                    <button type="button" onClick={() => setShowForm('receivable')} className="h-9 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">+ A receber</button>
                                    <button type="button" onClick={() => setShowForm('payable')} className="h-9 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">+ A pagar</button>
                                </div>
                            </div>
                            {etiquetas.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {etiquetas.map(e => (
                                        <button key={e.rotulo} type="button" onClick={e.tirar}
                                            className="h-7 px-2.5 rounded-full bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800">{e.rotulo} ✕</button>
                                    ))}
                                    <button type="button" onClick={clearAllFilters} className="text-xs text-zinc-500 underline">limpar</button>
                                </div>
                            )}
                        </section>
```

  Com, no corpo do componente:

```tsx
    const extras = contarFiltrosExtras(filtros, emColunas);
    const nomeDoCliente = (id: string) => clients.find(c => c.id === id)?.company_name ?? 'cliente';
    const etiquetas = [
        filtros.recorte && { rotulo: ROTULO_DO_RECORTE[filtros.recorte], tirar: () => setFiltros(FILTROS_VAZIOS) },
        filtros.tipo !== 'ambos' && { rotulo: filtros.tipo === 'receivable' ? 'A receber' : 'A pagar', tirar: () => mudar({ tipo: 'ambos' }) },
        filtros.mes && { rotulo: nomeDoMes(filtros.mes), tirar: () => mudar({ mes: null }) },
        filtros.clienteId && { rotulo: nomeDoCliente(filtros.clienteId), tirar: () => mudar({ clienteId: null }) },
        filtros.categoriaId && { rotulo: globalCategories.find(c => c.id === filtros.categoriaId)?.name ?? 'categoria', tirar: () => mudar({ categoriaId: null }) },
        filtros.bancoId && { rotulo: bankAccounts.find(b => b.id === filtros.bancoId)?.name ?? 'banco', tirar: () => mudar({ bancoId: null }) },
        FILTROS_NO_PAINEL.includes(filtros.rapido) && { rotulo: ROTULO_DO_FILTRO[filtros.rapido], tirar: () => mudar({ rapido: 'agora' }) },
        emColunas && { rotulo: 'Em colunas', tirar: () => setEmColunas(false) },
    ].filter(Boolean) as { rotulo: string; tirar: () => void }[];
```

  O painel (gaveta lateral, aproveitando o fundo e o `fixed` que já existem; ele sai num portal):

```tsx
            {painelAberto && createPortal(
                <div className="fixed inset-0 z-sobreposto flex justify-end">
                    <button type="button" aria-label="Fechar filtros" className="absolute inset-0 bg-black/60" onClick={() => setPainelAberto(false)} />
                    <div role="dialog" aria-label="Filtros" className="relative h-full w-full max-w-sm overflow-y-auto bg-zinc-950 border-l border-zinc-800 p-6 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-base font-semibold text-white">Filtros</h2>
                            <button type="button" onClick={() => setPainelAberto(false)} className="h-10 w-10 rounded-lg text-zinc-400 hover:bg-zinc-900" aria-label="Fechar">✕</button>
                        </div>
                        <label className="block space-y-1.5"><span className="text-xs text-zinc-500">Tipo</span>
                            <select value={filtros.tipo} onChange={e => mudar({ tipo: e.target.value as FiltrosDaLista['tipo'] })} className={campo}>
                                <option value="ambos">Pagar e receber</option><option value="receivable">A receber</option><option value="payable">A pagar</option>
                            </select></label>
                        <div className="space-y-1.5"><span className="text-xs text-zinc-500">Mês do vencimento</span>
                            <div className="flex items-center gap-2">
                                <button type="button" aria-label="Mês anterior" onClick={() => mudar({ mes: mesAnterior(filtros.mes ?? mesDe(hoje)) })} className="h-10 w-10 rounded-lg border border-zinc-800 text-zinc-300">‹</button>
                                <span className="flex-1 text-center text-sm text-zinc-200">{filtros.mes ? nomeDoMes(filtros.mes) : 'Todos os meses'}</span>
                                <button type="button" aria-label="Próximo mês" onClick={() => mudar({ mes: proximoMes(filtros.mes ?? mesDe(hoje)) })} className="h-10 w-10 rounded-lg border border-zinc-800 text-zinc-300">›</button>
                            </div>
                            {filtros.mes && <button type="button" onClick={() => mudar({ mes: null })} className="text-xs text-zinc-500 underline">todos os meses</button>}
                        </div>
                        <label className="block space-y-1.5"><span className="text-xs text-zinc-500">Cliente</span>
                            <SearchableSelect value={filtros.clienteId ?? ''} onChange={v => mudar({ clienteId: v || null })}
                                options={[{ value: '', label: 'Todos' }, ...clients.map(c => ({ value: c.id, label: c.company_name }))]} /></label>
                        <label className="block space-y-1.5"><span className="text-xs text-zinc-500">Categoria</span>
                            <select value={filtros.categoriaId ?? ''} onChange={e => mudar({ categoriaId: e.target.value || null })} className={campo}>
                                <option value="">Todas</option>{globalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select></label>
                        <label className="block space-y-1.5"><span className="text-xs text-zinc-500">Banco</span>
                            <select value={filtros.bancoId ?? ''} onChange={e => mudar({ bancoId: e.target.value || null })} className={campo}>
                                <option value="">Todos</option>{bankAccounts.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select></label>
                        <div className="space-y-1.5"><span className="text-xs text-zinc-500">Mostrar</span>
                            <div className="flex flex-wrap gap-2">
                                {FILTROS_NO_PAINEL.map(f => (
                                    <button key={f} type="button" onClick={() => mudar({ rapido: f })} aria-pressed={filtros.rapido === f}
                                        className={`h-9 px-3 rounded-full text-sm border ${filtros.rapido === f ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'border-zinc-800 text-zinc-400'}`}>{ROTULO_DO_FILTRO[f]}</button>
                                ))}
                            </div></div>
                        <label className="flex items-center gap-3 text-sm text-zinc-300">
                            <input type="checkbox" checked={emColunas} onChange={e => setEmColunas(e.target.checked)} className="h-4 w-4" />
                            Ver em colunas (a receber | a pagar)</label>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={clearAllFilters} className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300">Limpar</button>
                            <button type="button" onClick={() => setPainelAberto(false)} className="h-10 flex-1 rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-950">Ver {lista.length} conta(s)</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
```

  - O `<ObligationForm …>` que já existe no fim do arquivo ganha a prop `enxuto` (spec 3.5: o básico à vista; recorrente, parcelado, conta, observações e "já foi pago" em "mais opções").
  - `const campo = 'h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200';` fica fora do componente.
  - Confira a assinatura de `SearchableSelect` em `src/components/common/SearchableSelect.tsx`. Se ela usar outros nomes de prop, adapte: a gaveta antiga já usava esse componente para cliente, então copie o uso dela.
  - `createPortal` vem de `react-dom`.

- [ ] **Step 6: A lista temporária.** Até a Task 4, a parte `{/* OBLIGATIONS */}` usa `lista` no lugar de `sortedFiltered`. No modo linha do tempo, ela usa `grupos.map(g => ...g.contas...)` com `g.titulo` no lugar de `g.label`/`g.obs`. Nas colunas, usa `lista.filter(o => o.type === 'receivable'/'payable')`. Apague `timelineGroups`, `receivableList`, `payableList` e `showPaid`. O objetivo aqui é só compilar: o visual da lista é da Task 4.

- [ ] **Step 7: Lateral temporária.** Na lateral, apague os blocos da pizza (`CategoryPieChart`), do `CashflowChart` e do `CashSimulator`. A Task 5 põe os blocos novos. Bancos e Sinc ficam como estão.

- [ ] **Step 8: Suíte, tipos e commit.** Rode a suíte inteira e `npx tsc --noEmit`, os dois limpos.
  - Remova de `src/utils/sobreposicoes.test.ts` nada nesta tarefa: `pages/Finance.tsx` continua devendo, por causa da janela de desfazer conferência, até a Task 8.

```bash
git add src/hooks/finance/useFinanceData.ts src/hooks/finance/useFinanceFilters.ts src/pages/Finance.tsx
git commit -m "feat(financas): Contas usa as contas da v3 — livre, quatro números, fecha com, filtros recolhidos"
```

---

### Task 4: Contas — lista e linha

**Files:**
- Modify: `src/components/finance/ObligationCard.tsx`, `src/pages/Finance.tsx`

**Interfaces:**
- Consumes:
  - Task 3: `lista`, `grupos`, `numeros`, `nomeDaParte`, `nomeDaCategoria`, `emColunas`;
  - `situacaoDaConta`, `diasDeAtraso` (`situacao.ts`);
  - `JanelaDeBaixa` (`src/components/financas/JanelaDeBaixa.tsx`, props `{ conta, bancos, caixinhas, bancoInicial, onMaisOpcoes, onFechar, onConcluido }`);
  - `bancoSugerido` (`caixinhas.ts`).
- Produces: `ObligationCard` com a prop nova `onBaixa: (ob) => void`. `onPay` sai. `onDetail` continua abrindo o PaymentModal.

- [ ] **Step 1: Reescrever o `ObligationCard`.** As props ficam as mesmas, exceto `onPay`, que vira `onBaixa`. Todas as condições de hoje ficam iguais:
  - lápis só se `paid_amount <= 0` e não cancelada;
  - conferir só se `remaining_amount <= 0`, não cancelada e não conferida;
  - desfazer só se conferida;
  - cancelar só se `canPay` e não conferida.

```tsx
import { Repeat, Ban, ShieldCheck, Undo2, Paperclip, Pencil } from 'lucide-react';
import { ObligationSummary } from '@/types';
import { formatCurrency } from '@/utils';
import { getTodayStr } from '@/utils/date';
import { situacaoDaConta, diasDeAtraso } from '@/utils/financas/situacao';
import { diaEMes, diasEntre } from '@/utils/financas/base';
import { ProgressBar } from './ui';

interface ObligationCardProps {
    ob: ObligationSummary;
    partyName?: string | null;
    categoryLabel?: string | null;
    isPrivacy: boolean;
    onBaixa: (ob: ObligationSummary) => void;
    onDetail: (ob: ObligationSummary) => void;
    onCancel: (ob: ObligationSummary) => void;
    onReconcile?: (ob: ObligationSummary) => void;
    onUndoReconcile?: (ob: ObligationSummary) => void;
    /** Corrigir valor/vencimento. Só aparece enquanto nada foi pago. */
    onEdit?: (ob: ObligationSummary) => void;
}

const icone = 'h-10 w-10 inline-flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900';

export function ObligationCard({ ob, partyName, categoryLabel, isPrivacy, onBaixa, onDetail, onCancel, onReconcile, onUndoReconcile, onEdit }: ObligationCardProps) {
    const hoje = getTodayStr();
    const s = situacaoDaConta(ob, hoje);
    const entra = ob.type === 'receivable';
    const conferida = !!ob.is_reconciled;
    const aberta = s === 'vencida' || s === 'a_vencer' || s === 'aguardando_entrega';
    const naoConferida = !!ob.unreconciled_reason && !conferida;
    const valor = (n: number) => (isPrivacy ? '••••' : formatCurrency(n));
    const faltam = diasEntre(hoje, ob.due_date);
    const quando = s === 'vencida' ? `${diasDeAtraso(ob, hoje)} dia(s) de atraso`
        : faltam === 0 ? 'hoje' : faltam > 0 && faltam <= 7 ? `em ${faltam} dia(s)` : diaEMes(ob.due_date);

    return (
        <div className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 ${s === 'cancelada' ? 'opacity-50' : ''}`}>
            <button type="button" onClick={() => onDetail(ob)} className="min-w-0 text-left">
                <span className={`flex items-center gap-1.5 text-sm text-zinc-200 ${s === 'cancelada' ? 'line-through' : ''}`}>
                    <span className="truncate">{ob.description}</span>
                    {ob.is_recurring && <Repeat size={12} className="shrink-0 text-zinc-500" aria-label="Recorrente" />}
                    {ob.attachments && ob.attachments.length > 0 && <Paperclip size={12} className="shrink-0 text-zinc-500" aria-label="Tem anexo" />}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                    {partyName && <span className="truncate">{partyName}</span>}
                    <span className={s === 'vencida' ? 'text-amber-400' : ''}>{quando}</span>
                    {ob.total_installments && ob.total_installments > 1 && <span>parcela {ob.installment_no}/{ob.total_installments}</span>}
                    {categoryLabel && <span>{categoryLabel}</span>}
                    {s === 'aguardando_entrega' && <span>aguardando entrega</span>}
                    {naoConferida && <span className="text-amber-400" title={ob.unreconciled_reason ?? ''}>{ob.unreconciled_reason}</span>}
                </span>
                {ob.derived_status === 'partial' && ob.paid_pct > 0 && (
                    <span className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                        <span className="w-24"><ProgressBar pct={ob.paid_pct} status={ob.derived_status} /></span>
                        falta {valor(ob.remaining_amount)}
                    </span>
                )}
            </button>
            <div className="flex items-center gap-1">
                {/* No celular os ícones ficam sempre à vista; no computador, ao passar o mouse. */}
                <div className="flex items-center md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                    {onEdit && ob.paid_amount <= 0 && s !== 'cancelada' && (
                        <button type="button" onClick={() => onEdit(ob)} className={icone} aria-label="Corrigir valor ou vencimento" title="Corrigir valor ou vencimento"><Pencil size={15} /></button>
                    )}
                    {onReconcile && ob.remaining_amount <= 0 && s !== 'cancelada' && !conferida && (
                        <button type="button" onClick={() => onReconcile(ob)} className={icone} aria-label="Conferir com o extrato" title="Conferir com o extrato"><ShieldCheck size={15} /></button>
                    )}
                    {onUndoReconcile && conferida && (
                        <button type="button" onClick={() => onUndoReconcile(ob)} className={icone} aria-label="Desfazer conferência" title="Desfazer conferência"><Undo2 size={15} /></button>
                    )}
                    {aberta && !conferida && (
                        <button type="button" onClick={() => onCancel(ob)} className={`${icone} hover:text-rose-400`} aria-label="Cancelar conta" title="Cancelar conta"><Ban size={15} /></button>
                    )}
                </div>
                <span className={`min-w-24 text-right text-sm font-semibold tabular-nums ${entra ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    {entra ? '+' : '−'} {valor(ob.remaining_amount > 0 ? ob.remaining_amount : ob.original_amount)}
                </span>
                {aberta && !conferida ? (
                    <button type="button" onClick={() => onBaixa(ob)}
                        className="h-10 w-20 rounded-lg border border-zinc-800 text-sm text-zinc-200 hover:bg-zinc-900">
                        {entra ? 'Recebi' : 'Paguei'}
                    </button>
                ) : conferida ? (
                    <span className="w-20 text-center text-xs text-emerald-400" title="Conferida com o extrato">conferida</span>
                ) : <span className="w-20" />}
            </div>
        </div>
    );
}
```

  Confira que `diasEntre` e `diaEMes` são exportados por `src/utils/financas/base.ts` (são).

- [ ] **Step 2: A lista no `Finance.tsx`.** Substitua o bloco `{/* OBLIGATIONS */}` inteiro por:

```tsx
                        <section className="space-y-2">
                            <p className="text-xs text-zinc-500">
                                Mostrando <b className="font-medium text-zinc-200">{filtros.recorte ? ROTULO_DO_RECORTE[filtros.recorte].toLowerCase() : ROTULO_DO_FILTRO[filtros.rapido].toLowerCase()}</b> · {lista.length} conta(s)
                            </p>
                            {loading ? <p className="py-10 text-center text-sm text-zinc-500">Carregando…</p>
                            : lista.length === 0 ? <p className="py-10 text-center text-sm text-zinc-500">Nenhuma conta neste filtro.</p>
                            : emColunas ? (
                                <div className="grid gap-10 md:grid-cols-2">
                                    {(['receivable', 'payable'] as const).map(tipo => {
                                        const doTipo = lista.filter(o => o.type === tipo);
                                        return (
                                            <div key={tipo} className="min-w-0">
                                                <p className="flex justify-between text-xs text-zinc-500"><span>{tipo === 'receivable' ? 'A receber' : 'A pagar'}</span>
                                                    <span className="tabular-nums">{mostrar(doTipo.reduce((s, o) => s + o.remaining_amount, 0))}</span></p>
                                                <div className="divide-y divide-zinc-900">{doTipo.map(renderCard)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : grupos.map(g => (
                                <div key={g.titulo} className="pt-4">
                                    <p className="flex justify-between text-xs text-zinc-500"><span>{g.titulo}</span>
                                        <span className="tabular-nums">{mostrar(g.contas.reduce((s, o) => s + o.remaining_amount, 0))}</span></p>
                                    <div className="divide-y divide-zinc-900">{g.contas.map(renderCard)}</div>
                                </div>
                            ))}
                            {numeros.emProducao.total > 0 && (
                                <p className="pt-4 text-xs text-zinc-500">{mostrar(numeros.emProducao.total)} de pedidos em produção não aparecem aqui · entram quando o pedido for entregue.</p>
                            )}
                        </section>
```

  E o `renderCard`:

```tsx
    const renderCard = (ob: ObligationSummary) => (
        <ObligationCard key={ob.id} ob={ob} partyName={nomeDaParte(ob) || null} categoryLabel={nomeDaCategoria(ob) || null}
            isPrivacy={isPrivacy} onBaixa={setBaixa} onDetail={handleOpenPay} onCancel={handleCancel}
            onReconcile={handleReconcile} onEdit={setContaEmEdicao}
            onUndoReconcile={(o) => { setReconciliationUndoTarget(o); setUndoReason(''); }} />
    );
```

- [ ] **Step 3: Recebi/Paguei pela `JanelaDeBaixa`.**
  - Acrescente `const [baixa, setBaixa] = useState<ObligationSummary | null>(null);` e, junto das outras janelas:

```tsx
            {baixa && (
                <JanelaDeBaixa conta={baixa} bancos={bankAccounts} caixinhas={envelopes}
                    bancoInicial={bancoSugerido({ pagamentos: payments, contas: obligations, tipo: baixa.type, bancosAtivos: bankAccounts.filter(b => b.is_active) })}
                    onMaisOpcoes={() => { const c = baixa; setBaixa(null); void handleOpenPay(c); }}
                    onFechar={() => setBaixa(null)}
                    onConcluido={() => { setBaixa(null); void loadData(); }} />
            )}
```

  - O "mais opções" fecha a rápida e abre o PaymentModal da mesma conta. Ali estão a baixa parcial, o desconto, o acréscimo, o informativo, os anexos, a anotação e o histórico (spec 3.3).
  - Confira em `JanelaDeBaixa.tsx` se `bancos` espera todos os bancos ou só os ativos e passe o que ela pede.

- [ ] **Step 4: Tipos e suíte.** Rode `npx tsc --noEmit` e a suíte, os dois limpos. Se outro arquivo usar `ObligationCard` com `onPay` (o tsc aponta), troque por `onBaixa`.

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/ObligationCard.tsx src/pages/Finance.tsx
git commit -m "feat(financas): lista por data, linha leve, Recebi/Paguei com baixa rápida e mais opções"
```

---

### Task 5: Contas — lateral (Bancos, Gastos por categoria, Caixinhas)

**Files:**
- Create: `src/components/common/MenuMais.tsx`
- Modify: `src/pages/Finance.tsx`

**Interfaces:**
- Consumes:
  - `situacaoDosBancos` (`bancos.ts`) e `JanelaConferirBanco` (`src/components/financas/JanelaConferirBanco.tsx`, props `{ banco, contas, onFechar, onAlterado }`);
  - `caixaDoPeriodo` (`caixa.ts`);
  - `payments`, `envelopes` e `envelopeOverview` (Task 3);
  - `onNavegar` (Task 2).
- Produces: `<MenuMais rotulo itens={[{ rotulo, onClick, perigo? }]} />`, que as Tasks 6 e 7 também usam.

- [ ] **Step 1: Criar `src/components/common/MenuMais.tsx`.** Usa `<details>` nativo: abre e fecha sem estado, com teclado de graça.

```tsx
import { useRef } from 'react';

export interface ItemDoMenu { rotulo: string; onClick: () => void; perigo?: boolean }

/** Menu "⋯": guarda as ações de manutenção fora da vista, a um clique. */
export function MenuMais({ rotulo, itens }: { rotulo: string; itens: ItemDoMenu[] }) {
    const ref = useRef<HTMLDetailsElement>(null);
    return (
        <details ref={ref} className="relative">
            <summary aria-label={rotulo} title={rotulo}
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-900 [&::-webkit-details-marker]:hidden">⋯</summary>
            <div className="absolute right-0 z-30 mt-1 min-w-48 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
                {itens.map(i => (
                    <button key={i.rotulo} type="button"
                        onClick={() => { ref.current?.removeAttribute('open'); i.onClick(); }}
                        className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-900 ${i.perigo ? 'text-rose-400' : 'text-zinc-200'}`}>
                        {i.rotulo}
                    </button>
                ))}
            </div>
        </details>
    );
}
```

  Exporte em `src/components/common/index.ts` (`export { MenuMais } from './MenuMais';` e `export type { ItemDoMenu } from './MenuMais';`).

- [ ] **Step 2: Bloco Bancos.** Substitua o bloco `{/* Bank Accounts */}` inteiro e o `{/* Recalculate */}` por:

```tsx
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs text-zinc-500">Bancos</h2>
                                <MenuMais rotulo="Mais ações dos bancos" itens={[
                                    { rotulo: 'Nova conta bancária', onClick: () => { setSelectedBank(null); setShowBankModal(true); } },
                                    ...bankAccounts.map(b => ({ rotulo: `Editar ${b.name}`, onClick: () => { setSelectedBank(b); setShowBankModal(true); } })),
                                    { rotulo: showInactiveBanks ? 'Esconder inativas' : 'Mostrar inativas', onClick: () => setShowInactiveBanks(v => !v) },
                                    { rotulo: 'Sinc saldos…', onClick: handleRecalculateBalances, perigo: true },
                                ]} />
                            </div>
                            <ul className="space-y-1">
                                {bancos.map(b => (
                                    <li key={b.id}>
                                        <button type="button" onClick={() => setBancoAberto(b.id)}
                                            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-zinc-900">
                                            <span className="min-w-0"><span className="block truncate text-sm text-zinc-200">{b.nome}</span>
                                                <span className={`block text-xs ${b.aConferir.length ? 'text-amber-400' : 'text-zinc-500'}`}>{b.aConferir.length ? `${b.aConferir.length} a conferir` : '✓ conferido'}</span></span>
                                            <span className="text-sm tabular-nums text-zinc-200">{mostrar(b.saldo)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {showInactiveBanks && bankAccounts.filter(b => !b.is_active).map(b => (
                                <div key={b.id} className="flex items-center justify-between px-2 text-xs text-zinc-500">
                                    <span>{b.name} (inativa)</span>
                                    <button type="button" onClick={() => handleReactivateBank(b)} className="underline">reativar</button>
                                </div>
                            ))}
                        </section>
```

  - Com `const bancos = useMemo(() => situacaoDosBancos({ bancos: bankAccounts, contas: obligations, contasPorObrigacao }), [bankAccounts, obligations, contasPorObrigacao]);`, `const [bancoAberto, setBancoAberto] = useState<string | null>(null);` e, junto das janelas:

```tsx
            {bancoAberto && (() => { const b = bancos.find(x => x.id === bancoAberto); return b ? (
                <JanelaConferirBanco banco={b} contas={obligations} onFechar={() => setBancoAberto(null)} onAlterado={() => void loadData()} />
            ) : null; })()}
```

  - **Mostrar inativas:** confira como `showInactiveBanks` recarrega hoje (`loadData(true)`) e mantenha esse efeito. Se as inativas não vierem em `bankAccounts`, o `useEffect` de hoje que liga `showInactiveBanks` a `loadData(showInactiveBanks)` fica.
  - **Inativar:** continua no `BankAccountModal` (botão "Inativar conta"). Confira que `handleInactivateBank` ainda é passado para ele.

- [ ] **Step 3: Bloco Gastos por categoria.**

```tsx
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xs text-zinc-500">Gastos de {nomeDoMes(mesDosGastos).split(' ')[0]}</h2>
                                <div className="flex items-center">
                                    <button type="button" aria-label="Mês anterior" onClick={() => setMesDosGastos(mesAnterior(mesDosGastos))} className="h-10 w-8 text-zinc-400 hover:text-white">‹</button>
                                    <button type="button" aria-label="Próximo mês" onClick={() => setMesDosGastos(proximoMes(mesDosGastos))} className="h-10 w-8 text-zinc-400 hover:text-white">›</button>
                                    <MenuMais rotulo="Mais ações das categorias" itens={[{ rotulo: 'Nova categoria', onClick: () => setShowCategoryQuickAdd(true) }]} />
                                </div>
                            </div>
                            {gastos.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma saída neste mês.</p> : gastos.map(f => {
                                const id = globalCategories.find(c => c.name === f.nome)?.id;
                                return (
                                    <button key={f.nome} type="button" disabled={!id}
                                        onClick={() => id && setFiltros({ ...FILTROS_VAZIOS, categoriaId: id, rapido: 'pagas' })}
                                        className="block w-full space-y-1 text-left disabled:cursor-default">
                                        <span className="flex justify-between gap-2 text-sm"><span className="truncate text-zinc-300">{f.nome}</span><span className="tabular-nums text-zinc-300">{mostrar(f.valor)}</span></span>
                                        <span className="block h-1 rounded-full bg-zinc-900"><span className="block h-1 rounded-full bg-zinc-400" style={{ width: `${Math.max(2, (f.valor / (gastos[0]?.valor || 1)) * 100)}%` }} /></span>
                                    </button>
                                );
                            })}
                            <p className="text-xs text-zinc-500">o que saiu, pela data do pagamento · clique para ver as contas</p>
                        </section>
```

  - Com `const [mesDosGastos, setMesDosGastos] = useState(mesDe(getTodayStr()));` e `const gastos = useMemo(() => caixaDoPeriodo({ pagamentos: payments, contas: obligations, categorias: globalCategories, meses: [mesDosGastos] }).porCategoria, [payments, obligations, globalCategories, mesDosGastos]);`.
  - O clique não liga o filtro de mês, pela mesma razão da decisão 11 do fechamento da v3: as barras somam por data de pagamento e o mês da lista é por vencimento.

- [ ] **Step 4: Bloco Caixinhas.**

```tsx
                        <section className="space-y-1">
                            <h2 className="text-xs text-zinc-500">Caixinhas</h2>
                            <button type="button" onClick={() => onNavegar?.('envelopes')} className="w-full rounded-lg px-2 py-2.5 text-left hover:bg-zinc-900">
                                <span className="block text-sm tabular-nums text-zinc-200">{mostrar(numeros.nasCaixinhas)} reservado</span>
                                <span className="block text-xs text-zinc-500">em {envelopes.length} caixinha(s) · abrir</span>
                            </button>
                        </section>
```

- [ ] **Step 5: A `aside`** fica `className="space-y-10 lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"` (sai `order-last`, `mb-6` e a `gap-6`). A ordem é Bancos, Gastos e Caixinhas.

- [ ] **Step 6: Tipos, suíte e commit.** Os dois limpos.

```bash
git add src/components/common/MenuMais.tsx src/components/common/index.ts src/pages/Finance.tsx
git commit -m "feat(financas): lateral com bancos a conferir, gastos por categoria e caixinhas"
```

---

### Task 6: Clientes que devem

**Files:**
- Modify: `src/components/finance/ReceivablesControlPanel.tsx`, `src/hooks/finance/useReceivablesControl.ts`

**Interfaces:**
- Consumes:
  - `clientesQueDevem` (`clientes.ts`);
  - `linkDoWhatsApp`, `msgCobrancaVencida` (`src/utils/mensagensCliente.ts`);
  - `MenuMais` (Task 5);
  - `abrirContas` (Task 2);
  - `PaymentPlanModal` (já usado no arquivo).
- Produces: nada que outra tarefa use.

- [ ] **Step 1: O gancho carrega o que a aba usa.** Em `useReceivablesControl.ts`:
  - **troque** o `Promise.all` por: `getDeliveredUnpaid()`, `getOrdersNeedingReconciliation()`, `getObligations()`, `getClients()`;
  - **guarde** `contas` e `clientes` em estados novos e devolva-os;
  - **apague** os estados, as cargas e os retornos de `advances`, `byClient`, `byMethod`, `pending`, `methodFrom`/`methodTo`, `totalAdvance` e `dispararPagamento` (spec 3.7: A disparar, Por meio e Adiantamentos saem);
  - **mantenha** `delivered`, `reconciliation`, `applyAdjustment`, `refreshScores`, `busy`, `error` e `reload`.

  Se o tsc apontar outro arquivo que usava o que saiu, siga o tsc.

- [ ] **Step 2: Reescrever o corpo de `ReceivablesControlPanel`.**
  - **Saem:** `TABS`, `AJUDA_ABA`, `AjudaDaAba`, `KpiCard`, `PendingTable`, `AdvancesTable`, `ByMethodTable`, `ByClientTable` e o estado `tab`/`disparo`.
  - **Ficam:** `ReconcileTable` (com o botão Ajustar e a confirmação), `EditPlanButton`, `PaymentPlanModal` e `handleRevise`.

```tsx
export function ReceivablesControlPanel({ abrirContas }: { abrirContas: (f: Partial<FiltrosDaLista>) => void }) {
    const ctl = useReceivablesControl();
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const [editPlan, setEditPlan] = useState<EditPlanCtx | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    const [verDivergencias, setVerDivergencias] = useState(false);
    const linhas = useMemo(() => clientesQueDevem(ctl.contas, hoje), [ctl.contas, hoje]);
    const clientes = useMemo(() => new Map(ctl.clientes.map(c => [c.id, c])), [ctl.clientes]);

    // handleRevise: igual ao de hoje.

    return (
        <div className="mx-auto max-w-[1080px] space-y-10">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">ordenado por quem está há mais tempo vencido</p>
                <MenuMais rotulo="Mais ações" itens={[{ rotulo: 'Recalcular scores dos clientes', onClick: () => void ctl.refreshScores() }]} />
            </div>
            {ctl.error && <p role="alert" className="text-sm text-rose-400">{ctl.error}</p>}

            {ctl.reconciliation.length > 0 && (
                <section className="space-y-3">
                    <button type="button" onClick={() => setVerDivergencias(v => !v)} className="text-left text-sm text-amber-400">
                        {ctl.reconciliation.length} pedido(s) com parcelas que não fecham com o total · {verDivergencias ? 'esconder' : 'ver e ajustar'}
                    </button>
                    {verDivergencias && <ReconcileTable ctl={ctl} />}
                </section>
            )}

            {linhas.length === 0 ? <p className="py-10 text-center text-sm text-zinc-500">Ninguém devendo.</p> : (
                <ul className="divide-y divide-zinc-900">
                    {linhas.map(l => {
                        const cliente = clientes.get(l.clienteId);
                        const maisAntiga = [...l.vencidas].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                        const link = maisAntiga && cliente ? linkDoWhatsApp(cliente.phone, msgCobrancaVencida(cliente,
                            { description: l.vencidas.length > 1 ? `${l.vencidas.length} parcelas` : maisAntiga.description, remaining_amount: l.vencido, due_date: maisAntiga.due_date },
                            l.diasDoMaisAntigo ?? undefined)) : null;
                        const pedidos = ctl.delivered.filter(d => d.client_id === l.clienteId);
                        return (
                            <li key={l.clienteId} className="py-4 space-y-3">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,7rem)_6rem] sm:items-center">
                                    <button type="button" onClick={() => setAberto(aberto === l.clienteId ? null : l.clienteId)} className="min-w-0 text-left" aria-expanded={aberto === l.clienteId}>
                                        <span className="block truncate text-sm text-zinc-200">{cliente?.company_name ?? 'Cliente'}</span>
                                        <span className="block text-xs text-zinc-500">{l.diasDoMaisAntigo === null ? 'nada vencido' : `mais antigo: ${l.diasDoMaisAntigo} dia(s)`}</span>
                                    </button>
                                    <Valor rotulo="Vencido" valor={l.vencido} tom={l.vencido > 0 ? 'text-amber-400' : 'text-zinc-600'} mostrar={mostrar} />
                                    <Valor rotulo="A vencer" valor={l.aVencer} tom="text-zinc-200" mostrar={mostrar} />
                                    <Valor rotulo="Em produção" valor={l.emProducao} tom="text-zinc-500" mostrar={mostrar} />
                                    <div className="sm:text-right">
                                        {l.vencido > 0 && (link
                                            ? <a href={link} target="_blank" rel="noreferrer" aria-label={`Cobrar ${cliente?.company_name ?? 'cliente'} pelo WhatsApp`} className="inline-flex h-10 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-200 hover:bg-zinc-900">Cobrar</a>
                                            : <span className="text-xs text-zinc-500" title="Cliente sem telefone cadastrado">sem telefone</span>)}
                                    </div>
                                </div>
                                {aberto === l.clienteId && (
                                    <div className="space-y-2 rounded-lg bg-zinc-900/40 p-4">
                                        {pedidos.length === 0 ? <p className="text-xs text-zinc-500">Nenhum pedido entregue com saldo.</p> : pedidos.map(p => (
                                            <div key={p.order_id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                                <span className="text-zinc-200">Pedido #{p.order_number}</span>
                                                <span className="text-xs text-zinc-500">entrou {mostrar(Number(p.received))} · falta {mostrar(Number(p.to_receive))}</span>
                                                <EditPlanButton onClick={() => setEditPlan({ orderId: p.order_id, orderNumber: p.order_number, clientId: p.client_id ?? undefined, total: Number(p.total), deliveryDate: p.deadline ?? hoje })} />
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => abrirContas({ clienteId: l.clienteId, rapido: 'abertas' })} className="text-xs text-zinc-400 underline">ver as contas deste cliente</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className="text-xs text-zinc-500">"Em produção" é informativo: não é cobrança nem atraso. Vira "a vencer" quando o pedido for entregue.</p>
            {/* PaymentPlanModal com editPlan: igual ao de hoje */}
        </div>
    );
}

function Valor({ rotulo, valor, tom, mostrar }: { rotulo: string; valor: number; tom: string; mostrar: (n: number) => string }) {
    return (
        <span className="flex justify-between gap-2 sm:block sm:text-right">
            <span className="text-xs text-zinc-500 sm:hidden">{rotulo}</span>
            <span className={`text-sm tabular-nums ${tom}`}>{valor > 0 ? mostrar(valor) : '—'}</span>
        </span>
    );
}
```

  - No computador, a linha é uma grade (Cliente | Vencido | A vencer | Em produção | Cobrar), com um cabeçalho `hidden sm:grid` de rótulos em `text-xs text-zinc-500` acima do `<ul>`. No celular, cada cliente é um cartão empilhado, com rótulo ao lado de cada valor (`Valor`).
  - Mantenha o `deliveryDate` que o `handleRevise` de hoje usava. Se `DeliveredUnpaidRow` tiver um campo de data de entrega melhor que `deadline`, use-o.
  - Reestilize `ReconcileTable` e `EditPlanButton` pelas Global Constraints: rótulos normais, sem `rose`, botão de 40px.

- [ ] **Step 3: Tipos, suíte e commit.** Os dois limpos.

```bash
git add src/components/finance/ReceivablesControlPanel.tsx src/hooks/finance/useReceivablesControl.ts
git commit -m "feat(financas): Clientes que devem — cobrar, pedidos com plano, divergências"
```

---

### Task 7: Caixinhas

**Files:**
- Modify: `src/components/finance/EnvelopesPanel.tsx`

**Interfaces:**
- Consumes: `MenuMais` (Task 5), `progressoDaMeta` (`caixinhas.ts`), `useMostrarValor`.
- Produces: nada.

Leia o `EnvelopesPanel.tsx` inteiro antes. As ações de banco que ele chama (alocar, liberar, transferir, extrato, excluir, salvar e provisionar) **ficam todas**. Só muda onde cada uma aparece (spec 3.8).

- [ ] **Step 1: Topo.** No lugar do cabeçalho atual, três números em `grid sm:grid-cols-3 gap-8`, todos de `getEnvelopeOverview` (o painel já o carrega):
  - **Livre para usar** (`text-3xl font-semibold`);
  - **Nos bancos**;
  - **Nas caixinhas**.

  À direita: `+ Nova caixinha` (botão secundário) e um `MenuMais` com `[{ rotulo: 'Distribuir um valor…', onClick: <abre o provisionar de hoje> }]`. O botão "Provisionar" à vista sai: o dia a dia é a sugestão na baixa (triagem 34).

- [ ] **Step 2: Cada caixinha.** Cartão sem sombra (`rounded-xl bg-zinc-900/40 p-5 space-y-4`):
  - nome, com o ponto da cor;
  - saldo (`text-lg font-semibold tabular-nums`);
  - barra fina da meta (`h-1`) com "meta R$ X · N%" via `progressoDaMeta`, só se houver meta;
  - à vista, **Guardar** e **Tirar** (botões secundários de 40px), que abrem o mesmo campo de valor de hoje (`+ Alocar`/`− Liberar`);
  - um `MenuMais` com: `Extrato e transferir`, que abre o extrato de hoje, onde já está o Transferir; `Editar`; e `Excluir` (`perigo: true`, com a confirmação de hoje).
  - Sai a linha "⚠ Abaixo do mínimo" (triagem 35).

- [ ] **Step 3: Formulário da caixinha.**
  - **Saem da tela:** os campos "Prazo da meta" e "Saldo mínimo (alerta)". Ao salvar, envie `target_date: initial.target_date` e `min_balance: initial.min_balance ?? 0` (o valor que já existia), para não apagar dado gravado.
  - **Ficam:** nome, cor, finalidade, meta, notas e "% automático".
  - **Visual:** campos `h-10`, `p-6`, e um botão principal "Salvar".
  - **Se for janela própria com `fixed inset-0`:** ela sai em `createPortal(…, document.body)`.

- [ ] **Step 4: Texto de rodapé.** "Nenhuma caixinha move dinheiro de verdade: é um rótulo sobre o saldo dos bancos." (`text-xs text-zinc-500`).

- [ ] **Step 5: Tipos, suíte e commit.** Os dois limpos. Se o `EnvelopesPanel` passar a usar `createPortal`, confira que ele não estava em `DIVIDA_CONHECIDA` (não está).

```bash
git add src/components/finance/EnvelopesPanel.tsx
git commit -m "feat(financas): Caixinhas — guardar e tirar à vista, o resto no ⋯, meta sem prazo"
```

---

### Task 8: Resultado e janelas — visual e portal

**Files:**
- Modify: `src/pages/Resultado.tsx`, `src/components/finance/PaymentModal.tsx`, `src/components/finance/EditarContaModal.tsx`, `src/components/finance/ObligationForm.tsx`, `src/components/finance/ConfirmModal.tsx`, `src/components/finance/ConfirmarLiquidacao.tsx`, `src/components/modals/BankAccountModal.tsx`, `src/pages/Finance.tsx` (janela de desfazer conferência), `src/utils/sobreposicoes.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada. É só visual, sem mudança de comportamento.

- [ ] **Step 1: Resultado.**
  - **Cabeçalho:** o `h1` acompanha o período (`Resultado de {rotulo}`). Saem os `uppercase tracking-wider` dos `h2` (viram `text-xs text-zinc-500`).
  - **Espaço:** as linhas do caixa passam de `py-1.5` para `py-2.5`, e a grade `gap-8` vira `gap-12`. O `space-y-5` da raiz vira `mx-auto max-w-[1080px] space-y-10`.
  - **Barras:** `h-2` vira `h-1`, com `rounded-full`, e o texto da barra fica acima dela, como nos Gastos da Task 5.
  - **Lucro:** o lucro positivo fica `text-white`, e o negativo, `text-amber-400`.
  - **Ajuda:** o texto de ajuda das barras diz "Clicar numa barra abre Contas filtrada por aquela categoria."

- [ ] **Step 2: Janelas.** Em cada janela da lista **Files**, sem mudar estado nem gravação:
  - raiz renderizada com `createPortal(…, document.body)` (importe de `react-dom`);
  - corpo com `p-6` e campos `h-10` (`text-sm`; rótulos `text-xs text-zinc-500`, sem `uppercase`/`tracking`/`font-black`);
  - um único botão principal (`bg-zinc-100 text-zinc-950`) no rodapé, com os outros secundários;
  - sem `rose` fora de erro e de ação destrutiva (Estornar, Cancelar, Excluir, Inativar).

  A janela de desfazer conferência em `Finance.tsx` (`{/* UNDO RECONCILIATION MODAL */}`) também passa para portal. Nela, o botão "Desfazer" fica desabilitado enquanto `undoReason.trim()` estiver vazio.

- [ ] **Step 3: Dívida de portal.** Rode `node --test --experimental-strip-types src/utils/sobreposicoes.test.ts`. O teste `'a lista de dívida só encolhe'` vai listar os arquivos portados. Remova exatamente esses de `DIVIDA_CONHECIDA` e rode de novo, até dar PASS.

- [ ] **Step 4: Tipos, suíte e commit.** Os dois limpos.

```bash
git add src/pages/Resultado.tsx src/components/finance src/components/modals/BankAccountModal.tsx src/pages/Finance.tsx src/utils/sobreposicoes.test.ts
git commit -m "style(financas): Resultado e janelas mais leves, todas em portal"
```

---

### Task 9: Limpeza e roteiro de conferência

**Files:**
- Delete:
  - `src/pages/financas/` (a pasta inteira);
  - `src/components/financas/JanelaDaConta.tsx`;
  - `src/components/financas/caixinhas/` (a pasta inteira);
  - e, **só se o grep não achar outro uso**: `src/components/finance/CashSimulator.tsx`, `CategoryPieChart.tsx`, `CashflowChart.tsx`, `src/components/finance/ui/SkeletonCard.tsx`, `src/components/finance/SmartFilterLabel.tsx`, `src/hooks/finance/useFinanceActions.ts`, `src/hooks/finance/useFinanceKPIs.ts`.
- Modify: `src/components/finance/index.ts`, `src/components/finance/ui/index.ts` (tirar os exports apagados)

- [ ] **Step 1: Conferir uso.** Para cada candidato, rode `grep -rn "<Nome>" src --include=*.ts --include=*.tsx`. Só apague o que aparecer apenas no próprio arquivo e nos `index.ts`.
  - `src/utils/obligationFilters.ts` e o teste dele ficam se outra tela os usar. Se só o `SmartFilterLabel` os usava, apague os três juntos.
  - `storageService.getFinancePresets`/`saveFinancePresets`, `getLiquidityKPIs`, `getCashflowSeries`, `getAgingBuckets` e `getCashPosition` ficam no serviço: as funções do banco continuam existindo, e apagar um método de serviço não tira nada da tela.

- [ ] **Step 2: Apagar e corrigir exports.** Apague os arquivos, tire os exports dos `index.ts` e rode `npx tsc --noEmit` e a suíte, os dois limpos.

- [ ] **Step 3: Atualizar a nota de fechamento.** Em `docs/superpowers/notes/2026-10-06-financeiro-v3-fechamento.md`, na seção "Antes de apagar as telas antigas (portão)", acrescente:

```markdown
- 07/10: decisão de adaptar a tela atual em vez de manter as telas novas (spec 2026-10-07-financas-v3-adaptacao-design.md). I4 resolvido: desfazer conferência com motivo continua no cartão da conta. O teto de navegação fica em 4 até o Resultado ir para "Como estamos indo".
```

- [ ] **Step 4: Commit**

```bash
git add -A src docs/superpowers/notes/2026-10-06-financeiro-v3-fechamento.md
git commit -m "chore(financas): sai a Finanças v3 paralela; fica uma tela só"
```

- [ ] **Step 5: Roteiro no navegador (controlador).** O controlador faz, com o usuário de teste em `http://localhost:5175`, nas larguras 1440, 1024 e 390 px:
  1. Contas: os números batem com a conferência SQL:
     - receber vencido 28.552,35;
     - receber 7 dias 1.927,60;
     - pagar vencido 15.926,16;
     - pagar 7 dias 2.724,55;
     - livre 56.804,85.
  2. Abrir e usar uma vez cada linha das tabelas 3.1 a 3.9 da spec, uma por uma, marcando o que passou.
  3. Os itens do Review Focus, um a um. Modo privacidade ligado: nenhum R$ visível.
  4. Sem rolagem horizontal em 390px; os ícones da linha visíveis no celular.
  5. Console sem erros.

  Qualquer falha volta como correção da tarefa dona e ganha um commit novo.

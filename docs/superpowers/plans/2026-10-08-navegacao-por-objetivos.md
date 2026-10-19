# Navegação por objetivos (S1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O ERP passa a ser navegado por objetivos. O menu global à esquerda traz contadores. O Início vira a fila do que precisa do Luiz. Cada objetivo tem uma barra de passos, e cada etapa termina oferecendo a próxima.

**Architecture:** O mapa da navegação (`src/utils/navegacao.ts`) passa a ter seções-objetivo cujos passos são views. Cada passo do PCP vira uma view própria, que monta o componente `PCP` só com as abas dela. A fila do Início é uma função pura (`src/utils/inicio/fila.ts`) sobre dados carregados uma vez por um gancho no `App`. Esse gancho também alimenta os contadores do menu. A cadeia de próximos passos usa um cartão pequeno (`ProximoPasso`), posto onde cada ação termina.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, Supabase. Testes com `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-06-navegacao-por-objetivos-design.md` (rev. 2, commit `9d740e1`). Roteiro: `docs/superpowers/specs/2026-10-08-roteiro-v3-design.md`.

## Global Constraints

- **Ambiente:**
  - pasta `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`;
  - nenhuma tarefa mexe em banco: não há SQL neste plano;
  - os implementadores não sobem servidor; a conferência no navegador é do controlador (porta 5175; v2 de referência na 5176).
- **Comandos:**
  - testes: `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts"`;
  - tipos: `npx tsc --noEmit`;
  - os dois limpos ao fim de cada tarefa.
- **Visual** — só as classes de `src/components/finance/ui/estilo.ts` e o `Indicador`:
  - classes: `CARTAO`, `ITEM`, `ROTULO`, `ROTULO_PEQUENO`, `BOTAO_PRINCIPAL`, `BOTAO_SUAVE`, `BOTAO_SECUNDARIO`, `pilula()`;
  - urgente e vencido em rosa (`rose-400/500`); ação principal em âmbar;
  - nenhuma cor nova.
- **Janelas e gavetas** abrem com `createPortal(…, document.body)`; o teste `src/utils/sobreposicoes.test.ts` obriga.
- **Privacidade:** todo valor em R$ passa por `mostrar()` de `src/hooks/financas/useMostrarValor.ts`.
- **Nuance é lei:** nenhuma tela de hoje some sem destino; todo atalho de dinheiro tem "mais opções" para a janela completa (spec, critério 4).
- **Papel `factory`:** continua no layout próprio. Vê só Quadro, Controle parcial e Rendimento do corte (`ABAS_DA_FABRICA`), e o resto do app segue bloqueado para ele.
- **Commits:** terminam com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Link antigo ou alerta que manda para `pcp` ou `production`:** abre o Quadro, sem tela em branco nem tela errada. Teste em `navegacao.test.ts` (Task 2).
2. **Fila sem nada pendente:** mostra "Nada pendente — bom trabalho", sem blocos vazios nem contadores no menu. Teste em `fila.test.ts` (Task 3).
3. **Trocar de passo dentro da mesma seção** (Quadro → Controle parcial): mostra o painel do novo passo, e não o anterior preso no estado. O `PCP` recebe `key` pela view (Task 2, conferência do controlador).
4. **Usuário `factory` logado:** não vê o menu, nem o Início, nem a fila, e nenhum contador é carregado para ele. O gancho da fila fica desligado para esse papel (Task 4).
5. **Celular (390px):** o menu é uma gaveta que fecha ao escolher, a barra de passos rola para o lado sem encavalar e não há rolagem horizontal da página. Conferência do controlador (Tasks 5 e 10).

---

## Arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `src/pages/PCP.tsx` | recebe `abas`, exporta `PcpTab` e `ABAS_DA_FABRICA` | 1 |
| `src/utils/navegacao.ts` (+ teste) | seções-objetivo, views-passo, aliases | 2 |
| `src/components/layout/icones.ts` (novo) | ícone de cada view e de cada seção | 2 |
| `src/components/layout/BarraDePassos.tsx` (vem de `AbasDaSecao.tsx`) | barra de passos numerada | 2 |
| `src/App.tsx` | rotas das views novas, menu, fila, aberturas | 2, 4, 5, 6 |
| `src/utils/inicio/fila.ts` (+ teste) | fila e contadores, puros | 3 |
| `src/hooks/inicio/useFilaDoInicio.ts` (novo) | carrega os dados e monta a fila | 4 |
| `src/pages/Inicio.tsx` (novo) | resumo e fila | 4 |
| `src/components/layout/MenuDoApp.tsx` (novo, substitui `LateralDaSecao.tsx`) | menu global com contadores e gaveta no celular | 5 |
| `src/components/layout/BarraDeTopo.tsx` | perde as seções e ganha o botão de menu no celular | 5 |
| `src/pages/Finance.tsx`, `src/pages/Budgets.tsx`, `src/components/pcp/KanbanPanel.tsx` | aceitar a abertura vinda da fila | 6 |
| `src/utils/vendas/produtos.ts` (+ teste), `src/components/vendas/ProdutosEMercado.tsx`, `src/pages/ItensVendidos.tsx` | Produtos & mercado sai do Painel | 7 |
| `src/components/common/ProximoPasso.tsx` (novo), `src/pages/Budgets.tsx` | cadeia de Vender | 8 |
| `src/components/pcp/KanbanPanel.tsx`, `CronogramaPanel.tsx`, `PurchaseListPanel.tsx` | cadeia de Produção e Planejar | 9 |
| `src/utils/cabeNaSemana.ts` (+ teste), `src/components/budgets/BudgetEditor.tsx`, `src/pages/PCP.tsx` | "cabe na semana?" e a saída do Simulador | 10 |

---

### Task 1: O PCP desenha só as abas que recebe

**Files:**
- Modify: `src/pages/PCP.tsx`, `src/App.tsx` (os três usos de `<PCP …>`)

**Interfaces:**
- Produces:
  - `export type PcpTab = 'dashboard' | 'kanban' | 'schedule' | 'simulator' | 'purchases' | 'capacity' | 'control' | 'desempenho' | 'nao-apurado' | 'rendimento'`;
  - `export const ABAS_DA_FABRICA: PcpTab[] = ['kanban', 'control', 'rendimento']`;
  - `export function PCP(props: { abas: PcpTab[]; semFinanceiro?: boolean; onGoToProducts?: () => void })`.

- [ ] **Step 1: Reescrever o componente.** Em `src/pages/PCP.tsx`:
  - exporte o tipo `PcpTab` e troque `FACTORY_TABS` por `export const ABAS_DA_FABRICA: PcpTab[] = ['kanban', 'control', 'rendimento'];`;
  - troque `Props` e o corpo por:

```tsx
interface Props {
    /** As abas que esta tela mostra, na ordem. Com uma só, não há barra interna. */
    abas: PcpTab[];
    /** Papel `factory`: o quadro esconde valores. */
    semFinanceiro?: boolean;
    /** Navega para Cadastros (ficha técnica faltante no Kanban). */
    onGoToProducts?: () => void;
}

export function PCP({ abas, semFinanceiro = false, onGoToProducts }: Props) {
    const visiveis = useMemo(() => TABS.filter(t => abas.includes(t.key)), [abas]);
    const [tab, setTab] = useState<PcpTab>(abas[0]);

    return (
        <div className="space-y-5">
            {visiveis.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-800 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {visiveis.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={pilula(tab === t.key)}>
                                <Icon size={14} /> {t.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {tab === 'kanban' && <KanbanPanel onGoToProducts={onGoToProducts} semFinanceiro={semFinanceiro} />}
            {tab === 'control' && <ProductionControlPanel />}
            {tab === 'desempenho' && <DesempenhoPanel />}
            {tab === 'rendimento' && <RendimentoDoCortePanel />}
            {tab === 'nao-apurado' && <ConsumoNaoApuradoPanel onGoToProducts={onGoToProducts} />}
            {tab === 'dashboard' && <DashboardPanel />}
            {tab === 'schedule' && <CronogramaPanel />}
            {tab === 'simulator' && <SimuladorPanel />}
            {tab === 'purchases' && <PurchaseListPanel />}
            {tab === 'capacity' && <CapacityPanel />}
        </div>
    );
}
```

  - Importe `pilula` de `@/components/finance/ui/estilo`.
  - Proteção do papel `factory`: ela fica no `App`, que só monta `ABAS_DA_FABRICA` para esse papel. O `!factoryMode &&` sai.

- [ ] **Step 2: Callers no `App.tsx`.** Os três usos passam a ser:
  - `case 'production'` e `case 'pcp'`: `<PCP key={currentView} abas={['dashboard','kanban','schedule','simulator','purchases','capacity','control','nao-apurado','rendimento','desempenho']} onGoToProducts={() => setCurrentView('masterdata')} />`. É provisório; a Task 2 troca pelas views novas.
  - `renderContent` do papel `factory` e o layout `factory`: `<PCP abas={ABAS_DA_FABRICA} semFinanceiro />`.
  - Importe `ABAS_DA_FABRICA` de `@/pages/PCP`. Confira como o `PCP` é importado no `App` (lazy ou direto) e mantenha o mesmo jeito.

- [ ] **Step 3: Tipos e testes.** `npx tsc --noEmit` e a suíte (Global Constraints), os dois limpos.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PCP.tsx src/App.tsx
git commit -F - <<'EOF'
refactor(pcp): PCP recebe as abas que mostra; papel fábrica usa ABAS_DA_FABRICA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Seções-objetivo, passos como views e barra de passos

**Files:**
- Modify: `src/utils/navegacao.ts`, `src/utils/navegacao.test.ts`, `src/App.tsx`, `src/components/layout/BarraDeTopo.tsx`, `src/components/layout/LateralDaSecao.tsx`, `src/utils/alertasOperacionais.ts` (tipo `DestinoDoAlerta`, se o tsc pedir)
- Create: `src/components/layout/icones.ts`, `src/components/layout/BarraDePassos.tsx`
- Delete: `src/components/layout/AbasDaSecao.tsx` (vira `BarraDePassos.tsx`)

**Interfaces:**
- Consumes: `PcpTab` (Task 1).
- Produces:
  - em `navegacao.ts`: `View`, `SecaoId`, `Secao`, `SECOES`, `ROTULO_DA_VIEW`, `ALIAS_DE_VIEW`, `viewReal(v)`, `secaoDaView(v)`, `secaoPorId(id)`, `viewsDaSecao(id)`, `viewInicialDaSecao(id)`, `temPassos(id)`, `todasAsViewsDoMenu()`, `FORA_DO_MENU`;
  - `ICONE_DA_VIEW: Record<View, LucideIcon>` e `ICONE_DA_SECAO: Record<SecaoId, LucideIcon>` em `icones.ts`;
  - `<BarraDePassos secao viewAtual onNavegar />`.

- [ ] **Step 1: Reescrever os testes.** Substitua o conteúdo de `src/utils/navegacao.test.ts` por:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SECOES, ROTULO_DA_VIEW, secaoDaView, viewsDaSecao, viewInicialDaSecao, temPassos,
    todasAsViewsDoMenu, viewReal, FORA_DO_MENU, secaoPorId,
} from './navegacao.ts';
import type { View } from './navegacao.ts';

const TODAS: View[] = [
    'dashboard', 'budgets', 'orders', 'quadro', 'controle-parcial', 'consumo', 'cronograma', 'compras',
    'inventory', 'finance', 'receivables', 'envelopes', 'resultado', 'itens-vendidos', 'indicadores',
    'masterdata', 'capacidade', 'board', 'leads', 'pcp', 'production', 'login',
];

test('toda view tem dono no menu ou uma saída declarada', () => {
    const noMenu = new Set(todasAsViewsDoMenu());
    for (const v of TODAS) assert.ok(noMenu.has(v) || FORA_DO_MENU.includes(v), `${v} sem lugar`);
});

test('nenhuma view aparece em duas seções', () => {
    const vistas = todasAsViewsDoMenu();
    assert.equal(new Set(vistas).size, vistas.length);
});

test('toda view tem rótulo', () => {
    for (const v of TODAS) assert.ok(ROTULO_DA_VIEW[v], v);
});

test('a ordem do menu: Início, os cinco objetivos, depois os apoios', () => {
    assert.deepEqual(SECOES.map(s => s.id),
        ['inicio', 'vender', 'producao', 'planejar', 'dinheiro', 'resultados', 'cadastros', 'notas']);
    assert.deepEqual(SECOES.filter(s => s.tipo === 'objetivo').map(s => s.id),
        ['vender', 'producao', 'planejar', 'dinheiro', 'resultados']);
    assert.deepEqual(SECOES.filter(s => s.tipo === 'apoio').map(s => s.id), ['cadastros', 'notas']);
});

test('cada objetivo traz os passos na ordem do desenho', () => {
    assert.deepEqual(viewsDaSecao('vender'), ['budgets', 'orders']);
    assert.deepEqual(viewsDaSecao('producao'), ['quadro', 'controle-parcial', 'consumo']);
    assert.deepEqual(viewsDaSecao('planejar'), ['cronograma', 'compras', 'inventory']);
    assert.deepEqual(viewsDaSecao('dinheiro'), ['finance', 'receivables', 'envelopes']);
    assert.deepEqual(viewsDaSecao('resultados'), ['resultado', 'itens-vendidos', 'indicadores']);
    assert.deepEqual(viewsDaSecao('cadastros'), ['masterdata', 'capacidade']);
});

test('nenhuma seção passa de 3 passos', () => {
    for (const s of SECOES) assert.ok(s.views.length <= 3, `${s.id} tem ${s.views.length}`);
});

test('só os objetivos com ordem natural são numerados', () => {
    const numerados = SECOES.filter(s => s.numerado).map(s => s.id);
    assert.deepEqual(numerados, ['vender', 'producao', 'planejar']);
});

test('links antigos do PCP abrem o Quadro', () => {
    assert.equal(viewReal('pcp'), 'quadro');
    assert.equal(viewReal('production'), 'quadro');
    assert.equal(viewReal('finance'), 'finance');
    assert.equal(secaoDaView('pcp'), 'producao');
});

test('Prospecção sai do menu, mas a view continua existindo', () => {
    assert.ok(!todasAsViewsDoMenu().includes('leads'));
    assert.ok(FORA_DO_MENU.includes('leads'));
    assert.equal(secaoDaView('leads'), null);
});

test('clicar num objetivo abre o primeiro passo dele', () => {
    assert.equal(viewInicialDaSecao('dinheiro'), 'finance');
    assert.equal(viewInicialDaSecao('producao'), 'quadro');
    assert.equal(viewInicialDaSecao('inicio'), 'dashboard');
});

test('barra de passos só aparece com mais de um passo', () => {
    assert.equal(temPassos('vender'), true);
    assert.equal(temPassos('inicio'), false);
    assert.equal(temPassos('notas'), false);
    assert.equal(temPassos(null), false);
});

test('seção inexistente não quebra', () => {
    assert.deepEqual(viewsDaSecao(undefined), []);
    assert.equal(secaoPorId(null), null);
    assert.equal(secaoDaView('login'), null);
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test --experimental-strip-types src/utils/navegacao.test.ts`: FAIL (as exportações novas não existem).

- [ ] **Step 3: Reescrever `src/utils/navegacao.ts`.** Troque o comentário do topo por um curto ("Navegação por objetivos — ver docs/superpowers/specs/2026-10-06-navegacao-por-objetivos-design.md. Sem imports do app, para ser testado com node --test.") e o resto por:

```ts
export type View =
    | 'dashboard'
    | 'budgets' | 'orders'
    | 'quadro' | 'controle-parcial' | 'consumo'
    | 'cronograma' | 'compras' | 'inventory'
    | 'finance' | 'receivables' | 'envelopes'
    | 'resultado' | 'itens-vendidos' | 'indicadores'
    | 'masterdata' | 'capacidade'
    | 'board'
    | 'leads'
    | 'pcp' | 'production'
    | 'login';

/** `notas` e não `quadro`: `quadro` já é a view do Kanban. */
export type SecaoId = 'inicio' | 'vender' | 'producao' | 'planejar' | 'dinheiro' | 'resultados' | 'cadastros' | 'notas';

export interface Secao {
    id: SecaoId;
    rotulo: string;
    /** Frase curta do que se faz aqui — vira a dica (title) no menu. */
    descricao: string;
    tipo: 'inicio' | 'objetivo' | 'apoio';
    /** Os passos, na ordem. */
    views: View[];
    /** Passos com ordem natural (1 → 2 → 3). Consultas irmãs não são numeradas. */
    numerado: boolean;
}

export const ROTULO_DA_VIEW: Record<View, string> = {
    dashboard: 'Início',
    budgets: 'Orçamentos',
    orders: 'Pedidos',
    quadro: 'Quadro',
    'controle-parcial': 'Controle parcial',
    consumo: 'Consumo não apurado',
    cronograma: 'Cronograma',
    compras: 'Lista de compras',
    inventory: 'Estoque',
    finance: 'Contas',
    receivables: 'Clientes que devem',
    envelopes: 'Caixinhas',
    resultado: 'Resultado',
    'itens-vendidos': 'Vendas',
    indicadores: 'Fábrica',
    masterdata: 'Cadastros',
    capacidade: 'Setores e capacidade',
    board: 'Quadro de notas',
    leads: 'Prospecção',
    pcp: 'Quadro',
    production: 'Quadro',
    login: 'Entrar',
};

export const SECOES: Secao[] = [
    { id: 'inicio', rotulo: 'Início', descricao: 'O que precisa de você hoje', tipo: 'inicio', views: ['dashboard'], numerado: false },
    { id: 'vender', rotulo: 'Vender', descricao: 'Do orçamento ao pedido', tipo: 'objetivo', views: ['budgets', 'orders'], numerado: true },
    { id: 'producao', rotulo: 'Como está a produção', descricao: 'O pedido andando pelos setores', tipo: 'objetivo', views: ['quadro', 'controle-parcial', 'consumo'], numerado: true },
    { id: 'planejar', rotulo: 'Planejar a semana', descricao: 'O que a fábrica faz e o que comprar', tipo: 'objetivo', views: ['cronograma', 'compras', 'inventory'], numerado: true },
    { id: 'dinheiro', rotulo: 'Dinheiro', descricao: 'Pagar, receber e reservar', tipo: 'objetivo', views: ['finance', 'receivables', 'envelopes'], numerado: false },
    { id: 'resultados', rotulo: 'Como estamos indo', descricao: 'Lucro, vendas e fábrica', tipo: 'objetivo', views: ['resultado', 'itens-vendidos', 'indicadores'], numerado: false },
    { id: 'cadastros', rotulo: 'Cadastros', descricao: 'Clientes, produtos, empresa e setores', tipo: 'apoio', views: ['masterdata', 'capacidade'], numerado: false },
    { id: 'notas', rotulo: 'Quadro de notas', descricao: 'Recados e rascunhos', tipo: 'apoio', views: ['board'], numerado: false },
];

/** Rotas antigas que continuam valendo (links, alertas). */
export const ALIAS_DE_VIEW: Partial<Record<View, View>> = { pcp: 'quadro', production: 'quadro' };

/** Views que existem e não moram no menu — cada uma com o motivo. */
export const FORA_DO_MENU: View[] = [
    'leads',      // Prospecção em espera (o Luiz usa o Explee); o código fica
    'pcp',        // alias → quadro
    'production', // alias → quadro
    'login',
];

export const viewReal = (v: View): View => ALIAS_DE_VIEW[v] ?? v;

const POR_VIEW = new Map<View, SecaoId>();
for (const s of SECOES) for (const v of s.views) POR_VIEW.set(v, s.id);

export const secaoDaView = (view: View | null | undefined): SecaoId | null =>
    (view && POR_VIEW.get(viewReal(view))) || null;

export const secaoPorId = (id: SecaoId | null | undefined): Secao | null =>
    SECOES.find(s => s.id === id) || null;

export const viewsDaSecao = (id: SecaoId | null | undefined): View[] =>
    secaoPorId(id)?.views || [];

export const viewInicialDaSecao = (id: SecaoId): View =>
    viewsDaSecao(id)[0] || 'dashboard';

/** A barra de passos só faz sentido com mais de um passo. */
export const temPassos = (id: SecaoId | null | undefined): boolean =>
    viewsDaSecao(id).length > 1;

export const todasAsViewsDoMenu = (): View[] => SECOES.flatMap(s => s.views);
```

- [ ] **Step 4: Rodar e ver passar.** O mesmo comando: PASS.

- [ ] **Step 5: Ícones.** Crie `src/components/layout/icones.ts` com os dois mapas:
  - **`ICONE_DA_VIEW`** (um ícone `lucide-react` por view):
    - dashboard `LayoutDashboard`, budgets `FileText`, orders `ShoppingBag`;
    - quadro `KanbanSquare`, `controle-parcial` `PackageCheck`, consumo `PackageX`;
    - cronograma `CalendarClock`, compras `ShoppingCart`, inventory `Package`;
    - finance `DollarSign`, receivables `Wallet`, envelopes `PiggyBank`;
    - resultado `BarChart3`, `itens-vendidos` `ShoppingBag`, indicadores `Gauge`;
    - masterdata `Database`, capacidade `Settings2`, board `NotebookPen`;
    - leads `Radar`, pcp `KanbanSquare`, production `KanbanSquare`, login `LayoutDashboard`.
  - **`ICONE_DA_SECAO`:**
    - inicio `LayoutDashboard`, vender `ShoppingBag`, producao `Factory`, planejar `CalendarClock`;
    - dinheiro `DollarSign`, resultados `BarChart3`, cadastros `Database`, notas `NotebookPen`.
  - Em `LateralDaSecao.tsx` e `BarraDeTopo.tsx`, troque os mapas locais por esses dois (a lateral some na Task 5; aqui ela só precisa compilar).

- [ ] **Step 6: `BarraDePassos`.** Renomeie `AbasDaSecao.tsx` para `BarraDePassos.tsx` (`git mv`). O componente passa a se chamar `BarraDePassos` e ganha a numeração:

```tsx
import { viewsDaSecao, secaoPorId, ROTULO_DA_VIEW } from '@/utils/navegacao';
import type { SecaoId, View } from '@/utils/navegacao';
import { pilula } from '@/components/finance/ui/estilo';
import { ICONE_DA_VIEW } from './icones';

interface Props { secao: SecaoId; viewAtual: View; onNavegar: (v: View) => void }

/** Os passos do objetivo, no formato das abas do PCP. Numerados quando há ordem (1 → 2 → 3). */
export function BarraDePassos({ secao, viewAtual, onNavegar }: Props) {
    const numerado = !!secaoPorId(secao)?.numerado;
    return (
        <nav aria-label="Passos" className="shrink-0 px-5 pt-4 print:hidden">
            <div className="flex gap-2 overflow-x-auto border-b border-zinc-800 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {viewsDaSecao(secao).map((v, i) => {
                    const Icone = ICONE_DA_VIEW[v];
                    return (
                        <button key={v} type="button" onClick={() => onNavegar(v)}
                            aria-current={v === viewAtual ? 'page' : undefined} className={pilula(v === viewAtual)}>
                            {numerado
                                ? <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[9px]">{i + 1}</span>
                                : <Icone size={13} />}
                            {ROTULO_DA_VIEW[v]}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
```

- [ ] **Step 7: Rotas no `App.tsx`.**
  - **`handleNavigate`:**
    - resolve o alias: `const alvo = viewReal(view);`;
    - o bloqueio do papel `factory` continua: retorna se `userProfile?.role === 'factory'`; o layout dele não usa `handleNavigate`;
    - depois chama `setCurrentView(alvo)`.
  - **`renderContent`**, os `case` novos:
    - `'quadro'` → `<PCP key="quadro" abas={['kanban']} onGoToProducts={…} />`;
    - `'controle-parcial'` → `abas={['control']}`;
    - `'consumo'` → `abas={['nao-apurado']}`;
    - `'cronograma'` → `abas={['schedule']}`;
    - `'compras'` → `abas={['purchases']}`;
    - `'indicadores'` → `abas={['dashboard', 'desempenho', 'rendimento']}`;
    - `'capacidade'` → `abas={['capacity']}`;
    - cada um com `key` igual ao nome da view, para trocar de passo resetar o estado.
  - **`'pcp'` e `'production'`** saem do `switch`, porque o alias já resolve.
  - **`'leads'`** continua no `switch`: a view existe, só não está no menu.
  - **Layout:**
    - troque `temAbas`/`AbasDaSecao` por `temPassos(secaoAtual) && <BarraDePassos …/>`;
    - remova o uso de `temLateral` e a renderização da `LateralDaSecao`; o menu novo chega na Task 5, e até lá a barra de cima lista as seções novas, porque usa `SECOES`;
    - `irParaSecao` continua igual.
  - **Abertura para o papel `factory`:** o `checkSession` passa `'quadro'` no lugar de `'pcp'`.
  - **Simulador:** não ganha view. Ele sai com a Task 10, e até lá não aparece em lugar nenhum. Isso é intencional: o spec manda o simulador para dentro do orçamento.

- [ ] **Step 8: Destinos de alerta.** Em `src/utils/alertasOperacionais.ts`, `DestinoDoAlerta` continua aceitando `'pcp'` (o alias resolve). Se o tsc reclamar de algum `Record<View, …>` ou de um tipo de `onNavigate` que lista views (por exemplo em `Dashboard.tsx`), acrescente as views novas. Não remova as antigas que ainda são usadas.

- [ ] **Step 9: Tipos, suíte e commit.** Os dois limpos.

```bash
git add -A src/utils/navegacao.ts src/utils/navegacao.test.ts src/components/layout src/App.tsx src/utils/alertasOperacionais.ts src/pages
git commit -F - <<'EOF'
feat(navegacao): seções por objetivo, cada passo é uma view, barra de passos numerada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A fila do Início (pura)

**Files:**
- Create: `src/utils/inicio/fila.ts`, `src/utils/inicio/fila.test.ts`

**Interfaces:**
- Consumes: `pedidosAtrasados`, `insumosAbaixoDoMinimo`, `orcamentosSemResposta` e os tipos `PedidoParaAlerta`, `InsumoParaAlerta`, `OrcamentoParaAlerta` de `src/utils/alertasOperacionais.ts`.
- Produces: `ObjetivoDaFila`, `DestinoDaFila`, `LinhaDaFila`, `BlocoDaFila`, `EntradaDaFila`, `montarFila(e): BlocoDaFila[]`, `contadoresDoMenu(blocos): Record<ObjetivoDaFila, { n: number; urgente: boolean }>`, `pedidosEmProducao(pedidos): number`.

- [ ] **Step 1: Escrever os testes que falham.** `src/utils/inicio/fila.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFila, contadoresDoMenu, pedidosEmProducao } from './fila.ts';
import type { EntradaDaFila } from './fila.ts';

const HOJE = '2026-10-08';
const vazia: EntradaDaFila = {
    hoje: HOJE, orcamentos: [], pedidos: [], ultimoSetor: 'Expedição', consumoNaoApurado: 0, insumos: [],
    clientesComVencido: 0, pagarVencido: { quantidade: 0, total: 0 }, bancosAConferir: [],
    fechaOMesCom: 100, nomeDoMes: 'outubro', dinheiro: v => `R$ ${v.toFixed(2)}`,
};

test('sem nada pendente, a fila vem vazia e o menu sem contador', () => {
    const blocos = montarFila(vazia);
    assert.deepEqual(blocos, []);
    assert.deepEqual(contadoresDoMenu(blocos), {
        vender: { n: 0, urgente: false }, producao: { n: 0, urgente: false },
        planejar: { n: 0, urgente: false }, dinheiro: { n: 0, urgente: false },
    });
});

test('linha com zero some e bloco vazio some', () => {
    const blocos = montarFila({ ...vazia, consumoNaoApurado: 2 });
    assert.deepEqual(blocos.map(b => b.objetivo), ['producao']);
    assert.equal(blocos[0].linhas.length, 1);
    assert.match(blocos[0].linhas[0].texto, /2 itens/);
});

test('blocos na ordem do menu; urgente primeiro dentro do bloco', () => {
    const blocos = montarFila({
        ...vazia,
        pedidos: [
            { id: 'p1', order_number: '1', deadline: '2026-10-01', status: 'Em Produção', production_stage: 'Costura' },
            { id: 'p2', order_number: '2', deadline: '2026-12-01', status: 'Em Produção', production_stage: 'Expedição' },
        ],
        insumos: [{ id: 'i1', name: 'Botão', current_stock: 1, min_stock: 10 }],
        orcamentos: [{ id: 'o1', serial_number: 'ORC-1', date: '2026-09-20', status: 'Sent' }],
        clientesComVencido: 3,
    });
    assert.deepEqual(blocos.map(b => b.objetivo), ['vender', 'producao', 'planejar', 'dinheiro']);
    const producao = blocos.find(b => b.objetivo === 'producao')!;
    assert.equal(producao.linhas[0].acao, 'Destravar');
    assert.equal(producao.linhas[0].urgente, true);
    assert.equal(producao.linhas[1].acao, 'Confirmar entrega');
});

test('confirmar entrega conta só pedidos ativos no último setor', () => {
    const blocos = montarFila({
        ...vazia,
        pedidos: [
            { id: 'a', deadline: '2026-12-01', status: 'Em Produção', production_stage: 'Expedição' },
            { id: 'b', deadline: '2026-12-01', status: 'Entregue', production_stage: 'Expedição' },
            { id: 'c', deadline: '2026-12-01', status: 'Pendente', production_stage: 'Corte' },
        ],
    });
    const linha = blocos[0].linhas.find(l => l.acao === 'Confirmar entrega')!;
    assert.equal(linha.quantidade, 1);
    assert.deepEqual(linha.destino, { view: 'quadro', destaque: 'ultimo-setor' });
});

test('"fecha em −R$" só quando a projeção do mês é negativa', () => {
    assert.equal(montarFila({ ...vazia, fechaOMesCom: 0 }).length, 0);
    const blocos = montarFila({ ...vazia, fechaOMesCom: -1500 });
    assert.match(blocos[0].linhas[0].texto, /outubro fecha em −R\$ 1500\.00/);
    assert.equal(blocos[0].linhas[0].urgente, true);
});

test('uma linha de conferência por banco com pendência', () => {
    const blocos = montarFila({ ...vazia, bancosAConferir: [
        { id: 'b1', nome: 'Botezini', quantidade: 3 }, { id: 'b2', nome: 'Sueli', quantidade: 0 },
    ] });
    const conferir = blocos[0].linhas.filter(l => l.acao === 'Conferir');
    assert.equal(conferir.length, 1);
    assert.deepEqual(conferir[0].destino, { view: 'finance', conferirBanco: 'b1' });
});

test('contador do menu: soma das linhas e urgente se alguma for', () => {
    const blocos = montarFila({ ...vazia, clientesComVencido: 2, pagarVencido: { quantidade: 4, total: 900 },
        bancosAConferir: [{ id: 'b1', nome: 'Botezini', quantidade: 1 }] });
    assert.deepEqual(contadoresDoMenu(blocos).dinheiro, { n: 3, urgente: true });
});

test('pedidos em produção: Pendente ou Em Produção', () => {
    assert.equal(pedidosEmProducao([
        { id: '1', status: 'Pendente' }, { id: '2', status: 'Em Produção' }, { id: '3', status: 'Entregue' },
    ]), 2);
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test --experimental-strip-types src/utils/inicio/fila.test.ts`: FAIL (o módulo não existe).

- [ ] **Step 3: Implementar `src/utils/inicio/fila.ts`.**

```ts
/**
 * A fila do Início: o que precisa do Luiz, agrupado por objetivo.
 * Pura — os dados chegam prontos (ver useFilaDoInicio). Spec: navegação por objetivos, seção 4.
 */
import { pedidosAtrasados, insumosAbaixoDoMinimo, orcamentosSemResposta } from '../alertasOperacionais.ts';
import type { PedidoParaAlerta, InsumoParaAlerta, OrcamentoParaAlerta } from '../alertasOperacionais.ts';

export type ObjetivoDaFila = 'vender' | 'producao' | 'planejar' | 'dinheiro';

export type DestinoDaFila =
    | { view: 'budgets'; status: 'Sent' | 'Approved' }
    | { view: 'quadro'; destaque: 'atrasados' | 'ultimo-setor' }
    | { view: 'consumo' }
    | { view: 'compras' }
    | { view: 'receivables' }
    | { view: 'finance'; recorte: 'pagar_vencido' }
    | { view: 'finance'; conferirBanco: string }
    | { view: 'finance' };

export interface LinhaDaFila {
    id: string;
    objetivo: ObjetivoDaFila;
    acao: string;
    texto: string;
    quantidade: number;
    urgente: boolean;
    destino: DestinoDaFila;
}

export interface BlocoDaFila { objetivo: ObjetivoDaFila; rotulo: string; linhas: LinhaDaFila[] }

export interface PedidoDaFila extends PedidoParaAlerta { production_stage?: string | null }

export interface EntradaDaFila {
    hoje: string;
    orcamentos: OrcamentoParaAlerta[];
    pedidos: PedidoDaFila[];
    ultimoSetor: string | null;
    consumoNaoApurado: number;
    insumos: InsumoParaAlerta[];
    clientesComVencido: number;
    pagarVencido: { quantidade: number; total: number };
    bancosAConferir: { id: string; nome: string; quantidade: number }[];
    fechaOMesCom: number;
    nomeDoMes: string;
    dinheiro: (v: number) => string;
}

const ORDEM: { objetivo: ObjetivoDaFila; rotulo: string }[] = [
    { objetivo: 'vender', rotulo: 'Vender' },
    { objetivo: 'producao', rotulo: 'Como está a produção' },
    { objetivo: 'planejar', rotulo: 'Planejar a semana' },
    { objetivo: 'dinheiro', rotulo: 'Dinheiro' },
];

const ATIVOS = new Set(['Pendente', 'Em Produção']);
const s = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export const pedidosEmProducao = (pedidos: PedidoParaAlerta[]): number =>
    pedidos.filter(p => ATIVOS.has((p.status || '').trim())).length;

export function montarFila(e: EntradaDaFila): BlocoDaFila[] {
    const linhas: LinhaDaFila[] = [];
    const add = (l: Omit<LinhaDaFila, 'id'>) => { if (l.quantidade > 0) linhas.push({ ...l, id: `${l.objetivo}-${l.acao}-${linhas.length}` }); };

    const semResposta = orcamentosSemResposta(e.orcamentos, e.hoje).length;
    add({ objetivo: 'vender', acao: 'Retomar', quantidade: semResposta, urgente: false,
        texto: `Retomar ${s(semResposta, 'orçamento', 'orçamentos')} sem resposta há 7+ dias`, destino: { view: 'budgets', status: 'Sent' } });
    const aprovados = e.orcamentos.filter(o => (o.status || '').trim() === 'Approved').length;
    add({ objetivo: 'vender', acao: 'Virar pedido', quantidade: aprovados, urgente: false,
        texto: `Virar pedido: ${s(aprovados, 'orçamento aprovado', 'orçamentos aprovados')}`, destino: { view: 'budgets', status: 'Approved' } });

    const atrasados = pedidosAtrasados(e.pedidos, e.hoje).length;
    add({ objetivo: 'producao', acao: 'Destravar', quantidade: atrasados, urgente: true,
        texto: `Destravar ${s(atrasados, 'pedido', 'pedidos')} com prazo estourado`, destino: { view: 'quadro', destaque: 'atrasados' } });
    const noUltimo = e.ultimoSetor
        ? e.pedidos.filter(p => ATIVOS.has((p.status || '').trim()) && p.production_stage === e.ultimoSetor).length : 0;
    add({ objetivo: 'producao', acao: 'Confirmar entrega', quantidade: noUltimo, urgente: false,
        texto: `Confirmar entrega de ${s(noUltimo, 'pedido', 'pedidos')} no último setor`, destino: { view: 'quadro', destaque: 'ultimo-setor' } });
    add({ objetivo: 'producao', acao: 'Completar', quantidade: e.consumoNaoApurado, urgente: false,
        texto: `Completar consumo não apurado de ${s(e.consumoNaoApurado, 'item', 'itens')}`, destino: { view: 'consumo' } });

    const abaixo = insumosAbaixoDoMinimo(e.insumos).length;
    add({ objetivo: 'planejar', acao: 'Comprar', quantidade: abaixo, urgente: false,
        texto: `Comprar ${s(abaixo, 'insumo', 'insumos')} abaixo do mínimo`, destino: { view: 'compras' } });

    add({ objetivo: 'dinheiro', acao: 'Cobrar', quantidade: e.clientesComVencido, urgente: true,
        texto: `Cobrar ${s(e.clientesComVencido, 'cliente', 'clientes')} com vencido`, destino: { view: 'receivables' } });
    add({ objetivo: 'dinheiro', acao: 'Pagar', quantidade: e.pagarVencido.quantidade, urgente: true,
        texto: `Pagar ${s(e.pagarVencido.quantidade, 'conta vencida', 'contas vencidas')} · ${e.dinheiro(e.pagarVencido.total)}`,
        destino: { view: 'finance', recorte: 'pagar_vencido' } });
    for (const b of e.bancosAConferir) {
        add({ objetivo: 'dinheiro', acao: 'Conferir', quantidade: b.quantidade, urgente: false,
            texto: `Conferir ${b.nome}: ${s(b.quantidade, 'pagamento', 'pagamentos')}`, destino: { view: 'finance', conferirBanco: b.id } });
    }
    if (e.fechaOMesCom < 0) {
        add({ objetivo: 'dinheiro', acao: 'Atenção', quantidade: 1, urgente: true,
            texto: `Atenção: ${e.nomeDoMes} fecha em −${e.dinheiro(Math.abs(e.fechaOMesCom))}`, destino: { view: 'finance' } });
    }

    return ORDEM
        .map(({ objetivo, rotulo }) => ({
            objetivo, rotulo,
            // urgente primeiro; dentro de cada grupo, a ordem do desenho (sort estável)
            linhas: linhas.filter(l => l.objetivo === objetivo).sort((a, b) => Number(b.urgente) - Number(a.urgente)),
        }))
        .filter(b => b.linhas.length > 0);
}

export function contadoresDoMenu(blocos: BlocoDaFila[]): Record<ObjetivoDaFila, { n: number; urgente: boolean }> {
    const r = { vender: { n: 0, urgente: false }, producao: { n: 0, urgente: false },
        planejar: { n: 0, urgente: false }, dinheiro: { n: 0, urgente: false } };
    for (const b of blocos) r[b.objetivo] = { n: b.linhas.length, urgente: b.linhas.some(l => l.urgente) };
    return r;
}
```

  O teste de "fecha em −R$" espera `−R$ 1500.00`. É o formatador do teste, `R$ ${v.toFixed(2)}`, aplicado ao valor absoluto, com o "−" (sinal de menos, U+2212) do texto na frente. Mantenha esse caractere.

- [ ] **Step 4: Rodar e ver passar.** O comando do Step 2: PASS. Depois a suíte inteira e `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/inicio
git commit -F - <<'EOF'
feat(inicio): fila de próximos passos e contadores do menu (puros, testados)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Início — gancho da fila e página

**Files:**
- Create: `src/hooks/inicio/useFilaDoInicio.ts`, `src/pages/Inicio.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes:
  - `montarFila`, `contadoresDoMenu`, `pedidosEmProducao`, `DestinoDaFila`, `BlocoDaFila` (Task 3);
  - `numerosDaVisaoGeral`, `clientesQueDevem`, `situacaoDosBancos`, `projecaoDoMes`, `nomeDoMes`, `mesDe` (`src/utils/financas/*`);
  - `storageService`: `getBudgets`, `getOrders`, `getInsumos`, `getSectors(false)`, `getObligations`, `getEnvelopeOverview`, `getBankAccounts`, `getContasPorObrigacao`;
  - `productionRepository.getConsumoNaoApurado()`.
- Produces:
  - `useFilaDoInicio(ativo: boolean)`, que devolve `{ blocos: BlocoDaFila[]; resumo: { livre: number; receberVencido: number; emProducao: number } | null; contadores; carregando: boolean; erro: string; recarregar: () => Promise<void> }`;
  - `<Inicio fila={…} onAbrir={(d: DestinoDaFila) => void} onIrPara={(v: View) => void} />`.

- [ ] **Step 1: O gancho.** `src/hooks/inicio/useFilaDoInicio.ts`:
  - **Carga:**
    - com `ativo` verdadeiro, carrega tudo de uma vez num `Promise.all` com as leituras listadas em Interfaces;
    - `getBankAccounts` com o mesmo argumento que `useFinanceData` usa para ativos;
    - devolve `carregando`, `erro` e `recarregar`;
    - com `ativo` falso (papel `factory` ou deslogado), não carrega nada e devolve `blocos: []`, `resumo: null` e contadores zerados.
  - **Conta da fila** (num `useMemo`):
    - `hoje = getTodayStr()`;
    - `numeros = numerosDaVisaoGeral({ contas, nosBancos: visao.total_real, nasCaixinhas: visao.allocated, hoje })`;
    - `clientesComVencido = clientesQueDevem(contas, hoje).filter(l => l.vencido > 0).length`;
    - `bancosAConferir = situacaoDosBancos({ bancos, contas, contasPorObrigacao }).map(b => ({ id: b.id, nome: b.nome, quantidade: b.aConferir.length }))`;
    - `fechaOMesCom = projecaoDoMes({ contas, livreHoje: numeros.livre, hoje }).fechaCom`;
    - `ultimoSetor = setores[setores.length - 1]?.name ?? null`;
    - `pagarVencido = { quantidade: numeros.recortes.pagar_vencido.quantidade, total: numeros.recortes.pagar_vencido.total }`;
    - `nomeDoMes: nomeDoMes(mesDe(hoje)).split(' ')[0]`;
    - `dinheiro`: o `mostrar` de `useMostrarValor`.
  - **Resumo:** `{ livre: numeros.livre, receberVencido: numeros.recortes.receber_vencido.total, emProducao: pedidosEmProducao(pedidos) }`.
  - **Contadores:** `contadoresDoMenu(blocos)`.
  - **Erro de uma leitura:** se uma das leituras falhar, mostra `erro` e mantém o resto zerado. Nada de fila falsa.

- [ ] **Step 2: A página.** `src/pages/Inicio.tsx`, no padrão do app:

```tsx
import { ArrowRight, Wallet, AlertTriangle, Factory, CheckCircle2 } from 'lucide-react';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ITEM, ROTULO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import type { DestinoDaFila } from '@/utils/inicio/fila';
import type { View } from '@/utils/navegacao';
import type { useFilaDoInicio } from '@/hooks/inicio/useFilaDoInicio';

interface Props { fila: ReturnType<typeof useFilaDoInicio>; onAbrir: (d: DestinoDaFila) => void; onIrPara: (v: View) => void }

/** O que precisa de você — o Início agrupado por objetivo. */
export default function Inicio({ fila, onAbrir, onIrPara }: Props) {
    const { mostrar } = useMostrarValor();
    const { blocos, resumo, carregando, erro } = fila;
    return (
        <div className="space-y-6">
            <div>
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Início</p>
                <h1 className="mt-1 text-2xl font-black uppercase tracking-tighter text-white">O que precisa de você</h1>
            </div>
            {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}
            {resumo && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Indicador icone={Wallet} rotulo="Livre para usar" valor={mostrar(resumo.livre)} tom={resumo.livre < 0 ? 'rose' : 'zinc'} onClick={() => onIrPara('finance')} />
                    <Indicador icone={AlertTriangle} rotulo="A receber vencido" valor={mostrar(resumo.receberVencido)} tom={resumo.receberVencido > 0 ? 'rose' : 'zinc'} onClick={() => onIrPara('receivables')} />
                    <Indicador icone={Factory} rotulo="Pedidos em produção" valor={String(resumo.emProducao)} onClick={() => onIrPara('quadro')} />
                </section>
            )}
            {carregando && !resumo ? <p className={`${CARTAO} py-10 text-center text-sm text-zinc-500`}>Carregando…</p>
            : blocos.length === 0 && !erro ? (
                <p className={`${CARTAO} flex items-center justify-center gap-2 py-10 text-sm font-bold text-emerald-400`}><CheckCircle2 size={16} /> Nada pendente — bom trabalho</p>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {blocos.map(b => (
                        <section key={b.objetivo} className={`${CARTAO} p-4 space-y-2`}>
                            <h2 className={ROTULO}>{b.rotulo}</h2>
                            {b.linhas.map(l => (
                                <div key={l.id} className={`${ITEM} relative flex items-center justify-between gap-3 overflow-hidden py-3 pl-4 pr-3`}>
                                    {l.urgente && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}
                                    <span className={`min-w-0 text-sm font-bold ${l.urgente ? 'text-rose-300' : 'text-zinc-200'}`}>{l.texto}</span>
                                    <button type="button" onClick={() => onAbrir(l.destino)} className={`${BOTAO_SUAVE} shrink-0`}>{l.acao} <ArrowRight size={12} /></button>
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Ligar no `App.tsx`.**
  - **O gancho:** `const fila = useFilaDoInicio(isAuthenticated && userProfile?.role !== 'factory');`, que fica abaixo dos `useState`. Nunca dentro de `if`.
  - **Recarga:** um `useEffect` em `currentView` chama `fila.recarregar()` ao entrar em `'dashboard'`, e no máximo uma vez a cada 30 s ao trocar para outra view. Para isso, guarde o horário da última carga num `useRef`. É a regra de recarga da spec, seção 2.
  - **Rota:** `case 'dashboard': return <Inicio fila={fila} onAbrir={abrirDestino} onIrPara={handleNavigate} />;`. Importe `Inicio` com `lazy` no mesmo padrão das outras páginas. O `default` do `switch` também passa a ser `Inicio`.
  - **`abrirDestino(d: DestinoDaFila)`, versão provisória:**
    - destino `finance` com `recorte`: `abrirContas({ recorte: 'pagar_vencido' })`;
    - qualquer outro destino: só `handleNavigate(d.view)`;
    - a Task 6 completa as aberturas filtradas.
  - **O `Dashboard` velho** deixa de ser roteado, e o arquivo fica (sai no S6).

- [ ] **Step 4: Tipos, suíte e commit.** Os dois limpos.

```bash
git add src/hooks/inicio src/pages/Inicio.tsx src/App.tsx
git commit -F - <<'EOF'
feat(inicio): Início vira a fila do que precisa de você, com resumo de 3 números

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Menu do app (lateral global com contadores)

**Files:**
- Create: `src/components/layout/MenuDoApp.tsx`
- Modify: `src/components/layout/BarraDeTopo.tsx`, `src/App.tsx`
- Delete: `src/components/layout/LateralDaSecao.tsx` (os ícones já foram para `icones.ts` na Task 2)

**Interfaces:**
- Consumes: `SECOES`, `secaoDaView`, `viewInicialDaSecao`, `ICONE_DA_SECAO`, `contadores` do `useFilaDoInicio` (Task 4).
- Produces: `<MenuDoApp secaoAtual contadores aberto onAlternar gavetaAberta onFecharGaveta onIrParaSecao />`.

- [ ] **Step 1: `MenuDoApp`.**
  - **Lista:**
    - percorre `SECOES` na ordem, com um separador (`border-t border-zinc-800 my-2`) antes do primeiro item `tipo === 'apoio'`;
    - cada item é um botão `w-full` com o ícone da seção (14px) e o rótulo em `text-[10px] font-black uppercase tracking-[0.15em]`;
    - o item ativo usa as cores de `pilula(true)`; os outros, `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60`;
    - `aria-current="page"` no item ativo e `title={s.descricao}`.
  - **Contador** (só nos objetivos `vender`, `producao`, `planejar`, `dinheiro`, quando `n > 0`): `ml-auto rounded-md px-1.5 text-[10px] font-black tabular-nums`, com `bg-rose-500/15 text-rose-400` quando urgente e `bg-zinc-800 text-zinc-400` nos outros casos.
  - **No computador** (`md` para cima): `aside` com `w-60` aberto ou `w-14` recolhido, botão de recolher no topo (o mesmo `ChevronsLeft`/`ChevronsRight` da lateral antiga), `border-r border-zinc-800 bg-zinc-950`, `print:hidden`. Recolhido, mostra só os ícones, e o contador vira uma bolinha (`h-1.5 w-1.5 rounded-full`, rosa ou cinza) no canto do ícone.
  - **No celular** (abaixo de `md`): a mesma lista numa gaveta por `createPortal(…, document.body)`:
    - fundo `fixed inset-0 z-modal bg-black/60` que fecha ao tocar;
    - painel `w-72 max-w-[85vw] h-full bg-zinc-950 border-r border-zinc-800 p-3`;
    - fecha ao escolher um item e com Esc.
  - **Clique num item:** chama `onIrParaSecao(s.id)` e fecha a gaveta.

- [ ] **Step 2: `BarraDeTopo`.**
  - Remova o `<nav>` das seções, os props `secaoAtual` e `onIrParaSecao` e o mapa de ícones.
  - Acrescente um prop `onAbrirMenu: () => void` e um botão `md:hidden` à esquerda do logo (`Menu` do lucide, `h-10 w-10`, `aria-label="Abrir menu"`).
  - Logo, ações e menu do usuário ficam.

- [ ] **Step 3: `App.tsx`.**
  - Estado `const [gavetaAberta, setGavetaAberta] = useState(false);`.
  - O `isSidebarOpen` continua, agora controlando o `MenuDoApp` no computador.
  - O layout fica `BarraDeTopo` em cima e, embaixo, `<div className="flex">` com o `MenuDoApp` e o `main`.
  - Passe `contadores={fila.contadores}`.
  - A migalha (seção › tela) fica.

- [ ] **Step 4: Testes, tipos e o teste de portal.** A gaveta usa `createPortal`, então `sobreposicoes.test.ts` passa. Os dois limpos.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/layout src/App.tsx
git commit -F - <<'EOF'
feat(navegacao): menu do app por objetivo, com contadores e gaveta no celular

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Abrir o passo certo, já filtrado

**Files:**
- Modify: `src/App.tsx`, `src/pages/Finance.tsx`, `src/pages/Budgets.tsx`, `src/pages/PCP.tsx`, `src/components/pcp/KanbanPanel.tsx`

**Interfaces:**
- Consumes: `DestinoDaFila` (Task 3) e o `abrirDestino` provisório (Task 4).
- Produces:
  - `Finance` aceita `bancoParaConferir?: string` e `limparBanco?: () => void`;
  - `Budgets` aceita `statusInicial?: 'Sent' | 'Approved'` e `limparStatus?: () => void`;
  - `PCP` aceita `destaque?: 'atrasados' | 'ultimo-setor'` e repassa ao `KanbanPanel`.

- [ ] **Step 1: `App.tsx`.**
  - **Estados:**
    - `const [aberturaBudgets, setAberturaBudgets] = useState<'Sent' | 'Approved' | null>(null);`;
    - `const [aberturaBanco, setAberturaBanco] = useState<string | null>(null);`;
    - `const [destaqueQuadro, setDestaqueQuadro] = useState<'atrasados' | 'ultimo-setor' | null>(null);`.
  - **`abrirDestino(d)`:**
    - `budgets`: `setAberturaBudgets(d.status)`;
    - `quadro`: `setDestaqueQuadro(d.destaque)`;
    - `finance` com `conferirBanco`: `setAberturaBanco(d.conferirBanco)`;
    - `finance` com `recorte`: `abrirContas({ recorte: d.recorte })`;
    - depois, sempre, `handleNavigate(d.view)`.
  - **O que cada tela recebe:**
    - `Budgets`: `statusInicial={aberturaBudgets ?? undefined} limparStatus={() => setAberturaBudgets(null)}`;
    - `Finance`: `bancoParaConferir={aberturaBanco ?? undefined} limparBanco={() => setAberturaBanco(null)}`;
    - o `case 'quadro'`: `destaque={destaqueQuadro ?? undefined}`;
    - o destaque é limpo ao sair da view, num `useEffect` em `currentView` que zera `destaqueQuadro` quando a view não é `quadro`.

- [ ] **Step 2: `Finance.tsx`.** Destructure os dois props novos e acrescente:

```tsx
    useEffect(() => {
        if (bancoParaConferir) { setBancoAberto(bancoParaConferir); limparBanco?.(); }
    }, [bancoParaConferir, limparBanco]);
```

  O `bancoAberto` e a janela `JanelaConferirBanco` já existem. Confira que o efeito que limpa `bancoAberto` quando o banco some não fecha a janela antes de os bancos carregarem. Se fechar, guarde o id pedido e aplique quando `bancos` tiver o item.

- [ ] **Step 3: `Budgets.tsx`.** Destructure `statusInicial` e `limparStatus`, e use o `setFilterStatus` que o `useBudgetController` já devolve:

```tsx
    useEffect(() => {
        if (statusInicial) { setFilterStatus(statusInicial); limparStatus?.(); }
    }, [statusInicial, limparStatus, setFilterStatus]);
```

  Com `'Sent'`, a `FilaDeFollowUp`, que já existe na página, mostra os orçamentos parados.

- [ ] **Step 4: Destaque no Quadro.** O `PCP` repassa `destaque` ao `KanbanPanel` (`<KanbanPanel … destaque={destaque} />`). No `KanbanPanel`, com o prop novo `destaque?: 'atrasados' | 'ultimo-setor'`:
  - **`'atrasados'`:** cada cartão com `deadline < getTodayStr()` ganha `ring-2 ring-rose-500/60`. Passe um booleano `destacado` ao `Card`. Mostre também uma faixa curta acima do quadro: "Destacando pedidos com prazo estourado" (`text-[10px] font-black uppercase tracking-widest text-rose-400`) com um botão "limpar" que esconde o destaque no estado local.
  - **`'ultimo-setor'`:** ao carregar as colunas, role a faixa do quadro até a última coluna (`ref` na coluna e `scrollIntoView({ inline: 'end', block: 'nearest' })`), e dê a ela `ring-1 ring-amber-500/40`.

- [ ] **Step 5: Tipos, suíte e commit.** Os dois limpos.

```bash
git add src/App.tsx src/pages/Finance.tsx src/pages/Budgets.tsx src/pages/PCP.tsx src/components/pcp/KanbanPanel.tsx
git commit -F - <<'EOF'
feat(inicio): cada linha da fila abre o passo certo, já filtrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Produtos & mercado em "Como estamos indo"

**Files:**
- Create: `src/utils/vendas/produtos.ts`, `src/utils/vendas/produtos.test.ts`, `src/components/vendas/ProdutosEMercado.tsx`
- Modify: `src/pages/ItensVendidos.tsx`

**Interfaces:**
- Produces:
  - `analiseDeProdutos(e: { pedidos: { client_id: string; total_amount: number; items: { product_id: string; quantity: number }[] }[]; produtos: { id: string; name: string }[]; clientes: { id: string; company_name: string }[] })`;
  - ela devolve `{ topProdutos: { id; nome; qtd }[]; parados: { id; nome; qtd }[]; topClientes: { id; nome; receita; pedidos }[] }`.

- [ ] **Step 1: Teste que falha.** `src/utils/vendas/produtos.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analiseDeProdutos } from './produtos.ts';

const produtos = [{ id: 'a', name: 'Camiseta' }, { id: 'b', name: 'Calça' }, { id: 'c', name: 'Boné' }];
const clientes = [{ id: 'x', company_name: 'Granha' }, { id: 'y', company_name: 'Mangá' }];
const pedidos = [
    { client_id: 'x', total_amount: 1000, items: [{ product_id: 'a', quantity: 30 }, { product_id: 'b', quantity: 2 }] },
    { client_id: 'y', total_amount: 300, items: [{ product_id: 'a', quantity: 10 }] },
    { client_id: 'x', total_amount: 500, items: [{ product_id: 'b', quantity: 1 }] },
];

test('mais vendidos por quantidade, parados (< 5) do mais parado para o menos', () => {
    const r = analiseDeProdutos({ pedidos, produtos, clientes });
    assert.deepEqual(r.topProdutos.map(p => [p.id, p.qtd]), [['a', 40], ['b', 3], ['c', 0]]);
    assert.deepEqual(r.parados.map(p => [p.id, p.qtd]), [['c', 0], ['b', 3]]);
});

test('clientes por receita, com quantidade de pedidos', () => {
    const r = analiseDeProdutos({ pedidos, produtos, clientes });
    assert.deepEqual(r.topClientes.map(c => [c.nome, c.receita, c.pedidos]), [['Granha', 1500, 2], ['Mangá', 300, 1]]);
});

test('produto de pedido que não está no cadastro é ignorado; cliente sem cadastro vira "Cliente"', () => {
    const r = analiseDeProdutos({ pedidos: [{ client_id: 'z', total_amount: 10, items: [{ product_id: 'q', quantity: 9 }] }], produtos, clientes });
    assert.equal(r.topProdutos.find(p => p.id === 'q'), undefined);
    assert.equal(r.topClientes[0].nome, 'Cliente');
});
```

- [ ] **Step 2: Ver falhar.** `node --test --experimental-strip-types src/utils/vendas/produtos.test.ts`: FAIL.

- [ ] **Step 3: Implementar** `src/utils/vendas/produtos.ts`. É a mesma conta do `productAnalytics` de `src/pages/Dashboard.tsx` (linhas ~283-310): top 8 produtos, parados `qtd < 5` ordenados do menor para o maior (até 6) e top 5 clientes por receita. Sem `import` do app, e o nome padrão de cliente é `'Cliente'`.

```ts
export interface PedidoParaAnalise { client_id: string; total_amount: number; items: { product_id: string; quantity: number }[] }

export function analiseDeProdutos(e: {
    pedidos: PedidoParaAnalise[]; produtos: { id: string; name: string }[]; clientes: { id: string; company_name: string }[];
}) {
    const qtd = new Map(e.produtos.map(p => [p.id, { id: p.id, nome: p.name, qtd: 0 }]));
    const porCliente = new Map<string, { id: string; nome: string; receita: number; pedidos: number }>();
    const nomeDoCliente = new Map(e.clientes.map(c => [c.id, c.company_name]));
    for (const p of e.pedidos) {
        for (const it of p.items || []) { const x = qtd.get(it.product_id); if (x) x.qtd += Number(it.quantity) || 0; }
        const c = porCliente.get(p.client_id) ?? { id: p.client_id, nome: nomeDoCliente.get(p.client_id) || 'Cliente', receita: 0, pedidos: 0 };
        c.receita += Number(p.total_amount) || 0; c.pedidos += 1; porCliente.set(p.client_id, c);
    }
    const todos = [...qtd.values()];
    return {
        topProdutos: [...todos].sort((a, b) => b.qtd - a.qtd).slice(0, 8),
        parados: todos.filter(p => p.qtd < 5).sort((a, b) => a.qtd - b.qtd).slice(0, 6),
        topClientes: [...porCliente.values()].sort((a, b) => b.receita - a.receita).slice(0, 5),
    };
}
```

- [ ] **Step 4: Ver passar.** O mesmo comando: PASS.

- [ ] **Step 5: Componente.** `src/components/vendas/ProdutosEMercado.tsx` porta o bloco da aba `products` do `Dashboard`:
  - **O que vem do bloco:** o gráfico de barras dos mais vendidos, a lista de parados e os maiores clientes, usando `QuandoCouber` e `recharts` como lá;
  - **Visual:** `CARTAO`, `ROTULO` e `mostrar()`;
  - **Dados:** o componente carrega `storageService.getOrders()`, `getProducts()` e `getClients()` e chama `analiseDeProdutos`;
  - **Navegação:** o `onNavigate` do bloco antigo (se houver link para Cadastros ou Pedidos) vira um prop opcional.

- [ ] **Step 6: `ItensVendidos.tsx`.** Renderize `<ProdutosEMercado />` no fim da página, depois do `QuadranteDeProdutos`, sob um título `ROTULO` "Produtos & mercado".

- [ ] **Step 7: Tipos, suíte e commit.**

```bash
git add src/utils/vendas src/components/vendas/ProdutosEMercado.tsx src/pages/ItensVendidos.tsx
git commit -F - <<'EOF'
feat(vendas): Produtos & mercado sai do Painel e vai para Como estamos indo › Vendas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Próximo passo — Vender

**Files:**
- Create: `src/components/common/ProximoPasso.tsx`
- Modify: `src/components/common/index.ts`, `src/pages/Budgets.tsx`

**Interfaces:**
- Consumes: `linkDoWhatsApp`, `msgOrcamentoEnviado`, `msgCobrarEntrada`, `msgPedidoConfirmado` (`src/utils/mensagensCliente.ts`); `handleConvertClick`, `confirmarResumo` e `storageService.saveBudget`, que já existem em `Budgets.tsx`.
- Produces: `ProximoPasso` (exportado em `common/index.ts`), com a interface abaixo.

- [ ] **Step 1: O componente.** `src/components/common/ProximoPasso.tsx`:

```tsx
import { X, MessageCircle, ArrowRight } from 'lucide-react';
import { BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

export interface AcaoDoPasso { rotulo: string; onClick?: () => void; href?: string | null; whatsapp?: boolean }

interface Props {
    titulo: string;
    principal: AcaoDoPasso;
    secundario?: AcaoDoPasso;
    /** Abre a janela completa (regra do Luiz: atalho nunca esconde nuance). */
    maisOpcoes?: () => void;
    /** Quando a ação principal não pode acontecer (ex.: cliente sem telefone). */
    aviso?: string;
    onFechar: () => void;
}

/** O próximo passo, oferecido onde a ação acabou. Seguir nunca é obrigatório. */
export function ProximoPasso({ titulo, principal, secundario, maisOpcoes, aviso, onFechar }: Props) {
    const botao = (a: AcaoDoPasso, classe: string) => a.href
        ? <a href={a.href} target="_blank" rel="noopener noreferrer" onClick={a.onClick} className={classe}>
            {a.whatsapp ? <MessageCircle size={13} /> : null}{a.rotulo}<ArrowRight size={12} /></a>
        : <button type="button" onClick={a.onClick} disabled={!a.onClick} className={classe}>{a.rotulo}<ArrowRight size={12} /></button>;
    return (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-widest text-amber-400">{titulo}</p>
            {aviso && <span className="text-[10px] font-bold text-zinc-500">{aviso}</span>}
            {botao(principal, BOTAO_PRINCIPAL)}
            {secundario && botao(secundario, BOTAO_SECUNDARIO)}
            {maisOpcoes && <button type="button" onClick={maisOpcoes} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300">mais opções</button>}
            <button type="button" onClick={onFechar} aria-label="Fechar" className="h-10 w-10 rounded-xl text-zinc-600 hover:bg-zinc-900 hover:text-white"><X size={14} className="mx-auto" /></button>
        </div>
    );
}
```

- [ ] **Step 2: Cadeia em `Budgets.tsx`.** Estado `const [passo, setPasso] = useState<React.ReactNode>(null);`, renderizado logo acima da lista (`{passo}`). Cada `ProximoPasso` recebe `onFechar={() => setPasso(null)}`.
  - **Depois de salvar:** em `handleSaveBudget`, depois de `saveBudget`, olhe o status e o cliente (`clients.find(c => c.id === b.client_id)`).
    - **Status `Draft` ou `Sent`:** `setPasso(<ProximoPasso titulo="Orçamento salvo" principal={{ rotulo: 'Enviar ao cliente', whatsapp: true, href: linkDoWhatsApp(cliente?.phone, msgOrcamentoEnviado(cliente || {}, b)), onClick: () => marcarEnviado(b) }} aviso={!cliente?.phone ? 'cliente sem telefone' : undefined} … />)`;
    - **`marcarEnviado(b)`:** grava `{ ...b, status: 'Sent' }` com `storageService.saveBudget` quando o status era `Draft`, e chama `refresh()`;
    - **o `b` usado:** se `saveBudget` não devolve o orçamento gravado, use `budgetToSave`, que já tem `id` quando é edição. Para orçamento novo sem `id`, faça `refresh()` e localize pelo `serial_number` antes de marcar.
  - **Orçamento salvo como `Approved`:** `ProximoPasso` "Orçamento aprovado", com a principal "Virar pedido" chamando `handleConvertClick(b)`.
  - **Depois de converter:** em `confirmarResumo`, troque o `onNavigate('orders')` por um `ProximoPasso` "Pedido #N criado":
    - **com entrada no plano** (`ctx.plan[0]` com `label` contendo "Entrada", sem diferenciar maiúscula): principal "Cobrar entrada" (`msgCobrarEntrada(cliente, ctx.budget)` por WhatsApp) e secundário "Ver pedido" (`onNavigate('orders', N)`);
    - **sem entrada:** principal "Confirmar ao cliente" (`msgPedidoConfirmado(cliente, { order_number: N, deadline: ctx.deliveryDate })`) e secundário "Ver pedido";
    - o número do pedido é o `ctx.numeroDoPedido`.
  - **Retomar:** a fila manda para Orçamentos com o filtro `'Sent'` (Task 6), e a `FilaDeFollowUp` já oferece o contato. Nada novo aqui.

- [ ] **Step 3: Tipos, suíte e commit.**

```bash
git add src/components/common/ProximoPasso.tsx src/components/common/index.ts src/pages/Budgets.tsx
git commit -F - <<'EOF'
feat(vender): próximo passo após salvar, aprovar e converter (enviar, virar pedido, cobrar entrada)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Próximo passo — Produção e Planejar

**Files:**
- Modify: `src/components/pcp/KanbanPanel.tsx`, `src/hooks/pcp/usePcpKanban.ts` (se precisar expor o pedido recém-movido), `src/components/pcp/CronogramaPanel.tsx`, `src/components/pcp/PurchaseListPanel.tsx`, `src/pages/PCP.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `ProximoPasso` (Task 8), `linkDoWhatsApp`, `msgProducaoIniciada`, `msgEntregue`.
- Produces: `PCP` aceita `onIrPara?: (v: View) => void` e repassa aos painéis que oferecem o próximo passo.

- [ ] **Step 1: Kanban.**
  - **Pedido sai do 1º setor:** quando `moveTo` termina com sucesso e o pedido saiu do primeiro setor (`saindoDoPrimeiro`, que já existe no gancho), o painel mostra `ProximoPasso` "Produção do #N começou" com a principal "Avisar o cliente" (`msgProducaoIniciada(cliente, pedido)` por WhatsApp). Exponha do gancho o último pedido movido, por exemplo um estado `ultimoMovido: { id; order_number; saiuDoPrimeiro: boolean } | null`.
  - **Depois de `confirmDelivery`:** `ProximoPasso` "Pedido #N entregue", com a principal "Avisar o cliente" (`msgEntregue(cliente, pedido)`) e o secundário "Ver o que receber" (`onIrPara('receivables')`).
  - **Modo `semFinanceiro`** (papel `factory`): só o "Avisar o cliente", sem o secundário.

- [ ] **Step 2: Cronograma.** No topo do `CronogramaPanel`, um `ProximoPasso` fixo e discreto, sem botão de fechar automático: título "Plano da semana pronto?" e principal "Ver lista de compras" (`onIrPara('compras')`).

- [ ] **Step 3: Lista de compras.** No `PurchaseListPanel`, o mesmo padrão, com título "Compras chegaram?" e principal "Dar entrada no estoque" (`onIrPara('inventory')`). Dar entrada não cria conta a pagar; só navega.

- [ ] **Step 4: Ligar `onIrPara`.** No `App`, os `case` `quadro`, `cronograma` e `compras` passam `onIrPara={handleNavigate}` ao `PCP`, que repassa aos três painéis.

- [ ] **Step 5: Tipos, suíte e commit.**

```bash
git add src/components/pcp src/hooks/pcp src/pages/PCP.tsx src/App.tsx
git commit -F - <<'EOF'
feat(producao): próximo passo no quadro, no cronograma e na lista de compras

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: "Cabe na semana?" no orçamento e o Simulador sai do PCP

**Files:**
- Create: `src/utils/cabeNaSemana.ts`, `src/utils/cabeNaSemana.test.ts`
- Modify: `src/components/budgets/BudgetEditor.tsx`, `src/pages/PCP.tsx`

**Interfaces:**
- Consumes: `SimulationResult` (`src/utils/pcpScheduler.ts`) e `usePcpSimulator` (`src/hooks/pcp/usePcpSimulator.ts`, que devolve `simulate(pieces, deadline, fabric?, color?, product_type?)` e `loading`).
- Produces: `respostaCabeNaSemana(r: SimulationResult, prazo: string): { cabe: boolean; texto: string }`.

- [ ] **Step 1: Teste que falha.** `src/utils/cabeNaSemana.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respostaCabeNaSemana } from './cabeNaSemana.ts';
import type { SimulationResult } from './pcpScheduler.ts';

const r = (placed: number, selfLate: boolean, semanas: string[]): SimulationResult => ({
    placed_week_index: placed, self_late: selfLate, newly_late: [], delta_late: 0, delta_weeks: 0,
    baseline: { weeks: [], late_count: 0, setup_changes: 0, setup_changes_ungrouped: 0, setup_saved: 0 },
    withNew: { weeks: semanas.map((w, i) => ({ week_index: i, week_start: w, orders: [], used_pieces: 0, capacity: 1, occupancy_pct: 0, overloaded: false })),
        late_count: 0, setup_changes: 0, setup_changes_ungrouped: 0, setup_saved: 0 },
});

test('cabe: diz a semana em dd/mm', () => {
    assert.deepEqual(respostaCabeNaSemana(r(1, false, ['2026-10-05', '2026-10-12']), '2026-10-30'),
        { cabe: true, texto: 'cabe na semana de 12/10' });
});

test('não cabe no prazo: diz a semana e o prazo que estoura', () => {
    assert.deepEqual(respostaCabeNaSemana(r(2, true, ['2026-10-05', '2026-10-12', '2026-10-26']), '2026-10-20'),
        { cabe: false, texto: 'só cabe na semana de 26/10 — o prazo de 20/10 estoura' });
});

test('não entrou em semana nenhuma', () => {
    assert.deepEqual(respostaCabeNaSemana(r(-1, true, []), '2026-10-20'),
        { cabe: false, texto: 'não coube no horizonte do cronograma — o prazo de 20/10 estoura' });
});
```

- [ ] **Step 2: Ver falhar**, e depois implementar `src/utils/cabeNaSemana.ts`:

```ts
import type { SimulationResult } from './pcpScheduler.ts';

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A resposta do motor do Simulador numa frase, para o editor de orçamento. */
export function respostaCabeNaSemana(r: SimulationResult, prazo: string): { cabe: boolean; texto: string } {
    const semana = r.withNew.weeks[r.placed_week_index]?.week_start;
    if (!semana) return { cabe: false, texto: `não coube no horizonte do cronograma — o prazo de ${ddmm(prazo)} estoura` };
    if (r.self_late) return { cabe: false, texto: `só cabe na semana de ${ddmm(semana)} — o prazo de ${ddmm(prazo)} estoura` };
    return { cabe: true, texto: `cabe na semana de ${ddmm(semana)}` };
}
```

  Rode: PASS.

- [ ] **Step 3: No editor.** Em `BudgetEditor.tsx`, perto do campo de prazo (`delivery_time_days`, por volta da linha 1699):
  - chame `const sim = usePcpSimulator();`;
  - calcule `const pecas = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);` e `const prazo = addBusinessDays(getTodayStr(), delivery_time_days || 20);`, que já são usados no arquivo;
  - com `pecas > 0 && !sim.loading`, mostre:

```tsx
{(() => { const r = respostaCabeNaSemana(sim.simulate(pecas, prazo, undefined, items[0]?.color, items[0]?.product_name), prazo);
    return <p className={`text-[10px] font-black uppercase tracking-widest ${r.cabe ? 'text-emerald-400' : 'text-rose-400'}`}>{r.texto}</p>; })()}
```

  É informação e não trava nada. Se `sim.error`, não mostre nada. Use `useMemo` para não simular a cada tecla se o editor ficar lento; a simulação é síncrona e barata.

- [ ] **Step 4: Simulador sai do PCP.** Em `PCP.tsx`, remova a entrada `simulator` de `TABS`, o tipo `'simulator'` de `PcpTab`, o `import` e o render do `SimuladorPanel`, e o `'simulator'` da lista provisória da Task 1 (se ainda existir). O arquivo `SimuladorPanel.tsx` fica para o S6.

- [ ] **Step 5: Tipos, suíte e commit.**

```bash
git add src/utils/cabeNaSemana.ts src/utils/cabeNaSemana.test.ts src/components/budgets/BudgetEditor.tsx src/pages/PCP.tsx
git commit -F - <<'EOF'
feat(vender): "cabe na semana?" no orçamento; Simulador sai do PCP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Roteiro (controlador).** O controlador cuida de três coisas:
  - **Roteiro:** atualiza o S1 em `docs/superpowers/specs/2026-10-08-roteiro-v3-design.md` para "Pronto".
  - **Conferência na v3**, com o usuário de teste, em 1440, 1024 e 390 px:
    - cada linha da fila leva ao passo certo;
    - os contadores batem com a fila;
    - cada próximo passo funciona;
    - "mais opções" abre a janela completa;
    - links antigos (`pcp`) abrem o Quadro;
    - o papel `factory` não é afetado.
  - **Comparação v2 × v3:** publica a do menu e do Início.

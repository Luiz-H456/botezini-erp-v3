# Como estamos indo v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saúde do caixa de volta (aba em Dinheiro + aviso no Início) e Resultado com meta × realizado (período e
ano), aviso de margem baixa e vista DRE.

**Architecture:** contas novas em funções puras (`src/utils/financas/projecao.ts`, `src/utils/financas/resultado.ts`)
com testes; telas adaptadas (`SaudeDoCaixaPanel`, `Resultado.tsx`, fila do Início). Sem banco.

**Tech Stack:** React 18 + TS + Vite + Tailwind v4 + Supabase; testes `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-13-como-estamos-indo-v3-design.md`.

## Global Constraints

- **Repositório:**
  - Worktree `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`.
  - Nunca push.
  - Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - `supabase/snippets/` fora dos commits.
- **Banco:** nenhum SQL nem coluna nova. A meta é `company_profile.revenue_goal` e a margem alvo é
  `company_profile.target_margin`; as duas já existem.
- **Visual:** só tokens de `src/components/finance/ui/estilo.ts`.
  - Ícone de botão só de ícone: 18, com `` `${BOTAO_SECUNDARIO} w-10 px-0` `` e `aria-label`.
  - Ícone ao lado de texto: 14.
- **Funções puras** em `src/utils/financas/`: sem import do app, imports relativos com `.ts`.
- **Suíte:** `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts" "src/utils/fabrica/*.test.ts"`
  (1425 hoje) + `npx tsc --noEmit`, os dois limpos.
- **Ambiente:** sem servidor de desenvolvimento e sem subagentes. O controlador confere no navegador.
- **Privacidade:** nada novo nas telas do papel fábrica (quadro, controle, rendimento).

## Review Focus

1. A projeção da aba e a do Início precisam dar o mesmo dia negativo. A conta tem de ser uma só (Task 1), não duas
   cópias.
2. Sem meta (`revenue_goal` 0 ou vazio): nada de "0%" nem divisão por zero. Mostra o convite para definir a meta
   (Task 4/5).
3. Leitura do Início que falha, ou projeção sem negativo: a linha não aparece (Task 3).
4. A margem alvo vazia ou zero, ou nada entrou no período: o aviso de margem não aparece (Task 4/5).
5. DRE: os totais batem com a cascata de caixa, e o lucro líquido é igual ao lucro de caixa (Task 4).

---

### Task 1: Projeção do caixa como função pura

**Files:**
- Create: `src/utils/financas/projecao.ts`, `src/utils/financas/projecao.test.ts`
- Modify: `src/hooks/useSaudeDoCaixa.ts` (usar `movimentosPrevistos`)

**Interfaces:**
- Produces:
  - `movimentosPrevistos(obrigacoes: ObrigacaoParaProjecao[], pagamentos: PagamentoRealizado[], inicio: string): MovimentoPrevisto[]`
  - `primeiroDiaNegativo(pontos: PontoDoSaldo[]): { data: string; saldo: number } | null`

- [ ] **Step 1: Teste que falha** — `src/utils/financas/projecao.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movimentosPrevistos, primeiroDiaNegativo } from './projecao.ts';

const conta = (p: Record<string, unknown>) => ({
    id: 'o1', type: 'payable', due_date: '2026-10-20', original_amount: 100, remaining_amount: 100,
    derived_status: 'open', cancelled_at: null, client_id: null, description: 'x', ...p,
}) as any;

test('só contas em aberto viram movimento; paga e cancelada ficam de fora', () => {
    const m = movimentosPrevistos([
        conta({}),
        conta({ id: 'o2', derived_status: 'paid' }),
        conta({ id: 'o3', derived_status: 'cancelled' }),
        conta({ id: 'o4', cancelled_at: '2026-10-01' }),
    ], [], '2026-10-13');
    assert.deepEqual(m.map(x => [x.data, x.valor, x.entra]), [['2026-10-20', 100, false]]);
});

test('vencida e em aberto move "hoje"; usa o que falta, não o original', () => {
    const m = movimentosPrevistos([conta({ due_date: '2026-10-01', remaining_amount: 40 })], [], '2026-10-13');
    assert.deepEqual(m.map(x => [x.data, x.valor]), [['2026-10-13', 40]]);
});

test('a receber entra; valor zero some', () => {
    const m = movimentosPrevistos([
        conta({ type: 'receivable', client_id: 'c1' }),
        conta({ id: 'o2', remaining_amount: 0 }),
    ], [], '2026-10-13');
    assert.equal(m.length, 1);
    assert.equal(m[0].entra, true);
});

test('primeiro dia negativo', () => {
    const pontos = [
        { data: '2026-10-13', entradas: 0, saidas: 0, saldo: 50 },
        { data: '2026-10-14', entradas: 0, saidas: 80, saldo: -30 },
        { data: '2026-10-15', entradas: 0, saidas: 10, saldo: -40 },
    ];
    assert.deepEqual(primeiroDiaNegativo(pontos), { data: '2026-10-14', saldo: -30 });
    assert.equal(primeiroDiaNegativo([{ data: '2026-10-13', entradas: 0, saidas: 0, saldo: 0 }]), null);
    assert.equal(primeiroDiaNegativo([]), null);
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar** — `src/utils/financas/projecao.ts`:

```ts
/**
 * Projeção do caixa: uma conta só para a aba Saúde do caixa e para o aviso do Início
 * (spec S5 §2–3). Antes ela morava dentro do useSaudeDoCaixa.
 */
import type { MovimentoPrevisto, PontoDoSaldo } from '../saudeDoCaixa.ts';
import { comportamentoPorCliente, preverRecebimentos } from '../previsaoRecebimento.ts';
import type { ObrigacaoParaPrevisao, PagamentoRealizado } from '../previsaoRecebimento.ts';

export type ObrigacaoParaProjecao = ObrigacaoParaPrevisao & {
    type: string;
    derived_status?: string | null;
    cancelled_at?: string | null;
    remaining_amount?: number | null;
    original_amount?: number | null;
    description?: string | null;
};

export function movimentosPrevistos(
    obrigacoes: ObrigacaoParaProjecao[],
    pagamentos: PagamentoRealizado[],
    inicio: string,
): MovimentoPrevisto[] {
    const emAberto = obrigacoes.filter(o =>
        o.derived_status !== 'paid' && o.derived_status !== 'cancelled' && !o.cancelled_at);
    const comportamento = comportamentoPorCliente(obrigacoes, pagamentos);
    const previsoes = new Map(preverRecebimentos(emAberto.filter(o => o.type === 'receivable'), comportamento)
        .map(p => [p.obligation_id, p]));
    return emAberto.map(o => {
        const entra = o.type === 'receivable';
        const prev = entra ? previsoes.get(o.id) : undefined;
        const data = (prev?.dataProvavel || o.due_date || inicio).slice(0, 10);
        return {
            // Conta vencida e em aberto move no mínimo hoje: no passado sumiria da projeção.
            data: data < inicio ? inicio : data,
            valor: Number(o.remaining_amount ?? o.original_amount) || 0,
            entra,
            descricao: o.description || undefined,
        };
    }).filter(m => m.valor > 0);
}

export function primeiroDiaNegativo(pontos: PontoDoSaldo[]): { data: string; saldo: number } | null {
    const p = pontos.find(x => x.saldo < 0);
    return p ? { data: p.data, saldo: p.saldo } : null;
}
```
  Se `ObrigacaoParaPrevisao`, `PagamentoRealizado` ou `dataProvavel` tiverem outro nome em
  `src/utils/previsaoRecebimento.ts`, use o nome que existe lá e anote no relatório. Não mude aquele arquivo.

- [ ] **Step 4: Ver passar.**
- [ ] **Step 5: Hook.** Em `useSaudeDoCaixa.ts`, troque os `useMemo` `previsoes` e `movimentos` por
  `const movimentos = useMemo(() => movimentosPrevistos(obrigacoes, pagamentos, periodo.inicio), [obrigacoes, pagamentos, periodo]);`.
  - Se `previsoes` ou `emAberto` forem usados em mais lugares do hook, mantenha o que for usado e reuse.
  - O comportamento não pode mudar: a mesma projeção, o mesmo fechamento.
- [ ] **Step 6: Suíte e tipos limpos; commit** (`feat(financas): projeção do caixa em função pura, para a aba e o Início`).

---

### Task 2: Aba "Saúde do caixa" em Dinheiro

**Files:**
- Modify:
  - `src/utils/navegacao.ts` (view `'saude-caixa'`, rótulo "Saúde do caixa", na seção `dinheiro` depois de `'envelopes'`);
  - `src/App.tsx` (`case 'saude-caixa': return <SaudeDoCaixaPanel />;`);
  - `src/components/finance/SaudeDoCaixaPanel.tsx` (só o visual, com as regras do `estilo.ts`).
- Test: `src/utils/*.test.ts`. Se algum teste de navegação listar as views de Dinheiro, atualize-o para incluir a nova.

- [ ] **Step 1:** Acrescente `'saude-caixa'` ao tipo `View`, ao mapa de rótulos (`'Saúde do caixa'`) e às `views` da
  seção `dinheiro`, depois de `'envelopes'`. Confira se `ALIAS_DE_VIEW` ou algum teste precisa saber da view nova.
- [ ] **Step 2:** Em `App.tsx`, renderize `<SaudeDoCaixaPanel />` para `'saude-caixa'`, no mesmo lugar dos outros
  `case` de Dinheiro.
- [ ] **Step 3:** Visual do `SaudeDoCaixaPanel` com os tokens:
  - `CARTAO`, `ITEM`, `ROTULO`;
  - ícones com os tamanhos das Global Constraints;
  - sem `shadow-xl`, `animate-pulse` decorativo e `tracking-[0.2em]`.
  - Gráfico: não mexa no conteúdo nem nas cores.
- [ ] **Step 4:** Suíte e tipos limpos; commit (`feat(financas): saúde do caixa volta como aba em Dinheiro`).

---

### Task 3: Aviso "Caixa fica negativo" no Início

**Files:**
- Modify: `src/utils/inicio/fila.ts`, `src/utils/inicio/fila.test.ts`, `src/hooks/inicio/useFilaDoInicio.ts`

**Interfaces:**
- Consumes: Task 1 (`movimentosPrevistos` e `primeiroDiaNegativo`); `projetarSaldo` de `src/utils/saudeDoCaixa.ts`.
- Produces: `EntradaDaFila.caixaNegativoEm: { data: string; saldo: number } | null`.

- [ ] **Step 1: Teste que falha.** Em `fila.test.ts`, use a fábrica de entrada que o arquivo já usa e acrescente:

```ts
test('caixa que fica negativo vira linha urgente de Dinheiro, com data e valor', () => {
    const blocos = montarFila({ ...base(), caixaNegativoEm: { data: '2026-10-20', saldo: -1234.5 } });
    const linha = blocos.flatMap(b => b.linhas).find(l => l.destino.view === 'saude-caixa');
    assert.ok(linha);
    assert.equal(linha.urgente, true);
    assert.match(linha.texto, /Caixa fica negativo em 20\/10/);
});

test('sem negativo previsto, não há linha de caixa', () => {
    const blocos = montarFila({ ...base(), caixaNegativoEm: null });
    assert.equal(blocos.flatMap(b => b.linhas).some(l => l.destino.view === 'saude-caixa'), false);
});
```
  `base()` é a fábrica que o teste já tem; se o nome for outro, use o que existe. Acrescente
  `caixaNegativoEm: null` ao padrão dela, para os testes de hoje continuarem passando.

- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar.** Em `fila.ts`:
  - acrescente o campo à `EntradaDaFila`;
  - no bloco de Dinheiro, ponha a linha antes de "Cobrar":

```ts
if (e.caixaNegativoEm) {
    const [, m, d] = e.caixaNegativoEm.data.split('-');
    add({ objetivo: 'dinheiro', acao: 'Ver projeção', quantidade: 1, urgente: true,
        texto: `Caixa fica negativo em ${d}/${m} (${e.dinheiro(e.caixaNegativoEm.saldo)})`,
        destino: { view: 'saude-caixa' } });
}
```
  Se o tipo do `destino` não aceitar a view nova, alargue-o do jeito que as outras views entram.
- [ ] **Step 4: Ver passar.**
- [ ] **Step 5: No hook** `useFilaDoInicio.ts`, com as contas, pagamentos e bancos que ele já lê:
  - saldo de partida: soma de `current_balance` dos bancos ativos, como em `useSaudeDoCaixa` (`setSaldoAtual`);
  - `movimentosPrevistos(contas, pagamentos, hoje)`;
  - `projetarSaldo(saldo, movs, hoje, hoje + 30 dias)` e `primeiroDiaNegativo`.
  - Se alguma leitura usada falhou, ou faltar dado, use `null`.
  - Passe `caixaNegativoEm` a `montarFila`.
- [ ] **Step 6:** Suíte e tipos limpos; commit (`feat(inicio): aviso de caixa negativo leva à saúde do caixa`).

---

### Task 4: Contas do Resultado — meta e DRE

**Files:**
- Create: `src/utils/financas/resultado.ts`, `src/utils/financas/resultado.test.ts`

**Interfaces:**
- Consumes: `CaixaDoMes` e `LinhaDoRelatorio` de `src/utils/financas/caixa.ts`.
- Produces:
  - `metaDoPeriodo(realizado: number, metaMensal: number | null | undefined, meses: number): { meta: number; pct: number; atingiu: boolean } | null`;
  - `linhasDoDre(c: CaixaDoMes): LinhaDoRelatorio[]`;
  - `margemAbaixoDoAlvo(c: CaixaDoMes, alvoPct: number | null | undefined): { margem: number; alvo: number } | null`.

- [ ] **Step 1: Teste que falha** — `src/utils/financas/resultado.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaDoPeriodo, linhasDoDre, margemAbaixoDoAlvo } from './resultado.ts';

const caixa = (p: Record<string, unknown> = {}) => ({
    entrou: 1000, impostos: 100, custoPecas: 300, sobrouDaProducao: 600, percentualDaProducao: 60,
    despesas: 250, financeiras: 50, lucro: 300, porCategoria: [], ...p,
}) as any;

test('meta: mês, trimestre e sem meta', () => {
    assert.deepEqual(metaDoPeriodo(5000, 10000, 1), { meta: 10000, pct: 50, atingiu: false });
    assert.deepEqual(metaDoPeriodo(31000, 10000, 3), { meta: 30000, pct: 103.3, atingiu: true });
    assert.equal(metaDoPeriodo(5000, 0, 1), null);
    assert.equal(metaDoPeriodo(5000, null, 1), null);
});

test('DRE: totais batem com a cascata e o lucro líquido é o lucro de caixa', () => {
    const l = linhasDoDre(caixa());
    const v = Object.fromEntries(l.map(x => [x.label, x.value]));
    assert.equal(v['RECEITA BRUTA'], 1000);
    assert.equal(v['(=) RECEITA LÍQUIDA'], 900);
    assert.equal(v['(=) LUCRO BRUTO'], 600);
    assert.equal(v['(=) RESULTADO OPERACIONAL'], 350);
    assert.equal(v['(=) LUCRO LÍQUIDO'], 300);
    assert.equal(l.find(x => x.label === '(=) LUCRO BRUTO')!.percent, 60);
});

test('margem abaixo do alvo: só com alvo e com entrada', () => {
    assert.deepEqual(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 30 }), 40), { margem: 30, alvo: 40 });
    assert.equal(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 45 }), 40), null);
    assert.equal(margemAbaixoDoAlvo(caixa({ percentualDaProducao: 30 }), 0), null);
    assert.equal(margemAbaixoDoAlvo(caixa({ entrou: 0, percentualDaProducao: null }), 40), null);
});
```

- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar** — `src/utils/financas/resultado.ts`:

```ts
/** Meta, margem e DRE do Resultado (spec S5 §4). Mesma base de caixa da cascata. */
import type { CaixaDoMes, LinhaDoRelatorio } from './caixa.ts';

const um = (n: number) => Math.round(n * 10) / 10;
const centavos = (n: number) => Math.round(n * 100) / 100;

export function metaDoPeriodo(realizado: number, metaMensal: number | null | undefined, meses: number) {
    const mensal = Number(metaMensal) || 0;
    if (mensal <= 0 || meses <= 0) return null;
    const meta = centavos(mensal * meses);
    const pct = um((realizado / meta) * 100);
    return { meta, pct, atingiu: realizado >= meta };
}

export function margemAbaixoDoAlvo(c: CaixaDoMes, alvoPct: number | null | undefined) {
    const alvo = Number(alvoPct) || 0;
    if (alvo <= 0 || !(c.entrou > 0) || c.percentualDaProducao === null) return null;
    return c.percentualDaProducao < alvo ? { margem: c.percentualDaProducao, alvo } : null;
}

export function linhasDoDre(c: CaixaDoMes): LinhaDoRelatorio[] {
    const pct = (v: number) => (c.entrou > 0 ? centavos((v / c.entrou) * 100) : 0);
    const liquida = centavos(c.entrou - c.impostos);
    const bruto = centavos(liquida - c.custoPecas);
    const operacional = centavos(bruto - c.despesas);
    const liquido = centavos(operacional - c.financeiras);
    return [
        { label: 'RECEITA BRUTA', value: c.entrou, level: 1, percent: 100 },
        { label: '(-) Impostos', value: c.impostos, level: 2, is_deduction: true, percent: pct(c.impostos) },
        { label: '(=) RECEITA LÍQUIDA', value: liquida, level: 1, is_total: true, percent: pct(liquida) },
        { label: '(-) Custo das peças (CPV)', value: c.custoPecas, level: 2, is_deduction: true, percent: pct(c.custoPecas) },
        { label: '(=) LUCRO BRUTO', value: bruto, level: 1, is_total: true, percent: pct(bruto) },
        { label: '(-) Despesas operacionais', value: c.despesas, level: 2, is_deduction: true, percent: pct(c.despesas) },
        { label: '(=) RESULTADO OPERACIONAL', value: operacional, level: 1, is_total: true, percent: pct(operacional) },
        { label: '(-) Despesas financeiras', value: c.financeiras, level: 2, is_deduction: true, percent: pct(c.financeiras) },
        { label: '(=) LUCRO LÍQUIDO', value: liquido, level: 1, is_total: true, percent: pct(liquido) },
    ];
}
```

- [ ] **Step 4: Ver passar.**
- [ ] **Step 5:** Suíte e tipos limpos; commit (`feat(financas): conta da meta, da margem e do DRE do resultado`).

---

### Task 5: Resultado — meta, margem e vista DRE na tela

**Files:**
- Modify: `src/pages/Resultado.tsx`

**Interfaces:**
- Consumes:
  - Task 4 (`metaDoPeriodo`, `margemAbaixoDoAlvo`, `linhasDoDre`);
  - `storageService.getCompanyProfile()`, que traz `revenue_goal` e `target_margin`;
  - `vendasDoPeriodo` (já usada);
  - `mesDe` e afins de `@/utils/financas/base`.

- [ ] **Step 1: Perfil.**
  - Carregue o perfil uma vez com `useEffect` e `storageService.getCompanyProfile()`, guardando em estado.
  - Se a leitura falhar, guarde `null`: a meta mostra o convite e o aviso de margem não aparece.
- [ ] **Step 2: Meta × realizado.** No topo, abaixo dos 4 números e acima de "Caixa do mês", um `CARTAO p-5` com
  duas barras:
  - **Período:** `metaDoPeriodo(vendas.vendido, perfil?.revenue_goal, meses.length)`, rotulada com o rótulo do
    período.
  - **Ano:**
    - meses de janeiro até o mês da tela, do ano do mês da tela;
    - `vendasDoPeriodo({ pedidos: dados.pedidos, contas: dados.contas, meses: mesesDoAno })`;
    - `metaDoPeriodo(vendasAno.vendido, perfil?.revenue_goal, mesesDoAno.length)`, rotulada "Ano até {mês}".
  - Cada barra:
    - texto `R$ X de R$ meta · N%`;
    - preenchimento `min(100, pct)%`, verde (`bg-emerald-500`) quando `atingiu` e âmbar quando não.
  - Com `metaDoPeriodo` = `null`, troque as barras por uma linha: "Defina a meta de faturamento em Cadastros ›
    Minha empresa". Sem link novo, porque o Resultado não tem `onIrPara`.
- [ ] **Step 3: Margem.** Com `margemAbaixoDoAlvo(caixa, perfil?.target_margin)`, mostre no topo um aviso âmbar
  (`ITEM` + `text-amber-400`):
  `Sobrou da produção {N}% — abaixo da margem alvo de {M}% (Minha empresa)`.
- [ ] **Step 4: Vista DRE.**
  - No cabeçalho do bloco "Caixa do mês", pílulas `Caixa` e `DRE` (`pilula`), em estado local `vista`.
  - Com DRE, o bloco lista `linhasDoDre(caixa)`:
    - total em negrito;
    - dedução em `text-zinc-400`;
    - `%` à direita em `text-[10px]`;
    - o mesmo `mostrar(valor)` dos outros números.
  - "Exportar PDF" usa `vista === 'dre' ? linhasDoDre(caixa) : linhasDoRelatorio(caixa)`.
- [ ] **Step 5:** Suíte e tipos limpos; commit (`feat(resultado): meta do período e do ano, aviso de margem e vista DRE`).

---

### Task 6 (controlador): fechamento do S5

- [ ] **Navegador** (5175, sem gravar, em 1440, 1024 e 390):
  - aba Saúde do caixa em Dinheiro;
  - linha "Caixa fica negativo" no Início, só se houver negativo;
  - meta (período e ano), aviso de margem e pílulas Caixa/DRE no Resultado;
  - sem rolagem lateral;
  - console sem erro novo.
- [ ] **Comparação v2 × v3** publicada.
- [ ] **Roteiro:** S5 → "Pronto".

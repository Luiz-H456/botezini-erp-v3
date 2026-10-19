# Cadastros v3 (S2) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastros abre num fichário de 8 cartões. Os números que aparecem em dois lugares batem: o dinheiro do
cliente com Clientes que devem, a ficha técnica entre Produtos, fichário e fila. Bancos saem de Contas e vêm para
cá, o orçamento escolhe o banco que imprime, e Minha empresa sugere a meta de faturamento.

**Architecture:**
- **O que se adapta:** o esqueleto continua `MasterData.tsx`. Ele recebe a prop `aba`, como o `PCP` recebeu `abas`
  no S1, e cada cartão do fichário é uma view.
- **Contas puras e testadas:** em `src/utils/`, as que alimentam mais de uma tela (`completudeDosDados`,
  `situacaoDoSaldo`, `montarFichario`, `metaSugerida`, `dadosBancariosDoOrcamento`). Os ganchos só carregam dados e
  chamam essas funções.
- **Banco:** só ganha 3 colunas (`supabase/cadastros_v3_1.sql`), e a tela funciona antes de o SQL rodar.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind v4, Supabase. Testes com `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-08-cadastros-v3-design.md` (commit `a624003`). Roteiro:
`docs/superpowers/specs/2026-10-08-roteiro-v3-design.md`, S2.

## Global Constraints

- **Ambiente:**
  - pasta `C:\Users\luuii\OneDrive\Documentos\botezinipvd-v3`, branch `v3`;
  - **nenhuma tarefa roda SQL nem mexe em banco.** A Task 1 só **escreve** `supabase/cadastros_v3_1.sql`; quem
    roda é o Luiz;
  - os implementadores não sobem servidor nem leem arquivos `.env`. A conferência no navegador é do controlador
    (porta 5175; v2 de referência na 5176).
- **Comandos:**
  - testes: `node --test --experimental-strip-types "src/utils/*.test.ts" "src/utils/financas/*.test.ts" "src/utils/inicio/*.test.ts" "src/utils/vendas/*.test.ts"`;
  - tipos: `npx tsc --noEmit`;
  - os dois limpos ao fim de cada tarefa.
- **Funções puras em `src/utils/`:** sem imports do app; só imports relativos com extensão `.ts` (ex.:
  `from './financas/situacao.ts'`), para rodar no `node --test`.
- **Visual** — só as classes de `src/components/finance/ui/estilo.ts` e o `Indicador`:
  - classes: `CARTAO`, `ITEM`, `CAMPO`, `ROTULO`, `ROTULO_PEQUENO`, `BOTAO_PRINCIPAL`, `BOTAO_SUAVE`,
    `BOTAO_SECUNDARIO`, `BOTAO_PERIGO`, `pilula()`;
  - escala de espaço 4 a 24 (`gap-1` … `gap-6`): `p-4`/`p-5` dentro de cartão, `gap-3` entre cartões, `space-y-6`
    entre seções;
  - vencido e problema de dinheiro em rosa; atenção em âmbar; ação principal em âmbar; nenhuma cor nova.
- **Janelas** abrem com `createPortal(…, document.body)`; o teste `src/utils/sobreposicoes.test.ts` obriga.
- **Privacidade:** todo valor em R$ passa por `mostrar()` de `src/hooks/financas/useMostrarValor.ts`, ou por
  `formatCurrency`, que já respeita o modo privado nas telas de Cadastros que o usam hoje.
- **Nuance é lei:** cada função da tabela da seção 4 da spec continua alcançável onde a tabela diz. O que sai da
  tela **não** é apagado do banco: só deixa de ser exibido e editado.
- **Papel `factory`:** não alcança Cadastros (o layout dele é fixo). Nada neste plano muda isso.
- **Commits:**
  - em português, no estilo do log (`feat(cadastros): …`, `fix(…)`);
  - terminam com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **SQL ainda não rodado.** Salvar um banco ou o perfil da empresa nunca manda uma coluna que não existe, e a
   tela esconde titular, PIX e o seletor de banco. Testes em `contaBancaria.test.ts` (Task 1) e
   `perfilDaEmpresa.test.ts` (Task 7).
2. **Banco do orçamento inativado ou apagado.** O PDF volta aos dados bancários antigos da empresa, inteiros, e
   nunca mistura campos de duas contas. Teste em `perfilDaEmpresa.test.ts` (Task 7).
3. **Cliente cujas parcelas abertas são todas de pedido não entregue.** A página mostra vencido R$ 0 e a receber
   R$ 0, com "em produção R$ X", igual a Clientes que devem. Teste em `dossieDoCliente.test.ts` (Task 4).
4. **Fichário com uma leitura falhando.** Os cartões aparecem sem número nenhum, e nunca com "0" fingindo que não
   há pendência. Teste em `fichario.test.ts` (Task 3).
5. **Conferência de saldo incompleta** (teto de pagamentos ou de contas atingido). Os bancos não mostram "não
   bate" nem "bate": mostram nada. Teste em `conferenciaDeSaldo.test.ts` (Task 1).

---

### Task 1: Bancos em Cadastros

Os bancos ganham titular e PIX (com SQL a rodar depois), uma tela própria em Cadastros e a conferência do saldo
por banco. Por enquanto a tela entra como uma aba a mais na barra de abas de `MasterData`, que a Task 3 troca pelo
fichário. Contas (Finance) ainda não muda; a Task 3 tira de lá o gerenciamento.

**Files:**
- Create: `supabase/cadastros_v3_1.sql`
- Create: `src/components/cadastros/BancosPanel.tsx`
- Modify: `src/utils/conferenciaDeSaldo.ts` (+ `src/utils/conferenciaDeSaldo.test.ts`, que já existe: acrescentar)
- Modify: `src/utils/contaBancaria.ts` (+ `src/utils/contaBancaria.test.ts`, que já existe: acrescentar)
- Modify: `src/types/index.ts` (`BankAccount`, `CompanyProfile`)
- Modify: `src/repositories/financeRepository.ts` (`getBankAccounts`)
- Modify: `src/components/modals/BankAccountModal.tsx`
- Modify: `src/pages/MasterData.tsx` (aba `bancos`)
- Modify: `src/hooks/inicio/useFilaDoInicio.ts` (usa `movimentosDosPagamentos`)

**Interfaces:**
- **Produces** (`src/utils/conferenciaDeSaldo.ts`):
  - `interface PagamentoParaConferir { account_id?; amount?; obligation_id?; reversed_at?; reversal_of?; affects_balance? }`
  - `movimentosDosPagamentos(pagamentos: PagamentoParaConferir[], contas: { id: string; type?: string | null }[]): MovimentoDeConta[]`
  - `TETO_DE_CONTAS = 5000`
  - `dadosCompletosDaConferencia(pagamentosTruncados: boolean, totalDeContas: number): boolean`
  - `type SituacaoDoSaldo`
  - `situacaoDoSaldo(r: ResultadoDaConferencia, accountId: string): SituacaoDoSaldo`
- **Produces** (`src/utils/contaBancaria.ts`):
  - `CAMPOS_NOVOS = ['titular', 'chave_pix']`;
  - `camposDaConta` só grava esses campos quando vieram definidos.
- **Produces** (tipos):
  - `BankAccount.titular?: string | null`, `BankAccount.chave_pix?: string | null`;
  - `CompanyProfile.banco_do_orcamento_id?: string | null`.
- **Produces** (componente): `BancosPanel` (default export), sem props.

- [ ] **Step 1: Escrever o SQL** — `supabase/cadastros_v3_1.sql`:

```sql
-- =============================================================================
-- Cadastros v3 (S2) — banco que sai no orçamento
--
-- O QUE FAZ
--  - bank_accounts ganha TITULAR e CHAVE_PIX: o orçamento passa a imprimir os
--    dados de um banco cadastrado, e não um texto solto em Minha empresa.
--  - company_profile ganha BANCO_DO_ORCAMENTO_ID: qual banco o orçamento usa.
--    Se o banco for apagado, a escolha volta a vazio e o PDF usa os campos
--    antigos da empresa, que continuam guardados.
--
-- Só acrescenta colunas. Nada é apagado. Pode rodar mais de uma vez.
-- Rode no banco LOCAL da v3 (supabase_db_botezini-v3). Produção fica fora.
-- =============================================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS titular text;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS chave_pix text;

ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS banco_do_orcamento_id uuid
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- O PostgREST guarda o esquema em cache: sem isto as colunas novas só
-- aparecem para o app depois de reiniciar a API.
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Testes que falham** — acrescentar ao fim de `src/utils/conferenciaDeSaldo.test.ts` (mantendo os
  imports que já existem e acrescentando os nomes novos ao import de `./conferenciaDeSaldo.ts`):

```ts
import {
    movimentosDosPagamentos, situacaoDoSaldo, dadosCompletosDaConferencia, TETO_DE_CONTAS,
} from './conferenciaDeSaldo.ts';
import type { ResultadoDaConferencia } from './conferenciaDeSaldo.ts';

test('movimentos: o tipo vem da conta; pagamento sem conta conhecida fica sem tipo', () => {
    const m = movimentosDosPagamentos(
        [
            { account_id: 'b1', amount: 100, obligation_id: 'r1', reversed_at: null, reversal_of: null, affects_balance: true },
            { account_id: 'b1', amount: 40, obligation_id: 'p1' },
            { account_id: 'b2', amount: 10, obligation_id: 'sumiu' },
        ],
        [{ id: 'r1', type: 'receivable' }, { id: 'p1', type: 'payable' }],
    );
    assert.deepEqual(m.map(x => [x.account_id, x.amount, x.tipo]), [
        ['b1', 100, 'receivable'], ['b1', 40, 'payable'], ['b2', 10, undefined],
    ]);
    assert.equal(m[0].affects_balance, true);
});

test('dados completos: nenhum teto atingido', () => {
    assert.equal(dadosCompletosDaConferencia(false, 10), true);
    assert.equal(dadosCompletosDaConferencia(true, 10), false);
    assert.equal(dadosCompletosDaConferencia(false, TETO_DE_CONTAS), false);
});

const resultado = (p: Partial<ResultadoDaConferencia>): ResultadoDaConferencia => ({
    divergencias: [], semLinhaDeBase: [], inconclusivas: [], conferidas: 0, totalDivergente: 0, completo: true, ...p,
});

test('situação do saldo por banco', () => {
    const r = resultado({
        divergencias: [{ account_id: 'b1', nome: 'Itaú', guardado: 500, calculado: 450, diferenca: 50, movimentos: 3 }],
        semLinhaDeBase: [{ account_id: 'b2', nome: 'Caixa', semHistorico: 1, movimentos: 2 }],
        inconclusivas: [{ account_id: 'b3', nome: 'Sueli', semTipo: 1 }],
    });
    assert.deepEqual(situacaoDoSaldo(r, 'b1'), { tipo: 'nao-bate', guardado: 500, calculado: 450 });
    assert.deepEqual(situacaoDoSaldo(r, 'b2'), { tipo: 'sem-partida' });
    assert.deepEqual(situacaoDoSaldo(r, 'b3'), { tipo: 'sem-dados' });
    assert.deepEqual(situacaoDoSaldo(r, 'b4'), { tipo: 'bate' });
});

test('conferência incompleta: nenhum banco recebe veredito', () => {
    const r = resultado({ completo: false });
    assert.deepEqual(situacaoDoSaldo(r, 'b1'), { tipo: 'sem-dados' });
});
```

  Acrescentar ao fim de `src/utils/contaBancaria.test.ts`:

```ts
import { camposDaConta as camposDaContaNova } from './contaBancaria.ts';

test('titular e PIX só vão ao banco quando vieram na conta (SQL pode não ter rodado)', () => {
    const sem = camposDaContaNova({ name: 'Itaú' }, true);
    assert.ok(!('titular' in sem) && !('chave_pix' in sem));

    const com = camposDaContaNova({ name: 'Itaú', titular: 'Sueli', chave_pix: '' }, false);
    assert.equal(com.titular, 'Sueli');
    assert.equal(com.chave_pix, null);
});
```

- [ ] **Step 3: Ver falhar.** Rode a suíte; os testes novos falham (funções e campos inexistentes).

- [ ] **Step 4: Implementar em `src/utils/conferenciaDeSaldo.ts`** (acrescentar no fim do arquivo):

```ts
/** Um pagamento como chega de getAllPaymentsComTeto — só o que a conferência usa. */
export interface PagamentoParaConferir {
    account_id?: string | null;
    amount?: number | null;
    obligation_id?: string | null;
    reversed_at?: string | null;
    reversal_of?: string | null;
    affects_balance?: boolean | null;
}

/**
 * Os movimentos de cada banco, com o tipo tirado da conta (a receber entra, a pagar sai).
 *
 * Dashboard, fila do Início e Cadastros › Bancos montavam isto cada um do seu jeito;
 * agora é um lugar só, para os três darem o mesmo veredito.
 */
export function movimentosDosPagamentos(
    pagamentos: PagamentoParaConferir[],
    contas: { id: string; type?: string | null }[],
): MovimentoDeConta[] {
    const tipoPorConta = new Map(contas.map(c => [c.id, c.type]));
    return pagamentos.map(p => ({
        account_id: p.account_id,
        amount: p.amount,
        tipo: p.obligation_id ? tipoPorConta.get(p.obligation_id) : undefined,
        reversed_at: p.reversed_at,
        reversal_of: p.reversal_of,
        affects_balance: p.affects_balance,
    }));
}

/** Com este tanto de contas, o mapa de tipos pode estar incompleto: a conferência se cala. */
export const TETO_DE_CONTAS = 5000;

export const dadosCompletosDaConferencia = (pagamentosTruncados: boolean, totalDeContas: number): boolean =>
    !pagamentosTruncados && totalDeContas < TETO_DE_CONTAS;

export type SituacaoDoSaldo =
    | { tipo: 'bate' }
    | { tipo: 'nao-bate'; guardado: number; calculado: number }
    | { tipo: 'sem-partida' }
    | { tipo: 'sem-dados' };

/** O veredito de UM banco. Informação incompleta produz silêncio ('sem-dados'), nunca acusação. */
export function situacaoDoSaldo(r: ResultadoDaConferencia, accountId: string): SituacaoDoSaldo {
    if (!r.completo) return { tipo: 'sem-dados' };
    const d = r.divergencias.find(x => x.account_id === accountId);
    if (d) return { tipo: 'nao-bate', guardado: d.guardado, calculado: d.calculado };
    if (r.semLinhaDeBase.some(x => x.account_id === accountId)) return { tipo: 'sem-partida' };
    if (r.inconclusivas.some(x => x.account_id === accountId)) return { tipo: 'sem-dados' };
    return { tipo: 'bate' };
}
```

- [ ] **Step 5: Implementar em `src/utils/contaBancaria.ts`.** Em `DadosDaConta`, acrescentar
  `titular?: string | null;` e `chave_pix?: string | null;`. Depois de `CAMPOS_DE_SALDO`:

```ts
/**
 * Campos que só existem depois de supabase/cadastros_v3_1.sql. Vão ao banco apenas
 * quando vieram na conta: antes do SQL o formulário nem os mostra, e mandar uma
 * coluna inexistente faria o PostgREST recusar a gravação inteira.
 */
export const CAMPOS_NOVOS = ['titular', 'chave_pix'] as const;
```

  Em `camposDaConta`, logo depois do laço de `CAMPOS_DESCRITIVOS`:

```ts
    for (const campo of CAMPOS_NOVOS) {
        if (dados[campo] !== undefined) saida[campo] = dados[campo] || null;
    }
```

- [ ] **Step 6: Tipos e leitura.**
  - Em `src/types/index.ts`:
    - `BankAccount` ganha `titular?: string | null;` e `chave_pix?: string | null;`.
    - `CompanyProfile` ganha `banco_do_orcamento_id?: string | null;` e
      `banco_do_orcamento?: { bank_name?: string | null; agency?: string | null; account_number?: string | null; titular?: string | null; chave_pix?: string | null } | null;`.
      O segundo campo é preenchido na Task 7; aqui só o tipo.
  - Em `financeRepository.getBankAccounts`, no objeto mapeado, acrescentar a linha abaixo. A chave só existe
    quando a coluna existe; é assim que a tela sabe se o SQL rodou.

```ts
            ...('titular' in r ? { titular: r.titular ?? null, chave_pix: r.chave_pix ?? null } : {}),
```

- [ ] **Step 7: `BankAccountModal`.**
  - Nova prop `camposNovos?: boolean`.
  - **Remover da tela o seletor de Moeda.** O valor continua indo como `'BRL'` pelo `camposDaConta`.
  - **Com `camposNovos`:** depois de "Agência / Conta", mostrar dois campos com o mesmo estilo dos vizinhos:
    - **Titular**, placeholder `Nome do titular`, ligado a `titular`;
    - **Chave PIX**, placeholder `CPF/CNPJ, e-mail, telefone ou aleatória`, ligado a `chave_pix`.
  - **Sem `camposNovos`:** os dois campos não aparecem e não entram no estado do formulário (ficam `undefined`).

- [ ] **Step 8: `src/components/cadastros/BancosPanel.tsx`.** É a lista dos bancos com a conferência, montada
  com as peças que hoje estão em `src/pages/Finance.tsx`. O código de lá serve de modelo; nada é reinventado:
  - `handleSaveBank`, o `onSetBalance` com a tradução do erro de `set_bank_balance` (linhas ~221 e ~724);
  - as confirmações de inativar e reativar (`handleInactivateBank`, `handleReactivateBank`, `executeConfirm`, com
    `ConfirmModal`/`ConfirmarOperacao` e `operacaoId` `'inativar-conta'`);
  - a janela de sincronizar (`ConfirmarOperacao` com `operacaoId="sincronizar-saldos"` e o detalhe "O que cada
    conta vira").

  **Carga** (um `useCallback` + `useEffect`):

```ts
const [bancos, contas, pags] = await Promise.all([
    storageService.getBankAccounts(!mostrarInativos ? true : false),
    storageService.getObligations(),
    storageService.getAllPaymentsComTeto(),
]);
const conferencia = conferirSaldos(
    bancos.filter(b => b.is_active),
    movimentosDosPagamentos(pags.pagamentos, contas),
    { dadosCompletos: dadosCompletosDaConferencia(pags.truncado, contas.length) },
);
```

  **Tela** (classes do `estilo.ts`):
  - **Topo:**
    - `ROTULO` "Bancos";
    - `BOTAO_PRINCIPAL` "Novo banco", que abre o `BankAccountModal` vazio;
    - `camposNovos = bancos.some(b => 'titular' in b)`.
  - **Uma linha por banco** (`ITEM`, `p-4`):
    - nome e tipo em `ROTULO_PEQUENO`;
    - saldo (`mostrar(b.current_balance)`), em rosa se negativo;
    - abaixo, o veredito de `situacaoDoSaldo(conferencia, b.id)`:
      - `bate` → `✓ bate com os lançamentos`, em `text-emerald-500/80`;
      - `nao-bate` → `não bate: guardado ${mostrar(guardado)} × lançamentos ${mostrar(calculado)}`, em `text-rose-400`;
      - `sem-partida` → `falta o saldo de partida`, em `text-amber-400`, com o `BOTAO_SUAVE` "Ajustar pelo extrato",
        que abre o modal do banco (onde está o ajuste);
      - `sem-dados` → nada.
    - Botões da linha: "Editar" (`BOTAO_SECUNDARIO`), que abre o modal com o banco, e "Inativar" (`BOTAO_PERIGO`).
    - Banco inativo (só com "Mostrar inativos" ligado): nome riscado e o botão "Reativar".
  - **Pé da lista:** `pilula(mostrarInativos)` "Mostrar inativos".
  - **"Manutenção"** (`CARTAO p-5`, no fim da página):
    - o texto: `Sincronizar saldos sobrescreve o saldo guardado de cada banco pelo calculado a partir dos lançamentos. Confira os bancos que não batem antes — sincronizar apaga o saldo guardado.`;
    - o botão "Sincronizar saldos…" (`BOTAO_PERIGO`), que abre a confirmação de hoje.
  - **Avisos:** usar o `AlertToast`/`showAlert` como Finance usa.

- [ ] **Step 9: Aba em `MasterData`.**
  - Acrescentar `{ id: 'bancos' as TabId, label: 'Bancos', icon: Landmark }` em `TABS`, depois de `products`, e
    `'bancos'` ao tipo `TabId`.
  - Render: `{activeTab === 'bancos' && <BancosPanel />}`.

- [ ] **Step 10: A fila usa a montagem comum.** Em `src/hooks/inicio/useFilaDoInicio.ts`, trocar o
  `tipoPorObrigacao` e o `pags.pagamentos.map(...)` por:

```ts
        const conferencia = conferirSaldos(
            bancos,
            movimentosDosPagamentos(pags.pagamentos, contas),
            { dadosCompletos: dadosCompletosDaConferencia(pags.truncado, contas.length) },
        );
```

  O resultado tem de ser o mesmo: a regra era `!pags.truncado && contas.length < 5000`.

- [ ] **Step 11: Suíte e tipos limpos, depois commit.**

```bash
git add supabase/cadastros_v3_1.sql src/components/cadastros/BancosPanel.tsx src/utils/conferenciaDeSaldo.ts src/utils/conferenciaDeSaldo.test.ts src/utils/contaBancaria.ts src/utils/contaBancaria.test.ts src/types/index.ts src/repositories/financeRepository.ts src/components/modals/BankAccountModal.tsx src/pages/MasterData.tsx src/hooks/inicio/useFilaDoInicio.ts
git commit -F - <<'EOF'
feat(cadastros): bancos em Cadastros, com a conferência do saldo por banco

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Uma conta de completude e a aba Produtos

A completude passa a ter uma função só, usada pelo painel de Produtos (agora), pelo fichário (Task 3) e pela
fila do Início (Task 6). O painel sobe para o topo da aba Produtos, absorvendo o de fichas pendentes, e o editor
do produto fica em 4 blocos.

**Files:**
- Create: `src/utils/completudeDosDados.ts`, `src/utils/completudeDosDados.test.ts`
- Modify: `src/hooks/useCompletudeDoCadastro.ts`
- Modify: `src/pages/masterdata/CompletudeTab.tsx` (vira o painel do topo de Produtos)
- Modify: `src/pages/MasterData.tsx`
- Modify: `src/components/masterdata/ProductForm.tsx`
- Delete: `src/components/masterdata/FichasPendentesPanel.tsx` (função absorvida; tirar também do
  `src/components/masterdata/index.ts`, se exportado lá)

**Interfaces:**
- **Produces:**
  - `interface DadosDaCompletude { pedidos; orcamentos; produtos; insumos; fichaPorProduto }`
  - `completudeDosDados(d: DadosDaCompletude): Completude`
  - `produtosSemFichaQueVenderam(c: Completude): number`
- **Produces:** `CompletudeTab` aceita as props novas:
  - `onComecarMutirao: (ids: string[]) => void`;
  - `destacar?: boolean` (rola até ele ao montar).

- [ ] **Step 1: Teste que falha** — `src/utils/completudeDosDados.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completudeDosDados, produtosSemFichaQueVenderam } from './completudeDosDados.ts';

const pedido = (id: string, itens: any[]) => ({ id, order_number: id, budget_id: `o-${id}`, created_at: '2026-09-10', items: itens });
const orc = (id: string, itens: any[]) => ({ id: `o-${id}`, items: itens });

test('a fila conta só o produto sem ficha que vendeu; apelido vende pelo oficial', () => {
    const c = completudeDosDados({
        pedidos: [pedido('1', [
            { product_id: 'A', product_name: 'A', quantity: 10 },
            { product_id: 'D', product_name: 'D', quantity: 5 },
        ])],
        orcamentos: [orc('1', [
            { product_id: 'A', product_name: 'A', unit_price: 50 },
            { product_id: 'D', product_name: 'D', unit_price: 40 },
        ])],
        produtos: [
            { id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' },
            { id: 'D', name: 'D', canonical_product_id: 'C' },
        ],
        insumos: [],
        fichaPorProduto: new Map([['C', ['i1']]]),
    });
    // O painel lista todo produto sem ficha (A, B e o apelido D), na ordem do que pesa.
    assert.deepEqual(c.produtosSemFicha.map(l => [l.id, l.pecas]), [['A', 10], ['B', 0], ['D', 0]]);
    // A venda de D conta para C, que tem ficha: só A vendeu sem ficha.
    assert.equal(produtosSemFichaQueVenderam(c), 1);
    assert.equal(c.produtosPendentes, 3);
});

test('sem venda nenhuma, nada vendeu sem ficha', () => {
    const c = completudeDosDados({ pedidos: [], orcamentos: [], produtos: [{ id: 'A', name: 'A' }], insumos: [], fichaPorProduto: new Map() });
    assert.equal(produtosSemFichaQueVenderam(c), 0);
    assert.equal(c.cobertura, 0);
});
```

  Se a ordem entre B e D sair diferente (os dois têm peso zero), ajuste o teste para comparar como conjunto
  (`new Set(...)`) só esses dois, mantendo A em primeiro. O que importa é A na frente e os pesos.

- [ ] **Step 2: Ver falhar** (módulo inexistente).

- [ ] **Step 3: Implementar** — `src/utils/completudeDosDados.ts`:

```ts
/**
 * A completude a partir dos dados crus: pedidos, orçamentos, produtos, insumos e fichas.
 *
 * Painel de Produtos, fichário e fila do Início chamam ESTA função. Cada um montando a
 * sua versão daria três "N sem ficha" diferentes para a mesma pergunta.
 */
import { montarItensVendidos } from './itensVendidos.ts';
import type { PedidoVendido, OrcamentoRef } from './itensVendidos.ts';
import { mapaDeCanonicos as canonicosDeProduto } from './apelidosDeProduto.ts';
import type { ProdutoComApelido } from './apelidosDeProduto.ts';
import { mapaDeCanonicos as canonicosDeInsumo } from './apelidosDeInsumo.ts';
import type { InsumoComApelido } from './apelidosDeInsumo.ts';
import { apurarCompletude } from './completudeDoCadastro.ts';
import type { Completude, CadastroPesavel } from './completudeDoCadastro.ts';

export interface DadosDaCompletude {
    pedidos: PedidoVendido[];
    orcamentos: OrcamentoRef[];
    produtos: (CadastroPesavel & ProdutoComApelido)[];
    insumos: (CadastroPesavel & InsumoComApelido)[];
    fichaPorProduto: Map<string, string[]>;
}

export function completudeDosDados(d: DadosDaCompletude): Completude {
    // O nome do cliente não entra na completude: função fixa em vez de carregar clientes.
    const vendas = montarItensVendidos(d.pedidos, d.orcamentos, () => '—');
    return apurarCompletude({
        vendas: vendas.map(v => ({
            produtoId: v.produtoId,
            produtoNome: v.produto,
            tecidoId: v.tecidoId,
            quantidade: v.quantidade,
            faturamento: v.valorTotal,
            faturamentoConhecido: v.precoConhecido,
            order_id: v.order_id,
        })),
        produtos: d.produtos,
        insumos: d.insumos,
        fichaPorProduto: d.fichaPorProduto,
        canonicoDeInsumo: canonicosDeInsumo(d.insumos),
        canonicoDeProduto: canonicosDeProduto(d.produtos),
    });
}

/** Produtos sem ficha que já venderam: o N da linha "Cadastrar ficha técnica" do Início. */
export const produtosSemFichaQueVenderam = (c: Completude): number =>
    c.produtosSemFicha.filter(l => l.pecas > 0).length;
```

- [ ] **Step 4: Ver passar.**

- [ ] **Step 5: O gancho usa a função.** Em `src/hooks/useCompletudeDoCadastro.ts`:
  - guardar os pedidos e orçamentos crus no estado, em vez de `vendas`;
  - o `useMemo` vira `completudeDosDados({ pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha })`;
  - remover os imports que ficarem sem uso.
  O retorno do gancho não muda.

- [ ] **Step 6: O painel no topo de Produtos.** `CompletudeTab` deixa de ser aba e vira o painel do topo da aba
  Produtos. O conteúdo de hoje continua:
  - o placar com a cor por faixa;
  - "Produtos sem ficha técnica" e "Insumos sem custo" por impacto;
  - o "os N primeiros respondem por…";
  - o link do insumo para o Estoque;
  - abrir o produto.

  Mudanças:
  - **Botão "Começar mutirão"** (`BOTAO_PRINCIPAL`) no bloco "Produtos sem ficha técnica". Chama
    `onComecarMutirao(ids)`, com os ids dos produtos sem ficha **na ordem da lista** (por impacto: quem vende mais
    primeiro). É o que o `FichasPendentesPanel` fazia, agora na ordem certa.
  - **Recolhido quando está bom:** com `completude.cobertura > 0.7` **e** nenhum produto sem ficha com
    `pecas > 0`, o painel mostra só uma linha `ITEM`:
    `Cobertura ${pct(cobertura)} · tudo o que vende tem ficha técnica`, com o `BOTAO_SECUNDARIO` "Ver detalhes", que
    expande. Nos outros casos, aberto.
  - **`destacar`:** quando `true`, ao montar faz
    `ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })` no painel.

- [ ] **Step 7: `MasterData`.**
  - Tirar `completude` de `TABS` e do tipo `TabId`.
  - Na aba `products`, trocar o `<FichasPendentesPanel …/>` por `<CompletudeTab onAbrirProduto={…} onAbrirInsumo={…} onComecarMutirao={…} />`:
    - os `onAbrir…` são os mesmos de hoje (linhas ~404–413);
    - `onComecarMutirao` recebe os ids e faz o que `comecarFichas` faz hoje com a lista de produtos:
      `abrirFichaDoProduto(ids[0], ids.slice(1))`.
  - Apagar `src/components/masterdata/FichasPendentesPanel.tsx` e a referência no `index.ts` da pasta, se houver.

- [ ] **Step 8: `ProductForm` em 4 blocos.** Os campos não mudam, só a ordem e os títulos. Cada bloco abre com um
  título `ROTULO`, e os blocos ficam separados por `space-y-6`:
  1. **Dados:**
     - Nome com "Sugerir nome" e Categoria;
     - o aviso "Mesma peça, nome diferente" / "Parecem ser a mesma peça";
     - SKU / Ref, Capacidade produtiva e Custo (e o "Alerta de Margem!" logo abaixo do custo, como hoje).
  2. **Preços:** a "Tabela de Preços" de hoje inteira:
     - as abas Valores e Notas;
     - T1, T2 e T3, e o critério das faixas;
     - o aviso de T1 acima do maior praticado;
     - "Preço praticado neste produto" e a margem nessa mediana.
  3. **Calcular preço:** a "Calculadora de Custo de Produção" inteira, **recolhida** por padrão:
     - o título vira um botão `BOTAO_SECUNDARIO` "Calcular preço" com `aria-expanded`;
     - aberto, mostra a calculadora exatamente como hoje, com "APLICAR PREÇO" e o sincronismo do tecido com a
       ficha (`onApplyCalculator`).
  4. **Ficha técnica:** já é o `ProductInsumosForm` que o `MasterData` põe depois do `ProductForm`. Só ganha o
     título `ROTULO` "Ficha técnica", que pode ficar no `MasterData`, antes dele.

- [ ] **Step 9: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/completudeDosDados.ts src/utils/completudeDosDados.test.ts src/hooks/useCompletudeDoCadastro.ts src/pages/masterdata/CompletudeTab.tsx src/pages/MasterData.tsx src/components/masterdata/ProductForm.tsx src/components/masterdata
git commit -F - <<'EOF'
feat(cadastros): completude no topo de Produtos e editor do produto em blocos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Navegação — o fichário e os cartões

Cadastros passa a abrir no fichário; cada cartão é uma view. A barra de abas interna do `MasterData` sai, e o
gerenciamento de bancos sai de Contas.

**Files:**
- Modify: `src/utils/navegacao.ts`, `src/utils/navegacao.test.ts`
- Modify: `src/components/layout/icones.ts`
- Create: `src/utils/fichario.ts`, `src/utils/fichario.test.ts`
- Create: `src/hooks/cadastros/useFichario.ts`
- Create: `src/components/cadastros/Fichario.tsx`, `src/components/cadastros/CabecalhoDoCartao.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/MasterData.tsx`
- Modify: `src/pages/masterdata/MensagensTab.tsx` (exportar a contagem)
- Modify: `src/components/masterdata/ClientesDormentes.tsx` (prop `abertaInicial`)
- Modify: `src/pages/Finance.tsx` ("Gerenciar bancos")
- Modify: `src/utils/inicio/fila.ts`, `src/utils/inicio/fila.test.ts` (as linhas de saldo vão para `bancos`)

**Interfaces:**
- **Consumes:**
  - `completudeDosDados` (Task 2);
  - `movimentosDosPagamentos`, `dadosCompletosDaConferencia`, `conferirSaldos` (Task 1);
  - `BancosPanel` como aba `bancos` do `MasterData` (Task 1);
  - `clientesDormentes` (`src/utils/acompanhamentoComercial.ts`).
- **Produces** (`navegacao.ts`):
  - os novos valores de `View`: `'cadastros' | 'clientes' | 'fornecedores' | 'produtos' | 'bancos' | 'setores' | 'empresa' | 'categorias' | 'mensagens'`;
  - `CARTOES_DO_FICHARIO: View[]`.
- **Produces** (`fichario.ts`): `DadosDoFichario`, `CartaoDoFichario`, `montarFichario(d: DadosDoFichario | null, dinheiro): CartaoDoFichario[]`.
- **Produces** (`MasterData`): props `aba: TabId`, `abertura?: AberturaDeCadastro | null`, `limparAbertura?: () => void`,
  com `type AberturaDeCadastro = { clienteId?: string; dormentes?: boolean; completude?: boolean }`, exportado de
  `MasterData.tsx`.
- **Produces** (`Finance`): prop `onGerenciarBancos?: () => void`.
- **Produces** (`fila.ts`): a variante `{ view: 'bancos' }` em `DestinoDaFila`.

- [ ] **Step 1: Testes que falham** — em `src/utils/navegacao.test.ts`:
  - acrescentar `CARTOES_DO_FICHARIO` ao import;
  - trocar o teste "toda view tem dono…" por:

```ts
test('toda view tem dono: menu, fichário ou saída declarada', () => {
    const noMenu = new Set([...todasAsViewsDoMenu(), ...CARTOES_DO_FICHARIO]);
    for (const v of TODAS) assert.ok(noMenu.has(v) || FORA_DO_MENU.includes(v), `${v} sem lugar`);
});
```

  - no teste "cada objetivo traz os passos…", trocar a última linha por
    `assert.deepEqual(viewsDaSecao('cadastros'), ['cadastros']);`;
  - acrescentar:

```ts
test('o fichário tem os 8 cartões na ordem do desenho, todos em Cadastros', () => {
    assert.deepEqual(CARTOES_DO_FICHARIO,
        ['clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens']);
    for (const v of CARTOES_DO_FICHARIO) assert.equal(secaoDaView(v), 'cadastros', v);
    assert.equal(temPassos('cadastros'), false);
});

test('links antigos de Cadastros continuam abrindo', () => {
    assert.equal(viewReal('masterdata'), 'cadastros');
    assert.equal(viewReal('capacidade'), 'setores');
    assert.equal(secaoDaView('masterdata'), 'cadastros');
    assert.equal(secaoDaView('capacidade'), 'cadastros');
});
```

  Criar `src/utils/fichario.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarFichario } from './fichario.ts';
import type { DadosDoFichario } from './fichario.ts';

const R = (v: number) => `R$ ${v}`;
const dados: DadosDoFichario = {
    clientes: 124, sumidos: 5, produtos: 63, semFicha: 31, fornecedores: 1,
    bancos: 2, naoBatem: 1, setores: 6, gargaloSemanal: 350, categorias: 40, naoRevisadas: 0,
    mensagens: 15, metaSugerida: null,
};

test('os 8 cartões, na ordem, com contagem e o que pede atenção', () => {
    const c = montarFichario(dados, R);
    assert.deepEqual(c.map(x => x.view),
        ['clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens']);
    assert.deepEqual(c.map(x => [x.contagem, x.atencao, x.tom]), [
        ['124 clientes', '5 sumidos', 'ambar'],
        ['63 produtos', '31 sem ficha técnica', 'ambar'],
        ['1 fornecedor', null, 'neutro'],
        ['2 bancos ativos', '1 não bate', 'rosa'],
        ['6 setores', 'gargalo 350 pç/semana', 'neutro'],
        [null, null, 'neutro'],
        ['40 categorias', null, 'neutro'],
        ['15 modelos', null, 'neutro'],
    ]);
});

test('meta sugerida aparece em Minha empresa quando há sugestão', () => {
    const empresa = montarFichario({ ...dados, metaSugerida: 67000 }, R).find(x => x.view === 'empresa')!;
    assert.equal(empresa.atencao, 'meta sugerida R$ 67000');
});

test('falha ao carregar: cartões sem número nenhum, nunca zero', () => {
    const c = montarFichario(null, R);
    assert.equal(c.length, 8);
    assert.ok(c.every(x => x.contagem === null && x.atencao === null && x.tom === 'neutro'));
});

test('singular e plural', () => {
    const c = montarFichario({ ...dados, sumidos: 1, naoBatem: 2, naoRevisadas: 1, clientes: 1 }, R);
    assert.equal(c[0].contagem, '1 cliente');
    assert.equal(c[0].atencao, '1 sumido');
    assert.equal(c[3].atencao, '2 não batem');
    assert.equal(c[6].atencao, '1 não revisada');
});
```

  Em `src/utils/inicio/fila.test.ts`, no teste "saldo bancário…": trocar a linha do `assert.ok(um.linhas.every(…'finance'…))`
  por `assert.ok(um.linhas.every(l => l.destino.view === 'bancos' && Object.keys(l.destino).length === 1));`
  e o título por `'saldo bancário: as duas linhas no Dinheiro → bancos; nenhuma com zero; nunca "sincronizar"'`.

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: `navegacao.ts`.**
  - **`View`:** acrescentar `| 'cadastros' | 'clientes' | 'fornecedores' | 'produtos' | 'bancos' | 'setores' | 'empresa' | 'categorias' | 'mensagens'`.
  - **`ROTULO_DA_VIEW`:**
    - views novas: `cadastros: 'Cadastros'`, `clientes: 'Clientes'`, `fornecedores: 'Fornecedores'`,
      `produtos: 'Produtos'`, `bancos: 'Bancos'`, `setores: 'Setores e capacidade'`, `empresa: 'Minha empresa'`,
      `categorias: 'Categorias'`, `mensagens: 'Mensagens'`;
    - existentes: `masterdata` continua `'Cadastros'` e `capacidade` continua `'Setores e capacidade'`.
  - **`SECOES`:** a seção `cadastros` passa a ter `views: ['cadastros']`.
  - **Lista nova, depois de `SECOES`:**

```ts
/**
 * Os cartões do fichário de Cadastros. Não são passos: Cadastros é apoio, e a regra
 * dos 3 passos vale para os objetivos. Cada cartão é uma view da seção cadastros.
 */
export const CARTOES_DO_FICHARIO: View[] = [
    'clientes', 'produtos', 'fornecedores', 'bancos', 'setores', 'empresa', 'categorias', 'mensagens',
];
```

  - **`ALIAS_DE_VIEW`:** `{ pcp: 'quadro', production: 'quadro', masterdata: 'cadastros', capacidade: 'setores' }`.
  - **`FORA_DO_MENU`:** acrescentar `'masterdata', // alias → cadastros` e `'capacidade', // alias → setores`.
  - **`POR_VIEW`:** depois do laço das seções, acrescentar
    `for (const v of CARTOES_DO_FICHARIO) POR_VIEW.set(v, 'cadastros');`.

- [ ] **Step 4: `icones.ts`.** Acrescentar em `ICONE_DA_VIEW`:
  - `cadastros: Database`, `clientes: Users`, `fornecedores: Truck`, `produtos: Shirt`, `bancos: Landmark`,
    `setores: Settings2`, `empresa: Building2`, `categorias: Tags`, `mensagens: MessageCircle`;
  - os ícones novos vêm de `lucide-react`.

- [ ] **Step 5: `src/utils/fichario.ts`.**

```ts
/**
 * O fichário de Cadastros: um cartão por cadastro, com a contagem e o que pede atenção.
 * Pura — os números chegam prontos (ver useFichario). Spec do S2, seção 2.
 */
import type { View } from './navegacao.ts';

export interface DadosDoFichario {
    clientes: number; sumidos: number;
    produtos: number; semFicha: number;
    fornecedores: number;
    bancos: number; naoBatem: number;
    setores: number;
    /** Menor capacidade semanal entre os setores; 0 = nenhum setor com capacidade. */
    gargaloSemanal: number;
    categorias: number; naoRevisadas: number;
    mensagens: number;
    /** Meta sugerida quando difere da gravada (Task 8). null = nada a dizer. */
    metaSugerida: number | null;
}

export type TomDoCartao = 'ambar' | 'rosa' | 'neutro';

export interface CartaoDoFichario {
    view: View;
    titulo: string;
    contagem: string | null;
    atencao: string | null;
    tom: TomDoCartao;
}

const s = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** `d` nulo = a carga falhou: cartões sem número, para não dizer "0 pendências" sem saber. */
export function montarFichario(d: DadosDoFichario | null, dinheiro: (v: number) => string): CartaoDoFichario[] {
    const cartao = (view: View, titulo: string, contagem: string | null, atencao: string | null, tom: TomDoCartao = 'ambar'): CartaoDoFichario => ({
        view, titulo,
        contagem: d ? contagem : null,
        atencao: d ? atencao : null,
        tom: d && atencao ? tom : 'neutro',
    });
    if (!d) {
        return [
            cartao('clientes', 'Clientes', null, null), cartao('produtos', 'Produtos', null, null),
            cartao('fornecedores', 'Fornecedores', null, null), cartao('bancos', 'Bancos', null, null),
            cartao('setores', 'Setores e capacidade', null, null), cartao('empresa', 'Minha empresa', null, null),
            cartao('categorias', 'Categorias', null, null), cartao('mensagens', 'Mensagens', null, null),
        ];
    }
    return [
        cartao('clientes', 'Clientes', s(d.clientes, 'cliente', 'clientes'),
            d.sumidos > 0 ? s(d.sumidos, 'sumido', 'sumidos') : null),
        cartao('produtos', 'Produtos', s(d.produtos, 'produto', 'produtos'),
            d.semFicha > 0 ? `${d.semFicha} sem ficha técnica` : null),
        cartao('fornecedores', 'Fornecedores', s(d.fornecedores, 'fornecedor', 'fornecedores'), null),
        cartao('bancos', 'Bancos', s(d.bancos, 'banco ativo', 'bancos ativos'),
            d.naoBatem > 0 ? `${d.naoBatem} não ${d.naoBatem === 1 ? 'bate' : 'batem'}` : null, 'rosa'),
        cartao('setores', 'Setores e capacidade', s(d.setores, 'setor', 'setores'),
            d.gargaloSemanal > 0 ? `gargalo ${d.gargaloSemanal} pç/semana` : null, 'neutro'),
        cartao('empresa', 'Minha empresa', null,
            d.metaSugerida !== null ? `meta sugerida ${dinheiro(d.metaSugerida)}` : null),
        cartao('categorias', 'Categorias', s(d.categorias, 'categoria', 'categorias'),
            d.naoRevisadas > 0 ? `${d.naoRevisadas} não ${d.naoRevisadas === 1 ? 'revisada' : 'revisadas'}` : null),
        cartao('mensagens', 'Mensagens', s(d.mensagens, 'modelo', 'modelos'), null),
    ];
}
```

  **Ver passar** (`fichario.test.ts` e `navegacao.test.ts`).

- [ ] **Step 6: `MensagensTab` exporta a contagem.** Depois da constante `MODELOS`, acrescentar
  `export const TOTAL_DE_MENSAGENS = MODELOS.length;`.

- [ ] **Step 7: `src/hooks/cadastros/useFichario.ts`.** Carrega uma vez ao montar e devolve
  `{ dados: DadosDoFichario | null; erro: string; carregando: boolean }`:

```ts
const [clientes, produtos, fornecedores, bancos, setores, categorias, ficha, pedidos, orcamentos, insumos, contas, pags] =
    await Promise.all([
        storageService.getClients(), storageService.getProducts(), storageService.getSuppliers(),
        storageService.getBankAccounts(true), storageService.getSectors(false),
        storageService.getGlobalCategories('finance'), storageService.getFichaPorProduto(),
        storageService.getOrders(), storageService.getBudgets(), storageService.getInsumos(),
        storageService.getObligations(), storageService.getAllPaymentsComTeto(),
    ]);
const completude = completudeDosDados({ pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha } as any);
const conferencia = conferirSaldos(bancos, movimentosDosPagamentos(pags.pagamentos, contas),
    { dadosCompletos: dadosCompletosDaConferencia(pags.truncado, contas.length) });
const capacidades = setores.map(s => s.weekly_capacity_pieces).filter(c => c > 0);
setDados({
    clientes: clientes.length,
    sumidos: clientesDormentes(clientes, pedidos.map(o => ({ client_id: o.client_id, data: o.created_at, valor: Number(o.total_amount) || 0 })), getTodayStr()).length,
    produtos: produtos.length,
    semFicha: completude.produtosPendentes,
    fornecedores: fornecedores.length,
    bancos: bancos.length,
    naoBatem: conferencia.divergencias.length,
    setores: setores.length,
    gargaloSemanal: capacidades.length ? Math.min(...capacidades) : 0,
    // Categoria é o nível de baixo (tem pai); sem natureza = ainda não revisada (igual à aba Categorias).
    categorias: categorias.filter(c => c.parent_id).length,
    naoRevisadas: categorias.filter(c => c.parent_id && !c.natureza).length,
    mensagens: TOTAL_DE_MENSAGENS,
    metaSugerida: null,
});
```

  - **Se qualquer leitura falhar:** `dados` fica `null` e `erro` recebe a mensagem.
  - **Os imports** vêm de `@/services/storage`, `@/utils/completudeDosDados`, `@/utils/conferenciaDeSaldo`,
    `@/utils/acompanhamentoComercial`, `@/utils/date` (`getTodayStr`) e `@/pages/masterdata/MensagensTab`.

- [ ] **Step 8: `src/components/cadastros/Fichario.tsx`.** Props: `{ onAbrir: (view: View) => void }`.
  - Usa `useFichario()`, `useMostrarValor()` e `montarFichario(dados, mostrar)`.
  - **Topo:** `ROTULO` "Cadastros" e um `h1` "Fichário" no estilo das outras telas. Com `erro`, uma linha
    `text-rose-400` com o texto "Não consegui carregar os números — os cartões abrem normalmente." e o botão
    "Tentar de novo".
  - **Grade:** `grid gap-3 sm:grid-cols-2`. Cada cartão é um `<button type="button">` com `CARTAO p-5` e
    `text-left hover:border-zinc-700`:
    - o ícone de `ICONE_DA_VIEW[view]`;
    - o título em `text-sm font-black uppercase tracking-widest text-zinc-200`;
    - a contagem em `ROTULO_PEQUENO`, mostrada só quando não for `null`;
    - a atenção, quando houver: `text-amber-400` se `ambar`, `text-rose-400` se `rosa`, `text-zinc-500` se
      `neutro`, em `text-[11px] font-black uppercase tracking-widest`.
  - **Enquanto carrega:** os cartões aparecem sem números (`montarFichario(null, …)`), nunca com zeros.

- [ ] **Step 9: `src/components/cadastros/CabecalhoDoCartao.tsx`.**
  - Props: `{ view: View; onVoltar: () => void }`.
  - Uma linha com:
    - o botão `BOTAO_SECUNDARIO` "← Cadastros", com `aria-label="Voltar ao fichário"`;
    - o título `ROTULO_DA_VIEW[view]` em `text-xl font-black uppercase tracking-tight text-white`.
  - `mb-6`.

- [ ] **Step 10: `MasterData` recebe `aba`.**
  - **Props:** `aba: TabId`, `abertura?: AberturaDeCadastro | null` e `limparAbertura?: () => void`.
    - Exportar `export type AberturaDeCadastro = { clienteId?: string; dormentes?: boolean; completude?: boolean };`.
    - Exportar também o tipo `TabId`.
  - `activeTab` deixa de ser estado e passa a ser `const activeTab = aba;`. Apagar `setActiveTab`; onde ele era
    usado (`onVerPorImpacto`, `onAbrirProduto` da Completude), a troca de aba some porque tudo já está em Produtos.
  - **A barra de abas** (o `div` com `TABS.map`) **sai**. O `IndicadorRecarga` vai para o canto direito do topo do
    conteúdo. A constante `TABS` sai se ficar sem uso.
  - **Abertura** (um `useEffect` em `[abertura, clients]`):
    - `clienteId` existente em `clients` → `setClienteAberto(id)`;
    - `dormentes` → passa `abertaInicial` ao `ClientesDormentes`;
    - `completude` → passa `destacar` ao painel de Completude.
    - Depois de usar: `limparAbertura?.()`.
  - **O deep-link `openProductId`** continua como está.

- [ ] **Step 11: `ClientesDormentes` aceita `abertaInicial?: boolean`.** O estado `aberta` começa com ele, e
  quando ele vem `true`, o componente rola até si ao montar (`scrollIntoView`, como a Completude).

- [ ] **Step 12: `App.tsx`.**
  - **Estados novos:** `aberturaClientes` e `aberturaProdutos`, ambos do tipo `AberturaDeCadastro | null`.
  - **`irParaProdutos`** passa a ser:
    `() => { setAberturaProdutos({ completude: true }); handleNavigate('produtos'); }`.
  - **Rotas em `renderContent`** (sai o `case 'masterdata'`; `capacidade` vira alias). Todo cartão vem embrulhado
    com `<CabecalhoDoCartao view={currentView} onVoltar={() => handleNavigate('cadastros')} />` por cima:
    - `case 'cadastros': return <Fichario onAbrir={handleNavigate} />;`
    - `clientes` → `<MasterData key="clientes" aba="clients" abertura={aberturaClientes} limparAbertura={() => setAberturaClientes(null)} … />`;
    - `produtos` → `<MasterData key="produtos" aba="products" abertura={aberturaProdutos} limparAbertura={() => setAberturaProdutos(null)} … />`;
    - `fornecedores` → `aba="suppliers"`, `bancos` → `aba="bancos"`, `empresa` → `aba="company"`,
      `categorias` → `aba="categorias"`, `mensagens` → `aba="mensagens"`;
    - `setores` → `<PCP key="setores" abas={['capacity']} onGoToProducts={irParaProdutos} />`;
    - todos os `MasterData` recebem as mesmas props de hoje: `onProfileUpdate`, `openProductId`,
      `clearOpenProduct` e `onNavigate`.
  - **`openProductId`:** o deep-link é usado por quem navega com `handleNavigate('masterdata', id)`, e
    `masterdata` agora é alias de `cadastros`. Em `handleNavigate`, quando `viewReal(view) === 'cadastros'` **e**
    há `searchTerm`, navegar para `'produtos'` em vez do fichário, para o deep-link de produto continuar abrindo o
    editor.
  - **`Finance`** ganha `onGerenciarBancos={() => handleNavigate('bancos')}`.

- [ ] **Step 13: `Finance.tsx` — "Gerenciar bancos".** O "⋯" de Bancos passa a ter um item só:
  `{ rotulo: 'Gerenciar bancos', onClick: () => onGerenciarBancos?.() }`. Sai de Finance o que foi para Cadastros:
  - `showBankModal`, `selectedBank` e o `<BankAccountModal>`;
  - `handleSaveBank`;
  - `handleInactivateBank`, `handleReactivateBank` e os ramos `inactivate_bank`/`reactivate_bank` do
    `executeConfirm` e dos tipos;
  - `sincronizarAberto`, `handleRecalculateBalances`, `confirmarSincronizacao` e a janela;
  - `showInactiveBanks` (a lista de Contas mostra só os ativos) e o link "reativar" da lista.

  **Ficam:** a lista de bancos com saldo, o "a conferir" e a `JanelaConferirBanco`. Se algum import ficar sem uso,
  apague.

- [ ] **Step 14: `fila.ts` — saldos abrem Bancos.**
  - Acrescentar `| { view: 'bancos' }` ao `DestinoDaFila`.
  - As linhas "Conferir saldo" e "sem saldo de partida" passam a usar `destino: { view: 'bancos' }`.
  - A linha "Atenção: … fecha em" continua `{ view: 'finance' }`.
  - **Ver passar** o teste ajustado no Step 1.

- [ ] **Step 15: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/navegacao.ts src/utils/navegacao.test.ts src/components/layout/icones.ts src/utils/fichario.ts src/utils/fichario.test.ts src/hooks/cadastros/useFichario.ts src/components/cadastros src/App.tsx src/pages/MasterData.tsx src/pages/masterdata/MensagensTab.tsx src/components/masterdata/ClientesDormentes.tsx src/pages/Finance.tsx src/utils/inicio/fila.ts src/utils/inicio/fila.test.ts
git commit -F - <<'EOF'
feat(cadastros): fichário com os 8 cartões; bancos saem de Contas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: O dinheiro do cliente com a regra da entrega

"A receber" e "Vencido" na página do cliente e na do grupo passam a usar a mesma classificação de Dinheiro ›
Clientes que devem. A parcela de pedido não entregue vira "em produção".

**Files:**
- Modify: `src/utils/dossieDoCliente.ts`, `src/utils/dossieDoCliente.test.ts` (acrescentar)
- Modify: `src/pages/masterdata/PaginaDoCliente.tsx`, `src/pages/masterdata/PaginaDoGrupo.tsx` (os números)

**Interfaces:**
- **Consumes:** `situacaoDaConta` (`src/utils/financas/situacao.ts`).
- **Produces:**
  - `ContaDoCliente.awaiting_delivery?: boolean | null`;
  - `DossieDoCliente.emProducao: number`;
  - `aReceber` e `vencido` com a regra nova.

- [ ] **Step 1: Testes que falham** — acrescentar ao fim de `src/utils/dossieDoCliente.test.ts`:

```ts
import { montarDossie as dossieDe } from './dossieDoCliente.ts';
import { clientesQueDevem } from './financas/clientes.ts';

const HOJE_ENTREGA = '2026-10-08';
const conta = (id: string, p: Record<string, unknown> = {}) => ({
    id, client_id: 'c1', type: 'receivable', description: id, due_date: '2026-09-01',
    original_amount: 100, paid_amount: 0, remaining_amount: 100, derived_status: 'pending',
    cancelled_at: null, awaiting_delivery: false, ...p,
});

test('parcela de pedido não entregue não é vencida nem a receber: fica em produção', () => {
    const d = dossieDe('c1', [], [], [conta('a', { awaiting_delivery: true })], HOJE_ENTREGA);
    assert.equal(d.vencido, 0);
    assert.equal(d.aReceber, 0);
    assert.equal(d.emProducao, 100);
});

test('vencido, a receber e em produção batem com Clientes que devem', () => {
    const contas = [
        conta('vencida'),
        conta('futura', { due_date: '2026-11-01', original_amount: 50, remaining_amount: 50 }),
        conta('producao', { awaiting_delivery: true, original_amount: 70, remaining_amount: 70 }),
        conta('paga', { remaining_amount: 0, paid_amount: 100, derived_status: 'paid' }),
        conta('cancelada', { derived_status: 'cancelled', cancelled_at: '2026-09-02' }),
    ];
    const d = dossieDe('c1', [], [], contas, HOJE_ENTREGA);
    const [l] = clientesQueDevem(contas as any, HOJE_ENTREGA);
    assert.equal(d.vencido, l.vencido);
    assert.equal(d.aReceber, l.vencido + l.aVencer);
    assert.equal(d.emProducao, l.emProducao);
});
```

  `assert` e `test` já estão importados no arquivo; não duplique.

- [ ] **Step 2: Ver falhar** (`emProducao` indefinido; os valores antigos contam a parcela não entregue).

- [ ] **Step 3: Implementar em `src/utils/dossieDoCliente.ts`.**
  - **Import:** `import { situacaoDaConta } from './financas/situacao.ts';`.
  - **`ContaDoCliente`** ganha `awaiting_delivery?: boolean | null;`.
  - **`DossieDoCliente`** ganha, depois de `vencido`:
    `/** Parcelas de pedido ainda não entregue: não são cobrança (regra da Finanças). */ emProducao: number;`.
  - **Em `montarDossie`**, depois de `contasVivas`:

```ts
    // A mesma classificação de Dinheiro › Clientes que devem: parcela de pedido não
    // entregue não vence nem é cobrança. Sem isto a página do cliente acusava atraso
    // que a Finanças já não acusa — os dois números tinham de bater.
    const situacao = (c: ContaDoCliente) => situacaoDaConta({
        id: c.id,
        type: c.type === 'payable' ? 'payable' : 'receivable',
        description: c.description || '',
        due_date: c.due_date || '',
        original_amount: Number(c.original_amount) || 0,
        remaining_amount: Number(c.remaining_amount) || 0,
        derived_status: c.cancelled_at ? 'cancelled' : (c.derived_status || ''),
        awaiting_delivery: c.awaiting_delivery,
    }, hoje);
    const naSituacao = (...ss: string[]) => contasVivas.filter(c => ss.includes(situacao(c)));
```

  - **No `return`:**

```ts
        aReceber: soma(naSituacao('vencida', 'a_vencer').map(c => c.remaining_amount)),
        vencido: soma(naSituacao('vencida').map(c => c.remaining_amount)),
        emProducao: soma(naSituacao('aguardando_entrega').map(c => c.remaining_amount)),
```

  - **`totalRecebido` não muda.**
  - Se algum teste antigo de `dossieDoCliente.test.ts` quebrar, conferir se o dado dele tinha parcela de pedido não
    entregue. Se tinha, ajustar o esperado; se não tinha, o código está errado.

- [ ] **Step 4: Ver passar.**

- [ ] **Step 5: As páginas mostram "em produção".**
  - **Visão geral e Financeiro de `PaginaDoCliente` e de `PaginaDoGrupo`:** quando `dossie.emProducao > 0`, o
    cartão "A receber" (e "Em aberto" no Financeiro) ganha o rodapé
    `em produção: ${formatCurrency(dossie.emProducao)}`.
  - **"Lembrete de vencimento"** (`contasEmAberto` em `PaginaDoCliente`): passa a ignorar as contas com
    `awaiting_delivery`. Lembrar de vencimento de pedido não entregue é a cobrança que a regra proíbe.

- [ ] **Step 6: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/dossieDoCliente.ts src/utils/dossieDoCliente.test.ts src/pages/masterdata/PaginaDoCliente.tsx src/pages/masterdata/PaginaDoGrupo.tsx
git commit -F - <<'EOF'
fix(cadastros): dinheiro do cliente segue a regra da entrega, igual a Clientes que devem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Página do cliente em 5 abas, grupo e janela de edição enxuta

Reorganização de tela. Nenhum dado novo e nenhuma conta nova.

**Files:**
- Modify: `src/pages/masterdata/PaginaDoCliente.tsx`
- Modify: `src/pages/masterdata/PaginaDoGrupo.tsx`
- Modify: `src/components/masterdata/ClientForm.tsx`

**Interfaces:** nenhuma nova. As props das páginas não mudam.

**Granha Ligas (spec 3.1, P1):** matriz + 2 filiais no mesmo grupo não pede código novo. O caso já está coberto
pelo teste "Grupo Sol" de `src/utils/apelidosDeCliente.test.ts` (`membrosClassificados`, matriz e filiais pela
raiz do CNPJ).

- [ ] **Step 1: `PaginaDoCliente`: 9 abas → 5.**
  - **`Aba`** passa a ser `'visao' | 'historico' | 'dinheiro' | 'fotos' | 'contrato'`. **`ABAS`** fica assim:
    - `visao`: 'Visão geral', ícone `LayoutGrid`;
    - `historico`: 'Histórico', ícone `FileText`;
    - `dinheiro`: 'Dinheiro', ícone `Wallet`;
    - `fotos`: 'Fotos', ícone `Camera`;
    - `contrato`: 'Contrato', ícone `Repeat`.
  - **Visão geral:** tudo o que tem hoje (os 7 cartões, CNPJ/IE/endereço, ritmo de compra, `ContatosDoCliente`).
    No lugar do bloco somente-leitura de anotações, entra o **editor de anotações** que hoje mora na aba
    `notas`: o texto de ajuda, o `textarea` e "Salvar anotações" com o "Salvo".
  - **Histórico:** os quatro conteúdos de hoje, um embaixo do outro (`space-y-6`), cada um com um título `ROTULO`,
    o mesmo texto da aba antiga. A ordem é Peças, Orçamentos, Pedidos e Entregas. As tabelas, os botões de abrir
    e de ver sem sair e os textos de vazio não mudam.
  - **Dinheiro:** o conteúdo da aba `financeiro` de hoje, com os cartões, o "Lembrete de vencimento" e a tabela.
  - **Fotos:** o conteúdo da aba `fotos` de hoje.
  - **Contrato:** `PainelDoContrato`, intocado.
  - **Abas, botões e cartões** usam `pilula()` para as abas e as classes do `estilo.ts` para botões e cartões.
    Cartão é `CARTAO`; o `Cartao` local pode virar o `Indicador` de `src/components/finance/ui/Indicador.tsx`, se
    os campos casarem (título, valor, tom, rodapé). Se não casarem, só troque as classes.

- [ ] **Step 2: `PaginaDoGrupo`.**
  - **Abas:** `visao` (Visão geral), `empresas` (Empresas), `historico` (Histórico: Peças, Orçamentos e Pedidos,
    nessa ordem e com a coluna Empresa), `dinheiro` (Dinheiro: o Financeiro de hoje) e `contrato` (Contrato).
  - **Conteúdo:** o de hoje, só reagrupado. As abas usam `pilula()`.

- [ ] **Step 3: `ClientForm` enxuto.**
  - Sai o campo **Limite de Crédito**. A linha "Condição de Pagamento" fica sozinha, em largura cheia. O
    `credit_limit` que o cliente já tem continua no objeto e é regravado como veio.
  - Sai o bloco **"Fotos e informações"** (Observações e `FotosDoCliente`). Os dois moram na página do cliente.
  - No lugar, uma linha `ROTULO_PEQUENO`: "Fotos e anotações ficam na página do cliente (botão de abrir na lista)."
  - **Ficam:** Empresa, Categoria, CNPJ, Telefone, IE, Email, Contato, Condição de pagamento, Endereço, Score e
    `MesclagemEGrupo`.

- [ ] **Step 4: Tipos limpos e suíte limpa, depois commit.**

```bash
git add src/pages/masterdata/PaginaDoCliente.tsx src/pages/masterdata/PaginaDoGrupo.tsx src/components/masterdata/ClientForm.tsx
git commit -F - <<'EOF'
feat(cadastros): página do cliente em 5 abas; janela de edição sem fotos, notas e limite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Fila do Início — clientes sumidos e ficha técnica

Duas linhas novas e o bloco Cadastros, com contador no menu.

**Files:**
- Modify: `src/utils/inicio/fila.ts`, `src/utils/inicio/fila.test.ts`
- Modify: `src/hooks/inicio/useFilaDoInicio.ts`
- Modify: `src/App.tsx` (`abrirDestino`)

**Interfaces:**
- **Consumes:**
  - `completudeDosDados` e `produtosSemFichaQueVenderam` (Task 2);
  - `clientesDormentes`;
  - os estados `aberturaClientes`/`aberturaProdutos` do `App` (Task 3).
- **Produces:**
  - `ObjetivoDaFila` ganha `'cadastros'`;
  - `EntradaDaFila` ganha `clientesSumidos: number` e `produtosSemFicha: number`;
  - `DestinoDaFila` ganha `{ view: 'clientes'; dormentes: true }` e `{ view: 'produtos'; completude: true }`;
  - `contadoresDoMenu` ganha a chave `cadastros`.

- [ ] **Step 1: Testes que falham** — em `src/utils/inicio/fila.test.ts`:
  - no objeto `vazia`, acrescentar `clientesSumidos: 0, produtosSemFicha: 0,`;
  - no primeiro teste, o objeto esperado de `contadoresDoMenu` ganha `cadastros: { n: 0, urgente: false },`;
  - acrescentar:

```ts
test('Retomar clientes sumidos em Vender, abre Clientes com os dormentes', () => {
    const [b] = montarFila({ ...vazia, clientesSumidos: 2 });
    assert.equal(b.objetivo, 'vender');
    assert.deepEqual(b.linhas.map(l => [l.texto, l.urgente]), [['Retomar 2 clientes sumidos', false]]);
    assert.deepEqual(b.linhas[0].destino, { view: 'clientes', dormentes: true });
    assert.equal(montarFila({ ...vazia, clientesSumidos: 1 })[0].linhas[0].texto, 'Retomar 1 cliente sumido');
});

test('ficha técnica em Cadastros, último bloco, e conta no menu', () => {
    const blocos = montarFila({ ...vazia, produtosSemFicha: 3, consumoNaoApurado: 1 });
    assert.deepEqual(blocos.map(b => b.objetivo), ['producao', 'cadastros']);
    assert.equal(blocos[1].rotulo, 'Cadastros');
    const l = blocos[1].linhas[0];
    assert.equal(l.texto, 'Cadastrar ficha técnica: 3 produtos');
    assert.equal(l.urgente, false);
    assert.deepEqual(l.destino, { view: 'produtos', completude: true });
    assert.deepEqual(contadoresDoMenu(blocos).cadastros, { n: 1, urgente: false });
    assert.equal(montarFila({ ...vazia, produtosSemFicha: 1 })[0].linhas[0].texto, 'Cadastrar ficha técnica: 1 produto');
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar em `fila.ts`.**
  - **Tipos:**
    - `ObjetivoDaFila`: acrescentar `| 'cadastros'`;
    - `DestinoDaFila`: acrescentar `| { view: 'clientes'; dormentes: true } | { view: 'produtos'; completude: true }`;
    - `EntradaDaFila`: acrescentar
      `/** clientesDormentes(...).length */ clientesSumidos: number;` e
      `/** produtosSemFichaQueVenderam(completudeDosDados(...)) */ produtosSemFicha: number;`.
  - **`ORDEM`:** acrescentar `{ objetivo: 'cadastros', rotulo: 'Cadastros' }` no fim.
  - **Em `montarFila`**, depois da linha "Virar pedido":

```ts
    add({ objetivo: 'vender', acao: 'Retomar', quantidade: e.clientesSumidos, urgente: false,
        texto: `Retomar ${s(e.clientesSumidos, 'cliente sumido', 'clientes sumidos')}`,
        destino: { view: 'clientes', dormentes: true } });
```

  - **Antes do `return`:**

```ts
    add({ objetivo: 'cadastros', acao: 'Cadastrar', quantidade: e.produtosSemFicha, urgente: false,
        texto: `Cadastrar ficha técnica: ${s(e.produtosSemFicha, 'produto', 'produtos')}`,
        destino: { view: 'produtos', completude: true } });
```

  - **Em `contadoresDoMenu`:** acrescentar `cadastros: { n: 0, urgente: false }` ao objeto inicial.

- [ ] **Step 4: Ver passar.**

- [ ] **Step 5: `useFilaDoInicio` carrega e calcula.**
  - **`carregarTudo`:** acrescentar no fim do `Promise.all` `storageService.getClients()`,
    `storageService.getProducts()` e `storageService.getFichaPorProduto()`. O tipo `Dados` acompanha sozinho.
  - **No `useMemo`:** desestruturar os três novos e passar a `montarFila`:

```ts
            clientesSumidos: clientesDormentes(clientes,
                pedidos.map(o => ({ client_id: o.client_id, data: o.created_at, valor: Number(o.total_amount) || 0 })),
                hoje).length,
            produtosSemFicha: produtosSemFichaQueVenderam(completudeDosDados({
                pedidos, orcamentos, produtos, insumos, fichaPorProduto: ficha,
            } as any)),
```

  - **A regra de falha não muda:** qualquer leitura falhando, nenhuma fila parcial.

- [ ] **Step 6: `App.abrirDestino`.** Antes do `handleNavigate(d.view)`, acrescentar:

```ts
    else if (d.view === 'clientes') setAberturaClientes({ dormentes: true });
    else if (d.view === 'produtos') setAberturaProdutos({ completude: true });
```

- [ ] **Step 7: O Início desenha o bloco Cadastros.** O `Inicio.tsx` desenha os blocos pelo `rotulo` que vem de
  `montarFila`. Confira se há algum mapa `Record<ObjetivoDaFila, …>` (ícone, cor) no Início ou no menu que precise
  da chave `cadastros`; `tsc` acusa se houver. O menu já lê `contadores[s.id]`, e `s.id === 'cadastros'` passa a
  ter valor.

- [ ] **Step 8: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/inicio/fila.ts src/utils/inicio/fila.test.ts src/hooks/inicio/useFilaDoInicio.ts src/App.tsx src/pages/Inicio.tsx
git commit -F - <<'EOF'
feat(inicio): retomar clientes sumidos e cadastrar fichas técnicas na fila

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

  Se `src/pages/Inicio.tsx` não mudou, tire-o do `git add`.

---

### Task 7: Banco que sai no orçamento; comissão sai da tela

**Files:**
- Create: `src/utils/perfilDaEmpresa.ts`, `src/utils/perfilDaEmpresa.test.ts`
- Modify: `src/repositories/crmRepository.ts` (`getCompanyProfile`, `saveCompanyProfile`)
- Modify: `src/services/pdfService.ts` (os dados bancários do orçamento)
- Modify: `src/pages/masterdata/CompanyTab.tsx`

**Interfaces:**
- **Consumes:** `CompanyProfile.banco_do_orcamento_id`/`banco_do_orcamento`, e `BankAccount.titular`/`chave_pix` (Task 1).
- **Produces:**
  - `interface DadosBancarios { bank_name; agency; account_number; holder; pix_key }`, todos `string | null`;
  - `dadosBancariosDoOrcamento(perfil): DadosBancarios`;
  - `colunasOpcionaisDoPerfil(perfil): Record<string, unknown>`.

- [ ] **Step 1: Testes que falham** — `src/utils/perfilDaEmpresa.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dadosBancariosDoOrcamento, colunasOpcionaisDoPerfil } from './perfilDaEmpresa.ts';

const antigos = { bank_name: 'Itaú', agency: '0001', account_number: '123-4', bank_holder: 'Botezini', pix_key: 'cnpj' };

test('com banco escolhido, o orçamento usa os dados dele — inteiros, sem misturar com os antigos', () => {
    const d = dadosBancariosDoOrcamento({
        ...antigos,
        banco_do_orcamento: { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', titular: 'Sueli', chave_pix: null },
    });
    assert.deepEqual(d, { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', holder: 'Sueli', pix_key: null });
});

test('sem banco escolhido (ou inativado), volta aos dados antigos da empresa', () => {
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos, banco_do_orcamento: null }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
});

test('aliases antigos de agência e conta ainda valem', () => {
    const d = dadosBancariosDoOrcamento({ bank_name: 'Itaú', bank_agency: '0002', bank_account: '55' });
    assert.equal(d.agency, '0002');
    assert.equal(d.account_number, '55');
});

test('a coluna nova só vai ao banco quando ela existe (veio na leitura)', () => {
    assert.deepEqual(colunasOpcionaisDoPerfil({ name: 'X' }), {});
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: null }), { banco_do_orcamento_id: null });
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: 'b1' }), { banco_do_orcamento_id: 'b1' });
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar** — `src/utils/perfilDaEmpresa.ts`:

```ts
/**
 * Os dados bancários que saem no orçamento, e as colunas opcionais do perfil da empresa.
 * Sem imports do app, para ser testado com node --test.
 */

export interface DadosBancarios {
    bank_name: string | null;
    agency: string | null;
    account_number: string | null;
    holder: string | null;
    pix_key: string | null;
}

interface BancoDoOrcamento {
    bank_name?: string | null; agency?: string | null; account_number?: string | null;
    titular?: string | null; chave_pix?: string | null;
}

export interface PerfilComBanco {
    bank_name?: string | null; agency?: string | null; bank_agency?: string | null;
    account_number?: string | null; bank_account?: string | null;
    bank_holder?: string | null; pix_key?: string | null;
    /** Preenchido pelo repositório só quando o banco escolhido existe e está ativo. */
    banco_do_orcamento?: BancoDoOrcamento | null;
    banco_do_orcamento_id?: string | null;
}

const ou = (v: string | null | undefined) => v || null;

/**
 * Banco escolhido → os dados DELE, inteiros. Sem banco (não escolhido, inativado, apagado
 * ou SQL não rodado) → os campos antigos da empresa. Nunca mistura os dois: um PIX de uma
 * conta impresso ao lado da agência de outra manda o cliente pagar no lugar errado.
 */
export function dadosBancariosDoOrcamento(p: PerfilComBanco): DadosBancarios {
    const b = p.banco_do_orcamento;
    if (b) {
        return { bank_name: ou(b.bank_name), agency: ou(b.agency), account_number: ou(b.account_number),
            holder: ou(b.titular), pix_key: ou(b.chave_pix) };
    }
    return {
        bank_name: ou(p.bank_name),
        agency: ou(p.agency ?? p.bank_agency),
        account_number: ou(p.account_number ?? p.bank_account),
        holder: ou(p.bank_holder),
        pix_key: ou(p.pix_key),
    };
}

/**
 * `banco_do_orcamento_id` só existe depois de supabase/cadastros_v3_1.sql. A leitura
 * (`select *`) traz a chave quando a coluna existe — é por ela que se sabe. Mandar a
 * coluna antes do SQL faria o upsert do perfil inteiro ser recusado.
 */
export function colunasOpcionaisDoPerfil(p: PerfilComBanco): Record<string, unknown> {
    return 'banco_do_orcamento_id' in p ? { banco_do_orcamento_id: p.banco_do_orcamento_id ?? null } : {};
}
```

- [ ] **Step 4: Ver passar.**

- [ ] **Step 5: Repositório.**
  - **`crmRepository.getCompanyProfile`:** quando `profile.banco_do_orcamento_id` vier preenchido, buscar
    `supabase.from('bank_accounts').select('bank_name, agency, account_number, titular, chave_pix, is_active').eq('id', profile.banco_do_orcamento_id).maybeSingle()`.
    - Se voltar uma linha **ativa**, pôr em `banco_do_orcamento`.
    - Se não voltar, ou se der erro, `banco_do_orcamento: null`.
  - **`saveCompanyProfile`:** acrescentar `...colunasOpcionaisDoPerfil(profile),` ao `payload`, e nunca mandar
    `banco_do_orcamento`, que é derivado.

- [ ] **Step 6: PDF.** Em `src/services/pdfService.ts`, nos dois trechos que hoje leem `companyProfile.bank_name`,
  `agency`, `account_number`, `bank_holder` e `pix_key` (por volta das linhas 540 e 700–725), trocar a leitura
  por `const banco = dadosBancariosDoOrcamento(companyProfile || {});` e usar `banco.bank_name`,
  `banco.agency`, `banco.account_number`, `banco.holder` e `banco.pix_key`. O desenho do PDF não muda.

- [ ] **Step 7: `CompanyTab`.**
  - **Sai** o campo "Comissão Base" (o rótulo, o input e a ajuda). O valor continua no perfil e é regravado como veio.
  - **No bloco "Dados Bancários (Para Orçamentos)":**
    - **Quando `'banco_do_orcamento_id' in profile`:** no topo do bloco, um seletor "Banco que sai no orçamento"
      (`SearchableSelect`, como nos formulários vizinhos).
      - As opções são `— os dados abaixo —` (valor `''`) mais os bancos ativos, de `storageService.getBankAccounts(true)`,
        carregados num `useEffect`.
      - Escolher grava `banco_do_orcamento_id` no `profile` via `onChange`.
      - **Com banco escolhido:** os campos de texto abaixo (banco, titular, agência, conta, PIX) ficam ocultos, e no
        lugar aparece um resumo do banco escolhido, com a linha "Titular e PIX se editam em Cadastros › Bancos".
      - **Sem banco escolhido:** os campos aparecem como hoje.
    - **Quando a chave não existe** (SQL não rodado): os campos como hoje, com a linha `ROTULO_PEQUENO`
      "Para escolher um banco cadastrado, rode `supabase/cadastros_v3_1.sql`."

- [ ] **Step 8: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/perfilDaEmpresa.ts src/utils/perfilDaEmpresa.test.ts src/repositories/crmRepository.ts src/services/pdfService.ts src/pages/masterdata/CompanyTab.tsx
git commit -F - <<'EOF'
feat(cadastros): o orçamento imprime o banco escolhido; comissão base sai da tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Meta de faturamento sugerida

**Files:**
- Modify: `src/utils/saudeDoCaixa.ts` (extrair `baseDoEquilibrio`; + `src/utils/saudeDoCaixa.test.ts`, que já existe:
  acrescentar)
- Modify: `src/hooks/useSaudeDoCaixa.ts` (usa `baseDoEquilibrio`)
- Create: `src/utils/metaDeFaturamento.ts`, `src/utils/metaDeFaturamento.test.ts`
- Create: `src/hooks/cadastros/useMetaSugerida.ts`
- Modify: `src/pages/masterdata/CompanyTab.tsx`
- Modify: `src/hooks/cadastros/useFichario.ts` (preenche `metaSugerida`)

**Interfaces:**
- **Produces** (`saudeDoCaixa.ts`):
  - `interface VendaParaEquilibrio { data: string; precoConhecido: boolean; valorTotal: number; produto: string; quantidade: number }`;
  - `interface DadosDoEquilibrio`;
  - `baseDoEquilibrio(d: DadosDoEquilibrio): BaseDoEquilibrio`.
- **Produces** (`metaDeFaturamento.ts`):
  - `interface MetaSugerida`;
  - `COBERTURA_MINIMA = 30`;
  - `ultimosMesesFechados(hoje: string, n?: number): { de: string; ate: string }[]`;
  - `metaSugerida(bases: BaseDoEquilibrio[], margemAlvoPct: number): MetaSugerida`.
- **Produces** (gancho): `useMetaSugerida(margemAlvoPct: number): { meta: MetaSugerida | null; carregando: boolean; erro: string }`.

- [ ] **Step 1: Testes que falham** — `src/utils/metaDeFaturamento.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaSugerida, ultimosMesesFechados } from './metaDeFaturamento.ts';
import type { BaseDoEquilibrio } from './saudeDoCaixa.ts';

const mes = (receita: number, semCusto: number, custoVar: number, fixo: number): BaseDoEquilibrio => ({
    receita, receitaSemCustoConhecido: semCusto, custoVariavelDasVendas: custoVar,
    despesasFixas: [{ valor: fixo, natureza: 'fixo' }, { valor: 999, natureza: 'variavel' }],
});

test('os 3 últimos meses fechados', () => {
    assert.deepEqual(ultimosMesesFechados('2026-10-08'), [
        { de: '2026-09-01', ate: '2026-09-30' },
        { de: '2026-08-01', ate: '2026-08-31' },
        { de: '2026-07-01', ate: '2026-07-31' },
    ]);
    assert.deepEqual(ultimosMesesFechados('2026-01-15', 1), [{ de: '2025-12-01', ate: '2025-12-31' }]);
    assert.deepEqual(ultimosMesesFechados('2024-03-02', 1), [{ de: '2024-02-01', ate: '2024-02-29' }]);
});

test('caso normal: fixo médio ÷ (MC − alvo), para cima em R$ 1.000', () => {
    const m = metaSugerida([mes(100000, 0, 60000, 20000), mes(100000, 0, 60000, 20000), mes(100000, 0, 60000, 20000)], 10);
    assert.equal(m.custoFixoMedio, 20000);
    assert.equal(m.margemDeContribuicaoPct, 40);
    assert.equal(m.valor, 67000);     // 20.000 ÷ 0,30 = 66.666,67 → 67.000
    assert.equal(m.motivo, null);
    assert.equal(m.coberturaPct, 100);
    assert.equal(m.fraca, false);
});

test('a margem é medida só nas vendas com custo conhecido; cobertura baixa = estimativa fraca', () => {
    const m = metaSugerida([mes(100000, 76000, 12000, 6000)], 10);
    assert.equal(m.coberturaPct, 24);
    assert.equal(m.fraca, true);
    assert.equal(m.margemDeContribuicaoPct, 50);   // (24.000 − 12.000) ÷ 24.000
    assert.equal(m.valor, 15000);                   // 6.000 ÷ 0,40
});

test('sem venda com custo conhecido: sem sugestão, com o motivo', () => {
    const m = metaSugerida([mes(50000, 50000, 0, 6000)], 10);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /fichas técnicas/);
});

test('margem das peças não chega à alvo: sem sugestão, com os dois números', () => {
    const m = metaSugerida([mes(100000, 0, 80000, 6000)], 25);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /20%.*25%/);
});

test('sem despesa fixa marcada: sem sugestão, aponta Categorias', () => {
    const m = metaSugerida([mes(100000, 0, 60000, 0)], 10);
    assert.equal(m.valor, null);
    assert.match(m.motivo!, /Categorias/);
});
```

  Acrescentar ao fim de `src/utils/saudeDoCaixa.test.ts`:

```ts
import { baseDoEquilibrio } from './saudeDoCaixa.ts';

test('base do equilíbrio: vendas do período casadas com o custo; contas a pagar do período com a natureza', () => {
    const b = baseDoEquilibrio({
        vendas: [
            { data: '2026-09-10', precoConhecido: true, valorTotal: 1000, produto: 'Polo', quantidade: 10 },
            { data: '2026-09-11', precoConhecido: true, valorTotal: 500, produto: 'Sem custo', quantidade: 5 },
            { data: '2026-09-12', precoConhecido: false, valorTotal: 0, produto: 'Polo', quantidade: 3 },
            { data: '2026-08-30', precoConhecido: true, valorTotal: 999, produto: 'Polo', quantidade: 9 },
        ],
        custos: new Map([['Polo', 40]]),
        obrigacoes: [
            { type: 'payable', due_date: '2026-09-05', original_amount: 3000, global_category_id: 'aluguel' },
            { type: 'payable', due_date: '2026-09-06', original_amount: 200, global_category_id: 'frete' },
            { type: 'payable', due_date: '2026-09-07', original_amount: 100, global_category_id: 'frete', natureza_override: 'fixo' },
            { type: 'payable', due_date: '2026-09-08', original_amount: 700, cancelled_at: '2026-09-09' },
            { type: 'receivable', due_date: '2026-09-09', original_amount: 5000 },
        ],
        naturezaPorCategoriaId: new Map([['aluguel', 'fixo']]),
        nomePorCategoriaId: new Map([['aluguel', 'Aluguel'], ['frete', 'Frete']]),
        de: '2026-09-01', ate: '2026-09-30',
    });
    assert.equal(b.receita, 1500);
    assert.equal(b.custoVariavelDasVendas, 400);
    assert.equal(b.receitaSemCustoConhecido, 500);
    assert.deepEqual(b.despesasFixas.map(s => [s.valor, s.natureza, s.categoria]),
        [[3000, 'fixo', 'Aluguel'], [200, 'variavel', 'Frete'], [100, 'fixo', 'Frete']]);
    assert.equal(b.variaveisLancadas, 200);
});
```

  Se `test`/`assert` já estiverem importados no arquivo, não duplique.

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Extrair `baseDoEquilibrio`** para `src/utils/saudeDoCaixa.ts`. É o corpo do `useMemo` `equilibrio`
  de `src/hooks/useSaudeDoCaixa.ts` (linhas ~152–198), **sem** a chamada final `calcularPontoDeEquilibrio`:

```ts
/** Uma linha vendida, como montarItensVendidos a entrega — só o que o equilíbrio usa. */
export interface VendaParaEquilibrio {
    data: string;
    precoConhecido: boolean;
    valorTotal: number;
    produto: string;
    quantidade: number;
}

export interface ContaParaEquilibrio {
    type?: string | null;
    due_date: string;
    original_amount?: number | null;
    cancelled_at?: string | null;
    derived_status?: string | null;
    global_category_id?: string | null;
    category?: string | null;
    natureza_override?: Natureza | null;
}

export interface DadosDoEquilibrio {
    vendas: VendaParaEquilibrio[];
    /** Custo unitário por nome de produto (o que casa com a linha vendida). */
    custos: Map<string, number>;
    obrigacoes: ContaParaEquilibrio[];
    naturezaPorCategoriaId: Map<string, Natureza | undefined>;
    nomePorCategoriaId: Map<string, string>;
    de: string;
    ate: string;
}

/** A base do ponto de equilíbrio de UM período — a mesma conta da Saúde do caixa e da meta sugerida. */
export function baseDoEquilibrio(d: DadosDoEquilibrio): BaseDoEquilibrio {
    let receita = 0, custoVariavelDasVendas = 0, receitaSemCustoConhecido = 0;
    for (const l of d.vendas) {
        if (!l.data || l.data < d.de || l.data > d.ate) continue;
        if (!l.precoConhecido) continue;
        receita += l.valorTotal;
        const unit = d.custos.get(l.produto);
        if (unit && unit > 0) custoVariavelDasVendas += unit * l.quantidade;
        else receitaSemCustoConhecido += l.valorTotal;
    }
    const doPeriodo = d.obrigacoes.filter(o =>
        !o.cancelled_at && o.due_date >= d.de && o.due_date <= d.ate && o.derived_status !== 'cancelled'
        && o.type === 'payable');
    // Sem marca, o custo é variável (ver o comentário que existia no gancho).
    const naturezaDe = (o: ContaParaEquilibrio) => (o.natureza_override
        || (o.global_category_id ? d.naturezaPorCategoriaId.get(o.global_category_id) : undefined)
        || 'variavel') as Natureza;
    const despesasFixas: SaidaClassificada[] = doPeriodo.map(o => ({
        valor: Number(o.original_amount) || 0,
        natureza: naturezaDe(o),
        categoria: (o.global_category_id && d.nomePorCategoriaId.get(o.global_category_id)) || o.category || 'Sem categoria',
    }));
    const variaveisLancadas = doPeriodo
        .filter(o => naturezaDe(o) === 'variavel')
        .reduce((sum, o) => sum + (Number(o.original_amount) || 0), 0);
    return { receita, custoVariavelDasVendas, receitaSemCustoConhecido, despesasFixas, variaveisLancadas };
}
```

  **Leve os comentários** do gancho para cá, para não perder o porquê: "Sem marca, o custo é variável…", "A conta
  pode fugir da categoria…" e "Só para confronto — não soma…".

  No gancho, o `useMemo` vira:

```ts
    const equilibrio = useMemo(() => calcularPontoDeEquilibrio(baseDoEquilibrio({
        vendas, custos, obrigacoes, naturezaPorCategoriaId, nomePorCategoriaId,
        de: inicioDoMes(`${mes}-01`), ate: fimDoMes(`${mes}-01`),
    })), [vendas, custos, obrigacoes, mes, naturezaPorCategoriaId, nomePorCategoriaId]);
```

- [ ] **Step 4: Implementar** `src/utils/metaDeFaturamento.ts`:

```ts
/**
 * Meta de faturamento sugerida: quanto vender por mês para pagar o fixo e ainda
 * sobrar a margem alvo. Spec do S2, seção 5.2.
 */
import type { BaseDoEquilibrio } from './saudeDoCaixa.ts';

export interface MetaSugerida {
    /** null = sem sugestão; o porquê está em `motivo`. */
    valor: number | null;
    motivo: string | null;
    custoFixoMedio: number;
    /** Índice de margem de contribuição, em %, medido só nas vendas com custo conhecido. */
    margemDeContribuicaoPct: number | null;
    margemAlvoPct: number;
    /** Quanto do faturamento tem custo conhecido, em %. */
    coberturaPct: number;
    /** Cobertura abaixo de COBERTURA_MINIMA: a margem foi medida numa amostra pequena. */
    fraca: boolean;
}

/** Abaixo disto o custo é chute na maioria das vendas (mesmo corte da Completude). */
export const COBERTURA_MINIMA = 30;

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Os `n` meses fechados antes do mês de `hoje`, do mais recente para o mais antigo. */
export function ultimosMesesFechados(hoje: string, n = 3): { de: string; ate: string }[] {
    let ano = Number(hoje.slice(0, 4));
    let mes = Number(hoje.slice(5, 7));
    const saida: { de: string; ate: string }[] = [];
    for (let i = 0; i < n; i++) {
        mes -= 1;
        if (mes === 0) { mes = 12; ano -= 1; }
        saida.push({ de: `${ano}-${doisDigitos(mes)}-01`, ate: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia(ano, mes))}` });
    }
    return saida;
}

const pct = (v: number) => String(v).replace('.', ',');

export function metaSugerida(bases: BaseDoEquilibrio[], margemAlvoPct: number): MetaSugerida {
    const meses = bases.length || 1;
    let receita = 0, semCusto = 0, custoVar = 0, fixo = 0;
    for (const b of bases) {
        receita += b.receita;
        semCusto += b.receitaSemCustoConhecido;
        custoVar += b.custoVariavelDasVendas;
        fixo += b.despesasFixas.filter(s => s.natureza === 'fixo').reduce((t, s) => t + s.valor, 0);
    }
    const comCusto = receita - semCusto;
    const custoFixoMedio = Math.round((fixo / meses) * 100) / 100;
    const coberturaPct = receita > 0 ? Math.round((comCusto / receita) * 100) : 0;
    const base = { custoFixoMedio, margemAlvoPct, coberturaPct, fraca: coberturaPct < COBERTURA_MINIMA };

    if (comCusto <= 0) {
        return { ...base, valor: null, margemDeContribuicaoPct: null,
            motivo: 'cadastre fichas técnicas para a sugestão aparecer' };
    }
    const mc = ((comCusto - custoVar) / comCusto) * 100;
    const mcPct = Math.round(mc * 10) / 10;
    if (custoFixoMedio <= 0) {
        return { ...base, valor: null, margemDeContribuicaoPct: mcPct,
            motivo: 'nenhuma despesa marcada como fixa nos últimos 3 meses — marque as fixas em Cadastros › Categorias' };
    }
    if (mc <= margemAlvoPct) {
        return { ...base, valor: null, margemDeContribuicaoPct: mcPct,
            motivo: `a margem das peças (${pct(mcPct)}%) não chega à margem alvo (${pct(margemAlvoPct)}%) — nenhum faturamento resolve; revise preço ou margem alvo` };
    }
    const valor = Math.ceil(custoFixoMedio / ((mc - margemAlvoPct) / 100) / 1000) * 1000;
    return { ...base, valor, margemDeContribuicaoPct: mcPct, motivo: null };
}
```

- [ ] **Step 5: Ver passar** (os dois arquivos de teste).

- [ ] **Step 6: `src/hooks/cadastros/useMetaSugerida.ts`.**
  - Carrega como `useSaudeDoCaixa` carrega: `getObligations`, `getGlobalCategories('finance')`, `getOrders`,
    `getBudgets`, `getClients` e `getProducts`.
  - Monta `vendas` com `montarItensVendidos` e `custos` (nome → `average_unit_cost > 0`) do mesmo jeito.
  - Para cada período de `ultimosMesesFechados(getTodayStr())`, chama `baseDoEquilibrio`; depois
    `metaSugerida(bases, margemAlvoPct)`.
  - Devolve `{ meta, carregando, erro }`.
  - O `useMemo` depende de `margemAlvoPct`, para a sugestão andar junto quando a margem alvo muda na tela.

- [ ] **Step 7: `CompanyTab` — meta com sugestão.** No bloco "Metas & Impostos", ao lado do campo "Meta de
  faturamento" (`revenue_goal`), com `useMetaSugerida(Number(profile.target_margin) || 0)`:
  - **Com `meta.valor`:**
    - o texto `Sugestão: ${formatCurrency(meta.valor)} / mês`;
    - o `BOTAO_SUAVE` "Usar sugestão", que faz `onChange({ ...profile, revenue_goal: meta.valor })` e não salva
      sozinho; a pessoa salva.
  - **Sem `meta.valor`:** o `meta.motivo` em `ROTULO_PEQUENO`.
  - **"Como cheguei nesse número"** — linha recolhível com `aria-expanded`, que mostra:
    - `Custo fixo médio (3 meses fechados): R$ X`;
    - `Margem das peças: Y%`;
    - `Margem alvo: Z%`;
    - `A margem foi medida em W% do faturamento (as peças com ficha técnica).`
    - Com `meta.fraca`, essa última linha fica `text-amber-400` e termina com `— estimativa fraca, complete as fichas`.
  - **Carregando:** "calculando sugestão…". **Erro:** nada (o campo continua editável).

- [ ] **Step 8: Fichário.**
  - `useFichario` passa a carregar também `storageService.getCompanyProfile()`.
  - Preenche `metaSugerida` com o `valor` da sugestão quando ele existe e difere de `revenue_goal`; senão, `null`.
  - Para não duplicar a carga do `useMetaSugerida`, extraia a montagem de lá para uma função interna do gancho,
    exportada (`calcularMetaSugerida(dadosCarregados, margemAlvoPct)`), e chame-a nos dois.

- [ ] **Step 9: Suíte e tipos limpos, depois commit.**

```bash
git add src/utils/saudeDoCaixa.ts src/utils/saudeDoCaixa.test.ts src/hooks/useSaudeDoCaixa.ts src/utils/metaDeFaturamento.ts src/utils/metaDeFaturamento.test.ts src/hooks/cadastros src/pages/masterdata/CompanyTab.tsx
git commit -F - <<'EOF'
feat(cadastros): meta de faturamento sugerida pelo fixo e pela margem das peças

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Setores e capacidade

**Files:**
- Modify: `src/components/pcp/CapacityPanel.tsx`
- Modify: `src/pages/masterdata/CompanyTab.tsx`

**Interfaces:**
- **Consumes:** `capacidadeMensal` (`src/utils/capacityCalendar.ts`).
- Nada novo para outras tarefas.

- [ ] **Step 1: `CapacityPanel`.**
  - **Sai** o bloco "Ocupação atual por setor" (o título com `Gauge`, o botão dele e o `cap.loads.map`). O
    `STATUS_STYLE` e os imports que ficarem sem uso saem junto.
  - **No topo**, antes da configuração, entra um `CARTAO p-5` "Capacidade mensal" com o conteúdo que hoje está
    em `CompanyTab` (linhas ~177–210):
    - o número de `capacidadeMensal(gargalo, getTodayStr().slice(0, 7))`, com o gargalo sendo a menor
      `weekly_capacity_pieces > 0` de `cap.sectors`;
    - a explicação "Sai do gargalo da linha: o setor com a menor capacidade semanal…";
    - `Gargalo de X pç/semana.`, ou "Nenhum setor com capacidade cadastrada." quando não houver.
  - **O resto não muda:** a configuração (setores, ordem, cor), os dias úteis e a hora extra.
  - A ocupação continua visível em Como estamos indo › Fábrica, na aba Dashboard do PCP ("Carga por setor").

- [ ] **Step 2: `CompanyTab`.** Sai o bloco "Capacidade Mensal" (com o `useEffect` do gargalo e o
  `capacidadeMensal`) e os imports sem uso. No lugar, uma linha `ROTULO_PEQUENO`:
  "A capacidade mensal fica em Cadastros › Setores e capacidade."

- [ ] **Step 3: Tipos e suíte limpos, depois commit.**

```bash
git add src/components/pcp/CapacityPanel.tsx src/pages/masterdata/CompanyTab.tsx
git commit -F - <<'EOF'
feat(cadastros): capacidade mensal mora em Setores; ocupação fica nos indicadores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Visual dos Cadastros

Passar o idioma do `estilo.ts` nas telas de Cadastros que ainda usam as classes antigas (`bg-zinc-950/30
border-zinc-900 p-8 rounded-2xl shadow-2xl backdrop-blur-md`, títulos `text-[10px] … tracking-[0.2em]` e botões
próprios). **Nada muda de lugar nem de comportamento.**

**Files:**
- Modify: `src/pages/masterdata/EntityListTab.tsx`, `src/pages/masterdata/CompanyTab.tsx`,
  `src/pages/masterdata/CategoriasTab.tsx`, `src/pages/masterdata/MensagensTab.tsx`,
  `src/components/masterdata/ClientesDormentes.tsx`, `src/components/masterdata/ContatosDoCliente.tsx`,
  `src/components/pcp/CapacityPanel.tsx`

**Interfaces:** nenhuma.

- [ ] **Step 1: Regras de troca, iguais às do ajuste visual da Finanças.**
  - **Contêiner de seção:** o painel grande (`bg-zinc-950/30 border border-zinc-900 p-8 rounded-2xl …`) vira
    `${CARTAO} p-5`.
  - **Linha ou item dentro de seção:** vira `${ITEM} p-4` (ou `px-3 py-2.5` em listas densas).
  - **Títulos:**
    - de seção (`h3` com `text-[10px] font-black … tracking-[0.2em]`) → `ROTULO`;
    - rótulos de campo → `ROTULO_PEQUENO`.
  - **Inputs soltos** com classe própria → `CAMPO`. `SearchableSelect` e os campos dos formulários de
    `ClientForm`/`SupplierForm`/`ProductForm` ficam como estão.
  - **Botões:**
    - ação principal da tela (Novo, Salvar) → `BOTAO_PRINCIPAL`;
    - secundária → `BOTAO_SECUNDARIO`;
    - ação "suave" (Adicionar contato, Recarregar) → `BOTAO_SUAVE`;
    - excluir → `BOTAO_PERIGO` (os botões só de ícone continuam só de ícone, com `aria-label`).
  - **Filtros e alternâncias:** `pilula(ativa)`.
  - **Espaços:** a escala 4–24. Entre seções `space-y-6`, entre cartões `gap-3`, e nada de `p-8`/`gap-8`.

- [ ] **Step 2: Aplicar** arquivo por arquivo da lista, sem tocar em lógica. Em `EntityListTab`:
  - a busca vira `CAMPO`;
  - "Novo" vira `BOTAO_PRINCIPAL`;
  - a tabela fica numa `${CARTAO} overflow-x-auto`.

- [ ] **Step 3: Tipos e suíte limpos** (o `sobreposicoes.test.ts` incluído), **depois commit.**

```bash
git add src/pages/masterdata src/components/masterdata src/components/pcp/CapacityPanel.tsx
git commit -F - <<'EOF'
style(cadastros): telas de Cadastros no idioma do estilo.ts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4 (controlador, não o implementador): fechamento do S2.**
  - **SQL:** pedir ao Luiz para rodar `supabase/cadastros_v3_1.sql` no banco local da v3.
  - **Conferência no navegador**, com o usuário de teste, **antes e depois** do SQL, em 1440, 1024 e 390 px:
    - cada cartão abre e volta;
    - os números do fichário batem com as telas;
    - o vencido do cliente bate com Clientes que devem;
    - o mutirão percorre a fila na ordem do painel;
    - Bancos mostra o que não bate;
    - o PDF do orçamento sai com os dados bancários antes e depois do SQL;
    - as duas linhas novas da fila abrem o lugar certo;
    - links antigos (`masterdata`, `capacidade`) abrem;
    - nenhuma rolagem para o lado e nenhum erro novo no console.
  - **Comparação v2 × v3** publicada: fichário, página do cliente, Produtos e Bancos.
  - **Roteiro:** S2 → "Pronto", com o que ficou para S3–S6.

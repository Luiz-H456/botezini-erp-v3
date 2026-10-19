# 🧭 Blueprint de Engenharia — Botezini ERP

> O [mapa de arquitetura](arquitetura.html) descreve **o que existe**.
> Este blueprint define **como construir** daqui pra frente: regras, receitas e padrões.
> Em caso de dúvida entre este documento e o código, este documento vence — corrija o código.

---

## 1. Os 7 princípios inegociáveis

| # | Princípio | Por quê |
|---|-----------|---------|
| 1 | **O banco é a fonte da verdade sobre dinheiro** | Regra financeira em JavaScript é regra que some quando alguém abre outra aba. |
| 2 | **Nada de dinheiro é editado — é lançado** | `original_amount` é imutável. Correção vira lançamento novo, auditável. |
| 3 | **Operação de dinheiro é atômica** | Uma RPC transacional, nunca 3 chamadas do front que podem falhar no meio. |
| 4 | **Estado financeiro é derivado, nunca armazenado** | `obligation_summary` calcula; ninguém guarda "quanto já pagou" numa coluna. |
| 5 | **Cada camada só conhece a de baixo** | Componente não importa Supabase. Hook não importa repositório. |
| 6 | **Idempotência onde há dinheiro** | Clicar duas vezes não pode gerar cobrança dobrada. |
| 7 | **Nada é criado "à revelia"** | Categorias, cadastros e lançamentos nascem de um catálogo/fluxo, não de texto livre solto. |

---

## 2. Regras de camada (o que pode importar o quê)

```
  Página / Componente
        ↓  (só pode importar hooks, componentes, utils, types)
      Hook
        ↓  (só pode importar storageService, utils, types)
   storageService                    ← FACADE: ponto único
        ↓  (só pode importar repositórios)
   Repositório
        ↓  (ÚNICO que importa o cliente Supabase)
     Supabase
```

### Proibições explícitas
- ❌ `import { supabase }` fora de `src/repositories/**` e `src/services/supabase.ts`
- ❌ Componente chamando `storageService` direto para **lógica de negócio**
  *(exceção tolerada: leitura pontual e isolada dentro de um modal autocontido — ex.: `DisparoModal` buscando contas bancárias)*
- ❌ Hook importando repositório direto (sempre via `storageService`)
- ❌ Cálculo de saldo/dívida no front — isso vem de view ou RPC

### Como decidir onde a lógica vive

```
A lógica envolve dinheiro, estoque ou consistência entre tabelas?
├── SIM → RPC no Postgres (transacional, com assert_finance_access)
└── NÃO
    ├── É regra de negócio reutilizável? → src/utils/*.ts (função pura, testável)
    ├── É orquestração de tela?          → src/hooks/*.ts
    └── É só apresentação?               → componente
```

---

## 3. Receitas (passo a passo)

### 3.1 Adicionar um novo módulo/aba

1. **Tipo da view**: adicione a chave em `View` (`src/components/common/NavItem.tsx`).
2. **Página**: crie `src/pages/MinhaPagina.tsx` (ou `components/<area>/MeuPainel.tsx`).
3. **Lazy import** no `src/App.tsx`:
   ```tsx
   const MeuPainel = lazy(() => import('@/components/x/MeuPainel').then(m => ({ default: m.MeuPainel })));
   ```
4. **Case no switch** de `renderContent()`.
5. **NavItem** na sidebar com ícone `lucide-react`.
6. **Título** no mapa de labels do header.
7. Se o módulo é financeiro → **bloquear o papel `factory`** (a checagem já existe em `handleNavigate`).

### 3.2 Adicionar uma operação de dinheiro (o caminho completo)

> Exemplo real: `fund_envelopes` (provisionamento das caixinhas).

**Passo 1 — SQL** (`supabase/finance_phaseN_<assunto>.sql`)
```sql
CREATE OR REPLACE FUNCTION public.minha_operacao(p_param numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total numeric := 0;
BEGIN
  PERFORM public.assert_finance_access();          -- 1. SEMPRE primeiro
  IF p_param IS NULL OR p_param <= 0 THEN          -- 2. Valide a entrada
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;
  -- 3. Faça tudo aqui dentro (é uma transação)
  -- 4. Registre movimento/auditoria quando mexer em saldo
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.minha_operacao(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_operacao(numeric) TO authenticated;
```

**Passo 2 — Repositório**
```ts
async minhaOperacao(param: number): Promise<number> {
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase.rpc('minha_operacao', { p_param: param });
    if (error) throw new Error(error.message);
    return Number(data) || 0;
}
```

**Passo 3 — Facade** (`storage.ts`): uma linha delegando.

**Passo 4 — Hook**: envolva com `busy`/`error` e **recarregue** os dados depois.

**Passo 5 — UI**: botão → modal de confirmação (**nunca** `window.prompt`).

**Passo 6 — Teste** (`tests/test_phaseN_*.py`): prove a regra, não o caminho feliz.

**Passo 7 — Docs**: acrescente o SQL na tabela de ordem do `QA_ROTINA_COMPLETA.md`.

### 3.3 Adicionar um campo a uma entidade

1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (sempre idempotente).
2. Campo no tipo em `src/types/index.ts` (ou `types/finance.ts`) — **opcional** (`?`) se legado pode não ter.
3. Repositório: incluir no mapeamento de leitura **e** no payload de escrita.
   ⚠️ Se o repositório usa *allowlist* no payload (ex.: `envelopeRepository.saveEnvelope`), adicionar lá — senão o campo é silenciosamente descartado.
4. Formulário: input + estado + carregamento no modo edição.

### 3.4 Criar um modal

```tsx
export function MeuModal({ onClose }: Props) {
    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-[80] flex items-center justify-center p-4 animate-in fade-in duration-300"
             onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-300"
                 onClick={e => e.stopPropagation()}>
                {/* header com título + botão X */}
                {/* corpo */}
                {/* footer: [Cancelar] [Ação primária] */}
            </div>
        </div>,
        document.body   // ← SEMPRE portal
    );
}
```

**Obrigatório:** `createPortal`, fechar no clique fora, `stopPropagation` no conteúdo, z-index da tabela abaixo.

---

## 4. Escala de z-index (formalizada)

> Hoje há **10 valores ad hoc** no código. Esta é a escala canônica — use-a em código novo e migre o antigo quando encostar.

| Faixa | Uso | Exemplo |
|-------|-----|---------|
| `0–50` | Conteúdo normal | cards, tabelas |
| `z-[60]` | Barras fixas / sticky | header de lista |
| `z-[70]` | Overlays de página | drawer lateral |
| **`z-[80]`** | **Modal padrão** | PaymentModal, EnvelopeForm, DisparoModal |
| `z-[100]` | Editor tela cheia | BudgetEditor |
| `z-[110]` | Modal **sobre** editor | FichaTecnicaMissingModal |
| `z-[120]` | Modal sobre editor (2º nível) | PaymentPlanModal |
| `z-[150]` | Crítico / bloqueante | erro fatal, confirmação destrutiva |
| `9999` | **Dropdown em portal** | SearchableSelect |
| `99999` | **Tooltip em portal** | InfoTooltip |

**Regra:** dropdown e tooltip ficam **sempre acima de qualquer modal** — por isso os valores altos. Se um modal precisa cobrir um dropdown, o problema é o fluxo, não o z-index.

---

## 5. Regras específicas de dinheiro

### 5.1 O ciclo de um recebível
```
apply_order_payment_plan   → cria parcelas PRÉ-LANÇADAS (open + planned_method)
        ↓
   (pedido produz / entrega)
        ↓
get_pending_installments   → lista só de pedidos Concluídos/Entregues
        ↓
pay_obligation             → EFETIVA, com data e meio escolhidos pelo usuário
```

- **Emitir pedido nunca gera recebimento.** Boleto/PIX só existe de fato no disparo manual.
- **Ajustar plano** → `revise_order_plan`: cancela só as em aberto, **preserva as pagas**.
- **Divergência de total** → `apply_order_adjustment`: lançamento novo, jamais editar o original.

### 5.2 Checklist ao mexer em dinheiro
- [ ] É uma RPC transacional (não várias chamadas do front)?
- [ ] Tem `assert_finance_access()` na primeira linha?
- [ ] Valida entrada (nulo, zero, negativo)?
- [ ] É idempotente ou impede duplicação?
- [ ] Registra movimento/auditoria?
- [ ] `REVOKE ... FROM anon` + `GRANT ... TO authenticated`?
- [ ] Tem teste que prova a **regra** (não só o caminho feliz)?

---

## 6. Segurança — padrão obrigatório

**Toda tabela nova:**
```sql
ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='minha_tabela'
                   AND policyname='single_tenant_admin_manager_all') THEN
    CREATE POLICY single_tenant_admin_manager_all ON public.minha_tabela
      FOR ALL TO authenticated
      USING (public.is_admin_or_manager())
      WITH CHECK (public.is_admin_or_manager());
  END IF;
END; $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.minha_tabela TO authenticated;
```

**Toda view nova:** `WITH (security_invoker = on)` — para respeitar o RLS de quem consulta.
**Toda RPC financeira:** `SECURITY DEFINER` + `assert_finance_access()` + `REVOKE anon`.
**Papel `factory`:** bloqueado no banco (RLS) **e** na navegação. As duas coisas, sempre.

---

## 7. Convenções de banco

- **Arquivo**: `finance_phaseN_<assunto>.sql`, numerado, aplicado em ordem.
- **Idempotente sempre**: `IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`.
- **Nunca destrutivo sem confirmação**: `DROP` fica comentado com um `SELECT` de inspeção acima (padrão do `finance_phase9`).
- **Datas**: comparar vencimento com o fuso do negócio, não UTC cru:
  ```sql
  WHEN o.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
  ```
- **Ambiguidade em `RETURNS TABLE`**: qualifique **todas** as colunas com alias — o nome da coluna de saída sombreia o da tabela e gera erro `42702`.

---

## 8. Padrões de UI

| Necessidade | Use | Nunca use |
|-------------|-----|-----------|
| Dropdown | `SearchableSelect` | `<select>` nativo |
| Dica explicativa | `InfoTooltip` (portal) | `div absolute` com `group-hover` |
| Entrada de valor | Modal próprio | `window.prompt` |
| Confirmação | `ConfirmDialog` / modal | `window.confirm` em fluxo crítico |
| Sobreposição | `createPortal(…, document.body)` | `absolute` dentro do container |

**Estética:** fundo `zinc-900`, borda `zinc-800`, `rounded-3xl` em modais, acento `amber-500`.
Rótulos: `text-[9px] font-black uppercase tracking-widest text-zinc-500`.

**Números vindos de input:**
```tsx
value: parseFloat(e.target.value) || 0   // ← o "|| 0" evita NaN no banco
```

---

## 9. Testes

**Filosofia:** o teste existe para **falhar quando a regra quebrar**. Teste que só confirma o caminho feliz é decoração.

| Tipo | Onde | O que provar |
|------|------|--------------|
| Invariante | `tests/test_phaseN_*.py` | `livre = real − alocado`; soma das parcelas = total |
| Bloqueio | idem | alocar além do livre **levanta exceção** |
| Preservação | idem | revisar plano **não apaga** parcela paga |
| Idempotência | idem | chamar 2× não duplica |
| Segurança | `test_security_audit.py` | `factory` **não** lê dado financeiro |

**Fixtures:** limpe em ordem de FK (pagamentos → obrigações → pedido → cliente).
**Datas:** use vencimento no futuro para status determinístico (evita flake de fuso).

---

## 10. Anti-padrões (encontrados e corrigidos aqui — não repita)

| Anti-padrão | Sintoma | Correção aplicada |
|-------------|---------|-------------------|
| Dois sistemas para a mesma coisa | Campo de categoria com texto **e** catálogo global | Um seletor único sobre `global_categories` |
| Campo escrito e nunca lido | `global_category_id` gravado no quick create, invisível no resto | Sincronizar `category` + `global_category_id` juntos |
| Tooltip `absolute` em container com scroll | Corta e cria barra de rolagem | `InfoTooltip` em portal |
| `parseFloat` sem fallback | `NaN` gravado no banco | `|| 0` |
| Prompt do navegador para dado de negócio | Feio, sem validação, sem prévia | Modal com preview |
| Campo duplicado no mesmo form | Dois inputs no mesmo `price` | Remover a duplicata |
| Modal abaixo do editor | "O botão não faz nada" | Escala de z-index (§4) |
| Estado financeiro em coluna | `orders.amount_paid` divergindo da verdade | Derivar de `obligation_summary` |
| Tabela legada viva no código | `financial_categories` lida e escrita sem uso real | Remover código → drop com inspeção antes |

---

## 11. Checklist antes de dar por pronto

**Código**
- [ ] `npx tsc --noEmit` → exit 0
- [ ] App sobe sem erro no console
- [ ] Nenhuma camada furada (§2)
- [ ] Dropdown/tooltip/modal seguem §8

**Banco**
- [ ] SQL idempotente e numerado
- [ ] RLS + GRANT/REVOKE (§6)
- [ ] Adicionado à ordem em `QA_ROTINA_COMPLETA.md`

**Dinheiro** (se aplicável)
- [ ] Checklist §5.2 inteiro

**Testes**
- [ ] Teste que prova a regra nova
- [ ] `pytest -v` sem regressão

**Documentação**
- [ ] `arquitetura.json` / `arquitetura.html` atualizados se mudou estrutura
- [ ] `TESTES_MANUAIS_APP.md` com o passo do fluxo novo

---

## 12. Dívida técnica conhecida (mapa honesto)

| Item | Situação | Próximo passo |
|------|----------|---------------|
| Unificação de categorias | `global_categories` é a fonte; texto `category` segue como fallback sincronizado | Migrar texto→global exige decisão de domínios (`crm` → `client`/`supplier`?) — ver `plano-unificacao-categorias.md` |
| `orders.amount_paid` / `payment_status` | Colunas legadas, escritas como `0`, ninguém lê | Remover após confirmar que nenhum relatório antigo depende |
| Cache local de categorias (`botezini_cat_*`) | localStorage, não é fonte de verdade | Aposentar junto da unificação |
| Escala de z-index | Formalizada aqui, código antigo ainda ad hoc | Migrar ao encostar em cada arquivo |
| Provisionamento das caixinhas | Manual, valor-base digitado livremente | Ligar ao recebimento real (disparo) para eliminar risco de provisionar duas vezes |
| `wms_*`, `transactions`, `invoices` | Tabelas órfãs no schema | Confirmar desuso e derrubar com inspeção |

---

*Blueprint gerado em 18/07/2026 a partir da leitura do código. Companheiro do [mapa de arquitetura](arquitetura.html) e do [JSON](arquitetura.json).*

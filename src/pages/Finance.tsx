import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Wallet, TrendingUp, ArrowDownLeft, ArrowUpRight, Clock, AlertTriangle, Landmark, PieChart, PiggyBank, SlidersHorizontal, Search } from 'lucide-react';
import { Indicador } from '../components/finance/ui/Indicador';
import { CARTAO, ITEM, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, pilula } from '../components/finance/ui/estilo';
import { storageService } from '../services/storage';
import {
    ObligationCard, PaymentModal, ObligationForm,
    EditarContaModal,
} from '../components/finance';
// formatCurrency e getTodayStr agora vêm de utils — o getTodayStr de lá usa data
// LOCAL, enquanto o antigo usava toISOString() (UTC). No fuso do Brasil o UTC já
// é o dia seguinte a partir das 21h, então "hoje" virava cedo demais toda noite.
import { getTodayStr } from '../utils';
import { ObligationSummary, ObligationPayment, BankAccount, ObligationType } from '../types';
import { QuickCreateModal, GlobalCategoryQuickAdd } from '../components/modals';
import { SearchableSelect, MenuMais } from '../components/common';
import { ConfirmarOperacao } from '../components/common/ConfirmarOperacao';
import { IndicadorRecarga } from '../components/common/IndicadorRecarga';
import { usePrivacidade } from '@/hooks/usePrivacidade';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { useFinanceData } from '../hooks/finance/useFinanceData';
import { useFinanceFilters } from '../hooks/finance/useFinanceFilters';
import { motivoParaNaoCancelar } from '../utils/pagamentoAtivo';
import {
    FILTROS_VAZIOS, FILTROS_A_VISTA, FILTROS_NO_PAINEL, ROTULO_DO_FILTRO, contarFiltrosExtras, filtrosDaBusca, valorDaLinha,
} from '@/utils/financas/lista';
import type { FiltrosDaLista } from '@/utils/financas/lista';
import { RECORTES, ROTULO_DO_RECORTE } from '@/utils/financas/numeros';
import type { Recorte } from '@/utils/financas/numeros';
import type { PontoDaProjecao } from '@/utils/financas/projecao';
import { bancoSugerido } from '@/utils/financas/caixinhas';
import { JanelaDeBaixa } from '@/components/financas/JanelaDeBaixa';
import { JanelaConferirBanco } from '@/components/financas/JanelaConferirBanco';
import { situacaoDosBancos } from '@/utils/financas/bancos';
import { caixaDoPeriodo } from '@/utils/financas/caixa';
import { normalizeCategoryName } from '@/utils/categoryResolver';
import { nomeDoMes, mesDe, mesAnterior, proximoMes } from '@/utils/financas/base';

import { mensagemDeErro } from '@/utils/errorHandling';
interface FinanceProps {
    initialSearch?: string;
    clearSearch?: () => void;
    /** Filtros pedidos por outra tela (Resultado, Clientes que devem). */
    filtrosIniciais?: Partial<import('@/utils/financas/lista').FiltrosDaLista>;
    limparFiltros?: () => void;
    /** Banco que a fila do Início pede para conferir. */
    bancoParaConferir?: string;
    limparBanco?: () => void;
    onNavegar?: (v: import('@/utils/navegacao').View) => void;
    /** O "⋯" de Bancos leva a Cadastros › Bancos: criar, editar e inativar moram lá. */
    onGerenciarBancos?: () => void;
}

function LinhaDoSaldo({ pontos }: { pontos: PontoDaProjecao[] }) {
    if (pontos.length < 2) return null;
    const valores = pontos.map(p => p.saldo);
    const min = Math.min(...valores);
    const faixa = Math.max(...valores) - min || 1;
    const d = pontos.map((p, i) => `${(i / (pontos.length - 1)) * 200},${38 - ((p.saldo - min) / faixa) * 34}`).join(' ');
    return (
        <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-10 text-zinc-500" role="img"
            aria-label="Saldo projetado dia a dia até o fim do mês">
            <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

const campo = 'h-10 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200';

export default function Finance({ initialSearch, clearSearch, filtrosIniciais, limparFiltros, bancoParaConferir, limparBanco, onNavegar, onGerenciarBancos }: FinanceProps) {
    const {
        obligations,
        bankAccounts,
        clients,
        suppliers,
        globalCategories,
        envelopeOverview,
        payments,
        envelopes,
        loading,
        recarregando,
        showAlert,
        loadData
    } = useFinanceData();

    // UI View State
    // Mesmo estado da barra do topo — dois interruptores independentes para a
    // mesma coisa acabam mostrando estados diferentes.
    const { oculto: isPrivacy } = usePrivacidade();
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();

    // Modals State
    const [showCategoryQuickAdd, setShowCategoryQuickAdd] = useState(false);

    const [showQuickCreate, setShowQuickCreate] = useState<'client' | 'supplier' | null>(null);

    /** Conta em correção de valor/vencimento — ver EditarContaModal. */
    const [contaEmEdicao, setContaEmEdicao] = useState<ObligationSummary | null>(null);

    const [reconciliationUndoTarget, setReconciliationUndoTarget] = useState<ObligationSummary | null>(null);
    const [conciliarAlvo, setConciliarAlvo] = useState<ObligationSummary | null>(null);
    const [undoReason, setUndoReason] = useState("");
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);

    /** Recebi/Paguei: a baixa rápida. "Mais opções" leva ao PaymentModal. */
    const [baixa, setBaixa] = useState<ObligationSummary | null>(null);
    const [payingOb, setPayingOb] = useState<ObligationSummary | null>(null);
    const [payingObPayments, setPayingObPayments] = useState<ObligationPayment[]>([]);
    /** Ativas e inativas, só para o histórico do PaymentModal nomear a conta (Contas carrega só as ativas). */
    const [todasAsContas, setTodasAsContas] = useState<BankAccount[]>([]);
    useEffect(() => {
        storageService.getBankAccounts(false).then(setTodasAsContas)
            .catch(() => { /* sem a lista, o histórico cai nas ativas */ });
    }, []);
    // O filtro Banco também lista as inativas: é o jeito de ver o passado de uma conta encerrada.
    const contasDoFiltro = todasAsContas.length ? todasAsContas : bankAccounts;
    const [showForm, setShowForm] = useState<ObligationType | null>(null);

    // Confirmation Modal State
    /** De que operacao do registro cada confirmacao fala. */
    const OPERACAO_DO_CONFIRM: Record<'cancel_ob' | 'reverse_payment', string> = {
        cancel_ob: 'cancelar-lancamento',
        reverse_payment: 'estornar-pagamento',
    };

    const [confirmTarget, setConfirmTarget] = useState<{
        type: 'cancel_ob' | 'reverse_payment';
        id: string;
        /** O que esta sendo afetado, para a caixa nomear em vez de so perguntar. */
        alvo?: string;
    } | null>(null);

    /** id da obrigação -> contas onde o dinheiro passou. Alimenta o filtro por conta. */
    const [contasPorObrigacao, setContasPorObrigacao] = useState<Record<string, string[]>>({});

    const [filtros, setFiltros] = useState<FiltrosDaLista>({ ...FILTROS_VAZIOS, ...(filtrosIniciais ?? {}) });
    const [emColunas, setEmColunas] = useState(false);
    const [painelAberto, setPainelAberto] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const mudar = (m: Partial<FiltrosDaLista>) => setFiltros(f => ({ ...f, recorte: null, ...m }));
    // O total e a lista têm de bater: o recorte parte de filtros zerados.
    const alternarRecorte = (r: Recorte) =>
        setFiltros(f => (f.recorte === r ? FILTROS_VAZIOS : { ...FILTROS_VAZIOS, recorte: r }));

    useEffect(() => {
        if (filtrosIniciais) { setFiltros({ ...FILTROS_VAZIOS, ...filtrosIniciais }); limparFiltros?.(); }
    }, [filtrosIniciais, limparFiltros]);
    // Busca vinda de outra tela (Pedidos → "Pedido #123"): abre em Todas com a busca preenchida.
    useEffect(() => {
        if (initialSearch) { setFiltros({ ...FILTROS_VAZIOS, ...filtrosDaBusca(initialSearch) }); clearSearch?.(); }
    }, [initialSearch, clearSearch]);

    const { lista, grupos, numeros, projecao, nomeDaParte, nomeDaCategoria } = useFinanceFilters(
        obligations, clients, suppliers, globalCategories, filtros, contasPorObrigacao,
        { nosBancos: envelopeOverview.total_real, nasCaixinhas: envelopeOverview.allocated });

    const bancos = useMemo(() => situacaoDosBancos({ bancos: bankAccounts, contas: obligations, contasPorObrigacao }), [bankAccounts, obligations, contasPorObrigacao]);
    const [bancoAberto, setBancoAberto] = useState<string | null>(null);
    // Banco aberto que saiu da lista (inativado): limpa, senão reativar depois reabre a janela.
    useEffect(() => { if (bancoAberto && !bancos.some(b => b.id === bancoAberto)) setBancoAberto(null); }, [bancoAberto, bancos]);
    // O pedido vindo do Início pode chegar antes de `bancos` carregar: só abre (e só
    // então limpa) quando o banco já existe, senão o efeito acima o fecharia na hora.
    useEffect(() => {
        if (bancoParaConferir && bancos.some(b => b.id === bancoParaConferir)) { setBancoAberto(bancoParaConferir); limparBanco?.(); }
    }, [bancoParaConferir, bancos, limparBanco]);
    const [mesDosGastos, setMesDosGastos] = useState(mesDe(getTodayStr()));
    const idPorNomeNormalizado = useMemo(() => new Map(globalCategories.map(c => [normalizeCategoryName(c.name), c.id])), [globalCategories]);
    const gastos = useMemo(() => caixaDoPeriodo({ pagamentos: payments, contas: obligations, categorias: globalCategories, meses: [mesDosGastos] }).porCategoria, [payments, obligations, globalCategories, mesDosGastos]);
    const maiorGasto = Math.max(1, ...gastos.map(f => f.valor));

    useEffect(() => {
        loadData();
    }, [loadData]);

    // O índice de contas por obrigação acompanha as obrigações: toda baixa e
    // todo estorno mudam quem tocou qual conta. Recarregar junto evita o filtro
    // achar uma obrigação numa conta de onde o dinheiro já foi estornado.
    useEffect(() => {
        let vivo = true;
        storageService.getContasPorObrigacao()
            .then(idx => { if (vivo) setContasPorObrigacao(idx); })
            .catch(() => { /* índice vazio degrada para filtro só pela conta prevista */ });
        return () => { vivo = false; };
    }, [obligations]);

    // ⌘F / Ctrl+F foca a busca (que fica à vista); Esc fecha o painel de filtros.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setPainelAberto(false);
                searchInputRef.current?.focus();
            }
            // Esc já tratado (lista do SearchableSelect aberta) fecha só a lista.
            if (e.key === 'Escape' && !e.defaultPrevented) setPainelAberto(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Foco preso no painel de filtros: entra ao abrir, Tab dá a volta, devolve a quem abriu ao fechar.
    const painelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!painelAberto) return;
        const antes = document.activeElement as HTMLElement | null;
        const focaveis = () => Array.from(painelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? []);
        focaveis()[0]?.focus();
        const aoTecla = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const itens = focaveis();
            if (!itens.length) return;
            const primeiro = itens[0], ultimo = itens[itens.length - 1];
            const dentro = painelRef.current!.contains(document.activeElement);
            if (e.shiftKey && (!dentro || document.activeElement === primeiro)) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) { e.preventDefault(); primeiro.focus(); }
        };
        document.addEventListener('keydown', aoTecla);
        return () => { document.removeEventListener('keydown', aoTecla); antes?.focus(); };
    }, [painelAberto]);

    // No celular a lista fica acima da lateral: depois de clicar numa barra, leva o olho até ela.
    const listaRef = useRef<HTMLElement>(null);
    const verALista = () => {
        if (window.matchMedia('(min-width: 1024px)').matches === false) listaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const clearAllFilters = () => { setFiltros(FILTROS_VAZIOS); setEmColunas(false); };

    const handleOpenPay = async (ob: ObligationSummary) => {
        try {
            const payments = await storageService.getObligationPayments(ob.id);
            setPayingObPayments(payments);
            setPayingOb(ob);
        } catch (e: any) { showAlert(e.message, 'error'); }
    };



    const handleQuickCreateSuccess = () => {
        setShowQuickCreate(null);
        showAlert('Cadastro realizado com sucesso', 'success');
        loadData();
    };


    const handleCancel = async (ob: ObligationSummary) => {
        // Conta com pagamento ativo não cancela — o banco recusa, e com razão:
        // cancelar por cima de um pagamento deixaria o saldo bancário apontando
        // para um lançamento que não existe mais.
        //
        // Só que avisar isso e parar por aí é um beco sem saída: quem lançou
        // errado precisa justamente desfazer, e o caminho (estornar primeiro,
        // cancelar depois) não está escrito em lugar nenhum. Então em vez do
        // erro, abrimos o modal de pagamento — onde o botão Estornar está.
        //
        // A decisão sai das LINHAS de pagamento, não do `paid_amount` da lista:
        // o valor da lista envelhece entre um estorno e o próximo carregamento,
        // e há bancos com a view antiga, em que a linha de estorno ainda soma
        // como se fosse pagamento. Perguntar direto à fonte evita mandar o
        // usuário estornar o que ele já estornou.
        let pagamentos: ObligationPayment[] = [];
        try {
            pagamentos = await storageService.getObligationPayments(ob.id);
        } catch (e: any) {
            showAlert(e.message, 'error');
            return;
        }

        const motivo = motivoParaNaoCancelar(pagamentos as any);
        if (motivo) {
            showAlert(motivo, 'error');
            setPayingObPayments(pagamentos);
            setPayingOb(ob);
            return;
        }
        setConfirmTarget({
            type: 'cancel_ob',
            id: ob.id,
            alvo: ob.description,
        });
    };

    /**
     * Conciliar deixou de ser um clique mudo.
     *
     * Marcar como conferido e uma AFIRMACAO sua de que o lancamento existe no
     * extrato do banco — e o "saldo conciliado" do painel passa a contar com
     * ela. Disparar isso sem uma palavra fazia a marca virar um clique de
     * passagem, e o saldo conciliado, um numero sem lastro.
     *
     * Nao e destrutivo, e a caixa nao finge que e: sai em ambar, com o caminho
     * de volta escrito.
     */
    const handleReconcile = (ob: ObligationSummary) => setConciliarAlvo(ob);

    const confirmarConciliacao = async () => {
        const ob = conciliarAlvo;
        if (!ob) return;
        setConciliarAlvo(null);
        try {
            await storageService.toggleReconciliation(ob.id);
            showAlert('Marcado como conferido no extrato', 'success');
            loadData();
        } catch (e: any) { showAlert(e.message, 'error'); }
    };

    const handleUndoReconcileSubmit = async () => {
        if (!reconciliationUndoTarget) return;
        if (!undoReason.trim()) {
            showAlert('É obrigatório informar o motivo', 'error');
            return;
        }
        setIsGlobalLoading(true);
        try {
            await storageService.undoReconciliation(reconciliationUndoTarget.id, undoReason.trim());
            showAlert('Conciliação desfeita com sucesso', 'success');
            setReconciliationUndoTarget(null);
            setUndoReason("");
            loadData();
        } catch (e: any) {
            showAlert(e.message, 'error');
        } finally {
            setIsGlobalLoading(false);
        }
    };

    const handleReversePayment = (paymentId: string) => {
        setConfirmTarget({
            type: 'reverse_payment',
            id: paymentId,
        });
    };

    const executeConfirm = async () => {
        if (!confirmTarget) return;
        const { type, id } = confirmTarget;
        setConfirmTarget(null);

        try {
            if (type === 'cancel_ob') {
                await storageService.cancelObligation(id);
                showAlert('Lançamento cancelado', 'success');
            } else if (type === 'reverse_payment') {
                await storageService.reversePayment(id, 'Estorno solicitado pelo usuário');
                showAlert('Pagamento estornado', 'success');
                if (payingOb) setPayingObPayments(await storageService.getObligationPayments(payingOb.id));
            }
            loadData();
        } catch (e: any) {
            // A mesma recusa pode chegar aqui quando a lista está defasada — um
            // pagamento entrou depois do último carregamento. Vale a mesma
            // tradução: dizer o obstáculo sem dizer a saída é o que faz a pessoa
            // lançar um valor inverso para "corrigir".
            const msg = String(mensagemDeErro(e, ''));
            if (type === 'cancel_ob' && /pagamentos? ativos?/i.test(msg)) {
                showAlert('Esta conta tem pagamento lançado. Estorne o pagamento primeiro — '
                    + 'depois o cancelamento fica liberado.', 'error');
                const ob = obligations.find(o => o.id === id);
                if (ob) handleOpenPay(ob);
                return;
            }
            showAlert(msg, 'error');
        }
    };

    const extras = contarFiltrosExtras(filtros, emColunas);
    const nomeDaPessoa = (id: string) =>
        clients.find(c => c.id === id)?.company_name ?? suppliers.find(f => f.id === id)?.company_name ?? 'cliente ou fornecedor';
    const etiquetas = [
        filtros.recorte && { rotulo: ROTULO_DO_RECORTE[filtros.recorte], tirar: () => setFiltros(FILTROS_VAZIOS) },
        filtros.tipo !== 'ambos' && { rotulo: filtros.tipo === 'receivable' ? 'A receber' : 'A pagar', tirar: () => mudar({ tipo: 'ambos' }) },
        filtros.mes && { rotulo: nomeDoMes(filtros.mes), tirar: () => mudar({ mes: null }) },
        filtros.busca.trim() && { rotulo: `"${filtros.busca.trim()}"`, tirar: () => mudar({ busca: '' }) },
        filtros.clienteId && { rotulo: nomeDaPessoa(filtros.clienteId), tirar: () => mudar({ clienteId: null }) },
        filtros.categoriaId && { rotulo: globalCategories.find(c => c.id === filtros.categoriaId)?.name ?? 'categoria', tirar: () => mudar({ categoriaId: null }) },
        filtros.bancoId && { rotulo: contasDoFiltro.find(b => b.id === filtros.bancoId)?.name ?? 'banco', tirar: () => mudar({ bancoId: null }) },
        FILTROS_NO_PAINEL.includes(filtros.rapido) && { rotulo: ROTULO_DO_FILTRO[filtros.rapido], tirar: () => mudar({ rapido: 'agora' }) },
        emColunas && { rotulo: 'Em colunas', tirar: () => setEmColunas(false) },
    ].filter(Boolean) as { rotulo: string; tirar: () => void }[];

    const renderCard = (ob: ObligationSummary) => (
        <ObligationCard key={ob.id} ob={ob} partyName={nomeDaParte(ob) || null} categoryLabel={nomeDaCategoria(ob) || null}
            isPrivacy={isPrivacy} onBaixa={setBaixa} onDetail={handleOpenPay} onCancel={handleCancel}
            onReconcile={handleReconcile}
            onEdit={setContaEmEdicao}
            onUndoReconcile={(ob) => { setReconciliationUndoTarget(ob); setUndoReason(''); }} />
    );
    const somaDaLista = (contas: ObligationSummary[]) => contas.reduce((s, o) => s + valorDaLinha(o), 0);

    return (
        <div className="min-h-screen min-h-svh bg-zinc-950 text-white">

                <div className="w-full grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">

                    {/* ── LEFT ─────────────────────────────────────────────── */}
                    <div className="space-y-6 min-w-0">

                        <section className="grid gap-3 sm:grid-cols-2">
                            <Indicador grande icone={Wallet} rotulo="Livre para usar" valor={mostrar(numeros.livre)}
                                tom={numeros.livre < 0 ? 'rose' : 'zinc'}
                                sub={`${mostrar(numeros.nosBancos)} nos bancos − ${mostrar(numeros.nasCaixinhas)} nas caixinhas`} />
                            <div className={`${CARTAO} p-5 min-w-0`}>
                                <span className="flex items-center gap-1.5"><TrendingUp size={12} className="text-zinc-600" />
                                    <span className={ROTULO_PEQUENO}>Fecha {nomeDoMes(mesDe(hoje)).split(' ')[0]} com</span></span>
                                <div className="mt-1 flex items-end gap-3">
                                    <span className={`text-3xl font-black tracking-tighter tabular-nums ${projecao.fechaCom < 0 ? 'text-rose-400' : 'text-zinc-100'}`}>{mostrar(projecao.fechaCom)}</span>
                                    <div className="flex-1 min-w-0"><LinhaDoSaldo pontos={projecao.pontos} /></div>
                                </div>
                                <span className="block mt-0.5 text-[10px] font-bold text-zinc-600">só pedidos já entregues</span>
                            </div>
                        </section>

                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {RECORTES.map(r => {
                                const soma = numeros.recortes[r];
                                const vencido = r.endsWith('vencido');
                                return (
                                    <Indicador key={r} rotulo={ROTULO_DO_RECORTE[r]} valor={mostrar(soma.total)} sub={`${soma.quantidade} conta(s)`}
                                        icone={vencido ? AlertTriangle : Clock}
                                        tom={vencido && soma.total > 0 ? 'rose' : r.startsWith('receber') ? 'emerald' : 'zinc'}
                                        onClick={() => alternarRecorte(r)} ativo={filtros.recorte === r} />
                                );
                            })}
                        </section>

                        <section className={`${CARTAO} p-4 space-y-3`}>
                            <div className="flex flex-wrap items-center gap-2">
                                {FILTROS_A_VISTA.map(f => (
                                    <button key={f} type="button" onClick={() => mudar({ rapido: f })}
                                        aria-pressed={!filtros.recorte && filtros.rapido === f}
                                        className={pilula(!filtros.recorte && filtros.rapido === f)}>
                                        {ROTULO_DO_FILTRO[f]}
                                    </button>
                                ))}
                                <label className="flex h-9 min-w-0 flex-1 basis-48 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 focus-within:border-amber-500/40">
                                    <Search size={14} className="shrink-0 text-zinc-600" />
                                    <input ref={searchInputRef} value={filtros.busca} onChange={e => mudar({ busca: e.target.value })}
                                        placeholder="Buscar (⌘F)" aria-label="Buscar conta"
                                        className="min-w-0 flex-1 bg-transparent text-base sm:text-sm text-zinc-200 outline-none placeholder:text-zinc-600" />
                                </label>
                                <button type="button" onClick={() => setPainelAberto(true)} className={`${BOTAO_SECUNDARIO} h-9`}>
                                    <SlidersHorizontal size={13} /> Filtros{extras > 0 && <span className="rounded-md bg-amber-500 px-1.5 text-black">{extras}</span>}
                                </button>
                                <IndicadorRecarga ativo={recarregando} />
                            </div>
                            {etiquetas.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {etiquetas.map((e, i) => (
                                        <button key={`${i}-${e.rotulo}`} type="button" onClick={e.tirar}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-500/20">{e.rotulo} <X size={14} /></button>
                                    ))}
                                    <button type="button" onClick={clearAllFilters} className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300">limpar</button>
                                </div>
                            )}
                        </section>

                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setShowForm('receivable')} className={`${BOTAO_PRINCIPAL} h-11`}><ArrowDownLeft size={14} /> Novo a receber</button>
                            <button type="button" onClick={() => setShowForm('payable')} className={`${BOTAO_SECUNDARIO} h-11`}><ArrowUpRight size={14} /> Novo a pagar</button>
                        </div>

                        <section ref={listaRef} className="space-y-3">
                            <p className={ROTULO}>
                                {filtros.recorte ? ROTULO_DO_RECORTE[filtros.recorte] : ROTULO_DO_FILTRO[filtros.rapido]} · <span className="text-zinc-300">{lista.length} conta(s)</span>
                            </p>
                            {loading ? <p className={`${CARTAO} py-10 text-center text-sm text-zinc-500`}>Carregando…</p>
                            : lista.length === 0 ? <p className={`${CARTAO} py-10 text-center text-sm text-zinc-500`}>Nenhuma conta neste filtro.</p>
                            : emColunas ? (
                                <div className="grid gap-6 md:grid-cols-2">
                                    {(['receivable', 'payable'] as const).map(tipo => {
                                        const doTipo = lista.filter(o => o.type === tipo);
                                        return (
                                            <div key={tipo} className="min-w-0 space-y-2">
                                                <p className={`flex justify-between ${ROTULO}`}><span>{tipo === 'receivable' ? 'A receber' : 'A pagar'}</span>
                                                    <span className="tabular-nums text-zinc-300">{mostrar(somaDaLista(doTipo))}</span></p>
                                                {doTipo.length === 0 ? <p className={`${ITEM} p-4 text-sm text-zinc-500`}>Nada aqui.</p> : <div className="space-y-2">{doTipo.map(renderCard)}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : grupos.map((g, i) => (
                                <div key={`${g.titulo}-${i}`} className="space-y-2 pt-2">
                                    <p className={`flex justify-between ${ROTULO}`}><span>{g.titulo}</span>
                                        <span className="tabular-nums text-zinc-300">{mostrar(somaDaLista(g.contas))}</span></p>
                                    <div className="space-y-2">{g.contas.map(renderCard)}</div>
                                </div>
                            ))}
                            {numeros.emProducao.total > 0 && (
                                <p className="pt-2 text-xs text-zinc-500">{mostrar(numeros.emProducao.total)} de pedidos em produção esperam a entrega e não aparecem aqui · a entrada já aparece.</p>
                            )}
                        </section>
                    </div>

                    {/* ── RIGHT SIDEBAR ─────────────────────────────────────── */}
                    {/* Rolagem PROPRIA, separada da lista de lancamentos: so a partir de `lg`
                        (no celular as colunas viram uma e a pagina rola junto). */}
                    <aside className="space-y-3 lg:self-start lg:sticky lg:top-0 lg:max-h-[calc(100svh-9rem)] lg:overflow-y-auto">
                        <section className={`${CARTAO} p-4 space-y-2`}>
                            <div className="flex items-center justify-between">
                                <h2 className={`flex items-center gap-1.5 ${ROTULO}`}><Landmark size={12} className="text-zinc-600" /> Bancos</h2>
                                <MenuMais rotulo="Mais ações dos bancos" itens={[
                                    { rotulo: 'Gerenciar bancos', onClick: () => onGerenciarBancos?.() },
                                ]} />
                            </div>
                            <ul className="space-y-1">
                                {bancos.map(b => (
                                    <li key={b.id}>
                                        <button type="button" onClick={() => setBancoAberto(b.id)}
                                            className={`${ITEM} flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:border-zinc-700`}>
                                            <span className="min-w-0"><span className="block truncate text-sm text-zinc-200">{b.nome}</span>
                                                <span className={`block text-[10px] font-black uppercase tracking-widest ${b.aConferir.length ? 'text-amber-400' : 'text-emerald-500/80'}`}>{b.aConferir.length ? `${b.aConferir.length} a conferir` : '✓ conferido'}</span></span>
                                            <span className={`text-sm font-black font-mono tabular-nums ${b.saldo < 0 ? 'text-rose-400' : 'text-zinc-100'}`}>{mostrar(b.saldo)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className={`${CARTAO} p-4 space-y-3`}>
                            <div className="flex items-center justify-between">
                                <h2 className={`flex items-center gap-1.5 ${ROTULO}`}><PieChart size={12} className="text-zinc-600" /> Gastos de {mesDosGastos.slice(0, 4) === hoje.slice(0, 4) ? nomeDoMes(mesDosGastos).split(' ')[0] : nomeDoMes(mesDosGastos)}</h2>
                                <div className="flex items-center">
                                    <button type="button" aria-label="Mês anterior" onClick={() => setMesDosGastos(mesAnterior(mesDosGastos))} className="h-10 w-8 text-zinc-400 hover:text-white">‹</button>
                                    <button type="button" aria-label="Próximo mês" onClick={() => setMesDosGastos(proximoMes(mesDosGastos))} className="h-10 w-8 text-zinc-400 hover:text-white">›</button>
                                    <MenuMais rotulo="Mais ações das categorias" itens={[{ rotulo: 'Nova categoria', onClick: () => setShowCategoryQuickAdd(true) }]} />
                                </div>
                            </div>
                            {gastos.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma saída neste mês.</p> : gastos.map(f => {
                                const id = idPorNomeNormalizado.get(normalizeCategoryName(f.nome));
                                const semFiltro = f.nome === 'Outros' || f.nome === 'Sem categoria';
                                return (
                                    <button key={f.nome} type="button" disabled={!id && semFiltro}
                                        title={!id && f.nome === 'Outros' ? 'soma das categorias menores' : !id && semFiltro ? 'contas sem categoria' : undefined}
                                        onClick={() => { setFiltros({ ...FILTROS_VAZIOS, ...(id ? { categoriaId: id } : { busca: f.nome }), rapido: 'pagas' }); verALista(); }}
                                        className="block w-full space-y-1 text-left disabled:cursor-default">
                                        <span className="flex justify-between gap-2 text-sm"><span className="truncate text-zinc-300">{f.nome}</span><span className="tabular-nums text-zinc-300">{mostrar(f.valor)}</span></span>
                                        <span className="block h-1.5 rounded-full bg-zinc-800"><span className="block h-1.5 rounded-full bg-amber-500/70" style={{ width: `${Math.max(2, (f.valor / maiorGasto) * 100)}%` }} /></span>
                                    </button>
                                );
                            })}
                            <p className="text-[10px] font-bold text-zinc-600">o que saiu, pela data do pagamento · clique para ver todas as pagas da categoria</p>
                        </section>

                        <section className={`${CARTAO} p-4 space-y-2`}>
                            <h2 className={`flex items-center gap-1.5 ${ROTULO}`}><PiggyBank size={12} className="text-zinc-600" /> Caixinhas</h2>
                            <button type="button" onClick={() => onNavegar?.('envelopes')} className={`${ITEM} w-full px-3 py-2.5 text-left hover:border-zinc-700`}>
                                <span className="block text-sm font-black font-mono tabular-nums text-violet-400">{mostrar(numeros.nasCaixinhas)}</span>
                                <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-500">reservado em {envelopes.length} caixinha(s) · abrir</span>
                            </button>
                        </section>
                    </aside>
                </div>

            {/* Modals */}
            {painelAberto && createPortal(
                <div className="fixed inset-0 z-sobreposto flex justify-end">
                    <button type="button" tabIndex={-1} aria-label="Fechar filtros" className="absolute inset-0 bg-black/60" onClick={() => setPainelAberto(false)} />
                    <div ref={painelRef} role="dialog" aria-modal="true" aria-label="Filtros" className="relative h-full w-full max-w-sm overflow-y-auto bg-zinc-950 border-l border-zinc-800 p-5 space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">Filtros</h2>
                            <button type="button" onClick={() => setPainelAberto(false)} className="h-10 w-10 rounded-lg text-zinc-400 hover:bg-zinc-900" aria-label="Fechar">✕</button>
                        </div>
                        <label className="block space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tipo</span>
                            <select value={filtros.tipo} onChange={e => mudar({ tipo: e.target.value as FiltrosDaLista['tipo'] })} className={campo}>
                                <option value="ambos">Pagar e receber</option><option value="receivable">A receber</option><option value="payable">A pagar</option>
                            </select></label>
                        <div className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Mês do vencimento</span>
                            <div className="flex items-center gap-2">
                                <button type="button" aria-label="Mês anterior" onClick={() => mudar({ mes: mesAnterior(filtros.mes ?? mesDe(hoje)) })} className="h-10 w-10 rounded-lg border border-zinc-800 text-zinc-300">‹</button>
                                <span className="flex-1 text-center text-sm text-zinc-200">{filtros.mes ? nomeDoMes(filtros.mes) : 'Todos os meses'}</span>
                                <button type="button" aria-label="Próximo mês" onClick={() => mudar({ mes: proximoMes(filtros.mes ?? mesDe(hoje)) })} className="h-10 w-10 rounded-lg border border-zinc-800 text-zinc-300">›</button>
                            </div>
                            {filtros.mes && <button type="button" onClick={() => mudar({ mes: null })} className="text-xs text-zinc-500 underline">todos os meses</button>}
                        </div>
                        <label className="block space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Cliente ou fornecedor</span>
                            <SearchableSelect value={filtros.clienteId ?? ''} onChange={v => mudar({ clienteId: v || null })}
                                options={[{ value: '', label: 'Todos' },
                                    ...clients.map(c => ({ value: c.id, label: c.company_name })),
                                    ...suppliers.map(f => ({ value: f.id, label: `${f.company_name} (fornecedor)` }))]}
                                placeholder="Todos" className="w-full" /></label>
                        <label className="block space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Categoria</span>
                            <select value={filtros.categoriaId ?? ''} onChange={e => mudar({ categoriaId: e.target.value || null })} className={campo}>
                                <option value="">Todas</option>{globalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select></label>
                        <label className="block space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Banco</span>
                            <select value={filtros.bancoId ?? ''} onChange={e => mudar({ bancoId: e.target.value || null })} className={campo}>
                                <option value="">Todos</option>{contasDoFiltro.map(b => <option key={b.id} value={b.id}>{b.is_active ? b.name : `${b.name} (inativa)`}</option>)}
                            </select></label>
                        <div className="space-y-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Mostrar</span>
                            <div className="flex flex-wrap gap-2">
                                {FILTROS_NO_PAINEL.map(f => (
                                    <button key={f} type="button" onClick={() => mudar({ rapido: f })} aria-pressed={filtros.rapido === f}
                                        className={pilula(filtros.rapido === f)}>{ROTULO_DO_FILTRO[f]}</button>
                                ))}
                            </div></div>
                        <label className="flex items-center gap-3 text-sm text-zinc-300">
                            <input type="checkbox" checked={emColunas} onChange={e => setEmColunas(e.target.checked)} className="h-4 w-4" />
                            Ver em colunas (a receber | a pagar)</label>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={clearAllFilters} className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300">Limpar</button>
                            <button type="button" onClick={() => setPainelAberto(false)} className="h-10 flex-1 rounded-xl bg-amber-500 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-400">Ver {lista.length} conta(s)</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* UNDO RECONCILIATION MODAL */}
            {reconciliationUndoTarget && createPortal(
                <div className="fixed inset-0 bg-black/80 z-sobreposto flex items-center justify-center p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center shrink-0">
                            <h3 className="text-sm font-black uppercase tracking-widest text-white">Desfazer conciliação</h3>
                            <button onClick={() => setReconciliationUndoTarget(null)} aria-label="Fechar" className="p-2 text-zinc-500 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto space-y-4">
                            <p className="text-sm text-zinc-400">
                                Você está prestes a desfazer a conciliação automática do lançamento <strong className="text-white">{reconciliationUndoTarget.description}</strong>.
                                Por questões de auditoria, essa ação requer uma justificativa obrigatória e registrará a justificativa para desfazer a conciliação.
                            </p>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5">Motivo / justificativa (obrigatório)</label>
                                <textarea
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-600 text-sm h-32 resize-none"
                                    placeholder="Ex: Valor incorreto, duplicidade..."
                                    value={undoReason}
                                    onChange={e => setUndoReason(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-zinc-800 flex gap-2 justify-end items-center shrink-0">
                            <button onClick={() => setReconciliationUndoTarget(null)} className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">Cancelar</button>
                            <button
                                onClick={handleUndoReconcileSubmit}
                                disabled={!undoReason.trim() || isGlobalLoading}
                                className="h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                                {isGlobalLoading ? <Loader2 className="animate-spin" size={16} /> : 'Desfazer conferência'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* TODAS as contas, e não só as ativas.
                O modal já filtra por `is_active` onde importa — no seletor da baixa
                nova, e o hook ao escolher a conta padrão. Mas o HISTÓRICO precisa
                nomear pagamentos antigos, e esses podem ter saído de uma conta que
                depois foi inativada. Com a lista filtrada, a linha do histórico
                dizia "conta removida" para uma conta que existe — inventando um
                problema onde não havia nenhum. Por isso `todasAsContas`, e não
                `bankAccounts` (que aqui é só das ativas). */}
            {payingOb && (
                <PaymentModal obligation={payingOb} bankAccounts={todasAsContas.length ? todasAsContas : bankAccounts} existingPayments={payingObPayments}
                    isPrivacy={isPrivacy} onClose={() => setPayingOb(null)}
                    onSuccess={() => { setPayingOb(null); showAlert('Pagamento registrado!'); loadData(); }}
                    onRefresh={() => loadData()}
                    onReversePayment={handleReversePayment} />
            )}

            {baixa && (
                <JanelaDeBaixa conta={baixa} bancos={bankAccounts} caixinhas={envelopes}
                    bancoInicial={bancoSugerido({ pagamentos: payments, contas: obligations, tipo: baixa.type, bancosAtivos: bankAccounts.filter(b => b.is_active) })}
                    onMaisOpcoes={() => { const c = baixa; setBaixa(null); void handleOpenPay(c); }}
                    onFechar={() => setBaixa(null)}
                    onConcluido={() => { setBaixa(null); void loadData(); }} />
            )}

            {bancoAberto && (() => { const b = bancos.find(x => x.id === bancoAberto); return b ? (
                <JanelaConferirBanco banco={b} contas={obligations} onFechar={() => setBancoAberto(null)} onAlterado={() => void loadData()} />
            ) : null; })()}

            {conciliarAlvo && (
                <ConfirmarOperacao
                    operacaoId={conciliarAlvo.is_reconciled ? 'desfazer-conciliacao' : 'conciliar'}
                    alvo={conciliarAlvo.description}
                    detalhe={
                        <>
                            {conciliarAlvo.type === 'receivable' ? 'A receber' : 'A pagar'}
                            {' · '}
                            <strong className="text-white">{mostrar(Number(conciliarAlvo.original_amount) || 0)}</strong>
                        </>
                    }
                    onConfirmar={confirmarConciliacao}
                    onCancelar={() => setConciliarAlvo(null)}
                />
            )}

            {contaEmEdicao && (
                <EditarContaModal
                    conta={contaEmEdicao}
                    todas={obligations}
                    onClose={() => setContaEmEdicao(null)}
                    onSaved={() => { showAlert('Conta atualizada', 'success'); loadData(); }}
                />
            )}

            {showForm && (
                <ObligationForm type={showForm} clients={clients} suppliers={suppliers}
                    bankAccounts={bankAccounts.filter(a => a.is_active)} globalCategories={globalCategories} enxuto
                    payments={payments} obligations={obligations} onClose={() => setShowForm(null)}
                    onAddClient={() => setShowQuickCreate('client')}
                    onAddSupplier={() => setShowQuickCreate('supplier')}
                    onRefreshCategories={() => loadData()}
                    onSuccess={() => { setShowForm(null); showAlert('Lançamento criado!'); loadData(); }} />
            )}

            {/* Janelas que abrem POR CIMA do formulário (R11): em portal no body e
                depois dele no DOM. Inline, ficariam presas no z-10 do conteúdo e
                abririam atrás do formulário, que já está em portal. */}
            {showCategoryQuickAdd && createPortal(
                <GlobalCategoryQuickAdd
                    isOpen={showCategoryQuickAdd}
                    domain="finance"
                    onClose={() => setShowCategoryQuickAdd(false)}
                    onCreated={() => {
                        setShowCategoryQuickAdd(false);
                        showAlert('Categoria criada!', 'success');
                        loadData();
                    }}
                />,
                document.body,
            )}

            {showQuickCreate && createPortal(
                <QuickCreateModal
                    type={showQuickCreate}
                    isOpen={!!showQuickCreate}
                    onClose={() => setShowQuickCreate(null)}
                    onSuccess={handleQuickCreateSuccess}
                />,
                document.body,
            )}

            {/* As operacoes com descricao no registro passam pela caixa
                que diz o que faz, o que custa e se da para voltar. */}
            {confirmTarget && (
                <ConfirmarOperacao
                    operacaoId={OPERACAO_DO_CONFIRM[confirmTarget.type]}
                    alvo={confirmTarget.alvo}
                    onConfirmar={executeConfirm}
                    onCancelar={() => setConfirmTarget(null)}
                />
            )}

            {/* Aviso em portal: no z-10 do conteúdo ficava escondido sob as janelas. */}
        </div>
    );
}

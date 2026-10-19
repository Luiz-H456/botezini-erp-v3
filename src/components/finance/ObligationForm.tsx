// ObligationForm — formulário de conta a pagar/receber.
//
// Movido de pages/FinanceComponents.tsx, que era um monólito legado onde este
// arquivo apenas re-exportava o componente. O monólito guardava cópias mortas de
// componentes que já viviam aqui em components/finance/ — editar o arquivo errado
// era só questão de tempo.
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Plus } from 'lucide-react';
import type {
    BankAccount, Client, Supplier, ObligationType, GlobalCategory, ObligationSummary, ObligationPayment, PaymentMethod
} from '@/types';
import { useObligationForm } from '@/hooks/finance/useObligationForm';
import { parseBRL } from '@/utils/currency';
import { formatCurrency } from '@/utils';
import { meioMaisUsado } from '@/utils/financas/meioDePagamento';
import { GlobalCategoryQuickAdd } from '@/components/modals';
import { ConfirmarLiquidacao } from './ConfirmarLiquidacao';
import SearchableSelect from '@/components/common/SearchableSelect';
import { SETOR } from '@/components/masterdata/setoresDeCategoria';
import { AtalhosDeCategoria } from '@/components/masterdata/AtalhosDeCategoria';
import {
    agruparPorCategoria, agruparPorTipo, opcoesDeCategoria, TIPO_DE_CONTA,
} from '@/utils/opcoesAgrupadas';

/** Meios oferecidos em "Já foi pago?"; os valores são os que `method` grava no pagamento. */
const MEIOS_DA_BAIXA: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'PIX', label: 'PIX' }, { value: 'Boleto', label: 'Boleto' }, { value: 'Cartão', label: 'Cartão' },
    { value: 'TED', label: 'Transferência' }, { value: 'Dinheiro', label: 'Dinheiro' },
];
const VALORES_DOS_MEIOS = MEIOS_DA_BAIXA.map(m => m.value);

interface ObligationFormProps {
    type: ObligationType;
    clients: Client[];
    suppliers: Supplier[];
    bankAccounts: BankAccount[];
    globalCategories: GlobalCategory[];
    onClose: () => void;
    onSuccess: () => void;
    onAddSupplier?: () => void;
    onAddClient?: () => void;
    onRefreshCategories?: () => void;
    /** v3: básico à vista; modos, observações e divisão em "mais opções". */
    enxuto?: boolean;
    /** Histórico para sugerir o meio de pagamento do fornecedor ou cliente. */
    payments?: ObligationPayment[];
    obligations?: ObligationSummary[];
}
export function ObligationForm({ type, clients, suppliers, bankAccounts, globalCategories, onClose, onSuccess, onAddSupplier, onAddClient, onRefreshCategories, enxuto = false, payments = [], obligations = [] }: ObligationFormProps) {
    const [showCategoryAdd, setShowCategoryAdd] = useState(false);
    /**
     * Confirmação pendente antes de liquidar.
     *
     * Só entra no caminho quando "já foi pago" está ligado: aí o salvar mexe no
     * saldo do banco na hora, e o erro de digitar um zero a mais custa uma
     * caçada pelo estorno. Lançamento comum continua salvando direto — pedir
     * confirmação para o que é reversível só ensina a clicar sem ler.
     */
    const [confirmando, setConfirmando] = useState(false);
    const [maisOpcoes, setMaisOpcoes] = useState(!enxuto);

    const {
        mode, setMode,
        description, setDescription,
        amount, setAmount,
        due_date, setDueDate,
        setCategory,
        client_id,
        supplier_id,
        account_id, setAccountId,
        notes, setNotes,
        months, setMonths,
        installments, setInstallments,
        setGlobalCategoryId,
        categorySuggested, setCategorySuggested,
        saving,
        error,
        isSplit, setIsSplit,
        splits, setSplits,
        isAlreadyPaid, setIsAlreadyPaid,
        globalCategoryId,
        paymentMethod, setPaymentMethod,

        parsedAmount,
        canSubmit,

        handleSupplierChange,
        handleClientChange,
        handleSubmit
    } = useObligationForm(type, onSuccess, globalCategories);

    // Initial value
    useEffect(() => {
        if (!account_id && bankAccounts.length > 0) {
            setAccountId(bankAccounts.find(a => a.is_active)?.id || '');
        }
    }, [bankAccounts, account_id, setAccountId]);

    // O meio vem do histórico do parceiro; sem histórico fica vazio. O padrão
    // do cadastro do fornecedor (aplicado pelo hook) tem prioridade.
    const parceiroId = type === 'payable' ? supplier_id : client_id;
    const contaPorId = useMemo(() => new Map(obligations.map(o => [o.id, o])), [obligations]);
    useEffect(() => {
        if (type === 'payable' && suppliers.find(s => s.id === supplier_id)?.default_planned_method) return;
        setPaymentMethod((meioMaisUsado(payments, contaPorId, parceiroId, VALORES_DOS_MEIOS) ?? '') as PaymentMethod | '');
        // só quando troca o parceiro: o histórico recarregando não pode apagar a escolha do usuário
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parceiroId]);
    // Meio fora da lista (padrão do fornecedor: DOC, Cheque) continua selecionável.
    const opcoesDeMeio = paymentMethod && !VALORES_DOS_MEIOS.includes(paymentMethod)
        ? [...MEIOS_DA_BAIXA, { value: paymentMethod, label: paymentMethod }]
        : MEIOS_DA_BAIXA;

    const activeBanks = bankAccounts.filter(a => a.is_active);

    const inputCls = "w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-zinc-500 placeholder-zinc-600 transition-colors";
    const labelCls = "text-xs text-zinc-500 block mb-1.5";

    // ─── Opções dos dropdowns ────────────────────────────────────────────────
    //
    // Todas com divisória: cliente e fornecedor pelo ramo, conta pelo tipo,
    // categoria pelo grupo. Numa lista de dezenas de nomes a
    // divisória é o que separa procurar de varrer — e o campo fechado passa a
    // mostrar o grupo acima do valor, para conferência.
    const clientOptions = useMemo(
        () => agruparPorCategoria(clients, c => c.company_name, globalCategories),
        [clients, globalCategories]);

    const supplierOptions = useMemo(
        () => agruparPorCategoria(suppliers, s => s.company_name, globalCategories),
        [suppliers, globalCategories]);

    const categoryOptions = useMemo(
        () => opcoesDeCategoria(globalCategories, 'finance', globalCategoryId),
        [globalCategories, globalCategoryId]);

    const handleCategoryChange = (catId: string) => {
        const found = globalCategories.find(c => c.id === catId);
        if (found) {
            setCategory(found.name);
            setGlobalCategoryId(found.id);
            setCategorySuggested(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-modal" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm ease-out animate-in fade-in duration-200" />
            {/* Drawer */}
            <div
                className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col ease-out animate-in slide-in-from-right duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
                    <div>
                        <p className="text-xs text-zinc-500">{type === 'receivable' ? 'Novo recebimento' : 'Novo pagamento'}</p>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white leading-tight">Novo lançamento</h3>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {maisOpcoes && (
                    <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
                        {([['once', 'Unico'], ['installments', 'Parcelado'], ['recurring', 'Recorrente']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setMode(val)} className={`flex-1 h-9 rounded-md text-sm transition-all ${mode === val ? 'bg-zinc-800 text-white border border-zinc-600 font-semibold' : 'border border-transparent text-zinc-400 hover:text-zinc-200'}`}>{label}</button>
                        ))}
                    </div>
                    )}
                    <div>
                        <label className={labelCls}>Descrição *</label>
                        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Aluguel escritorio, Fatura ABC..." className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Valor {mode === 'installments' ? '(por parcela)' : ''} *</label>
                            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">R$</span>
                                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ''))} placeholder="0,00" className={`${inputCls} pl-9`} /></div>
                        </div>
                        <div>
                            <label className={labelCls}>{mode === 'recurring' ? 'Primeiro vencimento' : 'Vencimento'} *</label>
                            <input type="date" value={due_date} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    {mode === 'installments' && (
                        <div className="space-y-2">
                            <label className={labelCls}>Número de parcelas</label>
                            <input type="number" min="2" max="360" value={installments} onChange={e => setInstallments(e.target.value)} className={inputCls} />
                            {parsedAmount > 0 && parseInt(installments) > 1 && (
                                <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-2">
                                    <p className="text-xs text-zinc-500">Prévia das parcelas</p>
                                    <p className="text-xs text-zinc-200">Total: {formatCurrency(parsedAmount * parseInt(installments))} — {installments}x de {formatCurrency(parsedAmount)}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {Array.from({ length: Math.min(parseInt(installments) || 0, 4) }).map((_, i) => {
                                            const d = new Date(due_date + 'T12:00:00');
                                            d.setDate(1);
                                            d.setMonth(d.getMonth() + i);
                                            const origDay = parseInt(due_date.split('-')[2]);
                                            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                                            d.setDate(Math.min(origDay, lastDay));
                                            const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                            return (
                                                <span key={i} className="flex items-center gap-1 bg-zinc-800/80 border border-zinc-700/50 px-2 py-1 rounded-lg text-xs text-zinc-300">
                                                    <span className="text-zinc-600 text-[10px]">{i + 1}</span>
                                                    {label}
                                                </span>
                                            );
                                        })}
                                        {parseInt(installments) > 4 && (
                                            <span className="flex items-center px-2 py-1 text-xs text-zinc-600">+{parseInt(installments) - 4} mais</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {mode === 'recurring' && (
                        <div className="space-y-2">
                            <label className={labelCls}>Duração (meses)</label>
                            <input type="number" min="1" max="120" value={months} onChange={e => setMonths(e.target.value)} className={inputCls} />
                            <div className={`rounded-lg p-3 border text-xs ${
                                parseInt(months) > 24
                                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                    : 'bg-zinc-900/50 border-zinc-800 text-zinc-500'
                            }`}>
                                {parseInt(months) > 24 && <span className="mr-1">⚠️</span>}
                                Geração de <span className="text-white">{months}</span> lançamentos mensais
                                {parsedAmount > 0 && <> — Total: <span className="text-zinc-200">{formatCurrency(parsedAmount * (parseInt(months) || 0))}</span></>}
                            </div>
                        </div>
                    )}
                    <div className="space-y-4">
                        {type === 'payable' && suppliers.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className={labelCls}>Fornecedor *</label>
                                    <button type="button" onClick={onAddSupplier} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors">
                                        <Plus size={12} /> Cadastro rápido
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={supplierOptions}
                                    value={supplier_id}
                                    onChange={(id) => handleSupplierChange(id, suppliers)}
                                    placeholder="Selecione o fornecedor"
                                />
                            </div>
                        )}

                        {type === 'receivable' && clients.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className={labelCls}>Cliente *</label>
                                    <button type="button" onClick={onAddClient} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors">
                                        <Plus size={12} /> Cadastro rápido
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={clientOptions}
                                    value={client_id}
                                    onChange={(id) => handleClientChange(id, clients)}
                                    placeholder="Selecione o cliente"
                                />
                            </div>
                        )}

                        {/* O centro de custo saiu daqui. Era preenchido em todo
                            lançamento e alimentava um único `if` do painel antigo —
                            nenhum relatório somava por ele, e a lista de
                            categorias que ele guardava dentro não era lida por
                            lugar nenhum. Quem responde "isto é custo do produto?"
                            agora é a marca CPV na própria categoria, respondida
                            uma vez por categoria em vez de uma vez por conta. */}
                        {!isSplit ? (
                            <div className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className={`${labelCls} flex items-center gap-2`}>
                                            Categoria *
                                            {categorySuggested && (
                                                <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded-full">
                                                    Sugerido
                                                </span>
                                            )}
                                        </label>
                                        <div className="flex items-center gap-3">
                                            {!enxuto && (
                                                <button onClick={() => setIsSplit(true)} className="text-xs text-zinc-400 hover:text-white">＋ Dividir</button>
                                            )}
                                            <button type="button" onClick={() => setShowCategoryAdd(true)} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors">
                                                <Plus size={12} /> Nova categoria
                                            </button>
                                        </div>
                                    </div>
                                    <SearchableSelect
                                        options={categoryOptions}
                                        value={globalCategoryId}
                                        onChange={handleCategoryChange}
                                        placeholder="Selecione a categoria..."
                                    />
                                    <p className="text-xs text-zinc-600 leading-relaxed">
                                        {SETOR.finance.paraQue} A marca de custo fixo e de CPV mora na categoria,
                                        então escolher a certa é o que faz esses números fecharem.
                                    </p>
                                    <AtalhosDeCategoria
                                        opcoes={categoryOptions}
                                        valor={globalCategoryId}
                                        onEscolher={handleCategoryChange}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <label className={labelCls}>Divisão de custos</label>
                                    <button onClick={() => setIsSplit(false)} className="text-xs text-zinc-400 hover:text-white">Voltar ao simples</button>
                                </div>
                                {splits.map((s, idx) => (
                                    <div key={idx} className="grid grid-cols-[100px_1fr_1fr_32px] gap-2 items-end">
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Valor</label>
                                            <input value={s.amount} onChange={e => {
                                                const newS = [...splits];
                                                newS[idx].amount = e.target.value.replace(/[^0-9,]/g, '');
                                                setSplits(newS);
                                            }} placeholder="0,00" className={`${inputCls} px-2`} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Categ.</label>
                                            {/* Escolhe pelo id, como o campo principal. Escolher
                                                pelo NOME, que era o que havia aqui, casava a
                                                categoria errada quando dois grupos tinham uma
                                                filha de mesmo nome. */}
                                            <SearchableSelect
                                                value={s.globalCategoryId || ''}
                                                onChange={val => {
                                                    const newS = [...splits];
                                                    newS[idx].globalCategoryId = val;
                                                    newS[idx].category = globalCategories.find(c => c.id === val)?.name || '';
                                                    setSplits(newS);
                                                }}
                                                options={opcoesDeCategoria(globalCategories, 'finance', s.globalCategoryId)}
                                                placeholder="..."
                                            />
                                        </div>
                                        <button onClick={() => setSplits(splits.filter((_, i) => i !== idx))} className="p-2 text-zinc-600 hover:text-rose-400 h-10" aria-label="Remover linha">
                                            <Ban size={14} />
                                        </button>
                                    </div>
                                ))}
                                <button onClick={() => setSplits([...splits, { amount: '', category: '', costCenterId: '' }])}
                                    className="w-full h-10 border border-dashed border-zinc-700 rounded-lg text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-all">
                                    ＋ Adicionar linha
                                </button>
                                <div className="pt-2 flex justify-between items-center border-t border-zinc-800">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total das divisões</span>
                                    <span className={`text-xs tabular-nums ${Math.abs(splits.reduce((sum, s) => sum + parseBRL(s.amount), 0) - parsedAmount) < 0.01 ? 'text-zinc-200' : 'text-amber-400'}`}>
                                        {formatCurrency(splits.reduce((sum, s) => sum + parseBRL(s.amount), 0))} / {formatCurrency(parsedAmount)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {showCategoryAdd && createPortal(
                        <GlobalCategoryQuickAdd
                            isOpen={showCategoryAdd}
                            domain="finance"
                            onClose={() => setShowCategoryAdd(false)}
                            onCreated={(newCat) => {
                                setCategory(newCat.name);
                                setGlobalCategoryId(newCat.id);
                                setShowCategoryAdd(false);
                                onRefreshCategories?.();
                            }}
                        />,
                        document.body,
                    )}

                    {activeBanks.length > 0 && (
                        <div>
                            <label className={labelCls}>Conta bancária
                                <span className="text-zinc-600 ml-1">(para este lançamento)</span>
                            </label>

                            {activeBanks.length <= 4 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {activeBanks.map(a => (
                                        <button
                                            key={a.id}
                                            onClick={() => setAccountId(a.id)}
                                            className={`py-2.5 px-2 flex flex-col items-center justify-center rounded-lg border text-sm transition-all ${
                                                account_id === a.id
                                                    ? 'bg-zinc-800 border-zinc-600 text-white font-semibold'
                                                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                                            }`}
                                        >
                                            <span className="truncate w-full text-center px-1">{a.name}</span>
                                            <span className={"text-xs mt-0.5 tabular-nums text-zinc-400"}>{formatCurrency(a.current_balance)}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <SearchableSelect
                                    value={account_id}
                                    onChange={setAccountId}
                                    options={agruparPorTipo(
                                        activeBanks,
                                        a => `${a.name} — ${formatCurrency(a.current_balance)}`,
                                        a => a.type,
                                        TIPO_DE_CONTA,
                                    )}
                                    placeholder="Conta..."
                                />
                            )}
                        </div>
                    )}
                    {enxuto && !maisOpcoes && (
                        <button type="button" onClick={() => setMaisOpcoes(true)}
                            className="text-sm text-zinc-400 hover:text-white text-left">
                            + mais opções: parcelas · repetir todo mês · observações
                        </button>
                    )}
                    {maisOpcoes && (
                    <div>
                        <label className={labelCls}>Observações</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" className={inputCls} />
                    </div>
                    )}

                    {mode === 'once' && (
                        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg mt-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm text-zinc-200">{type === 'payable' ? 'Já foi pago?' : 'Já foi recebido?'}</p>
                                    <p className="text-xs text-zinc-500 leading-tight mt-0.5 max-w-[220px]">Debita/Credita o caixa imediatamente ao salvar.</p>
                                </div>
                                <button
                                    onClick={() => setIsAlreadyPaid(!isAlreadyPaid)}
                                    role="switch" aria-checked={isAlreadyPaid} aria-label={type === 'payable' ? 'Já foi pago' : 'Já foi recebido'}
                                    className={`relative w-12 h-6 shrink-0 rounded-full transition-colors ${isAlreadyPaid ? 'bg-amber-500' : 'bg-zinc-800'}`}
                                >
                                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform ${isAlreadyPaid ? 'bg-zinc-950 translate-x-6' : 'bg-zinc-400 translate-x-0'}`} />
                                </button>
                            </div>
                            {isAlreadyPaid && (
                                <div className="mt-3">
                                    <label className={labelCls}>Meio de pagamento</label>
                                    <SearchableSelect
                                        value={paymentMethod}
                                        onChange={(v) => setPaymentMethod(v as PaymentMethod | '')}
                                        options={opcoesDeMeio}
                                        placeholder="Escolha o meio..."
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {error && <p role="alert" className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">{error}</p>}

                    {/* M5: Block submit when split totals don't match */}
                    {isSplit && parsedAmount > 0 && Math.abs(splits.reduce((sum, s) => sum + parseBRL(s.amount), 0) - parsedAmount) >= 0.01 && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 flex items-center gap-2 mt-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            <p className="text-xs text-amber-400">Soma das divisões não corresponde ao valor total. Ajuste antes de salvar.</p>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={() => (isAlreadyPaid && mode === 'once' ? setConfirmando(true) : handleSubmit())}
                            disabled={!canSubmit || saving || (isSplit && parsedAmount > 0 && Math.abs(splits.reduce((sum, s) => sum + parseBRL(s.amount), 0) - parsedAmount) >= 0.01)}
                            className="w-full h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40 transition-colors">
                            {saving
                                ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/><path d="M21 12a9 9 0 00-9-9"/></svg> Salvando...</span>
                                : mode === 'recurring'
                                ? `Gerar ${months} lançamentos`
                                : mode === 'installments'
                                ? `Criar ${installments}x de ${formatCurrency(parsedAmount)}`
                                : isAlreadyPaid ? 'Revisar e liquidar' : 'Criar lançamento'
                            }
                        </button>
                    </div>
                </div>
            </div>

            {confirmando && (
                <ConfirmarLiquidacao
                    tipo={type}
                    descricao={description.trim()}
                    valor={parsedAmount}
                    parte={type === 'payable'
                        ? suppliers.find(s => s.id === supplier_id)?.company_name
                        : clients.find(c => c.id === client_id)?.company_name}
                    categoria={globalCategories.find(c => c.id === globalCategoryId)?.name}
                    dataDoPagamento={due_date}
                    meio={String(paymentMethod)}
                    conta={bankAccounts.find(a => a.id === account_id)}
                    onCancelar={() => setConfirmando(false)}
                    onConfirmar={async () => {
                        setConfirmando(false);
                        await handleSubmit();
                    }}
                />
            )}
        </div>,
        document.body,
    );
}

import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { Paperclip, Eye, RotateCcw, Check } from 'lucide-react';
import { ObligationSummary, ObligationPayment, BankAccount, PaymentMethod } from '@/types';
import { PAYMENT_METHODS } from '@/utils/constants';
import { usePaymentModal } from '@/hooks/finance/usePaymentModal';
import { InfoTooltip } from '@/components/common';
import { formatCurrency } from '@/utils';
import { ProgressBar } from './ui';
import { AttachmentViewer } from './AttachmentViewer';
import { ConfirmModal } from './ConfirmModal';
import { SearchableSelect } from '@/components/common';
import { agruparPorTipo, TIPO_DE_CONTA } from '@/utils/opcoesAgrupadas';

interface PaymentModalProps {
    obligation: ObligationSummary;
    bankAccounts: BankAccount[];
    existingPayments: ObligationPayment[];
    isPrivacy: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onRefresh?: () => void;
    onReversePayment: (paymentId: string) => void;
}

export function PaymentModal({ obligation: ob, bankAccounts, existingPayments, isPrivacy, onClose, onSuccess, onRefresh, onReversePayment }: PaymentModalProps) {
    const valor = (n: number) => (isPrivacy ? '••••' : formatCurrency(n));
    /**
     * O nome da conta que foi movimentada, para cada linha do histórico.
     *
     * Sem isto a linha dizia só "PIX · 03/09", e ninguém consegue conferir um
     * extrato bancário com isso: o mesmo PIX do mesmo dia pode ter saído do
     * Nubank ou do cofre, e é justamente essa a pergunta de quem confere.
     *
     * Conta apagada não vira espaço em branco. O histórico é registro do que
     * aconteceu, e "saiu de uma conta que não existe mais" é informação; um
     * vazio parece campo que ninguém preencheu.
     *
     * CUIDADO COM A LISTA QUE CHEGA AQUI. Ela precisa conter as contas
     * INATIVAS também. Na primeira versão a tela passava só as ativas — a
     * mesma lista que alimenta o seletor da baixa nova —, e o histórico
     * passou a chamar de "conta removida" toda conta que tivesse sido
     * inativada depois do pagamento. A conta existe; a etiqueta é que mentia,
     * e inventava um problema onde não havia nenhum.
     */
    const nomeDaConta = useMemo(() => {
        const porId = new Map(bankAccounts.map(c => [c.id, c.name]));
        return (id?: string | null) => (id ? (porId.get(id) ?? 'conta removida') : 'sem conta');
    }, [bankAccounts]);
    const {
        amount, setAmount,
        account_id, setAccountId,
        method, setMethod,
        date, setDate,
        notes, setNotes,
        saving,
        error,
        successMsg,
        previewPath, setPreviewPath,
        obAttachments,
        updatingOb,
        pendingFile, setPendingFile,
        confirmDeleteIdx, setConfirmDeleteIdx,

        parsedAmount,
        canSubmit,
        activePayments,
        settlementMode,
        surplusDelta,
        isDiscountClose, setIsDiscountClose,
        motivoDoAjuste, setMotivoDoAjuste,
        isInformational, setIsInformational,

        handleSubmit,
        handleViewFile,
        handleFileSelect,
        handleConfirmUpload,
        handleDeleteAttachment
    } = usePaymentModal(ob, bankAccounts, existingPayments, onSuccess, onRefresh);

    return createPortal(
        // Altura travada no viewport e rolagem por dentro. Sem isto o modal
        // crescia com o conteúdo — anexos, avisos de desconto, histórico — e em
        // tela pequena o botão de confirmar ficava fora da janela, sem barra
        // nenhuma para alcançá-lo. Mais largo (4xl) porque as duas colunas em
        // 672px viravam duas colunas espremidas.
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-modal p-3 sm:p-4 backdrop-blur-sm ease-out animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[92vh] shadow-2xl ease-out animate-in slide-in-from-bottom-2 duration-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

                {/* Cabeçalho: shrink-0 para não ser comprimido pelo corpo rolável */}
                <div className="shrink-0 px-6 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs text-zinc-500 mb-1">
                            {ob.type === 'receivable' ? 'Registrar recebimento' : 'Registrar pagamento'}
                        </p>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white truncate">{ob.description}</h3>
                        <div className="flex items-center gap-x-4 gap-y-1 mt-2 flex-wrap text-xs text-zinc-500">
                            <span>Total <span className="text-zinc-300 tabular-nums">{isPrivacy ? '••••' : formatCurrency(ob.original_amount)}</span></span>
                            <span>Pago <span className="text-zinc-300 tabular-nums">{isPrivacy ? '••••' : formatCurrency(ob.paid_amount)}</span></span>
                            <span>Restante <span className="text-zinc-200 font-semibold tabular-nums">{isPrivacy ? '••••' : formatCurrency(ob.remaining_amount)}</span></span>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="shrink-0 h-10 w-10 text-zinc-500 hover:text-white transition-colors border border-zinc-800 rounded-lg">✕</button>
                </div>

                {/* Corpo. min-h-0 é o que deixa o filho de flex encolher abaixo do
                    próprio conteúdo — sem ele o overflow-y-auto nunca ativa.
                    No celular rola o corpo inteiro; no desktop cada coluna rola
                    sozinha, para o histórico não empurrar o formulário. */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row md:divide-x divide-y md:divide-y-0 divide-zinc-800 custom-scrollbar">
                    {/* Form */}
                    <div className="w-full md:flex-1 md:min-h-0 md:overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Valor</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">R$</span>
                                    <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9,]/g, ''))}
                                        className={`w-full h-10 bg-zinc-950 border rounded-lg pl-9 pr-3 text-sm text-white tabular-nums focus:outline-none transition-colors placeholder:text-zinc-700 ${
                                            settlementMode === 'discount'
                                                ? 'border-amber-500/60 focus:border-amber-400'
                                                : 'border-zinc-800 focus:border-zinc-500'
                                        }`} placeholder="0,00" />
                                </div>
                            </div>
                            {/* Settlement mode feedback & toggles */}
                            {parsedAmount > 0 && parsedAmount < ob.remaining_amount && (
                                <div className={`flex items-center gap-3 mt-3 p-3 rounded-lg border transition-all cursor-pointer ${isDiscountClose ? 'bg-zinc-900 border-zinc-600' : 'bg-zinc-950 border-zinc-800'}`} onClick={() => setIsDiscountClose(!isDiscountClose)}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${isDiscountClose ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-600 bg-zinc-950'}`}>
                                        {isDiscountClose && <Check size={12} strokeWidth={4} />}
                                    </div>
                                    <div>
                                        <p className="text-sm text-zinc-200">Baixa com desconto</p>
                                        <p className="text-xs text-zinc-500">
                                            Marcando isto, a conta é liquidada e a diferença fica gravada como desconto — não sobra
                                            saldo a receber. Sem marcar, é pagamento parcial e a conta continua aberta.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Motivo do ajuste: sem ele, daqui a seis meses ninguém
                                sabe por que aquela conta fechou por menos. */}
                            {settlementMode !== 'normal' && (
                                <div className="mt-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
                                        Motivo {settlementMode === 'discount' ? 'do desconto' : 'do acréscimo'} (opcional)
                                    </label>
                                    <input
                                        value={motivoDoAjuste}
                                        onChange={e => setMotivoDoAjuste(e.target.value)}
                                        placeholder={settlementMode === 'discount' ? 'Ex.: desconto combinado por antecipação' : 'Ex.: juros de 12 dias de atraso'}
                                        className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white outline-none focus:border-zinc-500 placeholder:text-zinc-700"
                                    />
                                </div>
                            )}

                            {settlementMode === 'surplus' && parsedAmount > 0 && (
                                <p className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                                    Acréscimo de {valor(surplusDelta)} acima do saldo — normalmente juros ou multa por atraso.
                                    O valor inteiro entra no caixa, mas só {valor(ob.remaining_amount)} amortiza a dívida:
                                    o excedente é receita, não abatimento.
                                </p>
                            )}
                            {settlementMode === 'discount' && parsedAmount > 0 && (
                                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                                    Confirmando a baixa, a conta será liquidada em {valor(parsedAmount)} (desconto permanente de {valor(ob.remaining_amount - parsedAmount)} no fluxo de caixa).
                                </p>
                            )}
                            {settlementMode === 'normal' && parsedAmount > 0 && parsedAmount < ob.remaining_amount && (
                                <p className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                                    Pagamento parcial. Restará saldo de {valor(ob.remaining_amount - parsedAmount)} pendente após registro.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Conta</label>
                            <SearchableSelect
                                value={account_id}
                                onChange={setAccountId}
                                options={agruparPorTipo(
                                    bankAccounts.filter(a => a.is_active),
                                    a => `${a.name} · ${isPrivacy ? '••••' : formatCurrency(a.current_balance)}`,
                                    a => a.type,
                                    TIPO_DE_CONTA,
                                )}
                                placeholder="Selecione..."
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Método</label>
                                <SearchableSelect
                                    value={method}
                                    onChange={(v) => setMethod(v as PaymentMethod)}
                                    options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
                                    placeholder="Método..."
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Data</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                                    className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-zinc-500" />
                            </div>
                        </div>

                        {/* Dinheiro que entrou antes do ERP: baixa a conta sem somar no caixa de novo. */}
                        <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isInformational ? 'bg-zinc-900 border-zinc-600' : 'bg-zinc-950 border-zinc-800'}`}
                            onClick={() => setIsInformational(!isInformational)}>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${isInformational ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-600 bg-zinc-950'}`}>
                                {isInformational && <Check size={12} strokeWidth={4} />}
                            </div>
                            <div>
                                <p className="text-sm text-zinc-200 flex items-center gap-1.5">
                                    Lançamento informativo
                                    <span onClick={e => e.stopPropagation()}>
                                        <InfoTooltip width={300}>
                                            <p className="text-xs font-semibold text-white mb-1">Quando usar</p>
                                            <p className="text-[10px] text-zinc-400 leading-relaxed">
                                                Para pedidos cujo dinheiro <b>já entrou antes do ERP existir</b>.
                                                Dar baixa normal somaria esse valor ao saldo do banco de novo, e o
                                                caixa mostraria o dobro do que você tem.
                                            </p>
                                            <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5">
                                                Marcado, a conta é quitada, o pagamento aparece no histórico e nos
                                                relatórios de prazo — mas o saldo do banco fica intacto. O estorno
                                                também respeita isso.
                                            </p>
                                            <p className="text-[10px] text-amber-500/90 leading-relaxed mt-1.5">
                                                Para o dia a dia, deixe desmarcado.
                                            </p>
                                        </InfoTooltip>
                                    </span>
                                </p>
                                <p className="text-xs text-zinc-500">Já recebido antes do sistema. Baixa a conta e entra no histórico, mas <span className="text-zinc-400">não altera o saldo do banco</span>.</p>
                            </div>
                        </div>

                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2 flex items-center justify-between">
                                    Documentos e comprovantes
                                    {updatingOb && <span className="text-xs animate-pulse">Enviando...</span>}
                                </label>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {obAttachments.length === 0 && !pendingFile && <p className="text-xs text-zinc-600 italic">Nenhum anexo</p>}
                                    {obAttachments.map((path, i) => (
                                        <div key={i} className="flex items-center gap-2 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg group/file">
                                            <Paperclip size={12} className="text-zinc-400" />
                                            <span className="text-xs text-zinc-300 truncate max-w-[120px] cursor-pointer hover:text-white" onClick={() => handleViewFile(path)}>{path.split('/').pop()}</span>
                                            <button onClick={() => setConfirmDeleteIdx(i)} disabled={updatingOb} aria-label="Remover anexo"
                                                className="text-zinc-600 hover:text-rose-400 disabled:opacity-30">✕</button>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-3">
                                    {!pendingFile ? (
                                        <label className={`flex items-center gap-2 p-3 bg-zinc-950 border border-dashed border-zinc-800 rounded-lg cursor-pointer hover:border-zinc-700 transition-colors`}>
                                            <Paperclip size={14} className="text-zinc-500" />
                                            <span className="text-sm text-zinc-400">Selecionar arquivo...</span>
                                            <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,application/pdf" />
                                        </label>
                                    ) : (
                                        <div className="flex items-center gap-2 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-zinc-500">Arquivo selecionado</p>
                                                <p className="text-sm text-zinc-300 truncate">{pendingFile.name}</p>
                                            </div>
                                            <button onClick={() => setPendingFile(null)} aria-label="Descartar arquivo" className="p-2 text-zinc-500 hover:text-white">✕</button>
                                            <button onClick={handleConfirmUpload} disabled={updatingOb}
                                                className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40">
                                                {updatingOb ? 'Enviando...' : 'Confirmar anexo'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">Anotações do pagamento</label>
                            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional"
                                className="w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-zinc-500" />
                        </div>
                        {error && <p role="alert" className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                        {successMsg && <p className="text-zinc-200 text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">{successMsg}</p>}
                    </div>

                    {/* History */}
                    <div className="w-full md:w-[290px] md:shrink-0 md:min-h-0 md:overflow-y-auto p-6 custom-scrollbar">
                        <p className="text-xs text-zinc-500 mb-3">Histórico</p>
                        {activePayments.length === 0 ? (
                            <p className="text-xs text-zinc-600">Nenhum registro</p>
                        ) : (
                            <div className="space-y-2">
                                {activePayments.map(p => (
                                    <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 group/p">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold tabular-nums text-zinc-200">{isPrivacy ? '••••' : formatCurrency(p.amount)}</p>
                                                <p className="text-xs text-zinc-500">{p.method} · {new Date(p.payment_date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                                                <p className="text-xs text-zinc-600 truncate max-w-[150px]" title={nomeDaConta(p.account_id)}>{nomeDaConta(p.account_id)}</p>
                                            </div>
                                            {/* Estorno SEMPRE visível.
                                                Estava atrás de `opacity-0` até o hover, e o resultado
                                                foi alguém lançar 3.700 no lugar de 370, não achar como
                                                desfazer e "consertar" com um recebimento inverso — o
                                                que deixa dois lançamentos errados no caixa em vez de
                                                nenhum. Desfazer é justamente o que a pessoa procura
                                                com pressa; esconder até o hover é escondê-lo de quem
                                                mais precisa. */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                {p.attachments && p.attachments.length > 0 && (
                                                    <button onClick={() => handleViewFile(p.attachments![0])}
                                                        className="p-1 text-zinc-500 hover:text-white" title="Ver comprovante" aria-label="Ver comprovante">
                                                        <Eye size={14} />
                                                    </button>
                                                )}
                                                <button onClick={() => onReversePayment(p.id)}
                                                    title="Estornar este pagamento"
                                                    className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs text-rose-400 border border-zinc-800 hover:bg-zinc-950 transition-colors">
                                                    <RotateCcw size={12} /> Estornar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 pt-3 border-t border-zinc-800 space-y-2">
                            <ProgressBar pct={ob.paid_pct} status={ob.derived_status} />
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Quitado</span>
                                <span className="text-zinc-300 tabular-nums">{ob.paid_pct.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Rodapé fixo: o botão sai da área rolável e fica sempre à mão.
                    Antes ele era o último item de uma coluna que crescia sem
                    limite — com anexo e avisos de desconto abertos, confirmar
                    exigia rolar até o fim de uma tela que não rolava. */}
                <div className="shrink-0 border-t border-zinc-800 px-6 py-4 flex items-center gap-4 flex-wrap">
                    {canSubmit ? (
                        <div className="min-w-0 flex-1">
                            <p className="text-xs text-zinc-500">Resumo da operação</p>
                            <p className="text-sm text-zinc-300 leading-relaxed">
                                {ob.type === 'receivable' ? 'Receber' : 'Pagar'}&nbsp;
                                <span className={`tabular-nums ${ob.type === 'receivable' ? 'text-emerald-400' : 'text-zinc-100'}`}>
                                    {isPrivacy ? '••••' : formatCurrency(parsedAmount)}
                                </span>
                                {account_id && bankAccounts.find(a => a.id === account_id) && !isInformational && (
                                    <> via <span className="text-zinc-100">{method}</span> na conta <span className="text-zinc-100">{bankAccounts.find(a => a.id === account_id)!.name}</span></>
                                )}
                                &nbsp;em {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </p>
                            {isInformational && (
                                <p className="text-xs text-zinc-500">Registro histórico — o saldo do banco não será alterado.</p>
                            )}
                        </div>
                    ) : (
                        <p className="min-w-0 flex-1 text-xs text-zinc-500">
                            Informe valor e conta para confirmar.
                        </p>
                    )}

                    <button onClick={handleSubmit} disabled={!canSubmit || saving}
                        className="w-full sm:w-auto sm:min-w-[240px] h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 shrink-0 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed">
                        {saving ? 'Processando...'
                        : settlementMode === 'surplus' ? `Confirmar + ${valor(surplusDelta)}`
                        : settlementMode === 'discount' ? `Baixa c/ desconto — ${valor(parsedAmount)}`
                        : ob.type === 'receivable' ? 'Confirmar recebimento' : 'Confirmar pagamento'}
                    </button>
                </div>

                <ConfirmModal
                    isOpen={confirmDeleteIdx !== null}
                    title="Remover Anexo"
                    message="Tem certeza que deseja excluir este documento permanentemente?"
                    confirmLabel="Excluir"
                    cancelLabel="Manter"
                    isDanger={true}
                    onConfirm={() => confirmDeleteIdx !== null && handleDeleteAttachment(confirmDeleteIdx)}
                    onClose={() => setConfirmDeleteIdx(null)}
                />
                {previewPath && <AttachmentViewer path={previewPath} onClose={() => setPreviewPath(null)} />}
            </div>
        </div>,
        document.body,
    );
}

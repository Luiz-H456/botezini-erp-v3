import { useState } from 'react';
import { storageService } from '../../services/storage';
import { getErrorMessage } from '../../utils/errorHandling';
import { parseBRL } from '../../utils/currency';
import { ObligationSummary, BankAccount, ObligationPayment, PaymentMethod } from '../../types';

export type SettlementMode = 'normal' | 'discount' | 'surplus';

export function usePaymentModal(
    ob: ObligationSummary,
    bankAccounts: BankAccount[],
    existingPayments: ObligationPayment[],
    onSuccess: () => void,
    onRefresh?: () => void
) {
    const [amount, setAmount] = useState(ob.remaining_amount.toFixed(2).replace('.', ','));
    // O banco padrão do lançamento só vale se ainda estiver ativo; senão, o primeiro ativo.
    const [account_id, setAccountId] = useState(
        bankAccounts.find(a => a.id === ob.default_account_id && a.is_active)?.id
        || bankAccounts.find(a => a.is_active)?.id || '');
    const [method, setMethod] = useState<PaymentMethod>('PIX');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [previewPath, setPreviewPath] = useState<string | null>(null);
    const [obAttachments, setObAttachments] = useState<string[]>(ob.attachments || []);
    const [updatingOb, setUpdatingOb] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
    const [isDiscountClose, setIsDiscountClose] = useState(false);
    /** Por que o valor difere do saldo. Fica gravado junto com a baixa. */
    const [motivoDoAjuste, setMotivoDoAjuste] = useState('');
    /** Baixa de dinheiro que já entrou antes do ERP — não pode somar no saldo de novo. */
    const [isInformational, setIsInformational] = useState(false);

    const parsedAmount = parseBRL(amount);

    // Determine settlement mode
    const settlementMode: SettlementMode =
        parsedAmount > ob.remaining_amount
            ? 'surplus'             // pay more than original (interest/bonus)
            : parsedAmount > 0 && parsedAmount < ob.remaining_amount && isDiscountClose
            ? 'discount'            // paying less than what's owed and wants to close
            : 'normal';             // exact match, or simple partial payment

    // Delta: how much the outstanding balance would need to shift if audited surcharge support is added.
    const surplusDelta = parsedAmount - ob.remaining_amount;          // > 0 when overpaying
    const closingWithDiscount = parsedAmount > 0 && parsedAmount < ob.remaining_amount && isDiscountClose;

    // Desconto e acréscimo agora TÊM campos próprios e auditáveis na baixa
    // (obligation_payments.desconto / .acrescimo), então deixaram de ser
    // bloqueados. `original_amount` continua imutável: quem registra a
    // diferença é o pagamento, nunca a conta.
    //
    // Pagar a MENOS sem marcar "quitar com desconto" segue sendo pagamento
    // parcial — a conta fica aberta, que é o comportamento certo para quem
    // ainda vai pagar o resto.
    const canSubmit = parsedAmount > 0 && !!account_id;
    const activePayments = existingPayments.filter(p => !p.reversed_at && !p.reversal_of);

    const handleSubmit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        setError('');
        try {
            if (isInformational) {
                await storageService.registerInformationalPayment({
                    obligation_id: ob.id,
                    amount: parsedAmount,
                    account_id: account_id,
                    payment_date: date,
                    notes: notes || undefined
                });
            } else {
                await storageService.payObligation({
                    obligation_id: ob.id,
                    amount: parsedAmount,
                    account_id: account_id,
                    method,
                    payment_date: date,
                    notes: notes || undefined,
                    // O dinheiro é sempre `amount`. O que muda é quanto disso
                    // amortiza a dívida: desconto liquida sem caixa, acréscimo
                    // entra no caixa sem amortizar.
                    desconto: settlementMode === 'discount' ? ob.remaining_amount - parsedAmount : 0,
                    acrescimo: settlementMode === 'surplus' ? parsedAmount - ob.remaining_amount : 0,
                    ajuste_motivo: settlementMode === 'discount' ? (motivoDoAjuste || 'Desconto concedido')
                        : settlementMode === 'surplus' ? (motivoDoAjuste || 'Juros/multa por atraso')
                        : undefined,
                });
            }
            onSuccess();
        } catch (e: any) {
            setError(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    /** Quick-close shortcut: sets amount to remaining so the user can liquidate with one click */
    const handleQuickClose = () => {
        setAmount(ob.remaining_amount.toFixed(2).replace('.', ','));
    };

    /** Quick-surplus shortcut: pre-fills a common +10% surcharge */
    const handleQuick100 = () => {
        setAmount(ob.remaining_amount.toFixed(2).replace('.', ','));
    };

    const handleViewFile = (path: string) => {
        setPreviewPath(path);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setPendingFile(file);
    };

    const handleConfirmUpload = async () => {
        if (!pendingFile || updatingOb) return;
        setUpdatingOb(true);
        setError('');
        setSuccessMsg('');
        try {
            const path = await storageService.uploadAttachment(pendingFile, `obligations/${ob.id}`);
            const newList = [...obAttachments, path];
            await storageService.updateObligation(ob.id, { attachments: newList });
            setObAttachments(newList);
            setPendingFile(null);
            setSuccessMsg('Anexo salvo com sucesso!');
            if (onRefresh) onRefresh();
        } catch (e: any) {
            console.error('Erro no upload:', e);
            setError(`Upload falhou: ${getErrorMessage(e)}`);
        } finally {
            setUpdatingOb(false);
        }
    };

    const handleDeleteAttachment = async (index: number) => {
        setUpdatingOb(true);
        setError('');
        setSuccessMsg('');
        try {
            const newList = obAttachments.filter((_, idx) => idx !== index);
            await storageService.updateObligation(ob.id, { attachments: newList });
            setObAttachments(newList);
            setSuccessMsg('Anexo removido!');
            if (onRefresh) onRefresh();
        } catch (e: any) {
            setError(`Erro ao remover: ${getErrorMessage(e)}`);
        } finally {
            setUpdatingOb(false);
            setConfirmDeleteIdx(null);
        }
    };

    return {
        // State
        amount,
        account_id,
        method,
        date,
        notes,
        saving,
        error,
        successMsg,
        previewPath,
        obAttachments,
        updatingOb,
        pendingFile,
        confirmDeleteIdx,

        // Derived
        parsedAmount,
        canSubmit,
        activePayments,
        settlementMode,
        surplusDelta,
        closingWithDiscount,
        isDiscountClose,
        motivoDoAjuste,
        setMotivoDoAjuste,
        isInformational,

        // Setters
        setAmount,
        setAccountId,
        setMethod,
        setDate,
        setNotes,
        setPreviewPath,
        setPendingFile,
        setConfirmDeleteIdx,
        setIsDiscountClose,
        setIsInformational,

        // Handlers
        handleSubmit,
        handleQuickClose,
        handleQuick100,
        handleViewFile,
        handleFileSelect,
        handleConfirmUpload,
        handleDeleteAttachment
    };
}

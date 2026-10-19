import { useState } from 'react';
import { storageService } from '../../services/storage';
import { getErrorMessage } from '../../utils/errorHandling';
import { parseBRL } from '../../utils/currency';
import { PaymentMethod } from '../../types';

export interface SplitsState {
    amount: string;
    category: string;
    globalCategoryId?: string;
    costCenterId: string;
}

export function useObligationForm(
    type: 'payable' | 'receivable',
    onSuccess: () => void,
    categories: any[]
) {
    const [mode, setMode] = useState<'once' | 'recurring' | 'installments'>('once');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [due_date, setDueDate] = useState(new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState('');
    const [globalCategoryId, setGlobalCategoryId] = useState('');
    const [client_id, setClientId] = useState('');
    const [supplier_id, setSupplierId] = useState('');
    const [account_id, setAccountId] = useState('');
    const [costCenterId, setCostCenterId] = useState('');
    const [notes, setNotes] = useState('');
    const [months, setMonths] = useState('12');
    const [installments, setInstallments] = useState('2');
    const [categorySuggested, setCategorySuggested] = useState(false);
    const [suggestionSource, setSuggestionSource] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isSplit, setIsSplit] = useState(false);
    const [splits, setSplits] = useState<SplitsState[]>([
        { amount: '', category: '', globalCategoryId: '', costCenterId: '' }
    ]);
    const [isAlreadyPaid, setIsAlreadyPaid] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');

    const parsedAmount = parseBRL(amount);
    const canSubmit = description.trim() && parsedAmount > 0 && due_date;

    const suggestCategoryFromHistory = async (suppId: string | null, cliId: string | null, fallback: string | null | undefined) => {
        try {
            const past = await storageService.getObligations({ supplier_id: suppId ?? undefined, client_id: cliId ?? undefined });
            const freq: Record<string, number> = {};
            past.forEach((o: any) => { if (o.category) freq[o.category] = (freq[o.category] || 0) + 1; });
            const topCat = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];

            if (topCat) {
                const isGlobalCat = categories.some(c => typeof c === 'object' ? c.name === topCat : c === topCat);
                if (isGlobalCat) {
                    setCategory(topCat);
                    const globalItem = categories.find(c => typeof c === 'object' && c.name === topCat);
                    if (globalItem) setGlobalCategoryId(globalItem.id);
                    setCategorySuggested(true);
                    setSuggestionSource(`historico (${freq[topCat]}x)`);
                    return;
                }
            }
        } catch { /* silent */ }

        const isFallbackGlobal = fallback && categories.some(c => typeof c === 'object' ? c.name === fallback : c === fallback);
        if (isFallbackGlobal) {
            setCategory(fallback as string);
            const globalItem = categories.find(c => typeof c === 'object' && c.name === fallback);
            if (globalItem) setGlobalCategoryId(globalItem.id);
            setCategorySuggested(true);
            setSuggestionSource('cadastro');
        } else {
            setCategorySuggested(false);
            setSuggestionSource('');
            setGlobalCategoryId('');
        }
    };

    const handleSupplierChange = async (id: string, suppliers: any[]) => {
        setSupplierId(id);
        if (!id) {
            setCategorySuggested(false);
            setSuggestionSource('');
            return;
        }

        const sup = suppliers.find(s => s.id === id);

        // Herda os padrões do fornecedor. São SUGESTÕES: o campo continua
        // editável e o lançamento pode divergir sem alterar o cadastro. A ideia
        // é que escolher "Cemig" já preencha o que se repete em todo lançamento
        // dele, sobrando confirmar em vez de redigitar.
        if (sup?.default_cost_center_id) setCostCenterId(sup.default_cost_center_id);
        if (sup?.default_planned_method) setPaymentMethod(sup.default_planned_method as PaymentMethod);

        // A categoria padrão do cadastro vence o palpite do histórico: foi
        // escolhida de propósito, o histórico é inferência.
        if (sup?.default_global_category_id) {
            setGlobalCategoryId(sup.default_global_category_id);
            setCategorySuggested(true);
            setSuggestionSource('padrão do fornecedor');
            return;
        }
        await suggestCategoryFromHistory(id, null, sup?.default_sub_category || sup?.category);
    };

    const handleClientChange = async (id: string, clients: any[]) => {
        setClientId(id);
        if (!id) {
            setCategorySuggested(false);
            setSuggestionSource('');
            return;
        }

        const cli = clients.find(c => c.id === id);
        await suggestCategoryFromHistory(null, id, cli?.category);
    };

    const handleSubmit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        setError('');

        try {
            if (mode === 'recurring') {
                await storageService.createRecurrenceObligations({
                    type, description: description.trim(), amount: parsedAmount,
                    first_due: due_date, months: parseInt(months) || 12,
                    category: category || undefined,
                    global_category_id: globalCategoryId || undefined,
                    client_id: type === 'receivable' && client_id ? client_id : undefined,
                    supplier_id: type === 'payable' && supplier_id ? supplier_id : undefined,
                    cost_center: costCenterId || undefined,
                    account_id: account_id || undefined,
                    notes: notes || undefined,
                });
            } else {
                const count = mode === 'installments' ? (parseInt(installments) || 1) : 1;
                const splitGroupId = isSplit ? crypto.randomUUID() : undefined;

                for (let i = 0; i < count; i++) {
                    // Fix B2: avoid month-overflow (e.g. Jan 31 + 1 month → Mar 3)
                    const d = new Date(due_date + 'T12:00:00');
                    d.setDate(1);
                    d.setMonth(d.getMonth() + i);
                    // Restore original day capped to the last day of that month
                    const origDay = parseInt(due_date.split('-')[2]);
                    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                    d.setDate(Math.min(origDay, lastDay));

                    if (isSplit) {
                        for (const s of splits) {
                            const splitAmt = parseBRL(s.amount);
                            if (splitAmt <= 0) continue;

                            const createdIds = await storageService.createRecurrenceObligations({
                                type,
                                description: count > 1 ? `${description.trim()} (${i + 1}/${count})` : description.trim(),
                                amount: splitAmt,
                                first_due: d.toISOString().split('T')[0],
                                months: 1, // Single occurrence via RPC bypass
                                category: s.category || undefined,
                                global_category_id: s.globalCategoryId || undefined,
                                client_id: type === 'receivable' && client_id ? client_id : undefined,
                                supplier_id: type === 'payable' && supplier_id ? supplier_id : undefined,
                                cost_center: s.costCenterId || undefined,
                                account_id: account_id || undefined,
                                notes: splitGroupId ? `[SPLIT: ${splitGroupId}]\n${notes || ''}` : (notes || undefined)
                            });
                            
                            if (mode === 'once' && isAlreadyPaid && createdIds && createdIds.length > 0 && account_id) {
                                await storageService.payObligation({
                                    obligation_id: createdIds[0],
                                    amount: splitAmt,
                                    account_id: account_id,
                                    method: paymentMethod || undefined,
                                    payment_date: d.toISOString().split('T')[0],
                                });
                            }
                        }
                    } else {
                        const createdIds = await storageService.createRecurrenceObligations({
                            type, 
                            description: count > 1 ? `${description.trim()} (${i + 1}/${count})` : description.trim(),
                            amount: parsedAmount,
                            first_due: d.toISOString().split('T')[0],
                            months: 1, // Single occurrence via RPC bypass
                            category: category || undefined,
                            global_category_id: globalCategoryId || undefined,
                            client_id: type === 'receivable' && client_id ? client_id : undefined,
                            supplier_id: type === 'payable' && supplier_id ? supplier_id : undefined,
                            cost_center: costCenterId || undefined,
                            account_id: account_id || undefined,
                            notes: notes || undefined
                        });
                        
                        if (mode === 'once' && isAlreadyPaid && createdIds && createdIds.length > 0 && account_id) {
                            await storageService.payObligation({
                                obligation_id: createdIds[0],
                                amount: parsedAmount,
                                account_id: account_id,
                                method: paymentMethod || undefined,
                                payment_date: d.toISOString().split('T')[0],
                            });
                        }
                    }
                }
            }
            onSuccess();
        } catch (e: any) {
            setError(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    };

    return {
        // State
        mode,
        description,
        amount,
        due_date,
        category,
        client_id,
        supplier_id,
        account_id,
        costCenterId,
        notes,
        months,
        installments,
        categorySuggested,
        suggestionSource,
        saving,
        error,
        isSplit,
        splits,
        isAlreadyPaid,
        paymentMethod,
        globalCategoryId,

        // Derived
        parsedAmount,
        canSubmit,

        // Setters
        setMode,
        setDescription,
        setAmount,
        setDueDate,
        setCategory,
        setCategorySuggested,
        setClientId,
        setSupplierId,
        setAccountId,
        setCostCenterId,
        setNotes,
        setMonths,
        setInstallments,
        setIsSplit,
        setSplits,
        setIsAlreadyPaid,
        setPaymentMethod,
        setGlobalCategoryId,

        // Handlers
        handleSupplierChange,
        handleClientChange,
        handleSubmit
    };
}

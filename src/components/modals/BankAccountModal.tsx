import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Building, Hash, DollarSign, Trash2 } from 'lucide-react';
import type { BankAccount } from '@/types';
import SearchableSelect from '@/components/common/SearchableSelect';
import { InfoTooltip } from '@/components/common';

import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<BankAccount>) => Promise<void>;
    onDelete?: (account: BankAccount) => void;
    /**
     * Ajusta o saldo real pela RPC set_bank_balance (não é upsert).
     *
     * Devolve a conta RELIDA do banco. O `initial_balance` é derivado — quem
     * o calcula é a RPC — e a única forma de a tela mostrar o valor certo é
     * perguntar de novo depois de gravar.
     */
    onSetBalance?: (accountId: string, newBalance: number) => Promise<Partial<BankAccount> | void>;
    account?: Partial<BankAccount> | null;
    /** O SQL cadastros_v3_1 rodou: mostra Titular e Chave PIX. */
    camposNovos?: boolean;
}

export const BankAccountModal: React.FC<Props> = ({ isOpen, onClose, onSave, onDelete, onSetBalance, account, camposNovos }) => {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica: as janelas que faltavam).
    const saida = useSaidaProtegida(onClose);
    const { limpar } = saida;
    useEffect(() => { if (!isOpen) limpar(); }, [isOpen, limpar]);
    const [data, setData] = useState<Partial<BankAccount>>({
        name: '',
        type: 'checking',
        bank_name: '',
        account_number: '',
        initial_balance: 0,
        current_balance: 0,
        currency: 'BRL',
        is_active: true,
        ...(camposNovos ? { titular: '', chave_pix: '' } : {}),
    });
    const [isSaving, setIsSaving] = useState(false);
    const [novoSaldo, setNovoSaldo] = useState('');
    const [ajustando, setAjustando] = useState(false);
    const [ajusteMsg, setAjusteMsg] = useState('');

    useEffect(() => {
        if (isOpen) {
            setNovoSaldo('');
            setAjusteMsg('');
            if (account) {
                setData(account);
            } else {
                setData({
                    name: '',
                    type: 'checking',
                    bank_name: '',
                    account_number: '',
                    initial_balance: 0,
                    current_balance: 0,
                    currency: 'BRL',
                    is_active: true,
                    ...(camposNovos ? { titular: '', chave_pix: '' } : {}),
                });
            }
        }
    }, [isOpen, account, camposNovos]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!data.name || !data.type) return;
        setIsSaving(true);
        try {
            if (!account?.id) {
                data.current_balance = data.initial_balance; // Set initial balance for new accounts
            }
            await onSave(data);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAjustarSaldo = async () => {
        if (!account?.id || !onSetBalance || ajustando) return;
        const valor = parseFloat(novoSaldo.replace(/\./g, '').replace(',', '.'));
        if (!isFinite(valor)) { setAjusteMsg('Informe um valor válido'); return; }
        setAjustando(true);
        setAjusteMsg('');
        try {
            const relida = await onSetBalance(account.id, valor);
            // O que veio do banco vence o que se supunha. Se a RPC nao mexeu no
            // saldo de partida, o numero na tela vai continuar zero — e ai o
            // zero e a verdade, nao um resto de estado velho.
            setData(d => ({ ...d, current_balance: valor, ...(relida || {}) }));
            setNovoSaldo('');
            setAjusteMsg(
                relida && Number(relida.initial_balance) !== 0
                    ? 'Saldo gravado e ponto de partida reancorado.'
                    : 'Saldo gravado.');
        } catch (e: any) {
            setAjusteMsg(mensagemDeErro(e, 'Falha ao ajustar'));
        } finally {
            setAjustando(false);
        }
    };

    const InputCls = 'w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white outline-none focus:border-zinc-500 transition-colors placeholder:text-zinc-700';
    const LabelCls = 'text-xs text-zinc-500 block mb-1.5';

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 ease-out animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] relative overflow-hidden" {...saida.aoMexer}>
                <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">
                        {account?.id ? 'Editar conta bancária' : 'Nova conta bancária'}
                    </h2>
                    <button onClick={saida.pedirParaFechar} aria-label="Fechar" className="p-2 text-zinc-500 hover:text-white transition-colors hover:bg-zinc-800 rounded-lg">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div className="space-y-2">
                        <label className={LabelCls}>Nome da conta *</label>
                        <input
                            autoFocus
                            className={InputCls}
                            value={data.name || ''}
                            onChange={e => setData(d => ({ ...d, name: e.target.value }))}
                            placeholder="Ex: Conta Corrente Itaú"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className={LabelCls}>Tipo de conta *</label>
                        <SearchableSelect
                            value={data.type || 'checking'}
                            onChange={val => setData(d => ({ ...d, type: val as any }))}
                            options={[
                                { value: 'checking', label: 'Conta corrente' },
                                { value: 'savings', label: 'Poupança' },
                                { value: 'cash', label: 'Caixa (Dinheiro)' },
                                { value: 'credit_card', label: 'Cartão de Crédito' },
                            ]}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={LabelCls}>Nome do banco</label>
                            <div className="relative group">
                                <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-300 transition-colors" size={16} />
                                <input
                                    className={`${InputCls} pl-10`}
                                    value={data.bank_name || ''}
                                    onChange={e => setData(d => ({ ...d, bank_name: e.target.value }))}
                                    placeholder="Ex: Itaú, Nubank"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className={LabelCls}>Agência / Conta</label>
                            <div className="relative group">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-300 transition-colors" size={16} />
                                <input
                                    className={`${InputCls} pl-10`}
                                    value={data.account_number || ''}
                                    onChange={e => setData(d => ({ ...d, account_number: e.target.value }))}
                                    placeholder="Ex: 0001 / 12345-6"
                                />
                            </div>
                        </div>
                    </div>

                    {camposNovos && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className={LabelCls}>Titular</label>
                                <input
                                    className={InputCls}
                                    value={data.titular || ''}
                                    onChange={e => setData(d => ({ ...d, titular: e.target.value }))}
                                    placeholder="Nome do titular"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={LabelCls}>Chave PIX</label>
                                <input
                                    className={InputCls}
                                    value={data.chave_pix || ''}
                                    onChange={e => setData(d => ({ ...d, chave_pix: e.target.value }))}
                                    placeholder="CPF/CNPJ, e-mail, telefone ou aleatória"
                                />
                            </div>
                        </div>
                    )}

                    {!account?.id && (
                        <div className="space-y-2">
                            <label className={LabelCls}>Saldo inicial</label>
                            <div className="relative group">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-300 transition-colors" size={16} />
                                <input
                                    type="number"
                                    step="0.01"
                                    className={`${InputCls} pl-10 tabular-nums`}
                                    value={data.initial_balance || ''}
                                    onChange={e => setData(d => ({ ...d, initial_balance: parseFloat(e.target.value) || 0 }))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    )}

                    {account?.id && onSetBalance && (
                        <div className="space-y-2 p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg">
                            <label className={`${LabelCls} flex items-center gap-1.5`}>
                                Saldo atual
                                <InfoTooltip width={300}>
                                    <p className="text-xs font-semibold text-white mb-1">Ajuste de saldo</p>
                                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                                        Informe quanto existe de fato na conta hoje, conferindo com o extrato.
                                        Não cria lançamento nem conta a pagar/receber.
                                    </p>
                                    <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5">
                                        O sistema recalcula o saldo inicial da conta por trás, de modo que o
                                        botão <b>Sinc Saldos</b> do Financeiro chegue neste mesmo número. Sem
                                        isso, o primeiro clique nele desfaria o ajuste.
                                    </p>
                                </InfoTooltip>
                            </label>
                            <p className="text-lg font-black tracking-tighter text-white tabular-nums -mt-1">
                                {(data.current_balance ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: data.currency || 'BRL' })}
                            </p>

                            {/* O saldo de partida NAO e editavel, e ver o numero
                                atual e o que explica por que. Ele e derivado: quem
                                o define e o ajuste de saldo, resolvendo
                                partida = saldo informado - soma dos lancamentos.
                                Sem isto na tela, "informei o saldo inicial e nao
                                mudou nada" nao tem como ser diagnosticado por quem
                                esta olhando. */}
                            <p className="text-xs text-zinc-600">
                                Saldo de partida hoje:{' '}
                                <span className="tabular-nums text-zinc-500">
                                    {(data.initial_balance ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: data.currency || 'BRL' })}
                                </span>
                                {(data.initial_balance ?? 0) === 0 && (
                                    <span className="text-amber-400"> — nunca informado</span>
                                )}
                            </p>
                            <p className="text-xs text-zinc-600 pb-1">
                                Informe quanto há de fato na conta hoje. O sistema ajusta o ponto de partida para que o
                                botão "Sinc Saldos" chegue neste mesmo número. Nenhum lançamento é criado.
                            </p>
                            <div className="flex gap-2">
                                <div className="relative group flex-1">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-zinc-300 transition-colors" size={16} />
                                    <input
                                        inputMode="decimal"
                                        className={`${InputCls} pl-10`}
                                        value={novoSaldo}
                                        onChange={e => setNovoSaldo(e.target.value)}
                                        placeholder="Saldo real, ex: 12500,00"
                                    />
                                </div>
                                <button
                                    onClick={handleAjustarSaldo}
                                    disabled={ajustando || !novoSaldo.trim()}
                                    className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40 shrink-0"
                                >
                                    {ajustando ? '...' : 'Ajustar'}
                                </button>
                            </div>
                            {ajusteMsg && <p className="text-xs text-zinc-400">{ajusteMsg}</p>}
                        </div>
                    )}

                    <div className="flex items-center gap-3 pt-2 group cursor-pointer" onClick={() => setData(d => ({ ...d, is_active: !d.is_active }))}>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${data.is_active ? 'bg-amber-500 border-amber-500' : 'bg-zinc-950 border-zinc-800'}`}>
                            {data.is_active && <div className="w-2 h-2 rounded-full bg-zinc-950"></div>}
                        </div>
                        <label className="text-sm text-zinc-400 cursor-pointer group-hover:text-zinc-200 transition-colors">Conta ativa</label>
                    </div>
                </div>

                <div className="p-6 border-t border-zinc-800 flex justify-between items-center shrink-0">
                    <div>
                        {account?.id && onDelete && (
                            <button
                                onClick={() => onDelete(account as BankAccount)}
                                className="h-10 w-10 flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-zinc-900 rounded-lg transition-all"
                                title="Inativar conta" aria-label="Inativar conta"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={saida.pedirParaFechar}
                            className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !data.name}
                            className="h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-50"
                        >
                            {isSaving ? 'Salvando...' : 'Salvar conta'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )}</>;
};

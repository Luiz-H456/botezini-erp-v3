import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowRight, Wallet, Calendar, User, Tag, Loader2, Check, X,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils';
import type { BankAccount } from '@/types';

interface Props {
    tipo: 'payable' | 'receivable';
    descricao: string;
    valor: number;
    /** Nome do fornecedor ou cliente, quando houver. */
    parte?: string;
    categoria?: string;
    dataDoPagamento: string;
    meio: string;
    conta?: BankAccount;
    /** Quantos lançamentos serão criados (parcelado/recorrente = mais de um). */
    quantidade?: number;
    onConfirmar: () => Promise<void> | void;
    onCancelar: () => void;
}

/**
 * Confirmação antes de mexer no caixa.
 *
 * Salvar um lançamento é reversível: dá para cancelar, editar, corrigir. Liquidar
 * na mesma ação NÃO é a mesma coisa — cria um pagamento que altera o saldo do
 * banco na hora, e desfazer exige achar o estorno dentro do histórico do modal
 * de pagamento. Um zero a mais digitado no valor (3.700 em vez de 370) vira um
 * caixa errado que ninguém percebe até fechar o mês.
 *
 * Por isso a confirmação só aparece quando "já foi pago" está ligado: o custo de
 * uma tela a mais se paga quando o erro é caro E difícil de desfazer. Lançamento
 * comum, que não toca no saldo, continua salvando direto.
 *
 * O VALOR aparece grande e sozinho porque é o campo onde o erro acontece — e o
 * saldo depois do lançamento vem junto, que é a leitura que denuncia a ordem de
 * grandeza errada antes de ela virar problema.
 */
export function ConfirmarLiquidacao({
    tipo, descricao, valor, parte, categoria, dataDoPagamento, meio, conta,
    quantidade = 1, onConfirmar, onCancelar,
}: Props) {
    const [confirmando, setConfirmando] = useState(false);

    const saida = tipo === 'payable';
    const saldoAtual = Number(conta?.current_balance) || 0;
    const saldoDepois = saida ? saldoAtual - valor : saldoAtual + valor;

    const confirmar = async () => {
        setConfirmando(true);
        try {
            await onConfirmar();
        } finally {
            setConfirmando(false);
        }
    };

    const Linha = ({ icone: Icone, rotulo, valor: v }: {
        icone: any; rotulo: string; valor: string;
    }) => (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/60 last:border-0">
            <span className="text-xs text-zinc-500 flex items-center gap-2">
                <Icone size={12} /> {rotulo}
            </span>
            <span className="text-sm text-zinc-200 text-right truncate">{v}</span>
        </div>
    );

    return createPortal(
        <div onClick={e => e.stopPropagation()} className="fixed inset-0 z-sobreposto flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-4 ease-out animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ease-out animate-in zoom-in-95 duration-200">

                <div className="shrink-0 px-6 py-4 border-b border-zinc-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">
                            Confirmar {saida ? 'pagamento' : 'recebimento'}
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            Isto mexe no saldo do banco agora
                        </p>
                    </div>
                    <button onClick={onCancelar} aria-label="Fechar"
                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">

                    {/* O valor grande e sozinho — é onde o erro de digitação mora. */}
                    <div className="text-center py-2">
                        <p className="text-xs text-zinc-500 mb-1">
                            {saida ? 'Sai do caixa' : 'Entra no caixa'}
                        </p>
                        <p className={`text-3xl font-semibold tabular-nums ${saida ? 'text-zinc-300' : 'text-emerald-400'}`}>
                            {saida ? '−' : '+'} {formatCurrency(valor)}
                        </p>
                        {quantidade > 1 && (
                            <p className="text-xs text-amber-400 mt-1">
                                × {quantidade} lançamentos
                            </p>
                        )}
                    </div>

                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2">
                        <Linha icone={Tag} rotulo="Descrição" valor={descricao || '—'} />
                        {parte && <Linha icone={User} rotulo={saida ? 'Fornecedor' : 'Cliente'} valor={parte} />}
                        {categoria && <Linha icone={Tag} rotulo="Categoria" valor={categoria} />}
                        <Linha icone={Calendar} rotulo="Data" valor={formatDate(dataDoPagamento)} />
                        <Linha icone={Wallet} rotulo="Meio" valor={meio} />
                        <Linha icone={Wallet} rotulo="Conta" valor={conta?.name || '—'} />
                    </div>

                    {/* O saldo depois é o que denuncia a ordem de grandeza errada:
                        um zero a mais aparece aqui como um salto que não fecha com
                        o que a pessoa sabe que tem no banco. */}
                    {conta && (
                        <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-4">
                            <p className="text-xs text-zinc-500 mb-2">
                                Saldo de {conta.name}
                            </p>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm tabular-nums text-zinc-400">
                                    {formatCurrency(saldoAtual)}
                                </span>
                                <ArrowRight size={14} className="text-zinc-600 shrink-0" />
                                <span className={`text-sm font-semibold tabular-nums ${saldoDepois < 0 ? 'text-rose-400' : 'text-zinc-100'}`}>
                                    {formatCurrency(saldoDepois)}
                                </span>
                            </div>
                            {saldoDepois < 0 && (
                                <p role="alert" className="text-xs text-amber-400 mt-2 leading-relaxed">
                                    Este pagamento deixa a conta negativa. Confira o valor antes de seguir.
                                </p>
                            )}
                        </div>
                    )}

                    <p className="text-xs text-zinc-500 leading-relaxed">
                        Para desfazer depois: abra o lançamento e use <b className="text-zinc-400">Estornar</b> no
                        histórico de pagamentos. O estorno devolve o saldo — não lance um valor inverso
                        para corrigir, isso deixa dois erros no lugar de nenhum.
                    </p>
                </div>

                <div className="shrink-0 p-6 border-t border-zinc-800 flex justify-end gap-2">
                    <button onClick={onCancelar} disabled={confirmando}
                        className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-40">
                        Voltar e revisar
                    </button>
                    <button onClick={confirmar} disabled={confirmando}
                        className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40">
                        {confirmando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                        {confirmando ? 'Lançando...' : `Confirmar ${formatCurrency(valor)}`}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

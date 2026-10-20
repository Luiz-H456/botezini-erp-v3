import React from 'react';
import { createPortal } from 'react-dom';
import { useEscFecha } from '@/hooks/useEscFecha';
import { Order, Client, CompanyProfile, OrderStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils';
import { Printer, X, MapPin, Phone, Mail, Building2, Calendar, Package, Clock, Hash, CheckCircle, AlertTriangle, User } from 'lucide-react';

interface Props {
    order: Order;
    client?: Client | null;
    companyProfile?: CompanyProfile | null;
    onClose: () => void;
    onPrint?: () => void;
    isFactoryMode?: boolean;
}

const translateCustType = (type: string) => {
    switch (type) {
        case 'Embroidery': return 'Bordado';
        case 'ScreenPrint': return 'Serigrafia';
        case 'DTF': return 'DTF';
        default: return type;
    }
};

export const OrderPreviewModal: React.FC<Props> = ({ order, client, companyProfile, onClose, onPrint, isFactoryMode = false }) => {
    useEscFecha(true, onClose);
    // Calculando subtotal base
    const subtotalCustom = (order.customizations || []).reduce((acc, c) => acc + c.total, 0);
    const subtotalExtra = (order.extras || []).reduce((acc, e) => acc + e.total, 0);

    // Backwards calculate the raw items total 
    const subtotalBase = order.total_amount + (order.discount || 0) - subtotalCustom - subtotalExtra;

    const hasNotes = Boolean(order.notes && order.notes.trim().length > 0);

    const getStatusStyle = (status: OrderStatus) => {
        switch (status) {
            case OrderStatus.PENDING: return 'text-zinc-400 bg-zinc-800 border-zinc-700';
            case OrderStatus.IN_PRODUCTION: return 'text-blue-400 bg-blue-950 border-blue-900';
            case OrderStatus.DELIVERED: return 'text-emerald-400 bg-emerald-950 border-emerald-900';
            default: return 'text-zinc-500 bg-zinc-800 border-zinc-700';
        }
    };

    const getStatusLabel = (status: OrderStatus) => {
        switch (status) {
            case OrderStatus.PENDING: return 'Pendente';
            case OrderStatus.IN_PRODUCTION: return 'Em Produção';
            case OrderStatus.DELIVERED: return 'Entregue';
            default: return 'Desconhecido';
        }
    };

    /**
     * Em portal, para o `fixed` nao depender de quem esta acima na arvore.
     *
     * `position: fixed` deixa de ser relativo a JANELA quando qualquer
     * ancestral tem transform, filter, backdrop-filter, contain ou
     * will-change — e a previa e montada la no fundo da arvore da pagina,
     * onde nenhum autor de componente sabe o que os pais fazem. Sem o portal,
     * bastava um ancestral novo ganhar um desses para a previa encolher para
     * dentro da area de conteudo e o X sair da tela.
     *
     * O dialogo de confirmacao desta mesma pagina ja fazia assim.
     */
    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-2 ease-out animate-in fade-in duration-200 overflow-hidden">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden ease-out animate-in zoom-in-95 duration-200 relative">

                {/* Modal Header */}
                {/* No celular o título encolhe e quebra; o lado direito (status e fechar) nunca encolhe:
                    antes ele era empurrado para fora da tela e a janela não tinha como ser fechada. */}
                <div className="bg-zinc-900/50 border-b border-zinc-800 px-4 sm:px-6 py-3 flex justify-between items-center gap-3 shrink-0 backdrop-blur-md">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="hidden sm:flex w-10 h-10 shrink-0 bg-zinc-950 rounded-xl items-center justify-center border border-zinc-800 shadow-inner">
                            <Package size={20} className="text-amber-500" />
                        </div>
                        <div className="flex min-w-0 flex-col">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h3 className="font-black text-white text-base sm:text-lg uppercase tracking-tighter break-words">Pedido #{order.order_number}</h3>
                                {order.budget_serial_number && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-500">
                                        Origem: Orç #{order.budget_serial_number}
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{formatDate(order.created_at || new Date().toISOString())}</span>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                        <div className={`px-3 sm:px-4 py-1.5 rounded-xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${getStatusStyle(order.status)}`}>
                            {order.status === OrderStatus.PENDING ? <Clock size={12} /> : order.status === OrderStatus.DELIVERED ? <CheckCircle size={12} /> : <Hash size={12} />}
                            {getStatusLabel(order.status)}
                        </div>

                        {!isFactoryMode && (
                            <button onClick={onPrint} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-amber-900/20 group">
                                <Printer size={14} className="group-hover:scale-110 transition-transform" /> FICHA DE PRODUÇÃO
                            </button>
                        )}
                        <button type="button" onClick={onClose} aria-label="Fechar" className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center active:scale-90 shadow-lg">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 overflow-y-auto bg-zinc-950 p-4 sm:p-6 custom-scrollbar relative">
                    <div className="max-w-4xl mx-auto space-y-6">

                        {/* Company & Client Header */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Company Block */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
                                <h4 className="text-[10px] font-black uppercase text-zinc-600 mb-4 tracking-[0.2em] flex items-center gap-2">
                                    <Building2 size={12} /> Dados da Empresa
                                </h4>
                                {companyProfile ? (
                                    <div className="space-y-3">
                                        <p className="font-black text-white text-lg leading-tight uppercase mr-10">{companyProfile.name}</p>
                                        <div className="flex flex-col gap-2 text-xs text-zinc-400">
                                            {companyProfile.cnpj && <span className="flex items-center gap-2"><div className="w-1 h-1 bg-zinc-600 rounded-full" /> CNPJ: {companyProfile.cnpj}</span>}
                                            {companyProfile.email && <span className="flex items-center gap-2"><Mail size={12} className="text-zinc-500" /> {companyProfile.email}</span>}
                                            {companyProfile.phone && <span className="flex items-center gap-2"><Phone size={12} className="text-zinc-500" /> {companyProfile.phone}</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Configure a empresa.</p>
                                )}
                            </div>

                            {/* Client Block */}
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-800/30 rounded-bl-[100px]"></div>
                                <h4 className="text-[10px] font-black uppercase text-zinc-600 mb-4 tracking-[0.2em] flex items-center gap-2">
                                    <User size={12} /> Informações do Cliente
                                </h4>
                                {client ? (
                                    <div className="space-y-3">
                                        <p className="font-black text-white text-lg leading-tight uppercase mr-10">{client.company_name}</p>
                                        <div className="flex flex-col gap-2 text-xs text-zinc-400">
                                            {client.cnpj && <span className="flex items-center gap-2"><AlertTriangle size={12} className="text-zinc-500" /> CNPJ: {client.cnpj}</span>}
                                            {client.email && <span className="flex items-center gap-2"><Mail size={12} className="text-zinc-500" /> {client.email}</span>}
                                            {client.phone && <span className="flex items-center gap-2"><Phone size={12} className="text-zinc-500" /> {client.phone}</span>}
                                            {client.address && <span className="flex items-center gap-2"><MapPin size={12} className="text-zinc-500" /> {client.address}</span>}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Nenhum cliente associado.</p>
                                )}
                            </div>
                        </div>

                        {/* Items */}
                        {/* Celular: margens e títulos curtos, para a coluna de quantidade caber sem rolar. */}
                        <div className="px-3 py-5 sm:px-6 sm:py-8 border border-zinc-800 bg-zinc-900/30 rounded-2xl shadow-xl">
                            <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] mb-4">Grade de Produção</p>
                            <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-zinc-900/80 border-b border-zinc-800">
                                            <th className="px-2 sm:px-6 py-3 sm:py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest">ID</th>
                                            <th className="px-2 sm:px-4 py-3 sm:py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest w-full"><span className="sm:hidden">Peça</span><span className="hidden sm:inline">ESPECIFICAÇÕES DA PEÇA (TAM, GÊNERO, TECIDO)</span></th>
                                            <th className="px-2 sm:px-6 py-3 sm:py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center"><span className="sm:hidden">Qtd</span><span className="hidden sm:inline">QUANTIDADE</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50">
                                        {order.items.map((item, index) => (
                                            <tr key={index} className="hover:bg-zinc-800/20 transition-colors">
                                                <td className="px-2 sm:px-6 py-3 sm:py-4 align-top">
                                                    <span className="text-xs font-mono font-black text-zinc-500">{(index + 1).toString().padStart(2, '0')}</span>
                                                </td>
                                                <td className="px-2 sm:px-4 py-3 sm:py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-white uppercase tracking-tighter">
                                                                {item.product_name || `Item ${index + 1}`}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                                                {item.size}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                            <span className="text-[10px] font-medium text-zinc-500 uppercase">
                                                                {item.color || 'CORES SORTIDAS'} • {item.gender}
                                                            </span>
                                                            <span className="text-[10px] font-medium text-zinc-500 uppercase">
                                                                Pç: {item.sleeve_type} {item.has_band ? '+ Golas/Punhos' : ''} {item.fit && '• Modelagem ' + item.fit}
                                                            </span>
                                                            {item.fabric_name && (
                                                                <span className="text-[10px] font-black text-amber-500/80 uppercase">
                                                                    Tecido: {item.fabric_name}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.prod_notes && item.prod_notes.trim() && (
                                                            <div className="mt-2 bg-amber-500/5 px-3 py-2 rounded-xl border border-amber-500/10 w-fit">
                                                                <p className="text-[10px] font-bold text-amber-500/80 italic">
                                                                    " {item.prod_notes} "
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 sm:px-6 py-3 sm:py-4 text-center items-center justify-center">
                                                    <div className="inline-flex whitespace-nowrap py-1 px-2 sm:px-4 bg-zinc-900 text-amber-500 text-sm font-black rounded-lg border border-zinc-800">
                                                        {item.quantity} un
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Customizations / Extras in one row */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Customizations */}
                            {(order.customizations || []).length > 0 && (
                                <div className="p-6 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] mb-4">Personalizações de Arte</p>
                                    <div className="space-y-3">
                                        {order.customizations!.map(c => (
                                            <div key={c.id} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800 p-3 rounded-xl">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{translateCustType(c.type)} • {c.quantity} un</span>
                                                    <span className="text-[10px] font-medium text-zinc-500 uppercase">{c.description || '-'} • Pos: {c.position || '-'}</span>
                                                </div>
                                                {!isFactoryMode && (
                                                    <span className="text-[10px] font-black text-zinc-400">{formatCurrency(c.total)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Extras */}
                            {(order.extras || []).length > 0 && (
                                <div className="p-6 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                                    <p className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.2em] mb-4">Serviços Adicionais</p>
                                    <div className="space-y-3">
                                        {order.extras!.map(e => (
                                            <div key={e.id} className="flex justify-between items-center bg-zinc-950/50 border border-zinc-800 p-3 rounded-xl">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{e.description || '-'}</span>
                                                    <span className="text-[10px] font-medium text-zinc-500 uppercase">{(e.quantity || 0)} unidades</span>
                                                </div>
                                                {!isFactoryMode && (
                                                    <span className="text-[10px] font-black text-zinc-400">{formatCurrency(e.total || 0)}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Totals + Info */}
                        <div className="px-6 py-6 flex flex-col md:flex-row gap-8">
                            <div className="flex-1 space-y-6">
                                <div className="flex items-center gap-4 bg-zinc-950/50 border border-zinc-800 p-4 rounded-xl">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-lg">
                                        <Calendar size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Data Limite de Entrega</span>
                                        <span className="text-xs font-black text-amber-500 uppercase tracking-wider mt-1">{formatDate(order.deadline)}</span>
                                    </div>
                                </div>

                                {hasNotes && (
                                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                                            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Observações do Pedido</p>
                                        </div>
                                        <p className="text-[11px] text-zinc-400 font-medium leading-relaxed whitespace-pre-wrap">{order.notes}</p>
                                    </div>
                                )}
                            </div>

                            {!isFactoryMode && (
                                <div className="w-full md:w-72">
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Base Pçs</span>
                                            <span className="text-[11px] font-black text-zinc-400">{formatCurrency(subtotalBase)}</span>
                                        </div>

                                        {(order.discount ?? 0) > 0 && (
                                            <div className="flex justify-between items-center py-1 border-t border-zinc-900 pt-3 mt-2">
                                                <span className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest">Desconto</span>
                                                <span className="text-[11px] font-black text-rose-500/80">-{formatCurrency(order.discount || 0)}</span>
                                            </div>
                                        )}

                                        <div className="pt-6 border-t border-zinc-800 flex flex-col items-end mt-4">
                                            <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-1">Total Confirmado</span>
                                            <span className="text-3xl font-black text-white tracking-tighter leading-none">
                                                {formatCurrency(order.total_amount || 0)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default OrderPreviewModal;

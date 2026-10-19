import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Check, Scissors, Image as ImageIcon } from 'lucide-react';

interface Props {
    orderNumber: string;
    photoCount: number;
    onConfirm: (incluirFotos: boolean) => void;
    onClose: () => void;
}

/**
 * O que entra no PDF da ficha.
 *
 * A ficha de corte sai sempre, e a especificação técnica vive dentro dela — não
 * há mais folha separada. Sobra uma escolha: anexar as fotos de referência, que
 * custam papel e tinta de verdade.
 */
export function FichaOptionsModal({ orderNumber, photoCount, onConfirm, onClose }: Props) {
    const [comFotos, setComFotos] = useState(false);

    const paginas = 1 + (comFotos ? Math.ceil(photoCount / 4) : 0);

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <div>
                        <h3 className="text-white font-black uppercase tracking-tight flex items-center gap-2">
                            <Printer size={16} className="text-amber-500" /> Imprimir ficha
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                            Pedido #{orderNumber}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="p-5 space-y-2.5">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800">
                        <Scissors size={15} className="text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[11px] font-black text-white uppercase tracking-wider">Ficha de corte</p>
                            <p className="text-[10px] text-zinc-500 font-medium">
                                Enfestos, grade, parciais e conferência. A especificação técnica —
                                tecido, cor, manga, modelagem, gênero e faixa — vem em cada bloco.
                            </p>
                        </div>
                    </div>

                    <Opcao
                        ativo={comFotos}
                        onToggle={() => photoCount > 0 && setComFotos(!comFotos)}
                        desabilitado={photoCount === 0}
                        icone={<ImageIcon size={15} />}
                        titulo={photoCount > 0
                            ? `Fotos de referência (${photoCount})`
                            : 'Fotos de referência — nenhuma anexada'}
                        descricao={photoCount > 0
                            ? 'Anexadas em folha própria, 4 por página. Gasta tinta.'
                            : 'Anexe as fotos no orçamento para poder imprimi-las aqui.'}
                    />
                </div>

                <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800">
                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mr-auto">
                        {paginas} folha{paginas > 1 ? 's' : ''}
                    </span>
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(comFotos)}
                        className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black hover:bg-amber-400 active:scale-95 transition-all"
                    >
                        Gerar PDF
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

function Opcao({ ativo, onToggle, icone, titulo, descricao, desabilitado }: {
    ativo: boolean;
    onToggle: () => void;
    icone: React.ReactNode;
    titulo: string;
    descricao: string;
    desabilitado?: boolean;
}) {
    return (
        <div
            onClick={desabilitado ? undefined : onToggle}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                desabilitado ? 'bg-zinc-950/30 border-zinc-900 opacity-50 cursor-not-allowed'
                : ativo ? 'bg-amber-500/10 border-amber-500/30 cursor-pointer'
                : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 cursor-pointer'
            }`}
        >
            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                ativo ? 'bg-amber-500 border-amber-500 text-black' : 'border-zinc-600 bg-zinc-950'
            }`}>
                {ativo && <Check size={12} strokeWidth={4} />}
            </div>
            <div className={ativo ? 'text-amber-400' : 'text-zinc-400'}>{icone}</div>
            <div className="min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-wider ${ativo ? 'text-amber-400' : 'text-zinc-300'}`}>
                    {titulo}
                </p>
                <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">{descricao}</p>
            </div>
        </div>
    );
}

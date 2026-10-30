import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { comprasRepository } from '@/repositories/comprasRepository';
import { useEscFecha } from '@/hooks/useEscFecha';
import { parseBRL } from '@/utils/currency';
import { numero } from '@/utils/numeros';
import { ajusteDeContagem } from '@/utils/fabrica/ajusteDeContagem';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    insumo: { id: string; name: string; unit: string; current_stock: number; average_unit_cost: number };
    onClose: () => void;
    onDone: () => void;
}

/** Corrige o saldo do estoque para o que foi contado na prateleira: `ajustar_contagem`. */
export function AjustarContagemModal({ insumo, onClose, onDone }: Props) {
    const [contado, setContado] = useState('');
    const [custo, setCusto] = useState('');
    const [gravando, setGravando] = useState(false);
    const [erro, setErro] = useState('');

    const ajuste = ajusteDeContagem(insumo.current_stock, contado, custo, insumo.average_unit_cost);
    const podeAjustar = ajuste.podeAjustar && !gravando;

    const fechar = () => { if (!gravando) onClose(); };
    useEscFecha(true, fechar);

    const ajustar = async () => {
        if (!podeAjustar) return;
        setGravando(true); setErro('');
        try {
            await comprasRepository.ajustarContagem(insumo.id, parseBRL(contado), ajuste.custo);
            onDone();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao ajustar a contagem'));
            setGravando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/70 flex items-center justify-center p-4" onClick={fechar}>
            <div role="dialog" aria-modal="true" aria-label="Ajustar contagem"
                className={`${CARTAO} max-w-md w-full max-h-[85vh] flex flex-col`}
                onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3">
                    <div className="flex-1 min-w-0">
                        <p className={ROTULO}>Ajustar contagem</p>
                        <p className="text-sm font-bold text-zinc-200 mt-1 truncate">{insumo.name}</p>
                    </div>
                    <button type="button" aria-label="Fechar" title="Fechar" onClick={fechar}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 space-y-4">
                    <p className="text-xs font-mono text-zinc-400">
                        Saldo no sistema: <span className="text-white font-bold">{numero(insumo.current_stock)} {insumo.unit}</span>
                    </p>
                    <label className="flex flex-col gap-1">
                        <span className={ROTULO_PEQUENO}>Saldo contado ({insumo.unit})</span>
                        <input className={`${CAMPO} w-full`} inputMode="decimal" autoFocus value={contado} disabled={gravando}
                            onChange={e => setContado(e.target.value)} />
                    </label>
                    {ajuste.texto && (
                        <p className={`text-xs font-bold ${ajuste.diferenca > 0 ? 'text-emerald-400' : ajuste.diferenca < 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                            {ajuste.texto}{ajuste.diferenca !== 0 && ` ${insumo.unit}`}
                        </p>
                    )}
                    {ajuste.pedeCusto && (
                        <label className="flex flex-col gap-1">
                            <span className={ROTULO_PEQUENO}>Custo unitário (R$ por {insumo.unit})</span>
                            <input className={`${CAMPO} w-full`} inputMode="decimal" value={custo} disabled={gravando}
                                onChange={e => setCusto(e.target.value)} />
                            <span className="text-[11px] text-zinc-500">Este insumo ainda não tem custo médio: informe quanto custa a sobra encontrada.</span>
                        </label>
                    )}
                    {erro && <p className="text-[11px] font-bold text-rose-400">{erro}</p>}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
                    <button type="button" onClick={fechar} disabled={gravando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={ajustar} disabled={!podeAjustar} className={BOTAO_PRINCIPAL}>
                        {gravando ? 'Ajustando…' : 'Ajustar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

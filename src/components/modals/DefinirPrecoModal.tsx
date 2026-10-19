import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { storageService } from '@/services/storage';
import { useEscFecha } from '@/hooks/useEscFecha';
import { precoDeReferencia } from '@/utils/fabrica/tecidosSemPreco';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Props {
    insumo: { id: string; name: string; unit: string };
    onClose: () => void;
    onDone: () => void;
}

/**
 * Preço de referência de um insumo sem saldo: é o que o lucro por pedido usa quando o insumo ainda não
 * tem compra lançada. Com saldo, o preço é o do estoque e muda pelo Ajustar contagem.
 */
export function DefinirPrecoModal({ insumo, onClose, onDone }: Props) {
    const [texto, setTexto] = useState('');
    const [gravando, setGravando] = useState(false);
    const [erro, setErro] = useState('');
    const preco = precoDeReferencia(texto);

    const fechar = () => { if (!gravando) onClose(); };
    useEscFecha(true, fechar);

    const gravar = async () => {
        if (preco === null || gravando) return;
        setGravando(true); setErro('');
        try {
            await storageService.definirPrecoDeReferencia(insumo.id, preco);
            onDone();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao definir o preço');
            setGravando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/70 flex items-center justify-center p-4" onClick={fechar}>
            <div role="dialog" aria-modal="true" aria-label="Definir preço"
                className={`${CARTAO} max-w-md w-full max-h-[85vh] flex flex-col`}
                onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3">
                    <div className="flex-1 min-w-0">
                        <p className={ROTULO}>Definir preço</p>
                        <p className="text-sm font-bold text-zinc-200 mt-1 truncate">{insumo.name}</p>
                    </div>
                    <button type="button" aria-label="Fechar" title="Fechar" onClick={fechar}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 space-y-4">
                    <label className="flex flex-col gap-1">
                        <span className={ROTULO_PEQUENO}>Preço (R$ por {insumo.unit})</span>
                        <input className={`${CAMPO} w-full`} inputMode="decimal" autoFocus value={texto} disabled={gravando}
                            onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void gravar(); }} />
                        <span className="text-[11px] text-zinc-500">
                            Quanto custa hoje, do fornecedor. É o preço que o lucro por pedido usa até a primeira compra deste tecido ser lançada.
                        </span>
                    </label>
                    {erro && <p className="text-[11px] font-bold text-rose-400">{erro}</p>}
                </div>

                <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
                    <button type="button" onClick={fechar} disabled={gravando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={gravar} disabled={preco === null || gravando} className={BOTAO_PRINCIPAL}>
                        {gravando ? 'Gravando…' : 'Definir preço'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

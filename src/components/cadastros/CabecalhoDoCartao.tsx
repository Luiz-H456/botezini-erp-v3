import { ROTULO_DA_VIEW } from '@/utils/navegacao';
import type { View } from '@/utils/navegacao';
import { BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

/** Topo de cada cartão do fichário: volta ao fichário e diz em qual cadastro se está. */
export default function CabecalhoDoCartao({ view, onVoltar }: { view: View; onVoltar: () => void }) {
    return (
        <div className="mb-6 flex items-center gap-3">
            <button type="button" onClick={onVoltar} aria-label="Voltar ao fichário" className={BOTAO_SECUNDARIO}>← Cadastros</button>
            <h1 className="text-xl font-black uppercase tracking-tight text-white">{ROTULO_DA_VIEW[view]}</h1>
        </div>
    );
}

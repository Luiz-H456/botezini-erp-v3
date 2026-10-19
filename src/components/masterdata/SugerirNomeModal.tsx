import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Wand2, Check } from 'lucide-react';
import {
    montarNomeProduto, montarSkuProduto, PartesDoNome, Manga, Genero, Modelagem,
} from '@/utils/nomeProduto';

interface Props {
    /** Tecidos já cadastrados, para o nome usar o mesmo termo do estoque. */
    tecidos: string[];
    /** Nome/tecido já preenchidos no formulário, para abrir com algo pronto. */
    inicial?: PartesDoNome;
    onClose: () => void;
    onAplicar: (nome: string, sku: string) => void;
}

/** Peças que a Botezini produz. Atalho de digitação — o campo é livre. */
const TIPOS_COMUNS = [
    'Camisa Social', 'Camisa Polo', 'Camiseta', 'Jaleco', 'Avental',
    'Calça', 'Bermuda', 'Colete', 'Jaqueta', 'Macacão', 'Túnica',
];

const MANGAS: { v: Manga; l: string }[] = [
    { v: 'manga_curta', l: 'Manga curta' },
    { v: 'manga_longa', l: 'Manga longa' },
    { v: 'sem_manga', l: 'Sem manga' },
];
const GENEROS: { v: Genero; l: string }[] = [
    { v: 'masculino', l: 'Masc' }, { v: 'feminino', l: 'Fem' },
    { v: 'infantil', l: 'Infantil' }, { v: 'unissex', l: 'Unissex' },
];
const MODELAGENS: { v: Modelagem; l: string }[] = [
    { v: 'slim', l: 'Slim' }, { v: 'regular', l: 'Regular' },
    { v: 'oversized', l: 'Oversized' }, { v: 'babylook', l: 'Babylook' },
    { v: 'plus_size', l: 'Plus size' },
];

/** Botão de opção que alterna: clicar no que já está escolhido desmarca. */
function Opcao<T extends string>({ valor, atual, rotulo, onPick }: {
    valor: T; atual: T | ''; rotulo: string; onPick: (v: T | '') => void;
}) {
    const ativo = atual === valor;
    return (
        <button type="button" onClick={() => onPick(ativo ? '' : valor)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${
                ativo
                    ? 'bg-amber-500 text-black border-amber-500'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
            }`}>
            {rotulo}
        </button>
    );
}

function Campo({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                {titulo}
                {dica && <span className="text-zinc-700 normal-case tracking-normal font-bold"> · {dica}</span>}
            </label>
            {children}
        </div>
    );
}

/**
 * Monta o nome da peça no padrão da casa.
 *
 * Só pergunta o que muda a ficha técnica — manga, gênero e modelagem alteram o
 * consumo de tecido, então cada combinação é um produto diferente. Cor e
 * tamanho ficam de fora: variam por pedido, não por produto.
 */
export const SugerirNomeModal: React.FC<Props> = ({ tecidos, inicial, onClose, onAplicar }) => {
    const [p, setP] = useState<PartesDoNome>({
        tipo: inicial?.tipo || '',
        manga: inicial?.manga || '',
        genero: inicial?.genero || '',
        modelagem: inicial?.modelagem || '',
        tecido: inicial?.tecido || '',
        faixaRefletiva: inicial?.faixaRefletiva || false,
    });

    const nome = useMemo(() => montarNomeProduto(p), [p]);
    const sku = useMemo(() => montarSkuProduto(p), [p]);
    const podeAplicar = nome.length > 0;

    const set = (campo: keyof PartesDoNome) => (v: any) => setP(a => ({ ...a, [campo]: v }));

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <Wand2 size={19} className="text-amber-500" />
                        </div>
                        <div>
                            <h3 className="text-white font-black uppercase tracking-tight">Nome padrão da peça</h3>
                            <p className="text-[10px] text-zinc-500 font-bold">Escolha o que define a peça — o nome se monta sozinho</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-4">
                    <Campo titulo="Tipo de peça" dica="obrigatório">
                        <input
                            value={p.tipo || ''} onChange={e => set('tipo')(e.target.value)}
                            placeholder="Camisa Polo"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 placeholder:text-zinc-700 mb-2"
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {TIPOS_COMUNS.map(t => (
                                <button key={t} type="button" onClick={() => set('tipo')(t)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                        (p.tipo || '').toUpperCase() === t.toUpperCase()
                                            ? 'bg-amber-500 text-black border-amber-500'
                                            : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-700'
                                    }`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                    </Campo>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Campo titulo="Manga" dica="muda o consumo">
                            <div className="flex flex-wrap gap-1.5">
                                {MANGAS.map(m => <Opcao key={m.v} valor={m.v} atual={p.manga || ''} rotulo={m.l} onPick={set('manga')} />)}
                            </div>
                        </Campo>
                        <Campo titulo="Gênero" dica="muda a modelagem">
                            <div className="flex flex-wrap gap-1.5">
                                {GENEROS.map(g => <Opcao key={g.v} valor={g.v} atual={p.genero || ''} rotulo={g.l} onPick={set('genero')} />)}
                            </div>
                        </Campo>
                    </div>

                    <Campo titulo="Modelagem" dica="deixe vazio se não especifica">
                        <div className="flex flex-wrap gap-1.5">
                            {MODELAGENS.map(m => <Opcao key={m.v} valor={m.v} atual={p.modelagem || ''} rotulo={m.l} onPick={set('modelagem')} />)}
                        </div>
                    </Campo>

                    <Campo titulo="Tecido" dica="use o mesmo termo do estoque">
                        <input
                            value={p.tecido || ''} onChange={e => set('tecido')(e.target.value)}
                            placeholder="Piquê"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 placeholder:text-zinc-700 mb-2"
                        />
                        {tecidos.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {tecidos.slice(0, 12).map(t => (
                                    <button key={t} type="button" onClick={() => set('tecido')(t)}
                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                            (p.tecido || '').toUpperCase() === t.toUpperCase()
                                                ? 'bg-amber-500 text-black border-amber-500'
                                                : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-white hover:border-zinc-700'
                                        }`}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Campo>

                    <button type="button" onClick={() => set('faixaRefletiva')(!p.faixaRefletiva)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 border rounded-xl transition-all ${
                            p.faixaRefletiva ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                        }`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${p.faixaRefletiva ? 'text-amber-500' : 'text-zinc-500'}`}>
                            {p.faixaRefletiva ? 'Com faixa refletiva' : 'Sem faixa refletiva'}
                        </span>
                        <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${p.faixaRefletiva ? 'bg-amber-500' : 'bg-zinc-800'}`}>
                            <div className={`w-3 h-3 bg-zinc-950 rounded-full transition-transform ${p.faixaRefletiva ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </button>

                    {/* Prévia — mostra exatamente o que vai ser gravado */}
                    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                        <div>
                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">Nome</p>
                            <p className="text-sm font-black text-white break-words">
                                {nome || <span className="text-zinc-700">escolha ao menos o tipo de peça</span>}
                            </p>
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">SKU sugerido</p>
                            <p className="text-sm font-mono font-bold text-amber-400 break-words">{sku || '—'}</p>
                            <p className="text-[10px] text-zinc-600 font-bold mt-0.5">
                                só preenche se o campo SKU estiver vazio — não sobrescreve o que você já digitou
                            </p>
                        </div>
                    </div>

                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                        A ordem é sempre <span className="text-zinc-500">tipo → manga → gênero → modelagem → tecido → faixa</span>,
                        e o que você deixa vazio simplesmente não aparece. Cor e tamanho não entram: mudam a cada pedido,
                        não a peça. Manga, gênero e modelagem entram porque mudam o consumo de tecido — cada combinação
                        é um produto com ficha técnica própria.
                    </p>
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-900">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                        Cancelar
                    </button>
                    <button onClick={() => onAplicar(nome, sku)} disabled={!podeAplicar}
                        className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 flex items-center justify-center gap-2">
                        <Check size={14} /> Usar este nome
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SugerirNomeModal;

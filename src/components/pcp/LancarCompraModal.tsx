import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Insumo, Supplier } from '@/types';
import type { PurchaseLine } from '@/utils/purchaseList';
import type { PedidoAtivo } from '@/hooks/pcp/usePurchaseList';
import { comprasRepository } from '@/repositories/comprasRepository';
import { useEscFecha } from '@/hooks/useEscFecha';
import SearchableSelect from '@/components/common/SearchableSelect';
import { parseBRL } from '@/utils/currency';
import { numero } from '@/utils/numeros';
import { reais } from '@/utils/financas/base';
import {
    partesSugeridas, erroDoItem, somaDasPartes, itensParaLancar, totalDaCompra, diaLocal, deveResugerir, custoSugerido,
} from '@/utils/fabrica/lancarCompra';
import type { ItemForm } from '@/utils/fabrica/lancarCompra';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Props {
    /** Todas as linhas da Lista: dão a divisão sugerida de qualquer insumo que esteja nela. */
    linhas: PurchaseLine[];
    insumos: Insumo[];
    suppliers: Supplier[];
    pedidos: PedidoAtivo[];
    onClose: () => void;
    onDone: () => void;
}

/** `editadas`: a pessoa mexeu nas partes à mão; mudar a quantidade não as refaz mais. */
type ItemUI = ItemForm & { key: number; editadas: boolean };

const ICONE = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 disabled:opacity-40';

/** Lança a compra inteira de uma vez, cada item dividido entre pedidos e estoque (`lancar_compra`). */
export function LancarCompraModal({ linhas, insumos, suppliers, pedidos, onClose, onDone }: Props) {
    const insumoPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);
    const faltaDe = (insumoId: string) => linhas.find(l => l.insumo_id === insumoId)?.pedidos ?? [];

    // Parte da Lista: tudo o que falta já preenchido, cada item com a divisão sugerida.
    const [itens, setItens] = useState<ItemUI[]>(() => {
        const faltando = linhas.filter(l => l.is_shortage);
        const base: ItemUI[] = faltando.map((l, k) => ({
            key: k, editadas: false, insumoId: l.insumo_id, quantidade: numero(l.to_buy),
            custo: l.unit_cost > 0 ? numero(l.unit_cost, 4) : '',
            partes: partesSugeridas(l.to_buy, l.pedidos),
        }));
        return base.length ? base : [{ key: 0, editadas: false, insumoId: '', quantidade: '', custo: '', partes: [] }];
    });
    const [proxima, setProxima] = useState(() => Math.max(1, linhas.filter(l => l.is_shortage).length));
    const [fornecedorId, setFornecedorId] = useState('');
    const [fornecedorNome, setFornecedorNome] = useState('');
    const [data, setData] = useState(() => diaLocal(new Date()));
    const [notas, setNotas] = useState('');
    const [gravando, setGravando] = useState(false);
    const [erro, setErro] = useState('');

    const fechar = () => { if (!gravando) onClose(); };
    useEscFecha(true, fechar);

    const mudar = (key: number, parte: Partial<ItemUI>) =>
        setItens(ls => ls.map(i => (i.key === key ? { ...i, ...parte } : i)));
    const refazPartes = (insumoId: string, quantidade: string) =>
        partesSugeridas(parseBRL(quantidade), faltaDe(insumoId));
    const mudarParte = (key: number, n: number, parte: Partial<ItemForm['partes'][number]>) =>
        setItens(ls => ls.map(i => (i.key === key
            ? { ...i, editadas: true, partes: i.partes.map((p, k) => (k === n ? { ...p, ...parte } : p)) } : i)));
    const mudarQuantidade = (item: ItemUI, quantidade: string) =>
        mudar(item.key, deveResugerir('quantidade', item.editadas)
            ? { quantidade, partes: refazPartes(item.insumoId, quantidade) }
            : { quantidade });

    const escolherInsumo = (item: ItemUI, insumoId: string) => {
        mudar(item.key, {
            insumoId, custo: custoSugerido(insumoPorId.get(insumoId)?.average_unit_cost),
            editadas: false, partes: refazPartes(insumoId, item.quantidade),
        });
    };

    const primeiroProblema = itens.length === 0 ? 'Inclua ao menos um item'
        : (() => {
            const n = itens.findIndex(i => erroDoItem(i) !== null);
            return n < 0 ? '' : `Item ${n + 1}: ${erroDoItem(itens[n])}`;
        })();
    const lancaveis = primeiroProblema === '';
    const total = totalDaCompra(itensParaLancar(itens.filter(i => erroDoItem(i) === null)));

    const lancar = async () => {
        if (!lancaveis || gravando) return;
        setGravando(true); setErro('');
        try {
            await comprasRepository.lancarCompra(
                { fornecedor_id: fornecedorId || undefined, fornecedor_nome: fornecedorId ? undefined : fornecedorNome.trim() || undefined, data, notas: notas.trim() || undefined },
                itensParaLancar(itens),
            );
            onDone();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao lançar a compra');
            setGravando(false);
        }
    };

    const optsFornecedor = [{ value: '', label: '— nenhum cadastrado —' },
        ...suppliers.map(s => ({ value: s.id, label: s.company_name }))];
    const optsInsumo = insumos.map(i => ({ value: i.id, label: `${i.name} (${i.unit})` }));

    return createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/70 flex items-center justify-center p-4" onClick={fechar}>
            <div role="dialog" aria-modal="true" aria-label="Lançar compra"
                className={`${CARTAO} max-w-3xl w-full max-h-[90vh] flex flex-col`}
                onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-start gap-3 px-5 pt-5 pb-3">
                    <div className="flex-1 min-w-0">
                        <p className={ROTULO}>Lançar compra</p>
                        <p className={`${ROTULO_PEQUENO} mt-1`}>
                            Cada parte vai para um pedido ou para o estoque. Não cria conta a pagar.
                        </p>
                    </div>
                    <button type="button" aria-label="Fechar" title="Fechar" onClick={fechar}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 space-y-4">
                    <fieldset disabled={gravando} className="space-y-4 min-w-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <span className={ROTULO_PEQUENO}>Fornecedor</span>
                                <SearchableSelect options={optsFornecedor} value={fornecedorId} placeholder="Escolher cadastrado"
                                    onChange={v => { setFornecedorId(v); if (v) setFornecedorNome(''); }} />
                                <input className={`${CAMPO} w-full`} placeholder="ou digite o nome" value={fornecedorNome}
                                    aria-label="Nome do fornecedor"
                                    onChange={e => { setFornecedorNome(e.target.value); if (e.target.value) setFornecedorId(''); }} />
                            </div>
                            <div className="flex flex-col gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className={ROTULO_PEQUENO}>Data</span>
                                    <input type="date" className={`${CAMPO} w-full`} value={data} onChange={e => setData(e.target.value)} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className={ROTULO_PEQUENO}>Notas</span>
                                    <input className={`${CAMPO} w-full`} value={notas} onChange={e => setNotas(e.target.value)} />
                                </label>
                            </div>
                        </div>

                        {itens.map(it => {
                            const ins = insumoPorId.get(it.insumoId);
                            const unidade = ins?.unit ?? '';
                            const pronto = !!it.insumoId && parseBRL(it.quantidade) > 0;
                            const problema = pronto ? erroDoItem(it) : null;
                            return (
                                <div key={it.key} className={`${ITEM} p-3 space-y-3`}>
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="flex-1 min-w-[12rem] flex flex-col gap-1">
                                            <span className={ROTULO_PEQUENO}>Insumo</span>
                                            <SearchableSelect options={optsInsumo} value={it.insumoId} placeholder="Escolher insumo"
                                                onChange={v => escolherInsumo(it, v)} />
                                        </div>
                                        <label className="flex flex-col gap-1">
                                            <span className={ROTULO_PEQUENO}>Quantidade{unidade ? ` (${unidade})` : ''}</span>
                                            <input className={`${CAMPO} w-28`} inputMode="decimal" value={it.quantidade}
                                                onChange={e => mudarQuantidade(it, e.target.value)} />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className={ROTULO_PEQUENO}>Custo unitário</span>
                                            <input className={`${CAMPO} w-28`} inputMode="decimal" value={it.custo}
                                                onChange={e => mudar(it.key, { custo: e.target.value })} />
                                        </label>
                                        <button type="button" aria-label="Tirar este item" title="Tirar este item" className={`${ICONE} mb-1`}
                                            onClick={() => setItens(ls => ls.filter(x => x.key !== it.key))}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {it.partes.length > 0 && (
                                        <div className="space-y-2 pl-1">
                                            <span className={ROTULO_PEQUENO}>Divisão</span>
                                            {it.partes.map((p, n) => (
                                                <div key={n} className="flex items-center gap-2">
                                                    <select className={`${CAMPO} flex-1 min-w-0`} value={p.destino} aria-label="Destino da parte"
                                                        onChange={e => mudarParte(it.key, n, { destino: e.target.value })}>
                                                        <option value="">Estoque</option>
                                                        {pedidos.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
                                                    </select>
                                                    <input className={`${CAMPO} w-28`} inputMode="decimal" value={p.quantidade} aria-label="Quantidade da parte"
                                                        onChange={e => mudarParte(it.key, n, { quantidade: e.target.value })} />
                                                    <button type="button" aria-label="Tirar esta parte" title="Tirar esta parte" className={ICONE}
                                                        onClick={() => mudar(it.key, { editadas: true, partes: it.partes.filter((_, k) => k !== n) })}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button type="button" disabled={!it.insumoId}
                                            onClick={() => mudar(it.key, { editadas: true, partes: [...it.partes, { destino: '', quantidade: '' }] })}
                                            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 disabled:opacity-40">
                                            <Plus size={14} /> parte
                                        </button>
                                        {it.editadas && it.insumoId && (
                                            <button type="button"
                                                onClick={() => mudar(it.key, { editadas: false, partes: refazPartes(it.insumoId, it.quantidade) })}
                                                className="text-[10px] font-black uppercase tracking-widest text-zinc-400 underline hover:text-white">
                                                Redividir
                                            </button>
                                        )}
                                        {pronto && it.partes.length > 0 && (
                                            <span className="text-[10px] font-mono text-zinc-500">
                                                Partes: {numero(somaDasPartes(it))} de {numero(parseBRL(it.quantidade))} {unidade}
                                            </span>
                                        )}
                                        {problema && <span className="text-[11px] font-bold text-rose-400">{problema}</span>}
                                    </div>
                                </div>
                            );
                        })}

                        <button type="button" onClick={() => {
                            setItens(ls => [...ls, { key: proxima, editadas: false, insumoId: '', quantidade: '', custo: '', partes: [] }]);
                            setProxima(k => k + 1);
                        }} className={BOTAO_SECUNDARIO}>
                            <Plus size={14} /> item
                        </button>
                    </fieldset>
                </div>

                {erro && <p className="shrink-0 px-5 pt-2 text-[11px] font-bold text-rose-400">{erro}</p>}
                {!lancaveis && !gravando && <p className="shrink-0 px-5 pt-2 text-[11px] font-bold text-rose-400">{primeiroProblema}</p>}

                <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-4 border-t border-zinc-800">
                    <p className="text-xs font-mono text-zinc-300 mr-auto">Total {reais(total)}</p>
                    <button type="button" onClick={fechar} disabled={gravando} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={lancar} disabled={!lancaveis || gravando} className={BOTAO_PRINCIPAL}>
                        {gravando ? 'Lançando…' : 'Lançar compra'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

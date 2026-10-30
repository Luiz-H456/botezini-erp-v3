import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Wand2, X } from 'lucide-react';
import SearchableSelect from '@/components/common/SearchableSelect';
import SugerirNomeModal from '@/components/masterdata/SugerirNomeModal';
import { storageService } from '@/services/storage';
import { idService } from '@/services/idService';
import { parseBRL } from '@/utils/currency';
import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
import { useEscFecha } from '@/hooks/useEscFecha';
import type { Insumo, Product } from '@/types';
import type { LinhaDaFicha } from '@/utils/fabrica/planilhaDeProdutos';
import { ehTecido } from '@/utils/fabrica/planilhaDeProdutos';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

const fmt = (v: number | null | undefined, casas = 2) => (Number(v) > 0 ? Number(v).toFixed(casas).replace('.', ',') : '');

/**
 * Produto novo pela planilha (parte C, 30/10): só o que o custo e a compra precisam — nome (montado
 * pelas sugestões, como no cadastro), tecido, consumo e os três preços. Grava o produto e a ficha
 * juntos: sem a linha de tecido na ficha, o pedido deste produto não compraria tecido.
 *
 * "Duplicar" abre já preenchido a partir de um produto parecido e copia os aviamentos da ficha dele.
 */
export function NovoProdutoRapido({ base, fichaDaBase, tecidos, onClose, onCriou }: {
    base?: Product | null;
    fichaDaBase?: LinhaDaFicha[];
    tecidos: Insumo[];
    onClose: () => void;
    /** `aviso` quando o produto foi criado mas a ficha não: quem chama mostra como erro. */
    onCriou: (produto: Product, aviso?: string) => void;
}) {
    const [nome, setNome] = useState('');
    const [sku, setSku] = useState('');
    const [tecidoId, setTecidoId] = useState(base?.default_fabric_insumo_id ?? '');
    const [consumo, setConsumo] = useState(fmt(base?.fabric_consumption_m, 3));
    const [precos, setPrecos] = useState([fmt(base?.price_tier1), fmt(base?.price_tier2), fmt(base?.price_tier3)]);
    const [sugerindo, setSugerindo] = useState(!base);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const saida = useSaidaProtegida(() => { if (!salvando) onClose(); });
    useEscFecha(!sugerindo, saida.pedirParaFechar);

    const nomeDoTecido = tecidos.find(t => t.id === tecidoId)?.name ?? '';
    const aviamentos = (fichaDaBase ?? []).filter(l => !ehTecido(tecidos.find(t => t.id === l.insumo_id)) && l.insumo_id !== base?.default_fabric_insumo_id);

    const salvar = async () => {
        setErro('');
        if (!nome.trim()) { setErro('Dê um nome ao produto: use "Sugerir nome" para montar no padrão.'); return; }
        const qtd = parseBRL(consumo);
        if (tecidoId && !(qtd > 0)) { setErro('Com tecido escolhido, informe quantos metros a peça consome.'); return; }
        setSalvando(true);
        try {
            const novo: Product = {
                id: idService.generateUUID(),
                name: nome.trim().toUpperCase(),
                sku: sku.trim() || undefined,
                category: base?.category,
                global_category_id: base?.global_category_id,
                default_fabric_insumo_id: tecidoId || undefined,
                fabric_consumption_m: qtd > 0 ? qtd : undefined,
                price_tier1: parseBRL(precos[0]) || 0,
                price_tier2: parseBRL(precos[1]) || 0,
                price_tier3: parseBRL(precos[2]) || 0,
                overhead_percent: base?.overhead_percent,
                labor_hourly_rate: base?.labor_hourly_rate,
                labor_workers: base?.labor_workers,
                pieces_daily_capacity: base?.pieces_daily_capacity,
            } as Product;
            const salvo = await storageService.saveProduct(novo);
            // A ficha vem depois do produto (chave estrangeira). Se falhar aqui, o produto existe e a
            // planilha mostra "sem ficha" nele — o aviso diz o que faltou em vez de fingir que deu certo.
            try {
                if (tecidoId && qtd > 0) await storageService.saveProductInsumo({ product_id: salvo.id, insumo_id: tecidoId, quantity: qtd });
                for (const l of aviamentos) await storageService.saveProductInsumo({ product_id: salvo.id, insumo_id: l.insumo_id, quantity: l.quantity });
            } catch (e) {
                onCriou(salvo, `${salvo.name} criado, mas a ficha não foi gravada: ${mensagemDeErro(e, 'falha')}. Complete pelo cadastro.`);
                return;
            }
            onCriou(salvo);
        } catch (e) {
            setErro(mensagemDeErro(e, 'Não consegui criar o produto.'));
        } finally {
            setSalvando(false);
        }
    };

    if (sugerindo) {
        return (
            <SugerirNomeModal
                tecidos={tecidos.map(t => t.name)}
                inicial={nomeDoTecido ? { tecido: nomeDoTecido } : undefined}
                onClose={() => { setSugerindo(false); if (!nome && !base) onClose(); }}
                onAplicar={(n, s) => { setNome(n); setSku(s); setSugerindo(false); saida.marcarMexeu(); }}
            />
        );
    }

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/70 flex items-center justify-center p-4" onClick={saida.pedirParaFechar}>
            <div role="dialog" aria-modal="true" aria-label="Novo produto" className={`${CARTAO} max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4`}
                onClick={e => e.stopPropagation()} {...saida.aoMexer}>
                <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <p className={ROTULO}>{base ? `Novo produto a partir de ${base.name}` : 'Novo produto'}</p>
                        <p className={`${ROTULO_PEQUENO} mt-1`}>Grava o produto e a ficha{base ? `, com a categoria e a mão de obra de ${base.name}` : ''}. Fotos, notas e o resto ficam no cadastro.</p>
                    </div>
                    <button type="button" aria-label="Fechar" title="Fechar" onClick={saida.pedirParaFechar} className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><X size={18} /></button>
                </div>
                {erro && <p role="alert" className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{erro}</p>}
                <div>
                    <label htmlFor="np-nome" className={`${ROTULO_PEQUENO} block mb-1`}>Nome *</label>
                    <div className="flex gap-2">
                        <input id="np-nome" className={`${CAMPO} flex-1 min-w-0 uppercase`} value={nome} onChange={e => setNome(e.target.value)} placeholder="CAMISA POLO MANGA CURTA MASC PIQUET" />
                        <button type="button" onClick={() => setSugerindo(true)} className={`${BOTAO_SUAVE} shrink-0`}><Wand2 size={14} /> Sugerir nome</button>
                    </div>
                    {sku && <p className="text-[10px] text-zinc-500 mt-1 font-mono">SKU {sku}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                        <label className={`${ROTULO_PEQUENO} block mb-1`}>Tecido</label>
                        <SearchableSelect value={tecidoId} onChange={setTecidoId} placeholder="— Sem tecido —"
                            options={[{ value: '', label: '— Sem tecido —' }, ...tecidos.map(t => ({ value: t.id, label: t.name }))]} />
                    </div>
                    <div>
                        <label htmlFor="np-consumo" className={`${ROTULO_PEQUENO} block mb-1`}>Consumo (m/peça)</label>
                        <input id="np-consumo" inputMode="decimal" className={`${CAMPO} w-full`} value={consumo} onChange={e => setConsumo(e.target.value)} placeholder="1,400" />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {['Preço 1', 'Preço 2', 'Preço 3'].map((r, i) => (
                        <div key={r}>
                            <label htmlFor={`np-preco-${i}`} className={`${ROTULO_PEQUENO} block mb-1`}>{r}</label>
                            <input id={`np-preco-${i}`} inputMode="decimal" className={`${CAMPO} w-full`} value={precos[i]} placeholder="0,00"
                                onChange={e => setPrecos(p => p.map((v, k) => (k === i ? e.target.value : v)))} />
                        </div>
                    ))}
                </div>
                {aviamentos.length > 0 && (
                    <p className="text-[11px] text-zinc-400">Copia também {aviamentos.length} aviamento(s) da ficha de {base?.name}.</p>
                )}
                <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800/60">
                    <button type="button" onClick={saida.pedirParaFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>
                    <button type="button" onClick={salvar} disabled={salvando} className={BOTAO_PRINCIPAL}><Check size={14} /> {salvando ? 'Criando…' : 'Criar produto'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )}</>;
}

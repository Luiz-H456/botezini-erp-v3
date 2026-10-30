import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Users, Package, FileText, Truck, Shirt, Loader2, X } from 'lucide-react';
import { storageService } from '@/services/storage';
import { buscarEmTudo, type DadosDaBusca, type ResultadoDaBusca, type TipoDoResultado } from '@/utils/buscaGeral';
import { mensagemDeErro } from '@/utils/errorHandling';

const ICONE: Record<TipoDoResultado, typeof Search> = { cliente: Users, pedido: Package, orcamento: FileText, fornecedor: Truck, produto: Shirt };
const ROTULO: Record<TipoDoResultado, string> = { cliente: 'Cliente', pedido: 'Pedido', orcamento: 'Orçamento', fornecedor: 'Fornecedor', produto: 'Produto' };

// Lido uma vez por sessão e reaproveitado: abrir a busca de novo é instantâneo. Dados de minutos
// atrás bastam para achar um cadastro; a tela de destino lê o dado fresco.
let cache: Promise<DadosDaBusca> | null = null;
const carregar = () => (cache ??= Promise.all([
    storageService.getClients(), storageService.getOrders(), storageService.getBudgets(),
    storageService.getSuppliers(), storageService.getProducts(),
]).then(([clientes, pedidos, orcamentos, fornecedores, produtos]) => ({
    clientes, pedidos, orcamentos: orcamentos as DadosDaBusca['orcamentos'], fornecedores,
    produtos: produtos.map(p => ({ id: p.id, name: p.name, code: p.sku })),
})).catch(e => { cache = null; throw e; }));

/** Busca geral (Ctrl+K ou "/"): cliente, pedido, orçamento, fornecedor, produto — de qualquer tela. */
export function BuscaGeral({ aberta, onFechar, onAbrir }: { aberta: boolean; onFechar: () => void; onAbrir: (r: ResultadoDaBusca) => void }) {
    const [termo, setTermo] = useState('');
    const [dados, setDados] = useState<DadosDaBusca | null>(null);
    const [erro, setErro] = useState('');
    const [ativo, setAtivo] = useState(0);
    const campo = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!aberta) return;
        setTermo(''); setAtivo(0); setErro('');
        setTimeout(() => campo.current?.focus(), 0);
        carregar().then(setDados).catch(e => setErro(mensagemDeErro(e, 'Não consegui carregar a busca.')));
    }, [aberta]);

    const resultados = useMemo(() => (dados ? buscarEmTudo(termo, dados) : []), [dados, termo]);
    useEffect(() => { setAtivo(0); }, [termo]);

    if (!aberta) return null;
    const escolher = (r: ResultadoDaBusca | undefined) => { if (!r) return; onFechar(); onAbrir(r); };
    const aoTeclar = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(i => Math.min(i + 1, resultados.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo]); }
        else if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    };

    return createPortal(
        <div className="fixed inset-0 z-sobreposto bg-zinc-950/80 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onClick={onFechar}>
            <div role="dialog" aria-modal="true" aria-label="Busca geral" onClick={e => e.stopPropagation()}
                className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
                    <Search size={18} className="text-zinc-500 shrink-0" />
                    <input ref={campo} value={termo} onChange={e => setTermo(e.target.value)} onKeyDown={aoTeclar}
                        placeholder="Cliente, pedido, orçamento, fornecedor, produto…" aria-label="O que procurar"
                        className="h-14 flex-1 min-w-0 bg-transparent text-base text-white outline-none placeholder:text-zinc-600" />
                    {!dados && !erro && <Loader2 size={16} className="text-zinc-500 animate-spin shrink-0" />}
                    <kbd className="hidden sm:inline text-[10px] text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">Esc</kbd>
                    {/* No celular não há Esc, e com o teclado aberto quase não sobra "fora" para tocar. */}
                    <button type="button" onClick={onFechar} aria-label="Fechar a busca" className="sm:hidden -mr-2 inline-flex h-11 w-11 items-center justify-center text-zinc-500 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
                    {erro && <li className="px-4 py-3 text-sm text-rose-400">{erro}</li>}
                    {!erro && termo.trim().length >= 2 && dados && resultados.length === 0 && (
                        <li className="px-4 py-3 text-sm text-zinc-500">Nada encontrado para "{termo}".</li>
                    )}
                    {termo.trim().length < 2 && !erro && (
                        <li className="px-4 py-3 text-sm text-zinc-500">Digite ao menos 2 letras. Número do pedido funciona pelo fim: "47" acha PED-…-047.</li>
                    )}
                    {resultados.map((r, i) => {
                        const Icone = ICONE[r.tipo];
                        return (
                            <li key={`${r.tipo}-${r.id}`} role="option" aria-selected={i === ativo}>
                                <button type="button" onMouseEnter={() => setAtivo(i)} onClick={() => escolher(r)}
                                    className={`w-full min-h-11 flex items-center gap-3 px-4 py-2 text-left ${i === ativo ? 'bg-zinc-800' : ''}`}>
                                    <Icone size={16} className="text-amber-500 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-bold text-zinc-100">{r.titulo}</span>
                                        <span className="block truncate text-xs text-zinc-500">{r.detalhe}</span>
                                    </span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 shrink-0">{ROTULO[r.tipo]}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <p className="hidden sm:block border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-600">↑ ↓ para escolher · Enter abre · Ctrl+K ou / abre esta busca de qualquer tela</p>
            </div>
        </div>,
        document.body,
    );
}

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check } from 'lucide-react';
import { filtrarOpcoes } from '@/utils/filtrarOpcoes';

export interface Option {
    value: string;
    label: string;
    group?: string;
    isHeader?: boolean;
    /** Cor hex — quando presente, mostra a amostra ao lado do rótulo (cartela de tecidos). */
    swatch?: string;
}

export interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    isMobileDrawer?: boolean;
    /**
     * Campo subordinado — desenha em cinza, um degrau abaixo do resto.
     *
     * Serve para detalhe aninhado, como as peças de um conjunto dentro da
     * linha do orçamento: são complemento do item, não outro item. Sem isso,
     * três campos igualmente brancos dentro de outro campo competem com ele
     * pela atenção e a linha perde a leitura de hierarquia.
     */
    atenuado?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'Selecione...',
    className = '',
    atenuado = false,
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Posição do dropdown em portal — coordenadas de VIEWPORT (position: fixed).
    // Antes era `absolute` com window.scrollY somado e calculado só na abertura:
    // dentro de modal fixo ou de container com rolagem própria o campo andava e o
    // menu ficava para trás. Agora recalcula a cada rolagem de qualquer ancestral.
    const [dropdownPos, setDropdownPos] = useState<
        { top?: number; bottom?: number; left: number; width: number; alturaMaxima: number } | null>(null);

    const filteredOptions = useMemo(() => filtrarOpcoes(options, search), [options, search]);

    const selectableOptions = useMemo(() => filteredOptions.filter(o => !o.isHeader), [filteredOptions]);

    useEffect(() => {
        setHighlightedIndex(0);
    }, [search, isOpen]);

    const atualizarPosicao = useCallback(() => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        const espacoAbaixo = window.innerHeight - rect.bottom;
        // busca + lista + rodapé; se não couber embaixo e couber em cima, abre para cima
        const ALTURA_APROXIMADA = 380;
        const abrirParaCima = espacoAbaixo < ALTURA_APROXIMADA && rect.top > espacoAbaixo;

        // O menu acompanha a largura do campo, mas nunca fica estreito demais
        // para ler um nome de tecido — e nunca passa da janela.
        //
        // Numa tabela de orçamento em tela pequena o campo tem 90 px; com o
        // menu colado nele a lista virava uma coluna de reticências. O mínimo
        // resolvia isso, mas sem reposicionar a esquerda o menu escapava pela
        // direita justamente nas últimas colunas, que é onde ele é mais largo
        // que o campo.
        const MARGEM = 8;
        const LARGURA_MINIMA = 260;
        const largura = Math.min(
            Math.max(rect.width, LARGURA_MINIMA),
            window.innerWidth - MARGEM * 2,
        );
        const left = Math.max(
            MARGEM,
            Math.min(rect.left, window.innerWidth - largura - MARGEM),
        );

        setDropdownPos({
            top: abrirParaCima ? undefined : rect.bottom + 8,
            bottom: abrirParaCima ? window.innerHeight - rect.top + 8 : undefined,
            left,
            width: largura,
            // Limita ao espaço que existe de fato, em vez de confiar num teto
            // fixo que estoura a tela do celular.
            alturaMaxima: Math.max(200, (abrirParaCima ? rect.top : espacoAbaixo) - MARGEM * 2),
        });
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setDropdownPos(null);
            return;
        }
        atualizarPosicao();
        // capture: true é o essencial aqui — eventos de scroll não sobem na árvore,
        // então sem a fase de captura a rolagem de um container interno passaria batida.
        window.addEventListener('scroll', atualizarPosicao, true);
        window.addEventListener('resize', atualizarPosicao);
        return () => {
            window.removeEventListener('scroll', atualizarPosicao, true);
            window.removeEventListener('resize', atualizarPosicao);
        };
    }, [isOpen, atualizarPosicao]);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // O cursor vai para a busca assim que a lista aparece. `autoFocus` sozinho falhava
    // quando o campo vive numa linha arrastável/re-renderizada (tabela de itens): o foco
    // caía de volta no campo e o que se digitava se perdia. Foca no commit e de novo no
    // próximo quadro, se alguém roubou.
    const listaVisivel = isOpen && dropdownPos !== null;
    useEffect(() => {
        if (!listaVisivel) return;
        inputRef.current?.focus({ preventScroll: true });
        const quadro = requestAnimationFrame(() => {
            if (document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true });
        });
        return () => cancelAnimationFrame(quadro);
    }, [listaVisivel]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const inWrapper = wrapperRef.current?.contains(event.target as Node);
            const inDropdown = dropdownRef.current?.contains(event.target as Node);
            if (!inWrapper && !inDropdown) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const selectedOption = options.find((opt) => opt.value === value);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev + 1) % selectableOptions.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex((prev) => (prev - 1 + selectableOptions.length) % selectableOptions.length);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectableOptions[highlightedIndex]) {
                    selectOption(selectableOptions[highlightedIndex].value);
                }
                break;
            case 'Escape':
                // Esc fecha só a lista: o editor ignora teclas já tratadas.
                e.preventDefault();
                setIsOpen(false);
                break;
            case 'Tab':
                setIsOpen(false);
                break;
        }
    };

    const selectOption = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch('');
    };

    useEffect(() => {
        if (isOpen && listRef.current) {
            const container = listRef.current;
            const items = Array.from(container.querySelectorAll('[data-selectable="true"]'));
            const item = items[highlightedIndex] as HTMLElement;
            
            if (item) {
                const containerRect = container.getBoundingClientRect();
                const itemRect = item.getBoundingClientRect();

                if (itemRect.bottom > containerRect.bottom) {
                    container.scrollTop += itemRect.bottom - containerRect.bottom;
                } else if (itemRect.top < containerRect.top) {
                    container.scrollTop -= containerRect.top - itemRect.top;
                }
            }
        }
    }, [highlightedIndex, isOpen, selectableOptions]);

    return (
        <div
            className={`relative ${className}`}
            ref={wrapperRef}
            onKeyDown={handleKeyDown}
        >
            <div
                className={`
                    w-full px-4 py-2 border-2 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-150 group
                    ${atenuado ? 'min-h-[40px] bg-zinc-900/40' : 'min-h-[46px] bg-zinc-900'}
                    ${isOpen ? 'border-amber-500/50 ring-4 ring-amber-500/5 shadow-lg'
                        : atenuado ? 'border-zinc-800/40 hover:border-zinc-700/70' : 'border-zinc-800/50 hover:border-zinc-700'}
                `}
                onClick={() => setIsOpen(!isOpen)}
                tabIndex={0}
            >
                {/* min-w-0 é o que faz o truncate funcionar: item de flex não
                    encolhe abaixo do próprio conteúdo por padrão (min-width:auto),
                    então sem isto um rótulo longo estica a caixa e ela invade a
                    coluna vizinha em vez de cortar o texto. */}
                <div className="flex items-center gap-2 min-w-0 flex-1" title={selectedOption?.label || undefined}>
                    {selectedOption?.swatch && (
                        <span
                            className="w-4 h-4 rounded-full border border-zinc-700 shrink-0"
                            style={{ background: selectedOption.swatch }}
                        />
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                        {selectedOption?.group && (
                            <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-0.5 truncate">{selectedOption.group}</span>
                        )}
                        <span className={`truncate text-[11px] font-bold uppercase tracking-widest ${selectedOption
                            ? (atenuado ? 'text-zinc-400' : 'text-white')
                            : (atenuado ? 'text-zinc-700' : 'text-zinc-600')}`}>
                            {selectedOption ? (selectedOption.label || (selectedOption.value?.toString().toUpperCase() || 'NÃO IDENTIFICADO')) : placeholder}
                        </span>
                    </div>
                </div>
                <ChevronDown
                    size={16}
                    className={`shrink-0 ml-2 text-zinc-500 transition-transform duration-150 ${isOpen ? 'rotate-180 text-amber-500' : 'group-hover:text-zinc-300'}`}
                />
            </div>

            {/* Portal dropdown — rendered in body to escape overflow:hidden parents */}
            {isOpen && dropdownPos && createPortal(
                <div
                    ref={dropdownRef}
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        bottom: dropdownPos.bottom,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        maxHeight: dropdownPos.alturaMaxima,
                        zIndex: 'var(--z-index-balao)' as unknown as number,
                    }}
                    className="bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl ease-out animate-in duration-200 fade-in zoom-in-95 overflow-hidden flex flex-col"
                >
                    <div className="p-3 border-b border-zinc-800/50 relative">
                        <Search size={14} className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-600" />
                        <input
                            ref={inputRef}
                            type="text"
                            autoFocus
                            autoComplete="off"
                            className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-[10px] font-black text-white placeholder:text-zinc-800 outline-none focus:border-amber-500/30 transition-all uppercase tracking-widest"
                            placeholder="PROCURAR..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div
                        ref={listRef}
                        className="max-h-72 overflow-y-auto p-2 custom-scrollbar"
                    >
                        {filteredOptions.length === 0 ? (
                            <div className="py-12 text-center">
                                <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">Nenhum resultado</p>
                            </div>
                        ) : (
                            filteredOptions.map((opt) => {
                                if (opt.isHeader) {
                                    return (
                                        <div key={opt.label} className="px-4 py-3 text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] bg-zinc-900/30 rounded-lg mb-1 mt-2 first:mt-0">
                                            {opt.label}
                                        </div>
                                    );
                                }

                                const isSelected = opt.value === value;
                                const currentIndex = selectableOptions.findIndex(so => so.value === opt.value);
                                const isHighlighted = currentIndex === highlightedIndex;
                                
                                return (
                                    <div
                                        key={opt.value}
                                        data-selectable="true"
                                        className={`
                                            px-4 py-3 text-[10px] font-black uppercase tracking-widest cursor-pointer rounded-xl transition-all flex items-center justify-between mb-0.5 last:mb-0
                                            ${isHighlighted ? 'bg-amber-500 text-black shadow-lg shadow-amber-900/20' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}
                                            ${isSelected && !isHighlighted ? 'bg-zinc-900 text-amber-500' : ''}
                                        `}
                                        onClick={() => selectOption(opt.value)}
                                        onMouseEnter={() => setHighlightedIndex(currentIndex)}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1" title={opt.label}>
                                            {opt.swatch && (
                                                <span
                                                    className={`w-4 h-4 rounded-full shrink-0 border ${isHighlighted ? 'border-black/30' : 'border-zinc-700'}`}
                                                    style={{ background: opt.swatch }}
                                                />
                                            )}
                                            <span className="truncate">{opt.label}</span>
                                        </div>
                                        {isSelected && (
                                            <Check
                                                size={14}
                                                className={isHighlighted ? 'text-black' : 'text-amber-500'}
                                            />
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="bg-zinc-950 p-2 border-t border-zinc-800/50 flex items-center justify-between">
                        <span className="text-[7px] font-black text-zinc-700 uppercase tracking-widest ml-2">BOTEZINI PREMIUM UI</span>
                        <div className="flex gap-4 mr-2">
                            <span className="text-[7px] font-black text-zinc-600 flex items-center gap-1 uppercase">
                                <span className="bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800 text-zinc-400">↵</span> SEL
                            </span>
                            <span className="text-[7px] font-black text-zinc-600 flex items-center gap-1 uppercase">
                                <span className="bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800 text-zinc-400">ESC</span> SAIR
                            </span>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

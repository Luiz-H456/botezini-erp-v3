import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Loader2, AlertTriangle, Download, FileText } from 'lucide-react';
import { storageService } from '@/services/storage';
import { ehPdf } from '@/utils/anexosDeReferencia';

/**
 * Peças reutilizáveis de uma galeria de fotos com miniatura, ampliação e
 * exclusão — a miniatura em si, a visualização em tela cheia e o hook que
 * resolve caminho salvo em URL assinada.
 *
 * Extraído de ReferencePhotos.tsx (fotos do orçamento) quando o mesmo padrão
 * passou a servir também às fotos do cliente. O que NÃO está aqui — a barra de
 * upload, o aviso de migração pendente, o texto do tooltip — fica em cada
 * lugar porque é específico do contexto (orçamento fala em "acompanha o
 * pedido"; cliente fala em "vale para os próximos orçamentos").
 */

export const TIPOS_DE_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
/** Foto de celular passa de 5 MB com facilidade. */
export const TAMANHO_MAX_MB_IMAGEM = 8;

/**
 * Baixa a foto com o nome de arquivo original.
 *
 * Busca os BYTES e cria um blob local em vez de apontar um link para a URL
 * assinada. Duas razões: a URL do Supabase abre a imagem no navegador em vez de
 * baixar (o atributo `download` não vale para outra origem), e o nome do
 * arquivo no bucket é um carimbo de tempo — quem baixa quer "logo-cliente.png",
 * não "1737059421_a8f3k.png".
 */
export async function baixarFoto(path: string, nomeSugerido?: string) {
    const url = await storageService.getAttachmentUrl(path);
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error('Falha ao baixar o arquivo');
    const blob = await resposta.blob();

    const extensao = (path.split('.').pop() || 'jpg').split('?')[0];
    const local = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = local;
    a.download = nomeSugerido ? `${nomeSugerido}.${extensao}` : (path.split('/').pop() || 'foto');
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Libera a memória do blob; sem isto cada download deixa o arquivo inteiro
    // preso na aba até recarregar a página.
    setTimeout(() => URL.revokeObjectURL(local), 1000);
}

export function useSignedUrl(path: string) {
    const [url, setUrl] = useState<string | null>(null);
    const [falhou, setFalhou] = useState(false);
    useEffect(() => {
        let vivo = true;
        setUrl(null);
        setFalhou(false);
        storageService.getAttachmentUrl(path)
            .then(u => { if (vivo) setUrl(u); })
            .catch(() => { if (vivo) setFalhou(true); });
        return () => { vivo = false; };
    }, [path]);
    return { url, falhou };
}

export function Miniatura({ path, onOpen, onRemove, nomeParaBaixar }: {
    path: string; onOpen: () => void; onRemove?: () => void; nomeParaBaixar?: string;
}) {
    const { url, falhou } = useSignedUrl(path);
    const [baixando, setBaixando] = useState(false);
    // PDF não vira <img>: o bloco abre o arquivo numa aba nova (o leitor do navegador).
    // As páginas dele aparecem ao lado como fotos comuns.
    const pdf = ehPdf(path);
    const rotulo = pdf ? 'PDF' : 'foto';

    const baixar = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setBaixando(true);
        try {
            await baixarFoto(path, nomeParaBaixar);
        } catch {
            /* o alerta viveria fora da miniatura; a falha aqui é rara e sem dano */
        } finally {
            setBaixando(false);
        }
    };

    return (
        <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 group">
            {falhou ? (
                <div className="w-full h-full flex items-center justify-center" title="Arquivo não encontrado no armazenamento">
                    <AlertTriangle size={14} className="text-rose-500/70" />
                </div>
            ) : url && pdf ? (
                <a
                    href={url} target="_blank" rel="noopener noreferrer"
                    title="Abrir PDF"
                    className="w-full h-full flex flex-col items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                    <FileText size={22} className="text-rose-400/80" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">PDF</span>
                </a>
            ) : url ? (
                /*
                 * O clique já ampliava, mas a única pista era o cursor de lupa —
                 * que aparece depois de a pessoa levar o mouse até lá, ou seja,
                 * só para quem já desconfiava. Um véu com a palavra no hover diz
                 * o que acontece antes do clique.
                 *
                 * Sem ícone de propósito: a miniatura tem 80 px e já carrega os
                 * botões de baixar e remover nos cantos; um terceiro símbolo
                 * cobriria a foto que se quer ver.
                 */
                <button
                    type="button"
                    onClick={onOpen}
                    title="Ampliar foto"
                    className="w-full h-full block cursor-zoom-in group/foto"
                >
                    <img src={url} alt="Referência" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 flex items-end justify-center pb-1.5 bg-gradient-to-t from-zinc-950/85 via-zinc-950/10 to-transparent opacity-0 group-hover/foto:opacity-100 transition-opacity duration-150">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white drop-shadow">
                            Ampliar
                        </span>
                    </span>
                </button>
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <Loader2 size={14} className="text-zinc-700 animate-spin" />
                </div>
            )}

            {!falhou && (
                <div className="absolute top-1 left-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                        type="button"
                        onClick={baixar}
                        disabled={baixando}
                        title={`Baixar ${rotulo}`} aria-label={`Baixar ${rotulo}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/80 text-zinc-400 hover:text-amber-500 transition-colors disabled:opacity-50"
                    >
                        {baixando
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Download size={16} />}
                    </button>
                </div>
            )}

            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    title={`Remover ${rotulo}`} aria-label={`Remover ${rotulo}`}
                    className="absolute top-1 right-1 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-950/80 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-all"
                >
                    <Trash2 size={16} />
                </button>
            )}
        </div>
    );
}

export function FotoAmpliada({ path, onClose }: { path: string; onClose: () => void }) {
    const { url, falhou } = useSignedUrl(path);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', esc);
        return () => document.removeEventListener('keydown', esc);
    }, [onClose]);

    // z-150 e nao 95: o editor de orcamento e um portal em z-100, entao a foto
    // ampliada abria ATRAS dele — o clique funcionava, o visualizador montava,
    // e nao aparecia nada. Precisa ficar acima de qualquer modal que possa
    // conter uma miniatura (editor 100, resumo 130, plano 120) e abaixo da
    // confirmacao de liquidacao (200), que nunca deve ser encoberta.
    return createPortal(
        <div className="fixed inset-0 z-sobreposto bg-zinc-950/92 backdrop-blur-xl flex items-center justify-center p-6 ease-out animate-in fade-in duration-200" onClick={onClose}>
            <div className="absolute top-5 right-5 flex gap-2" onClick={e => e.stopPropagation()}>
                <button
                    onClick={() => baixarFoto(path).catch(() => { })}
                    title="Baixar foto"
                    className="p-2 text-zinc-400 hover:text-amber-500 bg-zinc-900 border border-zinc-800 rounded-xl transition-colors"
                >
                    <Download size={18} />
                </button>
                <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 rounded-xl">
                    <X size={18} />
                </button>
            </div>
            {falhou ? (
                <p className="text-xs font-bold text-rose-400">Arquivo não encontrado no armazenamento.</p>
            ) : url ? (
                <img src={url} alt="Referência" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
            ) : (
                <Loader2 size={22} className="text-amber-500 animate-spin" />
            )}
        </div>,
        document.body
    );
}

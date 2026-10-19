import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, AlertTriangle } from 'lucide-react';
import { storageService } from '@/services/storage';

interface AttachmentViewerProps {
    path: string;
    onClose: () => void;
}

export function AttachmentViewer({ path, onClose }: AttachmentViewerProps) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        storageService.getAttachmentUrl(path)
            .then(setUrl)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [path]);

    const isImage = path.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
    const isPDF = path.toLowerCase().endsWith('.pdf');

    return createPortal(
        <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-sobreposto p-4 backdrop-blur-md" onClick={onClose}>
            <div className="w-full max-w-5xl h-full flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <Paperclip size={16} className="text-zinc-500" />
                        <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">{path.split('/').pop()}</span>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors bg-zinc-900 rounded-lg">✕</button>
                </div>

                <div className="flex-1 bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center relative">
                    {loading && (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-zinc-500 uppercase">Carregando visualização...</p>
                        </div>
                    )}
                    {error && (
                        <div className="text-center p-6 bg-red-500/10 border border-red-500/20 rounded-xl max-w-xs">
                            <AlertTriangle className="text-red-500 mx-auto mb-2" size={24} />
                            <p className="text-xs text-red-500 font-bold">{error}</p>
                        </div>
                    )}
                    {!loading && !error && url && (
                        <>
                            {isImage ? (
                                <img src={url} alt="Preview" className="max-w-full max-h-full object-contain select-none" />
                            ) : isPDF ? (
                                <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-full border-none" title="PDF Preview" />
                            ) : (
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <Paperclip size={32} className="text-zinc-600" />
                                    </div>
                                    <p className="text-xs text-zinc-400 font-bold mb-4">Prévia indisponível para este formato</p>
                                    <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 bg-zinc-800 text-white text-[10px] font-black uppercase rounded-lg hover:bg-zinc-700 transition-colors">
                                        Abrir em nova aba
                                    </a>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}

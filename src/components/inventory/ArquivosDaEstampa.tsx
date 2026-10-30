import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, PenTool, Scissors, Trash2, Upload } from 'lucide-react';
import { storageService } from '@/services/storage';
import { baixarFoto, FotoAmpliada } from '@/components/common/GaleriaDeFotos';
import { ConfirmModal } from '@/components/finance';
import { novaBase } from '@/utils/anexosDeReferencia';
import {
    ACEITOS, ROTULO_DO_TIPO, baseComNome, nomeParaMostrar, recusaDoArquivo, tipoDoArquivo, type TipoDeArquivo,
} from '@/utils/arquivosDeEstampa';
import { mensagemDeErro } from '@/utils/errorHandling';
import { BOTAO_SECUNDARIO, BOTAO_SUAVE, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

const ICONE: Record<TipoDeArquivo, typeof FileText> = { pdf: FileText, foto: ImageIcon, corel: PenTool, bordado: Scissors };

/**
 * Os arquivos de uma estampa (parte D, 30/10): PDF, foto, Corel (.cdr) e matriz de bordado (.dst).
 * Sobem crus, com o nome original guardado no caminho — quem abre o .dst na máquina precisa
 * reconhecer o arquivo. A lista grava sozinha (definirArquivosDaEstampa), nunca junto do formulário.
 */
export function ArquivosDaEstampa({ estampaId, arquivos, onMudou }: { estampaId: string; arquivos: string[]; onMudou: () => void }) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState('');
    const [ampliada, setAmpliada] = useState<string | null>(null);
    const [removendo, setRemovendo] = useState<string | null>(null);

    const enviar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const lista = Array.from(e.target.files || []);
        e.target.value = '';
        if (lista.length === 0) return;
        const recusas = lista.map(recusaDoArquivo).filter((r): r is string => !!r);
        const aceitos = lista.filter(f => !recusaDoArquivo(f));
        setErro(recusas.length ? `Não enviado: ${recusas.join(', ')}` : '');
        if (aceitos.length === 0) return;
        setEnviando(true);
        const novos: string[] = [];
        try {
            // Sequencial: numa falha no meio, o que já subiu entra na lista em vez de ficar órfão no bucket.
            for (const f of aceitos) novos.push(await storageService.uploadAttachment(f, `estampas/${estampaId}`, baseComNome(f.name, novaBase())));
        } catch (err) {
            setErro(prev => [prev, mensagemDeErro(err, 'Falha ao enviar')].filter(Boolean).join(' · '));
        }
        try {
            if (novos.length) { await storageService.definirArquivosDaEstampa(estampaId, [...arquivos, ...novos]); onMudou(); }
        } catch (err) {
            setErro(mensagemDeErro(err, 'O arquivo subiu, mas não consegui ligá-lo à estampa'));
        } finally {
            setEnviando(false);
        }
    };

    const remover = async (caminho: string) => {
        setRemovendo(null);
        try {
            // Tira da lista primeiro: arquivo que já não existe no bucket não pode prender a estampa.
            await storageService.definirArquivosDaEstampa(estampaId, arquivos.filter(a => a !== caminho));
            onMudou();
            await storageService.deleteAttachment(caminho).catch(() => { /* já fora da lista; sobra no bucket, sem dano */ });
        } catch (err) {
            setErro(mensagemDeErro(err, 'Não consegui remover o arquivo'));
        }
    };

    const baixar = async (caminho: string) => {
        try { await baixarFoto(caminho, nomeParaMostrar(caminho).replace(/\.[^.]+$/, '')); }
        catch (err) { setErro(mensagemDeErro(err, 'Não consegui baixar o arquivo')); }
    };

    return (
        <div className="border-t border-zinc-800/50 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <p className={ROTULO_PEQUENO}>Arquivos {arquivos.length > 0 && <span className="opacity-60">{arquivos.length}</span>}</p>
                <label className={`${BOTAO_SUAVE} cursor-pointer ${enviando ? 'opacity-60 pointer-events-none' : ''}`} title="PDF, foto, Corel (.cdr) ou matriz de bordado (.dst)">
                    <Upload size={14} /> {enviando ? 'Enviando…' : 'Adicionar'}
                    <input type="file" multiple accept={ACEITOS} onChange={enviar} disabled={enviando} className="sr-only" aria-label="Adicionar arquivos à estampa" />
                </label>
            </div>
            {erro && <p role="alert" className="text-[11px] font-bold text-rose-300">{erro}</p>}
            {arquivos.length === 0 ? (
                <p className="text-[10px] text-zinc-600">Sem arquivo. Guarde aqui o PDF aprovado, a foto, o .cdr e o .dst.</p>
            ) : (
                <ul className="space-y-1">
                    {arquivos.map(caminho => {
                        const tipo = tipoDoArquivo(caminho);
                        const Icone = tipo ? ICONE[tipo] : FileText;
                        return (
                            <li key={caminho} className="flex items-center gap-2 min-w-0">
                                <Icone size={14} className="text-zinc-500 shrink-0" />
                                {tipo === 'foto' ? (
                                    <button type="button" onClick={() => setAmpliada(caminho)} className="flex-1 min-w-0 text-left text-xs text-zinc-300 hover:text-white truncate min-h-11">
                                        {nomeParaMostrar(caminho)}
                                    </button>
                                ) : (
                                    <span className="flex-1 min-w-0 text-xs text-zinc-300 truncate">{nomeParaMostrar(caminho)}</span>
                                )}
                                <span className="text-[10px] text-zinc-600 shrink-0">{tipo ? ROTULO_DO_TIPO[tipo] : ''}</span>
                                <button type="button" onClick={() => void baixar(caminho)} aria-label={`Baixar ${nomeParaMostrar(caminho)}`} title="Baixar"
                                    className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><Download size={16} /></button>
                                <button type="button" onClick={() => setRemovendo(caminho)} aria-label={`Remover ${nomeParaMostrar(caminho)}`} title="Remover"
                                    className={`${BOTAO_SECUNDARIO} w-11 px-0 shrink-0`}><Trash2 size={16} className="text-rose-400" /></button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {ampliada && <FotoAmpliada path={ampliada} onClose={() => setAmpliada(null)} />}
            <ConfirmModal
                isOpen={!!removendo}
                title="Remover arquivo?"
                message={removendo ? `${nomeParaMostrar(removendo)} sai da estampa e é apagado do armazenamento. Esta ação não tem desfazer.` : ''}
                confirmLabel="Remover arquivo"
                isDanger
                onConfirm={() => removendo && void remover(removendo)}
                onClose={() => setRemovendo(null)}
            />
        </div>
    );
}

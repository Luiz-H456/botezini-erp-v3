import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Loader2, AlertTriangle } from 'lucide-react';
import { storageService } from '@/services/storage';
import { InfoTooltip } from '@/components/common';
import { ConfirmModal } from '@/components/finance';
import {
    Miniatura, FotoAmpliada, TIPOS_DE_IMAGEM_ACEITOS, TAMANHO_MAX_MB_IMAGEM,
} from '@/components/common/GaleriaDeFotos';
import { mensagemDaRemocao } from '@/utils/anexoCompartilhado';

interface Props {
    /** Caminhos já salvos (não URLs — a URL assinada é buscada aqui). */
    photos: string[];
    onChange: (photos: string[]) => void;
    clientId: string;
}

/**
 * Fotos do cliente: logo, arte aprovada, peça de amostra.
 *
 * Mesma peça visual de ReferencePhotos (orçamento), com o texto e o destino
 * certos para este contexto: aqui a foto vale para os PRÓXIMOS orçamentos, não
 * para um só — por isso mora no cliente e não desaparece quando o orçamento em
 * que ela chegou é arquivado.
 */
export function FotosDoCliente({ photos, onChange, clientId }: Props) {
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState('');
    const [ampliada, setAmpliada] = useState<string | null>(null);
    /** Diz que o arquivo sobreviveu em outro registro — senão a pessoa acha que apagou. */
    const [aviso, setAviso] = useState('');
    const [confirmarRemocao, setConfirmarRemocao] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    /** null = ainda checando. false = migração das fotos não aplicada. */
    const [migracaoOk, setMigracaoOk] = useState<boolean | null>(null);

    useEffect(() => {
        let vivo = true;
        storageService.supportsClientPhotos()
            .then(ok => { if (vivo) setMigracaoOk(ok); })
            .catch(() => { if (vivo) setMigracaoOk(true); }); // na dúvida, não bloqueia
        return () => { vivo = false; };
    }, []);

    const selecionar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const arquivos = Array.from(e.target.files || []);
        if (inputRef.current) inputRef.current.value = ''; // permite reenviar o mesmo arquivo
        if (arquivos.length === 0) return;

        setErro('');
        const recusados: string[] = [];
        const aceitos = arquivos.filter(f => {
            if (!TIPOS_DE_IMAGEM_ACEITOS.includes(f.type)) { recusados.push(`${f.name} (formato)`); return false; }
            if (f.size > TAMANHO_MAX_MB_IMAGEM * 1024 * 1024) { recusados.push(`${f.name} (acima de ${TAMANHO_MAX_MB_IMAGEM} MB)`); return false; }
            return true;
        });
        if (recusados.length > 0) setErro(`Não enviado: ${recusados.join(', ')}`);
        if (aceitos.length === 0) return;

        setEnviando(true);
        try {
            // Sequencial de propósito: em upload paralelo, uma falha no meio deixa
            // parte dos arquivos no bucket sem referência no cliente.
            const novos: string[] = [];
            for (const arquivo of aceitos) {
                novos.push(await storageService.uploadAttachment(arquivo, `clients/${clientId}`));
            }
            onChange([...photos, ...novos]);
        } catch (e: any) {
            setErro(e?.message || 'Falha ao enviar a foto');
        } finally {
            setEnviando(false);
        }
    };

    const remover = async (indice: number) => {
        const caminho = photos[indice];
        setConfirmarRemocao(null);
        setAviso('');
        // Tira da lista primeiro: se o arquivo já não existir no bucket, o
        // cliente não pode ficar preso a uma referência morta.
        onChange(photos.filter((_, i) => i !== indice));

        // O ARQUIVO SÓ MORRE QUANDO NINGUÉM MAIS APONTA PARA ELE. "Guardar" na
        // página do cliente traz para cá o caminho de uma foto que continua no
        // orçamento. Apagar o arquivo daqui quebrava a foto lá.
        try {
            const outros = await storageService.contarOutrasReferencias(caminho, clientId);
            if (outros > 0) {
                setAviso(mensagemDaRemocao(
                    { desvincular: true, apagarArquivo: false, outrosUsos: outros }, 'deste cadastro'));
                return;
            }
            await storageService.deleteAttachment(caminho);
        } catch {
            // Não deu para saber se alguém mais usa: NÃO apaga.
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                    Fotos do cliente
                </label>
                <InfoTooltip width={300}>
                    <p className="text-[11px] font-black text-white mb-1">Vale para os próximos orçamentos</p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                        Logo, arte já aprovada, peça de amostra que este cliente mandou.
                        Fica ligada a ele, não a um orçamento específico — na próxima vez
                        que orçar para ele, a referência já está aqui.
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1.5">
                        JPG, PNG, WebP ou HEIC até {TAMANHO_MAX_MB_IMAGEM} MB cada.
                    </p>
                </InfoTooltip>
                {photos.length > 0 && (
                    <span className="text-[9px] font-bold text-zinc-600">
                        {photos.length} anexada{photos.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {migracaoOk === false && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-amber-300/90 leading-relaxed">
                        Banco sem a coluna das fotos — elas não serão salvas.
                        <span className="block text-zinc-500 font-medium mt-0.5">
                            Rode <span className="font-mono">supabase/clientes_fotos_e_notas.sql</span> para habilitar.
                            O cadastro continua salvando normalmente.
                        </span>
                    </p>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                {photos.map((caminho, i) => (
                    <Miniatura
                        key={caminho}
                        path={caminho}
                        onOpen={() => setAmpliada(caminho)}
                        onRemove={() => setConfirmarRemocao(i)}
                    />
                ))}

                {migracaoOk !== false && (
                    <label className={`w-20 h-20 shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed cursor-pointer transition-colors ${
                        enviando ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-700 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/60'
                    }`}>
                        {enviando
                            ? <Loader2 size={16} className="text-amber-500 animate-spin" />
                            : <ImagePlus size={16} className="text-zinc-500" />}
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                            {enviando ? 'Enviando' : 'Adicionar'}
                        </span>
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            multiple
                            accept={TIPOS_DE_IMAGEM_ACEITOS.join(',')}
                            onChange={selecionar}
                            disabled={enviando}
                        />
                    </label>
                )}
            </div>
            {aviso && (
                <p className="text-[10px] text-sky-300/90 bg-sky-500/[0.07] border border-sky-500/20 rounded-lg px-2.5 py-1.5 leading-snug">
                    {aviso}
                </p>
            )}

            {erro && (
                <p className="text-[10px] font-bold text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-px" /> {erro}
                </p>
            )}

            {ampliada && <FotoAmpliada path={ampliada} onClose={() => setAmpliada(null)} />}

            {confirmarRemocao !== null && (
                <ConfirmModal
                    isOpen
                    title="Remover foto?"
                    message="A foto sai do cadastro do cliente. Esta ação não tem desfazer."
                    confirmLabel="Remover"
                    isDanger
                    onConfirm={() => remover(confirmarRemocao)}
                    onClose={() => setConfirmarRemocao(null)}
                />
            )}
        </div>
    );
}

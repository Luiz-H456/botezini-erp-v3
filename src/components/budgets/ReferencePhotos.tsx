import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Loader2, AlertTriangle } from 'lucide-react';
import { storageService } from '@/services/storage';
import { InfoTooltip } from '@/components/common';
import { ConfirmModal } from '@/components/finance';
import {
    Miniatura, FotoAmpliada, TIPOS_DE_IMAGEM_ACEITOS, TAMANHO_MAX_MB_IMAGEM,
} from '@/components/common/GaleriaDeFotos';
import { mensagemDaRemocao } from '@/utils/anexoCompartilhado';
import {
    ehPdf, novaBase, nomeDaPagina, paginasDoPdf, removerComPaginas, TAMANHO_MAX_MB_PDF,
} from '@/utils/anexosDeReferencia';

const TIPO_PDF = 'application/pdf';
const TIPOS_ACEITOS = [...TIPOS_DE_IMAGEM_ACEITOS, TIPO_PDF];
const TAMANHO_MAX_MB = TAMANHO_MAX_MB_IMAGEM;

interface Props {
    /** Caminhos já salvos (não URLs — a URL assinada é buscada aqui). */
    photos: string[];
    onChange: (photos: string[]) => void;
    /** Pasta no bucket; use o id do orçamento para agrupar. */
    folder: string;
    /**
     * Id do registro sendo editado, para a contagem de referências saber quem
     * NÃO contar. Vazio numa duplicata ainda não salva — e aí o original conta,
     * que é exatamente o que precisa acontecer.
     */
    registroId?: string;
    disabled?: boolean;
}

/**
 * Fotos de referência do orçamento.
 *
 * Guarda CAMINHOS, não URLs: o link assinado do Supabase expira em 1 h, então
 * salvar a URL deixaria o anexo quebrado no dia seguinte. A miniatura resolve o
 * link na hora de exibir.
 */
export function ReferencePhotos({ photos, onChange, folder, registroId = '', disabled }: Props) {
    /** Etapa em curso no botão ('Convertendo', 'Enviando'), ou false. */
    const [enviando, setEnviando] = useState<string | false>(false);
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
        storageService.supportsReferencePhotos()
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
            if (!TIPOS_ACEITOS.includes(f.type)) { recusados.push(`${f.name} (formato)`); return false; }
            const limite = f.type === TIPO_PDF ? TAMANHO_MAX_MB_PDF : TAMANHO_MAX_MB;
            if (f.size > limite * 1024 * 1024) { recusados.push(`${f.name} (acima de ${limite} MB)`); return false; }
            return true;
        });
        const avisos: string[] = recusados.length > 0 ? [`Não enviado: ${recusados.join(', ')}`] : [];
        setErro(avisos.join(' · '));
        if (aceitos.length === 0) return;

        // Sequencial de propósito: em upload paralelo, uma falha no meio deixa
        // parte dos arquivos no bucket sem referência no orçamento. E o que já
        // subiu entra na lista mesmo se um seguinte falhar — senão vira órfão.
        const pasta = `budgets/${folder}`;
        const novos: string[] = [];
        try {
            for (const arquivo of aceitos) {
                if (arquivo.type !== TIPO_PDF) {
                    setEnviando('Enviando');
                    novos.push(await storageService.uploadAttachment(arquivo, pasta));
                    continue;
                }
                // PDF: guarda o original e cada página como JPEG, com a mesma base no nome
                // (`<base>.pdf`, `<base>_p01.jpg`…) — é como a remoção acha as páginas dele.
                setEnviando('Convertendo');
                let imagens: Blob[] = [];
                try {
                    const r = await (await import('@/services/pdfParaImagens')).pdfParaImagens(arquivo);
                    imagens = r.imagens;
                    if (r.deFora > 0) avisos.push(`${arquivo.name}: só as ${imagens.length} primeiras páginas viraram foto; as outras ${r.deFora} ficam só no PDF`);
                } catch {
                    avisos.push(`${arquivo.name}: não consegui ler as páginas (PDF protegido ou danificado). O PDF fica salvo, sem as fotos.`);
                }
                setEnviando('Enviando');
                const base = novaBase();
                novos.push(await storageService.uploadAttachment(arquivo, pasta, base));
                for (let n = 1; n <= imagens.length; n++) {
                    const nome = nomeDaPagina(base, n);
                    const pagina = new File([imagens[n - 1]], `${nome}.jpg`, { type: 'image/jpeg' });
                    novos.push(await storageService.uploadAttachment(pagina, pasta, nome));
                }
            }
        } catch (e: any) {
            avisos.push(e?.message || 'Falha ao enviar o arquivo');
        } finally {
            if (novos.length > 0) onChange([...photos, ...novos]);
            setErro(avisos.join(' · '));
            setEnviando(false);
        }
    };

    const remover = async (indice: number) => {
        // Remover um PDF leva as páginas convertidas dele junto.
        const { nova, removidos } = removerComPaginas(photos, indice);
        setConfirmarRemocao(null);
        setAviso('');
        // Tira da lista primeiro: se o arquivo já não existir no bucket, o
        // orçamento não pode ficar preso a uma referência morta. E se a
        // contagem abaixo falhar, o clique já fez o que a pessoa pediu.
        onChange(nova);

        // O ARQUIVO SÓ MORRE QUANDO NINGUÉM MAIS APONTA PARA ELE.
        //
        // `reference_photos` guarda CAMINHOS, e o caminho é copiado duas vezes:
        // ao duplicar um orçamento e ao convertê-lo em pedido. Antes, remover a
        // foto da cópia apagava o arquivo do bucket e deixava o original com uma
        // imagem quebrada — os erros 400 em `financial-attachments` no console
        // eram isso.
        for (const caminho of removidos) {
            try {
                const outros = await storageService.contarOutrasReferencias(caminho, registroId);
                if (outros > 0) {
                    setAviso(mensagemDaRemocao({ desvincular: true, apagarArquivo: false, outrosUsos: outros }));
                    continue;
                }
                await storageService.deleteAttachment(caminho);
            } catch {
                // Não deu para saber se alguém mais usa: NÃO apaga. Órfão no bucket
                // custa alguns kilobytes; foto quebrada num orçamento que o cliente
                // vai receber custa uma conversa.
            }
        }
    };

    const alvoDaRemocao = confirmarRemocao !== null ? photos[confirmarRemocao] ?? '' : '';
    const paginasDoAlvo = paginasDoPdf(alvoDaRemocao, photos).length;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5">
                <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                    Fotos e PDFs de referência
                </label>
                <InfoTooltip width={300}>
                    <p className="text-[11px] font-black text-white mb-1">Material interno de produção</p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                        Fotos que o cliente mandou, arte do logo, peça antiga de amostra.
                        Acompanham o pedido na conversão.
                    </p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed mt-1.5">
                        A <b>ficha de corte</b> cita apenas que elas existem, para a produção
                        consultar aqui. O <b>PDF do orçamento</b> não as inclui, a menos que
                        você marque a opção ao gerar.
                    </p>
                    <p className="text-[10px] text-zinc-500 leading-relaxed mt-1.5">
                        JPG, PNG, WebP ou HEIC até {TAMANHO_MAX_MB} MB cada. PDF até {TAMANHO_MAX_MB_PDF} MB:
                        o original fica salvo e cada página vira uma foto, que entra no PDF e na ficha.
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
                            Rode <span className="font-mono">supabase/phase11_fotos_referencia.sql</span> para habilitar.
                            O orçamento continua salvando normalmente.
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
                        onRemove={disabled ? undefined : () => setConfirmarRemocao(i)}
                    />
                ))}

                {!disabled && migracaoOk !== false && (
                    <label className={`w-20 h-20 shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed cursor-pointer transition-colors ${
                        enviando ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-700 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/60'
                    }`}>
                        {enviando
                            ? <Loader2 size={16} className="text-amber-500 animate-spin" />
                            : <ImagePlus size={16} className="text-zinc-500" />}
                        <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">
                            {enviando || 'Adicionar'}
                        </span>
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            multiple
                            accept={TIPOS_ACEITOS.join(',')}
                            onChange={selecionar}
                            disabled={!!enviando}
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
                    title={ehPdf(alvoDaRemocao) ? 'Remover PDF?' : 'Remover foto?'}
                    message={ehPdf(alvoDaRemocao)
                        ? `O PDF${paginasDoAlvo ? ` e as ${paginasDoAlvo} página(s) convertidas dele saem` : ' sai'} do orçamento e do pedido gerado a partir dele. Esta ação não tem desfazer.`
                        : 'A foto sai do orçamento e do pedido gerado a partir dele. Esta ação não tem desfazer.'}
                    confirmLabel={ehPdf(alvoDaRemocao) ? 'Remover PDF' : 'Remover foto'}
                    isDanger
                    onConfirm={() => remover(confirmarRemocao)}
                    onClose={() => setConfirmarRemocao(null)}
                />
            )}
        </div>
    );
}


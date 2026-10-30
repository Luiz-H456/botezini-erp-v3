import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Loader2, Camera, Trash2, AlertTriangle } from 'lucide-react';
import { authService } from '@/services/auth';
import { storageService } from '@/services/storage';
import { useSignedUrl, TIPOS_DE_IMAGEM_ACEITOS, TAMANHO_MAX_MB_IMAGEM } from '@/components/common/GaleriaDeFotos';
import { iniciais, corDoAvatar, rotuloDoCargo } from '@/utils/perfilDoUsuario';
import type { UserProfile } from '@/types';

import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
interface Props {
    perfil: UserProfile | null;
    onSalvo: () => void;
    onFechar: () => void;
}

/**
 * Nome e foto do próprio usuário.
 *
 * O cargo aparece mas não se edita: quem pode mudar o próprio cargo pode se
 * promover a admin. A política do banco recusa de todo jeito — mostrar o campo
 * travado explica a regra, em vez de deixar a pessoa procurar onde muda.
 */
export function MeuPerfilModal({ perfil, onSalvo, onFechar }: Props) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica: as janelas que faltavam).
    const saida = useSaidaProtegida(onFechar);
    const [nome, setNome] = useState(perfil?.full_name || '');
    const [caminhoDaFoto, setCaminhoDaFoto] = useState(perfil?.avatar_url || '');
    const [salvando, setSalvando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState('');
    const [migracaoOk, setMigracaoOk] = useState<boolean | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { url: foto } = useSignedUrl(caminhoDaFoto);

    useEffect(() => {
        let vivo = true;
        authService.supportsAvatar()
            .then(ok => { if (vivo) setMigracaoOk(ok); })
            .catch(() => { if (vivo) setMigracaoOk(true); }); // na dúvida, não bloqueia
        return () => { vivo = false; };
    }, []);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') saida.pedirParaFechar(); };
        document.addEventListener('keydown', esc);
        return () => document.removeEventListener('keydown', esc);
    }, [onFechar]);

    const escolherFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const arquivo = e.target.files?.[0];
        if (inputRef.current) inputRef.current.value = '';
        if (!arquivo) return;

        setErro('');
        if (!TIPOS_DE_IMAGEM_ACEITOS.includes(arquivo.type)) {
            setErro('Formato não aceito. Use JPG, PNG, WebP ou HEIC.');
            return;
        }
        if (arquivo.size > TAMANHO_MAX_MB_IMAGEM * 1024 * 1024) {
            setErro(`A imagem passa de ${TAMANHO_MAX_MB_IMAGEM} MB.`);
            return;
        }

        setEnviando(true);
        try {
            setCaminhoDaFoto(await storageService.uploadAttachment(arquivo, 'perfis'));
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao enviar a foto'));
        } finally {
            setEnviando(false);
        }
    };

    const salvar = async () => {
        setSalvando(true);
        setErro('');
        try {
            await authService.updateOwnProfile({
                full_name: nome.trim(),
                // Vazio vira null de propósito: string vazia deixaria a galeria
                // tentando assinar um caminho que não existe.
                avatar_url: caminhoDaFoto || null,
            });
            onSalvo();
            onFechar();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Não foi possível salvar'));
        } finally {
            setSalvando(false);
        }
    };

    const previa = { ...perfil, full_name: nome } as UserProfile;

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-modal bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-4 ease-out animate-in fade-in duration-200"
            onClick={saida.pedirParaFechar}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden ease-out animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()} {...saida.aoMexer}>

                <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40 flex items-center justify-between">
                    <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Meu perfil</h2>
                    <button onClick={saida.pedirParaFechar} className="p-2 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    <div className="flex items-center gap-4">
                        <span className={`w-16 h-16 shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden text-lg font-black ${foto ? 'border-zinc-700 bg-zinc-900' : corDoAvatar(previa)}`}>
                            {enviando
                                ? <Loader2 size={18} className="animate-spin text-amber-500" />
                                : foto
                                    ? <img src={foto} alt="" className="w-full h-full object-cover" />
                                    : iniciais(previa)}
                        </span>
                        <div className="flex flex-col gap-1.5">
                            <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${migracaoOk === false
                                ? 'border-zinc-800 text-zinc-700 cursor-not-allowed'
                                : 'border-zinc-700 text-zinc-300 hover:border-amber-500/40 hover:text-amber-400 cursor-pointer'}`}>
                                <Camera size={12} /> {foto ? 'Trocar foto' : 'Enviar foto'}
                                <input ref={inputRef} type="file" className="hidden"
                                    accept={TIPOS_DE_IMAGEM_ACEITOS.join(',')}
                                    onChange={escolherFoto}
                                    disabled={enviando || migracaoOk === false} />
                            </label>
                            {caminhoDaFoto && (
                                <button onClick={() => setCaminhoDaFoto('')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-rose-400 transition-colors">
                                    <Trash2 size={12} /> Remover
                                </button>
                            )}
                        </div>
                    </div>

                    {migracaoOk === false && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                            <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold text-amber-300/90 leading-relaxed">
                                Banco sem a coluna da foto — o nome salva, a foto não.
                                <span className="block text-zinc-500 font-medium mt-0.5">
                                    Rode <span className="font-mono">supabase/perfil_nome_e_foto.sql</span> para habilitar.
                                </span>
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">
                            Nome
                        </label>
                        <input
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            placeholder="Como você quer ser chamado"
                            autoFocus
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white text-[13px] font-bold outline-none focus:border-amber-500/50 placeholder-zinc-700 transition-colors"
                        />
                        <p className="text-[10px] font-bold text-zinc-600 mt-1.5 ml-1">
                            Aparece no topo e nas telas que citam quem fez o lançamento.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-2">E-mail</label>
                            <p className="text-[11px] font-bold text-zinc-500 truncate px-1">{perfil?.email || '—'}</p>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-2">Cargo</label>
                            <p className="text-[11px] font-bold text-zinc-500 px-1" title="Só outro administrador muda o cargo">
                                {rotuloDoCargo(perfil?.role)}
                            </p>
                        </div>
                    </div>

                    {erro && (
                        <p className="text-[10px] font-bold text-rose-400 flex items-start gap-1.5">
                            <AlertTriangle size={12} className="shrink-0 mt-px" /> {erro}
                        </p>
                    )}
                </div>

                <div className="p-5 border-t border-zinc-800 bg-zinc-950/40 flex gap-2">
                    <button onClick={saida.pedirParaFechar} disabled={salvando}
                        className="px-5 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                        Cancelar
                    </button>
                    <button onClick={salvar} disabled={salvando || enviando}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                        {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    )}</>;
}

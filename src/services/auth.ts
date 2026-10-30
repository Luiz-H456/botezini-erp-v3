
import { supabase, SUPABASE_ENABLED } from './supabase';
import { UserProfile } from '../types';
import { isColunaAusente } from '../utils/postgrestErrors';

export const authService = {
    async signIn(email: string, password: string) {
        if (!SUPABASE_ENABLED || !supabase) {
            throw new Error("Sistema em Modo Restrito: Login indisponível sem configuração de servidor.");
        }
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Avisa quando a sessão acaba sem a pessoa ter clicado em Sair (outra aba saiu, token revogado
     * ou vencido sem renovar). Devolve a função que para de ouvir.
     */
    aoSessaoTerminar(fn: () => void): () => void {
        if (!SUPABASE_ENABLED || !supabase) return () => {};
        const { data } = supabase.auth.onAuthStateChange(evento => { if (evento === 'SIGNED_OUT') fn(); });
        return () => data.subscription.unsubscribe();
    },

    async signOut() {
        if (!SUPABASE_ENABLED || !supabase) {
            localStorage.clear();
            window.location.href = '/';
            return;
        }
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn("Supabase signOut failed, clearing local state anyway.");
        }
        localStorage.clear();
        window.location.href = '/'; 
    },

    async getCurrentProfile(): Promise<UserProfile | null> {
        if (!SUPABASE_ENABLED || !supabase) {
            return null;
        }

        try {
            // 1. Validate Session Integrity
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError) {
                console.error("Session Error:", sessionError.message);
                if (sessionError.message.includes('Failed to fetch')) {
                    throw new Error('Network Error during session check');
                }
                await this.handleCorruptToken();
                return null;
            }

            if (!session?.user) return null;

            // 2. Fetch Profile securely
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profileError) {
                console.warn("Profile fetch error:", profileError.message);
                return null;
            }

            return profile as UserProfile;

        } catch (err: any) {
            console.error("Critical Auth Error:", err);
            
            if (err.message === 'Network Error during session check') {
                return null;
            }

            if (
                err.message?.includes('invalid claim') || 
                err.message?.includes('missing sub claim') ||
                err.message?.includes('JWT')
            ) {
                await this.handleCorruptToken();
            }
            return null;
        }
    },

    /**
     * Grava nome e foto do PRÓPRIO usuário.
     *
     * `role` fica fora do payload por decisão, não por esquecimento: quem
     * consegue mudar o próprio cargo consegue se promover a admin. A política
     * do banco recusa de todo jeito, mas nem enviar é mais honesto que mandar
     * e ser barrado.
     */
    async updateOwnProfile(patch: { full_name?: string; avatar_url?: string | null }) {
        if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não configurado');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Usuário não autenticado');

        const { error } = await supabase
            .from('profiles')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', user.id);
        if (!error) return;

        // A coluna da foto pode não existir ainda (perfil_nome_e_foto.sql não
        // aplicado). Barrar a edição do NOME por causa dela seria perder as
        // duas coisas por falta de uma.
        if (isColunaAusente(error, 'avatar_url')) {
            const { avatar_url, ...semFoto } = patch;
            const repetir = await supabase
                .from('profiles')
                .update({ ...semFoto, updated_at: new Date().toISOString() })
                .eq('id', user.id);
            if (repetir.error) throw new Error(repetir.error.message);
            console.warn(
                '[profiles] coluna avatar_url ausente: perfil salvo SEM a foto. '
                + 'Rode supabase/perfil_nome_e_foto.sql para habilitar.');
            return;
        }
        throw new Error(error.message);
    },

    /** A migração da foto já foi aplicada? Governa se a galeria pode gravar. */
    async supportsAvatar(): Promise<boolean> {
        if (!SUPABASE_ENABLED || !supabase) return false;
        const { error } = await supabase.from('profiles').select('avatar_url').limit(1);
        return !isColunaAusente(error, 'avatar_url');
    },

    async handleCorruptToken() {
        console.error("Security: Corrupted Token detected. Purging session.");
        localStorage.clear();
        try {
            if (SUPABASE_ENABLED && supabase) {
                await supabase.auth.signOut();
            }
        } catch (e) { /* ignore */ }
    }
};

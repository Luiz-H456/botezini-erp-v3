
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENV, SUPABASE_ENABLED } from '../config/env';
import { comInvalidacaoAutomatica } from './cacheDeLeitura';

// Re-exporta para uso fácil em outros arquivos
export { SUPABASE_ENABLED };

// Inicializa o cliente APENAS se as chaves estiverem presentes.
// Caso contrário, retorna null, colocando a aplicação em "Modo Restrito" (Offline/Demo).
// O cliente sai embrulhado para toda escrita invalidar o cache de leitura
// sozinha (ver cacheDeLeitura.ts). É o único ponto por onde passam as 89
// escritas espalhadas pelos repositórios — marcar uma a uma seria esquecer
// alguma, e o sintoma do esquecimento é dado velho na tela, não erro.
export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? comInvalidacaoAutomatica(createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    }))
  : null;

if (!SUPABASE_ENABLED) {
  console.warn("⚠️ BOTEZINI ERP: Rodando em MODO RESTRITO (Sem conexão Supabase). Verifique o arquivo .env");
}

// Função utilitária para verificar conexão real (Ping)
export const checkConnection = async (): Promise<{ success: boolean; message?: string }> => {
  if (!SUPABASE_ENABLED || !supabase) {
    return {
      success: false,
      message: 'MODO RESTRITO: Chaves não configuradas.'
    };
  }

  try {
    // Tenta uma operação leve de autenticação para validar a conexão
    const { error } = await supabase.auth.getSession();
    if (error) throw error;

    return { success: true };
  } catch (e: any) {
    console.error("Supabase Connection Check Failed:", e);
    return {
      success: false,
      message: e.message || 'Erro de conexão desconhecido'
    };
  }
};

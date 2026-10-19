
/**
 * Módulo Central de Configuração de Ambiente
 * Fonte da verdade para variáveis de ambiente.
 * Usa Optional Chaining (?.) para garantir que a aplicação não quebre
 * se import.meta.env for undefined por algum motivo.
 */

interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MODE: string;
  DEV: boolean;
  PROD: boolean;
}

// Acesso direto com fallback seguro. 
// O Vite substitui estaticamente 'import.meta.env.VAR', mas o '?.' protege em runtime.
// Usamos casting (as any) para evitar erros de tipagem quando os types do Vite não estão carregados.
export const ENV: EnvConfig = {
  SUPABASE_URL: (import.meta as any).env?.VITE_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "",
  
  MODE: (import.meta as any).env?.MODE || "development",
  DEV: (import.meta as any).env?.DEV || false,
  PROD: (import.meta as any).env?.PROD || false,
};

// --- FEATURE FLAGS (MODO RESTRITO) ---
// Define se os serviços externos estão disponíveis baseando-se na presença das chaves.

export const SUPABASE_ENABLED = !!(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

// --- DIAGNÓSTICO ---
export const CONFIG_STATUS = {
  supabase: SUPABASE_ENABLED,
  mode: ENV.MODE
};

// Log de inicialização (Apenas em Desenvolvimento para Debug)
if (ENV.DEV) {
  console.groupCollapsed("🔧 BOTEZINI ERP - Environment Config");
  console.log("Supabase:", SUPABASE_ENABLED ? "✅ Connected" : "❌ Missing Keys (Restricted Mode)");
  console.log("Mode:", ENV.MODE);
  console.groupEnd();
}

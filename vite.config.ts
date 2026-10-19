import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { fileURLToPath } from "url" // Import fileURLToPath for __dirname

// Define __dirname para módulos ES (necessário para paths absolutos seguros)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Trava do ambiente isolado da v3.
 *
 * `npm run dev:v3` sobe o app em modo `v3`, que lê `.env.v3.local` e deve
 * falar SÓ com o Supabase que roda no Docker desta máquina. Se a URL apontar
 * para qualquer outro lugar — um `.env` copiado da pasta de produção, um
 * endereço colado errado —, o servidor nem sobe. Melhor uma tela que não abre
 * do que um teste da v3 gravando no banco que fatura.
 */
function exigirBancoLocal(mode: string) {
  if (mode !== 'v3') return;
  const url = loadEnv(mode, __dirname, 'VITE_').VITE_SUPABASE_URL || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* host vazio cai na recusa */ }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(
      `[v3] VITE_SUPABASE_URL precisa ser o Supabase local (127.0.0.1:55321), `
      + `e está "${url || '(vazia)'}". Recusando subir para não tocar a produção.`);
  }
}

export default defineConfig(({ mode }) => {
  exigirBancoLocal(mode);
  return {
  plugins: [react()],

  // Garante que o Vite busque o .env na raiz do projeto, 
  // independente da pasta onde o script é executado.
  envDir: path.resolve(__dirname),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 3001,
    watch: {
      // Tarefas em background criam git worktrees em .claude/worktrees/. Como
      // ficam dentro da raiz observada, o Vite via o tsconfig.json da cópia
      // aparecer, achava que a config tinha mudado e limpava o cache de
      // dependências — o navegador então tomava 504 "Outdated Optimize Dep"
      // em react, react-dom e afins, sem nada ter mudado no código.
      ignored: ['**/.claude/worktrees/**'],
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false
  }
  };
});

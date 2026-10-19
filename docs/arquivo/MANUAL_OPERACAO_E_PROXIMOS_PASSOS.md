# Manual de Operacao e Proximos Passos - Botezini ERP

## 1. Para o app rodar localmente

### 1.1. Instalar dependencias

No terminal, dentro da pasta do projeto:

```powershell
npm install
```

### 1.2. Criar o arquivo de ambiente local

Crie/restaure o arquivo `.env.local` na raiz do projeto.

Ele deve conter:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Essas duas variaveis sao obrigatorias para login. Sem elas, o app entra em modo restrito e mostra:

```text
Sistema em Modo Restrito: Login indisponivel sem configuracao de servidor.
```

O arquivo `.env.local` nao deve ser commitado no Git.

### 1.3. Rodar o app

```powershell
npm run dev
```

Depois abra a URL indicada pelo Vite. No seu caso, o app esta abrindo em:

```text
http://localhost:3002/
```

### 1.4. Reiniciar depois de alterar env

Sempre que alterar `.env.local`, pare o servidor e rode novamente:

```powershell
npm run dev
```

O Vite so carrega variaveis de ambiente quando o servidor inicia.

## 2. Como o login esta funcionando agora

O login usa Supabase Auth em `src/services/auth.ts`.

Fluxo:

1. Usuario informa email e senha.
2. O app chama `supabase.auth.signInWithPassword`.
3. Depois do login, o app busca o perfil em `public.profiles`.
4. O campo `role` decide o acesso:
   - `admin`: acesso administrativo.
   - `manager`: acesso gerencial.
   - `factory`: acesso restrito ao modulo de producao.

Se o login autenticar no Supabase, mas o app ainda mostrar acesso negado, verifique se existe uma linha em `public.profiles` com:

```sql
id = auth.users.id
role in ('admin', 'manager', 'factory')
```

## 3. SQL que pode precisar rodar

### 3.1. Hardening principal

Se o banco remoto ainda nao recebeu as correcoes de seguranca, rode no SQL Editor do Supabase:

```text
supabase/security_hardening_single_tenant.sql
```

Esse script foi preparado para o modelo single-tenant.

Ele endurece:

- RLS.
- Acesso anonimo.
- Funcoes financeiras criticas.
- Pagamentos.
- Cancelamento de obrigacoes.
- Movimento de estoque.
- Roles `admin`, `manager` e `factory`.

### 3.2. Remocao da tabela antiga de IA

Como o modulo de IA foi removido do app, se a tabela ainda existir no Supabase real e voce quiser limpar tambem o banco:

```sql
drop table if exists public.ai_jobs cascade;
```

Antes de rodar em producao, confirme que nenhum processo externo ainda usa essa tabela.

### 3.3. Obter o SQL real do Supabase

Para eu auditar exatamente o banco real, o ideal e gerar um dump/schema atual do Supabase.

Opcoes:

```powershell
supabase db dump --schema public --file supabase/schema_live.sql
```

Ou exportar pelo painel/SQL Editor do Supabase.

Sem esse dump, a auditoria fica baseada nos arquivos locais e no DOCX informado.

## 4. Como esta a seguranca/RLS agora

O projeto esta assumindo modelo single-tenant.

Ou seja:

- Nao ha isolamento por `empresa_id`/`tenant_id`.
- O isolamento principal e por autenticacao e papel.
- `admin` e `manager` podem operar o sistema.
- `factory` deve ficar limitado a producao.
- `anon` deve ficar sem acesso a tabelas e funcoes sensiveis.

Pontos ja tratados nos scripts/codigo:

- Remocao de arquivos `.env` versionados.
- `.gitignore` protegendo `.env*`.
- RLS habilitado nos schemas locais.
- Revogacao de acesso anonimo.
- Funcoes financeiras com validacoes mais fortes.
- Bloqueio de estoque negativo em movimentos de insumo.
- Remocao do modulo de IA e da fila `ai_jobs`.

## 5. Proximos passos recomendados da mentoria

### Passo 1 - Restaurar ambiente local

Criar `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

Depois reiniciar `npm run dev`.

### Passo 2 - Confirmar usuario administrador

No Supabase, confirmar que seu usuario existe em:

- `auth.users`
- `public.profiles`

E que `public.profiles.role = 'admin'`.

### Passo 3 - Validar SQL aplicado no banco real

Comparar o banco real com:

- `supabase/schema_official.sql`
- `supabase/security_hardening_single_tenant.sql`
- patch SQL do DOCX informado

O ideal e gerar `schema_live.sql` e revisar diferencas.

### Passo 4 - Rodar testes manuais criticos

Testar estes fluxos:

- Login admin.
- Login manager.
- Login factory.
- Criar cliente.
- Criar fornecedor.
- Criar produto.
- Criar insumo.
- Movimentar entrada de estoque.
- Bloquear saida maior que saldo.
- Criar orcamento.
- Converter orcamento em pedido.
- Entregar/concluir pedido.
- Verificar geracao de recebivel.
- Registrar pagamento parcial.
- Registrar pagamento total.
- Reverter pagamento.
- Cancelar obrigacao.
- Cancelar/excluir pedido e verificar financeiro.

### Passo 5 - Validar deploy Vercel

Na Vercel, configurar:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Nao configurar secrets antigas de IA.

Depois rodar deploy e conferir:

- Build passa.
- Login funciona.
- Usuario factory nao acessa financeiro.
- Usuario anonimo nao acessa dados.

### Passo 6 - Auditoria final de regras de negocio

Depois do app rodando com o banco real, confirmar regras humanas:

- Estoque pode ficar negativo? Recomendacao atual: nao.
- Orcamento pode ser convertido mais de uma vez?
- Quem pode alterar preco?
- Quem pode cancelar pedido?
- Pagamento parcial e obrigatorio no financeiro?
- Cancelamento de pedido deve cancelar recebiveis ou manter historico?
- Dados devem ser excluidos fisicamente ou marcados como inativos?

## 6. Checklist rapido

- [ ] `.env.local` existe.
- [ ] `VITE_SUPABASE_URL` preenchido.
- [ ] `VITE_SUPABASE_ANON_KEY` preenchido.
- [ ] Servidor Vite reiniciado.
- [ ] Usuario existe em `auth.users`.
- [ ] Usuario existe em `public.profiles`.
- [ ] Role do usuario esta correta.
- [ ] SQL de hardening aplicado ou comparado com banco real.
- [ ] Tabela `ai_jobs` removida se nao for mais usada.
- [ ] Deploy Vercel com envs corretas.
- [ ] Fluxos criticos testados.


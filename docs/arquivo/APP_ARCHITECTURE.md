# Botezini ERP - Arquitetura

## Visao Geral

ERP web para industria, com modulos de dashboard, cadastros, orcamentos, pedidos, producao, estoque e financeiro.

## Stack

- Frontend: React 18, Vite, TypeScript, Tailwind, Lucide, Recharts.
- Backend/BaaS: Supabase Auth, PostgreSQL, Storage e RLS.
- Deploy: Vercel.

## Estrutura

```text
src/
  components/     Componentes de UI e modais
  config/         Leitura/validacao de ambiente
  hooks/          Hooks de dominio e tela
  lib/            Infraestrutura local
  pages/          Telas principais
  repositories/   Chamadas diretas ao Supabase por dominio
  services/       Auth, Supabase, storage legado e PDF
  types/          Tipos TypeScript
  utils/          Formatadores e calculos
supabase/         Schemas, patches e SQL de hardening
```

## Autenticacao

`src/services/auth.ts` usa Supabase Auth. A sessao e lida no `App.tsx`, que carrega o perfil em `profiles` e decide a tela inicial conforme `role`.

Roles atuais:
- `admin`
- `manager`
- `factory`

Usuarios `factory` ficam presos ao modulo de producao no frontend. O hardening SQL tambem cria funcoes/policies para restringir acesso sensivel no banco.

## Dados

O app usa `repositories/` e `services/storage.ts` para acessar tabelas do Supabase. O modelo atual e single-tenant, com isolamento por autenticacao e papel, nao por `empresa_id`.

## Fluxos Principais

- Orcamento aprovado gera pedido de producao.
- Pedido entregue/concluido gera recebivel quando aplicavel.
- Cancelamento/exclusao de pedido reverte ou cancela obrigacoes financeiras associadas.
- Estoque de insumos bloqueia saida maior que saldo disponivel.
- Financeiro usa obrigacoes, pagamentos, contas bancarias e view `obligation_summary`.

## Ambiente

Variaveis locais esperadas:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` somente em ambiente de servidor quando necessario.

Arquivos `.env*` reais nao devem ser versionados.

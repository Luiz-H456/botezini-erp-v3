# Auditoria de Regra de Negocio do ERP

Indice consolidado das quatro partes da auditoria. A leitura foi guiada pela estrutura real do reposititorio, obtida por `rg --files`, sem presumir nomes de arquivos.

Data da leitura: 02/06/2026

## Arquivos da auditoria

1. [Parte 1 - arquitetura, modelo de dados e fluxos principais](./auditoria-parte1-arquitetura-fluxos.md)
2. [Parte 2 - financeiro completo](./auditoria-parte2-financeiro.md)
3. [Parte 3 - producao e estoque](./auditoria-parte3-producao-estoque.md)
4. [Parte 4 - riscos, perguntas abertas e roadmap](./auditoria-parte4-riscos-roadmap.md)

## Resumo executivo

O ERP e um app React + TypeScript + Vite que usa Supabase como backend real: autenticao, banco, RLS, RPCs, views e storage. A camada TypeScript acessa o banco via repositories e `storageService`. O deploy parece orientado a Vercel/Vite, mas existe um endpoint diagnostico em `api/dbSchema.ts` que precisa ser removido ou protegido antes de producao.

O sistema esta configurado como single-tenant. Admin e manager tem acesso amplo; factory e direcionado para producao. Novos usuarios criados pelo trigger do Supabase entram como `factory`, entao precisam ser promovidos para `admin` ou `manager` para acessar financeiro/dashboard.

## Pontos mais importantes

1. Financeiro: a regra correta para pagamento ativo e `reversed_at IS NULL AND reversal_of IS NULL`. O TypeScript ja usa essa regra em partes importantes, mas os SQLs versionados ainda mostram pontos com apenas `reversed_at IS NULL`. E preciso confirmar se o Supabase real ja esta corrigido ou se o dump esta desatualizado.
2. Categorias: o front envia `global_category_id` para recorrencias, mas o SQL versionado de `create_recurrence_obligations` recebe o parametro e nao mostra insercao da coluna. Confirmar no banco real.
3. Producao/estoque: a producao verifica ficha tecnica e ruptura, mas nao foi encontrada baixa automatica de estoque ao avancar/entregar pedido.
4. Pedido/financeiro: ha checagens para evitar recebivel duplicado por `order_id`, mas nao foi encontrada unique constraint.
5. Relatorios: alguns indicadores misturam valor contratado, valor pago e saldo em aberto. E preciso nomear/definir cada KPI antes de confiar em DRE, margem e dashboard.
6. Limpeza: existem logs de debug, endpoint diagnostico, docs antigas mencionando modulo removido, hooks possivelmente nao usados e tabelas legadas/paralelas no schema.

## Proxima decisao recomendada

Antes de refatorar ou limpar codigo, confirme o schema real do Supabase apos os fixes aplicados. Em seguida rode os cenarios financeiros da Parte 2 e responda as perguntas de regra de negocio da Parte 4, principalmente sobre consumo de estoque, duplicidade de recebivel e semantica dos relatorios.

# Project Context

Projeto: Botezini ERP

Tipo:
ERP empresarial com foco em indústria de manufatura e gestão financeira integrada.

Stack principal:
Frontend:
- React 18
- Vite
- TypeScript
- Tailwind CSS

Backend:
- Supabase (BaaS)

Banco de dados:
- PostgreSQL

Arquitetura Financeira Importante (Evite loops de análise):
O modelo é baseado em uma arquitetura de transações e views unificadas.
Em vez de tabelas físicas isoladas de contas_apagar e contas_areceber as informações financeiras derivam da conversão de Pedidos (Orders -> Invoices) e do fluxo de caixa que é gerado on-the-fly (`obligation_summary` VIEW / Supabase). A view `obligation_summary` unifica pedidos e transações de pagamento diversas num "Contas a Pagar / Receber" coerente.

Não procure tabelas desconexas de payables/receivables, pois o sistema resolve as baixas financeiras diretamente com as tabelas conectadas de invoices e transações usando o enum types (`receivable` e `payable`).

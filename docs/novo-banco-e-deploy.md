# Banco novo + deploy da v3 (15/10/2026)

A v3 sobe num projeto **novo e vazio** do Supabase e num deploy **novo** da Vercel. A produção atual
(banco, `main` e demais branches) não é tocada em nenhum passo.

## 1. Migração (1 arquivo, feito de um backup)

```
powershell -ExecutionPolicy Bypass -File .\scripts\v3_montar_migracao.ps1 -Dump <backup.sql>
```
Gera `migracao\botezini_v3_migracao.sql` (no `.gitignore`: tem dados reais e hashes de senha). Dentro de um banco
descartável: restaura o backup, roda os 5 SQLs da v3 + `limpeza_de_dados_v3.sql` e exporta tudo sem dono.
Refazer com backup mais novo a qualquer momento (1–2 min). Saldo dos bancos não é alterado pela limpeza.

## 2. Aplicar no banco novo

1. Supabase › New project (vazio). Guardar a senha do banco.
2. Connect › **Session pooler** (usuário `postgres.<ref>`, porta 5432). Na máquina, sem colar em chat:
   `$env:BOTEZINI_NOVO_DB_URI = 'postgresql://postgres.<ref>:SENHA@...pooler.supabase.com:5432/postgres'`
3. `powershell -ExecutionPolicy Bypass -File .\scripts\v3_aplicar_migracao.ps1`
   Recusa: sem a variável, conexão igual à da produção (`BOTEZINI_DB_URI`), ou banco com tabelas em `public`.
   É uma transação só: ou entra tudo, ou nada. Termina com as contagens (esperado no backup de 15/10:
   pedidos 44 · orçamentos 96 · clientes 64 · insumos 30 · contas financeiras 642 · logins 2).
4. Authentication › URL Configuration: Site URL = endereço do deploy novo.

Os logins entram com o mesmo e-mail e senha. Anexos (arquivos do storage) não vêm: aparecem listados e não abrem.

## 3. Depois de aplicar (você, na tela)

Dar baixa nas contas pagas por fora e, **depois**, informar o saldo do extrato em Cadastros › Bancos › Saldo atual.

## 4. Vercel (sem mexer em main nem em outras branches)

- Variáveis do projeto novo: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (do projeto NOVO). Build: `vite build`, saída `dist`.
- Por branch nova: `git push -u origin v3` cria só a branch `v3`. Ou, sem GitHub, `vercel deploy --prod` na pasta.
- Se a Vercel não publicar um push: conferir o autor do último commit (a conta aceita luuiizhcc@gmail.com; o git
  global está btzn.comercial@gmail.com).

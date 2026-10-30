# O que é do Luiz fazer

Atualizado em 29/10/2026. O que depende de você (acesso, senha, decisão ou banco de produção). Marque `[x]` quando fizer.
Ordem sugerida: de cima para baixo dentro de cada bloco.

---

## 1. Tabela verdade (v3.1) — antes de publicar

Está no ramo `feat/v3.1-tabela-verdade`, testada no banco local. **Não vai para o site antes do passo 1.1.**

- [ ] **1.1 Rodar o SQL no banco novo (São Paulo).**
  Supabase › projeto `ccmnzs…` › SQL Editor › colar o conteúdo de `supabase/v3_1_tabela_verdade.sql` › Run.
  - O que faz: cria as tabelas da tabela de preços, as regras de acesso (preço só para admin e gerente) e migra os
    tecidos de hoje (cada família vira um tecido no fornecedor dela, na linha "Geral"; o último preço pago vira o
    preço inicial na condição "À vista"; frete começa "a cotar").
  - O que assume: `supabase/compras_por_pedido.sql` já aplicado (está, na migração de 21/10).
  - Pode rodar mais de uma vez sem duplicar nada.
  - **Conferir:** a última tabela que aparece (DEPOIS) tem de ter **todas as colunas `problemas_*` = 0**, e
    `saldo_tecidos_igual_ao_antes` / `itens_de_compra_igual_ao_antes` iguais aos números de antes.
  - Me mande essa última linha.
- [ ] **1.2 Me dizer "pode publicar a v3.1"** — eu junto no `publicar-v3`; o push continua só com você pedindo.

### Depois de publicado (no app, em Cadastros › Fornecedores › fornecedor)

- [ ] **1.3 Frete e condições de cada fornecedor de tecido** (aba Dados): hoje todos começam com "À vista" e frete
  "a cotar". Cadastre as condições reais (à vista, 30 dias, 30/60/90…), marque a **padrão** (é a que entra nas
  contas) e o frete (CIF, por kg, fixo por remessa com o peso típico, ou a cotar).
  Se uma linha (ex.: Tricoline) tiver frete ou condição diferente, desligue "usa o do fornecedor" nela.
- [ ] **1.4 Preços que faltam.** Só 4 faixas migraram com preço (as que tinham compra). As outras aparecem como
  "sem preço" na coluna Ref. — preencha na grade.
- [ ] **1.5 Rendimento dos tecidos em metro** que pagam frete por kg (sem ele, o frete não entra na conta e aparece
  "tecido sem rendimento").
- [ ] **1.6 Os 15 tecidos sem família** não entraram na tabela (foram cadastrados como insumo solto). Para cada um que
  ainda se usa, crie o tecido em Fornecedor › Tabela de preços › "Novo tecido": DRY, TWO-WAY, BRIM SANTISTA, PRADA,
  TACTEL, MOLETOM, JEANS CEDRO 100% ALGODÃO, HELANCA PREMIUM, GABARDINE C/ LYCRA, GABARDINE MN, NAPA, OXFORD,
  MALHA PV JUMIRIM, Tecido Térmico Acolchoado, Lâmina PVC Impermeável.
  (O insumo antigo continua no Estoque com o saldo; quando quiser, junte os dois pelo "Mesclar" do Estoque.)

---

## 2. Fotos e anexos antigos (orçamentos, pedidos, clientes)

Os 62 anexos aparecem listados no projeto novo mas os arquivos estão no projeto antigo.

- [ ] **2.1 Salvar as chaves de serviço certas.** As que estão salvas hoje são a **anon** (pública) e não leem o bucket.
  Supabase › cada projeto › Project Settings › API Keys › **secret** (`sb_secret_…`) ou **service_role**.
  No PowerShell (pede escondido, não aparece na tela):
  ```powershell
  $k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'BOTEZINI_PROD_SERVICE_KEY (projeto ANTIGO)' -AsSecureString))); [Environment]::SetEnvironmentVariable('BOTEZINI_PROD_SERVICE_KEY', $k, 'User'); Remove-Variable k
  ```
  ```powershell
  $k = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host 'BOTEZINI_NOVO_SERVICE_KEY (projeto NOVO)' -AsSecureString))); [Environment]::SetEnvironmentVariable('BOTEZINI_NOVO_SERVICE_KEY', $k, 'User'); Remove-Variable k
  ```
- [ ] **2.2 Simular:** `powershell -ExecutionPolicy Bypass -File .\scripts\v3_copiar_anexos.ps1` — deve dizer
  "Existem no antigo: 62" (ou perto). Se recusar a chave, é a anon de novo.
- [ ] **2.3 Copiar:** o mesmo comando com `-Copiar`. Cada foto volta para o orçamento/pedido/cliente certo (mesmo caminho).

---

## 3. Segurança e configuração do site novo (se ainda não fez)

- [ ] **3.1 Vercel:** variáveis `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` apontando para o projeto de São Paulo, e redeploy.
- [ ] **3.2 Supabase › Authentication › URL Configuration:** Site URL = endereço do site na Vercel (é o link do e-mail de recuperação de senha).
- [ ] **3.3 Supabase › Authentication › Sign In / Providers:** desligar cadastro aberto (sign-ups). Usuário novo só por você.
- [ ] **3.4 Revogar as chaves da OpenAI e do Google** que ficaram no histórico do repositório antigo (gerar novas se ainda usar).
- [ ] **3.5 Manter o repositório `botezini-erp-v3` privado.**
- [ ] **3.6 Projeto antigo de Oregon** (pausado): pode excluir quando quiser — o de São Paulo é o oficial.

---

## 4. Decisões que estão com você

- [ ] **4.1 Avisos do Início:** "ignorar" hoje vale **até a situação mudar** (volta sozinho quando o número muda).
  Prefere "só por hoje"? É uma troca pequena.
- [ ] **4.2 Fábrica no "Ver pedido":** esconder os contatos do cliente (telefone/e-mail) de quem é da fábrica? Sim/não.
- [ ] **4.3 Auditoria de qualidade de vida** (`reviews/audit-as-ux-eng.md`): marque os itens que quer que eu implemente.

---

## 5. Depois

- [ ] **5.1 Site da barbearia (barbeariastiloblack):** revisar para entregar ao cliente — preciso da pasta local ou do repositório.

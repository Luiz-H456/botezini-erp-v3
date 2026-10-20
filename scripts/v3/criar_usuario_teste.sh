#!/bin/sh
# Cria (ou recria) um usuário de teste da v3 no Supabase LOCAL.
#   sh scripts/v3/criar_usuario_teste.sh           -> admin    (V3_TESTE_EMAIL / V3_TESTE_SENHA)
#   sh scripts/v3/criar_usuario_teste.sh fabrica   -> fábrica  (V3_FABRICA_EMAIL / V3_FABRICA_SENHA)
# Lê e-mail e senha de .env.v3.local (ignorado pelo git); se não existirem, gera.
# Só fala com o contêiner supabase_db_botezini-v3. Nunca com produção.
set -eu
cd "$(dirname "$0")/../.."
ENV=.env.v3.local
if [ "${1:-}" = "fabrica" ]; then
  PREFIXO=V3_FABRICA; PAPEL=factory; PADRAO=teste-fabrica-v3@botezini.local; NOME="Fábrica v3"
else
  PREFIXO=V3_TESTE;   PAPEL=admin;   PADRAO=teste-v3@botezini.local;         NOME="Teste v3"
fi
if ! grep -q "^${PREFIXO}_SENHA=" "$ENV"; then
  echo "${PREFIXO}_EMAIL=$PADRAO" >> "$ENV"
  echo "${PREFIXO}_SENHA=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")" >> "$ENV"
fi
EMAIL=$(grep "^${PREFIXO}_EMAIL=" "$ENV" | cut -d= -f2-)
SENHA=$(grep "^${PREFIXO}_SENHA=" "$ENV" | cut -d= -f2-)
export MSYS_NO_PATHCONV=1
docker exec -e PGPASSWORD=postgres -i supabase_db_botezini-v3 psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
  -v email="$EMAIL" -v senha="$SENHA" -v papel="$PAPEL" -v nome="$NOME" <<'SQL'
DELETE FROM auth.users WHERE email = :'email';
WITH u AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          :'email', extensions.crypt(:'senha', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', :'nome'), now(), now(), '', '', '', '')
  RETURNING id, email
)
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now() FROM u;
INSERT INTO public.profiles (id, email, role, full_name)
SELECT id, email, :'papel', :'nome' FROM auth.users WHERE email = :'email'
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name;
SQL
echo "usuário de teste pronto ($PAPEL): $EMAIL (senha em $ENV)"

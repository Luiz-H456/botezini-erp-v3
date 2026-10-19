# =============================================================================
# CARREGAR A V3 - zera o banco local da v3 e o enche com um dump de producao
#
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_carregar_dump.ps1
#     powershell -ExecutionPolicy Bypass -File .\scripts\v3_carregar_dump.ps1 -Dump C:\caminho\do\dump.sql
#
# Sem -Dump, usa o backup mais recente de ..\botezinipvd-1\backups (o que o
# scripts\backup.ps1 da pasta de producao gera).
#
# NAO TOCA NA PRODUCAO
#   Este script nao conhece a BOTEZINI_DB_URI e nao fala com o Supabase da
#   nuvem. Ele so le um ARQUIVO de dump e escreve em dois conteineres desta
#   maquina: um descartavel, que some no fim, e o banco local da v3.
#
#   O "supabase db reset" tem uma opcao --linked que zera o projeto REMOTO
#   vinculado. Aqui vai sempre --local, e o script ainda se recusa a rodar se
#   esta pasta estiver vinculada a algum projeto (supabase\.temp\project-ref).
#
# O QUE ACONTECE
#   1. o banco local da v3 e zerado (supabase db reset --local);
#   2. um Postgres do Supabase descartavel recebe o dump INTEIRO - o mesmo
#      caminho que o conferir_backup.ps1 ja prova que funciona;
#   3. de la sai so o que e da Botezini (ver scripts\v3\montar_carga.sh);
#   4. isso entra no banco da v3 numa transacao so: ou tudo, ou nada.
#
# A senha "postgres" usada abaixo e a padrao de TODO Supabase local. Nao e
# segredo e nao abre nada fora desta maquina.
# =============================================================================

param([string]$Dump)

$ErrorActionPreference = 'Stop'

$Raiz      = Split-Path -Parent $PSScriptRoot
$Local     = 'supabase_db_botezini-v3'
$Transito  = 'v3-transito'
$Imagem    = 'supabase/postgres:17.6.1.167'
$Supabase  = Join-Path $Raiz 'node_modules\.bin\supabase.cmd'

# Mesmo motivo do backup.ps1: no PowerShell 5.1, stderr de executavel nativo
# vira excecao com 'Stop'. Quem decide se deu certo e o $LASTEXITCODE.
function Invoke-Nativo {
    param([string]$Exe, [string[]]$Argumentos, [switch]$Mostrar)
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Mostrar) { & $Exe @Argumentos 2>&1 | ForEach-Object { "    $_" } }
        else { & $Exe @Argumentos 2>&1 | Out-Null }
    } finally { $ErrorActionPreference = $antes }
}

function Falhar([string]$Msg) {
    Write-Host ""
    Write-Host "  $Msg" -ForegroundColor Red
    Invoke-Nativo docker @('rm', '-f', $Transito)
    exit 1
}

Write-Host ""
Write-Host "  CARREGAR A V3 - banco local" -ForegroundColor Cyan
Write-Host "  ---------------------------"

# --- travas ------------------------------------------------------------------
if (Test-Path (Join-Path $Raiz 'supabase\.temp\project-ref')) {
    Falhar "Esta pasta esta vinculada a um projeto do Supabase na nuvem. Recusando."
}
Invoke-Nativo docker @('info')
if ($LASTEXITCODE -ne 0) { Falhar "Docker nao esta respondendo. Abra o Docker Desktop." }

if (-not $Dump) {
    $pasta = Join-Path (Split-Path -Parent $Raiz) 'botezinipvd-1\backups'
    $ultimo = Get-ChildItem $pasta -Filter 'botezini_*.sql' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $ultimo) { Falhar "Nenhum dump em $pasta. Passe -Dump C:\caminho\do\arquivo.sql" }
    $Dump = $ultimo.FullName
}
if (-not (Test-Path $Dump)) { Falhar "Dump nao encontrado: $Dump" }
Write-Host "  Dump: $Dump" -ForegroundColor DarkGray

# --- 1. banco local da v3 de pe e zerado --------------------------------------
Push-Location $Raiz
try {
    Invoke-Nativo $Supabase @('status')
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Subindo o Supabase local da v3..." -ForegroundColor DarkGray
        Invoke-Nativo $Supabase @('start', '-x', 'vector,logflare,edge-runtime,imgproxy,supavisor')
        if ($LASTEXITCODE -ne 0) { Falhar "O Supabase local nao subiu. Rode: npm run db:v3:start" }
    }
    Write-Host "  Zerando o banco da v3..." -ForegroundColor DarkGray
    Invoke-Nativo $Supabase @('db', 'reset', '--local', '--no-seed')
    if ($LASTEXITCODE -ne 0) { Falhar "O reset do banco local falhou." }
} finally { Pop-Location }

# --- 2. dump inteiro no conteiner descartavel --------------------------------
Invoke-Nativo docker @('rm', '-f', $Transito)
Write-Host "  Restaurando o dump num banco descartavel..." -ForegroundColor DarkGray
Invoke-Nativo docker @('run', '-d', '--name', $Transito, '-e', 'POSTGRES_PASSWORD=descartavel', $Imagem)
if ($LASTEXITCODE -ne 0) { Falhar "Nao consegui subir o conteiner descartavel." }

# Duas condicoes, como no conferir_backup.ps1: a imagem sobe um servidor
# TEMPORARIO no init, e um "pronto" contra ele mata a restauracao no meio.
$pronto = $false
$antes = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    foreach ($i in 1..120) {
        $saida = & docker logs $Transito 2>&1 | Out-String
        if ($saida -match 'init process complete') {
            & docker exec $Transito psql -U postgres -tAc 'SELECT 1' 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
        }
        Start-Sleep -Seconds 2
    }
} finally { $ErrorActionPreference = $antes }
if (-not $pronto) { Falhar "O banco descartavel nao ficou pronto em 4 minutos." }

Invoke-Nativo docker @('cp', $Dump, "${Transito}:/tmp/dump.sql")
Invoke-Nativo docker @('exec', $Transito, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/dump.sql')
if ($LASTEXITCODE -ne 0) { Falhar "O dump nao restaurou no banco descartavel." }

# --- 3. montar a carga -------------------------------------------------------
Invoke-Nativo docker @('cp', (Join-Path $PSScriptRoot 'v3\montar_carga.sh'), "${Transito}:/tmp/montar_carga.sh")
# O git do Windows pode ter devolvido o .sh com CRLF; o sh nao aceita.
Invoke-Nativo docker @('exec', $Transito, 'sed', '-i', 's/\r$//', '/tmp/montar_carga.sh')
Invoke-Nativo docker @('exec', $Transito, 'sh', '/tmp/montar_carga.sh') -Mostrar
if ($LASTEXITCODE -ne 0) { Falhar "Nao consegui montar a carga." }

$tmp = Join-Path $env:TEMP 'v3_carga.sql'
Invoke-Nativo docker @('cp', "${Transito}:/tmp/v3/carga.sql", $tmp)
Invoke-Nativo docker @('rm', '-f', $Transito)

# --- 4. aplicar no banco da v3 -------------------------------------------------
Write-Host "  Aplicando no banco da v3..." -ForegroundColor DarkGray
Invoke-Nativo docker @('cp', $tmp, "${Local}:/tmp/carga.sql")
Remove-Item $tmp -Force
Invoke-Nativo docker @('exec', '-e', 'PGPASSWORD=postgres', $Local, 'psql', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/carga.sql')
if ($LASTEXITCODE -ne 0) { Falhar "A carga falhou e foi desfeita inteira (transacao). O banco da v3 ficou vazio." }

$consulta = @"
SELECT 'contas ' || (SELECT count(*) FROM auth.users)
    || ' | pedidos ' || (SELECT count(*) FROM public.orders)
    || ' | contas financeiras ' || (SELECT count(*) FROM public.financial_obligations)
    || ' | tabelas ' || (SELECT count(*) FROM pg_tables WHERE schemaname = 'public');
"@
$contagem = $consulta | & docker exec -i $Local psql -U postgres -tA 2>$null
Write-Host ""
Write-Host "  V3 CARREGADA" -ForegroundColor Green
Write-Host "  $contagem"
Write-Host "  Entre em http://localhost:5175 com o mesmo e-mail e senha de sempre."
Write-Host ""

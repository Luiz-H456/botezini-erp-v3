# =============================================================================
# BACKUP DO BANCO — Botezini ERP
#
# COMO USAR — duas formas
#
#   A. UMA VEZ SÓ, e depois é só pedir  (recomendado)
#      No SEU PowerShell, guarde a conexão no seu perfil de usuário:
#
#          [Environment]::SetEnvironmentVariable(
#              'BOTEZINI_DB_URI', 'postgresql://...', 'User')
#
#      Feche e reabra o terminal. A partir daí o script acha a conexão sozinho:
#
#          .\scripts\backup.ps1
#
#      A senha passa a morar no seu perfil do Windows, e vai do seu ambiente
#      direto para dentro do contêiner. Quem rodar o script — inclusive o
#      Claude Code, quando você pedir um backup — nunca lê o valor.
#
#   B. DIGITANDO NA HORA
#
#          .\scripts\backup.ps1 -Perguntar
#
#      Pede a conexão às cegas. Use no SEU terminal, nunca pelo Claude Code:
#      assim a senha passaria pelo comando e entraria no histórico da conversa.
#
# ONDE ACHAR A STRING DE CONEXÃO
#   Supabase → seu projeto → botão "Connect" (topo da tela)
#   → aba "Session pooler" → copie a URI inteira
#   → troque [YOUR-PASSWORD] pela senha do banco
#
#   Use o SESSION POOLER, não o Transaction. O transaction (porta 6543) não
#   aguenta pg_dump. E a conexão direta (db.<ref>.supabase.co) só responde em
#   IPv6, que a maioria das redes domésticas não tem.
#
# NÃO PRECISA INSTALAR NADA
#   O pg_dump roda dentro do Docker. Só o Docker Desktop precisa estar aberto.
# =============================================================================

param(
    # Sem isto o script NUNCA pergunta nada, e é o que o torna seguro de rodar
    # de forma automatizada: sem a variável de ambiente ele explica e sai, em
    # vez de travar esperando uma digitação que não vem.
    [switch]$Perguntar
)

$ErrorActionPreference = 'Stop'

# -----------------------------------------------------------------------------
# Chamar o docker sem que o PowerShell exploda
#
# No Windows PowerShell 5.1, redirecionar a saida de erro de um executavel
# NATIVO embrulha cada linha num ErrorRecord. Com $ErrorActionPreference='Stop'
# isso vira EXCECAO — mesmo quando o comando terminou bem.
#
# O efeito era perverso: as mensagens de erro caprichadas deste script
# ("Docker nao esta respondendo", "o conteiner ja existe") nunca chegavam a ser
# impressas, porque o proprio ato de silenciar o docker ja tinha derrubado o
# script antes. Quanto mais cuidadoso o tratamento de erro, menos ele aparecia.
#
# Aqui a preferencia cai para 'Continue' so durante a chamada, e quem decide se
# deu certo e o $LASTEXITCODE, que e a fonte de verdade de um processo externo.
# -----------------------------------------------------------------------------
#
# Os argumentos vao num ARRAY unico, e nao soltos. Soltos, o PowerShell tenta
# casa-los com os parametros da funcao antes de repassar: o `-e` do docker vira
# "nome de parametro ambiguo" porque parece um começo de -ErrorAction. Um array
# nao passa por essa negociacao.
function Invoke-DockerSilencioso {
    param([string[]]$Argumentos)
    $antes = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker @Argumentos 2>&1 | Out-Null } finally { $ErrorActionPreference = $antes }
}

# Versão do Postgres do contêiner. Precisa ser IGUAL OU MAIOR que a do servidor,
# senão o pg_dump recusa a conexão com "server version mismatch".
$ImagemPostgres = 'postgres:17'

$Raiz    = Split-Path -Parent $PSScriptRoot
$Destino = Join-Path $Raiz 'backups'
$Arquivo = "botezini_$(Get-Date -Format 'yyyy-MM-dd_HHmm').sql"
$Caminho = Join-Path $Destino $Arquivo

if (-not (Test-Path $Destino)) { New-Item -ItemType Directory $Destino | Out-Null }

# --- Docker está de pé? -------------------------------------------------------
Invoke-DockerSilencioso @('info')
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Docker nao esta respondendo." -ForegroundColor Red
    Write-Host "  Abra o Docker Desktop, espere ficar verde, e rode de novo."
    Write-Host ""
    exit 1
}

# --- A string de conexão ------------------------------------------------------
Write-Host ""
Write-Host "  BACKUP DO BANCO - BOTEZINI" -ForegroundColor Cyan
Write-Host "  --------------------------"

$Uri = $env:BOTEZINI_DB_URI

if (-not [string]::IsNullOrWhiteSpace($Uri)) {
    # O valor NUNCA é impresso. Só o fato de existir.
    Write-Host "  Conexao: BOTEZINI_DB_URI (do seu perfil)" -ForegroundColor DarkGray

} elseif ($Perguntar) {
    Write-Host "  Cole a string de conexao (Supabase > Connect > Session pooler),"
    Write-Host "  ja com a senha no lugar de [YOUR-PASSWORD]."
    Write-Host "  O que voce colar NAO aparece na tela." -ForegroundColor DarkGray
    Write-Host ""

    $Segura = Read-Host -Prompt '  Conexao' -AsSecureString
    $Ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Segura)
    try {
        $Uri = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($Ptr)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }

} else {
    Write-Host ""
    Write-Host "  Falta a conexao com o banco." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Guarde-a UMA VEZ no seu perfil, rodando isto no SEU PowerShell:"
    Write-Host ""
    Write-Host "    [Environment]::SetEnvironmentVariable(" -ForegroundColor DarkGray
    Write-Host "        'BOTEZINI_DB_URI', 'postgresql://...', 'User')" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Feche e reabra o terminal. Depois disso este script roda sozinho,"
    Write-Host "  e quem o rodar por voce nunca le a senha."
    Write-Host ""
    Write-Host "  Para digitar na hora, no SEU terminal:"
    Write-Host "    .\scripts\backup.ps1 -Perguntar"
    Write-Host ""
    exit 2
}

if ([string]::IsNullOrWhiteSpace($Uri)) {
    Write-Host "  Nada foi informado. Cancelado." -ForegroundColor Yellow
    exit 1
}
if ($Uri -notlike 'postgres*://*') {
    Write-Host ""
    Write-Host "  Isso nao parece uma string de conexao." -ForegroundColor Red
    Write-Host "  Ela comeca com postgresql:// e termina com /postgres"
    exit 1
}
# O exemplo do manual passa nos testes ingenuos: 'postgresql://...' comeca com
# postgresql://, nao tem YOUR-PASSWORD e nao tem :6543. Sem esta checagem, o
# erro so aparecia depois de baixar 400 MB de imagem do Docker, e vinha como
# "could not translate host name" — que nao diz a ninguem que o problema foi
# copiar a linha de exemplo em vez da conexao.
if ($Uri -notmatch '^postgres(ql)?://[^:/@]+:[^@]+@[A-Za-z0-9.\-]+:[0-9]+/') {
    Write-Host ""
    Write-Host "  A conexao guardada nao tem host, porta e senha." -ForegroundColor Red
    Write-Host ""
    Write-Host "  O formato esperado e:"
    Write-Host "    postgresql://USUARIO:SENHA@HOST:5432/postgres" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Se voce guardou a linha de EXEMPLO do manual ('postgresql://...'),"
    Write-Host "  e so trocar pelo valor de verdade:"
    Write-Host ""
    Write-Host "    Supabase > seu projeto > Connect > aba Session pooler" -ForegroundColor DarkGray
    Write-Host "    copie a URI inteira e troque [YOUR-PASSWORD] pela senha do banco" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Depois, no SEU PowerShell:"
    Write-Host "    [Environment]::SetEnvironmentVariable('BOTEZINI_DB_URI', 'a-uri-real', 'User')" -ForegroundColor DarkGray
    Write-Host "  Feche e reabra o terminal."
    Write-Host ""
    exit 1
}

if ($Uri.Contains('YOUR-PASSWORD')) {
    Write-Host ""
    Write-Host "  Falta trocar [YOUR-PASSWORD] pela senha." -ForegroundColor Red
    exit 1
}
if ($Uri.Contains(':6543/')) {
    Write-Host ""
    Write-Host "  Essa e a porta do Transaction pooler (6543)." -ForegroundColor Red
    Write-Host "  O pg_dump precisa do Session pooler (porta 5432)."
    exit 1
}

# --- O dump -------------------------------------------------------------------
#
# Duas decisões que valem explicação:
#
# 1. A URI vai por variável de ambiente HERDADA (-e PGURI, sem valor). Escrever
#    -e "PGURI=$Uri" colocaria a senha na linha de comando do docker, visível
#    para qualquer processo que liste os processos da máquina.
#
# 2. Quem escreve o arquivo é o pg_dump, dentro do contêiner (-f), e não um
#    redirecionamento do PowerShell. O > daqui grava em UTF-8 COM BOM, e o BOM
#    no começo do .sql faz o psql engasgar na hora de restaurar — um backup que
#    só falha no dia em que você precisa dele.
Write-Host ""
Write-Host "  Baixando... (a primeira vez demora: o Docker puxa a imagem)" -ForegroundColor DarkGray

$env:PGURI = $Uri
$Uri = $null
try {
    # A saida de erro do pg_dump precisa CHEGAR na tela — e ali que vem
    # "password authentication failed" e "could not translate host name". Por
    # isso aqui a preferencia cai para 'Continue' em vez de silenciar: o
    # objetivo nunca foi esconder o erro, era nao deixar o PowerShell
    # transformar o aviso do processo em excecao antes de voce ler.
    $antesEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        docker run --rm -e PGURI -v "${Destino}:/backup" $ImagemPostgres `
            sh -c "pg_dump `"`$PGURI`" --no-owner --no-privileges --clean --if-exists -f /backup/$Arquivo"
        $codigo = $LASTEXITCODE
    } finally { $ErrorActionPreference = $antesEAP }
} finally {
    # Some do processo atual. BOTEZINI_DB_URI, no perfil do usuário, fica.
    Remove-Item Env:\PGURI -ErrorAction SilentlyContinue
}

if ($codigo -ne 0) {
    Write-Host ""
    Write-Host "  O pg_dump falhou (codigo $codigo). A mensagem esta logo acima." -ForegroundColor Red
    if (Test-Path $Caminho) { Remove-Item $Caminho }
    exit 1
}

# --- Conferência --------------------------------------------------------------
# Um arquivo criado não é um backup. Estas quatro perguntas separam um dump útil
# de um arquivo vazio com nome bonito — e a última, "fechou?", é a que pega o
# dump interrompido no meio, que é o modo de falhar mais traiçoeiro.
if (-not (Test-Path $Caminho)) {
    Write-Host ""
    Write-Host "  O pg_dump disse que deu certo, mas nao ha arquivo." -ForegroundColor Red
    exit 1
}

$Info    = Get-Item $Caminho
$Mb      = [math]::Round($Info.Length / 1MB, 2)
$Texto   = Get-Content $Caminho -Raw
$Tabelas = ([regex]::Matches($Texto, '(?m)^CREATE TABLE ')).Count
$Copias  = ([regex]::Matches($Texto, '(?m)^COPY public\.')).Count
$Fechou  = $Texto -match 'PostgreSQL database dump complete'
$Texto   = $null

if ($Fechou -and $Tabelas -gt 0) {
    $Titulo = '  BACKUP OK'
    $Cor    = 'Green'
} else {
    $Titulo = '  BACKUP SUSPEITO - confira antes de confiar nele'
    $Cor    = 'Yellow'
}
if ($Fechou) { $Rodape = 'sim' } else { $Rodape = 'NAO - o dump foi cortado no meio' }

Write-Host ""
Write-Host $Titulo -ForegroundColor $Cor
Write-Host "  --------------------------"
Write-Host "  Arquivo : backups\$Arquivo"
Write-Host "  Tamanho : $Mb MB"
Write-Host "  Tabelas : $Tabelas"
Write-Host "  Com dado: $Copias"
Write-Host "  Fechado : $Rodape"
Write-Host ""
Write-Host "  Guarde uma copia FORA desta maquina antes de mexer no banco." -ForegroundColor DarkGray
Write-Host ""

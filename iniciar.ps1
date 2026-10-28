<#
  Liiot HQ: instala lo que falte, compila la interfaz si cambió y abre HQ en el navegador.

  Uso (o doble clic en iniciar.cmd):
    .\iniciar.ps1                 solo este PC, puerto 8000
    .\iniciar.ps1 -Puerto 8080    otro puerto
    .\iniciar.ps1 -Red            también desde otros equipos de la misma red (sin contraseña)
    .\iniciar.ps1 -SinNavegador   no abre el navegador
    .\iniciar.ps1 -Compilar       fuerza a compilar la interfaz de nuevo
#>
param(
  [int]$Puerto = 8000,
  [switch]$Red,
  [switch]$SinNavegador,
  [switch]$Compilar
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$back = Join-Path $root 'backend'
$front = Join-Path $root 'frontend'
$venvPy = Join-Path $back '.venv\Scripts\python.exe'
$url = "http://localhost:$Puerto"
# Para revisar si responde se usa 127.0.0.1: con «localhost» Windows prueba IPv6 primero y tarda unos 3 s
$api = "http://127.0.0.1:$Puerto"

function Paso([string]$texto) { Write-Host "`n> $texto" -ForegroundColor Magenta }
function Falla([string]$texto) { Write-Host "`nX $texto" -ForegroundColor Red; exit 1 }

# ¿El puerto ya está en uso? Si es HQ, solo abre el navegador; si es otro programa, avisa.
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
  try {
    Invoke-RestMethod "$api/api/health" -TimeoutSec 3 | Out-Null
  } catch {
    Falla "El puerto $Puerto está ocupado por otro programa. Prueba con: .\iniciar.ps1 -Puerto 8080"
  }
  Paso "HQ ya está corriendo en $url"
  if (-not $SinNavegador) { Start-Process $url }
  exit 0
}

# 1. Python y sus dependencias
if (-not (Test-Path $venvPy)) {
  Paso 'Creando el entorno de Python (solo la primera vez)...'
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
  if (-not $python) { Falla 'No encontré Python. Instala Python 3.12 desde python.org (marca "Add python.exe to PATH") y vuelve a abrir esto.' }
  & $python.Source -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
  if ($LASTEXITCODE -ne 0) { Falla 'Se necesita Python 3.10 o más nuevo (recomendado 3.12).' }
  & $python.Source -m venv (Join-Path $back '.venv')
  if ($LASTEXITCODE -ne 0) { Falla 'No se pudo crear el entorno de Python.' }
}
$req = Join-Path $back 'requirements.txt'
$sello = Join-Path $back '.venv\.instalado'
$huella = (Get-FileHash $req).Hash
if (-not (Test-Path $sello) -or (Get-Content $sello -Raw).Trim() -ne $huella) {
  Paso 'Instalando dependencias de Python...'
  & $venvPy -m pip install --disable-pip-version-check -q -r $req
  if ($LASTEXITCODE -ne 0) { Falla 'Falló la instalación de dependencias de Python (revisa tu conexión).' }
  Set-Content $sello $huella
}

# 2. Interfaz: compila solo si no existe o si algo cambió desde la última vez
$dist = Join-Path $front 'dist\index.html'
$hayQueCompilar = $Compilar -or -not (Test-Path $dist)
if (-not $hayQueCompilar) {
  $compilado = (Get-Item $dist).LastWriteTime
  # Carpetas y archivos van aparte: Get-ChildItem -Recurse sobre un archivo busca ese nombre en todas las
  # subcarpetas (node_modules incluido) y eso tardaba más de 20 s
  $carpetas = 'src', 'public' | ForEach-Object { Join-Path $front $_ } | Where-Object { Test-Path $_ }
  $archivos = 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json' | ForEach-Object { Join-Path $front $_ } | Where-Object { Test-Path $_ }
  $fuentes = @(Get-ChildItem $carpetas -Recurse -File) + @(Get-Item $archivos)
  $hayQueCompilar = [bool]($fuentes | Where-Object { $_.LastWriteTime -gt $compilado } | Select-Object -First 1)
}
if ($hayQueCompilar) {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Falla 'No encontré Node.js. Instala la versión LTS desde nodejs.org y vuelve a abrir esto.' }
  Push-Location $front
  try {
    if (-not (Test-Path 'node_modules')) {
      Paso 'Instalando dependencias de la interfaz (solo la primera vez, tarda un par de minutos)...'
      & npm.cmd install --no-audit --no-fund
      if ($LASTEXITCODE -ne 0) { Falla 'Falló npm install (revisa tu conexión).' }
    }
    Paso 'Compilando la interfaz...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { Falla 'La compilación falló; revisa el mensaje de arriba.' }
  } finally { Pop-Location }
}

# 3. Servidor (y el bot de Telegram, si hay token en .env)
$escucha = '127.0.0.1'
if ($Red) {
  $escucha = '0.0.0.0'
  $ips = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | ForEach-Object { "http://$($_.IPAddress):$Puerto" }) -join '  '
  Write-Host "`nModo red: desde otro equipo de esta red entra con $ips" -ForegroundColor Yellow
  Write-Host 'HQ no tiene contraseña: úsalo solo en una red de confianza (la de la casa u oficina).' -ForegroundColor Yellow
}
if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host "`nSin archivo .env: HQ funciona, pero el bot de Telegram queda apagado (ver README)." -ForegroundColor DarkGray
}
if (-not $SinNavegador) {
  # Abre el navegador apenas el servidor responda (en segundo plano dentro de este mismo proceso;
  # Start-Job tardaba unos 6 s solo en arrancar)
  $abridor = [powershell]::Create().AddScript({
    param($api, $url)
    for ($i = 0; $i -lt 120; $i++) {
      try { Invoke-WebRequest "$api/api/health" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $url; return } catch { Start-Sleep -Milliseconds 500 }
    }
  }).AddArgument($api).AddArgument($url)
  $null = $abridor.BeginInvoke()
}
Paso "Liiot HQ en $url  (para detenerlo: Ctrl+C o cierra esta ventana)"
Push-Location $back
try {
  & $venvPy -m uvicorn app.main:app --host $escucha --port $Puerto
} finally {
  Pop-Location
}

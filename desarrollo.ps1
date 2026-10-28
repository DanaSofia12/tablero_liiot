<#
  Modo desarrollo: backend con recarga automática (puerto 8000, en otra ventana)
  + interfaz con Vite y recarga en caliente (puerto 5173, en esta ventana).
  Ejecuta iniciar.ps1 al menos una vez antes (crea el entorno de Python).
#>
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$back = Join-Path $root 'backend'
$front = Join-Path $root 'frontend'
$venvPy = Join-Path $back '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPy)) {
  Write-Host 'Primero abre iniciar.cmd una vez: crea el entorno de Python.' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $front 'node_modules'))) {
  Push-Location $front
  try { & npm.cmd install --no-audit --no-fund } finally { Pop-Location }
}

$backend = "Set-Location '$back'; & '$venvPy' -m uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $backend
Write-Host 'Backend: http://localhost:8000 (otra ventana) · Interfaz: http://localhost:5173' -ForegroundColor Magenta

Push-Location $front
try { & npm.cmd run dev -- --open } finally { Pop-Location }

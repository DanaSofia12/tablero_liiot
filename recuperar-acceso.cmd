@echo off
rem Genera un código para volver a entrar a Liiot Hub si se olvidó la contraseña.
title Recuperar acceso a Liiot Hub
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Primero abre Liiot Hub una vez con iniciar.cmd.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m app.recovery
pause

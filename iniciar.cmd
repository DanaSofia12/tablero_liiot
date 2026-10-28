@echo off
rem Doble clic para abrir Liiot HQ. Para detenerlo, cierra esta ventana.
title Liiot HQ
powershell -NoProfile -File "%~dp0iniciar.ps1" %*
if errorlevel 1 pause

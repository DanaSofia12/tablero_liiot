@echo off
rem Doble clic para abrir Liiot Hub. Para detenerlo, cierra esta ventana.
title Liiot Hub
powershell -NoProfile -File "%~dp0iniciar.ps1" %*
if errorlevel 1 pause

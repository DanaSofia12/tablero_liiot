# Liiot HQ

Espacio interno del equipo Liiot: tareas de Bleepy, rúbrica de lanzamiento del piloto, carga de cada persona, una oficina 3D con los avatares de los tres y un bot de Telegram que hace seguimiento. Corre en este PC, no está publicado en internet y no cuesta nada.

## Abrirlo

1. **Requisitos (una sola vez):** [Python 3.12](https://www.python.org/downloads/) (al instalar, marca *Add python.exe to PATH*) y [Node.js LTS](https://nodejs.org/).
2. **Doble clic en `iniciar.cmd`.** La primera vez instala todo y compila la interfaz (unos minutos); después abre en segundos.
3. Se abre **http://localhost:8000**. Para apagarlo, cierra la ventana negra.

Opciones desde PowerShell:

| Comando | Qué hace |
|---|---|
| `.\iniciar.ps1` | Igual que el doble clic |
| `.\iniciar.ps1 -Puerto 8080` | Usa otro puerto |
| `.\iniciar.ps1 -Red` | Deja entrar desde otros equipos de la misma red (ver «Red local») |
| `.\iniciar.ps1 -SinNavegador` | No abre el navegador |
| `.\iniciar.ps1 -Compilar` | Vuelve a compilar la interfaz aunque no haya cambios |

Si Windows dice que *la ejecución de scripts está deshabilitada*, la política de PowerShell de ese equipo no permite scripts locales. Quien administre el equipo puede permitirlos solo para su usuario con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Si bajaste el proyecto como ZIP, desbloquéalo una vez con `Get-ChildItem -Recurse | Unblock-File` dentro de la carpeta.

## Bot de Telegram (gratis)

1. En Telegram abre **@BotFather**, escribe `/newbot` y ponle un nombre (por ejemplo *Liiot HQ*) y un usuario que termine en `bot`.
2. Copia el token que te da. Copia `.env.example` como `.env` y pégalo: `TELEGRAM_BOT_TOKEN=…`
3. Cierra HQ y vuelve a abrir `iniciar.cmd`. En **Seguimiento** debe aparecer «Bot activo».
4. En **Seguimiento → Personas** cada quien abre su enlace y toca *Iniciar* (Telegram no deja que un bot escriba primero).
5. Agrega el bot al grupo del equipo y escribe `/vincular_grupo` ahí.

El bot funciona mientras HQ esté abierto en este PC: se mantiene conectado a Telegram por su cuenta, sin dominio ni servidor público. Solo puede haber **un** HQ encendido por token.

- **Ritual semanal:** sábados a las 6:00 p. m. (se cambia en Seguimiento). Manda el resumen al grupo, pregunta por privado a cada persona por sus tareas y le envía a Dana el resumen de CEO.
- **Avisos:** recordatorios de vencimiento, alertas de bloqueo a Dana y a quien puede desbloquear, celebraciones en el grupo.
- **Comandos:** `/hoy` `/semana` `/pendientes` `/estado` `/nueva` `/equipo` `/resumen` `/silencio` `/ayuda`. Las respuestas con botones (Hecho, En curso, Bloqueada, Nueva fecha…) actualizan HQ al instante.

## Qué hay adentro

| Sección | Para qué |
|---|---|
| Oficina | Oficina 3D: cada avatar refleja en vivo lo que hace (trabajando, bloqueado, en revisión, en reunión, fuera). Clic en el tablero, la pantalla, el calendario, la escultura o el portal. |
| Mi espacio | Lo de cada persona: foco de hoy, quién espera por ella, semana y carga. Se puede ver a cualquiera. |
| Tareas | Tablero (arrastrar entre columnas) y lista, con filtros. La ficha guarda la bitácora. |
| Lanzar | Etapas, rúbrica del piloto (bloqueantes y demás) y el veredicto: lanzar, lanzar con riesgo o no lanzar. |
| Cronograma | Etapas, tareas como barras e hitos (piloto 15-nov, respaldo 1-dic). |
| Equipo | Carga de cada uno, entregas por día y sugerencias de reparto. |
| Seguimiento | Configuración del bot, del ritual semanal y los mensajes recientes. |
| Ajustes | Avatares (pelo, piel, ropa, detalles, capacidad, horario), apariencia, «¿quién usa este navegador?» y copia de seguridad. |

## Datos

- Todo vive en `backend/data/hq.db` (SQLite). La primera vez se llena con Bleepy: 23 tareas, 5 etapas y 30 criterios tomados del vault.
- **Copia de seguridad:** Ajustes → Datos → *Descargar copia* (JSON), o copia `hq.db` con HQ cerrado.
- Para empezar de cero: cierra HQ y borra `backend/data/hq.db`; al abrir se vuelve a sembrar Bleepy.

## Red local (opcional)

`.\iniciar.ps1 -Red` permite entrar desde los portátiles de la misma red con la dirección que muestra la ventana (`http://192.168.x.x:8000`). Windows preguntará si Python puede usar la red: acepta solo para redes privadas. **HQ no tiene contraseña**: úsalo así solo en la red de la casa u oficina. Para una intranet de verdad, ver `CONTINUAR.md`.

## Desarrollo

- `.\desarrollo.ps1`: backend con recarga automática en `:8000` + interfaz con Vite en `:5173`.
- Pruebas del backend: `cd backend; .\.venv\Scripts\python.exe -m pytest -q`
- Revisión de tipos y compilación: `cd frontend; npm run build`

Stack: FastAPI · SQLModel/SQLite · python-telegram-bot 22 (en el mismo proceso) · React 19 · Vite 6 · TypeScript · TanStack Query · react-three-fiber/drei/postprocessing para la oficina · CSS propio con tokens del brandbook.

```
backend/app/
  main.py       arranque, WebSocket /ws, sirve la interfaz compilada
  api.py        rutas /api
  services.py   reglas: tareas, carga, salud, rúbrica, presencia
  bot.py        bot de Telegram (comandos, botones, recordatorios, ritual)
  models.py     tablas
  seed_data/    Bleepy inicial (desde el vault)
frontend/src/
  pages/        una por sección
  components/   ficha de tarea, avatar 2D, piezas comunes
  office/       escena 3D (sala, avatares, burbujas)
  styles/       tokens (oscuro, claro, universo Bleepy) y estilos
```

## Docker (opcional)

`docker compose up -d --build` y abre http://localhost:8000. Los datos quedan en el volumen `hq-data` y solo escucha en este PC. Aún no se ha probado con Docker encendido; el camino principal es `iniciar.cmd`.

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

## Instalar en otro computador

1. Instala, gratis: [Git](https://git-scm.com/download/win), [Python 3.12](https://www.python.org/downloads/) (marca *Add python.exe to PATH*) y [Node.js LTS](https://nodejs.org/).
2. Descarga el código en PowerShell: `git clone https://github.com/DanaSofia12/tablero_liiot.git liiot-hq`. Sin Git: en GitHub, *Code → Download ZIP*; descomprímelo y, dentro de la carpeta, corre una vez `Get-ChildItem -Recurse | Unblock-File`.
3. Si Windows no deja ejecutar scripts, corre una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
4. Doble clic en `iniciar.cmd`. La primera vez instala todo (unos minutos).
5. **Obsidian**: ese PC necesita el vault (Google Drive para escritorio, en `G:\Mi unidad\Liiot`, o la ruta que pongas en **Ajustes → Obsidian**). Al arrancar, HQ trae los proyectos y las tareas del vault sin duplicar nada.
6. **Telegram**: el token no viaja con el código; pégalo otra vez en **Seguimiento**.
7. **Un solo HQ encendido a la vez** (por el bot y por la sincronización con Obsidian). Si te mudas de PC, cierra el anterior. Para llevar también la bitácora, los avatares y los ajustes, copia `backend\data\hq.db` del PC viejo al nuevo, con los dos HQ cerrados.
8. Para actualizar a la última versión: `git pull` en la carpeta y vuelve a abrir `iniciar.cmd` (compila solo lo que cambió).

## Bot de Telegram (gratis)

1. En Telegram abre **@BotFather**, escribe `/newbot` y ponle un nombre (por ejemplo *Liiot HQ*) y un usuario que termine en `bot`.
2. Copia el token que te da (algo como `1234567890:AAH…`).
3. En HQ ve a **Seguimiento**, pégalo en «Activar el bot» y toca **Conectar**. HQ lo prueba con Telegram, lo guarda en `.env` (solo en este PC) y enciende el bot sin reiniciar.
4. En **Seguimiento → Personas** cada quien abre su enlace y toca *Iniciar* (Telegram no deja que un bot escriba primero).
5. Agrega el bot al grupo del equipo y escribe `/vincular_grupo` ahí.

El bot funciona mientras HQ esté abierto en este PC: se mantiene conectado a Telegram por su cuenta, sin dominio ni servidor público. Solo puede haber **un** HQ encendido por token.

- **Ritual semanal:** sábados a las 6:00 p. m. (se cambia en Seguimiento). Manda el resumen al grupo, pregunta por privado a cada persona por sus tareas y le envía a Dana el resumen de CEO.
- **Avisos:** recordatorios de vencimiento, alertas de bloqueo a Dana y a quien puede desbloquear, celebraciones en el grupo.
- **Se le escribe normal**, como a alguien del equipo: «¿qué tengo hoy?», «terminé la tabla de precios», «algo me frena con BLP-5 porque falta el logo», «mueve BLP-3 para el viernes», «nueva tarea: llamar a la tercera empresa el jueves», «¿cómo va el equipo?». Entiende fechas como «mañana», «el viernes», «el 5 de noviembre» o «en 3 días», y si una frase puede ser varias tareas, pregunta cuál. Funciona con reglas propias: gratis, sin IA de pago.
- **Botones:** en cada tarea («Ya la terminé», «La estoy haciendo», «Otra fecha», «Algo me frena»…) y abajo del chat (hoy, mi semana, el equipo, nueva tarea). Todo actualiza HQ al instante.
- **Comandos**, para quien los prefiera: `/hoy` `/semana` `/pendientes` `/estado` `/nueva` `/equipo` `/resumen` `/silencio` `/ayuda`.

## Obsidian (sincronización en dos vías)

HQ está conectado a la bóveda de Obsidian de Liiot (`G:\Mi unidad\Liiot`; se cambia en **Ajustes → Obsidian**):

- Cada carpeta de `10_Proyectos` con su nota de proyecto es un **proyecto** en HQ, y cada nota de `10_Proyectos/<Proyecto>/01_Gestion/Tareas/` es una **tarea**.
- Lo que crees o cambies en HQ (tarea o proyecto) aparece en Obsidian en un par de segundos, y lo que cambies en Obsidian llega a HQ en unos 15 s.
- HQ solo toca el encabezado (frontmatter) de las notas que ya existen, nunca su texto, y no borra archivos. Si borras una nota, la tarea queda archivada en HQ.
- Campos que se sincronizan: `status`, `responsable`, `categoria`, `prioridad` (critica, alta, media, baja), `vence`, `inicio`, `esfuerzo` (S, M, L), `fase`, `bloqueo`, `archivada` y `titulo`. Además, `hq` guarda la clave de HQ (por ejemplo `BLP-11`).
- Estados válidos en `status`: `por_hacer`, `en_progreso`, `en_revision`, `bloqueada`, `hecho`.
- Si una nota y su tarea cambian a la vez, gana el cambio más reciente y queda anotado en la bitácora.

## Qué hay adentro

Arriba a la izquierda eliges el **proyecto** (o creas uno nuevo). Tareas, Lanzar y Cronograma muestran ese proyecto; Mi espacio y Equipo suman todos.

| Sección | Para qué |
|---|---|
| Oficina | Oficina 3D: cada avatar refleja en vivo lo que hace (trabajando, bloqueado, en revisión, en reunión, fuera). Clic en el tablero, la pantalla, el calendario, la escultura o el portal. |
| Mi espacio | Lo de cada persona: foco de hoy, quién espera por ella, semana y carga. Se puede ver a cualquiera. |
| Tareas | Tablero y lista con filtros. El estado se cambia con el selector de cada tarjeta (o arrastrándola); «Agregar tarea» al final de cada columna crea una en segundos. La ficha guarda la bitácora y abre la nota en Obsidian. |
| Lanzar | Etapas, rúbrica del piloto (bloqueantes y demás) y el veredicto: lanzar, lanzar con riesgo o no lanzar. |
| Cronograma | Etapas, tareas como barras e hitos (piloto 15-nov, respaldo 1-dic). |
| Equipo | Carga de cada uno, entregas por día y sugerencias de reparto. |
| Seguimiento | Configuración del bot, del ritual semanal y los mensajes recientes. |
| Ajustes | Avatares (pelo, piel, ropa, detalles, capacidad, horario), apariencia, «¿quién usa este navegador?» y copia de seguridad. |

## Datos

- Todo vive en `backend/data/hq.db` (SQLite). La primera vez se llena con Bleepy (23 tareas, 5 etapas y 30 criterios) y luego trae del vault los demás proyectos y sus tareas.
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
  vault.py      sincronización en dos vías con Obsidian
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

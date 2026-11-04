# Liiot Hub

El espacio de trabajo interno de Liiot. Al entrar ves a Liiot, la empresa, con sus proyectos como carpetas (Bleepy, SST, Landing Page…). Al abrir una carpeta entras al mundo de ese proyecto, con su propio estilo: Bleepy usa su brandbook y los demás, el de Liiot. Adentro están la oficina 3D, las tareas, las fases, el cronograma, el equipo y el seguimiento por Telegram. Todo se sincroniza con la bóveda de Obsidian. Corre en este PC, no está publicado en internet y no cuesta nada.

## Abrirlo

1. **Requisitos (una sola vez):** [Python 3.12](https://www.python.org/downloads/) (al instalar, marca *Add python.exe to PATH*) y [Node.js LTS](https://nodejs.org/).
2. **Doble clic en `iniciar.cmd`.** La primera vez instala todo y compila la interfaz (unos minutos); después abre en segundos.
3. Se abre **http://localhost:8000**. Para apagarlo, cierra la ventana negra «Liiot Hub».

**La primera vez** no hay cuentas: la pantalla de bienvenida pide un código que aparece en la ventana negra («usa este código: XXXX-XXXX»). Con él, quien abre el programa crea su cuenta (correo, usuario y contraseña) y queda como administradora.

Opciones desde PowerShell:

| Comando | Qué hace |
|---|---|
| `.\iniciar.ps1` | Igual que el doble clic |
| `.\iniciar.ps1 -Puerto 8080` | Usa otro puerto |
| `.\iniciar.ps1 -Red` | Deja entrar desde otros equipos de la misma red (ver «Red local») |
| `.\iniciar.ps1 -SinNavegador` | No abre el navegador |
| `.\iniciar.ps1 -Compilar` | Vuelve a compilar la interfaz aunque no haya cambios |

Si Windows dice que *la ejecución de scripts está deshabilitada*, quien administre el equipo puede permitirlos solo para su usuario con `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. Si bajaste el proyecto como ZIP, desbloquéalo una vez con `Get-ChildItem -Recurse | Unblock-File` dentro de la carpeta.

## Cuentas

- Cada persona entra con **su correo o su usuario y su contraseña**. Las contraseñas se guardan cifradas (scrypt) y la sesión dura 30 días en ese navegador.
- **Invitar o agregar a alguien:** Ajustes › Personas y accesos. «Código de acceso» genera un código de un solo uso (vale 7 días) para que esa persona active su cuenta desde «Tengo un código de invitación». «Agregar persona» registra a alguien nuevo y crea su código.
- **Olvidé mi contraseña:** quien administra genera «Nueva contraseña» (un código que vale 24 horas). Si eres tú quien administra y no puedes entrar, en este PC abre **`recuperar-acceso.cmd`**, elige tu nombre y usa el código que te da (vale 1 hora).
- Quien administra también puede dar o quitar la administración y desactivar cuentas. Solo quien administra cambia el token de Telegram, la carpeta de Obsidian y descarga la copia completa.
- Cada persona edita su propio perfil: avatar, color, horario y días de trabajo. Fuera de su horario, la oficina la muestra descansando.

## Cómo está organizado

- **Liiot (inicio):** las carpetas de los proyectos con su fase, avance, tareas abiertas y atrasadas; quién está en la oficina, y las próximas fechas de todos los proyectos (tres semanas). «Nuevo proyecto», en la barra de las carpetas, crea uno con su primera fase y su estilo (Liiot o Bleepy).
- **Oficina de Liiot:** la misma oficina 3D con todo el equipo y las tareas de todos los proyectos (menú de Liiot › Oficina).
- **Dentro de un proyecto:**

| Sección | Para qué |
|---|---|
| Oficina | La oficina 3D y, al lado, el equipo ahora: el estado de cada quien, en qué trabaja, qué le vence hoy y tu propio estado. |
| Tareas | Tablero y lista con los estados Pendientes, En progreso, En pausa, Pruebas y Finalizadas. |
| Fases | El recorrido del proyecto por fases, con sus etapas, tareas, mínimos para avanzar y una rúbrica opcional. |
| Cronograma | Diagrama por mes (o 3 meses, todo el proyecto o un rango), filtros por fase, etapa y persona, y exportación a Excel. |
| Mi espacio | Solo lo tuyo: tus pendientes, tu calendario y tu estado. |
| Equipo | «Cómo avanzamos» (qué tan al día vamos y la gráfica semana a semana) y, por persona, el reparto de sus tareas, sus próximos 14 días, tareas por mes, fechas que se cruzan, días cargados y atrasadas. |
| Seguimiento | El bot de Telegram: chat del equipo, chat personal, repaso semanal y lo que ha dicho el bot. |
| Ajustes | Perfil y avatar, cuenta, personas y accesos, Obsidian y apariencia. |

### Tareas

- Toda tarea nueva necesita **título y descripción** («¿De qué se trata?»). La descripción es obligatoria también desde Telegram.
- **Prioridad** con nombre y color: Baja, Media, Alta y Crítica.
- **Checklist:** pasos dentro de la tarea que se marcan, se editan y se reordenan; el avance (por ejemplo 3/5) se ve en la tarjeta, en Mi espacio y en el cronograma.
- **En pausa** pide el motivo y, si aplica, a quién se espera; esa persona recibe el aviso por Telegram.
- Cada cambio de estado deja un botón «Deshacer» por unos segundos.

### Fases

- Una fase es un tramo grande del proyecto: validar la idea, construir, piloto, lanzamiento… Cada una tiene **etapas** (por ejemplo, semanas) con sus tareas, **mínimos** (lo indispensable para darla por terminada) y, si se quiere, una **rúbrica** editable (grupos de criterios que se califican como Cumple, A medias o No cumple; los marcados con candado son indispensables).
- «Validar y pasar a…» cierra la fase y abre la siguiente; queda registrado quién la validó. Si falta algo, se puede avanzar dejando una nota que lo explique. El grupo de Telegram recibe el aviso.
- Bleepy quedó con su fase «Piloto de validación» (las 5 etapas y la rúbrica de 30 criterios de antes). SST tomó sus fases de Obsidian (Preinicio, Fase 1 a Fase 4).

### La oficina

Hay cuatro estados: **Trabajando, En reunión, Disponible y Descansando**. Cada persona elige el suyo en la oficina, en Mi espacio o por Telegram. Dentro del horario, si nadie ha dicho nada, aparece Disponible; fuera del horario, Descansando (salvo que haya elegido otro estado hace menos de 3 horas). Cuando alguien finaliza una tarea, su avatar celebra.

## Bot de Telegram (gratis)

1. En Telegram abre **@BotFather**, escribe `/newbot` y ponle un nombre (por ejemplo *Liiot Hub*) y un usuario que termine en `bot`.
2. Copia el token que te da (algo como `1234567890:AAH…`).
3. En Liiot Hub, quien administra va a **Seguimiento**, lo pega y toca **Conectar**. Se prueba con Telegram, se guarda en `.env` (solo en este PC) y el bot arranca sin reiniciar.
4. Cada persona, en **Seguimiento › Tu Telegram**, toca «Conectar mi Telegram» y luego *Iniciar* (Telegram no deja que un bot escriba primero). Ese enlace es personal: solo lo ve su dueño.
5. Agrega el bot al grupo del equipo y escribe `/vincular_grupo` ahí.

Qué hace:

- **Chat del equipo:** tareas nuevas («Jean Pierre creó la tarea…»), entregas («¡Juan David finalizó…!»), lo que pasa a pruebas, cuenta regresiva a las fechas clave («Faltan 5 días para el piloto»), tareas atrasadas (de lunes a viernes), cambios de fase y el resumen semanal. Cada aviso se enciende o apaga en Seguimiento.
- **Chat personal:** cada mañana, al empezar tu horario, pregunta **«¿En qué vas a trabajar hoy?»** con botones de tus tareas y de los estados; la respuesta actualiza la oficina. También avisa lo que vence hoy o mañana y lo que venció ayer, y cuando alguien te necesita.
- **Se le escribe normal:** «¿qué tengo hoy?», «terminé la tabla de precios», «estoy en reunión», «hoy trabajo en el guion», «pausa el logo porque falta la respuesta de Saray», «la landing está lista para pruebas», «mueve la tabla para el viernes», «nueva tarea: llamar a la tercera empresa el jueves» (luego pregunta de qué se trata), «terminé por hoy». Funciona con reglas propias: gratis, sin IA de pago y sin claves raras en los mensajes.
- Comandos, para quien los prefiera: `/hoy` `/semana` `/pendientes` `/estado` `/tarea` `/nueva` `/equipo` `/resumen` `/silencio` `/ayuda`.

El bot funciona mientras Liiot Hub esté abierto en este PC y solo puede haber **un** Liiot Hub encendido por token.

## Obsidian (sincronización en dos vías)

Liiot Hub está conectado a la bóveda de Liiot (`G:\Mi unidad\Liiot`; se cambia en **Ajustes › Obsidian**):

- Cada carpeta de `10_Proyectos` con su nota de proyecto es un **proyecto**, y cada nota de `10_Proyectos/<Proyecto>/01_Gestion/Tareas/` es una **tarea**.
- Lo que crees o cambies aquí aparece en Obsidian en un par de segundos, y lo que cambies allá llega en unos 15 s.
- Solo se toca el encabezado (frontmatter) de las notas que ya existen, nunca su texto, y no se borran archivos. Si borras una nota, la tarea queda archivada.
- Campos: `status`, `responsable`, `categoria`, `prioridad` (critica, alta, media, baja), `vence`, `inicio`, `fase`, `etapa`, `bloqueo` (motivo de la pausa), `checklist`, `archivada` y `titulo`. `hq` guarda la clave interna de la tarea.
- `status` en las notas: `por_hacer` (Pendiente), `en_progreso`, `en_pausa`, `pruebas` y `hecho` (Finalizada). Pendiente y Finalizada se escriben como ya los usan las plantillas y los tableros (Bases) del vault. Los valores antiguos `bloqueada` y `en_revision` se siguen leyendo.
- `fase` usa la clave de la fase (`fase_1`, `piloto_de_validacion`…); si una nota trae una fase que no existe, se crea. `etapa` usa el nombre de la etapa.
- `checklist` es una lista: `["[x] Revisar paleta", "[ ] Elegir el logo final"]`.
- Antes de la primera sincronización con este formato se copian las notas de proyectos y tareas a `backend/data/respaldos/vault-<fecha>`.
- Si una nota y su tarea cambian a la vez, gana el cambio más reciente y queda anotado en la bitácora.

## Instalar en otro computador

1. Instala, gratis: [Git](https://git-scm.com/download/win), [Python 3.12](https://www.python.org/downloads/) (marca *Add python.exe to PATH*) y [Node.js LTS](https://nodejs.org/).
2. Descarga el código: `git clone https://github.com/DanaSofia12/tablero_liiot.git liiot-hq`. Sin Git: en GitHub, *Code › Download ZIP*; descomprímelo y, dentro de la carpeta, corre una vez `Get-ChildItem -Recurse | Unblock-File`.
3. Si Windows no deja ejecutar scripts, corre una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
4. Doble clic en `iniciar.cmd`. La primera vez instala todo (unos minutos) y pide crear la primera cuenta con el código de la ventana.
5. **Obsidian:** ese PC necesita el vault (Google Drive para escritorio, en `G:\Mi unidad\Liiot`, o la ruta que pongas en Ajustes › Obsidian). Al arrancar trae los proyectos y las tareas sin duplicar nada.
6. **Telegram:** el token no viaja con el código; pégalo otra vez en Seguimiento.
7. **Un solo Liiot Hub encendido a la vez** (por el bot y por la sincronización con Obsidian). Para mudarte con todo (cuentas, bitácora, avatares, ajustes), copia `backend\data\hq.db` del PC viejo al nuevo, con los dos cerrados.
8. Para actualizar: `git pull` en la carpeta y vuelve a abrir `iniciar.cmd` (instala y compila solo lo que cambió).

## Datos y respaldos

- Todo vive en `backend/data/hq.db` (SQLite). La primera vez se llena con Bleepy y luego trae del vault los demás proyectos.
- Cuando una versión nueva cambia la forma de guardar los datos, antes de tocarlos se guarda una copia en `backend/data/respaldos/` (por ejemplo `hq-20261103-…-antes-de-v2.db`).
- **Copia completa:** Ajustes › Copia de seguridad (JSON, quien administra), o copia `hq.db` con Liiot Hub cerrado.

## Red local (opcional)

`.\iniciar.ps1 -Red` permite entrar desde los portátiles de la misma red con la dirección que muestra la ventana (`http://192.168.x.x:8000`). Windows preguntará si Python puede usar la red: acepta solo para redes privadas. Cada persona entra con su cuenta; aun así, úsalo solo en la red de la casa u oficina. Para una intranet de verdad, ver `CONTINUAR.md`.

## Desarrollo

- `.\desarrollo.ps1`: servidor con recarga automática en `:8000` + interfaz con Vite en `:5173`.
- Para revisar la interfaz contra una copia de prueba en otro puerto: `$env:HQ_BACKEND = '127.0.0.1:8010'` antes de `npm run dev` (Vite reenvía la API y el canal en vivo a ese servidor).
- Pruebas del servidor: `cd backend; .\.venv\Scripts\python.exe -m pytest -q`
- Revisión de tipos y compilación: `cd frontend; npm run build`

Stack: FastAPI · SQLModel/SQLite · python-telegram-bot 22 (en el mismo proceso) · openpyxl (Excel) · React 19 · Vite 6 · TypeScript · TanStack Query · react-three-fiber/drei/postprocessing para la oficina · CSS propio con tokens de los brandbooks de Liiot y Bleepy.

```
backend/app/
  main.py        arranque, actualización de datos, WebSocket /ws, sirve la interfaz compilada
  auth.py        contraseñas, sesiones, códigos de un solo uso · api_auth.py  rutas de cuentas
  api.py         rutas /api (todas con sesión)
  services.py    tareas, checklist, rúbrica, presencia, proyectos
  phases.py      fases, mínimos, etapas y rúbrica por fase
  analytics.py   análisis del equipo · export_xlsx.py  cronograma en Excel
  bot.py + chat.py   bot de Telegram y lo que entiende de los mensajes
  vault.py       sincronización en dos vías con Obsidian
  migrate.py     pone al día los datos (con copia previa) · recovery.py  recuperar el acceso
frontend/src/
  pages/         una por sección (HomePage, LoginPage, OfficePage, TasksPage, PhasesPage…)
  components/    Shell, TaskDrawer, TaskForm, Avatar (2D), Brand (logos), WorldTransition
  office/        escena 3D (sala, avatares, burbujas)
  styles/        tokens (Liiot y Bleepy, claro y oscuro), app.css y pages.css
```

## Docker (opcional)

`docker compose up -d --build` y abre http://localhost:8000. Los datos quedan en el volumen `hq-data` y solo escucha en este PC. Aún no se ha probado con Docker encendido; el camino principal es `iniciar.cmd`.

# Continuar Liiot Hub

Documento para retomar el trabajo en otra sesión sin perder nada. Estado al **3 de noviembre de 2026**. Antes se llamaba Liiot HQ (la carpeta, las variables `HQ_*` y las preferencias `hq.*` conservan ese nombre).

- Código: `C:\Users\dana\dev\liiot-hq` (a propósito fuera de Google Drive: `node_modules` no debe sincronizarse).
- Cómo abrirlo, cuentas, bot y Obsidian: `README.md`.
- Repositorio: https://github.com/DanaSofia12/tablero_liiot (público, ver §2).

## 1. El encargo

Dana (CEO de Liiot) pidió un espacio de trabajo interno para el equipo de tres:

| Persona | Rol |
|---|---|
| Dana | CEO |
| Juan David | CCO: ventas, modelo de negocio, ideas |
| Jean Pierre | CTO: arquitectura y desarrollo |

Rondas anteriores (oct-2026): tareas con responsable, fechas, prioridad, estado y tipo; mundos por proyecto con rúbricas; oficina 3D isométrica con avatares chibi de los tres; bot de Telegram en dos vías; estética «aurora» del brandbook de Liiot; todo local y gratis; sincronización en dos vías con Obsidian; varios proyectos; código en GitHub.

**Cuarta ronda (3-nov, manda sobre las anteriores):**

- Nombre más bonito que HQ → **Liiot Hub**.
- **Ingreso independiente y seguro**: correo, usuario y contraseña por persona, y la posibilidad de registrar personas nuevas.
- Al entrar, **Liiot la empresa** con los proyectos como **carpetas**; abrir una es «entrar a un mundo» con animación. Bleepy usa su brandbook (`C:\Users\dana\Downloads\Brandbook_bleepy.pdf`); los demás, el de Liiot. Lo demás igual.
- **Oficina**: quitar «Necesita atención» y las tarjetas de abajo; solo ver en qué está cada quien. Estados únicos: **Trabajando, En reunión, Disponible, Descansando**. El bot pregunta cada día «¿en qué trabajas hoy?» y su respuesta actualiza la oficina; fuera del horario del perfil, Descansando.
- **Mi espacio**: calendario propio y tareas de hoy; quitar «Todas mis tareas», «El equipo», nivel/XP, «Esperan por ti» y «Tarea para Dana»; «Mi foco hoy» → «Mis pendientes»; casillas más bonitas; solo lo propio.
- **Sin textos de ayuda bajo los títulos** en ninguna vista. Estados de tarea: **Pendientes, En progreso, En pausa, Pruebas, Finalizadas**.
- **Prioridades** con nombre y color (Baja, Media, Alta, Crítica); **descripción obligatoria**; quitar **esfuerzo**.
- **Checklist** (subtareas) con avance dentro de cada tarea.
- «Lanzamiento» → **Fases** del proyecto (validación, piloto, lanzamiento…), cada una con etapas, tareas, mínimos para pasar y rúbrica opcional y editable; validar y avanzar ordenadamente.
- **Cronograma**: exportar a Excel, filtrar por fechas, fases o etapas, por mes por defecto; sin «fase según Obsidian» ni códigos de rúbrica; Obsidian debe mostrar lo mismo que el sistema.
- **Equipo**: sin carga en puntos ni porcentajes; análisis claro (asignaciones por mes, fechas que se cruzan, días cargados, atrasadas, hechas, pendientes) y una gráfica de avance; quitar «Qué vence cada día» e «Ideas para repartir».
- **Seguimiento**: tarjetas ordenadas; bot de grupo con avisos generales (cuenta regresiva, atrasadas, tareas nuevas, entregas) y bot personal («¿qué haces hoy?», tareas por vencer), en lenguaje humano, sin abreviaturas ni claves, con respuestas por botones.
- Diseño sin espacios sobrantes; **avatares 3D más bonitos y animados** (Dana se veía «medio calva» de los lados).

**Quinta ronda (3-nov, tarde; con capturas y dos imágenes de referencia):**

- **Tarjetas simétricas y alineadas**, sin espacios innecesarios; «visualmente atractivo pero sin ruido visual y tampoco básico».
- **Carpetas del inicio** al estilo de un escritorio de archivos (carpetas con pestaña, hojas que se asoman y ventanas de computador viejo), con los **colores de Liiot**.
- **La oficina también en Liiot general**, y la oficina **con los estados del equipo al lado**, como antes.
- **Bleepy menos oscuro**: azul cobalto con naranja y crema, grano y tarjetas tipo widget (referencia: una pantalla de iPad con widgets azules y naranja).
- **Equipo** sin tarjetas generales vacías arriba: más diseño, más dinámico.
- **Rúbrica**: los grupos (el acordeón) cerrados por defecto.
- Pregunta: «si actualizo el sistema, ¿me actualiza el Obsidian?» → sí (ver README §Obsidian).

**Sexta ronda (3-nov, noche; con dos imágenes de degradados con grano):** Bleepy «que tampoco sea tan llamativo»: dejar el azul oscuro de fondo, con la estética de Liiot, que solo resalten ciertas cosas, en oscuro y en claro, sin el azul súper potente.

## 2. Reglas que no se negocian

1. Local y gratis: nada de servicios con costo ni IA de pago. No desplegar sin que Dana lo pida (las opciones están en §5).
2. Proyectos: los de `10_Proyectos` del vault más los que se creen en Liiot Hub. Para Bleepy se dice **piloto** (15-nov, respaldo 1-dic).
3. Solo los tres fundadores tienen cuenta hoy. Las personas externas (por ejemplo Saray) no entran salvo que Dana las registre.
4. El token de Telegram vive solo en `.env` (ignorado por git) y nunca sale por la API. El enlace personal de Telegram de cada persona solo lo ve su dueño o quien administra.
5. Commit y push solo cuando Dana lo pida. El repositorio es **público** por decisión de Dana (27-oct). Nunca subir `.env` ni `backend/data/` (base, respaldos).
6. El vault solo lo toca la sincronización: frontmatter de las notas de `10_Proyectos/*/01_Gestion/Tareas` y de las notas de proyecto, más las notas y carpetas nuevas que se creen desde Liiot Hub. Nunca el cuerpo de una nota existente, nunca borrar archivos y nunca los `.base`.
7. Probar siempre sobre copias (`HQ_DB_PATH` y `HQ_VAULT_PATH` apuntando a copias, `TELEGRAM_BOT_TOKEN=" "` para no encender el bot). En las pruebas automáticas, `HQ_VAULT_PATH=off`.
8. No iniciar sesión en sitios externos ni escribir contraseñas reales. Las cuentas de prueba solo en bases de prueba.
9. Responder en español y con lenguaje neutro al hablar de las personas.

## 3. Qué ya funciona (verificado el 3-nov)

Pruebas del servidor 10/10, TypeScript estricto y compilación sin errores, ensayo de la actualización sobre copias de la base y del vault, y recorrido en el navegador (copias, puerto 8010, sin bot) de inicio, transición, oficina, tareas, ficha con checklist, fases y rúbrica, Mi espacio, cronograma, equipo, seguimiento, ajustes y modo claro de Bleepy. La quinta ronda (solo interfaz, sin cambios en el servidor) se revisó con copias en Liiot y Bleepy, oscuro y claro, a 1880, 1600 y 1280 px.

- **Cuentas** (`auth.py`, `api_auth.py`): scrypt con sal; sesión en cookie HttpOnly (token aleatorio; en la base solo su SHA-256), 30 días renovables; límite de intentos (8 en 15 min por IP y por usuario); todo `/api` exige sesión salvo `/api/health` y `/api/auth/*`; el WebSocket también; los cambios (POST/PATCH/DELETE) exigen el encabezado `X-Liiot: 1` que pone la interfaz. Primera cuenta con el código que imprime la ventana; invitaciones y recuperación con códigos de un solo uso (8 caracteres sin letras confusas, se guarda su huella); `recuperar-acceso.cmd` para quien administra.
- **Mundos**: rutas `/` (Liiot), `/yo`, `/equipo`, `/seguimiento`, `/ajustes` y `/p/<proyecto>/…` (oficina, tareas, fases, cronograma y las mismas secciones compartidas). `Project.theme` = `bleepy` o `liiot`; `world.tsx` pone `data-uni` en `<html>`. Transición de carpeta (`WorldTransition.tsx`): la carpeta crece desde su rectángulo hasta llenar la pantalla con el cielo de la marca, logo y nombre; se omite con «Menos movimiento».
- **Estilo Bleepy** desde el brandbook: naranja `#F36F2B`, azul `#3061AD`/`#658DB9`, crema `#E2E5B2`, noche `#231F20`; Groka → Unbounded en mayúsculas, Times New Roman en subtítulos, Figtree para el texto; logo vectorial extraído del PDF (`components/brandPaths.ts`, `public/brands/bleepy.svg`). Desde la sexta ronda tiene **la estética de Liiot con colores de Bleepy**: en oscuro, fondo azul noche (`#0f1a3d`) con vidrio, grano y remolinos «gradient map» (amarillo → naranja → rojo → azul) en las esquinas; en claro, papel crema (`#efe9cf`) con los mismos remolinos. Solo resalta lo importante: botones y avances con el degradado, números de las cabeceras, halo naranja y azul en los títulos, y una estrella de Bleepy difuminada en «gradient map» en los encabezados de Mi espacio y Fases (`ThermalStar` en `Brand.tsx`). Sobre naranja el texto va en azul noche (`--on-acc`). La oficina 3D de Bleepy es de noche en azul (luces cálidas, sillas y sofá naranja) y crema en claro.
- **Diseño (quinta ronda)**: inicio con ventanas de computador viejo («En la oficina», «Mis proyectos», «Próximas fechas»), carpetas pastel con pestaña y hojas que se asoman (colores de Liiot; Bleepy en celeste con su cometa), boletos de fechas de las próximas tres semanas; **oficina de Liiot** en `/oficina` y, en todas las oficinas, el panel «El equipo ahora» al lado (estado, en qué trabaja, qué le vence hoy, tu estado); **Equipo** con anillo «al día» + gráfica en una sola tarjeta y, por persona, banda de color, avatar, reparto de tareas, próximos 14 días (clic en un día muestra sus tareas; línea amarilla = fechas que se cruzan), tareas por mes y alertas; tarjetas de igual altura en Mi espacio (con «Lo que viene»), Seguimiento (conexión en una franja, tres columnas, ejemplos del bot abajo), Fases (el botón de avanzar queda abajo) y Ajustes; la rúbrica abre con los grupos cerrados (cada uno muestra candados pendientes y avance).
- **Estados y prioridades**: claves `pendiente`, `en_progreso`, `en_pausa`, `pruebas`, `finalizada` (los nombres viejos se aceptan y se migraron); prioridades P0–P3 por dentro, con nombre y color por fuera.
- **Checklist**: `Task.checklist_json` (id, texto, hecho); el avance es parte del API (`progress`), del Excel y del frontmatter.
- **Fases** (`phases.py`): `Phase` (clave para Obsidian, objetivo, fechas, estado, rúbrica sí/no, umbral, validación) y `PhaseCheck` (mínimos). Etapas, criterios y revisiones cuelgan de la fase. Avanzar exige los mínimos y los indispensables de la rúbrica, o una nota para forzar. La migración creó «Piloto de validación» para Bleepy y Preinicio + Fase 1-4 para SST.
- **Presencia**: `Member.presence_state/note/task_id/at` y `work_days`; regla en `services.presence_of` (§4).
- **Bot**: pregunta diaria (revisión cada 5 min, al empezar el horario de cada quien, una vez al día y no si ya contó su estado); avisos de grupo configurables (`groupNewTasks`, `groupCelebrations`, `groupTesting`, `groupCountdown` a 30/21/14/10/7/5/3/2/1/0 días, `groupOverdue` L-V, `groupPhases`, `groupBlockers`, `groupWeeklySummary`, hora `groupTime`); crear una tarea pide la descripción; entiende «estoy en reunión», «hoy trabajo en…», «terminé por hoy», «ya estoy libre», «pausa…», «lista para pruebas». Los mensajes no muestran claves. Todo lo que envía queda en Seguimiento (chat del equipo o personal). **No se ha probado contra Telegram real en esta ronda.**
- **Obsidian**: mapeo nuevo en `vault.py` (§4 del README); campos nuevos se completan sin pisar (fusión con «campo nuevo» cuando no está en la base); respaldo único de las notas antes del primer cambio (`Setting vault_backup_v2`).
- **Ensayo con copias reales (3-nov)**: 25 notas de Bleepy reciben `fase` y `etapa` (solo encabezado); 0 cuerpos cambiados, 0 notas nuevas, segunda pasada sin cambios; SST conserva sus `fase_*`.
- **Excel** (`export_xlsx.py`): hojas Cronograma (tabla con filtros), Diagrama (barras por días o por semanas si son más de 92 días, hitos y hoy) y Resumen (por persona y por fase).
- **Equipo** (`analytics.py`): por persona, pendientes/en progreso/en pausa/pruebas/atrasadas/finalizadas del mes, tareas por mes (6 meses), cruces de fechas (≥ 3 abiertas a la vez en los próximos 45 días), días con ≥ 3 entregas, atrasadas y puntualidad (solo tareas finalizadas dentro de la app). Gráfica «Cómo avanzamos» (debían estar listas vs finalizadas, acumulado por semana) con colores validados para daltonismo y contraste.

## 4. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Nombre | Liiot Hub | Dana pidió algo más bonito que HQ; «Hub» = el centro de la empresa. Se cambia en `catalog.APP_NAME` y `api.APP_NAME` |
| Cuentas | Propias (scrypt + cookie), sin servicios externos | Local y gratis; listas para una intranet |
| Primera cuenta | Código impreso en la ventana del programa | Solo quien abre Liiot Hub en ese PC puede crearla |
| Registro | Por invitación (código) desde Personas y accesos | «Registrar personas nuevas» sin dejar el registro abierto |
| Estados en Obsidian | Pendiente = `por_hacer` y Finalizada = `hecho` (como la plantilla `Entity_Tarea` y los `.base`); `en_pausa` y `pruebas` nuevos | No romper los tableros de Obsidian, que el agente no puede editar |
| Fase y etapa en Obsidian | `fase` = clave de la fase (`fase_1`, `piloto_de_validacion`), `etapa` = nombre | SST ya usaba `fase_*` y su Base agrupa por eso |
| Presencia | Dentro del horario: lo elegido hoy, si no Disponible. Fuera: Descansando, salvo un estado elegido hace < 3 h | Lo pidió Dana; lo de las 3 h cubre quedarse trabajando un rato |
| Carga | Sin puntos ni porcentajes: conteos y fechas | Dana dijo que no se entendía |
| Gráficas | Emphasis (finalizadas en el acento, planeado en gris); validadas con el validador de la guía de visualización | Una sola idea por gráfica, legible para daltonismo |
| Fuentes Bleepy | Unbounded + Times New Roman + Figtree | Groka y Creato Display no son libres; se eligió lo más parecido sin descargar fuentes |
| Avatares | Chibis procedurales; cabello en capas (casquete, manto con ventana para la cara, sienes, flequillo y pelo largo) | Arregla las sienes sin pelo; sin archivos externos |
| Bleepy | Oscuro = azul noche (como la estética de Liiot), claro = papel crema; el color fuerte solo en acentos «gradient map» | 1.ª versión casi negra («muy oscuro»); 2.ª cobalto vivo («tan llamativo», «azul súper potente»); la 3.ª sigue sus referencias de degradados con grano |
| Carpetas | Pastel a partir del color de cada proyecto (lila, rosa, durazno), contorno del mismo tono y texto oscuro | Referencia de carpetas tipo archivo; «que combinen con Liiot» |
| Igual altura | En una fila, la tarjeta que no debe agrandarla lleva `height: 0; min-height: 100%` y se desplaza por dentro; en las demás, `align-items: stretch` | Tarjetas simétricas sin cortar contenido |
| «Nuevo proyecto» | Botón en la barra de la ventana de carpetas (no una carpeta más) | Así las carpetas nunca quedan huérfanas en otra fila |
| Oficina de Liiot | `/oficina` con todos los proyectos; lo que se toca lleva a Mi espacio, Equipo o Proyectos (`RoomData.links`) | Dana pidió verla también en Liiot general |

## 5. Pendiente, en orden sugerido

1. **Cuentas del equipo**: Dana ya entra con la suya (3-nov). Falta, si no lo hizo, generar los códigos de Juan David y Jean Pierre (Ajustes › Personas y accesos) y que revisen la quinta ronda en su pantalla.
2. **Probar el bot con el token real**: pregunta diaria, botones de estado, avisos de grupo (Seguimiento › «Enviar los de hoy»), crear tarea con descripción.
3. **Tableros de Obsidian**: los `.base` de SST y Bleepy agrupan por `por_hacer`, `en_progreso`, `hecho` (y `bloqueada`): si quieren ver `en_pausa` y `pruebas` en su orden, agregar esos valores a `groupOrder` (lo edita una persona; el agente no toca `.base`). Igual para la tabla de REGLAS de `_MCP_Rules` si quieren documentar el `status` de tareas.
4. **Oficina más liviana** en el portátil (i5-7200U): `frameloop="demand"`, `dpr` 1, sin MSAA, sombras de 1024; mejorar `route()` (la ruta del café al sofá cruza la mesa).
5. **Cronograma**: arrastrar barras para cambiar fechas; dependencias.
6. **Confirmar los avatares** con cada persona (Ajustes › Mi perfil).
7. **Salir de lo local** cuando Dana lo pida: ahora que hay cuentas, Cloudflare Tunnel + Access o Tailscale siguen siendo las opciones gratuitas (ver tabla abajo); con cuentas propias ya se podría usar un túnel sin capa extra, pero se recomienda mantenerla.
8. Docker sin probar; avatares VRM opcionales.

| Opción | Costo | Qué implica |
|---|---|---|
| Tailscale + `tailscale serve` | Gratis (Personal, hasta 6 usuarios, uso no comercial) | Red privada con HTTPS; el PC de Dana encendido |
| Cloudflare Tunnel + Access | Gratis hasta 50 usuarios; dominio en Cloudflare (Liiot ya tiene uno) | `hub.<dominio>` con acceso por correo; el PC encendido |
| VM gratis 24/7 (Oracle Always Free) + Docker | Gratis; pide tarjeta | Funciona con el PC apagado; una tarde de configuración |

## 6. Mapa del código y trampas conocidas

```
backend/app/
  main.py        arranque: init_db → seed → migrate.upgrade → código de primera cuenta → bot → sincronización
  auth.py        contraseñas, sesiones, códigos, dependencias current_member/require_admin
  api_auth.py    /api/auth/* (state, setup, login, logout, code, code/use, password, account) y /api/accounts
  api.py         /api/* con sesión: proyectos, fases, mínimos, etapas, rúbrica, tareas, presencia, equipo, Excel, Telegram, vault
  services.py    tareas, checklist, rúbrica por fase, presencia, proyectos · phases.py · analytics.py · export_xlsx.py
  bot.py         Telegram (avisos de grupo y personales, pregunta diaria) · chat.py  intenciones por reglas
  vault.py       Obsidian (Ctx traduce fase/etapa; checklist como lista) · migrate.py  versión 2 con copia previa
  recovery.py    código de recuperación desde el PC (recuperar-acceso.cmd)
backend/tests/test_api.py           cuentas, tareas, fases, proyectos, análisis + Excel, presencia, Obsidian, bot
frontend/src/
  App.tsx        entrada (LoginPage) o espacio de trabajo con rutas · world.tsx  mundo actual y tema
  pages/         HomePage (ventanas, carpetas, boletos), LoginPage, OfficePage (de Liiot y de cada proyecto, con el panel del equipo),
                 TasksPage (?persona=), PhasesPage, TimelinePage, MePage, TeamPage (anillo, franja de 14 días), FollowupPage, SettingsPage
  components/    Shell, Brand (+ brandPaths), WorldTransition, TaskDrawer (checklist), TaskForm, ProjectDialog, Avatar, bits (StatePicker…)
  office/        Office3D, Room (RoomData.links), Avatar3D, layout (lugares de los 4 estados), palette (Liiot y Bleepy)
  styles/        tokens.css · app.css (base y componentes) · pages.css (páginas)
frontend/vite.config.ts   HQ_BACKEND=127.0.0.1:8010 apunta el servidor de desarrollo a una copia de prueba
```

- SQLModel 0.0.48 exige fechas con zona: usar `services.utcnow()` y `services.aware()` al comparar.
- Columnas nuevas: `db._add_missing_columns()`; datos que cambian de forma: `migrate.py` (sube `Setting schema.version` y hace copia antes).
- La interfaz manda `X-Liiot: 1` en todo; un `fetch` sin él recibe 403 en los cambios.
- Las burbujas de la oficina usan una capa DOM propia (`office/anchors.ts`). Si el panel del navegador está oculto, la animación corre lenta y las burbujas tardan en acomodarse: no es un error.
- `<Float>` de drei rota alrededor de su origen: envolverlo en un `<group position>`.
- Cambios del frontend: basta con compilar. Cambios del backend: reiniciar Liiot Hub.
- En Windows, `localhost` prueba IPv6 primero (3 s): los chequeos usan `127.0.0.1`.
- `iniciar.ps1` va en UTF-8 con BOM y CRLF (PowerShell 5.1).
- Un Liiot Hub lanzado desde Claude Code muere al cerrar esa sesión; para dejarlo abierto, `iniciar.cmd` en su propia ventana.
- Al probar con una copia: `$env:TELEGRAM_BOT_TOKEN = ' '` (un espacio). Vacío lo borra y entonces se lee el token real de `.env`.
- Para diseñar rápido: servidor de prueba en 8010 (`scratchpad/test/run-test.ps1` de la sesión, o el mismo comando con `HQ_DB_PATH`/`HQ_VAULT_PATH` a copias) y Vite con `HQ_BACKEND=127.0.0.1:8010` en otro puerto; `npm run build` solo al final, porque el Liiot Hub real sirve `frontend/dist`.
- `.key` es la muestra de color de las leyendas (ancho 14 px): no la uses como nombre de otra clase.
- Con el panel del navegador oculto, una captura después de desplazarse sale vieja y la escena 3D no se pinta: navega de nuevo antes de capturar.
- `PowerShell 5.1` rompe las comillas dobles dentro de argumentos para programas: los parches con marcas van en un script de Python.

Cómo verificar antes de entregar:

```powershell
cd C:\Users\dana\dev\liiot-hq\backend; .\.venv\Scripts\python.exe -m pytest -q
cd C:\Users\dana\dev\liiot-hq\frontend; npm run build
```

## 7. Prompt para la próxima sesión

```text
Continúa Liiot Hub (antes Liiot HQ), mi herramienta interna. El código está en C:\Users\dana\dev\liiot-hq.
Antes de cambiar nada, lee completos CONTINUAR.md y README.md: ahí están el encargo, las reglas, las decisiones y el estado.

Reglas: todo local y gratis; el vault solo lo toca la sincronización (solo encabezados, nunca cuerpos ni .base);
prueba siempre con copias de hq.db y del vault y sin bot; el token de Telegram solo en .env;
no hagas commit ni push si no te lo pido; respóndeme en español.

Hoy quiero avanzar en: <elige de la sección 5 de CONTINUAR.md>.

Al terminar: corre las pruebas del backend y npm run build, revisa la app en el navegador con copias,
actualiza CONTINUAR.md y dime qué quedó listo y qué no.
```

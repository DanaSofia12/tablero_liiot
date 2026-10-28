# Continuar Liiot HQ

Documento para retomar el trabajo en otra sesión sin perder nada de lo planteado. Estado al **27 de octubre de 2026**.

- Plano original (arquitectura de información, bocetos, stack, fases y preguntas): https://claude.ai/artifact/AU38zGzv8MZrwCziqZyGSi
- Código: `C:\Users\dana\dev\liiot-hq` (a propósito fuera de Google Drive: `node_modules` no debe sincronizarse).
- Cómo abrirlo y configurar el bot: `README.md`.

## 1. El encargo

Dana (CEO de Liiot) pidió un espacio de trabajo interno y gamificado, **Liiot HQ**, para el equipo de tres:

| Persona | Rol |
|---|---|
| Dana | CEO |
| Juan David | CCO: ventas, modelo de negocio, ideas |
| Jean Pierre | CTO: arquitectura y desarrollo |

Requisitos de la primera ronda:

- Tareas con fechas, responsable, resumen, prioridad, estado y tipo (marketing, desarrollo, negocio, etc.).
- «Mundos» por proyecto con rúbricas de lanzamiento configurables (checks, etapas, decisión de lanzar o no).
- Panel de carga: quién lleva más, cuántas tiene, qué hace y qué le falta. Vista personal por persona que igual puede ver todo.
- Bot de Telegram en dos vías: seguimiento proactivo de vencimientos y bloqueos; las respuestas actualizan la base; avisos periódicos y de bloqueos a Dana como CEO.
- Tema por proyecto (Bleepy = «universo creativo»).
- Oficina 3D isométrica (como el video «Equipo de agentes de IA que trabaja para mi negocio») con avatares personalizables de los tres fundadores. **No estilo Lego**: estilo chibi anime/pixel como la segunda referencia, con sus rasgos reales, y que reaccionen en tiempo real al estado de sus tareas.
- Colores y logo del brandbook de Liiot; modo claro u oscuro con la estética de las referencias.

Directivas de la segunda ronda (mandan sobre el plano):

- Diseño **menos plano**, con la estética de la imagen 3 (póster de cromo líquido morado-naranja con grano) y el tablero de Pinterest `pin.it/434TJ6atR` (co.pinterest.com/Dino_Sofia/liiot): fondos oscuros, cintas de luz violeta → magenta → naranja → ámbar, grano, cromo líquido, números con contorno brillante.
- **Solo las tareas de Bleepy.** Ningún otro proyecto por ahora.
- **Las personas externas no entran** (por ejemplo Saray): ni usuarios, ni avatares, ni bot.
- Telegram: **un grupo del equipo y chats privados**. Ritual semanal **todos los sábados a las 6:00 p. m., configurable**.
- **Sin despliegue: todo local.** Más adelante quizá una intranet.
- **No gastar dinero.**
- Construir de una vez la mayor parte; lo que falte, dejarlo listo para otra sesión (este documento).
- **No es un proyecto del vault**: es una herramienta de Dana. No registrarlo en `10_Proyectos` ni escribir ADR.
- Dana compartió fotos de los tres para los avatares.

Tercera ronda (27-oct, manda sobre las anteriores):

- Cambiar el estado de las tareas tiene que funcionar siempre (antes fallaba en silencio cuando HQ estaba apagado).
- **Conectado a Obsidian en las dos direcciones**: lo que se crea o cambia en HQ aparece en el vault y viceversa.
- **Varios proyectos**: poder crear proyectos distintos a Bleepy y ponerles tareas. Con la sincronización, SST y Landing Page del vault también aparecen.
- Mejor experiencia: que se entienda cómo crear tareas y cambiar su estado.
- Explicar paso a paso cómo activar Telegram.
- Subir el código a GitHub (Dana creó `DanaSofia12/tablero_liiot`).

## 2. Reglas que no se negocian

1. Local y gratis: nada de Railway, dominios, IA de pago ni servicios con costo (las opciones para salir de lo local están en §5).
2. Proyectos: los de `10_Proyectos` del vault más los que se creen en HQ. Para Bleepy se dice **piloto**, no «demo» ni «beta» (piloto 15-nov, respaldo 1-dic).
3. Solo los tres fundadores.
4. El token de Telegram vive solo en `.env` (ignorado por git) y nunca sale por la API.
5. Commit y push solo cuando Dana lo pida. El código va a GitHub solo si el repositorio es **privado**: tiene nombres del equipo y datos internos de Bleepy.
6. El vault solo lo toca la sincronización de HQ, y así: frontmatter de las notas de `10_Proyectos/*/01_Gestion/Tareas` y de las notas de proyecto, más las notas y carpetas nuevas que se creen desde HQ. Nunca el cuerpo de una nota existente y nunca borrar archivos.
7. No iniciar sesión en Pinterest ni en otros sitios.

## 3. Qué ya funciona

Verificado el 27-oct: pruebas del backend (5/5, una de ellas sincroniza con una bóveda temporal), compilación con TypeScript estricto y revisión en el navegador con copias de la base y del vault.

- **Sincronización con Obsidian** (`backend/app/vault.py`): revisa el vault cada 15 s y, tras cada cambio en HQ, en 1 a 2 s. Hace una fusión en tres vías por campo, guardando en `VaultLink.base_json` lo último sincronizado de cada lado; gana el lado que cambió y, si cambiaron ambos, el más reciente. Los campos están en el README. Reconoce a las personas por cómo aparecen en el vault («Jean Pierre Ortiz Murcia», «David Ocaño», «Dana»); «El grupo» o personas externas quedan a cargo del líder del proyecto en HQ, sin reescribir la nota. Si falta una nota dos revisiones seguidas, archiva la tarea, salvo que falten muchas a la vez: ahí no archiva nada, por si Google Drive está sincronizando. Ensayo sobre copias: la primera pasada importó SST (49) y Landing Page, creó 9 notas de Bleepy y completó campos en 14; la segunda pasada no cambió nada.
- **Varios proyectos**: selector arriba a la izquierda y «Nuevo proyecto» (prefijo de claves, líder, fecha, color y rúbrica básica opcional). Un proyecto nuevo crea su carpeta en `10_Proyectos` con la plantilla del vault. Tareas, Lanzar y Cronograma son del proyecto elegido; Mi espacio, Equipo y el bot suman todos los proyectos. El resumen semanal del grupo manda un mensaje por proyecto con tareas abiertas.
- **Tareas más claras**: selector de estado en cada tarjeta y en la lista, «Agregar tarea» al final de cada columna, guía de 4 pasos (se puede ocultar), estado vacío para proyectos nuevos, formulario con «¿Qué hay que hacer? / ¿Quién? / ¿Para cuándo?» y atajos de fecha, tablero que cabe en pantallas medianas, aviso rojo si HQ se desconecta y mensaje claro si un cambio no se guarda.
- **Telegram desde la app**: en Seguimiento se pega el token de BotFather y HQ lo valida, lo guarda en `.env` y reinicia el bot sin cerrar HQ. También se puede desconectar.

- **Backend** (FastAPI + SQLModel + SQLite en modo WAL): API completa en `/api`, WebSocket `/ws` para tiempo real y la interfaz compilada servida por el mismo proceso. `index.html` va con `no-cache` y `assets/` con caché larga.
- **Datos sembrados desde el vault**: 23 tareas (14 del vault `TSK-20261013-01..14` con sus estados y dueños reales, más 9 del cronograma), 5 etapas (15-19 oct, 20-26 oct, 27 oct-2 nov, 3-9 nov, piloto 10-15 nov), rúbrica de 8 categorías y 30 criterios (18 bloqueantes). La tarea de logo que tenía Saray quedó a cargo de Jean Pierre.
- **Páginas**: Oficina 3D, Mi espacio (`?persona=`), Tareas (tablero con arrastrar y soltar, lista, filtros, ficha con bitácora), Lanzar (etapas editables, rúbrica, veredicto y revisiones), Cronograma (gantt con hitos), Equipo (carga, entregas por día, sugerencias de reparto), Seguimiento (configuración del bot y del ritual, enlaces de vinculación, mensajes recientes) y Ajustes (editor de avatar, apariencia, «¿quién usa este navegador?», exportar JSON).
- **Diseño «aurora»**: tokens para oscuro, claro y universo Bleepy; cintas de luz difuminadas, grano SVG, orbe cromado, bordes en degradado y números con contorno.
- **Oficina 3D** (react-three-fiber): cámara isométrica ortográfica, sala con escritorios, tablero, pantalla, calendario, ventana, letrero, portal (cambia de universo), café, mesa de reuniones, sofá, estantería, escultura cromada (cohete en el universo Bleepy) y cintas de neón. Postprocesado con bloom, grano, viñeta y modo pixel. Avatares chibi procedurales con material toon, que caminan por rutas y cambian de pose según su estado. Burbujas HTML sobre cada cabeza (capa propia, ver §6) y ayuda al pasar el mouse por cada objeto.
- **Presencia**: manual (reunión, foco, disponible, fuera) > fuera de horario > bloqueado > celebrando (tarea hecha hace menos de 10 min) > trabajando > revisión > disponible.
- **Bot de Telegram** (python-telegram-bot 22, long polling en el mismo proceso):
  - Vinculación con `/start <código>` (enlace profundo) y `/vincular_grupo` en el grupo. Solo responde a cuentas vinculadas.
  - Comandos: `/hoy`, `/semana`, `/pendientes`, `/estado`, `/nueva`, `/equipo`, `/resumen`, `/silencio` y `/ayuda`.
  - Botones en cada tarea: va bien, hecha, en curso, bloqueada (pregunta el motivo y a quién se espera), nueva fecha y comentar. Todo actualiza HQ al instante.
  - Avisos: bloqueo a Dana y a quien puede desbloquear, desbloqueo, celebraciones en el grupo, reprogramaciones y reasignaciones.
  - Recordatorio diario de vencimientos a las 9:00 (configurable): lo que vence hoy o mañana y lo que venció ayer; máximo 3 por persona, sin repetir en el día y respetando `/silencio`.
  - Ritual semanal (sábado 18:00): resumen al grupo, preguntas por privado de las tareas principales de cada persona y resumen de CEO a Dana. Se puede correr a mano desde Seguimiento.
  - **Nunca se probó contra Telegram real: falta el token.**
- **Arranque**: `iniciar.cmd` / `iniciar.ps1` (crea el entorno, instala, compila solo si hay cambios, abre el navegador; opciones `-Puerto`, `-Red`, `-SinNavegador`, `-Compilar`) y `desarrollo.ps1` (recarga automática en :8000 y Vite en :5173). Los `.ps1` van en UTF-8 con BOM para que Windows PowerShell 5.1 lea bien las tildes.
- **Docker**: `Dockerfile` en dos etapas y `docker-compose.yml` (solo 127.0.0.1, volumen `hq-data`, `.env` opcional). La sintaxis se validó con `docker compose config`; **la imagen no se construyó** porque Docker Desktop estaba apagado.

## 4. Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Stack | FastAPI + SQLModel + SQLite; bot en el mismo proceso; React 19 + Vite 6 + TypeScript + TanStack Query; R3F 9 + drei 10 + postprocessing; CSS propio con tokens, sin Tailwind | Un solo proceso, sin servicios extra: respeta el espíritu del ADR de baja infraestructura |
| Login | No hay. El «¿quién eres?» se guarda en el navegador | Es local, en un PC |
| Fuente de verdad | Las tareas de Bleepy viven en HQ (sembradas una vez desde el vault); no se sincroniza de vuelta | Editar en dos lados exigiría sincronizar en dos vías |
| Carga | Puntos (S = 1, M = 2, L = 3) de tareas abiertas que vencen en 14 días ÷ capacidad. Verde < 70 %, amarillo ≤ 100 %, rosa > 100 % | Simple y explicable |
| Veredicto | Lanzar si cumplen todos los bloqueantes y ≥ 80 % del resto; lanzar con riesgo o no lanzar en los demás casos | Igual a la regla de la rúbrica del vault |
| Avatares | Chibis procedurales (SVG en 2D y toon en 3D) con rasgos de las fotos, editables en Ajustes. VRM queda para después | Sin costo ni archivos externos |
| Mapeo de fotos | **Tentativo, falta confirmar**: foto de pelo negro largo con flequillo y collares = Dana; gafas redondas y chaqueta de jean = Jean Pierre; pelo corto ondulado y sobrecamisa negra = Juan David | Deducido de las fotos |
| Bleepy | Paleta provisional «planeta creativo» (cian, violeta, rosa, amarillo) | La identidad de Saray no ha llegado |
| Telegram | Long polling, mensajes en HTML, máximo 3 proactivos al día, sábado 18:00 configurable | Sin dominio ni servidor público |

**Cambios frente al plano original**: no hay Railway, Litestream ni login con Google (local y gratis); el 3D se construyó ya y no después del piloto, porque Dana pidió hacer la mayor parte de una vez; no se escribió el ADR porque HQ no se registra en el vault; las personas externas no aparecen ni como visitantes.

## 5. Pendiente, en orden sugerido

1. **Probar el bot de verdad**: Dana crea el bot con BotFather, pega el token en Seguimiento, vincula a los tres y al grupo, y prueba los botones (hecha, bloqueada con motivo, nueva fecha, comentario) y el ritual con «Enviar ahora».
1. **GitHub**: el repositorio `DanaSofia12/tablero_liiot` estaba **público** el 27-oct; no se subió nada. Subir solo cuando sea privado (o si Dana confirma que lo quiere público).
1. **Obsidian**: revisar con el equipo las 9 notas que HQ creó en Bleepy y los campos que agregó; documentar en el vault (plantilla `Entity_Tarea`) los estados nuevos `en_revision` y `bloqueada` si el equipo los adopta (eso toca el vault: pedir permiso antes).
2. **Confirmar los avatares** con cada persona y ajustar rasgos en Ajustes (o en `backend/app/seed_data/bleepy.json` para el valor inicial).
3. **Seguimiento que falta del plano**: aviso a Dana si una tarea vencida no tiene respuesta en 4 horas hábiles; check-in de tareas sin movimiento (3 días en progreso, o P0 cada 2 días hábiles); resumen diario opcional a Dana (por ejemplo 7:30).
4. **Cronograma**: arrastrar barras para cambiar fechas y dependencias entre tareas.
5. **Oficina más liviana (prioridad)**: en el portátil de Dana (i5-7200U con gráficos Intel HD 620), la oficina abierta en Edge deja el procesador casi al 100 % y todo el PC se pone lento; ese día Python tardó 16 s en arrancar. Opciones: limitar a 30 fps (`frameloop="demand"` + `invalidate()`), `dpr` 1, sin MSAA en el EffectComposer, bloom más barato, sombras de 1024 y un modo ligero que solo dibuje cuando algo cambia. Además, la ruta del café al sofá atraviesa la mesa de reuniones (mejorar `route()` en `office/layout.ts`).
6. **Avatares VRM** con VRoid Studio (gratis) y `@pixiv/three-vrm`, dejando los chibis como respaldo.
7. **Docker**: con Docker Desktop encendido, correr `docker compose up -d --build` y revisar que siembre y sirva la interfaz.
8. **Texto libre en Telegram** («voy con 2 de 3 empresas…») con un analizador de reglas gratis. IA solo si no cuesta, y siempre con confirmación.
9. **Identidad de Bleepy** cuando llegue la de Saray: reemplazar la paleta en `styles/tokens.css` (`[data-uni='bleepy']`) y `office/palette.ts`.
10. **Salir de lo local** (Dana lo pidió el 27-oct): elegir una de las opciones de abajo. Solo si Dana lo pide: exportar tareas al vault o CI en GitHub.
11. Fuera de HQ: `AGENTS.md` del vault describe roles distintos a los que Dana usó aquí (por ejemplo «David Ocaño · Business / Análisis»). Actualizarlo solo con su aprobación.

### Opciones para no depender del PC local (revisadas el 27-oct-2026)

HQ **no tiene login**: nunca se publica en internet sin una capa de acceso delante. En todas las opciones el bot sigue funcionando igual (no necesita webhook), pero solo puede haber un HQ encendido por token, y la base se lleva copiando `hq.db` con HQ cerrado.

| Opción | Costo | Qué implica |
|---|---|---|
| Tailscale + `tailscale serve` | Gratis en el plan Personal (hasta 6 usuarios), que Tailscale define para uso no comercial; el plan para empresas cobra por usuario | HQ sigue en el PC de Dana; los tres entran desde portátil y celular por una red privada con HTTPS. Sin cambios de código. El PC debe estar encendido |
| Cloudflare Tunnel + Cloudflare Access | Gratis hasta 50 usuarios; necesita un dominio administrado en Cloudflare | Dirección tipo `hq.<dominio>` con acceso por correo y código. Sin cambios de código. El PC (o el servidor) debe estar encendido |
| Máquina virtual gratis 24/7 (Oracle Cloud Always Free) con Docker + Tailscale o Cloudflare | Gratis; pide tarjeta para verificar. En 2026 el cupo ARM bajó a 2 OCPU / 12 GB, que sobra para HQ | Funciona aunque el PC esté apagado. Más configuración (una tarde) |
| Railway o Fly.io desde GitHub, con volumen para `/data` | Alrededor de US$5 al mes | Lo más simple para 24/7, pero queda en una URL pública: antes hay que agregar login a HQ |

## 6. Mapa del código y trampas conocidas

```
backend/app/
  main.py        arranque (siembra, bot), /ws, sirve frontend/dist
  api.py         rutas /api
  services.py    reglas: tareas, carga, salud, rúbrica, presencia, serializadores
  bot.py         Telegram: comandos, botones, textos, recordatorios, ritual
  vault.py       sincronización en dos vías con Obsidian (ciclo cada 15 s + al cambiar algo en HQ)
  hooks.py       tras cada cambio: avisa por WebSocket, al bot y pide sincronizar con Obsidian
  models.py      tablas · catalog.py  tipos, estados, prioridades, ajustes por defecto
  seed.py + seed_data/bleepy.json   datos iniciales
backend/tests/test_api.py           flujo completo, bot sin conexión, textos del bot
frontend/src/
  pages/         una por sección (OfficePage, MePage, TasksPage, LaunchPage, TimelinePage, TeamPage, FollowupPage, SettingsPage)
  components/    TaskDrawer, TaskForm, Avatar (2D), Shell, bits (chips, medidores, metadatos de estado)
  office/        Office3D (lienzo, luces, efectos, burbujas), Room (sala), Avatar3D, layout (lugares y rutas), palette, anchors
  styles/        tokens.css (oscuro, claro, Bleepy) y app.css
  api.ts         consultas y mutaciones (actualización optimista) · realtime.ts  WebSocket · prefs.tsx  preferencias locales
```

- SQLModel 0.0.48 exige fechas con zona horaria: usar `services.utcnow()`.
- El `<Html>` de drei a veces queda vacío con React 19: las burbujas usan una capa DOM propia (`office/anchors.ts` + `BubbleProjector` en `Office3D.tsx`).
- `<Float>` de drei rota alrededor de su propio origen: envolverlo en un `<group position>`.
- `useFrame` con prioridad mayor que 0 toma el control del render (el EffectComposer ya usa prioridad 1).
- Cambios del frontend: basta con compilar (el servidor lee `dist` del disco). Cambios del backend: reiniciar HQ.
- Ritual y recordatorios corren con la zona `America/Bogota` (`HQ_TZ`).
- En Windows, `http://localhost` prueba IPv6 primero y tarda unos 3 s en caer a IPv4 (uvicorn escucha en 127.0.0.1): los chequeos de `iniciar.ps1` usan `127.0.0.1`.
- `Get-ChildItem <archivo> -Recurse` busca ese nombre en todas las subcarpetas, `node_modules` incluido: no usarlo con archivos sueltos.
- `Start-Job` tarda unos 6 s en arrancar en este PC; el script abre el navegador desde un runspace (`[powershell]::Create()`).
- Un HQ lanzado desde una sesión de Claude Code muere cuando esa sesión se cierra; para que quede abierto, lanzar `iniciar.cmd` en su propia ventana.
- Columnas nuevas en tablas existentes: `db._add_missing_columns()` las agrega al arrancar (SQLite no lo hace con `create_all`).
- Probar la sincronización siempre sobre copias: `HQ_VAULT_PATH=<copia>` y `HQ_DB_PATH=<copia>`; en las pruebas `HQ_VAULT_PATH=off`. Por defecto HQ busca el vault solo en `G:\Mi unidad\Liiot`.
- Windows PowerShell 5.1: `Invoke-RestMethod` entrega un arreglo JSON como un solo objeto en la tubería (envolver con `@(...) | ForEach-Object { $_ }`) y muestra mal las tildes; los datos están bien.

Cómo verificar antes de entregar:

```powershell
cd C:\Users\dana\dev\liiot-hq\backend; .\.venv\Scripts\python.exe -m pytest -q
cd C:\Users\dana\dev\liiot-hq\frontend; npm run build
```

Luego abrir `iniciar.cmd` y revisar http://localhost:8000 en el navegador: Oficina (las tres burbujas, ayudas al pasar el mouse, universo Bleepy, modo claro), Tareas (abrir una ficha) y las demás páginas sin errores en consola.

## 7. Prompt para la próxima sesión

Copiar y pegar en una sesión nueva de Claude Code abierta en `C:\Users\dana\dev\liiot-hq`:

```text
Continúa Liiot HQ, mi herramienta interna (no es un proyecto del vault: no lo registres ahí ni toques el vault).
El código está en C:\Users\dana\dev\liiot-hq. Antes de cambiar nada, lee completos CONTINUAR.md y README.md:
ahí están el encargo original, las reglas, las decisiones y el estado.

Reglas: todo local, sin desplegar y sin gastar dinero; solo tareas de Bleepy; las personas externas no entran;
el token de Telegram solo en .env; no hagas commit ni push si no te lo pido.

Hoy quiero avanzar en: <elige de la sección 5 de CONTINUAR.md, por ejemplo «probar el bot con el token real»,
«avatares VRM» o «arrastrar barras en el cronograma»>.

Al terminar: corre las pruebas del backend y npm run build, revisa la app en el navegador,
actualiza CONTINUAR.md (estado y pendientes) y dime qué quedó listo y qué no.
```

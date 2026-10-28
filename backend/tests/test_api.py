"""Pruebas de punta a punta de la API con una base temporal."""
import os
import tempfile

os.environ["HQ_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["HQ_STATIC_DIR"] = os.path.join(tempfile.mkdtemp(), "sin-build")
os.environ["HQ_VAULT_PATH"] = "off"  # las pruebas nunca tocan la bóveda real

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def test_seed_y_flujo_de_tareas():
    with TestClient(app) as c:
        tasks = c.get("/api/tasks").json()
        assert len(tasks) == 23
        assert {t["ownerId"] for t in tasks} == {"dana", "jp", "jd"}
        assert tasks[0]["key"] == "BLP-1"
        assert all(t["projectId"] == "bleepy" for t in tasks)

        members = c.get("/api/members").json()
        assert [m["id"] for m in members] == ["dana", "jd", "jp"]
        assert members[2]["avatar"]["glasses"] is True

        project = c.get("/api/project").json()
        assert len(project["stages"]) == 5
        assert project["project"]["pilotDate"] == "2026-11-15"

        rub = c.get("/api/rubric").json()
        assert sum(len(cat["criteria"]) for cat in rub["categories"]) == 30
        assert rub["verdict"]["blockingTotal"] == 18
        assert rub["verdict"]["decision"] == "no_lanzar"

        task = next(t for t in tasks if t["key"] == "BLP-11")
        r = c.patch(f"/api/tasks/{task['id']}", json={"status": "bloqueada", "blockerReason": "Falta la cuenta de AWS",
                                                     "blockerWaitingOn": "dana", "actorId": "jp"})
        assert r.status_code == 200
        assert r.json()["status"] == "bloqueada"
        pres = {p["memberId"]: p for p in c.get("/api/presence?ignoreHours=true").json()}
        assert pres["jp"]["state"] == "bloqueado"
        assert pres["jp"]["detail"] == "Falta la cuenta de AWS"

        r = c.patch(f"/api/tasks/{task['id']}", json={"status": "hecha", "actorId": "jp"})
        assert r.json()["completedAt"] is not None
        assert r.json()["blockerReason"] is None
        pres = {p["memberId"]: p for p in c.get("/api/presence?ignoreHours=true").json()}
        assert pres["jp"]["state"] == "celebrando"

        kinds = [e["kind"] for e in c.get(f"/api/tasks/{task['id']}/events").json()]
        assert "bloqueo" in kinds and "desbloqueo" in kinds and "estado" in kinds

        r = c.patch(f"/api/tasks/{task['id']}", json={"dueDate": "2026-10-30", "actorId": "jp"})
        assert r.json()["reschedules"] == 1
        assert r.json()["dueOriginal"] == "2026-10-19"

        new = c.post("/api/tasks", json={"title": "Prueba desde test", "ownerId": "jd", "dueDate": "2026-11-01", "actorId": "dana"})
        assert new.status_code == 200
        assert new.json()["key"] == "BLP-24"
        assert new.json()["stageId"] == project["stages"][2]["id"]

        bad = c.post("/api/tasks", json={"title": "", "actorId": "dana"})
        assert bad.status_code == 400

        assert c.post(f"/api/tasks/{task['id']}/comments", json={"text": "Listo el estimado", "actorId": "jp"}).json()["ok"]

        crit = rub["categories"][0]["criteria"][0]
        assert c.patch(f"/api/rubric/criteria/{crit['id']}", json={"state": "cumple"}).status_code == 200
        review = c.post("/api/rubric/reviews", json={"reviewerId": "dana", "notes": "Revisión de prueba"}).json()
        assert review["blockingOk"] == 1

        metrics = c.get("/api/metrics").json()
        assert len(metrics["team"]) == 3
        assert metrics["project"]["tasksTotal"] == 24
        assert metrics["project"]["health"] in ("verde", "amarillo", "rojo")

        override = c.patch("/api/members/dana", json={"presence": "reunion", "minutes": 30}).json()
        assert override["presenceOverride"] == "reunion"
        pres = {p["memberId"]: p for p in c.get("/api/presence").json()}
        assert pres["dana"]["state"] == "reunion"

        tg = c.get("/api/telegram").json()
        assert tg["status"]["tokenConfigured"] is False
        assert tg["settings"]["weeklyDay"] == 5 and tg["settings"]["weeklyTime"] == "18:00"
        updated = c.patch("/api/telegram/settings", json={"weeklyDay": 4, "weeklyTime": "17:30"}).json()
        assert updated["weeklyDay"] == 4 and updated["weeklyTime"] == "17:30"
        assert c.post(f"/api/tasks/{task['id']}/followup", json={"actorId": "dana"}).json()["sent"] is False

        export = c.get("/api/export")
        assert export.status_code == 200 and len(export.json()["tasks"]) == 24

        page = c.get("/tareas")
        assert page.status_code == 200 and "Liiot HQ" in page.text


def test_proyectos_nuevos():
    with TestClient(app) as c:
        created = c.post("/api/projects", json={"name": "Marketing Liiot", "keyPrefix": "mkt", "leadId": "jd", "basicRubric": True})
        assert created.status_code == 200, created.text
        project = created.json()
        assert project["keyPrefix"] == "MKT" and project["code"] == "PRJ-MKT" and project["id"] == "marketing-liiot"
        assert c.post("/api/projects", json={"name": "marketing liiot"}).status_code == 400
        assert c.post("/api/projects", json={"name": "Otro", "keyPrefix": "BLP"}).status_code == 400

        listed = {p["id"]: p for p in c.get("/api/projects").json()}
        assert {"bleepy", "marketing-liiot"} <= set(listed)
        assert listed["bleepy"]["counts"]["total"] >= 23

        task = c.post("/api/tasks", json={"title": "Calendario de contenidos", "projectId": "marketing-liiot", "actorId": "jd"}).json()
        assert task["key"] == "MKT-1" and task["projectId"] == "marketing-liiot"
        only = c.get("/api/tasks?project=marketing-liiot").json()
        assert [t["key"] for t in only] == ["MKT-1"]

        rub = c.get("/api/rubric?project=marketing-liiot").json()
        assert sum(len(cat["criteria"]) for cat in rub["categories"]) == 6
        metrics = c.get("/api/metrics?project=marketing-liiot").json()
        assert metrics["project"]["tasksTotal"] == 1 and metrics["project"]["projectId"] == "marketing-liiot"
        assert c.get("/api/projects/no-existe").status_code == 404


def _write(path, text, offset=0):
    import time

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    stamp = time.time() + offset
    os.utime(path, (stamp, stamp))


def test_sincronizacion_con_obsidian(tmp_path, monkeypatch):
    from pathlib import Path

    from app import config, vault
    from app import services as svc
    from app.db import init_db, session_scope
    from app.models import Task, VaultLink
    from app.seed import seed_if_empty
    from sqlmodel import select

    init_db()
    seed_if_empty()
    monkeypatch.setattr(config, "VAULT_PATH", str(tmp_path))
    vault._cache.clear()
    projects = tmp_path / "10_Proyectos"
    _write(projects / "Bleepy" / "Bleepy.md", "---\nid: PRJ-LCOM\ntype: project\nlider:\nfecha_entrega:\n---\n\n# Bleepy\n")
    bleepy_note = projects / "Bleepy" / "01_Gestion" / "Tareas" / "Bleepy Estimar costos infraestructura.md"
    body = "\n# Estimar costos infraestructura - Bleepy 10-oct\n\nEstimar costos de infraestructura.\n\nOrigen: reunión.\n"
    _write(bleepy_note, "---\nid: TSK-20261013-14\ntype: task\nproject: \"PRJ-LCOM\"\nstatus: en_progreso\n"
                        "responsable: \"Jean Pierre Ortiz Murcia\"\ncategoria: \"infraestructura\"\ntags:\n  - bleepy\n"
                        "created: 2026-10-13\nupdated: 2026-10-13\n---\n" + body, offset=-86400 * 10)
    _write(projects / "SST" / "SST.md", "---\nid: PRJ-SST\ntype: project\nlider: \"Dana\"\n---\n\n# SST\n\n## Descripción\n\nPlataforma SG-SST.\n")
    sst_dir = projects / "SST" / "01_Gestion" / "Tareas"
    _write(sst_dir / "Hacer demo.md", "---\nid: TSK-20261006-45\ntype: task\nproject: \"PRJ-SST\"\nstatus: por_hacer\nfase: \"fase_1\"\n"
                                      "responsable: \"David\"\ncategoria: \"\"\ntags: []\ncreated: 2026-10-06\nupdated: 2026-10-06\n---\n\n# Hacer demo\n\nMostrar la demo.\n")
    _write(sst_dir / "API CRUD empresas.md", "---\nid: TSK-20261006-12\ntype: task\nproject: \"PRJ-SST\"\nstatus: hecho\n"
                                             "responsable: \"El grupo\"\ncategoria: \"\"\ntags: []\ncreated: 2026-10-06\n---\n\n# API CRUD empresas\n")

    first = vault.sync_once()
    assert first["ok"], first
    with session_scope() as s:
        sst = s.get(svc.Project, "sst")
        assert sst is not None and sst.key_prefix == "SST" and sst.lead_id == "dana" and sst.summary == "Plataforma SG-SST."
        sst_tasks = {t.legacy_id: t for t in svc.tasks_all(s, "sst")}
        demo, api = sst_tasks["TSK-20261006-45"], sst_tasks["TSK-20261006-12"]
        assert demo.owner_id == "jd" and demo.phase == "fase_1" and demo.summary == "Mostrar la demo." and demo.status == "por_hacer"
        assert api.status == "hecha" and api.type == "desarrollo" and api.owner_id == "dana"  # «El grupo» → líder del proyecto
        blp11 = s.exec(select(Task).where(Task.key == "BLP-11")).one()
        assert s.get(VaultLink, blp11.id) is not None
        bleepy_open = len(svc.tasks_all(s, "bleepy"))
    linked = bleepy_note.read_text(encoding="utf-8")
    assert "hq: BLP-11" in linked and "prioridad:" in linked and linked.endswith(body)  # el cuerpo no se toca
    assert "lider: \"Dana\"" in (projects / "Bleepy" / "Bleepy.md").read_text(encoding="utf-8")
    # cada tarea de Bleepy tiene su nota: la que ya existía más las que se crearon
    assert len(list((projects / "Bleepy" / "01_Gestion" / "Tareas").glob("*.md"))) == bleepy_open

    # Obsidian → HQ: la demo pasa a hecho en la nota
    demo_note = sst_dir / "Hacer demo.md"
    _write(demo_note, demo_note.read_text(encoding="utf-8").replace("status: por_hacer", "status: hecho"), offset=60)
    second = vault.sync_once()
    assert second["updatedHQ"] >= 1
    with session_scope() as s:
        assert s.get(Task, demo.id).status == "hecha"

    # HQ → Obsidian: la API pasa a revisión desde HQ
    with session_scope() as s:
        task = s.get(Task, api.id)
        svc.apply_patch(s, task, {"status": "en_revision", "dueDate": "2026-11-20"}, "dana")
        s.commit()
    vault.sync_once()
    api_text = (sst_dir / "API CRUD empresas.md").read_text(encoding="utf-8")
    assert "status: en_revision" in api_text and "vence: 2026-11-20" in api_text and api_text.endswith("# API CRUD empresas\n")

    # Proyecto nuevo en HQ → carpeta y nota en Obsidian; tarea nueva → nota en su carpeta
    with session_scope() as s:
        new_project = svc.create_project(s, {"name": "Ventas", "leadId": "jd"})
        s.commit()
        svc.create_task(s, {"projectId": new_project.id, "title": "Lista de prospectos", "ownerId": "jd"}, "jd")
        s.commit()
    vault.sync_once()
    main_note = projects / "Ventas" / "Ventas.md"
    assert main_note.is_file() and "type: project" in main_note.read_text(encoding="utf-8")
    created = (projects / "Ventas" / "01_Gestion" / "Tareas" / "Lista de prospectos.md").read_text(encoding="utf-8")
    assert "responsable: \"Juan David\"" in created and "hq: VEN-1" in created and "# Lista de prospectos" in created
    assert "id: PRJ-VEN" in main_note.read_text(encoding="utf-8")

    # Nota borrada en Obsidian → la tarea se archiva (tras dos revisiones seguidas)
    demo_note.unlink()
    vault.sync_once()
    vault.sync_once()
    with session_scope() as s:
        assert s.get(Task, demo.id).archived is True
    assert Path(tmp_path).is_dir()


def test_bot_se_construye_sin_red():
    from app import bot

    application = bot.build_application("123456:TEST-TOKEN")
    assert application.job_queue is not None
    assert len(application.handlers[0]) >= 12


def test_textos_del_bot():
    from datetime import date

    from app import bot
    from app.db import session_scope
    from app.models import Project
    from app.services import members_all, project_metrics, tasks_all, team_metrics

    with session_scope() as s:
        project = s.get(Project, "bleepy")
        names = {m.id: m.name for m in members_all(s)}
        text = bot.weekly_group_text(project, project_metrics(s, "bleepy"), team_metrics(s), tasks_all(s, "bleepy"), names, date(2026, 10, 25), ritual=True)
        ceo = bot.ceo_text(project_metrics(s, "bleepy"), tasks_all(s), names, date(2026, 10, 25), "Dana")
        card = bot.task_card_text(tasks_all(s, "bleepy")[0], names, date(2026, 10, 25))
    assert "Así vamos en Bleepy" in text and "¡Buen fin de semana, equipo!" in text
    assert "Tu resumen, Dana" in ceo
    assert "¿Cómo vas con esta?" in card and "P1" not in card  # sin jerga: la prioridad va en palabras
    options = bot.date_options(date(2026, 10, 25))
    assert options[0][1] == date(2026, 10, 26)
    assert all(day > date(2026, 10, 25) for _, day in options)


def test_el_bot_entiende_frases_normales():
    from dataclasses import dataclass
    from datetime import date

    from app.chat import match_task, understand

    @dataclass
    class T:
        key: str
        title: str
        owner_id: str

    tasks = [T("BLP-3", "Tabla de precios base por pieza", "jd"), T("BLP-5", "Centralizar el diagrama de flujo", "dana"),
             T("BLP-8", "Diagrama de procesos y casos de uso", "jd")]
    today = date(2026, 10, 27)  # martes
    projects, people = {"bleepy": "bleepy", "sst": "sst"}, [("juan david", "jd"), ("dana", "dana")]

    def it(text):
        return understand(text, today, projects, people)

    assert it("Hola!").kind == "saludo"
    assert it("hola, ¿qué tengo hoy?").kind == "hoy"
    assert it("¿qué tengo esta semana?").kind == "semana"
    assert it("¿cómo va el equipo?").kind == "equipo"
    assert it("gracias!").kind == "gracias"
    assert it("asdf qwer").kind == "desconocido"

    done = it("Terminé la tabla de precios")
    assert done.kind == "hecha" and match_task(done.phrase, done.key, tasks)[0].key == "BLP-3"
    assert it("listo, terminé BLP-3").kind == "hecha"
    assert it("el diagrama ya quedó listo para revisar").kind == "revision"

    blocked = it("Algo me frena con BLP-5 porque falta el logo de Saray")
    assert blocked.kind == "bloqueo" and blocked.key == "BLP-5" and blocked.reason == "Falta el logo de Saray"

    moved = it("mueve la tabla de precios para el viernes")
    assert moved.kind == "fecha" and moved.day == date(2026, 10, 30) and match_task(moved.phrase, None, tasks)[0].key == "BLP-3"

    new = it("recuérdame revisión del diseño para Juan David en Bleepy mañana")
    assert new.kind == "nueva" and new.title == "Revisión del diseño"
    assert new.owner_id == "jd" and new.project_id == "bleepy" and new.day == date(2026, 10, 28)

    vague = it("qué pasa con el diagrama")
    task, candidates = match_task(vague.phrase, vague.key, tasks)
    assert vague.kind == "ver" and task is None and {c.key for c in candidates} == {"BLP-5", "BLP-8"}

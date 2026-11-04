"""Pruebas de punta a punta de la API con una base temporal."""
import os
import tempfile

os.environ["HQ_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["HQ_STATIC_DIR"] = os.path.join(tempfile.mkdtemp(), "sin-build")
os.environ["HQ_VAULT_PATH"] = "off"  # las pruebas nunca tocan la bóveda real

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

H = {"X-Liiot": "1"}
PASSWORD = "clave de prueba 42"  # cuenta de prueba de esta base temporal


def client() -> TestClient:
    return TestClient(app, headers=H)


def login(c: TestClient, who: str = "dana") -> dict:
    """Crea la cuenta de prueba (si no existe) y entra con ella."""
    from app import auth
    from app.db import session_scope
    from app.models import Member

    with session_scope() as s:
        m = s.get(Member, who)
        if not m.password_hash:
            auth.set_credentials(s, m, f"{who}.prueba", f"{who}@liiot.test", PASSWORD)
            m.is_admin = who == "dana"
            s.commit()
        username = m.username
    r = c.post("/api/auth/login", json={"login": username, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["me"]


def test_cuentas_y_sesiones():
    from app import auth

    with TestClient(app) as raw, client() as c:
        state = c.get("/api/auth/state").json()
        assert state["needsSetup"] is True and state["me"] is None and state["appName"] == "Liiot Hub"
        assert {p["id"] for p in state["people"]} == {"dana", "jd", "jp"}
        assert c.get("/api/tasks").status_code == 401
        assert raw.post("/api/auth/login", json={"login": "x", "password": "y"}).status_code == 403  # sin el encabezado de la interfaz

        data = {"memberId": "dana", "username": "Dana", "email": "dana@liiot.test", "password": PASSWORD}
        assert c.post("/api/auth/setup", json={**data, "code": "AAAA-BBBB"}).status_code == 400
        weak = c.post("/api/auth/setup", json={**data, "code": auth.setup_code(), "password": "12345678"})
        assert weak.status_code == 400 and "fácil" in weak.json()["detail"]
        ok = c.post("/api/auth/setup", json={**data, "code": auth.setup_code()})
        assert ok.status_code == 200, ok.text
        me = ok.json()["me"]
        assert me["id"] == "dana" and me["isAdmin"] is True and me["username"] == "dana"
        assert c.get("/api/tasks").status_code == 200
        assert auth.setup_code() is None  # el código de la primera cuenta deja de existir
        assert c.post("/api/auth/setup", json={**data, "code": "x"}).status_code == 409

        # Invitar a Juan David: quien administra genera el código y él elige su usuario y contraseña
        invite = c.post("/api/accounts/jd/code").json()
        assert invite["kind"] == "activar" and len(invite["code"]) == 9
        with client() as jd:
            info = jd.post("/api/auth/code", json={"code": invite["code"].lower()}).json()
            assert info["member"]["name"] == "Juan David"
            used = jd.post("/api/auth/code/use", json={"code": invite["code"], "username": "juandavid", "email": "jd@liiot.test",
                                                       "password": "otra clave segura"})
            assert used.status_code == 200 and used.json()["me"]["isAdmin"] is False
            assert jd.post("/api/auth/code/use", json={"code": invite["code"], "username": "jd2", "email": "jd2@liiot.test",
                                                       "password": "otra clave segura"}).status_code == 400  # un solo uso
            assert jd.get("/api/accounts").status_code == 403
            assert jd.patch("/api/members/dana", json={"color": "#000000"}).status_code == 403
            assert jd.patch("/api/members/jd", json={"color": "#22A06B"}).status_code == 200
            mine = {m["id"]: m for m in jd.get("/api/members").json()}
            assert "linkCode" in mine["jd"] and "linkCode" not in mine["dana"]  # el enlace de Telegram solo lo ve su dueño

        rows = {r["id"]: r for r in c.get("/api/accounts").json()}
        assert rows["jd"]["hasAccount"] is True and rows["jp"]["hasAccount"] is False
        assert c.patch("/api/accounts/dana", json={"isAdmin": False}).status_code == 400  # queda al menos una administradora

        assert c.post("/api/auth/logout").json()["ok"] is True
        assert c.get("/api/tasks").status_code == 401
        assert c.post("/api/auth/login", json={"login": "dana@liiot.test", "password": "mala"}).status_code == 401
        assert c.post("/api/auth/login", json={"login": "dana@liiot.test", "password": PASSWORD}).status_code == 200
        assert c.post("/api/auth/password", json={"current": PASSWORD, "password": "nueva clave larga"}).status_code == 200
        assert c.post("/api/auth/password", json={"current": "nueva clave larga", "password": PASSWORD}).status_code == 200

        person = c.post("/api/accounts", json={"name": "Saray Gómez", "role": "Diseño"}).json()
        assert person["member"]["id"] == "saraygomez" and person["code"]
        with client() as sg:
            assert sg.post("/api/auth/code/use", json={"code": person["code"], "username": "saray", "email": "saray@liiot.test",
                                                       "password": "clave de saray 1"}).status_code == 200


def test_seed_y_flujo_de_tareas():
    with client() as c:
        login(c)
        tasks = c.get("/api/tasks").json()
        assert len(tasks) == 23
        assert {t["ownerId"] for t in tasks} == {"dana", "jp", "jd"}
        assert {t["status"] for t in tasks} <= {"pendiente", "en_progreso", "en_pausa", "pruebas", "finalizada"}
        assert all(t["projectId"] == "bleepy" and t["phaseId"] for t in tasks)
        assert "effort" not in tasks[0] and "rubric" not in tasks[0]

        project = c.get("/api/projects/bleepy").json()
        assert len(project["stages"]) == 5 and project["project"]["pilotDate"] == "2026-11-15"
        assert [p["name"] for p in project["phases"]] == ["Piloto de validación"]
        phase_id = project["phases"][0]["id"]
        assert project["project"]["currentPhaseId"] == phase_id and project["project"]["theme"] == "bleepy"
        assert all(st["phaseId"] == phase_id for st in project["stages"])

        rub = c.get(f"/api/phases/{phase_id}/rubric").json()
        assert sum(len(cat["criteria"]) for cat in rub["categories"]) == 30
        assert rub["verdict"]["blockingTotal"] == 18 and rub["verdict"]["decision"] == "no_lanzar"

        task = next(t for t in tasks if t["key"] == "BLP-11")
        r = c.patch(f"/api/tasks/{task['id']}", json={"status": "en_pausa", "blockerReason": "Falta la cuenta de AWS", "blockerWaitingOn": "dana"})
        assert r.status_code == 200 and r.json()["status"] == "en_pausa"
        r = c.patch(f"/api/tasks/{task['id']}", json={"status": "finalizada"})
        assert r.json()["completedAt"] is not None and r.json()["blockerReason"] is None and r.json()["progress"] == 100
        kinds = [e["kind"] for e in c.get(f"/api/tasks/{task['id']}/events").json()]
        assert kinds.count("pausa") == 2 and "estado" in kinds
        assert c.patch(f"/api/tasks/{task['id']}", json={"status": "bloqueada"}).json()["status"] == "en_pausa"  # nombre antiguo
        assert c.patch(f"/api/tasks/{task['id']}", json={"status": "inventado"}).status_code == 400

        r = c.patch(f"/api/tasks/{task['id']}", json={"dueDate": "2026-10-30"})
        assert r.json()["reschedules"] == 1 and r.json()["dueOriginal"] == "2026-10-19"
        assert c.patch(f"/api/tasks/{task['id']}", json={"priority": "alta"}).json()["priority"] == "P1"

        no_desc = c.post("/api/tasks", json={"title": "Sin descripción", "ownerId": "jd"})
        assert no_desc.status_code == 400 and "descripción" in no_desc.json()["detail"]
        new = c.post("/api/tasks", json={"title": "Prueba desde test", "summary": "Para revisar el flujo", "ownerId": "jd", "dueDate": "2026-11-01",
                                         "priority": "P0", "checklist": ["Paso uno", "Paso dos"]})
        assert new.status_code == 200, new.text
        created = new.json()
        assert created["key"] == "BLP-24" and created["stageId"] == project["stages"][2]["id"] and created["phaseId"] == phase_id
        assert [i["text"] for i in created["checklist"]] == ["Paso uno", "Paso dos"] and created["progress"] == 0

        items = created["checklist"]
        items[0]["done"] = True
        items.append({"text": "Paso tres", "done": False})
        r = c.patch(f"/api/tasks/{created['id']}", json={"checklist": items}).json()
        assert r["progress"] == 33 and r["checklist"][0]["id"] == items[0]["id"] and len(r["checklist"]) == 3
        texts = [e["text"] for e in c.get(f"/api/tasks/{created['id']}/events").json()]
        assert "Completó «Paso uno»" in texts and "Agregó «Paso tres» al checklist" in texts
        assert c.patch(f"/api/tasks/{created['id']}", json={"summary": ""}).status_code == 400

        assert c.post(f"/api/tasks/{task['id']}/comments", json={"text": "Listo el estimado"}).json()["ok"]

        crit = rub["categories"][0]["criteria"][0]
        assert c.patch(f"/api/rubric/criteria/{crit['id']}", json={"state": "cumple"}).status_code == 200
        review = c.post(f"/api/phases/{phase_id}/rubric/reviews", json={"notes": "Revisión de prueba"}).json()
        assert review["blockingOk"] == 1 and review["reviewerId"] == "dana"

        metrics = c.get("/api/metrics?project=bleepy").json()
        assert metrics["tasksTotal"] == 24 and metrics["currentPhaseName"] == "Piloto de validación"
        assert metrics["health"] in ("verde", "amarillo", "rojo") and metrics["verdict"]["blockingTotal"] == 18

        me = c.patch("/api/me/presence", json={"state": "trabajando", "taskId": created["id"], "note": created["title"]}).json()
        assert me["state"] in ("trabajando", "descansando")  # fuera del horario manda «Descansando» salvo lo recién elegido
        assert c.patch("/api/me/presence", json={"state": "volando"}).status_code == 400
        states = {p["memberId"]: p["state"] for p in c.get("/api/presence").json()}
        assert set(states.values()) <= {"trabajando", "en_reunion", "disponible", "descansando"}

        tg = c.get("/api/telegram").json()
        assert tg["status"]["tokenConfigured"] is False and tg["settings"]["groupNewTasks"] is True
        updated = c.patch("/api/telegram/settings", json={"weeklyDay": 4, "weeklyTime": "17:30", "groupTime": "7:45"}).json()
        assert updated["weeklyDay"] == 4 and updated["weeklyTime"] == "17:30" and updated["groupTime"] == "07:45"
        assert c.post(f"/api/tasks/{task['id']}/followup").json()["sent"] is False

        export = c.get("/api/export")
        assert export.status_code == 200 and len(export.json()["tasks"]) == 24 and export.json()["phases"]

        page = c.get("/tareas")
        assert page.status_code == 200 and "Liiot Hub" in page.text


def test_fases_y_minimos():
    with client() as c:
        login(c)
        data = c.get("/api/projects/bleepy/phases").json()
        pilot = data["phases"][0]
        assert pilot["status"] == "en_curso" and len(pilot["stages"]) == 5 and pilot["useRubric"] is True
        assert pilot["gate"]["ready"] is False and any("rúbrica" in m for m in pilot["gate"]["missing"])

        launch = c.post("/api/projects/bleepy/phases", json={"name": "Lanzamiento definitivo", "goal": "Abrir a todas las empresas",
                                                             "checks": ["Contratos firmados", "Pagos funcionando"]}).json()
        assert launch["status"] == "pendiente" and [x["text"] for x in launch["checks"]] == ["Contratos firmados", "Pagos funcionando"]
        assert launch["key"] == "lanzamiento_definitivo"
        assert c.post("/api/projects/bleepy/phases", json={"name": "lanzamiento definitivo"}).status_code == 400

        assert c.post(f"/api/phases/{pilot['id']}/advance", json={}).status_code == 400  # falta la rúbrica
        assert c.post(f"/api/phases/{pilot['id']}/advance", json={"force": True}).status_code == 400  # sin nota no se fuerza
        moved = c.post(f"/api/phases/{pilot['id']}/advance", json={"force": True, "note": "Lanzamos con riesgo, decisión del equipo"}).json()
        assert moved["currentPhaseId"] == launch["id"]
        statuses = {p["name"]: p["status"] for p in moved["phases"]}
        assert statuses == {"Piloto de validación": "completada", "Lanzamiento definitivo": "en_curso"}

        check = launch["checks"][0]
        assert c.patch(f"/api/checks/{check['id']}", json={"done": True}).json()["doneBy"] == "dana"
        extra = c.post(f"/api/phases/{launch['id']}/checks", json={"text": "Soporte listo"}).json()
        assert c.delete(f"/api/checks/{extra['id']}").json()["ok"]
        gate = next(p for p in c.get("/api/projects/bleepy/phases").json()["phases"] if p["id"] == launch["id"])["gate"]
        assert gate["checksDone"] == 1 and gate["checksTotal"] == 2 and gate["ready"] is False

        stage = c.post("/api/stages", json={"projectId": "bleepy", "phaseId": launch["id"], "name": "Semana 1 de lanzamiento",
                                           "start": "2026-12-01", "end": "2026-12-07"}).json()
        assert stage["phaseId"] == launch["id"]
        cat = c.post(f"/api/phases/{launch['id']}/rubric/categories", json={"name": "Clientes"}).json()
        crit = c.post("/api/rubric/criteria", json={"categoryId": cat["id"], "title": "Tres empresas activas", "blocking": True}).json()
        assert crit["code"].startswith("C") and crit["blocking"] is True
        assert c.patch(f"/api/rubric/categories/{cat['id']}", json={"name": "Clientes activos"}).json()["ok"]

        back = c.post(f"/api/phases/{pilot['id']}/activate").json()
        assert back["currentPhaseId"] == pilot["id"]
        assert {p["name"]: p["status"] for p in back["phases"]}["Lanzamiento definitivo"] == "pendiente"
        assert c.delete(f"/api/phases/{launch['id']}").status_code == 400  # tiene una etapa
        assert c.delete(f"/api/stages/{stage['id']}").json()["ok"]
        assert c.delete(f"/api/phases/{launch['id']}").json()["ok"]


def test_proyectos_nuevos():
    with client() as c:
        login(c)
        created = c.post("/api/projects", json={"name": "Marketing Liiot", "keyPrefix": "mkt", "leadId": "jd", "firstPhase": "Investigación"})
        assert created.status_code == 200, created.text
        project = created.json()
        assert project["keyPrefix"] == "MKT" and project["code"] == "PRJ-MKT" and project["id"] == "marketing-liiot"
        assert project["theme"] == "liiot" and project["currentPhaseName"] == "Investigación"
        assert c.post("/api/projects", json={"name": "marketing liiot"}).status_code == 400
        assert c.post("/api/projects", json={"name": "Otro", "keyPrefix": "BLP"}).status_code == 400

        listed = {p["id"]: p for p in c.get("/api/projects").json()}
        assert {"bleepy", "marketing-liiot"} <= set(listed)
        assert listed["bleepy"]["counts"]["total"] >= 23

        task = c.post("/api/tasks", json={"title": "Calendario de contenidos", "summary": "Un mes de publicaciones", "projectId": "marketing-liiot"}).json()
        assert task["key"] == "MKT-1" and task["projectId"] == "marketing-liiot" and task["phaseId"] == project["currentPhaseId"]
        assert [t["key"] for t in c.get("/api/tasks?project=marketing-liiot").json()] == ["MKT-1"]

        phase_id = project["currentPhaseId"]
        assert c.post(f"/api/phases/{phase_id}/rubric/template").json()["ok"]
        rub = c.get(f"/api/phases/{phase_id}/rubric").json()
        assert sum(len(cat["criteria"]) for cat in rub["categories"]) == 6
        metrics = c.get("/api/metrics?project=marketing-liiot").json()
        assert metrics["tasksTotal"] == 1 and metrics["projectId"] == "marketing-liiot"
        assert c.get("/api/projects/no-existe").status_code == 404


def test_analisis_del_equipo_y_excel():
    from io import BytesIO

    from openpyxl import load_workbook

    with client() as c:
        login(c)
        team = c.get("/api/team").json()
        people = {p["memberId"]: p for p in team["people"]}
        assert {"dana", "jd", "jp"} <= set(people)
        dana = people["dana"]
        assert set(dana["counts"]) >= {"pending", "inProgress", "paused", "testing", "overdue", "doneThisMonth"}
        assert len(dana["byMonth"]) == 6 and sum(1 for m in dana["byMonth"] if m["current"]) == 1
        assert len(team["weeks"]) == 13 and any(w["current"] for w in team["weeks"])
        only = c.get("/api/team?project=bleepy").json()
        assert only["projectId"] == "bleepy" and only["totals"]["total"] >= 23

        r = c.get("/api/projects/bleepy/cronograma.xlsx")
        assert r.status_code == 200 and "spreadsheetml" in r.headers["content-type"]
        wb = load_workbook(BytesIO(r.content))
        assert wb.sheetnames == ["Cronograma", "Diagrama", "Resumen"]
        rows = list(wb["Cronograma"].iter_rows(min_row=5, values_only=True))
        assert len(rows) >= 23 and rows[0][0] == "Piloto de validación"

        filtered = load_workbook(BytesIO(c.get("/api/projects/bleepy/cronograma.xlsx?desde=2026-10-20&hasta=2026-10-26&persona=jd").content))
        names = {row[4] for row in filtered["Cronograma"].iter_rows(min_row=5, values_only=True)}
        assert names <= {"Juan David"}


def test_presencia_segun_horario():
    from datetime import datetime, timedelta

    from app.models import Member
    from app.services import TZ, presence_of

    m = Member(id="x", name="X", full_name="X", role="", work_start="08:00", work_end="18:00", work_days="0,1,2,3,4")
    tuesday_10 = datetime(2026, 11, 3, 10, 0, tzinfo=TZ)
    assert presence_of(m, tuesday_10) == ("disponible", True)
    m.presence_state, m.presence_at = "en_reunion", tuesday_10 - timedelta(minutes=20)
    assert presence_of(m, tuesday_10) == ("en_reunion", False)
    assert presence_of(m, tuesday_10 + timedelta(days=1)) == ("disponible", True)  # al otro día vuelve a lo automático
    evening = datetime(2026, 11, 3, 20, 0, tzinfo=TZ)
    assert presence_of(m, evening) == ("descansando", True)
    m.presence_state, m.presence_at = "trabajando", evening - timedelta(minutes=30)
    assert presence_of(m, evening) == ("trabajando", False)  # se quedó trabajando un rato más
    saturday = datetime(2026, 11, 7, 11, 0, tzinfo=TZ)
    assert presence_of(m, saturday) == ("descansando", True)


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
    from app.models import Phase, Task, VaultLink
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
    _write(sst_dir / "API CRUD empresas.md", "---\nid: TSK-20261006-12\ntype: task\nproject: \"PRJ-SST\"\nstatus: hecho\nfase: \"fase_2\"\n"
                                             "responsable: \"El grupo\"\ncategoria: \"\"\nchecklist:\n  - \"[x] Modelo de datos\"\n  - \"[ ] Pruebas\"\n"
                                             "tags: []\ncreated: 2026-10-06\n---\n\n# API CRUD empresas\n")

    first = vault.sync_once()
    assert first["ok"], first
    with session_scope() as s:
        sst = s.get(svc.Project, "sst")
        assert sst is not None and sst.key_prefix == "SST" and sst.lead_id == "dana" and sst.summary == "Plataforma SG-SST."
        sst_tasks = {t.legacy_id: t for t in svc.tasks_all(s, "sst")}
        demo, api = sst_tasks["TSK-20261006-45"], sst_tasks["TSK-20261006-12"]
        phases = {p.key: p for p in svc.phases_all(s, "sst")}
        assert set(phases) == {"fase_1", "fase_2"} and phases["fase_1"].name == "Fase 1"
        assert demo.owner_id == "jd" and demo.phase_id == phases["fase_1"].id and demo.summary == "Mostrar la demo." and demo.status == "pendiente"
        assert api.status == "finalizada" and api.type == "desarrollo" and api.owner_id == "dana"  # «El grupo» → líder del proyecto
        assert [(i["text"], i["done"]) for i in svc.checklist_of(api)] == [("Modelo de datos", True), ("Pruebas", False)]
        blp11 = s.exec(select(Task).where(Task.key == "BLP-11")).one()
        assert s.get(VaultLink, blp11.id) is not None
        bleepy_open = len(svc.tasks_all(s, "bleepy"))
        stage_name = svc.stages_all(s, "bleepy")[0].name
    linked = bleepy_note.read_text(encoding="utf-8")
    assert "hq: BLP-11" in linked and "prioridad:" in linked and linked.endswith(body)  # el cuerpo no se toca
    assert "fase: \"piloto_de_validacion\"" in linked and "esfuerzo" not in linked
    assert "lider: \"Dana\"" in (projects / "Bleepy" / "Bleepy.md").read_text(encoding="utf-8")
    tasks_dir = projects / "Bleepy" / "01_Gestion" / "Tareas"
    assert len(list(tasks_dir.glob("*.md"))) == bleepy_open
    assert any(f'etapa: "{stage_name}"' in p.read_text(encoding="utf-8") for p in tasks_dir.glob("*.md"))
    backups = list((Path(config.DB_PATH).parent / "respaldos").glob("vault-*"))
    assert backups and (backups[0] / "10_Proyectos" / "SST" / "01_Gestion" / "Tareas" / "Hacer demo.md").is_file()

    # Obsidian → Liiot Hub: la demo pasa a hecho en la nota y llega un punto nuevo del checklist
    demo_note = sst_dir / "Hacer demo.md"
    text = demo_note.read_text(encoding="utf-8").replace("status: por_hacer", "status: hecho").replace("tags: []", "checklist: [\"[ ] Ensayar\"]\ntags: []")
    _write(demo_note, text, offset=60)
    second = vault.sync_once()
    assert second["updatedHQ"] >= 1
    with session_scope() as s:
        fresh = s.get(Task, demo.id)
        assert fresh.status == "finalizada" and [i["text"] for i in svc.checklist_of(fresh)] == ["Ensayar"]

    # Liiot Hub → Obsidian: la API pasa a pruebas, cambia de fecha y suma un punto al checklist
    with session_scope() as s:
        task = s.get(Task, api.id)
        items = svc.checklist_of(task) + [{"text": "Documentar", "done": False}]
        svc.apply_patch(s, task, {"status": "pruebas", "dueDate": "2026-11-20", "checklist": items}, "dana")
        s.commit()
    vault.sync_once()
    api_text = (sst_dir / "API CRUD empresas.md").read_text(encoding="utf-8")
    assert "status: pruebas" in api_text and "vence: 2026-11-20" in api_text and api_text.endswith("# API CRUD empresas\n")
    assert 'checklist: ["[x] Modelo de datos", "[ ] Pruebas", "[ ] Documentar"]' in api_text

    # Una fase nueva escrita en Obsidian aparece como fase del proyecto
    _write(demo_note, demo_note.read_text(encoding="utf-8").replace('fase: "fase_1"', 'fase: "fase_3"'), offset=120)
    vault.sync_once()
    with session_scope() as s:
        phase = s.get(Phase, s.get(Task, demo.id).phase_id)
        assert phase.key == "fase_3" and phase.name == "Fase 3"

    # Proyecto nuevo en Liiot Hub → carpeta y nota en Obsidian; tarea nueva → nota en su carpeta
    with session_scope() as s:
        new_project = svc.create_project(s, {"name": "Ventas", "leadId": "jd"})
        s.commit()
        svc.create_task(s, {"projectId": new_project.id, "title": "Lista de prospectos", "summary": "Empresas a contactar", "ownerId": "jd"}, "jd")
        s.commit()
    vault.sync_once()
    main_note = projects / "Ventas" / "Ventas.md"
    assert main_note.is_file() and "type: project" in main_note.read_text(encoding="utf-8")
    created = (projects / "Ventas" / "01_Gestion" / "Tareas" / "Lista de prospectos.md").read_text(encoding="utf-8")
    assert "responsable: \"Juan David\"" in created and "hq: VEN-1" in created and "# Lista de prospectos" in created
    assert "status: por_hacer" in created and "Empresas a contactar" in created
    assert "id: PRJ-VEN" in main_note.read_text(encoding="utf-8")

    # Nota borrada en Obsidian → la tarea se archiva (tras dos revisiones seguidas)
    demo_note.unlink()
    vault.sync_once()
    vault.sync_once()
    with session_scope() as s:
        assert s.get(Task, demo.id).archived is True


def test_bot_se_construye_sin_red():
    from app import bot

    application = bot.build_application("123456:TEST-TOKEN")
    assert application.job_queue is not None
    assert len(application.handlers[0]) >= 15


def test_textos_del_bot():
    from datetime import date

    from app import bot
    from app.db import session_scope
    from app.models import Project
    from app.services import members_all, project_metrics, tasks_all

    with session_scope() as s:
        project = s.get(Project, "bleepy")
        names = {m.id: m.name for m in members_all(s)}
        text = bot.weekly_group_text(project, project_metrics(s, "bleepy"), members_all(s), tasks_all(s, "bleepy"), names, date(2026, 10, 25), ritual=True)
        ceo = bot.ceo_text(project_metrics(s, "bleepy"), tasks_all(s), names, date(2026, 10, 25), "Dana")
        card = bot.task_card_text(tasks_all(s, "bleepy")[0], names, date(2026, 10, 25))
        late = [t for t in tasks_all(s, "bleepy") if t.due_date][:3]
        overdue = bot.overdue_text(project, late, names)
        countdown = bot.countdown_text(project, 5)
    assert "Así vamos en Bleepy" in text and "¡Buen fin de semana, equipo!" in text and "Piloto de validación" in text
    assert "Tu resumen, Dana" in ceo
    assert "¿Cómo vas con esta?" in card and "P1" not in card and "BLP-" not in card  # sin claves ni jerga
    assert "3 tareas atrasadas" in overdue and "BLP-" not in overdue
    assert "Faltan <b>5 días</b> para el piloto de Bleepy" in countdown
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
    assert it("la tabla está lista para pruebas").kind == "revision"

    paused = it("Pausa el diagrama de flujo porque falta el logo de Saray")
    assert paused.kind == "bloqueo" and paused.reason == "Falta el logo de Saray"
    assert match_task(paused.phrase, paused.key, tasks)[0].key == "BLP-5"

    moved = it("mueve la tabla de precios para el viernes")
    assert moved.kind == "fecha" and moved.day == date(2026, 10, 30) and match_task(moved.phrase, None, tasks)[0].key == "BLP-3"

    new = it("recuérdame revisión del diseño para Juan David en Bleepy mañana")
    assert new.kind == "nueva" and new.title == "Revisión del diseño"
    assert new.owner_id == "jd" and new.project_id == "bleepy" and new.day == date(2026, 10, 28)

    vague = it("qué pasa con el diagrama")
    task, candidates = match_task(vague.phrase, vague.key, tasks)
    assert vague.kind == "ver" and task is None and {c.key for c in candidates} == {"BLP-5", "BLP-8"}

    assert (it("estoy en reunión").kind, it("estoy en reunión").state) == ("presencia", "en_reunion")
    assert it("terminé por hoy").state == "descansando" and it("ya estoy libre").state == "disponible"
    working = it("hoy trabajo en el diagrama de flujo")
    assert working.state == "trabajando" and match_task(working.phrase, None, tasks)[0].key == "BLP-5"
    assert it("¿cuál es mi estado?").kind == "mi_estado"

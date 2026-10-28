"""Pruebas de punta a punta de la API con una base temporal."""
import os
import tempfile

os.environ["HQ_DB_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["HQ_STATIC_DIR"] = os.path.join(tempfile.mkdtemp(), "sin-build")

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
        text = bot.weekly_group_text(project, project_metrics(s), team_metrics(s), tasks_all(s), names, date(2026, 10, 25))
        ceo = bot.ceo_text(project_metrics(s), tasks_all(s), names, date(2026, 10, 25))
    assert "Resumen semanal" in text and "Bleepy" in text
    assert "Para ti, Dana" in ceo
    options = bot.date_options(date(2026, 10, 25))
    assert options[0][1] == date(2026, 10, 26)
    assert all(day > date(2026, 10, 25) for _, day in options)

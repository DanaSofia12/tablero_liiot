"""Recuperar el acceso desde el computador donde corre Liiot Hub (por si quien administra olvida su contraseña).

Uso: doble clic en recuperar-acceso.cmd, o desde backend: .venv\Scripts\python.exe -m app.recovery
Muestra a las personas, se elige una y entrega un código de un solo uso (vale 1 hora) para elegir una contraseña nueva
en la pantalla de entrada («Tengo un código»).
"""
from __future__ import annotations

from . import auth
from . import services as svc
from .db import init_db, session_scope


def main() -> None:
    init_db()
    with session_scope() as s:
        people = svc.members_all(s)
        print("\nRecuperar el acceso a Liiot Hub\n")
        for i, m in enumerate(people, start=1):
            account = f"usuario {m.username}" if m.password_hash else "sin cuenta todavía"
            print(f"  {i}. {m.name} ({m.role}) · {account}")
        choice = input("\n¿Para quién es el código? Escribe el número y Enter: ").strip()
        if not choice.isdigit() or not 1 <= int(choice) <= len(people):
            print("No elegiste a nadie. No se hizo ningún cambio.")
            return
        member = people[int(choice) - 1]
        code, invite = auth.create_invite(s, member, "recuperacion", hours=1)
        if not member.is_admin and not any(m.is_admin and m.password_hash for m in people):
            member.is_admin = True  # si no queda nadie que administre, esta persona lo será
            s.add(member)
        s.commit()
    print(f"\nCódigo para {member.name}: {code}")
    print("Vale una sola vez durante 1 hora. En la pantalla de entrada elige «Tengo un código» y escríbelo.\n")


if __name__ == "__main__":
    main()

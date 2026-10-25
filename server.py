"""React static server and SQLite API. Run: python server.py"""
import json
import sqlite3
import os
import base64
import binascii
import hmac
from contextlib import contextmanager
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('HABIT_DB', str(ROOT / 'data' / 'habits.sqlite3')))

@contextmanager
def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS activities (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS checks (
          activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
          day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 30), PRIMARY KEY(activity_id, day));
          CREATE TABLE IF NOT EXISTS goals (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS goal_items (
          id INTEGER PRIMARY KEY, goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
          name TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)));
          CREATE TABLE IF NOT EXISTS prayers (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS prayer_checks (
          prayer_id INTEGER NOT NULL REFERENCES prayers(id) ON DELETE CASCADE,
          day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 7), PRIMARY KEY(prayer_id, day));''')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def respond(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def authorize(self):
        password = os.environ.get('APP_PASSWORD')
        if not password or self.path == '/health':
            return True
        try:
            scheme, token = self.headers.get('Authorization', '').split(' ', 1)
            credentials = base64.b64decode(token, validate=True).decode('utf-8')
            username, supplied = credentials.split(':', 1)
            valid = scheme.lower() == 'basic' and hmac.compare_digest(username, 'admin') and hmac.compare_digest(supplied, password)
        except (ValueError, UnicodeDecodeError, binascii.Error):
            valid = False
        if not valid:
            self.send_response(401)
            self.send_header('WWW-Authenticate', 'Basic realm="Mi rutina"')
            self.send_header('Content-Length', '0')
            self.end_headers()
        return valid

    def do_GET(self):
        if self.path == '/health':
            try:
                with connect() as db:
                    db.execute('SELECT 1').fetchone()
            except sqlite3.Error:
                return self.respond(503, {'status':'unavailable'})
            return self.respond(200, {'status':'ok'})
        if not self.authorize():
            return
        if self.path == '/api/prayers':
            with connect() as db:
                prayers = [dict(row) for row in db.execute('SELECT * FROM prayers ORDER BY id')]
                for prayer in prayers:
                    prayer['days'] = [row[0] for row in db.execute('SELECT day FROM prayer_checks WHERE prayer_id=? ORDER BY day', (prayer['id'],))]
            return self.respond(200, prayers)
        if self.path == '/api/goals':
            with connect() as db:
                goals = [dict(row) for row in db.execute('SELECT * FROM goals ORDER BY id')]
                for goal in goals:
                    goal['items'] = [dict(row) for row in db.execute('SELECT * FROM goal_items WHERE goal_id=? ORDER BY id', (goal['id'],))]
            return self.respond(200, goals)
        if self.path == '/api/activities':
            with connect() as db:
                items = [dict(row) for row in db.execute('SELECT * FROM activities ORDER BY id')]
                for item in items:
                    item['days'] = [r[0] for r in db.execute('SELECT day FROM checks WHERE activity_id=? AND day BETWEEN 1 AND 7 ORDER BY day', (item['id'],))]
            return self.respond(200, items)
        if self.path.startswith('/api/'):
            return self.respond(404, {'error':'Ruta no encontrada'})
        super().do_GET()

    def do_POST(self):
        if not self.authorize():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 <= length <= 4096:
                return self.respond(400, {'error':'Solicitud demasiado grande'})
            data = json.loads(self.rfile.read(length) or b'{}')
            with connect() as db:
                if self.path == '/api/prayers':
                    name = data.get('name', '')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                        return self.respond(400, {'error':'Escribe una petición de hasta 80 caracteres.'})
                    cursor = db.execute('INSERT INTO prayers(name) VALUES (?)', (name.strip(),))
                    result = {'id':cursor.lastrowid, 'name':name.strip(), 'total':0, 'days':[]}
                elif self.path == '/api/prayer-toggle':
                    prayer_id, day = data.get('id'), data.get('day')
                    if type(prayer_id) is not int or type(day) is not int or not 1 <= day <= 7:
                        return self.respond(400, {'error':'Petición o día inválido.'})
                    if not db.execute('SELECT id FROM prayers WHERE id=?', (prayer_id,)).fetchone():
                        return self.respond(404, {'error':'Petición no encontrada.'})
                    removed = db.execute('DELETE FROM prayer_checks WHERE prayer_id=? AND day=?', (prayer_id, day)).rowcount
                    if not removed:
                        db.execute('INSERT INTO prayer_checks(prayer_id,day) VALUES (?,?)', (prayer_id, day))
                        db.execute('UPDATE prayers SET total=total+1 WHERE id=?', (prayer_id,))
                    result = {'marked':not bool(removed)}
                elif self.path == '/api/prayer-reset':
                    db.execute('DELETE FROM prayer_checks')
                    result = {'ok':True}
                elif self.path == '/api/prayer-delete':
                    prayer_id = data.get('id')
                    if type(prayer_id) is not int:
                        return self.respond(400, {'error':'Petición inválida.'})
                    db.execute('DELETE FROM prayers WHERE id=?', (prayer_id,))
                    result = {'ok':True}
                elif self.path == '/api/rename':
                    kind, item_id, name = data.get('kind'), data.get('id'), data.get('name')
                    tables = {'prayer':'prayers', 'goal':'goals', 'goal-item':'goal_items', 'activity':'activities'}
                    if kind not in tables or type(item_id) is not int or not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                        return self.respond(400, {'error':'Revisa el nombre.'})
                    cursor = db.execute(f'UPDATE {tables[kind]} SET name=? WHERE id=?', (name.strip(), item_id))
                    if not cursor.rowcount:
                        return self.respond(404, {'error':'Elemento no encontrado.'})
                    result = {'name':name.strip()}
                elif self.path == '/api/goals':
                    name = data.get('name', '')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
                        return self.respond(400, {'error':'Escribe una meta de hasta 80 caracteres.'})
                    cursor = db.execute('INSERT INTO goals(name) VALUES (?)', (name.strip(),))
                    result = {'id':cursor.lastrowid, 'name':name.strip(), 'items':[]}
                elif self.path == '/api/goal-items':
                    name, goal_id = data.get('name', ''), data.get('goal_id')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or type(goal_id) is not int:
                        return self.respond(400, {'error':'Revisa el nombre de la actividad.'})
                    if not db.execute('SELECT id FROM goals WHERE id=?', (goal_id,)).fetchone():
                        return self.respond(404, {'error':'Meta no encontrada.'})
                    cursor = db.execute('INSERT INTO goal_items(goal_id,name) VALUES (?,?)', (goal_id, name.strip()))
                    result = {'id':cursor.lastrowid, 'goal_id':goal_id, 'name':name.strip(), 'completed':0}
                elif self.path == '/api/goal-toggle':
                    item_id = data.get('id')
                    if type(item_id) is not int:
                        return self.respond(400, {'error':'Actividad inválida.'})
                    cursor = db.execute('UPDATE goal_items SET completed=1-completed WHERE id=?', (item_id,))
                    if not cursor.rowcount:
                        return self.respond(404, {'error':'Actividad no encontrada.'})
                    result = {'ok':True}
                elif self.path == '/api/goal-delete':
                    goal_id = data.get('id')
                    if type(goal_id) is not int:
                        return self.respond(400, {'error':'Meta inválida.'})
                    db.execute('DELETE FROM goals WHERE id=?', (goal_id,))
                    result = {'ok':True}
                elif self.path == '/api/goal-item-delete':
                    item_id = data.get('id')
                    if type(item_id) is not int:
                        return self.respond(400, {'error':'Actividad inválida.'})
                    db.execute('DELETE FROM goal_items WHERE id=?', (item_id,))
                    result = {'ok':True}
                elif self.path == '/api/activities':
                    name = data.get('name', '')
                    category = data.get('category')
                    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80 or category not in ('habit', 'responsibility'):
                        return self.respond(400, {'error':'Revisa el nombre y la categoría.'})
                    cursor = db.execute('INSERT INTO activities(name,category) VALUES (?,?)', (name.strip(), category))
                    result = {'id':cursor.lastrowid, 'name':name.strip(), 'category':category, 'days':[]}
                elif self.path == '/api/toggle':
                    day, activity_id = data.get('day'), data.get('id')
                    if type(day) is not int or not 1 <= day <= 7 or type(activity_id) is not int:
                        return self.respond(400, {'error':'Día o actividad inválidos.'})
                    if not db.execute('SELECT id FROM activities WHERE id=?', (activity_id,)).fetchone():
                        return self.respond(404, {'error':'Actividad no encontrada.'})
                    removed = db.execute('DELETE FROM checks WHERE activity_id=? AND day=?', (activity_id, day)).rowcount
                    if not removed:
                        db.execute('INSERT INTO checks VALUES (?,?)', (activity_id, day))
                    result = {'ok':True}
                elif self.path == '/api/reset':
                    db.execute('DELETE FROM checks')
                    result = {'ok':True}
                elif self.path == '/api/delete':
                    db.execute('DELETE FROM activities WHERE id=?', (data.get('id'),))
                    result = {'ok':True}
                else:
                    return self.respond(404, {'error':'Ruta no encontrada'})
            self.respond(200, result)
        except (ValueError, TypeError, AttributeError):
            self.respond(400, {'error':'Solicitud inválida.'})
        except sqlite3.Error:
            self.respond(500, {'error':'No se pudo guardar. Inténtalo de nuevo.'})

if __name__ == '__main__':
    if os.environ.get('RAILWAY_ENVIRONMENT') and not os.environ.get('APP_PASSWORD'):
        raise SystemExit('Configura APP_PASSWORD antes de publicar la app en Railway.')
    initialize()
    port = int(os.environ.get('PORT', '8000'))
    host = '0.0.0.0' if os.environ.get('PORT') else '127.0.0.1'
    print(f'Ritmo disponible en http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()

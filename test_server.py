import json
import os
import base64
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
import server


class PersistenceTest(unittest.TestCase):
    def test_goals_and_protected_access(self):
        with tempfile.TemporaryDirectory() as folder:
            original_db = server.DB
            original_password = os.environ.get('APP_PASSWORD')
            server.DB = Path(folder) / 'test.sqlite3'
            os.environ['APP_PASSWORD'] = 'test-secret'
            server.initialize()
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{http.server_port}'
            token = base64.b64encode(b'admin:test-secret').decode()
            def request(path, data=None, authorized=True):
                headers = {'Content-Type':'application/json'}
                if authorized:
                    headers['Authorization'] = 'Basic ' + token
                req = urllib.request.Request(url + path,
                    data=None if data is None else json.dumps(data).encode(), headers=headers)
                with urllib.request.urlopen(req) as response:
                    return json.load(response)
            try:
                self.assertEqual(request('/health', authorized=False), {'status':'ok'})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request('/api/goals', authorized=False)
                self.assertEqual(error.exception.code, 401)
                goal = request('/api/goals', {'name':'Leer un libro'})
                item = request('/api/goal-items', {'goal_id':goal['id'], 'name':'Primer capítulo'})
                request('/api/goal-toggle', {'id':item['id']})
                server.initialize()
                self.assertEqual(request('/api/goals')[0]['items'][0]['completed'], 1)
                request('/api/reset', {})
                self.assertEqual(request('/api/goals')[0]['items'][0]['completed'], 1)
                request('/api/goal-item-delete', {'id':item['id']})
                request('/api/goal-delete', {'id':goal['id']})
                self.assertEqual(request('/api/goals'), [])
            finally:
                http.shutdown()
                http.server_close()
                thread.join()
                server.DB = original_db
                if original_password is None:
                    os.environ.pop('APP_PASSWORD', None)
                else:
                    os.environ['APP_PASSWORD'] = original_password

    def test_activity_lifecycle(self):
        with tempfile.TemporaryDirectory() as folder:
            original = server.DB
            server.DB = Path(folder) / 'test.sqlite3'
            server.initialize()
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            def request(path, data=None):
                req = urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/{path}',
                    data=None if data is None else json.dumps(data).encode(),
                    headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req) as response:
                    return json.load(response)
            try:
                item = request('activities', {'name':'Leer', 'category':'habit'})
                for day in range(1, 8):
                    request('toggle', {'id':item['id'], 'day':day})
                self.assertEqual(len(request('activities')[0]['days']), 7)
                server.initialize()
                self.assertEqual(len(request('activities')[0]['days']), 7)
                request('toggle', {'id':item['id'], 'day':2})
                self.assertNotIn(2, request('activities')[0]['days'])
                with self.assertRaises(urllib.error.HTTPError) as error:
                    request('toggle', {'id':item['id'], 'day':8})
                self.assertEqual(error.exception.code, 400)
                request('reset', {})
                self.assertEqual(request('activities')[0]['days'], [])
                self.assertEqual(request('activities')[0]['name'], 'Leer')
                request('toggle', {'id':item['id'], 'day':1})
                request('delete', {'id':item['id']})
                self.assertEqual(request('activities'), [])
                with server.connect() as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM checks').fetchone()[0], 0)
            finally:
                http.shutdown()
                http.server_close()
                thread.join()
                server.DB = original

if __name__ == '__main__':
    unittest.main()

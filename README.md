# Mi rutina

App personal de hábitos y metas. Frontend React/Vite y API Python con SQLite.

## Uso local

Requisitos: Node.js 20.19+ y Python 3.10+.

```powershell
npm ci
npm run build
python server.py
```

Abre `http://127.0.0.1:8000`. Los datos se guardan en `data/habits.sqlite3`.
Para desarrollo, ejecuta `python server.py` y `npm run dev` en terminales separadas.

## Despliegue en Railway

1. Sube este proyecto a un repositorio privado de GitHub. El archivo `.gitignore` excluye la base de datos local.
2. En Railway, crea un proyecto y añade un servicio desde ese repositorio. Railway detecta el `Dockerfile` y construye el frontend junto con el servidor.
3. En **Variables**, define `APP_PASSWORD` con una contraseña larga. La app exigirá el usuario `admin` y esa contraseña al abrirla. El servidor no arranca en Railway si falta la variable.
4. Añade un **Volume** al servicio con ruta de montaje `/app/data`. Ahí se creará SQLite y se conservarán los datos entre despliegues. Mantén una sola réplica del servicio.
5. En **Settings → Networking**, selecciona **Generate Domain**. Railway asigna `PORT` automáticamente; el servidor lo usa. `railway.json` configura `/health` como comprobación de salud.

Si quieres llevar los datos locales a Railway, copia `data/habits.sqlite3` al volumen como `/app/data/habits.sqlite3` antes del primer arranque con datos, o detén el servicio antes de reemplazar la base. Usa las herramientas de archivos del volumen de Railway. Haz una copia de seguridad antes de reemplazarla.

La aplicación es para un solo usuario: todas las personas que conozcan la contraseña comparten los mismos datos. La autenticación básica usa la conexión HTTPS del dominio de Railway.

# Liiot HQ en un solo contenedor: compila la interfaz con Node y la sirve desde FastAPI.
# Solo para uso local (ver docker-compose.yml). Los datos viven en el volumen /data.

FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HQ_DB_PATH=/data/hq.db \
    HQ_STATIC_DIR=/app/static \
    HQ_TZ=America/Bogota
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=web /web/dist ./static
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

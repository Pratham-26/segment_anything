# Annotation service: vision-LLM labeling + review UI (CPU is enough).
FROM python:3.11-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/
# /app so the editable install records /app/src, matching the final stage
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python '-e .'

# Build the review UI (Vite + React + shadcn/ui) → web/dist
FROM node:22-slim AS ui
WORKDIR /ui
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM python:3.11-slim
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
COPY --from=build /opt/venv /opt/venv
# editable install points at /app/src; server serves /app/web/dist
WORKDIR /app
COPY src ./src
COPY --from=ui /ui/dist ./web/dist

# projects dir is bind-mounted at /data
WORKDIR /data
EXPOSE 8000
ENTRYPOINT ["sam"]
CMD ["review", "--host", "0.0.0.0", "--port", "8000"]

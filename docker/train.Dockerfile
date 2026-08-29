# Training job container, independent of the annotation image. GPU comes from
# nvidia-container-toolkit (compose GPU reservation); CUDA userland ships inside
# pip torch/nvidia-*-cu12 wheels, so the base stays slim (the pytorch/pytorch
# conda base costs ~2 GB more).
# Installs ONLY the training stack (rfdetr -> torch, supervision, ...) plus the
# sam package with --no-deps; the labeling/LLM stack (litellm, fastapi, PIL)
# lives in the annotation image.
FROM python:3.11-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/
# /app so the editable install records /app/src, matching the final stage
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv && \
    uv pip install --python /opt/venv/bin/python rfdetr pycocotools pyyaml && \
    uv pip install --no-deps --python /opt/venv/bin/python '-e .'

FROM python:3.11-slim
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
COPY --from=build /opt/venv /opt/venv
# editable install points at /app/src
WORKDIR /app
COPY src ./src

# projects dir is bind-mounted at /data; run one-off jobs, e.g.
#   docker compose run --rm train train --project /data/myproj
WORKDIR /data
ENTRYPOINT ["sam"]

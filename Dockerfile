FROM python:3.11-slim
# GPU variant: change base to e.g. pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime
# docker build --build-arg BASE=pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime -t sam:gpu .

WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
COPY web ./web
RUN pip install --no-cache-dir -e . \
    && pip cache purge

# project data lives on host; bind-mount it to /data
WORKDIR /data
EXPOSE 8000
CMD ["sam", "review", "--host", "0.0.0.0", "--port", "8000"]

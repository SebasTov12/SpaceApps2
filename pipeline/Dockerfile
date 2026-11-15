FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace
COPY pipeline/requirements.txt /tmp/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r /tmp/requirements.txt \
    && useradd --system --uid 10001 --create-home appuser
COPY pipeline ./pipeline
COPY scripts ./scripts
USER appuser
ENTRYPOINT ["python"]
CMD ["scripts/filter_nisar_colombia.py"]

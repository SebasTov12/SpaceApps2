FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace
COPY pipeline/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt \
    && useradd --system --uid 10001 --create-home appuser
COPY pipeline ./pipeline
COPY scripts ./scripts
USER appuser
ENTRYPOINT ["python"]
CMD ["scripts/filter_nisar_colombia.py"]

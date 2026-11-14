FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /opt/nisar-change
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY __init__.py model.py data.py train.py ./nisar_change/
ENV PYTHONPATH=/opt/nisar-change

WORKDIR /workspace
ENTRYPOINT ["python", "-m", "nisar_change.train"]

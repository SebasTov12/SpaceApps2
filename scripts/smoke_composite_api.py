"""End-to-end deployment smoke check; prints only model output summaries."""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path


patch_path = Path("/tmp/smoke-neiva.npz")
body = patch_path.read_bytes()
url = "http://127.0.0.1:8000/api/v1/analysis?track_id=047-A-003&municipality=NEIVA&department=HUILA"
request = urllib.request.Request(
    url,
    data=body,
    headers={
        "Authorization": f"Bearer {os.environ['SAROS_PREDICTION_TOKEN']}",
        "Content-Type": "application/octet-stream",
    },
    method="POST",
)
with urllib.request.urlopen(request, timeout=120) as response:
    result = json.loads(response.read())
print(json.dumps({
    "status": "ok",
    "id": result.get("id"),
    "model_version": result.get("model_version"),
    "priority": result.get("priority"),
    "priority_score": result.get("priority_score"),
    "changed_fraction": result.get("changed_fraction"),
    "estimated_affected_families": result.get("estimated_historical_impacts", {}).get("affected_families"),
}, ensure_ascii=False))

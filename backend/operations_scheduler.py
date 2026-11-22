"""Small persistent worker that refreshes the aggregate SAROS report daily."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


API_URL = os.getenv("SAROS_API_URL", "http://spaceapps2-api:8000").rstrip("/")
TOKEN = os.getenv("SAROS_PREDICTION_TOKEN", "")
INTERVAL = max(3600, int(os.getenv("SAROS_REPORT_INTERVAL_SECONDS", "86400")))
RETRY = 300


def refresh() -> bool:
    if not TOKEN:
        print("SAROS_PREDICTION_TOKEN is not configured; report refresh skipped.", flush=True)
        return False
    request = urllib.request.Request(
        f"{API_URL}/api/v1/operations/refresh",
        data=b"{}",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=150) as response:
            result = json.loads(response.read().decode("utf-8"))
            print(json.dumps({
                "status": "refreshed",
                "snapshot_saved_at": result.get("snapshot_saved_at"),
                "real_los_observations": result.get("nisar", {}).get("real_los_observations"),
                "forecast_runs": result.get("nisar", {}).get("forecast_runs"),
            }), flush=True)
        return True
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        # Error bodies may contain deployment details; log the exception class only.
        print(f"Report refresh failed ({type(error).__name__}); retrying in {RETRY} seconds.", flush=True)
        return False


while True:
    time.sleep(INTERVAL if refresh() else RETRY)

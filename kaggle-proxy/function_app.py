import io
import os
import zipfile

import azure.functions as func
import requests

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

DATASET = "dataenthusiast007/2026-27-premier-league-season"
ALLOWED_FILES = {
    "fixtures.csv",
    "league_table.csv",
    "managers_and_club_info.csv",
    "results.csv",
    "teams_and_stadiums.csv",
}


@app.route(route="files/{fileName}", methods=["GET"])
def get_file(req: func.HttpRequest) -> func.HttpResponse:
    file_name = req.route_params.get("fileName")
    if file_name not in ALLOWED_FILES:
        return func.HttpResponse("Unknown file.", status_code=404)

    # App setting, e.g. "Bearer KGAT_..." or "Basic <base64 user:key>"
    kaggle_auth = os.environ["KAGGLE_AUTH"]
    url = f"https://www.kaggle.com/api/v1/datasets/download/{DATASET}/{file_name}"

    # requests follows the Kaggle -> signed-storage redirect server-side
    resp = requests.get(url, headers={"Authorization": kaggle_auth}, timeout=60)
    if resp.status_code != 200:
        return func.HttpResponse(
            f"Kaggle returned {resp.status_code}: {resp.text[:300]}",
            status_code=502,
        )

    content = resp.content
    # Kaggle sometimes serves a single file zipped; unwrap it if so
    if content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            content = zf.read(zf.namelist()[0])

    return func.HttpResponse(
        content.decode("utf-8-sig"),
        status_code=200,
        mimetype="text/csv",
    )

import io
import sys
import types
import zipfile
from pathlib import Path
from unittest.mock import Mock

# The Function App imports azure.functions at load time. Stub that package so
# these tests exercise get_file without the Functions host.
azure = types.ModuleType("azure")
functions = types.ModuleType("azure.functions")


class HttpResponse:
    def __init__(self, body="", status_code=200, mimetype=None):
        self.body = body
        self.status_code = status_code
        self.mimetype = mimetype


class AuthLevel:
    FUNCTION = "function"


class FunctionApp:
    def __init__(self, http_auth_level=None):
        self.http_auth_level = http_auth_level

    def route(self, route, methods=None):
        def decorator(fn):
            return fn

        return decorator


functions.HttpResponse = HttpResponse
functions.HttpRequest = object
functions.AuthLevel = AuthLevel
functions.FunctionApp = FunctionApp
azure.functions = functions
sys.modules["azure"] = azure
sys.modules["azure.functions"] = functions

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "kaggle-proxy"))
import function_app  # noqa: E402


class Request:
    def __init__(self, file_name):
        self.route_params = {"fileName": file_name}


def response(status_code, content, text=""):
    result = Mock()
    result.status_code = status_code
    result.content = content
    result.text = text
    return result


def test_unknown_file_is_rejected_before_download(monkeypatch):
    monkeypatch.delenv("KAGGLE_AUTH", raising=False)

    def fail_download(*args, **kwargs):
        raise AssertionError("unknown files must not be downloaded")

    monkeypatch.setattr(function_app.requests, "get", fail_download)

    result = function_app.get_file(Request("secrets.csv"))

    assert result.status_code == 404
    assert result.body == "Unknown file."


def test_allowed_file_returns_csv(monkeypatch):
    monkeypatch.setenv("KAGGLE_AUTH", "Bearer test-token")
    payload = "\ufeffmatchweek,home\n1,ARS\n"
    download = Mock(return_value=response(200, payload.encode("utf-8")))
    monkeypatch.setattr(function_app.requests, "get", download)

    result = function_app.get_file(Request("results.csv"))

    assert result.status_code == 200
    assert result.mimetype == "text/csv"
    assert result.body == "matchweek,home\n1,ARS\n"
    download.assert_called_once()
    assert download.call_args.kwargs["headers"]["Authorization"] == "Bearer test-token"
    assert download.call_args.args[0].endswith("/results.csv")


def test_zipped_download_is_unwrapped(monkeypatch):
    monkeypatch.setenv("KAGGLE_AUTH", "Bearer test-token")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("fixtures.csv", "matchweek,home\n1,CHE\n")
    monkeypatch.setattr(
        function_app.requests,
        "get",
        Mock(return_value=response(200, archive.getvalue())),
    )

    result = function_app.get_file(Request("fixtures.csv"))

    assert result.status_code == 200
    assert result.body == "matchweek,home\n1,CHE\n"


def test_kaggle_error_becomes_502(monkeypatch):
    monkeypatch.setenv("KAGGLE_AUTH", "Bearer test-token")
    monkeypatch.setattr(
        function_app.requests,
        "get",
        Mock(return_value=response(403, b"", "forbidden")),
    )

    result = function_app.get_file(Request("league_table.csv"))

    assert result.status_code == 502
    assert "403" in result.body
    assert "forbidden" in result.body


def test_only_the_five_dataset_files_are_allowed():
    assert function_app.ALLOWED_FILES == {
        "fixtures.csv",
        "league_table.csv",
        "managers_and_club_info.csv",
        "results.csv",
        "teams_and_stadiums.csv",
    }

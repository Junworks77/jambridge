"""Local-only project API. Heavy models run in a cancellable child process."""

import hashlib
import hmac
import json
import os
import secrets
import shutil
import subprocess
import sys
import threading
import time
import uuid
import wave
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from .schemas import Edits

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("JAMBRIDGE_DATA", ROOT / "data")).resolve()
DATA.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_app):
    yield
    for pid in list(jobs):
        cancel(pid)


app = FastAPI(title="JamBridge local analysis", lifespan=lifespan)
lock = threading.RLock()
jobs: dict[str, subprocess.Popen] = {}
logs = {}
CHANNELS = {"original", "vocals", "drums", "bass", "guitar", "other"}

# Single local account, stored as account.json; login tokens live in memory only.
ACCOUNT = DATA / "account.json"
SESSION_TTL = 30 * 24 * 3600
sessions: dict[str, float] = {}


@app.middleware("http")
async def gate(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin:
        try:
            allowed = urlsplit(origin).hostname in ("localhost", "127.0.0.1", "::1")
        except ValueError:
            allowed = False
        if not allowed:
            return JSONResponse(
                status_code=403,
                content={"detail": "로컬 앱에서만 분석 서버를 사용할 수 있습니다."},
            )
    if request.url.path.startswith("/api/projects") and not authed(request):
        return JSONResponse(
            status_code=401,
            content={"detail": "타브 생성을 사용하려면 로그인해 주세요."},
        )
    return await call_next(request)


def folder(pid: str) -> Path:
    try:
        if str(uuid.UUID(pid)) != pid:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "프로젝트를 찾지 못했습니다.")
    path = DATA / pid
    if not (path / "project.json").exists():
        raise HTTPException(404, "프로젝트를 찾지 못했습니다.")
    return path


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(value, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    tmp.replace(path)


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
    ).hex()


def account() -> dict | None:
    if not ACCOUNT.exists():
        return None
    try:
        data = read(ACCOUNT)
    except (ValueError, OSError):
        return None
    return data if isinstance(data, dict) and data.get("username") else None


def prune_sessions() -> None:
    now = time.time()
    for token in [t for t, expiry in sessions.items() if expiry <= now]:
        sessions.pop(token, None)


def issue_session() -> str:
    prune_sessions()
    token = secrets.token_urlsafe(32)
    sessions[token] = time.time() + SESSION_TTL
    return token


def bearer_token(request: Request) -> str | None:
    scheme, _, value = request.headers.get("authorization", "").partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def authed(request: Request) -> bool:
    token = bearer_token(request)
    if not token:
        return False
    prune_sessions()
    if token not in sessions:
        return False
    sessions[token] = time.time() + SESSION_TTL  # sliding expiry
    return True


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=4, max_length=200)


@app.get("/api/auth")
def auth_state(request: Request):
    return {"registered": account() is not None, "authed": authed(request)}


@app.post("/api/auth/register")
def register(body: Credentials):
    if account() is not None:
        raise HTTPException(409, "이미 등록된 계정이 있습니다. 로그인해 주세요.")
    username = body.username.strip()
    if len(username) < 3:
        raise HTTPException(422, "아이디는 공백을 제외하고 3자 이상이어야 합니다.")
    salt = secrets.token_hex(16)
    write(
        ACCOUNT,
        {
            "version": 1,
            "username": username,
            "salt": salt,
            "hash": hash_password(body.password, salt),
        },
    )
    return {"token": issue_session(), "username": username}


@app.post("/api/auth/login")
def login(body: Credentials):
    current = account()
    if current is None:
        raise HTTPException(404, "등록된 계정이 없습니다. 먼저 계정을 만들어 주세요.")
    expected = hash_password(body.password, current.get("salt", ""))
    if not hmac.compare_digest(
        current.get("username", ""), body.username.strip()
    ) or not hmac.compare_digest(current.get("hash", ""), expected):
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")
    return {"token": issue_session(), "username": current["username"]}


@app.post("/api/auth/logout")
def logout(request: Request):
    token = bearer_token(request)
    if token:
        sessions.pop(token, None)
    return {"ok": True}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "python": sys.version.split()[0],
    }


@app.get("/api/projects")
def projects():
    result = []
    for path in DATA.glob("*/project.json"):
        try:
            p = read(path)
            result.append({"id": p["id"], "name": p["name"], "duration": p["duration"]})
        except (ValueError, OSError, KeyError):
            continue
    return result


@app.post("/api/projects", status_code=201)
def upload(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".mp3"):
        raise HTTPException(400, "MP3 파일을 선택해 주세요.")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise HTTPException(
            503, "FFmpeg와 ffprobe를 설치하고 서버를 다시 실행해 주세요."
        )
    pid = str(uuid.uuid4())
    path = DATA / pid
    path.mkdir()
    try:
        total = 0
        with (path / "upload.mp3").open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise HTTPException(413, "최대 100MB까지 업로드할 수 있습니다.")
                out.write(chunk)
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration:stream=codec_name",
                "-select_streams",
                "a:0",
                "-of",
                "json",
                str(path / "upload.mp3"),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        info = json.loads(probe.stdout)
        if not info.get("streams") or info["streams"][0].get("codec_name") != "mp3":
            raise HTTPException(400, "MP3 형식의 음원만 지원합니다.")
        duration = float(info["format"]["duration"])
        if not 0 < duration <= 600:
            raise HTTPException(400, "0초보다 길고 10분 이하인 곡을 선택해 주세요.")
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                str(path / "upload.mp3"),
                "-t",
                "600",
                "-ar",
                "44100",
                "-ac",
                "2",
                str(path / "original.wav"),
            ],
            capture_output=True,
            check=True,
            timeout=120,
        )
        with wave.open(str(path / "original.wav"), "rb") as decoded:
            duration = decoded.getnframes() / decoded.getframerate()
        if duration <= 0:
            raise HTTPException(400, "재생할 오디오가 없습니다.")
        project = {
            "version": 1,
            "id": pid,
            "name": Path(file.filename).name,
            "duration": duration,
            "revision": 0,
            "analysis": None,
            "notes": [],
            "settings": {
                "tuning": [64, 59, 55, 50, 45, 40],
                "capo": 0,
                "minFret": 0,
                "maxFret": 24,
            },
            "mix": {},
            "position": 0,
        }
        write(path / "project.json", project)
        write(
            path / "status.json", {"state": "idle", "stage": "분석 준비", "progress": 0}
        )
        return project
    except HTTPException:
        shutil.rmtree(path)
        raise
    except (ValueError, KeyError, OSError, wave.Error, subprocess.SubprocessError):
        shutil.rmtree(path)
        raise HTTPException(
            400, "MP3를 읽지 못했습니다. 파일 손상과 FFmpeg 설치를 확인해 주세요."
        )
    finally:
        file.file.close()


@app.get("/api/projects/{pid}")
def project(pid: str):
    path = folder(pid)
    p = read(path / "project.json")
    # User edits live separately: a model worker can never overwrite them.
    if (path / "edits.json").exists():
        edits = read(path / "edits.json")
        if edits.get("analysis") is None:
            edits.pop("analysis", None)
            edits.pop("notes", None)
        p.update(edits)
    return p


@app.put("/api/projects/{pid}")
def save(pid: str, edits: Edits):
    path = folder(pid)
    duration = read(path / "project.json")["duration"]
    if any(n.end > duration + 0.001 for n in edits.notes) or (
        edits.analysis
        and (
            edits.analysis.firstDownbeat >= duration
            or any(s.end > duration + 0.001 for s in edits.analysis.sections)
        )
    ):
        raise HTTPException(422, "음과 구간은 곡의 길이 안에 있어야 합니다.")
    with lock:
        if pid in jobs:
            raise HTTPException(409, "분석이 끝난 후 수정해 주세요.")
        write(path / "edits.json", edits.model_dump())
    return {"ok": True}


@app.get("/api/projects/{pid}/status")
def status(pid: str):
    path = folder(pid)
    state = read(path / "status.json")
    with lock:
        running = pid in jobs
    if state["state"] == "running" and not running:
        state = {
            "state": "error",
            "stage": "서버가 재시작되었습니다. 분석을 다시 시작해 주세요.",
            "progress": 0,
        }
    return state


def monitor(pid, child, log):
    code = child.wait()
    with lock:
        log.close()
        if jobs.get(pid) is not child:
            return
        logs.pop(pid, None)
        jobs.pop(pid, None)
        path = folder(pid)
        state = read(path / "status.json")
        if code and state["state"] == "running":
            write(
                path / "status.json",
                {
                    "state": "error",
                    "stage": "분석 프로세스가 종료되었습니다. 메모리와 analysis.log를 확인하고 재시도해 주세요.",
                    "progress": 0,
                },
            )


@app.post("/api/projects/{pid}/analyze", status_code=202)
def analyze(pid: str):
    path = folder(pid)
    with lock:
        if jobs:
            raise HTTPException(
                409, "다른 분석이 실행 중입니다. 완료하거나 취소한 후 시작해 주세요."
            )
        # Successful results are reused; edits are never discarded on retry.
        if read(path / "status.json")["state"] == "done":
            return {"ok": True}
        write(
            path / "status.json",
            {
                "state": "running",
                "stage": "모델 준비 · 최초 실행 시 다운로드",
                "progress": 1,
            },
        )
        log = (path / "analysis.log").open("a", encoding="utf-8")
        child = subprocess.Popen(
            [sys.executable, str(ROOT / "worker.py"), str(path)], stdout=log, stderr=log
        )
        jobs[pid] = child
        logs[pid] = log
        threading.Thread(target=monitor, args=(pid, child, log), daemon=True).start()
    return {"ok": True}


@app.post("/api/projects/{pid}/cancel")
def cancel(pid: str):
    path = folder(pid)
    with lock:
        child = jobs.pop(pid, None)
        if child:
            child.terminate()
            child.wait(timeout=15)
            log = logs.pop(pid, None)
            if log:
                log.close()
            write(
                path / "status.json",
                {
                    "state": "cancelled",
                    "stage": "분석 취소됨 · 완료된 단계는 재사용합니다",
                    "progress": 0,
                },
            )
    return {"ok": True}


@app.delete("/api/projects/{pid}")
def delete(pid: str):
    path = folder(pid)
    cancel(pid)
    with lock:
        shutil.rmtree(path)
    return {"ok": True}


@app.get("/api/projects/{pid}/audio/{channel}/{index}")
def audio(pid: str, channel: str, index: int):
    path = folder(pid)
    if (
        channel not in CHANNELS
        or index < 0
        or index * 15 >= read(path / "project.json")["duration"]
    ):
        raise HTTPException(404, "오디오 구간을 찾지 못했습니다.")
    source = path / f"{channel}.wav"
    if not source.exists():
        raise HTTPException(409, "아직 준비되지 않은 stem입니다.")
    cache = path / "chunks"
    cache.mkdir(exist_ok=True)
    target = cache / f"{channel}-{index}.wav"
    with lock:
        if not target.exists():
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-v",
                        "error",
                        "-y",
                        "-ss",
                        str(index * 15),
                        "-i",
                        str(source),
                        "-t",
                        "15",
                        "-ar",
                        "22050",
                        "-ac",
                        "2",
                        str(target),
                    ],
                    capture_output=True,
                    check=True,
                    timeout=30,
                )
            except subprocess.SubprocessError:
                target.unlink(missing_ok=True)
                raise HTTPException(500, "오디오 구간을 준비하지 못했습니다.")
    return FileResponse(target, media_type="audio/wav")

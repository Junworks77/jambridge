"""Integration smoke check using a generated, original eight-second fixture.

Run from the repository: python server/check_pipeline.py [--models]
Model mode downloads weights and actually runs separation/transcription on CPU.
All generated projects are isolated under .tools/check-data.
"""

import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ["JAMBRIDGE_DATA"] = str(ROOT / ".tools" / "check-data")
from fastapi.testclient import TestClient  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from server.app import app  # noqa: E402


def check():
    client = TestClient(app)
    assert client.get("/api/health").json()["ffmpeg"]

    # Tab APIs require the local account login.
    assert client.get("/api/projects").status_code == 401
    creds = {"username": "checkuser", "password": "checkpass"}
    auth = client.post("/api/auth/register", json=creds)
    if auth.status_code == 409:
        auth = client.post("/api/auth/login", json=creds)
    assert auth.status_code == 200, auth.text
    assert (
        client.post("/api/auth/login", json={**creds, "password": "wrong"}).status_code
        == 401
    )
    client.headers["Authorization"] = f"Bearer {auth.json()['token']}"
    assert client.get("/api/auth").json() == {"registered": True, "authed": True}

    assert (
        client.post(
            "/api/projects", headers={"Origin": "https://unrelated.example"}
        ).status_code
        == 403
    )
    assert client.get("/api/projects/not-a-uuid").status_code == 404
    assert (
        client.post(
            "/api/projects", files={"file": ("bad.mp3", b"not music", "audio/mpeg")}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/projects", files={"file": ("bad.wav", b"", "audio/wav")}
        ).status_code
        == 400
    )
    sr = 44100
    waveform = np.zeros(sr * 8, dtype=np.float32)
    for i in range(16):
        start = int(i * 0.5 * sr)
        t = np.arange(int(0.45 * sr)) / sr
        midi = [52, 55, 59, 64][i % 4]
        frequency = 440 * 2 ** ((midi - 69) / 12)
        pluck = (
            sum(np.sin(2 * np.pi * frequency * h * t) / h for h in range(1, 6))
            * np.exp(-t * 8)
            * 0.12
        )
        waveform[start : start + len(t)] += pluck
        hit = np.arange(int(0.06 * sr)) / sr
        waveform[start : start + len(hit)] += (
            np.sin(2 * np.pi * 100 * hit)
            * np.exp(-hit * 80)
            * (0.35 if i % 4 == 0 else 0.18)
        )
    wav = io.BytesIO()
    sf.write(wav, waveform, sr, format="WAV")
    encoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "mp3", "pipe:1"],
        input=wav.getvalue(),
        capture_output=True,
        check=True,
    ).stdout
    uploaded = client.post(
        "/api/projects", files={"file": ("JamBridge-check.mp3", encoded, "audio/mpeg")}
    )
    assert uploaded.status_code == 201, uploaded.text
    p = uploaded.json()
    pid = p["id"]
    print(f"fixture project {pid}", flush=True)
    try:
        chunk = client.get(f"/api/projects/{pid}/audio/original/0")
        assert chunk.status_code == 200 and chunk.content[:4] == b"RIFF"
        assert client.get(f"/api/projects/{pid}/audio/original/100").status_code == 404
        assert client.get(f"/api/projects/{pid}/audio/guitar/0").status_code == 409
        assert client.put(f"/api/projects/{pid}", json=p).status_code == 200
        bad = {**p, "settings": {**p["settings"], "tuning": [40]}}
        assert client.put(f"/api/projects/{pid}", json=bad).status_code == 422
        assert client.post(f"/api/projects/{pid}/analyze").status_code == 202
        assert client.post(f"/api/projects/{pid}/analyze").status_code == 409
        assert client.post(f"/api/projects/{pid}/cancel").status_code == 200
        assert client.get(f"/api/projects/{pid}/status").json()["state"] == "cancelled"
        if "--models" in sys.argv:
            assert client.post(f"/api/projects/{pid}/analyze").status_code == 202
            deadline = time.monotonic() + 900
            previous = None
            while time.monotonic() < deadline:
                status = client.get(f"/api/projects/{pid}/status").json()
                if status != previous:
                    print(json.dumps(status, ensure_ascii=True), flush=True)
                    previous = status
                if status["state"] in ("done", "error"):
                    break
                time.sleep(2)
            assert status["state"] == "done", status
            result = client.get(f"/api/projects/{pid}").json()
            assert result["analysis"] is not None, (
                "Pre-analysis save must not mask model results"
            )
            assert len(result["analysis"]["sections"]) > 0
            assert all(
                n["part"] in ("vocals", "drums", "bass", "guitar", "other")
                for n in result["notes"]
            ), "Every transcribed note carries its source part"
            for channel in ("vocals", "drums", "bass", "guitar", "other"):
                response = client.get(f"/api/projects/{pid}/audio/{channel}/0")
                assert response.status_code == 200, response.text
                audio, actual_sr = sf.read(io.BytesIO(response.content))
                assert actual_sr == 22050 and abs(len(audio) / actual_sr - 8) < 0.2
            result["mix"] = {"guitar": {"volume": 42, "mute": False, "solo": True}}
            saved = client.put(f"/api/projects/{pid}", json=result)
            assert saved.status_code == 200, saved.text
            assert (
                client.get(f"/api/projects/{pid}").json()["mix"]["guitar"]["volume"]
                == 42
            )
            print(
                f"REAL MODEL PASS: bpm={result['analysis']['bpm']}, key={result['analysis']['key']}, notes={len(result['notes'])}",
                flush=True,
            )
        print(
            "PASS: upload, corrupt MP3, original chunks, bounds, validation, cancellation, retry",
            flush=True,
        )
    finally:
        if (
            sys.exc_info()[0]
            and (ROOT / ".tools" / "check-data" / pid / "analysis.log").exists()
        ):
            print(
                (ROOT / ".tools" / "check-data" / pid / "analysis.log").read_text(
                    encoding="utf-8", errors="replace"
                )[-6000:],
                flush=True,
            )
        client.delete(f"/api/projects/{pid}")
        assert client.get(f"/api/projects/{pid}").status_code == 404


if __name__ == "__main__":
    check()

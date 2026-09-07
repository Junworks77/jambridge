"""CPU/CUDA separation, conservative song analysis, and polyphonic transcription."""

import json
import sys
from pathlib import Path

path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None


def write(name, data):
    target = path / name
    tmp = target.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    tmp.replace(target)


def status(stage, progress, state="running"):
    write("status.json", {"state": state, "stage": stage, "progress": progress})


def ensure_pkg_resources():
    """demucs/basic-pitch still import the setuptools-provided ``pkg_resources``.

    Newer venvs and the portable runtime ship without it, and setuptools >= 81
    dropped it, so install a setuptools that still bundles ``pkg_resources``
    into the running interpreter before the heavy imports.
    """
    try:
        import pkg_resources  # noqa: F401

        return
    except ModuleNotFoundError:
        pass
    import importlib
    import subprocess

    status("의존성 준비 · setuptools 설치", 5)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "--disable-pip-version-check",
            "setuptools>=70,<81",
        ],
        check=True,
    )
    importlib.invalidate_caches()
    import pkg_resources  # noqa: F401


def run():
    ensure_pkg_resources()

    import numpy as np
    import soundfile as sf
    import librosa
    import torch

    torch.hub.set_dir(str(path.parent / ".models"))

    project = json.loads((path / "project.json").read_text(encoding="utf-8"))
    if not (path / "separated.json").exists():
        status("stem 분리 · 모델 최초 다운로드와 CPU 처리는 시간이 걸립니다", 10)
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        model = get_model("htdemucs_6s")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device).eval()
        wav, sr = sf.read(path / "original.wav", dtype="float32", always_2d=True)
        audio = torch.from_numpy(wav.T.copy())
        ref = audio.mean(0)
        std = ref.std().clamp(min=1e-6)
        normalized = (audio - ref.mean()) / std
        with torch.no_grad():
            sources = (
                apply_model(
                    model,
                    normalized[None],
                    device=device,
                    shifts=1,
                    split=True,
                    overlap=0.25,
                    progress=True,
                )[0].cpu()
                * std
                + ref.mean()
            )
        for name in ("vocals", "drums", "bass", "guitar"):
            sf.write(
                path / f"{name}.wav",
                sources[model.sources.index(name)].numpy().T,
                sr,
                subtype="FLOAT",
            )
        other = (
            sources[model.sources.index("piano")]
            + sources[model.sources.index("other")]
        )
        sf.write(path / "other.wav", other.numpy().T, sr, subtype="FLOAT")
        write("separated.json", {"model": "htdemucs_6s", "device": device})
        del model, audio, sources
        if device == "cuda":
            torch.cuda.empty_cache()

    if not (path / "analysis.json").exists():
        status("곡 구간 · BPM · Key · 박자 추정", 55)
        y, sr = librosa.load(path / "original.wav", sr=22050)
        drums, _ = librosa.load(path / "drums.wav", sr=sr)
        envelope = librosa.onset.onset_strength(y=drums, sr=sr)
        tempo, frames = librosa.beat.beat_track(
            onset_envelope=envelope, sr=sr, trim=False
        )
        beats = librosa.frames_to_time(frames, sr=sr).tolist()
        bpm = float(np.asarray(tempo).reshape(-1)[0])
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        profile = chroma.mean(axis=1)
        major = np.array(
            [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
        )
        minor = np.array(
            [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
        )
        keys = []
        if np.std(profile) > 1e-6:
            for mode, template in (("major", major), ("minor", minor)):
                for root in range(12):
                    keys.append(
                        {
                            "root": root,
                            "mode": mode,
                            "score": float(
                                np.corrcoef(profile, np.roll(template, root))[0, 1]
                            ),
                        }
                    )
        keys.sort(key=lambda k: -k["score"])
        # Half-beat accent periodicity: a heuristic, not a trained meter classifier.
        meter_scores = []
        if bpm > 0 and len(beats) >= 8:
            step = 30 / bpm
            times = np.arange(beats[0], len(y) / sr, step)
            indices = np.clip(
                librosa.time_to_frames(times, sr=sr), 0, len(envelope) - 1
            )
            accents = envelope[indices]
            for meter, period in (
                ("3/4", 6),
                ("4/4", 8),
                ("5/8", 5),
                ("7/8", 7),
                ("12/8", 12),
            ):
                if len(accents) > period * 3 and np.std(accents) > 1e-6:
                    correlation = float(
                        np.corrcoef(accents[:-period], accents[period:])[0, 1]
                    )
                    if np.isfinite(correlation):
                        meter_scores.append({"meter": meter, "score": correlation})
        meter_scores.sort(key=lambda m: -m["score"])
        # Compare two-second chroma/energy blocks; label repeated sections neutrally.
        duration = project["duration"]
        block = max(1, int(2 * sr / 512))
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=8)
        mfcc = (mfcc - mfcc.mean(axis=1, keepdims=True)) / np.maximum(
            mfcc.std(axis=1, keepdims=True), 1e-6
        )
        energy = librosa.feature.rms(y=y)
        energy = energy / max(float(energy.max()), 1e-6)
        combined = np.vstack([chroma, mfcc * 0.15, energy])
        features = np.array(
            [
                combined[:, i : i + block].mean(axis=1)
                for i in range(0, combined.shape[1], block)
            ]
        )
        novelty = np.linalg.norm(np.diff(features, axis=0), axis=1)
        threshold = float(np.mean(novelty) + np.std(novelty)) if len(novelty) else 1
        boundaries = [0.0]
        for i, score in enumerate(novelty):
            t = (i + 1) * 2.0
            if score > threshold and t - boundaries[-1] >= 8 and duration - t >= 4:
                boundaries.append(t)
        boundaries.append(duration)
        sections, templates = [], []
        for start, end in zip(boundaries, boundaries[1:]):
            feature = features[
                int(start / 2) : max(int(start / 2) + 1, int(end / 2))
            ].mean(axis=0)
            label = next(
                (
                    i
                    for i, f in enumerate(templates)
                    if np.dot(f, feature)
                    / max(np.linalg.norm(f) * np.linalg.norm(feature), 1e-6)
                    > 0.96
                ),
                len(templates),
            )
            if label == len(templates):
                templates.append(feature)
            sections.append(
                {
                    "id": str(len(sections)),
                    "name": f"구간 {chr(65 + label % 26)}",
                    "start": start,
                    "end": end,
                }
            )
        analysis = {
            "bpm": round(bpm, 2) if bpm > 0 else None,
            "beats": beats,
            "key": keys[0] if keys else None,
            "keyCandidates": keys[:3],
            "meter": meter_scores[0]["meter"] if meter_scores else None,
            "meterCandidates": meter_scores,
            "firstDownbeat": beats[0] if beats else 0,
            "sections": sections,
            "reviewRequired": True,
            "timingEdited": False,
        }
        write("analysis.json", analysis)

    if not (path / "notes.json").exists():
        from basic_pitch.inference import predict
        import basic_pitch

        model_path = (
            Path(basic_pitch.__file__).parent
            / "saved_models"
            / "icassp_2022"
            / "nmp.onnx"
        )

        def transcribe(part):
            source = path / f"{part}.wav"
            if not source.exists():
                return []
            _, _, events = predict(str(source), model_or_model_path=model_path)
            stem_wav, stem_sr = librosa.load(source, sr=22050)
            attacks = librosa.onset.onset_strength(y=stem_wav, sr=stem_sr)
            attacks = attacks / max(float(np.max(attacks)), 1e-6)
            found = []
            for event in events:
                start, end, midi, amplitude, bends = event
                if float(start) >= project["duration"] or float(end) <= max(
                    0, float(start)
                ):
                    continue
                curve = [float(x) / 3 for x in bends] if bends is not None else []
                technique = "none"
                amount = 0.0
                if len(curve) > 4:
                    excursion = max(curve) - min(curve)
                    crossings = np.count_nonzero(np.diff(np.sign(np.diff(curve))))
                    if excursion >= 0.5 and abs(curve[-1] - curve[0]) >= 0.4:
                        technique, amount = (
                            "bend",
                            min(4, round(max(abs(x) for x in curve) * 2) / 2),
                        )
                    elif 0.15 < excursion < 1.5 and crossings >= 4:
                        technique = "vibrato"
                frame = int(librosa.time_to_frames(float(start), sr=stem_sr))
                attack = (
                    float(
                        np.max(
                            attacks[max(0, frame - 1) : min(len(attacks), frame + 3)]
                        )
                    )
                    if frame < len(attacks)
                    else 0
                )
                found.append(
                    {
                        "start": float(start),
                        "end": min(project["duration"], float(end)),
                        "midi": int(midi),
                        "confidence": float(amplitude),
                        "attack": attack,
                        "curve": curve,
                        "technique": technique,
                        "bend": amount,
                        "source": "estimated",
                        "part": part,
                        "string": None,
                        "fret": None,
                        "locked": False,
                        "link": None,
                    }
                )
            return found

        # Guitar stays the default tab source; other parts are optional overlays.
        parts = ("vocals", "drums", "bass", "guitar", "other")
        notes = []
        for index, part in enumerate(parts):
            status(f"다성음 채보 · {part} 파트 피치 추출", 70 + index * 4)
            notes.extend(transcribe(part))
        # Bound the payload; keep the most confident notes if a stem is noisy.
        if len(notes) > 20000:
            notes.sort(key=lambda n: -n["confidence"])
            notes = notes[:20000]
        notes.sort(key=lambda n: (n["start"], n["midi"]))
        for i, note in enumerate(notes):
            note["id"] = str(i)
        write("notes.json", notes)
    status("운지 생성을 위한 결과 정리", 95)
    project["analysis"] = json.loads(
        (path / "analysis.json").read_text(encoding="utf-8")
    )
    project["notes"] = json.loads((path / "notes.json").read_text(encoding="utf-8"))
    write("project.json", project)
    status("분석 완료 · 추정 결과를 확인하고 수정해 주세요", 100, "done")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        import traceback

        traceback.print_exc()
        status(
            f"분석 실패: {type(error).__name__}: {str(error)[:220]} · 설치/메모리/네트워크를 확인한 후 재시도해 주세요.",
            0,
            "error",
        )
        sys.exit(1)

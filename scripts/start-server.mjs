import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const candidates = [
  process.env.JAMBRIDGE_PYTHON,
  "server/.venv/Scripts/python.exe",
  "server/.venv/bin/python",
  ".tools/python/python.exe",
].filter(Boolean);
const python = candidates.find((path) => existsSync(path)) || "python";
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "server.app:app",
    "--app-dir",
    resolve("."),
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ],
  { stdio: "inherit", windowsHide: true },
);
child.on("error", (error) => {
  console.error(
    `분석 서버를 시작하지 못했습니다. README의 Python 설치 안내를 확인해 주세요. ${error.message}`,
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

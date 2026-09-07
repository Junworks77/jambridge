import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

// One command for a server host: static app (Vite preview, /api proxied) plus
// the local analysis server. Stopping this process stops both halves together.
if (!existsSync(resolve("dist/index.html"))) {
  console.error("dist/가 없습니다. 먼저 `npm run build`를 실행해 주세요.");
  process.exit(1);
}

const parts = [
  [process.execPath, [resolve("scripts/start-server.mjs")]],
  [
    process.execPath,
    [resolve("node_modules/vite/bin/vite.js"), "preview", "--host", "0.0.0.0"],
  ],
];
const children = parts.map(([command, args]) =>
  spawn(command, args, { stdio: "inherit", windowsHide: true }),
);

let stopping = false;
const stopAll = (signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      /* Already exited. */
    }
  }
};

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stopAll(signal));

for (const child of children) {
  child.on("error", (error) => {
    console.error(`프로세스를 시작하지 못했습니다: ${error.message}`);
    process.exitCode = 1;
    stopAll();
  });
  child.on("exit", (code) => {
    // If either half stops, bring the other down so start and stop stay paired.
    if (!stopping && code) process.exitCode = code;
    stopAll();
  });
}

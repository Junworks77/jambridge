import { defineConfig } from "vite";

// The same JAMBRIDGE_ALLOWED_HOSTS the analysis server uses for its Origin check
// also tells the preview server which external hostnames may reach it. Loopback
// and bare IPs are always allowed by Vite; "*" turns the check off entirely.
const hosts = (process.env.JAMBRIDGE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedHosts = hosts.includes("*") ? true : hosts;

export default defineConfig({
  server: { allowedHosts, proxy: { "/api": "http://127.0.0.1:8000" } },
  preview: { allowedHosts, proxy: { "/api": "http://127.0.0.1:8000" } },
});

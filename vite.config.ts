/// <reference types="vitest" />
import { defineConfig, normalizePath, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const projectRoot = normalizePath(fileURLToPath(new URL(".", import.meta.url)));

/**
 * Content-Security-Policy for the renderer.
 *
 * Dev needs 'unsafe-eval' (Vite HMR compiles in the page) and localhost/ws
 * origins (HMR socket + the loopback OAuth callback on :1455). None of that
 * should ship. In production we lock down to the app's own bundle plus the
 * only two remote origins it actually talks to (OpenAI token refresh + the
 * ChatGPT quota endpoint). 'unsafe-inline' stays on style-src because the UI
 * sets inline style props (e.g. quota bar colours); it is NOT on script-src.
 */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://auth.openai.com https://chatgpt.com"
].join("; ");

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://auth.openai.com https://chatgpt.com"
].join("; ");

function cspPlugin(isDev: boolean): Plugin {
  const policy = isDev ? DEV_CSP : PROD_CSP;
  return {
    name: "codex-manager-csp",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: {
            "http-equiv": "Content-Security-Policy",
            content: policy
          },
          injectTo: "head-prepend"
        }
      ];
    }
  };
}

export default defineConfig(({ command }) => ({
  root: projectRoot,
  base: "./",
  plugins: [react(), cspPlugin(command === "serve")],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  },
  test: {
    root: projectRoot,
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
}));

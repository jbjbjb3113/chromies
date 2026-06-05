import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openaiKey =
    env.OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  const ollamaOrigin = env.OLLAMA_HOST?.trim().replace(/\/$/, "") || "http://127.0.0.1:11434";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/openai-v1": {
          target: "https://api.openai.com/v1",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/openai-v1/, ""),
          configure(proxy) {
            if (openaiKey) {
              proxy.on("proxyReq", (proxyReq) => {
                proxyReq.setHeader("Authorization", `Bearer ${openaiKey}`);
              });
            }
          },
        },
        "/ollama-v1": {
          target: ollamaOrigin,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ollama-v1/, "/v1"),
        },
      },
    },
  };
});

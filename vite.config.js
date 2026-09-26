import { defineConfig } from "vite";

const speechCache = new Map();

function germanSpeech() {
  const middleware = async (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/speak") return next();
    const text = new URL(req.url, "http://localhost").searchParams.get("text")?.trim() ?? "";
    if (!text || text.length > 220) {
      res.statusCode = 400;
      res.end("Missing text");
      return;
    }
    try {
      let bytes = speechCache.get(text);
      if (!bytes) {
        const remote = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl=de&q=${encodeURIComponent(text)}`;
        const response = await fetch(remote, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!response.ok) {
          res.statusCode = 502;
          res.end("Speech failed");
          return;
        }
        bytes = Buffer.from(await response.arrayBuffer());
        speechCache.set(text, bytes);
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(bytes);
    } catch {
      res.statusCode = 502;
      res.end("Speech failed");
    }
  };

  return {
    name: "german-speech",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [germanSpeech()],
  server: {
    port: 5173,
    strictPort: true,
  },
});

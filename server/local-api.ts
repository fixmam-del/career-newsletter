import { loadEnv, type Plugin } from "vite";
export function localApi(): Plugin {
  return {
    name: "local-admin-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "AI_");
      for (const [name, value] of Object.entries(env))
        process.env[name] ??= value;
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split("?")[0];
        if (
          !route ||
          !["/api/session", "/api/providers", "/api/chat"].includes(route)
        )
          return next();
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 96000) {
              res.writeHead(413, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "입력 내용이 너무 깁니다." }));
              return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers))
            if (value)
              headers.set(
                name,
                Array.isArray(value) ? value.join(", ") : value,
              );
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            ...(req.method !== "GET" && req.method !== "HEAD"
              ? { body: Buffer.concat(chunks) }
              : {}),
          });
          const module = await server.ssrLoadModule(`${route}.ts`);
          const handler = module[req.method || "GET"] as
            ((r: Request) => Promise<Response>) | undefined;
          const response = handler
            ? await handler(request)
            : new Response(null, { status: 405 });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "로컬 API 설정을 확인해 주세요." }));
        }
      });
    },
  };
}

import { env } from "bun";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import htmlTemplate from "./dir.html" with { type: "text" };

const domain = env.DOMAIN;
const dir = env.DIR;
if (!domain || !dir) {
  throw new Error("The environment variables DOMAIN and DIR must be set");
}

const server = Bun.serve({
  port: env.PORT,
  async fetch(req) {
    console.log(req.url);
    const url = new URL(req.url);
    const { hostname, pathname } = url;
    if (pathname !== "/" && pathname.endsWith("/")) {
      url.pathname = pathname.slice(0, -1);
      return Response.redirect(url.href);
    }

    const subDir =
      hostname === domain ? "@" : hostname.replace(`.${domain}`, "");
    const filePath = path.join(dir, subDir, decodeURIComponent(pathname));
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const file = Bun.file(filePath);
        return new Response(file);
      }

      const indexPath = path.join(filePath, "index.html");
      const indexFile = Bun.file(indexPath);
      const hasIndexFile = await indexFile.exists();
      if (hasIndexFile) {
        return new Response(indexFile);
      }

      const entries = await fs.readdir(filePath, { withFileTypes: true });
      const pathParts = pathname.split("/").filter(Boolean);

      let html = htmlTemplate.replace(
        "{entries}",
        entries
          .map(entry => {
            const { name } = entry;
            return `<a href="${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}">${name}${entry.isFile() ? "" : "/"}</a>`;
          })
          .join("<br>\n"),
      );
      if (pathParts.length) {
        html = html.replace(
          "{breadcrumbs}",
          `<a href="/">/</a> ${pathParts
            .map((name, i) => {
              const path = pathParts.slice(0, i - 1).join("/");
              if (i === pathParts.length - 1) {
                return `<span>${name}</span>`;
              }
              return `<a href="/${path}">${name}</a>`;
            })
            .join(" / ")}`,
        );
      } else {
        html = html.replace("{breadcrumbs}", "<span>/</span>");
      }

      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
});
console.log(`Listening on http://localhost:${server.port}`);

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
    const { res, type } = await getResponse(req);
    console.log(`[${new Date().toISOString()}] ${type} ${req.url}`);
    return res;
  },
});
console.log(`Listening on http://localhost:${server.port}`);

type ResponseType = "ok" | "unauthorized" | "not_found";
async function getResponse(
  req: Request,
): Promise<{ res: Response; type: ResponseType }> {
  const url = new URL(req.url);
  const { hostname, pathname } = url;
  if (pathname !== "/" && pathname.endsWith("/")) {
    url.pathname = pathname.slice(0, -1);
    return { res: Response.redirect(url.href), type: "ok" };
  }

  if (pathname === "/robots.txt") {
    const file = Bun.file(path.join(import.meta.dir, "./robots.txt"));
    return { res: new Response(file), type: "ok" };
  }

  const pathParts = pathname.split("/").filter(Boolean);
  if (pathParts.some(name => name.startsWith("."))) {
    return {
      res: new Response("Not Found", { status: 404 }),
      type: "unauthorized",
    };
  }

  const subDir = hostname === domain ? "@" : hostname.replace(`.${domain}`, "");
  const filePath = path.join(dir, subDir, decodeURIComponent(pathname));
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      const file = Bun.file(filePath);
      return { res: new Response(file), type: "ok" };
    }

    const indexPath = path.join(filePath, "index.html");
    const indexFile = Bun.file(indexPath);
    const hasIndexFile = await indexFile.exists();
    if (hasIndexFile) {
      return { res: new Response(indexFile), type: "ok" };
    }

    const entries = await fs.readdir(filePath, { withFileTypes: true });
    const visibleEntires = entries
      .filter(x => !x.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    let html = htmlTemplate.replace(
      "{entries}",
      [
        // dirs
        ...visibleEntires.filter(entry => !entry.isFile()),
        // files
        ...visibleEntires.filter(entry => entry.isFile()),
      ]
        .map(entry => {
          const { name } = entry;
          return `<a href="${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}">${name}${entry.isFile() ? "" : "/"}</a>`;
        })
        .join("<br>\n"),
    );

    let breadcrumbsHtml: string;
    if (pathParts.length) {
      breadcrumbsHtml = `<a href="/">/</a> ${pathParts
        .map((name, i) => {
          name = decodeURIComponent(name);
          const path = pathParts.slice(0, i - 1).join("/");
          if (i === pathParts.length - 1) {
            return `<span>${name}</span>`;
          }
          return `<a href="/${path}">${name}</a>`;
        })
        .join(" / ")}`;
    } else {
      breadcrumbsHtml = "<span>/</span>";
    }
    breadcrumbsHtml += ` [entries: ${visibleEntires.length}]`;
    html = html.replace("{breadcrumbs}", breadcrumbsHtml);

    return {
      res: new Response(html, {
        headers: {
          "Content-Type": "text/html",
        },
      }),
      type: "ok",
    };
  } catch {
    return {
      res: new Response("Not Found", { status: 404 }),
      type: "not_found",
    };
  }
}

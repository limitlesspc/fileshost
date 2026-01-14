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

  if (pathname === "/lazy-load.js") {
    const file = Bun.file(path.join(import.meta.dir, "./lazy-load.js"));
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

    const galleryView = url.searchParams.get("view") === "gallery";
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"];
    const videoExensions = [".mp4", ".mkv", ".mov"];

    const dirsHtml = visibleEntires
      .filter(entry => !entry.isFile())
      .map(entry => {
        const { name } = entry;
        const href = `${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}`;
        return `<a href="${href}">${name}/</a>`;
      });
    const filesHtml = visibleEntires
      .filter(
        entry =>
          entry.isFile()
          && (!galleryView
            || [...imageExtensions, ...videoExensions].some(ext =>
              entry.name.toLowerCase().endsWith(ext),
            )),
      )
      .map(entry => {
        const { name } = entry;
        const href = `${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}`;
        const lowerName = entry.name.toLowerCase();
        if (galleryView) {
          if (imageExtensions.some(ext => lowerName.endsWith(ext))) {
            return `<img src="${href}" loading="lazy">`;
          }
          return `<video width="300" height="300" autoplay muted loop playsinline>
  <source data-src="${href}" type="video/${lowerName.split(".").at(-1)}">
</video>`;
        }
        return `<a href="${href}">${name}</a>`;
      });

    let listHtml: string;
    if (galleryView) {
      listHtml = `${dirsHtml.join("<br>\n")}
<div class="grid">${filesHtml.join("")}</div>`;
    } else {
      listHtml = [...dirsHtml, ...filesHtml].join("<br>\n");
    }
    let html = htmlTemplate.replace("{entries}", listHtml);

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
    if (galleryView) {
      breadcrumbsHtml += ` <a href="${pathname}">List view</a>`;
    } else {
      breadcrumbsHtml += ` <a href="${pathname}/?view=gallery">Gallery view</a>`;
    }
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

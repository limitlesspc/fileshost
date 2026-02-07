import { env } from "bun";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import rawHtmlTemplate from "./dir.html" with { type: "text" };

const scriptFile = Bun.file(path.join(import.meta.dir, "./script.js"));

const scriptDigest = await crypto.subtle.digest(
  "SHA-1",
  await scriptFile.bytes(),
);
const scriptHash = [...new Uint8Array(scriptDigest)]
  .map(b => b.toString(16).padStart(2, "0"))
  .join("")
  .slice(0, 8);

// Bun types are incorrect here
const htmlTemplate = (rawHtmlTemplate as unknown as string).replace(
  '"></script>',
  `?v=${scriptHash}"></script>`,
);

const domain = env.DOMAIN || "";
const dir = env.DIR || "";
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

const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"];
const videoExtensions = [".mp4", ".mkv"];
const mediaExtensions = [...imageExtensions, ...videoExtensions];

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

  if (pathname === "/script.js") {
    const file = Bun.file(path.join(import.meta.dir, "./script.js"));
    return { res: new Response(file), type: "ok" };
  }

  const pathParts = pathname.split("/").filter(Boolean);
  if (pathname.includes("/.")) {
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
    if (await indexFile.exists()) {
      return { res: new Response(indexFile), type: "ok" };
    }

    const entries = await fs.readdir(filePath, { withFileTypes: true });
    const entryNames = new Set(entries.map(x => x.name));
    const visibleEntries = entries
      .filter(x => !x.name.startsWith(".") && !x.name.includes(".thumb"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const view = url.searchParams.get("view");
    const galleryView = view === "gallery";
    const randomView = view === "rgallery";

    const dirsHtml = visibleEntries
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const { name } = entry;
        const href = `${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}`;
        return `<a href="${href}">${name}/</a>`;
      });
    const filesHtml = visibleEntries
      .filter(entry => {
        if (!entry.isFile()) {
          return false;
        }
        if (galleryView) {
          const parsedPath = path.parse(entry.name);
          return mediaExtensions.includes(parsedPath.ext.toLowerCase());
        }
        return true;
      })
      .map(entry => {
        let { name } = entry;
        if (galleryView) {
          const parsedPath = path.parse(name);
          const thumbnailName = `${parsedPath.name}.thumb${parsedPath.ext}`;
          const thumbnailExists = entryNames.has(thumbnailName);
          if (thumbnailExists) {
            name = thumbnailName;
          }
        }

        const href = `${pathname === "/" ? "" : pathname}/${encodeURIComponent(name)}`;
        const lowerName = entry.name.toLowerCase();
        if (galleryView) {
          if (imageExtensions.some(ext => lowerName.endsWith(ext))) {
            return `<img data-src="${href}" width="300" height="300">`;
          }
          return `<video width="300" height="300" autoplay muted loop playsinline>
  <source data-src="${href}" type="video/${lowerName.split(".").at(-1)}">
</video>`;
        }
        return `<a href="${href}">${name}</a>`;
      });
    if (randomView) {
      for (let i = filesHtml.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = filesHtml[i]!;
        filesHtml[i] = filesHtml[j]!;
        filesHtml[j] = temp;
      }
    }

    let listHtml: string;
    if (galleryView) {
      listHtml = `${dirsHtml.join("<br>\n")}
<div class="grid">${filesHtml.join("")}</div>`;
    } else {
      listHtml = [...dirsHtml, ...filesHtml].join("<br>\n");
    }
    let html = (htmlTemplate as unknown as string).replace(
      "{entries}",
      listHtml,
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
    breadcrumbsHtml += ` [entries: ${dirsHtml.length + filesHtml.length}]`;
    if (galleryView) {
      breadcrumbsHtml += ` <a href="${pathname}">List view</a>`;
      breadcrumbsHtml += ` <a href="${pathname}?view=rgallery">Random gallery view</a>`;
    } else if (randomView) {
      breadcrumbsHtml += ` <a href="${pathname}">List view</a>`;
      breadcrumbsHtml += ` <a href="${pathname}?view=gallery">Gallery view</a>`;
    } else {
      breadcrumbsHtml += ` <a href="${pathname}?view=gallery">Gallery view</a>`;
      breadcrumbsHtml += ` <a href="${pathname}?view=rgallery">Random gallery view</a>`;
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

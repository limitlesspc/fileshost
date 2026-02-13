package main

import (
	"cmp"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"path"
	"slices"
	"strings"

	_ "github.com/joho/godotenv/autoload"
)

var imageExtensions = []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"}
var videoExtensions = []string{".mp4", ".mkv"}

func main() {
	domain := os.Getenv("DOMAIN")
	dir := os.Getenv("DIR")
	port := os.Getenv("PORT")
	if len(domain) == 0 || len(dir) == 0 || len(port) == 0 {
		log.Fatal("The environment variables DOMAIN, DIR, and PORT must be set")
	}

	htmlTemplateData, err := os.ReadFile("./dir.html")
	if err != nil {
		return
	}
	htmlTemplate := string(htmlTemplateData)

	handler := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		URL := req.URL
		hostname := req.Host
		pathname := URL.Path
		urlStr := hostname + pathname

		if pathname != "/" && strings.HasSuffix(pathname, "/") {
			newUrl := pathname[:len(pathname)-1]
			http.Redirect(w, req, newUrl, http.StatusTemporaryRedirect)
			log.Println("ok " + urlStr)
			return
		}

		if pathname == "/robots.txt" {
			http.ServeFile(w, req, "./robots.txt")
			log.Println("ok " + urlStr)
			return
		}

		if pathname == "/script.js" {
			http.ServeFile(w, req, "./script.js")
			log.Println("ok " + urlStr)
			return
		}

		if strings.Contains(pathname, "/.") {
			http.NotFound(w, req)
			log.Println("unauthorized " + urlStr)
			return
		}

		var subDir string
		if hostname == domain {
			subDir = "@"
		} else {
			subDir = strings.Replace(hostname, "."+domain, "", 1)
		}
		unescaped, err := url.PathUnescape(pathname)
		if err != nil {
			http.NotFound(w, req)
			log.Println("failed to unescape " + urlStr)
			return
		}
		filePath := path.Join(dir, subDir, unescaped)

		stat, err := os.Stat(filePath)
		if err != nil {
			http.NotFound(w, req)
			log.Println("not found " + urlStr)
			return
		}

		if !stat.IsDir() {
			http.ServeFile(w, req, filePath)
			log.Println("ok " + urlStr)
			return
		}

		indexPath := path.Join(filePath, "index.html")
		_, indexErr := os.Stat(indexPath)
		if indexErr == nil {
			http.ServeFile(w, req, indexPath)
			log.Println("ok " + urlStr)
			return
		}

		entries, err := os.ReadDir(filePath)
		if err != nil {
			http.NotFound(w, req)
			log.Println("not found " + urlStr)
			return
		}

		entryNames := []string{}
		for _, entry := range entries {
			entryNames = append(entryNames, entry.Name())
		}

		visibleEntries := []os.DirEntry{}
		for _, entry := range entries {
			name := entry.Name()
			if !strings.HasPrefix(name, ".") && !strings.Contains(name, ".thumb") {
				visibleEntries = append(visibleEntries, entry)
			}
		}
		slices.SortFunc(visibleEntries, func(a, b os.DirEntry) int {
			return cmp.Compare(a.Name(), b.Name())
		})

		galleryView := URL.Query().Get("view") == "gallery"
		randomView := URL.Query().Get("random") == "1"

		dirsHtml := []string{}
		for _, entry := range visibleEntries {
			if entry.IsDir() {
				name := entry.Name()

				var start string
				if pathname == "/" {
					start = ""
				} else {
					start = pathname
				}

				href := fmt.Sprintf("%s/%s", start, url.PathEscape(name))
				html := fmt.Sprintf(`<a href="%s">%s/</a>`, href, name)
				dirsHtml = append(dirsHtml, html)
			}
		}

		filesHtml := []string{}
		for _, entry := range visibleEntries {
			if entry.IsDir() {
				continue
			}

			name := entry.Name()
			ext := path.Ext(name)

			if galleryView && !slices.Contains(imageExtensions, strings.ToLower(ext)) && !slices.Contains(videoExtensions, strings.ToLower(ext)) {
				continue
			}

			if galleryView {
				thumbnailName := fmt.Sprintf("%s.thumb%s", strings.TrimSuffix(name, ext), ext)
				thumbnailExists := slices.Contains(entryNames, thumbnailName)
				if thumbnailExists {
					name = thumbnailName
				}
			}

			start := pathname
			if pathname == "/" {
				start = ""
			}

			href := fmt.Sprintf("%s/%s", start, url.PathEscape(name))
			lowerName := strings.ToLower(entry.Name())
			html := ""
			if galleryView {
				if slices.ContainsFunc(imageExtensions, func(ext string) bool {
					return strings.HasSuffix(lowerName, ext)
				}) {
					html = fmt.Sprintf(`<img data-src="%s" width="300" height="300">`, href)
				} else {
					parts := strings.Split(lowerName, ".")
					html = fmt.Sprintf(`<video width="300" height="300" autoplay muted loop playsinline>
						<source data-src="%s" type="video/%s">
					</video>`, href, parts[len(parts)-1])
				}
			} else {
				html = fmt.Sprintf(`<a href="%s">%s</a>`, href, name)
			}
			filesHtml = append(filesHtml, html)
		}
		if randomView {
			rand.Shuffle(len(filesHtml), func(i, j int) {
				filesHtml[i], filesHtml[j] = filesHtml[j], filesHtml[i]
			})
		}

		var listHtml string
		if galleryView {
			listHtml = fmt.Sprintf(`%s
			<div class="grid">%s</div>`, strings.Join(dirsHtml, "<br>\n"), strings.Join(filesHtml, ""))
		} else {
			listHtml = strings.Join(dirsHtml, "<br>\n") + "<br>\n" + strings.Join(filesHtml, "<br>\n")
		}
		html := strings.Replace(htmlTemplate, "{entries}", listHtml, 1)

		var breadcrumbsHtml string
		pathParts := strings.Split(pathname, "/")[1:]
		if len(pathParts) > 0 {
			links := []string{}
			for i, name := range pathParts {
				name, err := url.PathUnescape(name)
				if err != nil {
					http.NotFound(w, req)
					log.Println("failed to unescape " + urlStr)
					return
				}
				path := strings.Join(pathParts[:i], "/")
				if i == len(pathParts)-1 {
					links = append(links, fmt.Sprintf("<span>%s</span>", name))
				} else {
					links = append(links, fmt.Sprintf(`<a href="%s">%s</a>`, path, name))
				}
			}
			breadcrumbsHtml = `<a href="/">/</a> ` + strings.Join(links, " / ")
		} else {
			breadcrumbsHtml = "<span>/</span>"
		}
		breadcrumbsHtml += fmt.Sprintf(" [entries: %d]", len(dirsHtml)+len(filesHtml))
		if galleryView {
			breadcrumbsHtml += fmt.Sprintf(` <a href="%s">List view</a>`, pathname)
			if randomView {
				breadcrumbsHtml += fmt.Sprintf(` <a href="%s?view=gallery">Gallery view</a>`, pathname)
			} else {
				breadcrumbsHtml += fmt.Sprintf(` <a href="%s?view=gallery&random=1">Random gallery view</a>`, pathname)

			}
		} else if randomView {
			breadcrumbsHtml += fmt.Sprintf(` <a href="%s">List view</a>`, pathname)
			breadcrumbsHtml += fmt.Sprintf(` <a href="%s?view=gallery">Gallery view</a>`, pathname)

		} else {
			breadcrumbsHtml += fmt.Sprintf(` <a href="%s?view=gallery">Gallery view</a>`, pathname)
			breadcrumbsHtml += fmt.Sprintf(` <a href="%s?view=gallery&random=1">Random gallery view</a>`, pathname)
		}
		html = strings.Replace(html, "{breadcrumbs}", breadcrumbsHtml, 1)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, html)
		log.Println("ok " + urlStr)
	})
	println("Listening on http://localhost:" + port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

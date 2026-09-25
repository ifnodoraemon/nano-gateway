package web

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed dist/*
var distFS embed.FS

// RegisterStaticRoutes mounts the embedded SPA on the Gin engine.
func RegisterStaticRoutes(r *gin.Engine) {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return
	}

	httpFS := http.FS(sub)

	// Serve static assets under /ui/
	r.StaticFS("/ui", httpFS)

	// Redirect root / to /ui/
	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusFound, "/ui/")
	})
}

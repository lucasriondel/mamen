import { join } from "path"
import { handleRequest, router } from "./router"
import "./api"

const PORT = Number(process.env.PORT) || 3000
const STATIC_DIR = join(import.meta.dir, "../../web/dist")

// Health check route
router.get("/api/health", () => {
  return Response.json({ status: "ok" })
})

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    // Try API routes first
    const apiResponse = await handleRequest(req)
    if (apiResponse) return apiResponse

    // Serve static files in production
    const url = new URL(req.url)
    const filePath = join(STATIC_DIR, url.pathname === "/" ? "index.html" : url.pathname)

    const file = Bun.file(filePath)
    if (await file.exists()) {
      return new Response(file)
    }

    // SPA fallback — serve index.html for client-side routing
    const indexFile = Bun.file(join(STATIC_DIR, "index.html"))
    if (await indexFile.exists()) {
      return new Response(indexFile)
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`@mamen/server listening on http://localhost:${server.port}`)

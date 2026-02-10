const PORT = Number(process.env.PORT) || 3000

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ status: "ok", message: "mamen API" })
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`@mamen/server listening on http://localhost:${server.port}`)

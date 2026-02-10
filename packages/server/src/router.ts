type RouteParams = {
  pathname: string
  searchParams: URLSearchParams
  params: Record<string, string>
}

type RouteHandler = (req: Request, params: RouteParams) => Response | Promise<Response>

type Route = {
  method: string
  pattern: string
  handler: RouteHandler
}

const routes: Route[] = []

const addRoute = (method: string, pattern: string, handler: RouteHandler) => {
  routes.push({ method, pattern, handler })
}

export const router = {
  get: (pattern: string, handler: RouteHandler) => addRoute("GET", pattern, handler),
  post: (pattern: string, handler: RouteHandler) => addRoute("POST", pattern, handler),
  put: (pattern: string, handler: RouteHandler) => addRoute("PUT", pattern, handler),
  delete: (pattern: string, handler: RouteHandler) => addRoute("DELETE", pattern, handler),
  patch: (pattern: string, handler: RouteHandler) => addRoute("PATCH", pattern, handler),
}

const matchRoute = (method: string, pathname: string): { handler: RouteHandler; params: RouteParams } | undefined => {
  const url = new URL(`http://localhost${pathname}`)

  for (const route of routes) {
    if (route.method !== method) continue

    const routeParts = route.pattern.split("/")
    const pathParts = url.pathname.split("/")

    if (routeParts.length !== pathParts.length) continue

    let matches = true
    const extracted: Record<string, string> = {}
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        extracted[routeParts[i].slice(1)] = pathParts[i]
        continue
      }
      if (routeParts[i] !== pathParts[i]) {
        matches = false
        break
      }
    }

    if (matches) {
      return {
        handler: route.handler,
        params: {
          pathname: url.pathname,
          searchParams: url.searchParams,
          params: extracted,
        },
      }
    }
  }

  return undefined
}

export const handleRequest = async (req: Request): Promise<Response | undefined> => {
  const url = new URL(req.url)

  if (!url.pathname.startsWith("/api/")) return undefined

  const match = matchRoute(req.method, url.pathname)

  if (!match) {
    return Response.json({ error: "Not Found" }, { status: 404 })
  }

  try {
    return await match.handler(req, match.params)
  } catch (err) {
    console.error(`API error: ${req.method} ${url.pathname}`, err)
    return Response.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export type { RouteHandler, RouteParams }

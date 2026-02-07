import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent(): React.ReactElement {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

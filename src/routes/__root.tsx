import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'
import { CommandPaletteProvider } from '@/context/CommandPaletteContext'
import { CommandPalette } from '@/components/CommandPalette'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent(): React.ReactElement {
  return (
    <CommandPaletteProvider>
      <Layout>
        <Outlet />
      </Layout>
      <CommandPalette />
    </CommandPaletteProvider>
  )
}

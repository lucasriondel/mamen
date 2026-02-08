import { useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'
import { CommandPaletteProvider } from '@/context/CommandPaletteContext'
import { CommandPalette } from '@/components/CommandPalette'
import { seedCategories } from '@/lib/db'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent(): React.ReactElement {
  useEffect(() => {
    seedCategories().catch(console.error)
  }, [])

  return (
    <CommandPaletteProvider>
      <Layout>
        <Outlet />
      </Layout>
      <CommandPalette />
    </CommandPaletteProvider>
  )
}

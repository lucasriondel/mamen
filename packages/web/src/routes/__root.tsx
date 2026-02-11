import { useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Layout } from '@/components/Layout'
import { CommandPaletteProvider } from '@/context/CommandPaletteContext'
import { FocusModeProvider } from '@/context/FocusModeContext'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/ui/sonner'
import { seedCategories } from '@/lib/seeds/categories'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent(): React.ReactElement {
  useEffect(() => {
    seedCategories().catch(console.error)
  }, [])

  return (
    <FocusModeProvider>
      <CommandPaletteProvider>
        <Layout>
          <Outlet />
        </Layout>
        <CommandPalette />
        <Toaster />
      </CommandPaletteProvider>
    </FocusModeProvider>
  )
}

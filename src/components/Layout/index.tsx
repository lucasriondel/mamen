import { Sidebar } from './Sidebar'
import { Header } from './Header'

type LayoutProps = {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps): React.ReactElement {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..')

function readJson(filePath: string): Record<string, unknown> {
  const content = readFileSync(resolve(root, filePath), 'utf-8')
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
  return JSON.parse(stripped)
}

describe('Project Setup Verification', () => {
  describe('AC #1 & #2: Vite + React 19 + TypeScript 5 + SWC', () => {
    it('has React 19 as dependency', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies.react).toMatch(/\^?19/)
    })

    it('has TypeScript 5 as dev dependency', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies.typescript).toMatch(/5/)
    })

    it('uses SWC plugin', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies['@vitejs/plugin-react-swc']).toBeDefined()
    })
  })

  describe('AC #3: shadcn/ui with Tailwind v4', () => {
    it('has tailwindcss v4 installed', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies.tailwindcss).toMatch(/\^?4/)
    })

    it('uses tw-animate-css (not tailwindcss-animate)', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string>, dependencies: Record<string, string> }
      expect(pkg.devDependencies['tw-animate-css']).toBeDefined()
      expect(pkg.dependencies['tailwindcss-animate']).toBeUndefined()
      expect(pkg.devDependencies['tailwindcss-animate']).toBeUndefined()
    })

    it('has no tailwind.config.js file', () => {
      expect(existsSync(resolve(root, 'tailwind.config.js'))).toBe(false)
      expect(existsSync(resolve(root, 'tailwind.config.ts'))).toBe(false)
    })

    it('has components.json for shadcn', () => {
      expect(existsSync(resolve(root, 'components.json'))).toBe(true)
    })
  })

  describe('AC #4: Required shadcn components installed', () => {
    const requiredComponents = [
      'command', 'dialog', 'table', 'form', 'button',
      'dropdown-menu', 'select', 'sonner', 'badge',
      'card', 'tooltip', 'popover',
    ]

    requiredComponents.forEach((component) => {
      it(`has ${component} component`, () => {
        expect(existsSync(resolve(root, `src/components/ui/${component}.tsx`))).toBe(true)
      })
    })
  })

  describe('AC #5: Path aliases configured', () => {
    it('has path aliases in tsconfig.json', () => {
      const tsconfig = readJson('tsconfig.json') as { compilerOptions: { paths: Record<string, string[]> } }
      expect(tsconfig.compilerOptions.paths['@/*']).toContain('./src/*')
    })

    it('has path aliases in tsconfig.app.json', () => {
      const content = readFileSync(resolve(root, 'tsconfig.app.json'), 'utf-8')
      expect(content).toContain('"@/*"')
      expect(content).toContain('"./src/*"')
    })
  })

  describe('AC #7: Core dependencies installed', () => {
    it('has zustand ^5.0', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies.zustand).toMatch(/\^?5/)
    })

    it('has @tanstack/react-router ^1.153+', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies['@tanstack/react-router']).toBeDefined()
    })

    it('has @tanstack/react-virtual', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies['@tanstack/react-virtual']).toBeDefined()
    })

    it('has lucide-react', () => {
      const pkg = readJson('package.json') as { dependencies: Record<string, string> }
      expect(pkg.dependencies['lucide-react']).toBeDefined()
    })
  })

  describe('AC #8: Dev dependencies installed', () => {
    it('has vitest', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies.vitest).toBeDefined()
    })

    it('has @testing-library/react', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies['@testing-library/react']).toBeDefined()
    })

    it('has @testing-library/jest-dom', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies['@testing-library/jest-dom']).toBeDefined()
    })

    it('has @testing-library/user-event', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies['@testing-library/user-event']).toBeDefined()
    })

    it('has jsdom', () => {
      const pkg = readJson('package.json') as { devDependencies: Record<string, string> }
      expect(pkg.devDependencies.jsdom).toBeDefined()
    })
  })

  describe('Project structure', () => {
    const requiredDirs = [
      'src/components/ui',
      'src/features',
      'src/hooks',
      'src/lib/db',
      'src/lib/schemas',
      'src/lib/llm',
      'src/lib/utils',
      'src/types',
      'src/context',
      'src/routes',
    ]

    requiredDirs.forEach((dir) => {
      it(`has ${dir} directory`, () => {
        expect(existsSync(resolve(root, dir))).toBe(true)
      })
    })

    it('has .env.example file', () => {
      expect(existsSync(resolve(root, '.env.example'))).toBe(true)
    })
  })
})

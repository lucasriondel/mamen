# Story 1.1: Initialize Project with Vite and shadcn/ui

Status: ready-for-dev

## Story

As a **developer**,
I want **the project initialized with the specified tech stack (Vite + React + TypeScript + shadcn/ui)**,
So that **I have a solid foundation matching the architecture decisions for building mamen**.

## Acceptance Criteria

1. **Given** I have Node.js installed (20.19+ or 22.12+)
   **When** I run the project initialization commands
   **Then** a new Vite project is created with React 19 and TypeScript 5

2. **Given** the Vite project is created
   **When** I check the build configuration
   **Then** SWC compiler is configured for faster builds (react-swc-ts template)

3. **Given** the project is created
   **When** I initialize shadcn/ui
   **Then** shadcn/ui is initialized with Tailwind CSS v4
   **And** the new-york style is applied (shadcn default)
   **And** tw-animate-css is used (not deprecated tailwindcss-animate)

4. **Given** shadcn/ui is initialized
   **When** I add required components
   **Then** the following shadcn components are installed: command, dialog, table, form, button, dropdown-menu, select, toast, badge, card, tooltip, popover

5. **Given** TypeScript is configured
   **When** I check tsconfig.json and tsconfig.app.json
   **Then** path aliases are configured (@/components, @/lib, @/features, @/hooks, @/types)

6. **Given** path aliases are configured
   **When** I run `npm run dev`
   **Then** the project runs successfully without errors

7. **Given** the project runs
   **When** I check installed dependencies
   **Then** all core dependencies are installed:
   - zustand ^5.0
   - dexie ^4.2
   - dexie-react-hooks
   - @tanstack/react-router ^1.153+
   - @tanstack/react-virtual
   - lucide-react

8. **Given** core dependencies are installed
   **When** I check dev dependencies
   **Then** dev dependencies are installed:
   - vitest
   - @testing-library/react
   - @testing-library/jest-dom
   - @testing-library/user-event
   - jsdom

## Tasks / Subtasks

- [ ] Task 1: Create Vite project with React + TypeScript + SWC (AC: #1, #2)
  - [ ] Run `npm create vite@latest mamen -- --template react-swc-ts`
  - [ ] Navigate to project: `cd mamen && npm install`
  - [ ] Verify React 19 and TypeScript 5 in package.json

- [ ] Task 2: Configure TypeScript path aliases (AC: #5)
  - [ ] Update tsconfig.json with baseUrl and paths
  - [ ] Update tsconfig.app.json with matching paths
  - [ ] Configure vite.config.ts with resolve.alias

- [ ] Task 3: Initialize shadcn/ui with Tailwind v4 (AC: #3)
  - [ ] Run `npx shadcn@latest init`
  - [ ] Select new-york style when prompted
  - [ ] Leave tailwind.config.js path blank (Tailwind v4)
  - [ ] Verify tw-animate-css is installed (not tailwindcss-animate)

- [ ] Task 4: Add required shadcn components (AC: #4)
  - [ ] Run `npx shadcn@latest add command dialog table form button dropdown-menu select toast badge card tooltip popover`
  - [ ] Verify all components are in src/components/ui/

- [ ] Task 5: Install core dependencies (AC: #7)
  - [ ] Run `npm install zustand dexie dexie-react-hooks @tanstack/react-router @tanstack/react-virtual lucide-react`
  - [ ] Verify versions meet minimums in package.json

- [ ] Task 6: Install dev dependencies (AC: #8)
  - [ ] Run `npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
  - [ ] Create vitest.config.ts with React Testing Library setup

- [ ] Task 7: Verify project runs (AC: #6)
  - [ ] Run `npm run dev`
  - [ ] Verify no errors in terminal
  - [ ] Verify app loads in browser at localhost:5173

- [ ] Task 8: Set up initial project structure (Architecture compliance)
  - [ ] Create directory structure per architecture doc
  - [ ] Add .gitignore with appropriate entries
  - [ ] Add .env.example for LLM settings placeholder

## Dev Notes

### Critical Architecture Requirements

**Source: [architecture.md - Starter Template Evaluation]**

This is a **greenfield project** - you are creating the project from scratch. There is NO existing codebase.

**Exact Initialization Commands:**
```bash
# 1. Create Vite project with React + TypeScript + SWC
npm create vite@latest mamen -- --template react-swc-ts

# 2. Navigate and install
cd mamen && npm install

# 3. Initialize shadcn/ui (auto-configures Tailwind v4, Radix)
npx shadcn@latest init

# 4. Add required shadcn components
npx shadcn@latest add command dialog table form button dropdown-menu select toast badge card tooltip popover
```

### Latest Version Information (as of January 2026)

| Package | Minimum | Latest Verified |
|---------|---------|-----------------|
| create-vite | @latest | 8.2.0 |
| React | 19.x | 19.x |
| TypeScript | 5.x | 5.x |
| Vite | 7.x | 7.x |
| Tailwind CSS | v4 | v4 |
| Zustand | ^5.0 | 5.0.10 |
| Dexie.js | ^4.2 | 4.2.1 |
| TanStack Router | ^1.153 | 1.154.1 |

### Tailwind v4 Specifics

**CRITICAL:** Tailwind CSS v4 has breaking changes:
- NO tailwind.config.js file (leave blank when shadcn asks)
- Use `tw-animate-css` NOT `tailwindcss-animate` (deprecated)
- Colors use OKLCH format (auto-converted by shadcn)
- Import with `@import "tailwindcss"` not the old directives

### React 19 Compatibility

When using React 19, some packages may fail to install due to peer dependency issues. Use `--force` flag if needed:
```bash
npm install --force
```

### Project Structure Notes

**Required Directory Structure (create during Task 8):**
```
mamen/
├── src/
│   ├── components/
│   │   └── ui/              # shadcn components (auto-generated)
│   ├── features/            # Feature modules (empty for now)
│   ├── hooks/               # Shared hooks (empty for now)
│   ├── lib/
│   │   ├── db/              # Dexie setup (Story 1.2)
│   │   ├── schemas/         # Zod schemas (Story 1.2)
│   │   ├── llm/             # LLM client (Epic 2)
│   │   └── utils/
│   │       └── cn.ts        # Class name utility (shadcn provides)
│   ├── types/               # Shared TypeScript types
│   ├── context/             # React contexts (empty for now)
│   ├── routes/              # TanStack Router routes (Story 1.3)
│   ├── main.tsx
│   ├── App.tsx
│   └── index.css
├── public/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts
├── vitest.config.ts
└── components.json          # shadcn config
```

### Path Alias Configuration

**tsconfig.json and tsconfig.app.json:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**vite.config.ts:**
```typescript
import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

### Vitest Configuration

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**src/test/setup.ts:**
```typescript
import '@testing-library/jest-dom'
```

### Anti-Patterns to AVOID

**Source: [architecture.md - Implementation Patterns]**

- DO NOT create `__tests__/` directories - tests go next to source files
- DO NOT use `interface` - use `type` for all TypeScript definitions
- DO NOT use default exports - use named exports only
- DO NOT add unnecessary comments or docstrings
- DO NOT create a tailwind.config.js file (Tailwind v4 doesn't use it)
- DO NOT install tailwindcss-animate (use tw-animate-css instead)

### TypeScript Conventions

- Use `type` not `interface` for everything
- Named exports only, no default exports
- Explicit return types on exported functions
- Props types: `{ComponentName}Props`

### Validation Checklist

Before marking this story complete, verify:
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes without errors
- [ ] All 12 shadcn components are in src/components/ui/
- [ ] Path aliases (@/components etc.) resolve correctly
- [ ] Directory structure matches architecture spec
- [ ] No tailwind.config.js file exists
- [ ] tw-animate-css is in package.json (not tailwindcss-animate)

### References

- [Source: architecture.md#Starter-Template-Evaluation]
- [Source: architecture.md#Core-Architectural-Decisions]
- [Source: architecture.md#Implementation-Patterns-Consistency-Rules]
- [Source: architecture.md#Project-Structure-Boundaries]
- [Source: project-context.md#Technology-Stack-Versions]
- [Source: epics.md#Story-1.1]
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List


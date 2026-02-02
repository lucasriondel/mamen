# Story 2.4: LLM Settings Configuration

Status: ready-for-dev

## Story

As a **user**,
I want **to configure my LLM settings for PDF parsing**,
So that **I can use a local LLM for privacy or my own cloud API key**.

## Acceptance Criteria

1. **Given** I navigate to Settings
   **When** I view the LLM Configuration section
   **Then** I see options for LLM endpoint configuration
   **And** I can enter an API endpoint URL (default: http://localhost:11434/v1 for Ollama)
   **And** I can optionally enter an API key (for cloud providers)
   **And** I can select a model name

2. **Given** I have configured a local LLM (Ollama)
   **When** I save settings
   **Then** the endpoint URL is saved to the settings table
   **And** no API key is required for local LLM

3. **Given** I want to use a cloud LLM (BYOK)
   **When** I enter my API key and endpoint
   **Then** the key is stored locally (never sent anywhere except to that endpoint)
   **And** I can test the connection with a "Test Connection" button

4. **Given** I click "Test Connection"
   **When** the LLM is reachable
   **Then** I see a success message
   **And** the model responds correctly

5. **Given** the LLM is not configured or unreachable
   **When** I try to import a PDF
   **Then** I see a clear error directing me to Settings
   **And** CSV import still works as fallback (FR graceful degradation)

## Tasks / Subtasks

- [ ] Task 1: Create Settings route and page structure (AC: #1)
  - [ ] Create route at `src/routes/settings.tsx` using TanStack Router
  - [ ] Add "Settings" navigation item to sidebar in Layout component
  - [ ] Create `src/features/settings/components/SettingsPage/index.tsx`
  - [ ] Structure page with sections: LLM Configuration (primary focus of this story)
  - [ ] Use shadcn Card component for section containers
  - [ ] Add appropriate page header/breadcrumb

- [ ] Task 2: Define Settings data model and schema (AC: #1, #2)
  - [ ] Add `settings` table to Dexie schema if not exists in `src/lib/db/schema.ts`
  - [ ] Define settings type in `src/types/settings.types.ts`:
    ```typescript
    type LLMSettings = {
      endpoint: string        // API endpoint URL
      apiKey?: string         // Optional API key (for cloud providers)
      modelName: string       // Model to use
      provider: 'ollama' | 'openai' | 'anthropic' | 'custom'  // Provider type
    }

    type AppSettings = {
      id: 'app'               // Singleton key
      llm: LLMSettings
      // Future settings will be added here
    }
    ```
  - [ ] Create Zod schema in `src/lib/schemas/settings.schema.ts` for validation
  - [ ] Ensure settings singleton pattern (single row with id='app')

- [ ] Task 3: Create LLM Configuration form UI (AC: #1)
  - [ ] Create `src/features/settings/components/LLMConfigForm/index.tsx`
  - [ ] Add Provider Select dropdown with options:
    - Ollama (Local) - default
    - LM Studio (Local)
    - OpenAI
    - Anthropic
    - Custom
  - [ ] Add Endpoint URL input field with placeholders per provider:
    - Ollama: http://localhost:11434/v1
    - LM Studio: http://localhost:1234/v1
    - OpenAI: https://api.openai.com/v1
    - Anthropic: https://api.anthropic.com/v1
    - Custom: User enters full URL
  - [ ] Add API Key input field (type="password") with visibility toggle
    - Show "Not required for local LLM" help text when Ollama selected
  - [ ] Add Model Name input field with common model suggestions per provider:
    - Ollama: llama3.2, mistral, qwen2.5
    - OpenAI: gpt-4o, gpt-4o-mini
    - Anthropic: claude-3-5-sonnet-latest, claude-3-5-haiku-latest
  - [ ] Use shadcn form components: Input, Select, Button, Label
  - [ ] Apply dark theme styling per UX spec

- [ ] Task 4: Implement settings persistence (AC: #2, #3)
  - [ ] Create `src/features/settings/hooks/useSettings.ts`
  - [ ] Use `useLiveQuery` to read settings from Dexie
  - [ ] Implement `saveSettings` function using `db.settings.put()`
  - [ ] Handle initial state (no settings row) with defaults:
    ```typescript
    const DEFAULT_LLM_SETTINGS: LLMSettings = {
      endpoint: 'http://localhost:11434/v1',
      apiKey: undefined,
      modelName: 'llama3.2',
      provider: 'ollama'
    }
    ```
  - [ ] Auto-save on form change with debounce (500ms)
  - [ ] Show "Saved" indicator briefly when settings persist

- [ ] Task 5: Implement "Test Connection" functionality (AC: #4)
  - [ ] Add "Test Connection" button to form
  - [ ] Create `src/lib/llm/client.ts` with OpenAI-compatible client
  - [ ] Implement `testConnection` function:
    ```typescript
    export const testConnection = async (settings: LLMSettings): Promise<{
      success: boolean
      message: string
      modelInfo?: string
    }>
    ```
  - [ ] For Ollama: Call `/api/tags` endpoint to list models
  - [ ] For OpenAI-compatible: Call `/models` endpoint
  - [ ] Handle errors: network error, auth error, timeout
  - [ ] Show loading spinner on button during test
  - [ ] Display result in toast: success (green) or error (red)

- [ ] Task 6: Create LLM client abstraction (AC: #4, #5)
  - [ ] Create `src/lib/llm/client.ts` with:
    ```typescript
    export const createLLMClient = (settings: LLMSettings) => {
      // Returns client configured for the provider
    }

    export const isLLMConfigured = (settings?: LLMSettings): boolean => {
      // Returns true if valid configuration exists
    }

    export const getLLMError = (settings?: LLMSettings): string | null => {
      // Returns user-friendly error message if not configured
    }
    ```
  - [ ] Support OpenAI-compatible API format (same code works for all providers)
  - [ ] Include proper headers (Authorization, Content-Type)
  - [ ] Handle Ollama's slightly different API structure

- [ ] Task 7: Add provider-specific form behavior (AC: #1, #3)
  - [ ] When provider changes, auto-update endpoint to default
  - [ ] When provider is 'ollama', hide API key field entirely or show as optional
  - [ ] When provider is 'openai' or 'anthropic', show API key as required
  - [ ] Validate endpoint URL format before saving
  - [ ] Validate API key is provided for cloud providers before test

- [ ] Task 8: Implement LLM status indicator (AC: #5)
  - [ ] Add status indicator in sidebar or settings showing LLM connection state
  - [ ] States: Not configured, Configured (untested), Connected, Error
  - [ ] Show subtle warning if PDF import is attempted without valid LLM config
  - [ ] Status should update after successful "Test Connection"

- [ ] Task 9: Create helper for PDF import error handling (AC: #5)
  - [ ] Create `src/lib/llm/guards.ts` with:
    ```typescript
    export const checkLLMRequirements = async (): Promise<{
      ready: boolean
      message?: string
      redirectToSettings?: boolean
    }>
    ```
  - [ ] This will be called by PDF import flow in Story 2.5
  - [ ] Returns user-friendly message if LLM not configured
  - [ ] Includes link/button to navigate to Settings

- [ ] Task 10: Write unit tests (AC: all)
  - [ ] Create `src/features/settings/components/LLMConfigForm/LLMConfigForm.test.tsx`
  - [ ] Test form renders with default values
  - [ ] Test provider selection updates endpoint placeholder
  - [ ] Test settings are saved to Dexie on change
  - [ ] Create `src/lib/llm/client.test.ts`
  - [ ] Test testConnection handles success case
  - [ ] Test testConnection handles network error
  - [ ] Test testConnection handles auth error
  - [ ] Test isLLMConfigured logic

## Dev Notes

### Architecture Requirements

**Source: [architecture.md#LLM-Integration]**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary | Local LLM (Ollama/LM Studio) | Privacy-first, no external dependency |
| Fallback | BYOK cloud (Claude, OpenAI) | User provides own API key |
| Interface | OpenAI-compatible API | Same code works for local + cloud |
| Configuration | Settings page with endpoint URL + optional key | Local: localhost, no key needed |

**Source: [architecture.md#Data-Access-Pattern]**

- **CRITICAL:** Use `useLiveQuery` directly from Dexie - do NOT duplicate data in React state
- Settings should be read via `useLiveQuery` for automatic reactivity
- When settings change, any component using `useSettings()` will auto-update

**Source: [architecture.md#Implementation-Patterns]**

- Use `type` not `interface` for TypeScript definitions
- Named exports only, no default exports
- Event handlers: `handle{Event}` naming
- Props types: `{ComponentName}Props`

### Data Model Reference

**Source: [architecture.md#Data-Model]**

The `settings` table stores app configuration including LLM settings:

```typescript
// src/types/settings.types.ts
type LLMProvider = 'ollama' | 'lm-studio' | 'openai' | 'anthropic' | 'custom'

type LLMSettings = {
  endpoint: string
  apiKey?: string
  modelName: string
  provider: LLMProvider
  lastTestedAt?: Date
  lastTestSuccess?: boolean
}

type AppSettings = {
  id: 'app'  // Singleton - only one row
  llm: LLMSettings
}
```

**Dexie Schema Addition:**

```typescript
// In src/lib/db/schema.ts
settings: '&id'  // Primary key is 'id' field
```

### OpenAI-Compatible API Reference

All providers (Ollama, OpenAI, Anthropic, LM Studio) support OpenAI-compatible API format:

**Endpoint Structure (Latest 2026):**
- Ollama: `http://localhost:11434/v1/chat/completions` (OpenAI-compatible at /v1 path)
- LM Studio: `http://localhost:1234/v1/chat/completions` (OpenAI-compatible)
- OpenAI: `https://api.openai.com/v1/chat/completions`
- Anthropic: `https://api.anthropic.com/v1/messages` (slight differences)

**Note:** Ollama's OpenAI-compatible API is at the `/v1` path. No API key required for local instances (can use any placeholder like "ollama" if needed).

**Test Connection Logic:**

```typescript
// For Ollama - check if server is running and list models
const testOllama = async (endpoint: string) => {
  const response = await fetch(`${endpoint}/api/tags`)
  if (!response.ok) throw new Error('Ollama not reachable')
  const data = await response.json()
  return { models: data.models.map(m => m.name) }
}

// For OpenAI-compatible - try listing models
const testOpenAI = async (endpoint: string, apiKey: string) => {
  const response = await fetch(`${endpoint}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid API key')
    throw new Error('API not reachable')
  }
  return await response.json()
}
```

### Provider Defaults

```typescript
const PROVIDER_DEFAULTS: Record<LLMProvider, Partial<LLMSettings>> = {
  ollama: {
    endpoint: 'http://localhost:11434/v1',
    modelName: 'llama3.2'
  },
  'lm-studio': {
    endpoint: 'http://localhost:1234/v1',
    modelName: ''
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    modelName: 'gpt-4o-mini'
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1',
    modelName: 'claude-3-5-haiku-latest'
  },
  custom: {
    endpoint: '',
    modelName: ''
  }
}
```

### Common Model Names (2026)

**Ollama Local Models:**
- llama3.2, llama3.1
- mistral, mistral-nemo
- qwen2.5, qwen2.5-coder
- deepseek-r1 (reasoning model)
- phi-4

**OpenAI:**
- gpt-4o, gpt-4o-mini
- o1, o1-mini (reasoning models)
- gpt-4-turbo

**Anthropic:**
- claude-3-5-sonnet-latest
- claude-3-5-haiku-latest

### UX Design Requirements

**Source: [ux-design-specification.md] and [architecture.md#Frontend-Architecture]**

- Settings page should follow Linear-inspired dark theme
- Use shadcn Card for section grouping
- Form should auto-save with visual feedback (not require explicit "Save" button)
- Test Connection button with loading state
- Toast for success/error feedback

### Component Structure

```
src/features/settings/
├── components/
│   ├── SettingsPage/
│   │   └── index.tsx
│   └── LLMConfigForm/
│       ├── index.tsx
│       └── LLMConfigForm.test.tsx
├── hooks/
│   └── useSettings.ts
└── index.ts

src/lib/llm/
├── client.ts          # LLM client abstraction
├── client.test.ts     # Client tests
└── guards.ts          # Requirement checks

src/types/
└── settings.types.ts  # Settings types

src/lib/schemas/
└── settings.schema.ts # Zod validation

src/lib/db/
└── schema.ts          # Add settings table
```

### shadcn Components to Use

From architecture's component list, use:
- `Card` - Section container for LLM Configuration
- `Input` - Endpoint URL, API key fields
- `Select` - Provider dropdown, Model selection
- `Button` - Test Connection, Save
- `Label` - Form field labels
- `Toast` - Success/error feedback
- `Badge` - Status indicator (optional)

Install any missing components:
```bash
npx shadcn@latest add card input select label
```

### Error Handling

| Scenario | User Message | Action |
|----------|--------------|--------|
| Network error | "Cannot connect to LLM. Check if it's running." | Show retry button |
| Invalid API key | "Invalid API key. Check your key in settings." | Highlight API key field |
| Timeout | "Connection timed out. LLM may be overloaded." | Suggest retry |
| Not configured | "LLM not configured. Set up in Settings first." | Link to settings |

### Security Considerations

- API keys stored in IndexedDB (browser-local, sandboxed)
- Keys never logged or sent anywhere except to the configured endpoint
- No key validation on client side (let server validate)
- Clear warning when using cloud provider: "Your API key will be sent to [endpoint]"

### Previous Story Context

**Story 2.3 established:**
- CSV import flow with drag-drop and parsing
- Toast pattern with Undo for import feedback
- Integration with AccountMonthGrid

**This story establishes:**
- Settings infrastructure for the app
- LLM client that will be used by Story 2.5 (PDF import)
- Foundation for future settings (display preferences in Epic 10)

**Story 2.5 will use:**
- `isLLMConfigured()` to check before PDF parsing
- `createLLMClient()` to send PDF content for parsing
- Settings page link for "Configure LLM" error state

### Performance Considerations

- Settings are a small dataset - no pagination needed
- Auto-save with 500ms debounce to avoid excessive writes
- Test Connection should have 10-second timeout
- Use `useLiveQuery` for reactive updates

### Project Structure Notes

This is Epic 2's first settings-related story. It creates:
- The Settings route and page structure
- The settings Dexie table
- The LLM client abstraction

These will be expanded in Epic 10 (Story 10.2: Settings Page Consolidation).

### Validation Checklist

Before marking complete:
- [ ] Settings route accessible at /settings
- [ ] Sidebar shows Settings nav item
- [ ] LLM Configuration card renders on settings page
- [ ] Provider dropdown with 5 options (ollama, lm-studio, openai, anthropic, custom)
- [ ] Provider change updates default endpoint
- [ ] Endpoint URL input with validation
- [ ] API key field (hidden for ollama, shown for others)
- [ ] Model name input with suggestions
- [ ] Settings auto-save to Dexie
- [ ] "Saved" indicator shows briefly after save
- [ ] Test Connection button works for Ollama
- [ ] Test Connection shows success toast on success
- [ ] Test Connection shows error toast on failure
- [ ] Settings persist after page refresh
- [ ] isLLMConfigured() utility works correctly
- [ ] checkLLMRequirements() returns proper messages
- [ ] No TypeScript errors
- [ ] Named exports only
- [ ] Uses `type` not `interface`
- [ ] Tests co-located with source files
- [ ] Works with dark theme

### Anti-Patterns to AVOID

- DO NOT use `interface` - use `type`
- DO NOT use default exports - use named exports
- DO NOT store settings in React state - use Dexie + useLiveQuery
- DO NOT create `__tests__/` directories - co-locate tests
- DO NOT hardcode API keys or endpoints
- DO NOT log API keys to console
- DO NOT add comments/docstrings to code you didn't change
- DO NOT send API keys anywhere except the configured endpoint

### References

- [Source: epics.md#Story-2.4-LLM-Settings-Configuration]
- [Source: architecture.md#LLM-Integration]
- [Source: architecture.md#Data-Access-Pattern]
- [Source: architecture.md#Implementation-Patterns]
- [Source: architecture.md#Data-Model]
- [Source: project-context.md#LLM-Integration]
- [Source: story 2-3 (previous story)]
- [Ollama OpenAI Compatibility](https://ollama.com/blog/openai-compatibility)
- [Ollama API Documentation](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI Compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/en/api)
- [shadcn/ui Card](https://ui.shadcn.com/docs/components/card)
- [shadcn/ui Input](https://ui.shadcn.com/docs/components/input)
- [shadcn/ui Select](https://ui.shadcn.com/docs/components/select)
- [Dexie.js useLiveQuery](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

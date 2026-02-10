import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/lib/db'
import { LLMConfigForm } from './index'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/lib/llm/client', async () => {
  const actual = await vi.importActual('@/lib/llm/client')
  return {
    ...actual,
    testConnection: vi.fn().mockResolvedValue({
      success: true,
      message: 'Connected to Ollama. 2 models available.',
    }),
  }
})

beforeEach(async () => {
  await db.appSettings.clear()
})

describe('LLMConfigForm', () => {
  it('renders with default values when no settings exist', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByText('LLM Configuration')).toBeInTheDocument()
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('http://localhost:11434/v1')
    expect(screen.getByLabelText('Model Name')).toHaveValue('llama3.2')
  })

  it('renders provider select with Ollama selected by default', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByText('Ollama (Local)')).toBeInTheDocument()
  })

  it('shows "Not required for local LLM" for ollama provider', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByText('Not required for local LLM')).toBeInTheDocument()
  })

  it('renders Test Connection button', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByRole('button', { name: /Test Connection/i })).toBeInTheDocument()
  })

  it('renders model suggestion chips for ollama', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByText('llama3.2')).toBeInTheDocument()
    expect(screen.getByText('mistral')).toBeInTheDocument()
  })

  it('saves settings to Dexie on model chip click', async () => {
    const user = userEvent.setup()
    render(<LLMConfigForm />)

    const mistralChip = await screen.findByRole('button', { name: 'mistral' })
    await user.click(mistralChip)

    await waitFor(async () => {
      const saved = await db.appSettings.get('app')
      expect(saved?.llm.modelName).toBe('mistral')
    }, { timeout: 3000 })
  })

  it('renders connection status badge as Untested for valid defaults', async () => {
    render(<LLMConfigForm />)

    expect(await screen.findByText('Untested')).toBeInTheDocument()
  })

  it('loads existing settings from Dexie', async () => {
    await db.appSettings.put({
      id: 'app',
      llm: {
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        modelName: 'gpt-4o',
        provider: 'openai',
      },
    })

    render(<LLMConfigForm />)

    expect(await screen.findByText('OpenAI')).toBeInTheDocument()
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://api.openai.com/v1')
    expect(screen.getByLabelText('Model Name')).toHaveValue('gpt-4o')
  })

  it('shows API key field for cloud providers', async () => {
    await db.appSettings.put({
      id: 'app',
      llm: {
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        modelName: 'gpt-4o',
        provider: 'openai',
      },
    })

    render(<LLMConfigForm />)

    expect(await screen.findByLabelText('API Key')).toBeInTheDocument()
  })

  it('calls testConnection when Test Connection button is clicked', async () => {
    const { testConnection } = await import('@/lib/llm/client')
    const user = userEvent.setup()
    render(<LLMConfigForm />)

    const testButton = await screen.findByRole('button', { name: /Test Connection/i })
    await user.click(testButton)

    await waitFor(() => {
      expect(testConnection).toHaveBeenCalled()
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Composer } from './Composer'

const composerState = vi.hoisted(() => ({
  value: 'hello',
  modelId: null,
  attachments: [] as unknown[],
  isRunning: false,
  showSlashMenu: false,
  slashQuery: '',
}))

vi.mock('@/hooks/useComposer', () => ({
  useComposer: () => ({
    state: composerState,
    setState: vi.fn(),
    isRunning: composerState.isRunning,
    sendError: null,
    clearError: vi.fn(),
    availableModels: [],
    availableCommands: [],
    sendPrompt: vi.fn(),
    handleKeyDown: vi.fn(),
    triggerSlash: vi.fn(),
    selectSlashCommand: vi.fn(),
    selectModel: vi.fn(),
    attachFile: vi.fn(),
    removeAttachment: vi.fn(),
    stop: vi.fn(),
    textareaRef: { current: null },
  }),
}))

vi.mock('./ModelSelector', () => ({
  ModelSelector: (props: { disabled?: boolean }) => (
    <div data-testid="model-selector" data-disabled={String(props.disabled === true)} />
  ),
}))

vi.mock('./AttachmentButton', () => ({
  AttachmentButton: (props: { disabled?: boolean }) => (
    <button type="button" data-testid="attach" disabled={props.disabled === true}>
      attach
    </button>
  ),
}))

vi.mock('./SlashMenu', () => ({
  SlashMenu: () => null,
}))

function renderComposer(props: { sessionId?: string | null; disabled?: boolean }) {
  render(<Composer sessionId={props.sessionId ?? 's1'} disabled={props.disabled} />)
}

beforeEach(() => {
  composerState.value = 'hello'
  composerState.isRunning = false
  composerState.showSlashMenu = false
  composerState.attachments = []
})

afterEach(cleanup)

describe('Composer disabled prop', () => {
  it('disables the textarea and send button when disabled is set', () => {
    renderComposer({ disabled: true })

    expect(screen.getByLabelText('composer.placeholder')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'composer.send' })).toBeDisabled()
  })

  it('disables the stop button while running when disabled is set', () => {
    composerState.isRunning = true
    renderComposer({ disabled: true })

    expect(screen.getByRole('button', { name: 'composer.stop' })).toBeDisabled()
  })

  it('disables attachment and model selection when disabled is set', () => {
    renderComposer({ disabled: true })

    expect(screen.getByTestId('attach')).toBeDisabled()
    expect(screen.getByTestId('model-selector')).toHaveAttribute('data-disabled', 'true')
  })

  it('keeps the textarea and send button enabled without the prop', () => {
    renderComposer({})

    expect(screen.getByLabelText('composer.placeholder')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'composer.send' })).not.toBeDisabled()
  })

  it('keeps the stop button clickable while running when not disabled', () => {
    composerState.isRunning = true
    renderComposer({})

    expect(screen.getByRole('button', { name: 'composer.stop' })).not.toBeDisabled()
  })

  it('renders the send button disabled for empty input regardless of the prop', () => {
    composerState.value = '   '
    renderComposer({})

    expect(screen.getByRole('button', { name: 'composer.send' })).toBeDisabled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FileCard } from '@/components/transcript/tools/FileCard'
import { LayoutStateProvider } from '@/hooks/useLayoutState'
import type { ToolCallBlock } from '@/types/transcript'

function renderFile(args: Record<string, unknown>, result: unknown) {
  const block: ToolCallBlock = {
    id: 'b1',
    type: 'tool-call',
    toolName: 'read',
    toolCallId: 'c1',
    args,
    status: 'completed',
    result,
    timestamp: 1,
  }
  const openDockTab = vi.fn()
  const utils = render(
    <LayoutStateProvider>
      <FileCard block={block} args={args} isError={false} openDockTab={openDockTab} />
    </LayoutStateProvider>,
  )
  return { ...utils, openDockTab }
}

afterEach(cleanup)

describe('FileCard', () => {
  it('shows the file path and previews the result content', () => {
    const { openDockTab } = renderFile(
      { file_path: '/src/app.ts' },
      { content: [{ type: 'text', text: 'file body' }] },
    )
    expect(screen.getByTestId('tool-file-path')).toHaveTextContent('/src/app.ts')
    expect(screen.getByText('file body')).toBeVisible()
    expect(openDockTab).not.toHaveBeenCalled()
  })

  it('falls back to alternate path arg names', () => {
    renderFile({ filePath: '/x/y.rs' }, 'body')
    expect(screen.getByTestId('tool-file-path')).toHaveTextContent('/x/y.rs')
  })

  it('jump button opens the preview dock', () => {
    const { openDockTab } = renderFile({ file_path: '/src/app.ts' }, 'body')
    fireEvent.click(screen.getByText('tool.openFullOutput'))
    expect(openDockTab).toHaveBeenCalledWith('preview')
  })
})

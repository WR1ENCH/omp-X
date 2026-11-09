import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelSelector } from './ModelSelector'

describe('ModelSelector', () => {
  it('renders the honest empty state when no models event has arrived', () => {
    render(<ModelSelector models={[]} selected={null} onSelect={vi.fn()} />)

    // No mock data: before the omp:available-models event arrives the control
    // must surface t('model.unavailable'), not a generic label that hides the
    // missing data source.
    expect(screen.getByText('model.unavailable')).toBeInTheDocument()
    // The control stays disabled until real data arrives.
    expect(screen.getByRole('button', { name: 'composer.model' })).toBeDisabled()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Browse from '../pages/Browse'
import { mockListings } from '../data'

// tests for FR3
describe('FR3: Browse page', () => {
  it('Test 1: listings that are active are shown, and those that are sold are hidden', () => {
    render(<Browse />)

    const active = mockListings.filter((item) => item.status === 'active')
    const sold = mockListings.filter((item) => item.status === 'sold')

    for (const item of active) {
      expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
    }
    for (const item of sold) {
      expect(screen.queryByRole('heading', { name: item.title })).not.toBeInTheDocument()
    }
    expect(screen.getAllByRole('article')).toHaveLength(active.length)
  })
})

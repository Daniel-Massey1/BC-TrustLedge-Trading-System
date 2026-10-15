import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

// tests for FR2
describe('FR2: Create listing', () => {
  async function openCreatePage(user) {
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Create Listing' }))
  }

  it('Test 1: a completed form posting, Should succeeded', async () => {
    const user = userEvent.setup()
    await openCreatePage(user)

    await user.type(screen.getByLabelText('Title'), 'Road bike')
    await user.type(screen.getByLabelText('Description'), 'Size 54, recently serviced.')
    await user.type(screen.getByLabelText(/Price/), '0.05')
    await user.click(screen.getByRole('button', { name: 'Upload listing' }))

    expect(screen.getByRole('status')).toHaveTextContent('Listing created')
    expect(screen.getByRole('heading', { name: 'Browse listings' })).toBeInTheDocument()
  })

  it('Test 2: empty form posting, Should fail', async () => {
    const user = userEvent.setup()
    await openCreatePage(user)

    await user.click(screen.getByRole('button', { name: 'Upload listing' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create listing' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { WalletProvider } from '../wallet/WalletProvider'
import { TEST_WALLET } from './setup'
import { registerListing } from '../wallet/escrow'

// Fake the escrow contract: registering seller and price returns contract listing id 7
vi.mock('../wallet/escrow', async (importOriginal) => ({
  ...(await importOriginal()),
  registerListing: vi.fn(async () => 7),
}))


beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (options?.method === 'POST') {
      return { ok: true, json: async () => ({ message: 'Listing created successfully', listing_id: 1 }) }
    }
    return { ok: true, json: async () => [] }
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})


function postRequests() {
  return fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
}

// tests for FR2
describe('FR2: Create listing', () => {
  async function openCreatePage(user) {
    render(
      <WalletProvider>
        <App />
      </WalletProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Create Listing' }))
    // wait for the fake MetaMask wallet to connect so the form shows
    await screen.findByRole('heading', { name: 'Create listing' })
  }

  it('Test 1: a completed form posting, Should succeeded', async () => {
    const user = userEvent.setup()
    await openCreatePage(user)

    await user.type(screen.getByLabelText('Title'), 'Road bike')
    await user.type(screen.getByLabelText('Description'), 'Size 54, recently serviced.')
    await user.type(screen.getByLabelText(/Price/), '0.05')
    await user.click(screen.getByRole('button', { name: 'Upload listing' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Listing created')
    expect(screen.getByRole('heading', { name: 'Browse listings' })).toBeInTheDocument()

  
    expect(postRequests()).toHaveLength(1)
    const sent = postRequests()[0][1].body
    expect(sent.get('title')).toBe('Road bike')
    expect(sent.get('description')).toBe('Size 54, recently serviced.')
    expect(sent.get('price')).toBe('0.05')
    // the listing is posted under the connected MetaMask wallet
    expect(sent.get('seller_wallet')).toBe(TEST_WALLET)
    // seller and price were registered with the contract, and its id saved with the listing
    expect(registerListing).toHaveBeenCalledWith('0.05')
    expect(sent.get('chain_listing_id')).toBe('7')
  })

  it('Test 2: empty form posting, Should fail', async () => {
    const user = userEvent.setup()
    await openCreatePage(user)

    await user.click(screen.getByRole('button', { name: 'Upload listing' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Create listing' })).toBeInTheDocument()
    expect(postRequests()).toHaveLength(0)
    expect(registerListing).not.toHaveBeenCalled()
  })
})

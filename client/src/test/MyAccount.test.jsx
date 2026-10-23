import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyAccount from '../pages/MyAccount'
import { WalletProvider } from '../wallet/WalletProvider'
import { TEST_WALLET } from './setup'
import { cancelListing, readCompletedTrades } from '../wallet/escrow'

// Fake the escrow contract: 3 completed trades, no open trades, nothing to withdraw
vi.mock('../wallet/escrow', async (importOriginal) => ({
  ...(await importOriginal()),
  cancelListing: vi.fn(async () => ({})),
  readCompletedTrades: vi.fn(async () => 3),
  readMyTrades: vi.fn(async () => []),
  readPendingWithdrawal: vi.fn(async () => '0.0'),
}))

// create fake listings for the logged-in seller
const onContract = { listing_id: 1, chain_listing_id: 9, title: 'Road bike', price: '0.05', seller_wallet: TEST_WALLET, status: 'active', image_url: null }
const oldListing = { listing_id: 2, chain_listing_id: null, title: 'Old keyboard', price: '0.03', seller_wallet: TEST_WALLET, status: 'active', image_url: null }

// fake server: seller listings, sync and delete all succeed
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (options?.method) return { ok: true, json: async () => ({ message: 'ok' }) }
    return { ok: true, json: async () => [onContract, oldListing] }
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function requests(method) {
  return fetch.mock.calls.filter(([, options]) => options?.method === method)
}

async function renderAccount() {
  render(
    <WalletProvider>
      <MyAccount />
    </WalletProvider>,
  )
  await screen.findByRole('heading', { name: 'Road bike' })
}

// the box on the page for one of the seller's listings
function listingBox(title) {
  return within(screen.getByRole('heading', { name: title }).closest('.box'))
}

// tests for My Account
describe('My Account: listings and trade count', () => {
  it('Test 1: shows the completed trades count from the contract (FR8)', async () => {
    await renderAccount()

    expect(readCompletedTrades).toHaveBeenCalledWith(TEST_WALLET)
    const card = within(screen.getByText('Completed trades').closest('.box'))
    expect(await card.findByText('3')).toBeInTheDocument()
  })

  it('Test 2: cancelling a contract listing cancels it in the contract, then syncs', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await renderAccount()

    await user.click(listingBox('Road bike').getByRole('button', { name: 'Delete Listing' }))

    expect(cancelListing).toHaveBeenCalledWith(9)
    expect(requests('POST')[0][0]).toContain('/api/chain-listings/9/sync')
    // the database-only delete is not used for contract listings
    expect(requests('DELETE')).toHaveLength(0)
    expect(await screen.findByRole('status')).toHaveTextContent('Listing cancelled successfully!')
    expect(listingBox('Road bike').getByText('Status: cancelled')).toBeInTheDocument()
  })

  it('Test 3: cancelling an old listing (not on the contract) deletes it from the database', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await renderAccount()

    await user.click(listingBox('Old keyboard').getByRole('button', { name: 'Delete Listing' }))

    expect(cancelListing).not.toHaveBeenCalled()
    expect(requests('DELETE')).toHaveLength(1)
    expect(requests('DELETE')[0][0]).toContain('/api/listings/2')
    expect(await screen.findByRole('status')).toHaveTextContent('Listing cancelled successfully!')
  })

  it('Test 4: saying no to the confirm box, or rejecting in MetaMask, keeps the listing', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    await renderAccount()
    const remove = listingBox('Road bike').getByRole('button', { name: 'Delete Listing' })

    // "Cancel" on the confirm box: nothing happens
    confirm.mockReturnValueOnce(false)
    await user.click(remove)
    expect(cancelListing).not.toHaveBeenCalled()

    // rejected in MetaMask: error shown, not synced, still active
    confirm.mockReturnValueOnce(true)
    cancelListing.mockRejectedValueOnce({ code: 'ACTION_REJECTED' })
    await user.click(remove)
    expect(await screen.findByRole('alert')).toHaveTextContent('Transaction rejected in MetaMask.')
    expect(requests('POST')).toHaveLength(0)
    expect(listingBox('Road bike').getByText('Status: active')).toBeInTheDocument()
  })
})

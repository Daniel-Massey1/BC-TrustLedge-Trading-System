import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Browse from '../pages/Browse'
import { WalletProvider } from '../wallet/WalletProvider'
import { TEST_WALLET } from './setup'
import { buyListing } from '../wallet/escrow'

// Fake the escrow contract so no real MetaMask transaction is sent
vi.mock('../wallet/escrow', async (importOriginal) => ({
  ...(await importOriginal()),
  buyListing: vi.fn(async () => ({})),
}))

const OTHER_SELLER = '0x2222222222222222222222222222222222222222'

// create fake listings
const forSale = { listing_id: 1, chain_listing_id: 5, title: 'Road bike', description: 'Size 54', price: '0.05', seller_wallet: OTHER_SELLER, status: 'active', image_url: null }
const myOwn = { listing_id: 2, chain_listing_id: 6, title: 'Desk lamp', description: 'Warm white', price: '0.006', seller_wallet: TEST_WALLET, status: 'active', image_url: null }
const oldListing = { listing_id: 3, chain_listing_id: null, title: 'Old keyboard', description: 'Brown switches', price: '0.03', seller_wallet: OTHER_SELLER, status: 'active', image_url: null }

// fake server: GET returns the listings, POST (sync) succeeds
function fakeServer(listings) {
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (options?.method === 'POST') return { ok: true, json: async () => ({ status: 'reserved' }) }
    return { ok: true, json: async () => listings }
  }))
}

function syncRequests() {
  return fetch.mock.calls.filter(([url, options]) => options?.method === 'POST' && url.includes('/sync'))
}

// change what the fake MetaMask returns (logged out, or wrong network)
function fakeWallet({ accounts = [TEST_WALLET], chainId = '0xaa36a7' }) {
  const original = window.ethereum.request
  vi.spyOn(window.ethereum, 'request').mockImplementation(async (args) => {
    if (args.method === 'eth_accounts') return accounts
    if (args.method === 'eth_chainId') return chainId
    return original(args)
  })
}

async function renderBrowse(setMessage = vi.fn()) {
  render(
    <WalletProvider>
      <Browse setMessage={setMessage} />
    </WalletProvider>,
  )
  await screen.findAllByRole('article')
  return setMessage
}

async function openDetails(user, title) {
  await user.click(screen.getByRole('button', { name: `View details for ${title}` }))
  return screen.getByRole('dialog')
}

beforeEach(() => fakeServer([forSale, myOwn, oldListing]))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// tests for FR4
describe('FR4: Buying a listing', () => {
  it('Test 1: buying pays the listing price into escrow and removes it from Browse', async () => {
    const user = userEvent.setup()
    const setMessage = await renderBrowse()

    const dialog = await openDetails(user, 'Road bike')
    const buy = within(dialog).getByRole('button', { name: 'Buy for 0.05 SepoliaETH' })
    // wait for the fake wallet to connect so the button is enabled
    await vi.waitFor(() => expect(buy).toBeEnabled())
    await user.click(buy)

    // the listing (with its contract id and price) was sent to the escrow contract
    expect(buyListing).toHaveBeenCalledTimes(1)
    expect(buyListing).toHaveBeenCalledWith(expect.objectContaining({ listing_id: 1, chain_listing_id: 5, price: '0.05' }))

    // the database status was synced from the contract
    expect(syncRequests()).toHaveLength(1)
    expect(syncRequests()[0][0]).toContain('/api/chain-listings/5/sync')

    // the bought listing is gone and the user is told where to track it
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Road bike' })).not.toBeInTheDocument()
    expect(setMessage).toHaveBeenCalledWith('Payment locked in escrow. Track it in My Account.')
  })

  it('Test 2: buying is blocked for your own listing and listings not on the contract', async () => {
    const user = userEvent.setup()
    await renderBrowse()

    const cases = [
      { title: 'Desk lamp', price: '0.006', reason: 'This is your listing.' },
      { title: 'Old keyboard', price: '0.03', reason: 'This listing was posted before payments were enabled.' },
    ]

    for (const { title, price, reason } of cases) {
      const dialog = await openDetails(user, title)
      expect(await within(dialog).findByText(reason)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: `Buy for ${price} SepoliaETH` })).toBeDisabled()
      await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    }

    expect(buyListing).not.toHaveBeenCalled()
  })

  it('Test 3: buying is blocked when logged out or on the wrong network', async () => {
    const cases = [
      { wallet: { accounts: [] }, reason: 'Log in with MetaMask to buy.' },
      { wallet: { chainId: '0x1' }, reason: 'Switch MetaMask to Sepolia to buy.' },
    ]

    for (const { wallet, reason } of cases) {
      const user = userEvent.setup()
      fakeWallet(wallet)
      const { unmount } = render(
        <WalletProvider>
          <Browse />
        </WalletProvider>,
      )
      await screen.findAllByRole('article')

      const dialog = await openDetails(user, 'Road bike')
      expect(await within(dialog).findByText(reason)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Buy for 0.05 SepoliaETH' })).toBeDisabled()

      unmount()
      vi.restoreAllMocks()
    }

    expect(buyListing).not.toHaveBeenCalled()
  })

  it('Test 4: a payment rejected in MetaMask shows an error and keeps the listing', async () => {
    buyListing.mockRejectedValueOnce({ code: 'ACTION_REJECTED' })
    const user = userEvent.setup()
    const setMessage = await renderBrowse()

    const dialog = await openDetails(user, 'Road bike')
    const buy = within(dialog).getByRole('button', { name: 'Buy for 0.05 SepoliaETH' })
    await vi.waitFor(() => expect(buy).toBeEnabled())
    await user.click(buy)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Transaction rejected in MetaMask.')
    // nothing was synced and the listing is still for sale
    expect(syncRequests()).toHaveLength(0)
    expect(setMessage).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Road bike', level: 3 })).toBeInTheDocument()
    // the user can try again
    expect(buy).toBeEnabled()
  })
})

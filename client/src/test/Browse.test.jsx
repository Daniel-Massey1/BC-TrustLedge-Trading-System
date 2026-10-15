import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Browse from '../pages/Browse'
import { WalletProvider } from '../wallet/WalletProvider'

// create fake listings
const testListings = [
  { listing_id: 1, title: 'Road bike', description: 'Size 54', price: '0.05', seller_wallet: '0x1111111111111111111111111111111111111111', status: 'active', image_url: null },
  { listing_id: 2, title: 'Desk lamp', description: 'Warm white', price: '0.006', seller_wallet: '0x1111111111111111111111111111111111111111', status: 'active', image_url: null },
  { listing_id: 3, title: 'Mechanical keyboard', description: 'Brown switches', price: '0.03', seller_wallet: '0x1111111111111111111111111111111111111111', status: 'sold', image_url: null },
]

// fake server so it can work without running the actual server
function fakeServer(listings) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => listings })))
}

afterEach(() => vi.unstubAllGlobals())

// tests for FR3
describe('FR3: Browse page', () => {
  it('Test 1: listings that are active are shown, and those that are sold are hidden', async () => {
    fakeServer(testListings)
    render(
      <WalletProvider>
        <Browse />
      </WalletProvider>,
    )

    const active = testListings.filter((item) => item.status === 'active')
    const sold = testListings.filter((item) => item.status === 'sold')

    for (const item of active) {
      expect(await screen.findByRole('heading', { name: item.title })).toBeInTheDocument()
    }
    for (const item of sold) {
      expect(screen.queryByRole('heading', { name: item.title })).not.toBeInTheDocument()
    }
    expect(screen.getAllByRole('article')).toHaveLength(active.length)
  })
})

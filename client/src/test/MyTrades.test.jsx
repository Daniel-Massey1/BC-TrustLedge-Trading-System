import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyTrades from '../pages/MyTrades'
import { TEST_WALLET } from './setup'
import {
  cancelTrade,
  confirmReceipt,
  markShipped,
  readMyTrades,
  readPendingWithdrawal,
  withdraw,
} from '../wallet/escrow'

// Fake the escrow contract: reads return test data, transactions succeed
vi.mock('../wallet/escrow', async (importOriginal) => ({
  ...(await importOriginal()),
  readMyTrades: vi.fn(),
  readPendingWithdrawal: vi.fn(),
  markShipped: vi.fn(async () => ({})),
  confirmReceipt: vi.fn(async () => ({})),
  cancelTrade: vi.fn(async () => ({})),
  withdraw: vi.fn(async () => ({})),
}))

const DAY = 24 * 60 * 60 * 1000

// create a fake trade from the contract
function trade(tradeId, role, status, createdAt = new Date()) {
  return { tradeId, chainListingId: tradeId + 10, role, status, amount: '0.05', createdAt }
}

// fake server: listing titles for each trade, and sync succeeds
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (options?.method === 'POST') return { ok: true, json: async () => ({}) }
    const id = url.split('/').pop()
    return { ok: true, json: async () => ({ title: `Item ${id}` }) }
  }))
  readPendingWithdrawal.mockResolvedValue('0.0')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

function syncRequests() {
  return fetch.mock.calls.filter(([url, options]) => options?.method === 'POST' && url.includes('/sync'))
}

async function renderTrades(trades) {
  readMyTrades.mockResolvedValue(trades)
  const onChange = vi.fn()
  render(<MyTrades wallet={TEST_WALLET} onChange={onChange} />)
  await screen.findByRole('heading', { name: 'Sales' })
  return onChange
}

// the box on the page for one trade
function tradeBox(tradeId) {
  return within(screen.getByText(new RegExp(`Trade #${tradeId} ·`)).closest('.box'))
}

// tests for FR5-FR7
describe('FR5-FR7: My trades', () => {
  it('Test 1: each party only sees the actions allowed for the trade status', async () => {
    await renderTrades([
      trade(1, 'seller', 'Funded'),
      trade(2, 'buyer', 'Shipped'),
      trade(3, 'seller', 'Shipped'),
      trade(4, 'buyer', 'Completed'),
      trade(5, 'seller', 'Refunded'),
    ])

    // seller of a paid trade: ship it or refund the buyer
    const funded = tradeBox(1)
    expect(funded.getByRole('button', { name: 'Mark shipped' })).toBeInTheDocument()
    expect(funded.getByRole('button', { name: 'Cancel and refund buyer' })).toBeInTheDocument()

    // buyer of a shipped trade: confirm receipt only
    const shipped = tradeBox(2)
    expect(shipped.getByRole('button', { name: 'Confirm receipt' })).toBeInTheDocument()
    expect(shipped.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()

    // seller of a shipped trade: waits for the buyer
    expect(tradeBox(3).queryByRole('button')).not.toBeInTheDocument()
    expect(tradeBox(3).getByText('Waiting for the buyer to confirm receipt.')).toBeInTheDocument()

    // finished trades have no actions
    expect(tradeBox(4).queryByRole('button')).not.toBeInTheDocument()
    expect(tradeBox(5).queryByRole('button')).not.toBeInTheDocument()

    // titles come from the database
    expect(screen.getByRole('heading', { name: 'Item 11' })).toBeInTheDocument()
  })

  it('Test 2: the buyer can only cancel once 7 days have passed', async () => {
    const user = userEvent.setup()
    const onChange = await renderTrades([
      // one minute short of 7 days: still waiting
      trade(1, 'buyer', 'Funded', new Date(Date.now() - 7 * DAY + 60 * 1000)),
      // exactly 7 days: allowed
      trade(2, 'buyer', 'Funded', new Date(Date.now() - 7 * DAY)),
    ])

    const early = tradeBox(1)
    expect(early.getByRole('button', { name: 'Cancel and get refund' })).toBeDisabled()
    expect(early.getByText(/you can cancel from/)).toBeInTheDocument()

    const ready = tradeBox(2)
    expect(ready.queryByText(/you can cancel from/)).not.toBeInTheDocument()
    await user.click(ready.getByRole('button', { name: 'Cancel and get refund' }))

    expect(cancelTrade).toHaveBeenCalledTimes(1)
    expect(cancelTrade).toHaveBeenCalledWith(2)
    expect(syncRequests()[0][0]).toContain('/api/chain-listings/12/sync')
    expect(onChange).toHaveBeenCalled()
  })

  it('Test 3: marking shipped needs a tracking reference', async () => {
    const user = userEvent.setup()
    const prompt = vi.spyOn(window, 'prompt')
    const onChange = await renderTrades([trade(1, 'seller', 'Funded')])
    const ship = tradeBox(1).getByRole('button', { name: 'Mark shipped' })

    // cancelled prompt, or only spaces: nothing is sent
    prompt.mockReturnValueOnce(null)
    await user.click(ship)
    prompt.mockReturnValueOnce('   ')
    await user.click(ship)
    expect(markShipped).not.toHaveBeenCalled()

    // a real tracking reference is sent to the contract (trimmed)
    prompt.mockReturnValueOnce('  NZP-123 ')
    await user.click(ship)
    expect(markShipped).toHaveBeenCalledWith(1, 'NZP-123')
    expect(syncRequests()[0][0]).toContain('/api/chain-listings/11/sync')
    expect(onChange).toHaveBeenCalled()
  })

  it('Test 4: confirming receipt releases the payment, and a failure shows an error', async () => {
    const user = userEvent.setup()
    const onChange = await renderTrades([trade(2, 'buyer', 'Shipped')])
    const confirm = tradeBox(2).getByRole('button', { name: 'Confirm receipt' })

    // rejected in MetaMask: error shown, nothing synced
    confirmReceipt.mockRejectedValueOnce({ code: 'ACTION_REJECTED' })
    await user.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent('Transaction rejected in MetaMask.')
    expect(syncRequests()).toHaveLength(0)
    expect(onChange).not.toHaveBeenCalled()

    // confirmed: contract called, listing synced, page refreshed
    await user.click(tradeBox(2).getByRole('button', { name: 'Confirm receipt' }))
    expect(confirmReceipt).toHaveBeenLastCalledWith(2)
    expect(syncRequests()[0][0]).toContain('/api/chain-listings/12/sync')
    expect(onChange).toHaveBeenCalled()
  })

  it('Test 5: withdraw is only offered when there is money to collect', async () => {
    const user = userEvent.setup()

    // nothing owed: no withdraw box
    readMyTrades.mockResolvedValue([])
    const { unmount } = render(<MyTrades wallet={TEST_WALLET} />)
    await screen.findByRole('heading', { name: 'Sales' })
    expect(screen.getByText('No sales yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw to my wallet' })).not.toBeInTheDocument()
    unmount()

    // money owed: shown, and withdrawing calls the contract and reloads
    readPendingWithdrawal.mockResolvedValue('0.05')
    const onChange = await renderTrades([])
    expect(screen.getByText('You have 0.05 SepoliaETH to collect from sales or refunds.')).toBeInTheDocument()

    readMyTrades.mockClear()
    await user.click(screen.getByRole('button', { name: 'Withdraw to my wallet' }))
    expect(withdraw).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalled()
    await vi.waitFor(() => expect(readMyTrades).toHaveBeenCalled())
  })
})

import { useEffect, useState } from 'react'
import {
  BUYER_CANCEL_DELAY_DAYS,
  cancelTrade,
  confirmReceipt,
  markShipped,
  readMyTrades,
  readPendingWithdrawal,
  txErrorMessage,
  withdraw,
} from '../wallet/escrow'

const API_URL = 'http://localhost:3001'

const STATUS_LABELS = {
  Funded: 'Paid, waiting for shipping',
  Shipped: 'Shipped',
  Completed: 'Completed',
  Refunded: 'Cancelled and refunded',
}

// When the buyer is allowed to cancel (FR7: 7 days after paying)
function buyerCancelDate(trade) {
  return new Date(trade.createdAt.getTime() + BUYER_CANCEL_DELAY_DAYS * 24 * 60 * 60 * 1000)
}

// Sales and purchases from the escrow contract, with the action each party can take.
// onChange runs after any transaction so the rest of My Account can refresh.
function MyTrades({ wallet, onChange }) {
  const [trades, setTrades] = useState([])
  const [titles, setTitles] = useState({})
  const [pending, setPending] = useState('0.0')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  // Time the trades were loaded, for the buyer's 7-day cancel check
  const [loadedAt, setLoadedAt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [myTrades, owed] = await Promise.all([readMyTrades(wallet), readPendingWithdrawal(wallet)])

        // Titles come from the database, matched by the contract's listing id
        const ids = [...new Set(myTrades.map((t) => t.chainListingId))]
        const found = {}
        await Promise.all(
          ids.map(async (id) => {
            const response = await fetch(`${API_URL}/api/chain-listings/${id}`).catch(() => null)
            if (response?.ok) found[id] = (await response.json()).title
          }),
        )

        if (cancelled) return
        setTrades(myTrades)
        setTitles(found)
        setPending(owed)
        setLoadedAt(Date.now())
      } catch (err) {
        console.error('Error loading trades:', err)
        if (!cancelled) setError('Could not load your trades from the escrow contract.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [wallet, reloadKey])

  // Runs a transaction, then syncs the listing status and refreshes the page
  async function run(key, action, chainListingId) {
    setBusy(key)
    setError('')
    try {
      await action()
      if (chainListingId) {
        await fetch(`${API_URL}/api/chain-listings/${chainListingId}/sync`, { method: 'POST' }).catch(() => {})
      }
      setReloadKey((n) => n + 1)
      onChange?.()
    } catch (err) {
      setError(txErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  function handleShip(trade) {
    const trackingRef = window.prompt('Tracking reference for this parcel:')
    if (!trackingRef?.trim()) return
    run(trade.tradeId, () => markShipped(trade.tradeId, trackingRef.trim()), trade.chainListingId)
  }

  function renderActions(trade) {
    const id = trade.tradeId
    const disabled = busy !== null

    if (trade.status === 'Funded' && trade.role === 'seller') {
      return (
        <div className="box-actions">
          <button className="btn" onClick={() => handleShip(trade)} disabled={disabled}>
            Mark shipped
          </button>
          <button
            className="text-btn"
            onClick={() => run(id, () => cancelTrade(id), trade.chainListingId)}
            disabled={disabled}
          >
            Cancel and refund buyer
          </button>
        </div>
      )
    }

    if (trade.status === 'Funded' && trade.role === 'buyer') {
      const canCancelFrom = buyerCancelDate(trade)
      const canCancel = loadedAt >= canCancelFrom.getTime()
      return (
        <div className="box-actions">
          <button
            className="text-btn"
            onClick={() => run(id, () => cancelTrade(id), trade.chainListingId)}
            disabled={disabled || !canCancel}
          >
            Cancel and get refund
          </button>
          {!canCancel && (
            <p className="box-note">
              If it hasn't shipped, you can cancel from {canCancelFrom.toLocaleDateString('en-NZ')}.
            </p>
          )}
        </div>
      )
    }

    if (trade.status === 'Shipped' && trade.role === 'buyer') {
      return (
        <div className="box-actions">
          <button
            className="btn"
            onClick={() => run(id, () => confirmReceipt(id), trade.chainListingId)}
            disabled={disabled}
          >
            Confirm receipt
          </button>
        </div>
      )
    }

    if (trade.status === 'Shipped' && trade.role === 'seller') {
      return <p className="box-note">Waiting for the buyer to confirm receipt.</p>
    }

    return null
  }

  function renderList(role, emptyText) {
    const list = trades.filter((t) => t.role === role)
    if (list.length === 0) return <div className="box trade-box">{emptyText}</div>

    return list.map((trade) => (
      <div key={trade.tradeId} className="box" style={{ marginBottom: '12px', padding: '16px' }}>
        <h4>{titles[trade.chainListingId] ?? `Listing #${trade.chainListingId}`}</h4>
        <p>
          {trade.amount} SepoliaETH · {STATUS_LABELS[trade.status]}
        </p>
        <p className="box-note">
          Trade #{trade.tradeId} · {trade.createdAt.toLocaleDateString('en-NZ')}
        </p>
        {busy === trade.tradeId ? <p className="box-note">Confirm in MetaMask…</p> : renderActions(trade)}
      </div>
    ))
  }

  if (loading) return <div className="box trade-box">Loading trades...</div>

  return (
    <>
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {Number(pending) > 0 && (
        <div className="box" style={{ marginBottom: '12px', padding: '16px' }}>
          <p>You have {pending} SepoliaETH to collect from sales or refunds.</p>
          <div className="box-actions">
            <button className="btn" onClick={() => run('withdraw', withdraw)} disabled={busy !== null}>
              {busy === 'withdraw' ? 'Confirm in MetaMask…' : 'Withdraw to my wallet'}
            </button>
          </div>
        </div>
      )}

      <h3>Sales</h3>
      {renderList('seller', 'No sales yet.')}

      <h3>Buying</h3>
      {renderList('buyer', "You haven't bought anything yet.")}
    </>
  )
}

export default MyTrades

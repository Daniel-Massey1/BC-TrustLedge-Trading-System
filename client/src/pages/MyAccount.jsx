
import { useEffect, useState } from 'react'
import { useWallet } from '../wallet/useWallet'
import { RequireWallet } from '../wallet/RequireWallet'
import { WalletCards } from '../wallet/WalletCards'
import { cancelListing, readCompletedTrades, txErrorMessage } from '../wallet/escrow'
import MyTrades from './MyTrades'

const API_URL = 'http://localhost:3001'

function MyAccount() {
  const { account } = useWallet()

  return (
    <div className="account">
      <h2>My account</h2>

      {/* Shows the login page instead if no wallet is connected */}
      <RequireWallet action="view your account">
        {/* key resets the page when the user switches account in MetaMask */}
        <AccountContent key={account} wallet={account} />
      </RequireWallet>
    </div>
  )
}

function AccountContent({ wallet }) {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [completedTrades, setCompletedTrades] = useState(null)
  const { isCorrectNetwork, refreshBalance } = useWallet()
  // Bumped after a transaction so listings and the trade count reload
  const [refreshKey, setRefreshKey] = useState(0)

  function handleTradeChange() {
    setRefreshKey((n) => n + 1)
    refreshBalance()
  }

  // FR8: read the completed trades count from the escrow contract
  useEffect(() => {
    if (!isCorrectNetwork) return
    let cancelled = false
    readCompletedTrades(wallet)
      .then((count) => !cancelled && setCompletedTrades(count))
      .catch((err) => console.error('Error reading completed trades:', err))
    return () => {
      cancelled = true
    }
  }, [wallet, isCorrectNetwork, refreshKey])

  useEffect(() => {
    async function loadListings() {
      try {
        const response = await fetch(
          `${API_URL}/api/sellers/${wallet}/listings`
        )

        if (!response.ok) {
          throw new Error('Failed to load your listings')
        }

        const data = await response.json()
        setListings(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadListings()
  }, [wallet, refreshKey])

  async function handleDelete(item) {
    const listingId = item.listing_id
    const confirmed = window.confirm(
      'Are you sure you want to cancel this listing?'
    )

    if (!confirmed) return

    setDeletingId(listingId)
    setError('')
    setMessage('')

    try {
      if (item.chain_listing_id) {
        // Cancel in the escrow contract, then copy the status to the database
        try {
          await cancelListing(item.chain_listing_id)
        } catch (err) {
          throw new Error(txErrorMessage(err))
        }
        await fetch(`${API_URL}/api/chain-listings/${item.chain_listing_id}/sync`, { method: 'POST' })
      } else {
        // Older listings that were never registered with the contract
        const response = await fetch(
          `${API_URL}/api/listings/${listingId}`,
          { method: 'DELETE' }
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to cancel listing')
        }
      }

      setListings((previous) =>
        previous.map((item) =>
          item.listing_id === listingId
            ? { ...item, status: 'cancelled' }
            : item
        )
      )

      setMessage('Listing cancelled successfully!')
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <WalletCards completedTrades={isCorrectNetwork ? completedTrades : null} />

      <h3>My listings</h3>

      {message && (
        <p role="status" style={{ color: 'green' }}>
          {message}
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {loading ? (
        <div className="box trade-box">Loading listings...</div>
      ) : listings.length === 0 ? (
        <div className="box trade-box">
          You haven't created any listings yet.
        </div>
      ) : (
        <div className="account-listings">
          {listings.map((item) => (
            <div
              key={item.listing_id}
              className="box"
              style={{ marginBottom: '12px', padding: '16px' }}
            >
              <h4>{item.title}</h4>

              <p>Price: {item.price} SepoliaETH</p>
              <p>Status: {item.status}</p>

              {item.image_url && (
                <img
                  src={`${API_URL}${item.image_url}`}
                  alt={item.title}
                  style={{
                    width: '140px',
                    maxWidth: '100%',
                    borderRadius: '8px',
                    display: 'block',
                    marginBottom: '12px'
                  }}
                />
              )}

              {item.status === 'active' && (
                <button
                  className="btn"
                  style={{
                    backgroundColor: '#b42318',
                    color: 'white',
                    marginTop: '10px'
                  }}
                  onClick={() => handleDelete(item)}
                  disabled={deletingId !== null}
                >
                  {deletingId === item.listing_id
                    ? 'Deleting...'
                    : 'Delete Listing'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isCorrectNetwork ? (
        <MyTrades wallet={wallet} onChange={handleTradeChange} />
      ) : (
        <div className="box trade-box">Switch MetaMask to Sepolia to see your trades.</div>
      )}
    </>
  )
}

export default MyAccount

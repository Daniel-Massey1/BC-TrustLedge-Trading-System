
import { useEffect, useState } from 'react'
import { useWallet } from '../wallet/useWallet'
import { RequireWallet } from '../wallet/RequireWallet'
import { WalletCards } from '../wallet/WalletCards'

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
  }, [wallet])

  async function handleDelete(listingId) {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this listing?'
    )

    if (!confirmed) return

    setDeletingId(listingId)
    setError('')
    setMessage('')

    try {
      const response = await fetch(
        `${API_URL}/api/listings/${listingId}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel listing')
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
      <WalletCards />

      <h3>Selling</h3>

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
                  onClick={() => handleDelete(item.listing_id)}
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

      <h3>Buying</h3>
      <div className="box trade-box" />
    </>
  )
}

export default MyAccount

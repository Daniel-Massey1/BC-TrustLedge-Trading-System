import { useEffect, useState } from 'react'
import './App.css'

// Sample listings until the API exists
const mockListings = [
  {
    id: 1,
    title: 'Sony WH-1000XM4 headphones',
    description: 'Noise-cancelling headphones in good condition. Comes with the case and charging cable.',
    price: '0.045',
    seller: '0x3fA2…9c1E',
    status: 'active', // 'active' | 'reserved' | 'sold'
  },
  {
    id: 2,
    title: 'Vintage denim jacket',
    description: 'Size M, light wash. Some fading on the sleeves but no rips or stains.',
    price: '0.012',
    seller: '0x81bD…44a0',
    status: 'active',
  },
  {
    id: 3,
    title: 'Nintendo Switch Lite',
    description: 'Turquoise, barely used. Includes the charger, no games.',
    price: '0.060',
    seller: '0x5C09…e7B3',
    status: 'active',
  },
  {
    id: 4,
    title: 'Desk lamp, warm white',
    description: 'Adjustable arm and three brightness levels. Works perfectly.',
    price: '0.006',
    seller: '0xA7e1…0d2F',
    status: 'active',
  },
  {
    id: 5,
    title: 'Mechanical keyboard',
    description: 'Brown switches, full size. Already sold, so it should not show on Browse.',
    price: '0.030',
    seller: '0x2bE4…71Cc',
    status: 'sold',
  },
]


const ETH_TO_NZD = 6000

function toNZD(price) {
  return (Number(price) * ETH_TO_NZD).toLocaleString('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  })
}

function App() {
  const [page, setPage] = useState('browse')
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState(null) // the actual file, sent to the API later
  const [preview, setPreview] = useState(null) // temporary URL so we can show it
  const [message, setMessage] = useState('')
  const [sort, setSort] = useState('')
  const [selected, setSelected] = useState(null) // the listing open in the details view

  // Close the details view with the Escape key
  useEffect(() => {
    if (!selected) return
    const onKey = (e) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const filteredListings = mockListings
    .filter((item) => item.status === 'active') // hide reserved and sold listings
    .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'price-low') return Number(a.price) - Number(b.price)
      if (sort === 'price-high') return Number(b.price) - Number(a.price)
      if (sort === 'newest') return b.id - a.id 
      return 0
    })

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return

    if (preview) URL.revokeObjectURL(preview) // free the old preview
    setImage(file)
    setPreview(URL.createObjectURL(file))
  }

  function handleSubmit(e) {
    e.preventDefault()

    const listing = { title, description, price, image }

    // TODO: send to the API once it exists
    console.log('New listing:', listing)


    setTitle('')
    setDescription('')
    setPrice('')
    setImage(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setPage('browse')

    
    setMessage('Listing created')
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <>
      <header className="header">
        <h1>TrustLedge Trading</h1>
        <button className="nav-link" onClick={() => setPage('browse')}>
          Browse
        </button>
        <button className="nav-link" onClick={() => setPage('create')}>
          Create Listing
        </button>
        <button className="nav-link" onClick={() => setPage('account')}>
          My Account
        </button>
        <button className="btn login-btn">Login</button>
      </header>

      <main className="page">
        {message && (
          <div className="toast" role="status">
            {message}
          </div>
        )}

        {page === 'browse' && (
          <div className="browse">
            <h2>Browse listings</h2>
            

            <div className="browse-controls">
              <label className="search-bar">
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
                <input
                  type="search"
                  placeholder="Search for items…"
                  aria-label="Search listings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                className="sort-select"
                aria-label="Sort listings"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="" disabled>
                  Sort by
                </option>
                <option value="newest">Newest first</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </div>

            {filteredListings.length === 0 ? (
              <p className="no-listings">No listings found</p>
            ) : (
              <div className="card-grid">
                {filteredListings.map((item) => (
                  <article key={item.id} className="card">
                    <button
                      className="card-open"
                      aria-label={`View details for ${item.title}`}
                      onClick={() => setSelected(item)}
                    />
                    <div className="card-image" />
                    <div className="card-body">
                      <h3 title={item.title}>{item.title}</h3>
                      <div className="card-price-box">
                        <p className="card-price">{item.price} SepoliaETH</p>
                        <p className="card-nzd">≈ {toNZD(item.price)} NZD</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {page === 'create' && (
          <>
            <h2>Create listing</h2>

            <form className="listing-form" onSubmit={handleSubmit}>
              <label>
                Title
                <input
                  type="text"
                  placeholder="e.g. Watch"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label>
                Description
                <textarea
                  rows="5"
                  placeholder="Insert description here"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <label>
                Price
                <span className="price-input">
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="e.g. 0.001"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                  SepoliaETH
                </span>
              </label>

              <label>
                Image
                <span className="image-box">
                  {preview ? (
                    <img src={preview} alt="Selected item" />
                  ) : (
                    <span>Click to choose an image</span>
                  )}
                  <input type="file" accept="image/png, image/jpeg" onChange={handleImage} />
                </span>
              </label>

              <button type="submit" className="btn submit-btn">
                Upload listing
              </button>
            </form>
          </>
        )}

        {page === 'account' && (
          <div className="account">
            <h2>My account</h2>

            <div className="account-cards">
              <div className="box">Wallet</div>
              <div className="box">Network</div>
              <div className="box">Completed trades</div>
            </div>

            <h3>Selling</h3>
            <div className="box trade-box" />

            <h3>Buying</h3>
            <div className="box trade-box" />
          </div>
        )}
      </main>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              ×
            </button>

            <div className="modal-image" />

            <div className="modal-info">
              <h2 id="modal-title">{selected.title}</h2>

              <div className="modal-price">
                <p className="card-price">{selected.price} SepoliaETH</p>
                <p className="card-nzd">≈ {toNZD(selected.price)} NZD</p>
              </div>

              <div className="modal-section">
                <h3>Description</h3>
                <p>{selected.description}</p>
              </div>

              <div className="modal-section">
                <h3>Seller</h3>
                <p className="seller-address">{selected.seller}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App

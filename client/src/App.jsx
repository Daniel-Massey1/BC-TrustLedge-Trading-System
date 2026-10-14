import { useState } from 'react'
import './App.css'

function App() {
  const [page, setPage] = useState('browse')
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState(null) // the actual file, sent to the API later
  const [preview, setPreview] = useState(null) // temporary URL so we can show it
  const [message, setMessage] = useState('')

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
              <select className="sort-select" aria-label="Sort listings" defaultValue="">
                <option value="" disabled>
                  Sort by
                </option>
                <option value="newest">Newest first</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select>
            </div>
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
    </>
  )
}

export default App

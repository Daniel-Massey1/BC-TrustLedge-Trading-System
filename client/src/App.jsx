import { useState } from 'react'
import './App.css'

function App() {
  const [page, setPage] = useState('home')
  const [search, setSearch] = useState('')

  return (
    <>
      <header className="header">
        <h1>TrustLedge Trading</h1>
        <button className="nav-link" onClick={() => setPage('page2')}>
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
        {page === 'page2' && (
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
            <h2>Create Listing</h2>
            <button className="btn" onClick={() => setPage('home')}>
              Back
            </button>
          </>
        )}

        {page === 'account' && (
          <>
            <h2>My Account</h2>
            <button className="btn" onClick={() => setPage('home')}>
              Back
            </button>
          </>
        )}
      </main>
    </>
  )
}

export default App

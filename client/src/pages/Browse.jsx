import { useEffect, useState } from 'react'
import { mockListings, toNZD } from '../data'

function Browse() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('')
  const [selected, setSelected] = useState(null) 


  useEffect(() => {
    if (!selected) return
    const onKey = (e) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const filteredListings = mockListings
    .filter((item) => item.status === 'active')
    .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'price-low') return Number(a.price) - Number(b.price)
      if (sort === 'price-high') return Number(b.price) - Number(a.price)
      if (sort === 'newest') return b.id - a.id
      return 0
    })

  return (
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
    </div>
  )
}

export default Browse

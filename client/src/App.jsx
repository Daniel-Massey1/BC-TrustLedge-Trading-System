import { useState } from 'react'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

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
      </header>

      <main className="page">
        {page === 'page2' && (
          <>
            <h2>Page 2</h2>
            <button className="btn" onClick={() => setPage('home')}>
              Back
            </button>
          </>
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

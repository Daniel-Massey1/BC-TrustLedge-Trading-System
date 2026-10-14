import { useState } from 'react'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

  return (
    <>
      <header className="header">
        <h1>TrustLedge Trading</h1>
      </header>

      <main className="page">
        {page === 'home' && (
          <button className="btn" onClick={() => setPage('page2')}>
            Go to Page 2
          </button>
        )}

        {page === 'page2' && (
          <>
            <h2>Page 2</h2>
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

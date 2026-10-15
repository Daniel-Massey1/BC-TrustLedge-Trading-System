import { useState } from 'react'
import './App.css'
import Browse from './pages/Browse'
import CreateListing from './pages/CreateListing'
import MyAccount from './pages/MyAccount'

function App() {
  const [page, setPage] = useState('browse')
  const [message, setMessage] = useState('')

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

        {page === 'browse' && <Browse />}
        {page === 'create' && <CreateListing setPage={setPage} setMessage={setMessage} />}
        {page === 'account' && <MyAccount />}
      </main>
    </>
  )
}

export default App

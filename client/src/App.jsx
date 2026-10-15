import { useState } from 'react'
import './App.css'
import Browse from './pages/Browse'
import CreateListing from './pages/CreateListing'
import MyAccount from './pages/MyAccount'
import { WalletButton } from './wallet/WalletButton'
import { WalletAlert } from './wallet/WalletAlert'
import { LoginPage } from './wallet/LoginPage'

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
        <WalletButton onLogin={() => setPage('login')} onOpenAccount={() => setPage('account')} />
      </header>

      <WalletAlert />

      <main className="page">
        {message && (
          <div className="toast" role="status">
            {message}
          </div>
        )}

        {page === 'browse' && <Browse setMessage={setMessage} />}
        {page === 'create' && <CreateListing setPage={setPage} setMessage={setMessage} />}
        {page === 'account' && <MyAccount />}
        {page === 'login' && <LoginPage onSuccess={() => setPage('account')} />}
      </main>
    </>
  )
}

export default App

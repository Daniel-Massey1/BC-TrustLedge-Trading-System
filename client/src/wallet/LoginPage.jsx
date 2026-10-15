import { useWallet } from './useWallet'

// Login page: the user logs in by connecting MetaMask (no username or password).
// onSuccess runs after a successful connection, e.g. to go to My Account.
export function LoginPage({ onSuccess, action = 'start trading' }) {
  const { isInstalled, connecting, connect, error } = useWallet()

  async function handleConnect() {
    const address = await connect()
    if (address) onSuccess?.()
  }

  return (
    <div className="login-card">
      <svg className="login-icon" aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
        <path d="M2.5 9.5h13" />
        <path d="M16 6V4.8a1.3 1.3 0 0 0-1.6-1.3L5 5.8" />
        <circle cx="17" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>

      <h2>Log in to TrustLedge</h2>
      <p>
        Connect your MetaMask wallet to {action}. Your wallet is your account, so there's no username or
        password to remember.
      </p>

      {isInstalled ? (
        <button className="btn login-connect" onClick={handleConnect} disabled={connecting}>
          {connecting ? 'Waiting for MetaMask…' : 'Connect MetaMask'}
        </button>
      ) : (
        <>
          <p className="login-warning">MetaMask isn't installed in this browser.</p>
          <a className="btn login-connect" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
            Install MetaMask
          </a>
          <p className="login-hint">After installing, refresh this page.</p>
        </>
      )}

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

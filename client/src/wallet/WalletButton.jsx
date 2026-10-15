import { useWallet } from './useWallet'
import { shortenAddress } from './format'

// Header button: "Login" until MetaMask is connected, then a status dot + the
// shortened wallet address (e.g. 0x2034…a5fc), like MetaMask shows it.
// The dot is green on the right network and amber on the wrong one.
export function WalletButton({ onLogin, onOpenAccount }) {
  const { account, isCorrectNetwork } = useWallet()

  if (!account) {
    return (
      <button className="btn login-btn" onClick={onLogin}>
        Login
      </button>
    )
  }

  return (
    <button
      className="btn login-btn wallet-chip"
      onClick={onOpenAccount}
      title={account}
      aria-label={`Connected as ${account}${isCorrectNetwork ? '' : ' (wrong network)'}. Open my account`}
    >
      <span className={`status-dot ${isCorrectNetwork ? '' : 'bad'}`} aria-hidden="true" />
      <span className="wallet-chip-address">{shortenAddress(account)}</span>
    </button>
  )
}

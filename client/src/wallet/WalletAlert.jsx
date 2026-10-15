import { useWallet } from './useWallet'
import { networkName, REQUIRED_NETWORK_NAME } from './networks'

// Banner under the header for wallet errors and wrong-network warnings
export function WalletAlert() {
  const { account, chainId, isCorrectNetwork, error, clearError, switchNetwork } = useWallet()

  // Connection errors are shown on the login page; this banner is for errors after login
  if (error && account) {
    return (
      <div className="wallet-alert" role="alert">
        <span>{error}</span>
        <button className="alert-action" onClick={clearError}>
          Dismiss
        </button>
      </div>
    )
  }

  if (account && !isCorrectNetwork) {
    return (
      <div className="wallet-alert" role="alert">
        <span>
          MetaMask is on <strong>{networkName(chainId)}</strong>. TrustLedge runs on {REQUIRED_NETWORK_NAME}, so
          buying and selling are disabled.
        </span>
        <button className="alert-action" onClick={switchNetwork}>
          Switch network
        </button>
      </div>
    )
  }

  return null
}

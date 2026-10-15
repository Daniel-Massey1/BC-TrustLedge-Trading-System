import { useState } from 'react'
import { useWallet } from './useWallet'
import { formatEth } from './format'
import { EXPLORER_URL, networkName, REQUIRED_NETWORK_NAME } from './networks'

// The Account / Network / Completed trades cards for the My Account page.
// completedTrades comes from the escrow contract (completedTrades / hasTraded)
// once that's wired up - pass it in as a prop.
export function WalletCards({ completedTrades = null }) {
  const { account, chainId, isCorrectNetwork, balance, disconnect, switchNetwork, refreshBalance } = useWallet()
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked - the address is still selectable
    }
  }

  return (
    <div className="account-cards">
      <div className="box">
        <p className="box-label">Wallet</p>
        <p className="box-value mono" title={account}>
          {account}
        </p>
        <div className="box-actions">
          <button className="text-btn" onClick={copyAddress}>
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <a className="text-btn" href={`${EXPLORER_URL}/address/${account}`} target="_blank" rel="noreferrer">
            View on Etherscan
          </a>
          <button className="text-btn" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>

      <div className="box">
        <p className="box-label">Network</p>
        <p className="box-value">
          <span className={`status-dot ${isCorrectNetwork ? '' : 'bad'}`} aria-hidden="true" />
          {networkName(chainId)}
        </p>
        {isCorrectNetwork ? (
          <p className="box-note">Balance: {formatEth(balance)} SepoliaETH{' '}
            <button className="text-btn" onClick={refreshBalance}>Refresh</button>
          </p>
        ) : (
          <div className="box-actions">
            <button className="text-btn" onClick={switchNetwork}>
              Switch to {REQUIRED_NETWORK_NAME}
            </button>
          </div>
        )}
      </div>

      <div className="box">
        <p className="box-label">Completed trades</p>
        <p className="box-value">{completedTrades ?? '—'}</p>
        <p className="box-note">
          {completedTrades === 0 ? 'New seller' : 'Read from the escrow contract'}
        </p>
      </div>
    </div>
  )
}


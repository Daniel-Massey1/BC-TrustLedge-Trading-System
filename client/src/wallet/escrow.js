import { BrowserProvider, Contract, keccak256, parseEther, toUtf8Bytes } from 'ethers'
// Written by contracts/scripts/deploy.js: { address, chainId, abi }
import deployment from '../contracts/TrustLedgeEscrow.json'

// The deployed escrow contract, connected through MetaMask.
// withSigner = true for transactions (MetaMask asks the user to confirm).
async function getEscrow(withSigner = false) {
  const provider = new BrowserProvider(window.ethereum)
  const runner = withSigner ? await provider.getSigner() : provider
  return new Contract(deployment.address, deployment.abi, runner)
}

// Sends a transaction and waits for it to be mined
async function send(method, ...args) {
  const escrow = await getEscrow(true)
  const tx = await escrow[method](...args)
  return tx.wait()
}

// ---------- Transactions (MetaMask asks the user to confirm) ----------

// FR2: registers the seller and price with the contract (title etc. stay in the database).
// Returns the contract's listing id, which is saved with the database listing.
export async function registerListing(price) {
  const escrow = await getEscrow(true)
  const receipt = await (await escrow.createListing(parseEther(String(price)))).wait()

  for (const log of receipt.logs) {
    const event = escrow.interface.parseLog(log)
    if (event?.name === 'ListingCreated') return Number(event.args.listingId)
  }
  throw new Error('Listing was not registered')
}

// FR4: pays the exact price into escrow
export async function buyListing(listing) {
  // Fingerprint of the listing as the buyer saw it, stored with the trade
  const listingHash = keccak256(
    toUtf8Bytes(JSON.stringify([listing.listing_id, listing.title, listing.description, listing.price])),
  )
  return send('createTrade', listing.chain_listing_id, listingHash, { value: parseEther(String(listing.price)) })
}

// MetaMask errors are long; this keeps the part a user can act on
export function txErrorMessage(err) {
  if (err?.code === 'ACTION_REJECTED') return 'Transaction rejected in MetaMask.'
  if (err?.code === 'INSUFFICIENT_FUNDS') return 'Not enough SepoliaETH for this transaction.'
  return err?.revert?.name ?? err?.shortMessage ?? err?.message ?? 'Transaction failed.'
}

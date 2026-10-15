import { BrowserProvider, Contract, formatEther, keccak256, parseEther, toUtf8Bytes } from 'ethers'
// Written by contracts/scripts/deploy.js: { address, chainId, abi }
import deployment from '../contracts/TrustLedgeEscrow.json'

// Trade status numbers used by the contract
export const TRADE_STATUS = ['None', 'Funded', 'Shipped', 'Completed', 'Refunded']
export const BUYER_CANCEL_DELAY_DAYS = 7

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

// ---------- Reads (free, no MetaMask popup) ----------

// FR8: number of completed trades for an account
export async function readCompletedTrades(account) {
  const count = await (await getEscrow()).hasTraded(account)
  return Number(count)
}

// SepoliaETH waiting to be withdrawn (sales and refunds are paid this way)
export async function readPendingWithdrawal(account) {
  const wei = await (await getEscrow()).pendingWithdrawals(account)
  return formatEther(wei)
}

// Every trade where the account is the buyer or seller, newest first
export async function readMyTrades(account) {
  const escrow = await getEscrow()
  const me = account.toLowerCase()
  const count = Number(await escrow.nextTradeId())
  const trades = []

  for (let id = count - 1; id >= 1; id--) {
    const t = await escrow.getTrade(id)
    const buyer = t.buyer.toLowerCase()
    const seller = t.seller.toLowerCase()
    if (buyer !== me && seller !== me) continue

    trades.push({
      tradeId: id,
      chainListingId: Number(t.listingId),
      role: seller === me ? 'seller' : 'buyer',
      amount: formatEther(t.amount),
      status: TRADE_STATUS[Number(t.status)],
      createdAt: new Date(Number(t.createdAt) * 1000),
    })
  }
  return trades
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

// FR5
export const markShipped = (tradeId, trackingRef) => send('markShipped', tradeId, trackingRef)
// FR6
export const confirmReceipt = (tradeId) => send('confirmReceipt', tradeId)
// FR7
export const cancelTrade = (tradeId) => send('cancelTrade', tradeId)
export const cancelListing = (chainListingId) => send('cancelListing', chainListingId)
// Collect money from sales or refunds
export const withdraw = () => send('withdraw')

// MetaMask errors are long; this keeps the part a user can act on
export function txErrorMessage(err) {
  if (err?.code === 'ACTION_REJECTED') return 'Transaction rejected in MetaMask.'
  if (err?.code === 'INSUFFICIENT_FUNDS') return 'Not enough SepoliaETH for this transaction.'
  return err?.revert?.name ?? err?.shortMessage ?? err?.message ?? 'Transaction failed.'
}

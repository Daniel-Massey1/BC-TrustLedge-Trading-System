const { Contract, JsonRpcProvider, parseEther } = require("ethers");
// Written by contracts/scripts/deploy.js: { address, chainId, abi }
const deployment = require("./src/contracts/TrustLedgeEscrow.json");

// Read-only connection to the deployed escrow contract
const provider = new JsonRpcProvider(
    process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"
);
const escrow = new Contract(deployment.address, deployment.abi, provider);

// Contract ListingStatus -> listings.status in the database
const STATUS_NAMES = [null, "active", "reserved", "sold", "cancelled"];

// The listing as the contract stores it: { seller, price (wei), status }
async function readChainListing(chainListingId) {
    const l = await escrow.getListing(chainListingId);
    return {
        seller: l.seller.toLowerCase(),
        price: l.price,
        status: STATUS_NAMES[Number(l.status)]
    };
}

module.exports = { readChainListing, parseEther };

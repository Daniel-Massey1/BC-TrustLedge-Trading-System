require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    // `npm run chain` starts this on http://127.0.0.1:8545 (chainId 31337)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Public testnet: ETH here is free from faucets and has no real value
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  // hardhat-gas-reporter (bundled with hardhat-toolbox). Every `npm test` run
  // writes gas used per function and per deployment to gas-report.txt.
  // The bug demo (npm run test:bugs) is skipped so it can't overwrite the real report.
  gasReporter: {
    enabled: !process.argv.some((arg) => arg.includes("test-bugs")),
    outputFile: "gas-report.txt",
    noColors: true,
    excludeContracts: ["EscrowTestParty", "BuggyEscrow"],
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
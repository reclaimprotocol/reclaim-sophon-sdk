import dotenv from 'dotenv'
dotenv.config()

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
// import "@matterlabs/hardhat-zksync";

import './tasks'

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      zksync: true,
    },
    sophonMainnet: {
      url: "https://rpc.sophon.xyz",
      ethNetwork: "mainnet",
      verifyURL: "https://verification-explorer.sophon.xyz/contract_verification",
      browserVerifyURL: "https://explorer.sophon.xyz/",
      enableVerifyURL: true,
      zksync: true,
      accounts: [process.env.WALLET_PRIVATE_KEY as string]
    },
    sophonTestnet: {
      url: "https://rpc.testnet.sophon.xyz",
      ethNetwork: "sepolia",
      verifyURL: "https://api-explorer-verify.testnet.sophon.xyz/contract_verification",
      browserVerifyURL: "https://explorer.testnet.sophon.xyz/",
      enableVerifyURL: true,
      zksync: true,
      accounts: [process.env.WALLET_PRIVATE_KEY as string]
    },
  },zksolc: {
    version: "latest",
    settings: {
    },
  },
  etherscan: {
    apiKey: {
      sophonTestnet: process.env.ETHERSCAN_SOPHON_API_KEY as string,
      sophonMainnet: process.env.ETHERSCAN_SOPHON_API_KEY as string,
    },
    customChains: [
      {
        network: "sophonTestnet",
        chainId: 531050104,
        urls: {
          apiURL: "https://api-testnet.sophscan.xyz/api",
          browserURL: "https://testnet.sophscan.xyz",
        },},
        {
          network: "sophonMainnet",
          chainId: 50104,
          urls: {
            apiURL: "https://api.sophscan.xyz/api",
            browserURL: "https://sophscan.xyz",
          },
        },
      ],
    }
};

export default config;

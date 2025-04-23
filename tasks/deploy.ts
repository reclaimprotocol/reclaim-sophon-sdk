import { task } from "hardhat/config";
import { utils, Wallet as ZkWallet, Provider, Wallet } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";
import * as dotenv from "dotenv";

dotenv.config();

export const getProvider = (hre: any) => {
  const rpcUrl = hre.network.config.url;
  if (!rpcUrl)
    throw `⛔️ RPC URL wasn't found in "${hre.network.name}"! Please add a "url" field to the network config in hardhat.config.ts`;

  // Initialize ZKsync Provider
  const provider = new Provider(rpcUrl);

  return provider;
};

export const getWallet = (hre: any, privateKey?: string) => {
  if (!privateKey) {
    // Get wallet private key from .env file
    if (!process.env.WALLET_PRIVATE_KEY) throw "⛔️ Wallet private key wasn't found in .env file!";
  }

  const provider = getProvider(hre);

  // Initialize ZKsync Wallet
  const wallet = new Wallet(privateKey ?? process.env.WALLET_PRIVATE_KEY!, provider);

  return wallet;
};

task("deploy", "Deployes the Reclaim contract").setAction(async (taskArgs, hre) => {
  const zkWallet = getWallet(hre);
  const deployer = new Deployer(hre, zkWallet);

  const deployerWallet = deployer.zkWallet;

  console.log(deployerWallet.address);

  const artifact = await deployer.loadArtifact("Reclaim");

  const params = utils.getPaymasterParams(
    "0x98546B226dbbA8230cf620635a1e4ab01F6A99B2", // Paymaster address
    {
      type: "General",
      innerInput: new Uint8Array(),
    }
  );

  const contract = await deployer.deploy(artifact, [], "create", {
    customData: {
      paymasterParams: params,
      gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    },
  });
  const CA = await contract.getAddress();
  console.log(CA);
});

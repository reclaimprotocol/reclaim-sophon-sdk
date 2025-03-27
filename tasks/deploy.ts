import { task, types } from "hardhat/config";
import { Reclaim } from "../src/types";
import { utils, Wallet as ZkWallet, Provider } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";
import { Wallet } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();
task("deploy", "Deployes the Reclaim contract").setAction(async (taskArgs, hre) => {
  const sk = process.env.WALLET_PRIVATE_KEY || "";
  console.log(sk);

  const zkProvider = Provider.getDefaultProvider(1); // or another zkSync provider

  const zkWallet = new ZkWallet(sk, zkProvider, hre.ethers.provider);

  const deployer = new Deployer(hre, zkWallet);

  const artifact = await deployer.loadArtifact("Reclaim");

  const params = utils.getPaymasterParams(
    "0x98546B226dbbA8230cf620635a1e4ab01F6A99B2", // Paymaster address
    {
      type: "General",
      innerInput: new Uint8Array(),
    }
  );

  const contract = await deployer.deploy(artifact, [], "create2", {
    customData: {
      paymasterParams: params,
      gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    },
  });
  console.log(contract.address);
});

import { task, types } from "hardhat/config";
import { Reclaim } from "../typechain-types";
import { utils, Wallet, Provider } from "zksync-ethers";
import { Deployer } from "@matterlabs/hardhat-zksync";

task("deploy", "Deployes the Reclaim contract").setAction(
  async (taskArgs, hre) => {
    const sk = process.env.WALLET_PRIVATE_KEY || "";

    const zkWallet = new Wallet(sk);

    const deployer = new Deployer(hre, zkWallet);

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
    console.log(contract.address);
  }
);

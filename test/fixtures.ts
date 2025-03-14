import { ethers, run, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Reclaim } from "../src/types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import {
  deployReclaimContract,
  generateMockWitnessesList,
  randomEthAddress,
  randomWallet,
  randomiseWitnessList,
  deployProofStorageContract,
} from "./utils";

import {
  CompleteClaimData,
  createSignDataForClaim,
  fetchWitnessListForClaim,
  hashClaimInfo,
} from "@reclaimprotocol/crypto-sdk";

const NUM_WITNESSES = 5;
const MOCK_HOST_PREFIX = "localhost:555";

export async function deployFixture() {
  let signers: SignerWithAddress[] = await ethers.getSigners();
  let owner: SignerWithAddress = signers[0];
  let contract: Reclaim = await deployReclaimContract(
    ethers,
    owner
  );
  let proofContract: any = await deployProofStorageContract(ethers,  contract.address, owner);
  let { mockWitnesses, witnessesWallets } = await generateMockWitnessesList(
    NUM_WITNESSES,
    MOCK_HOST_PREFIX,
    ethers
  );
  let witnesses = await randomiseWitnessList(mockWitnesses);
  return { contract, witnesses, owner, witnessesWallets };
}

export async function proofsFixture() {
  let { contract, witnesses, owner, witnessesWallets } = await loadFixture(
    deployFixture
  );

  let superProofs;
  let user = await randomWallet(40, ethers.provider);
  await contract.addNewEpoch(witnesses, 5);
  const currentEpoch = await contract.currentEpoch();
  const timestampS = Math.floor(Date.now() / 1000);

  const createClaimInfo = (contextAddress) => {
    const provider = "uid-dob";
    const parameters = '{"dob":"0000-00-00"}';
    const context = contextAddress + "some-application-specific-context";
    return { provider, parameters, context };
  };

  const createClaimData = (
    claimInfo,
    epoch,
    address,
    timestampS
  ): CompleteClaimData => {
    const infoHash = hashClaimInfo(claimInfo);
    return {
      identifier: infoHash,
      owner: address,
      timestampS,
      epoch: epoch,
    };
  };

  const generateSignatures = async (
    claimData: CompleteClaimData,
    witnesses,
    witnessesWallets
  ) => {
    const claimDataStr = createSignDataForClaim(claimData);
    const signatures = await Promise.all(
      witnesses.map(async (w) => {
        const addr = await w.addr;
        return witnessesWallets[addr].signMessage(claimDataStr);
      })
    );
    return signatures;
  };

  const signers = await ethers.getSigners();
  const claimInfos = await Promise.all([
    createClaimInfo(signers[0].address),
    createClaimInfo(signers[1].address),
  ]);

  const claimDatas = await Promise.all([
    createClaimData(claimInfos[0], currentEpoch, user.address, timestampS),
    createClaimData(claimInfos[1], currentEpoch, user.address, timestampS),
  ]);

  const signatureForEachClaim = await Promise.all([
    generateSignatures(claimDatas[0], witnesses, witnessesWallets),
    generateSignatures(claimDatas[1], witnesses, witnessesWallets),
  ]);
  superProofs = [
    {
      claimInfo: claimInfos[0],
      signedClaim: {
        signatures: signatureForEachClaim[0],
        claim: claimDatas[0],
      },
    },
    {
      claimInfo: claimInfos[1],
      signedClaim: {
        signatures: signatureForEachClaim[1],
        claim: claimDatas[1],
      },
    },
  ];
  return { contract, witnesses, owner, user, superProofs };
}

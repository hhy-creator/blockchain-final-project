import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const ARBITER = process.env.ESCROW_ARBITER_ADDRESS;

const deployEscrow: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!ARBITER) {
    throw new Error("ESCROW_ARBITER_ADDRESS is required");
  }
  const { deployer } = await hre.getNamedAccounts();
  await hre.deployments.deploy("Escrow", {
    from: deployer,
    args: [ARBITER],
    log: true,
    autoMine: true,
  });
};
export default deployEscrow;
deployEscrow.tags = ["EscrowShipped"];

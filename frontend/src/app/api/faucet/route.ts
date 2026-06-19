import { NextResponse } from "next/server";
import { Keypair, TransactionBuilder, Networks, Contract, Address, rpc, nativeToScVal } from "@stellar/stellar-sdk";

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const secretKey = process.env.DEPLOYER_SECRET_KEY;
    const tokenId = process.env.NEXT_PUBLIC_TOKEN_ID;
    if (!secretKey || !tokenId) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const deployerKeypair = Keypair.fromSecret(secretKey);
    const server = new rpc.Server("https://soroban-testnet.stellar.org");

    // 1. Fetch deployer account
    const deployerAccount = await server.getAccount(deployerKeypair.publicKey());

    // 2. Call mint on token contract
    const contract = new Contract(tokenId);
    const operation = contract.call(
      "mint",
      new Address(address).toScVal(),
      nativeToScVal(BigInt("1000000000"), { type: "i128" }) // 100 USDC (7 decimals = 1,000,000,000 Stroops)
    );

    let tx = new TransactionBuilder(deployerAccount, {
      fee: "1000",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Prepare transaction (simulate and set footprint/auth)
    tx = await server.prepareTransaction(tx);

    // Sign with deployer keypair
    tx.sign(deployerKeypair);

    // Submit transaction
    const sendResponse = await server.sendTransaction(tx);
    if (sendResponse.status === "ERROR") {
      return NextResponse.json({ error: `Submission failed: ${JSON.stringify(sendResponse.errorResult)}` }, { status: 500 });
    }

    // Wait/poll for status
    let getResponse = await server.getTransaction(sendResponse.hash);
    let attempts = 0;
    while (
      ((getResponse.status as unknown as string) === "NOT_FOUND" || (getResponse.status as unknown as string) === "PENDING") &&
      attempts < 15
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await server.getTransaction(sendResponse.hash);
      attempts++;
    }

    if (getResponse.status === "SUCCESS") {
      return NextResponse.json({ success: true, hash: sendResponse.hash });
    } else {
      return NextResponse.json({ error: "Transaction failed to close successfully" }, { status: 500 });
    }
  } catch (err: any) {
    console.error("Faucet error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

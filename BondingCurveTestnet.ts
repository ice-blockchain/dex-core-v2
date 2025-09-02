import { TonClient, WalletContractV4, toNano, fromNano, Cell, Address, Transaction } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { compile } from '@ton/blueprint';
import { Sender, OpenedContract, beginCell, Builder, contractAddress } from '@ton/core';
import { RouterBCI as Router, swapPayload, provideLpPayload } from './wrappers/Router';
import { PoolBCI as Pool, defaultACoeff, defaultBCoeff, defautlCurveT } from './wrappers/Pool';
import { DEFAULT_JETTON_MINTER_CODE, DEFAULT_JETTON_WALLET_CODE, buildLibs, Deployer, DeployerConfig, getWalletBalance, JettonMinterContract, JettonWalletContract, metadataCell, onchainMetadata } from './libs';
import { preprocBuildContractsLocal } from './helpers/helpers';
import 'dotenv/config';

async function getWallet(client: TonClient, mnemonic: string) {
    const keyPair = await mnemonicToWalletKey(mnemonic.split(" "));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    const openedWallet = client.open(wallet);
    return {
        address: openedWallet.address,
        sender: openedWallet.sender(keyPair.secretKey)
    };
}

async function getWalletContract(client: TonClient, token: OpenedContract<JettonMinterContract>, user: Address) {
    const walletAddress = await token.getWalletAddress(user);
    return client.open(JettonWalletContract.createFromAddress(walletAddress));
}

export function buildLibFromCell(build: Cell): Cell {
    const lib = beginCell()
        .storeUint(2, 8)
        .storeBuffer(build.hash())
        .endCell();
    return new Cell({ exotic: true, bits: lib.bits, refs: lib.refs });
}

const getLatestTransaction = async (client: TonClient, address: Address): Promise<Transaction | null> => {
    try {
        const transactions = await client.getTransactions(address, { limit: 1 });
        return transactions.length > 0 ? transactions[0] : null;
    } catch (e) {
        return null;
    }
};

const waitForNewTransaction = async (
    client: TonClient,
    address: Address,
    successMessage: string = "New transaction found",
    timeoutMs: number = 60000,
    intervalMs: number = 2000
): Promise<string | null> => {

    const initialTransaction = await getLatestTransaction(client, address);
    const initialLt = initialTransaction?.lt ?? null;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));

        try {
            const latestTransaction = await getLatestTransaction(client, address);
            const latestLt = latestTransaction?.lt ?? null;

            if (latestLt && latestTransaction && (!initialLt || latestLt > initialLt)) {
                const txHash = latestTransaction.hash().toString('hex');
                console.log(`${successMessage}: ${txHash}`);
                return txHash;
            }
        } catch (e) {
            console.error(`Error during state polling: ${e}`);
        }
    }

    console.log(`Timeout reached. No state update found for address: ${address.toString()}`);
    return null;
};

async function getLatestDeployer(client: TonClient, deployerCode: Cell, libCode: Cell) {
    let id = 0;

    while (true) {
        if (id > 0xffffffff) throw new Error("id exhausted uint32");
        const deployerContract = Deployer.createFromConfig({ publib: libCode, id: id }, deployerCode);
        const deployerAddress = contractAddress(0, deployerContract.init!);

        const contract = await client.getContractState(deployerAddress);
        if (contract.state !== "frozen") {
            return client.open(deployerContract);
        }
        id++;
    }
    throw new Error("logic error getLatestDeployer");
}

type ContractCodeMap = {
    [name: string]: Cell;
};

async function deployLibs(client: TonClient, deployerCode: Cell, libs: ContractCodeMap, sender: Sender) {
    console.log("Deploying libraries...");

    for (const key in libs) {
        if (libs.hasOwnProperty(key)) {
            const libCode = libs[key];
            let latestDeployer = await getLatestDeployer(client, deployerCode, libCode);
            console.log(`- Deploying ${key} library...`);
            if (!await client.isContractDeployed(latestDeployer.address)) {
                await latestDeployer.sendDeploy(sender, toNano('0.5'));
                await waitForNewTransaction(client, latestDeployer.address, `${key} library deployed`);
            } else {
                console.log(`- ${key} library is already deployed at ${latestDeployer.address}!`);
            }
        }
    }
}

function filterRouterData(routerData: any) {
    return Object.keys(routerData).reduce((obj: any, key: string) => {
        const value = routerData[key];
        if (value instanceof Cell) {
            obj[key] = value.hash().toString('base64').substring(0, 64);
        } else {
            obj[key] = value;
        }
        return obj;
    }, {});
}

function addresswh(address: Address) {
    return `${address.workChain}, 0x${address.hash.toString('hex')}`;
}

async function main() {

    const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;
    const aliceMnemonic = process.env.ALICE_MNEMONIC;
    const bobMnemoic = process.env.BOB_MNEMONIC;

    if (!deployerMnemonic || !aliceMnemonic || !bobMnemoic) {
        throw new Error("DEPLOYER_MNEMONIC, ALICE_MNEMONIC and BOB_MNEMONIC have to be set in .env");
    }

    const client = new TonClient({
        endpoint: 'https://api.testnet.ice.io/http/v2/jsonRPC',
    });

    const deployer = await getWallet(client, deployerMnemonic);
    const alice = await getWallet(client, aliceMnemonic);
    const bob = await getWallet(client, bobMnemoic);

    console.log(`deployer: ${deployer.address}`);
    console.log(`alice: ${alice.address}`);
    console.log(`bob: ${bob.address}`);

    const creator = bob.address;
    const swapAddress = alice.address;

    preprocBuildContractsLocal({
        dexType: "bonding_curve",
        defaultIsLocked: 1,
        defaultLPFee: null,
        defaultProtocolFee: null,
        defaultExpACoeff: defaultACoeff,
        defaultExpBCoeff: defaultBCoeff,
        defaultCTokenForCurve: defautlCurveT,
        defaultCreatorAddress: addresswh(creator),
        defaultSwapAddress: addresswh(swapAddress),
        defaultSwapAddressExpirationTime: 60n,
    });

    const libs = {
        router: await compile('Router'),
        lpAccount: await compile('LPAccount'),
        lpWallet: await compile('LPWallet'),
        pool: await compile('Pool'),
        vault: await compile('Vault')
    };

    const deployerCode = await compile('Deployer');
    await deployLibs(client, deployerCode, libs, deployer.sender);

    const code = {
        router: buildLibFromCell(libs.router),
        lpWallet: buildLibFromCell(libs.lpWallet),
        lpAccount: buildLibFromCell(libs.lpAccount),
        pool: buildLibFromCell(libs.pool),
        vault: buildLibFromCell(libs.vault)
    };

    async function sendIon(sender: Sender, toAddress: Address, amount: bigint) {
        try {
            await sender.send({to: toAddress, value: amount});
            await waitForNewTransaction(client, toAddress, `Send ${fromNano(amount)} ION to ${toAddress}`);
        } catch (error) {
            console.error(`Failed to send ION to ${toAddress.toString()}:`, error);
        }
    }

    async function mintTokens(params: any) {
        let toAddress = params.to;
        let depositAmount = params.mintAmount ?? toNano(1000000);

        await params.token.sendMint(deployer.sender, {
            value: toNano(2),
            toAddress: toAddress,
            fwdAmount: toNano(1),
            masterMsg: {
                jettonAmount: depositAmount,
                jettonMinterAddress: params.token.address,
                responseAddress: toAddress
            }
        });

        await waitForNewTransaction(client, toAddress, `Mint ${fromNano(depositAmount)} to ${toAddress.toString()}`);
    }

    const deployJetton = async (params: any) => {
        const minter = client.open(JettonMinterContract.createFromConfig({
            totalSupply: 0,
            adminAddress: deployer.address,
            content: metadataCell(onchainMetadata({
                name: params.name,
            })),
            jettonWalletCode: DEFAULT_JETTON_WALLET_CODE
        }, DEFAULT_JETTON_MINTER_CODE));

        if (!await client.isContractDeployed(minter.address)) {
            await minter.sendDeploy(deployer.sender, toNano('0.05'));
            await waitForNewTransaction(client, minter.address, `Deploy jetton (${params.name}) ${minter.address}`);
            await mintTokens({ token: minter, to: deployer.address, mintAmount: params.mintAmount ?? undefined });
            await mintTokens({ token: minter, to: alice.address, mintAmount: params.mintAmount ?? undefined });
            await mintTokens({ token: minter, to: bob.address, mintAmount: params.mintAmount ?? undefined });
        } else {
            console.log(`Minter is already deployed at ${minter.address}!`);
        }
        return minter;
    };

    async function setupDex(params: any) {
        const router = client.open(Router.createFromConfig({
            id: params.routerId ?? 0,
            isLocked: false,
            adminAddress: deployer.address,
            lpAccountCode: code.lpAccount,
            lpWalletCode: code.lpWallet,
            poolCode: code.pool,
            vaultCode: code.vault
        }, code.router));

        if (!await client.isContractDeployed(router.address)) {
            await router.sendDeploy(deployer.sender, toNano('5'));
            await waitForNewTransaction(client, router.address, `Deploy router ${router.address}`);
        } else {
            console.log(`router is already deployed at ${router.address}!`);
        }

        const routerData = await router.getRouterData();
        console.log(`router data: ${JSON.stringify(filterRouterData(routerData), null, 2)}`);

        const name1 = params.createPool.name1 ?? "Token1";
        const name2 = params.createPool.name2 ?? "Token2";

        let jetton1 = await deployJetton({
            name: name1,
            router: router,
            mintAmount: params.createPool.amount1
        });

        let jetton2 = await deployJetton({
            name: name2,
            router: router,
            mintAmount: params.createPool.amount2
        });

        const routerWallet1 = await getWalletContract(client, jetton1, router.address);
        const routerWallet2 = await getWalletContract(client, jetton2, router.address);

        const poolAddress = await router.getPoolAddress({
            firstWalletAddress: routerWallet1.address,
            secondWalletAddress: routerWallet2.address
        });
        const pool = client.open(Pool.createFromAddress(poolAddress));

        async function UpdatePoolStatus() {
            await router.sendUpdatePoolStatus(deployer.sender, {
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address,
            }, toNano(2));
            await waitForNewTransaction(client, pool.address, "Update pool status");
        }

        let poolData = null;

        if (!await client.isContractDeployed(pool.address)) {
            await pool.sendDeploy(deployer.sender, toNano(5));
            await waitForNewTransaction(client, pool.address, "Feed pool, not actual deploy");
        } else {
            console.log(`pool is already deployed at ${pool.address}!`);
            poolData = await pool.getPoolData();
        }

        if (!poolData || poolData.isLocked) {
            await UpdatePoolStatus();
        }

        poolData = await pool.getPoolData();
        console.log(`pool data: ${JSON.stringify(poolData, null, 2)}`);

        if (poolData.leftReserve == 0n && poolData.rightReserve == 0n) {
            const wallet1 = await getWalletContract(client, jetton1, deployer.address);
            const jbalance1 = await getWalletBalance(wallet1);
            if (jbalance1 < params.createPool.amount1) {
                await mintTokens({ token: jetton1, to: deployer.address, mintAmount: params.createPool.amount1 });
            }
            const balance1 = await client.getBalance(wallet1.address);
            if (balance1 < toNano(5)) {
                await sendIon(deployer.sender, wallet1.address, toNano(5));
            }

            await wallet1.sendTransfer(deployer.sender, {
                value: toNano(2),
                jettonAmount: params.createPool.amount1,
                toAddress: router.address,
                responseAddress: deployer.address,
                fwdAmount: toNano(1),
                fwdPayload: provideLpPayload({
                    otherTokenAddress: routerWallet2.address,
                    minLpOut: 0n,
                    toAddress: deployer.address,
                    refundAddress: deployer.address,
                    deadline: Math.floor(Date.now() / 1000) + 3600
                })
            });

            // wait until pool receives the message
            await waitForNewTransaction(client, pool.address, `Provide liquidity ${name1}`);

            const wallet2 = await getWalletContract(client, jetton2, deployer.address);
            const jbalance2 = await getWalletBalance(wallet2);
            if (jbalance2 < params.createPool.amount2) {
                await mintTokens({ token: jetton2, to: deployer.address, mintAmount: params.createPool.amount2 });
            }
            const balance2 = await client.getBalance(wallet2.address);
            if (balance2 < toNano(5)) {
                await sendIon(deployer.sender, wallet2.address, toNano(5));
            }

            await wallet2.sendTransfer(deployer.sender, {
                value: toNano(2),
                jettonAmount: params.createPool.amount2,
                toAddress: router.address,
                responseAddress: deployer.address,
                fwdAmount: toNano(1),
                fwdPayload: provideLpPayload({
                    otherTokenAddress: routerWallet1.address,
                    minLpOut: 1n,
                    toAddress: deployer.address,
                    refundAddress: deployer.address,
                    deadline: Math.floor(Date.now() / 1000) + 3600
                })
            });

            // wait until pool receives the message
            await waitForNewTransaction(client, pool.address, `Provide liquidity ${name2}`);

            poolData = await pool.getPoolData();
            console.log(`pool data: ${JSON.stringify(poolData, null, 2)}`);
        }

        return { router, jetton1, jetton2, pool };
    }

    async function swap(params: any) {
        const routerWalletIn = await getWalletContract(client, params.tokenIn, params.router.address);
        const routerWalletOut = await getWalletContract(client, params.tokenOut, params.router.address);

        const walletIn = await getWalletContract(client, params.tokenIn, params.sender.address);
        const jbalanceIn = await getWalletBalance(walletIn);
        if (jbalanceIn < params.amountIn) {
            await mintTokens({ token: params.tokenIn, to: params.sender.address, mintAmount: params.amountIn });
        }
        const balanceIn = await client.getBalance(walletIn.address);
        if (balanceIn < toNano(10)) {
            await sendIon(deployer.sender, walletIn.address, toNano(10));
        }
        const balanceSender = await client.getBalance(params.sender.address);
        if (balanceSender < toNano(10)) {
            await sendIon(deployer.sender, params.sender.address, toNano(10));
        }

        await walletIn.sendTransfer(params.sender.sender, {
            value: toNano(4),
            jettonAmount: params.amountIn,
            toAddress: params.router.address,
            responseAddress: params.sender.address,
            fwdAmount: toNano(3),
            fwdPayload: swapPayload({
                otherTokenWallet: routerWalletOut.address,
                receiver: params.sender.address,
                minOut: params.minAmountOut ?? 1n,
                fwdGas: 0n,
                refFee: params.referral ? (params.refFee ?? 10n) : 0n,
                refAddress: params.referral?.address,
                refundAddress: params.sender.address,
                customPayload: params.customPayload ?? undefined,
                deadline: Math.floor(Date.now() / 1000) + 3600
            }),
        });

        // wait until router receives the message from pool
        await waitForNewTransaction(client, params.pool.address, "Swap");
    };

    const setup = await setupDex({
        createPool: {
            amount1: toNano(1000000),
            amount2: toNano(2000000),
        }
    });

    console.log("DEX setup complete. Now performing swap.");

    await swap({
        router: setup.router,
        sender: alice,
        tokenIn: setup.jetton1,
        tokenOut: setup.jetton2,
        amountIn: toNano(10),
        minAmountOut: 1n,
        pool: setup.pool
    });
}

main();

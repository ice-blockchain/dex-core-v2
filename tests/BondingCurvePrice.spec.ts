import { compile } from '@ton/blueprint';
import { Address, beginCell, Cell, toNano, fromNano } from '@ton/core';
import { Blockchain, SandboxContract, SendMessageResult, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import 'dotenv/config';
import { AddressMap, DEFAULT_JETTON_MINTER_CODE, DEFAULT_JETTON_WALLET_CODE, HOLE_ADDRESS, JettonContent, JettonMinterContract, JettonWalletContract, buildLibFromCell, buildLibs, divUp, getWalletBalance, jettonMinterStorageParser, jettonWalletStorageParser, maxBigint, metadataCell, onchainMetadata } from '../libs';
import { FEE_DIVIDER, GraphParamsWithoutPath, ONE_DEC, createMdGraphLocal, dumpRawCells, getLpAccDataNoFail, preprocBuildContractsLocal } from '../helpers/helpers';
import { BracketKeysType, BracketType, StorageParser } from '../libs/src/graph';
import { expectBounced, expectEqAddress, expectNotBounced, getWalletContract, SLIM_CONFIG_LEGACY } from '../libs/src/test-helpers';
import { LPAccount, lpAccStorageParser } from '../wrappers/LPAccount';
import { LPWallet, lpWalletStorageParser } from '../wrappers/LPWallet';
import { PoolBCI as Pool, poolBciStorageParser, defaultBCLPFee, defaultBCProtocolFee, defaultProtocolFeePCT, defaultACoeff, defaultBCoeff, defaultBaseUSDRate, defautlCurveT } from '../wrappers/Pool';
import { RouterBCI as Router, crossSwapPayload, provideLpPayload, routerStorageParser, swapPayload } from '../wrappers/Router';
import { Vault, vaultStorageParser } from '../wrappers/Vault';

function createMdGraphWithPath(params: GraphParamsWithoutPath) {
    return createMdGraphLocal({
        ...params,
        folderPath: "build/graph_bci/"
    })
}

// @ts-ignore
BigInt.prototype.toJSON = function () { return this.toString(); };

type SBCtrTreasury = SandboxContract<TreasuryContract>;
type SBCtrRouter = SandboxContract<Router>;
type SBCtrPool = SandboxContract<Pool>;
type SBCtrJettonMinter = SandboxContract<JettonMinterContract>;
type SBCtrJettonWallet = SandboxContract<JettonWalletContract>;
type SBCtrLPAccount = SandboxContract<LPAccount>;


type DeployJettonParams = {
    router?: SBCtrRouter,
    name: string,
    mintAmount?: bigint;
};

type SetupParams = {
    mintAmount?: bigint,
    createPool?: {
        name1?: string,
        name2?: string,
        amount1: bigint,
        amount2: bigint,
        debugGraph?: string,
        expectBounce1?: boolean,
        expectRefund1?: boolean,
        expectBounce2?: boolean,
        expectRefund2?: boolean,
        unlockPool?: boolean,
        expACoeff?: bigint,
        expBCoeff?: bigint,
        baseUSDRate?: bigint,
        ctokenToCurvePT?: bigint
    },
    routerId?: number;
};
type SetupResult = {
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    name1: string,
    name2: string,
    pool?: SBCtrPool;
};

type MintParams = {
    token: SBCtrJettonMinter,
    to: Address | SBCtrTreasury,
    mintAmount?: bigint;
};

type CreatePoolParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    amount1: bigint,
    amount2: bigint,
    minLpOut?: bigint,
    debugGraph?: string,
    expectBounce1?: boolean,
    expectRefund1?: boolean,
    expectBounce2?: boolean,
    expectRefund2?: boolean,
    expectRevert?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
    initTonDeposit?: bigint,
    unlockPool?: boolean,
};

type ProvideLpParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    minLpOut?: bigint,
    debugGraph?: string,
    expectBounce1?: boolean,
    expectRefund1?: boolean,
    expectBounce2?: boolean,
    expectRefund2?: boolean,
    expectRevert?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
    bothPositive0?: boolean,
    bothPositive1?: boolean,
    customPayload0?: Cell,
    fwdAmount0?: bigint,
    toAddress0?: Address,
    customPayload1?: Cell,
    fwdAmount1?: bigint,
    toAddress1?: Address,
} & ({
    amount1: Exclude<bigint, 0n>,
    amount2?: bigint | 0n,
} | {
    amount1?: bigint,
    amount2: bigint,
});

type SwapParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    tokenIn: SBCtrJettonMinter,
    tokenOut: SBCtrJettonMinter,
    amountIn: bigint,
    debugGraph?: string,
    expectBounce?: boolean,
    expectRefund?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
    referral?: SBCtrTreasury,
    customPayload?: Cell,
    minAmountOut?: bigint,
    refFee?: bigint,
};
type SwapResult = {
    routerWalletIn: SBCtrJettonWallet,
    routerWalletOut: SBCtrJettonWallet,
    senderWalletIn: SBCtrJettonWallet,
    senderWalletOut: SBCtrJettonWallet,
};

type CollectFeesParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    debugGraph?: string,
    expectBounce?: boolean,
    gas?: bigint,
};

type SetFeesParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    debugGraph?: string,
    expectBounce?: boolean,
    gas?: bigint,
    newLPFee: bigint,
    newProtocolFee: bigint,
    newProtocolFeeAddress: Address,
};

type SetPoolParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    debugGraph?: string,
    expectBounce?: boolean,
    bclpFee?: bigint;
    bcprotocolFee?: bigint;
    baseUSDRate?: bigint;
    sideToken?: SBCtrJettonMinter;
};
type UpdatePStatusParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    debugGraph?: string,
    expectBounce?: boolean,
};

type CrossRouterSwapParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    router2: SBCtrRouter,
    tokenIn: SBCtrJettonMinter,
    tokenMid: SBCtrJettonMinter,
    tokenFinal: SBCtrJettonMinter,
    amountIn: bigint,
    debugGraph?: string,
    expectBounce?: boolean,
    expectRefundIn?: boolean,
    expectRefundMid?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
    fwdGas2?: bigint,
    referral?: SBCtrTreasury,
    refFee?: bigint;
    minAmountOut1?: bigint,
    minAmountOut2?: bigint,
};

const HOUR_IN_SECONDS = 3600;

const calculateBondingCurveCTOut = (
    amountIn: number,
    creatorTokensSold: number,
    baseUSDRate: number,
): number => {
    const amount_in_usd_fp = amountIn * baseUSDRate;

    const a_coeff = 1.105 * 10**-6;
    const b_coeff = 7.056 * 10**-9;

    const exp_arg = b_coeff * creatorTokensSold;
    const exp_Bs1 = Math.exp(exp_arg);

    const term_inside_ln_numerator = amount_in_usd_fp * b_coeff;
    const term_inside_ln_div_A = term_inside_ln_numerator / a_coeff;

    const term_inside_ln_fp = term_inside_ln_div_A + exp_Bs1;
    const s2_calculated_scaled = (1 / b_coeff) * Math.log(term_inside_ln_fp);

    let amount_out_ct = s2_calculated_scaled - creatorTokensSold;

    if (amount_out_ct < 0)
        amount_out_ct = 0;

    return amount_out_ct;
};

const calculateConstantProductCTOut = (
    balanceIn: number,
    amountIn: number,
    balanceOut: number,
    maxInRatio: number
): number => {
    if (amountIn > balanceIn * maxInRatio) {
        throw new Error("max_in_ratio: Amount exceeds the maximum allowed ratio.");
    }

    const denominator = balanceIn + amountIn;
    const base = balanceIn / denominator;
    const complementOfBase = 1 - base;
    return balanceOut * complementOfBase;
}

const defaultLPFee = 20;
const defaultProtocolFee = 10;

describe('Bonding Curve Price swap', () => {
    let deployJetton: (params: DeployJettonParams) => Promise<SBCtrJettonMinter>,
        mintTokens: (params: MintParams) => Promise<void>,
        swap: (params: SwapParams) => Promise<SwapResult>,
        setFees: (params: SetFeesParams) => Promise<void>,
        setPoolParams: (params: SetPoolParams) => Promise<void>,
        updatePoolStatus: (params: UpdatePStatusParams) => Promise<void>,
        collectFees: (params: CollectFeesParams) => Promise<void>,
        crossRouterSwap: (params: CrossRouterSwapParams) => Promise<void>,
        provideLp: (params: ProvideLpParams) => Promise<SBCtrPool>,
        createPool: (params: CreatePoolParams) => Promise<SBCtrPool>,
        setupDex: (params: SetupParams) => Promise<SetupResult>;

    let code: { router: Cell; lpWallet: Cell; lpAccount: Cell; pool: Cell; vault: Cell; },
        myLibs: Cell | undefined,
        bc: Blockchain,
        deployer: SBCtrTreasury,
        alice: SBCtrTreasury,
        bob: SBCtrTreasury,
        initTimestamp = Math.floor(Date.now() / 1000),
        bracketMap: AddressMap<BracketKeysType> = new AddressMap(),
        storageMap: AddressMap<StorageParser> = new AddressMap(),
        addressMap: AddressMap<string> = new AddressMap();

    const setFromInitTimestamp = (amount: number) => {
        bc.now = initTimestamp + amount;
    };

    const advanceFromCurrentTS = (amount: number) => {
        if (typeof bc.now === "undefined") {
            throw new Error("blockchain time not manually set");
        }
        bc.now = bc.now + amount;
    };
    beforeAll(async () => {
        bc = await Blockchain.create();
        setFromInitTimestamp(0);

        deployer = await bc.treasury('deployer');
        const sender = deployer.address;

        preprocBuildContractsLocal({
            dexType: "bonding_curve",
            defaultProtocolFee: defaultProtocolFee,
            defaultIsLocked: 1,
            defaultLPFee: defaultLPFee,
            defaultBCLPFee: defaultBCLPFee,
            defaultBCProtocolFee: defaultBCProtocolFee,
            defaultProtocolFeePCT: defaultProtocolFeePCT,
            defaultExpACoeff: defaultACoeff,
            defaultExpBCoeff: defaultBCoeff,
            defaultBaseUSDRate: defaultBaseUSDRate,
            defaultCTokenForCurve: defautlCurveT,
            defaultSwapAddress: `${sender.workChain}, 0x${sender.hash.toString('hex')}`,
            defaultSwapAddressExpirationTime: 100n,
        });

        const _code = {
            router: await compile('Router'),
            lpAccount: await compile('LPAccount'),
            lpWallet: await compile('LPWallet'),
            pool: await compile('Pool'),
            vault: await compile('Vault')
        };

        if (process.env.DUMP_RAW_CELLS) {
            dumpRawCells(_code, "build/bciswap_raw_cells.json", "base64")
        }

        myLibs = buildLibs(_code);

        code = {
            router: buildLibFromCell(_code.router, "build/router.json"),
            lpWallet: buildLibFromCell(_code.lpWallet, "build/lpWallet.json"),
            lpAccount: buildLibFromCell(_code.lpAccount, "build/lpAccount.json"),
            pool: buildLibFromCell(_code.pool, "build/pool.json"),
            vault: buildLibFromCell(_code.vault, "build/vault.json")
        };

        mintTokens = async (params: MintParams) => {
            let toAddress = params.to instanceof Address ? params.to : params.to.address;
            let depositAmount = params.mintAmount ?? toNano(100000);
            let oldBalance = await getWalletBalance(await getWalletContract(bc, params.token, toAddress));
            let msgResult = await params.token.sendMint(deployer.getSender(), {
                value: toNano(2),
                toAddress: toAddress,
                fwdAmount: toNano(1),
                masterMsg: {
                    jettonAmount: depositAmount,
                    jettonMinterAddress: params.token.address,
                    responseAddress: toAddress
                }
            });
            expectNotBounced(msgResult.events);
            let balance = await getWalletBalance(await getWalletContract(bc, params.token, toAddress));
            expect(balance).toEqual(oldBalance + depositAmount);
        };

        deployJetton = async (params: DeployJettonParams) => {
            const minter = bc.openContract(JettonMinterContract.createFromConfig({
                totalSupply: 0,
                adminAddress: deployer.address,
                content: metadataCell(onchainMetadata({
                    name: params.name,
                })),
                jettonWalletCode: DEFAULT_JETTON_WALLET_CODE
            }, DEFAULT_JETTON_MINTER_CODE));

            try {
                await minter.getJettonData();
            } catch {
                let msgResult = await minter.sendDeploy(deployer.getSender(), toNano('0.05'));
                expect(msgResult.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: minter.address,
                    deploy: true,
                });
            }

            if (params.mintAmount) {
                await mintTokens({
                    to: deployer,
                    token: minter,
                    mintAmount: params.mintAmount
                });
                await mintTokens({
                    to: alice,
                    token: minter,
                    mintAmount: params.mintAmount
                });
                await mintTokens({
                    to: bob,
                    token: minter,
                    mintAmount: params.mintAmount
                });
            }

            addressMap.set(minter, `Jetton Minter<br/>${params.name}`);
            addressMap.set((await minter.getWalletAddress(deployer.address)), `Deployer<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(alice.address)), `Alice<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(bob.address)), `Bob<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(HOLE_ADDRESS)), `Hole<br/>${params.name}<br/>Wallet`);
            if (params.router) {
                const routerId = (await params.router.getRouterData()).id;
                addressMap.set((await minter.getWalletAddress(params.router.address)), `Router${routerId}<br/>${params.name}<br/>Wallet`);
            }

            storageMap.set(minter.address, jettonMinterStorageParser);
            storageMap.set((await minter.getWalletAddress(deployer.address)), jettonWalletStorageParser);
            storageMap.set((await minter.getWalletAddress(alice.address)), jettonWalletStorageParser);
            storageMap.set((await minter.getWalletAddress(bob.address)), jettonWalletStorageParser);
            storageMap.set((await minter.getWalletAddress(HOLE_ADDRESS)), jettonWalletStorageParser);
            if (params.router) {
                storageMap.set((await minter.getWalletAddress(params.router.address)), jettonWalletStorageParser);
            }
            return minter;
        };

        createPool = async (params: CreatePoolParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);
            let unlockPool = params.unlockPool ?? true;

            const routerId = (await router.getRouterData()).id;
            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let name1 = ((await params.token1.getJettonData()).content as JettonContent).name;
            let name2 = ((await params.token2.getJettonData()).content as JettonContent).name;
            addressMap.set(pool, `Pool${routerId}<br/>${name1}-${name2}`);
            bracketMap.set(pool, "rounded");
            storageMap.set(pool, poolBciStorageParser);

            let lpAcc = bc.openContract(LPAccount.createFromAddress(HOLE_ADDRESS));
            let oldAccData = await getLpAccDataNoFail(lpAcc);

            if (unlockPool) {
                await updatePoolStatus({
                    router: router,
                    token1: params.token1,
                    token2: params.token2,
                    debugGraph: typeof params.debugGraph !== "undefined" ? params.debugGraph + "_unlock" : undefined,
                });
            }

            // first token
            let wallet1 = await getWalletContract(bc, params.token1, sender);
            let oldBalance1 = await getWalletBalance(wallet1);
            let msgResult = await wallet1.sendTransfer(sender.getSender(), {
                value: params.gas ?? toNano(2),
                jettonAmount: params.amount1,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: provideLpPayload({
                    otherTokenAddress: routerWallet2.address,
                    minLpOut: 0n,
                    toAddress: sender.address,
                    refundAddress: sender.address,
                    deadline: initTimestamp + HOUR_IN_SECONDS
                })
            });
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph + "_1"
                });
            }
            if (params.expectBounce1 || params.expectRefund1 || params.expectRevert) {
                if (params.expectBounce1) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                let balance = await getWalletBalance(wallet1);
                if (params.expectRefund1)
                    expect(balance).toEqual(oldBalance1);
            } else {
                expectNotBounced(msgResult.events);
                let balance = await getWalletBalance(wallet1);
                expect(balance).toEqual(oldBalance1 - params.amount1);
            }

            lpAcc = bc.openContract(LPAccount.createFromAddress(await pool.getLPAccountAddress({ userAddress: sender.address })));

            // init pool balance
            msgResult = await pool.sendDeploy(sender.getSender(), BigInt(params.initTonDeposit ?? toNano(1)));
            expectNotBounced(msgResult.events);
            addressMap.set((await pool.getLPAccountAddress({ userAddress: deployer.address })), `Deployer<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getLPAccountAddress({ userAddress: alice.address })), `Alice<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getLPAccountAddress({ userAddress: bob.address })), `Bob<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getWalletAddress(deployer.address)), `Deployer<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(alice.address)), `Alice<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(bob.address)), `Bob<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(HOLE_ADDRESS)), `Hole<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);

            storageMap.set((await pool.getLPAccountAddress({ userAddress: deployer.address })), lpAccStorageParser);
            storageMap.set((await pool.getLPAccountAddress({ userAddress: alice.address })), lpAccStorageParser);
            storageMap.set((await pool.getLPAccountAddress({ userAddress: bob.address })), lpAccStorageParser);
            storageMap.set((await pool.getWalletAddress(deployer.address)), lpWalletStorageParser);
            storageMap.set((await pool.getWalletAddress(alice.address)), lpWalletStorageParser);
            storageMap.set((await pool.getWalletAddress(bob.address)), lpWalletStorageParser);
            storageMap.set((await pool.getWalletAddress(HOLE_ADDRESS)), lpWalletStorageParser);

            bracketMap.set((await pool.getLPAccountAddress({ userAddress: deployer.address })), "sub");
            bracketMap.set((await pool.getLPAccountAddress({ userAddress: alice.address })), "sub");
            bracketMap.set((await pool.getLPAccountAddress({ userAddress: bob.address })), "sub");

            addressMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet1.address
            })), `Deployer<br/>${name1}<br/>Vault${routerId}`);
            addressMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet1.address
            })), `Alice<br/>${name1}<br/>Vault${routerId}`);
            addressMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet1.address
            })), `Bob<br/>${name1}<br/>Vault${routerId}`);
            addressMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet2.address
            })), `Deployer<br/>${name2}<br/>Vault${routerId}`);
            addressMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet2.address
            })), `Alice<br/>${name2}<br/>Vault${routerId}`);
            addressMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet2.address
            })), `Bob<br/>${name2}<br/>Vault${routerId}`);
            bracketMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet1.address
            })), "flag");
            bracketMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet1.address
            })), "flag");
            bracketMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet1.address
            })), "flag");
            bracketMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet2.address
            })), "flag");
            bracketMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet2.address
            })), "flag");
            bracketMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet2.address
            })), "flag");
            storageMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet1.address
            })), vaultStorageParser);
            storageMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet1.address
            })), vaultStorageParser);
            storageMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet1.address
            })), vaultStorageParser);
            storageMap.set((await router.getVaultAddress({
                userAddress: deployer.address,
                tokenWalletAddress: routerWallet2.address
            })), vaultStorageParser);
            storageMap.set((await router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: routerWallet2.address
            })), vaultStorageParser);
            storageMap.set((await router.getVaultAddress({
                userAddress: bob.address,
                tokenWalletAddress: routerWallet2.address
            })), vaultStorageParser);

            // second token
            let wallet2 = await getWalletContract(bc, params.token2, sender);
            let oldBalance2 = await getWalletBalance(wallet2);
            msgResult = await wallet2.sendTransfer(sender.getSender(), {
                value: BigInt(params.gas ?? toNano(2)),
                jettonAmount: params.amount2,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: provideLpPayload({
                    otherTokenAddress: routerWallet1.address,
                    minLpOut: 1n,
                    toAddress: sender.address,
                    refundAddress: sender.address,
                    deadline: initTimestamp + HOUR_IN_SECONDS
                })
            });
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph + "_2"
                });
            }
            if (params.expectBounce2 || params.expectRefund2 || params.expectRevert) {
                if (params.expectBounce2) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                let balance = await getWalletBalance(wallet2);
                if (params.expectRefund2)
                    expect(balance).toEqual(oldBalance2);
            } else {
                expectNotBounced(msgResult.events);
                let balance = await getWalletBalance(wallet2);
                expect(balance).toEqual(oldBalance2 - params.amount2);

                let poolData = await pool.getPoolData();
                expect(poolData.leftReserve).toEqual(poolData.leftJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2);
                expect(poolData.rightReserve).toEqual(poolData.rightJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2);
                expect((await pool.getJettonData()).totalSupply).toBeGreaterThan(0n);
            }

            if (params.expectRevert) {
                let poolData = await pool.getPoolData();
                let accData = await getLpAccDataNoFail(lpAcc);
                const isLeft = routerWallet1.address.equals(poolData.leftJettonAddress);
                expect(isLeft ? accData.leftAmount - oldAccData.leftAmount : accData.rightAmount - oldAccData.rightAmount).toEqual(params.amount1);
                expect(!isLeft ? accData.leftAmount - oldAccData.leftAmount : accData.rightAmount - oldAccData.rightAmount).toEqual(params.amount2);
            }

            return pool;
        };

        setupDex = async (params: SetupParams) => {
            params.mintAmount = typeof params.mintAmount === "undefined" ? toNano(100000) : params.mintAmount;
            if (params.createPool)
                params.mintAmount = params.mintAmount < maxBigint(params.createPool?.amount1, params.createPool?.amount2)
                    ? maxBigint(params.createPool?.amount1, params.createPool?.amount2) * 2n : params.mintAmount;

            const routerId = params.routerId ?? 0;
            let router = bc.openContract(Router.createFromConfig({
                id: routerId,
                isLocked: false,
                adminAddress: deployer.address,
                lpAccountCode: code.lpAccount,
                lpWalletCode: code.lpWallet,
                poolCode: code.pool,
                vaultCode: code.vault
            }, code.router));

            let msgResult = await router.sendDeploy(deployer.getSender(), toNano('5'));
            expect(msgResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: router.address,
                deploy: true,
            });
            addressMap.set(router, `Router${routerId}`);
            bracketMap.set(router, "diamond");
            storageMap.set(router, routerStorageParser);

            const name1 = params.createPool?.name1 ?? "Token1";
            const name2 = params.createPool?.name2 ?? "Token2";

            let jetton1 = await deployJetton({
                name: name1,
                router: router,
                mintAmount: params.mintAmount
            });
            let jetton2 = await deployJetton({
                name: name2,
                router: router,
                mintAmount: params.mintAmount
            });

            let pool: SBCtrPool | undefined = undefined;
            if (params.createPool) {
                pool = await createPool({
                    router: router,
                    token1: jetton1,
                    token2: jetton2,
                    ...params.createPool,
                });
            }
            return {
                router: router,
                token1: jetton1,
                token2: jetton2,
                name1: name1,
                name2: name2,
                pool: pool
            };
        };

        provideLp = async (params: ProvideLpParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();

            let lpAcc = bc.openContract(LPAccount.createFromAddress(await pool.getLPAccountAddress({ userAddress: sender.address })));
            let oldAccData = await getLpAccDataNoFail(lpAcc);
            let lpWallet = bc.openContract(LPWallet.createFromAddress(await pool.getWalletAddress(sender.address)));
            let oldLpBalance = await getWalletBalance(lpWallet);

            if ((typeof params.amount1 !== "undefined") && (typeof params.amount2 !== "undefined")) {

            } else if (params.amount1) {
                params.amount1 = BigInt(params.amount1);
                const isLeft = routerWallet1.address.equals(oldPoolData.leftJettonAddress);
                const reserve = isLeft ? oldPoolData.leftReserve : oldPoolData.rightReserve;
                const lpMint = params.amount1 * oldPoolJData.totalSupply / reserve;
                params.amount2 = divUp(lpMint * (isLeft ? oldPoolData.rightReserve : oldPoolData.leftReserve), oldPoolJData.totalSupply);
            } else if (params.amount2) {
                params.amount2 = BigInt(params.amount2);
                const isLeft = routerWallet2.address.equals(oldPoolData.leftJettonAddress);
                const reserve = isLeft ? oldPoolData.leftReserve : oldPoolData.rightReserve;
                const lpMint = params.amount2 * oldPoolJData.totalSupply / reserve;
                params.amount1 = divUp(lpMint * (isLeft ? oldPoolData.rightReserve : oldPoolData.leftReserve), oldPoolJData.totalSupply);
            } else {
                throw new Error("incorrect lp params");
            }

            // first token
            let wallet1 = await getWalletContract(bc, params.token1, sender);
            let oldBalance1 = await getWalletBalance(wallet1);

            if (params.amount1) {
                let msgResult = await wallet1.sendTransfer(sender.getSender(), {
                    value: params.gas ?? toNano(2),
                    jettonAmount: params.amount1,
                    toAddress: router.address,
                    responseAddress: sender.address,
                    fwdAmount: params.fwdGas ?? toNano("1"),
                    fwdPayload: provideLpPayload({
                        otherTokenAddress: routerWallet2.address,
                        minLpOut: params.minLpOut,
                        bothPositive: params.bothPositive0,
                        customPayload: params.customPayload0,
                        fwdAmount: params.fwdAmount0,
                        toAddress: params.toAddress0 || sender.address,
                        refundAddress: sender.address,
                        deadline: initTimestamp + HOUR_IN_SECONDS
                    })
                });
                if (params.debugGraph) {
                    createMdGraphWithPath({
                        msgResult: msgResult,
                        storageMap: storageMap,
                        addressMap: addressMap,
                        bracketMap: bracketMap,
                        output: params.debugGraph + "_1"
                    });
                }
                if (params.expectBounce1 || params.expectRefund1 || params.expectRevert) {
                    if (params.expectBounce1) {
                        expectBounced(msgResult.events);
                    } else {
                        expectNotBounced(msgResult.events);
                    }

                    let balance = await getWalletBalance(wallet1);
                    if (params.expectRefund1)
                        expect(balance).toEqual(oldBalance1);
                } else {
                    expectNotBounced(msgResult.events);
                    let balance = await getWalletBalance(wallet1);
                    expect(balance).toEqual(oldBalance1 - params.amount1);
                }
            }

            // second token
            let wallet2 = await getWalletContract(bc, params.token2, sender);
            let oldBalance2 = await getWalletBalance(wallet2);
            if (params.amount2) {
                let msgResult = await wallet2.sendTransfer(sender.getSender(), {
                    value: params.gas ?? toNano(2),
                    jettonAmount: params.amount2,
                    toAddress: router.address,
                    responseAddress: sender.address,
                    fwdAmount: params.fwdGas ?? toNano("1"),
                    fwdPayload: provideLpPayload({
                        otherTokenAddress: routerWallet1.address,
                        minLpOut: params.minLpOut,
                        bothPositive: params.bothPositive1,
                        customPayload: params.customPayload1,
                        fwdAmount: params.fwdAmount1,
                        toAddress: params.toAddress1 || sender.address,
                        refundAddress: sender.address,
                        deadline: initTimestamp + HOUR_IN_SECONDS
                    })
                });
                if (params.debugGraph) {
                    createMdGraphWithPath({
                        msgResult: msgResult,
                        storageMap: storageMap,
                        addressMap: addressMap,
                        bracketMap: bracketMap,
                        output: params.debugGraph + "_2"
                    });
                }
                if (params.expectBounce2 || params.expectRefund2 || params.expectRevert) {
                    if (params.expectBounce2) {
                        expectBounced(msgResult.events);
                    } else {
                        expectNotBounced(msgResult.events);
                    }

                    let balance = await getWalletBalance(wallet2);
                    if (params.expectRefund2)
                        expect(balance).toEqual(oldBalance2);
                } else {
                    expectNotBounced(msgResult.events);
                    let balance = await getWalletBalance(wallet2);
                    expect(balance).toEqual(oldBalance2 - params.amount2);
                    let poolData = await pool.getPoolData();
                    let poolJData = await pool.getJettonData();
                    if (params.minLpOut && (params.minLpOut > 0)) {
                        //expect(poolData.leftReserve).toEqual(oldPoolData.leftReserve + (poolData.leftJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2));
                        //expect(poolData.rightReserve).toEqual(oldPoolData.rightReserve + (poolData.rightJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2));
                        expect(poolJData.totalSupply).toBeGreaterThan(oldPoolJData.totalSupply);

                        let lpBalance = await getWalletBalance(lpWallet);
                        expect(lpBalance).toBeGreaterThan(oldLpBalance);
                    }
                }
            }
            if (params.expectRevert) {
                let accData = await getLpAccDataNoFail(lpAcc);
                const isLeft = routerWallet1.address.equals(oldPoolData.leftJettonAddress);
                expect(isLeft ? accData.leftAmount - oldAccData.leftAmount : accData.rightAmount - oldAccData.rightAmount).toEqual(params.amount1);
                expect(!isLeft ? accData.leftAmount - oldAccData.leftAmount : accData.rightAmount - oldAccData.rightAmount).toEqual(params.amount2);
            }

            return pool;
        };

        swap = async (params: SwapParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            const feeDiv = BigInt(FEE_DIVIDER);
            let routerWalletIn = await getWalletContract(bc, params.tokenIn, router.address);
            let routerWalletOut = await getWalletContract(bc, params.tokenOut, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWalletIn.address,
                secondWalletAddress: routerWalletOut.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();

            const refFee = params.referral ? (params.refFee ?? 10n) : 0n;
            const minAmountOut = (params.amountIn * (feeDiv - oldPoolData.lpFee) / feeDiv) * (feeDiv - oldPoolData.protocolFee - refFee) / feeDiv;

            let walletIn = await getWalletContract(bc, params.tokenIn, sender.address);
            let walletOut = await getWalletContract(bc, params.tokenOut, sender.address);
            let oldBalanceIn = await getWalletBalance(walletIn);
            let oldBalanceOut = await getWalletBalance(walletOut);

            let msgResult = await walletIn.sendTransfer(sender.getSender(), {
                value: params.gas ?? toNano(2),
                jettonAmount: params.amountIn,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: swapPayload({
                    otherTokenWallet: routerWalletOut.address,
                    receiver: sender.address,
                    minOut: params.minAmountOut ?? minAmountOut,
                    fwdGas: 0n,
                    refFee: params.refFee,
                    refAddress: params.referral?.address,
                    refundAddress: sender.address,
                    customPayload: params.customPayload,
                    deadline: initTimestamp + HOUR_IN_SECONDS
                }),
            });
            if (0) { // debug return code of failed swap
                for (const event of msgResult.events) {
                    if (event.type == 'message_sent') {
                        const bodyCell = event.body; // The 'body' property should be a Cell
                        // Begin parsing the cell to get a Slice
                        let slice = bodyCell.beginParse();
                        // 1. Load the operation code (32 bits)
                        const opCode = slice.loadUint(32);
                        // Check if this is indeed the 'pay_to' message
                        if (opCode === 0x657b54f5) {
                            const queryId = slice.loadUintBig(64);
                            // 2. Load '_to_address'
                            const to_address = slice.loadAddress();
                            // 3. Load '_excesses_address'
                            const excesses_address = slice.loadAddress();
                            // 4. Load '_original_caller'
                            const original_caller = slice.loadAddress();
                            // 5. Load '_exit_code' (32 bits)
                            const exit_code = slice.loadUint(32);
                            console.log(exit_code);
                        }
                    }
                }
            }
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }

            let poolData = await pool.getPoolData();
            const poolTx = msgResult.transactions.find(tx => {
                const poolAddressHashBigInt = BigInt('0x' + pool.address.hash.toString('hex'));
                return tx.address === poolAddressHashBigInt; // This is a correct BigInt comparison
            });
            if (params.expectBounce || params.expectRefund) {
                if (params.expectBounce) {
                    expectBounced(msgResult.events);
                    if (poolTx) {
                        expect(poolTx.externals.length).toEqual(0);
                    }
                } else {
                    expectNotBounced(msgResult.events);
                    if (poolTx) {
                        if (params.customPayload) {
                            expect(poolTx.externals.length).toEqual(2);
                        } else {
                            expect(poolTx.externals.length).toEqual(0);
                        }
                    }
                }
                if (!params.customPayload) {
                    let balance = await getWalletBalance(walletIn);
                    expect(balance).toEqual(oldBalanceIn);
                    balance = await getWalletBalance(walletOut);
                    expect(balance).toEqual(oldBalanceOut);
                } else {
                    let balance = await getWalletBalance(walletIn);
                    expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));
                    balance = await getWalletBalance(walletOut);
                    expect(balance).toBeGreaterThanOrEqual(oldBalanceOut + minAmountOut);
                }
            } else {
                expectNotBounced(msgResult.events);
                if (poolTx) {
                    const FeesSwapped = 0xfee53aed;
                    const CrTenBurned = 0xc7b021ed;
                    const logMessages = poolTx.externals.filter(ext => {
                        const bodySlice = ext.body.beginParse();
                        const eventId = bodySlice.loadUint(32);
                        return eventId === FeesSwapped || eventId === CrTenBurned;
                    });
                    expect(logMessages.length).toEqual(2);
                }
                let balance = await getWalletBalance(walletIn);
                expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));
                if (!params.customPayload) {
                    balance = await getWalletBalance(walletOut);
                    expect(balance).toBeGreaterThanOrEqual(oldBalanceOut + minAmountOut);
                    expect(msgResult.transactions).toHaveTransaction({
                        from: routerWalletOut.address,
                        to: walletOut.address,
                    });
                }
                if (params.referral && refFee) {
                    let refVaultAddress = await router.getVaultAddress({
                        userAddress: params.referral.address,
                        tokenWalletAddress: routerWalletOut.address
                    });
                    expect(msgResult.transactions).toHaveTransaction({
                        from: router.address,
                        to: refVaultAddress,
                    });
                }
            }
            return {
                routerWalletIn: routerWalletIn,
                routerWalletOut: routerWalletOut,
                senderWalletIn: walletIn,
                senderWalletOut: walletOut,
            };
        };

        crossRouterSwap = async (params: CrossRouterSwapParams) => {
            let router = params.router;
            let router2 = params.router2;
            let sender = params.sender ?? deployer;

            let routerWalletIn = await getWalletContract(bc, params.tokenIn, router.address);
            let routerWalletMid = await getWalletContract(bc, params.tokenMid, router.address);
            let router2WalletMid = await getWalletContract(bc, params.tokenMid, router2.address);
            let router2WalletOut = await getWalletContract(bc, params.tokenFinal, router2.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWalletIn.address,
                secondWalletAddress: routerWalletMid.address
            })));

            let pool2 = bc.openContract(Pool.createFromAddress(await router2.getPoolAddress({
                firstWalletAddress: router2WalletMid.address,
                secondWalletAddress: router2WalletOut.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();

            let oldPoolData2 = await pool2.getPoolData();
            let oldPoolJData2 = await pool2.getJettonData();

            let walletIn = await getWalletContract(bc, params.tokenIn, sender.address);
            let walletMid = await getWalletContract(bc, params.tokenMid, sender.address);
            let walletFinal = await getWalletContract(bc, params.tokenFinal, sender.address);
            let oldBalanceIn = await getWalletBalance(walletIn);
            let oldBalanceMid = await getWalletBalance(walletMid);
            let oldBalanceFinal = await getWalletBalance(walletFinal);

            let msgResult = await walletIn.sendTransfer(sender.getSender(), {
                value: params.gas ?? toNano(3),
                jettonAmount: params.amountIn,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("2"),
                fwdPayload: swapPayload({
                    otherTokenWallet: routerWalletMid.address,
                    receiver: router2.address,
                    minOut: params.minAmountOut1 ?? 1n,
                    fwdGas: params.fwdGas2 ?? toNano("1"),
                    refAddress: params.referral?.address,
                    refFee: params.refFee,
                    refundAddress: sender.address,
                    deadline: initTimestamp + HOUR_IN_SECONDS,
                    customPayload: swapPayload({
                        otherTokenWallet: router2WalletOut.address,
                        receiver: sender.address,
                        minOut: params.minAmountOut2 ?? 1n,
                        refAddress: params.referral?.address,
                        refFee: params.refFee,
                        refundAddress: sender.address,
                        deadline: initTimestamp + HOUR_IN_SECONDS,
                    })
                }),
            });

            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }

            if (params.expectBounce || params.expectRefundIn || params.expectRefundMid) {
                if (params.expectBounce) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                if (params.expectRefundIn) {
                    let balance = await getWalletBalance(walletIn);
                    expect(balance).toEqual(oldBalanceIn);
                    balance = await getWalletBalance(walletMid);
                    expect(balance).toEqual(oldBalanceMid);
                }
                if (params.expectRefundMid) {
                    let balance = await getWalletBalance(walletIn);
                    expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));
                    balance = await getWalletBalance(walletMid);
                    expect(balance).toBeGreaterThan(oldBalanceMid);
                }
                let balance = await getWalletBalance(walletFinal);
                expect(balance).toEqual(oldBalanceFinal);
            } else {
                expectNotBounced(msgResult.events);

                let balance = await getWalletBalance(walletIn);
                expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));

                balance = await getWalletBalance(walletMid);
                expect(balance).toEqual(oldBalanceMid);

                balance = await getWalletBalance(walletFinal);
                expect(balance).toBeGreaterThan(oldBalanceFinal);
            }

        };

        collectFees = async (params: CollectFeesParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();
            let feeCollector = oldPoolData.protocolFeeAddress;
            if (feeCollector === null)
                throw new Error("protocol address is null");

            let feeWallet1 = await getWalletContract(bc, params.token1, feeCollector);
            let feeWallet2 = await getWalletContract(bc, params.token2, feeCollector);
            let oldBalance1 = await getWalletBalance(feeWallet1);
            let oldBalance2 = await getWalletBalance(feeWallet2);

            let msgResult = await pool.sendCollectFees(sender.getSender(), {}, params.gas ?? toNano(2));
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }
            if (params.expectBounce) {
                expectBounced(msgResult.events);

                let balance = await getWalletBalance(feeWallet1);
                expect(balance).toEqual(oldBalance1);
                balance = await getWalletBalance(feeWallet2);
                expect(balance).toEqual(oldBalance2);

                let poolData = await pool.getPoolData();
                expect(JSON.stringify(poolData)).toEqual(JSON.stringify(oldPoolData));
            } else {
                expectNotBounced(msgResult.events);
                let balance1 = await getWalletBalance(feeWallet1);
                let balance2 = await getWalletBalance(feeWallet2);
                expect(balance1 + balance2).toBeGreaterThan(oldBalance1 + oldBalance2);

                let poolData = await pool.getPoolData();
                expect(poolData.collectedLeftJettonProtocolFees).toEqual(0n);
                expect(poolData.collectedRightJettonProtocolFees).toEqual(0n);
            }

        };

        setFees = async (params: SetFeesParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();

            let msgResult = await router.sendSetFees(sender.getSender(), {
                leftWalletAddress: routerWallet1.address,
                rightWalletAddress: routerWallet2.address,
                newLPFee: params.newLPFee,
                newProtocolFee: params.newProtocolFee,
                newProtocolFeeAddress: params.newProtocolFeeAddress,
            }, params.gas ?? toNano(2));
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }
            if (params.expectBounce) {
                expectBounced(msgResult.events);

                let poolData = await pool.getPoolData();
                expect(JSON.stringify(poolData)).toEqual(JSON.stringify(oldPoolData));
            } else {
                expectNotBounced(msgResult.events);
                let poolData = await pool.getPoolData();
                expectEqAddress(poolData.protocolFeeAddress, params.newProtocolFeeAddress);
                expect(poolData.lpFee).toEqual(params.newLPFee);
                expect(poolData.protocolFee).toEqual(params.newProtocolFee);
            }

        };

        setPoolParams = async (params: SetPoolParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let oldPoolData = await pool.getPoolDataNoFail();

            let msgResult = await router.sendSetParams(sender.getSender(), {
                bclpFee: params.bclpFee,
                bcprotocolFee: params.bcprotocolFee,
                baseUSDRate: params.baseUSDRate,
                leftWalletAddress: routerWallet1.address,
                rightWalletAddress: routerWallet2.address,
            }, toNano(2));
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }
            if (params.expectBounce) {
                expectBounced(msgResult.events);

                let poolData = await pool.getPoolDataNoFail();
                expect(JSON.stringify(poolData)).toEqual(JSON.stringify(oldPoolData));
            } else {
                expectNotBounced(msgResult.events);
                let poolData = await pool.getPoolData();
                expect(JSON.stringify(poolData)).not.toBe(JSON.stringify(oldPoolData));
            }

        };

        updatePoolStatus = async (params: UpdatePStatusParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            let pool = bc.openContract(Pool.createFromAddress(await router.getPoolAddress({
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address
            })));

            let oldPoolData = await pool.getPoolDataNoFail();
            let msgResult = await router.sendUpdatePoolStatus(sender.getSender(), {
                firstWalletAddress: routerWallet1.address,
                secondWalletAddress: routerWallet2.address,
            }, toNano(2));
            if (params.debugGraph) {
                createMdGraphWithPath({
                    msgResult: msgResult,
                    storageMap: storageMap,
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                    output: params.debugGraph
                });
            }
            if (params.expectBounce) {
                expectBounced(msgResult.events);
                let poolData = await pool.getPoolDataNoFail();
                expect(poolData.isLocked).toEqual(oldPoolData.isLocked);
            } else {
                expectNotBounced(msgResult.events);
                let poolData = await pool.getPoolDataNoFail();
                expect(poolData.isLocked).toEqual(!oldPoolData.isLocked);
            }

        };
    });

    beforeEach(async () => {
        bc = await Blockchain.create();
        bc.verbosity.print = true;
        bc.verbosity.debugLogs = true;
        bc.libs = myLibs;
        bc.recordStorage = true
        setFromInitTimestamp(0);

        deployer = await bc.treasury('deployer');
        alice = await bc.treasury('alice');
        bob = await bc.treasury('bob');

        addressMap.set(deployer, "Deployer");
        addressMap.set(alice, "Alice");
        addressMap.set(bob, "Bob");
        bracketMap.set(deployer, "circle");
        bracketMap.set(alice, "circle");
        bracketMap.set(bob, "circle");
    });

    describe('Swap Price and Reserve-Based Restrictions', () => {
        async function addressIsBigger(jetton1: SBCtrJettonMinter, jetton2: SBCtrJettonMinter, router: Address) {
            let routerWallet1 = await getWalletContract(bc, jetton1, router);
            let routerWallet2 = await getWalletContract(bc, jetton2, router);
            const routerWallet1Hash = beginCell().storeAddress(routerWallet1.address).endCell().hash();
            const routerWallet2Hash = beginCell().storeAddress(routerWallet2.address).endCell().hash();
            const routerWallet1HashInt = BigInt('0x' + Buffer.from(routerWallet1Hash).toString('hex'));
            const routerWallet2HashInt = BigInt('0x' + Buffer.from(routerWallet2Hash).toString('hex'));
            return routerWallet1HashInt > routerWallet2HashInt;
        }
        it('should swap token2 for token1 and verify price', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });

            let poolData = await (setup.pool as SBCtrPool).getPoolData();
            const amountInToken1 = toNano(10);

            let reserveOut;
            if (await addressIsBigger(setup.token1, setup.token2, setup.router.address)) {
                reserveOut = poolData.rightReserve;
            } else {
                reserveOut = poolData.leftReserve;
            }

            const amountWithoutFee = (amountInToken1 * (10000n - poolData.bclpFee)) / 10000n;
            const protocolFeeIn = poolData.bcprotocolFee * poolData.protocolFeePCT / 10000n;
            const amountIn = (amountWithoutFee * (10000n - protocolFeeIn)) / 10000n;
            const calcultedOut = toNano(calculateBondingCurveCTOut(
                Number(fromNano(amountIn)),
                Number(fromNano(reserveOut)),
                0.007,
            ));

            const expectedOut = calcultedOut - (calcultedOut * (poolData.bcprotocolFee - protocolFeeIn) / 10000n);

            const senderToken2Wallet = await getWalletContract(bc, setup.token2, deployer.address);
            const senderToken2BalanceBefore = await getWalletBalance(senderToken2Wallet);

            // Perform the swap (Token2 for Token1)
            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: amountInToken1,
                minAmountOut: 1n, // Minimal amount to receive
            });

            const senderToken2BalanceAfter = await getWalletBalance(senderToken2Wallet);
            const receivedTokens = senderToken2BalanceAfter - senderToken2BalanceBefore;

            // Verify the received amount is close to the expected amount
            const tolerance = expectedOut / 1000n;
            const lowerOutLimit = expectedOut - tolerance;
            const upperOutLimit = expectedOut + tolerance;

            expect(receivedTokens).toBeGreaterThanOrEqual(lowerOutLimit);
            expect(receivedTokens).toBeLessThanOrEqual(upperOutLimit);
        });

        it('should enable swap token2 (at constant price) for token1 if token1 reserve is < 80% of initial liquidity', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });
            let poolData = await (setup.pool as SBCtrPool).getPoolData();
            expect(poolData.tokenCurveT).toBeGreaterThan(0);

            let swapAmount = toNano(100);

            do {
                await swap({
                    router: setup.router,
                    tokenIn: setup.token1,
                    tokenOut: setup.token2,
                    amountIn: swapAmount,
                });
                poolData = await (setup.pool as SBCtrPool).getPoolData();
                swapAmount = toNano(5);
            } while (poolData.tokenCurveT > 0);

            const senderToken1Wallet = await getWalletContract(bc, setup.token1, deployer.address);
            const senderToken1BalanceBefore = await getWalletBalance(senderToken1Wallet);

            const amountInToken2 = toNano(100);
            // Now, attempt to swap token2 for token1 (expected to succeed)
            await swap({
                router: setup.router,
                tokenIn: setup.token2, // Token2
                tokenOut: setup.token1, // Token1
                amountIn: amountInToken2,
                minAmountOut: 1n,
                expectRefund: false, // Should not bounce
            });

            poolData = await (setup.pool as SBCtrPool).getPoolData();

            let reserveIn, reserveOut;
            if (await addressIsBigger(setup.token1, setup.token2, setup.router.address)) {
                reserveIn = poolData.rightReserve;
                reserveOut = poolData.leftReserve;
            } else {
                reserveIn = poolData.leftReserve;
                reserveOut = poolData.rightReserve;
            }

            const amountWithoutFee = (amountInToken2 * (10000n - poolData.lpFee)) / 10000n;
            const protocolFeeIn = poolData.protocolFee * poolData.protocolFeePCT / 10000n;
            const amountIn = (amountWithoutFee * (10000n - protocolFeeIn)) / 10000n;
            const calcultedOut = toNano(calculateConstantProductCTOut(
                Number(fromNano(reserveIn)),
                Number(fromNano(amountIn)),
                Number(fromNano(reserveOut)),
                0.03,
            ));

            const expectedOut = calcultedOut - (calcultedOut * (poolData.protocolFee - protocolFeeIn) / 10000n);

            const senderToken1BalanceAfter = await getWalletBalance(senderToken1Wallet);
            const receivedTokens = senderToken1BalanceAfter - senderToken1BalanceBefore;

            // Verify the received amount is close to the expected amount
            const tolerance = expectedOut / 1000n;
            const lowerOutLimit = expectedOut - tolerance;
            const upperOutLimit = expectedOut + tolerance;

            expect(receivedTokens).toBeGreaterThanOrEqual(lowerOutLimit);
            expect(receivedTokens).toBeLessThanOrEqual(upperOutLimit);
        });

        it('should disable add liquidity if token1 reserve is >= 80% of initial liquidity', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });
            let poolData = await (setup.pool as SBCtrPool).getPoolData();
            expect(poolData.tokenCurveT).toBeGreaterThan(0);

            // Attempt to provide liquidity (expected to bounce)
            await provideLp({
                router: setup.router,
                token1: setup.token1,
                token2: setup.token2,
                amount1: toNano(100),
                amount2: toNano(200),
                expectRefund1: true,
                expectRefund2: true,
            });
        });

        it('should enable add liquidity if token1 reserve is < 80% of initial liquidity', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });
            let poolData = await (setup.pool as SBCtrPool).getPoolData();
            expect(poolData.tokenCurveT).toBeGreaterThan(0);

            let swapAmount = toNano(100);

            do {
                await swap({
                    router: setup.router,
                    tokenIn: setup.token1,
                    tokenOut: setup.token2,
                    amountIn: swapAmount,
                });
                poolData = await (setup.pool as SBCtrPool).getPoolData();
                swapAmount = toNano(5);
            } while (poolData.tokenCurveT > 0);

            // Now, attempt to provide liquidity (expected to succeed)
            await provideLp({
                router: setup.router,
                token1: setup.token1,
                token2: setup.token2,
                amount1: toNano(100),
                amount2: toNano(200),
            });
        });
    });

    describe('Fees', () => {
        it('should set fees', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });

            let data = await (setup.pool as SBCtrPool).getPoolData();
            await setFees({
                ...setup,
                newLPFee: data.lpFee - 1n,
                newProtocolFee: data.protocolFee - 1n,
                newProtocolFeeAddress: alice.address,
                debugGraph: "set_fee"
            });

        });

        it('should collect fees', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                },
            });
            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(1000),
                debugGraph: "sw_DEBUG2"
            });
        });

        it('should collect ref fee from vault', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                }
            });

            let wallets = await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(1000),
                referral: alice,
            });

            let refWallet = await getWalletContract(bc, setup.token2, alice.address);
            let oldBalance = await getWalletBalance(refWallet);

            let vaultAddress = await setup.router.getVaultAddress({
                userAddress: alice.address,
                tokenWalletAddress: wallets.routerWalletOut.address
            });
            let vault = bc.openContract(Vault.createFromAddress(vaultAddress));

            let msgResult = await vault.sendWithdrawFee(deployer.getSender());
            createMdGraphWithPath({
                msgResult: msgResult,
                storageMap: storageMap,
                addressMap: addressMap,
                bracketMap: bracketMap,
                output: "vault1",
            });
            expectNotBounced(msgResult.events);

            let balance1 = await getWalletBalance(refWallet);
            expect(balance1).toBeGreaterThan(oldBalance);

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(20),
                referral: alice,
            });

            msgResult = await vault.sendWithdrawFee(alice.getSender());
            createMdGraphWithPath({
                msgResult: msgResult,
                storageMap: storageMap,
                addressMap: addressMap,
                bracketMap: bracketMap,
                output: "vault2",
            });
            expectNotBounced(msgResult.events);

            let balance2 = await getWalletBalance(refWallet);
            expect(balance2).toBeGreaterThan(balance1);
        });
    });

    describe('Params', () => {
        it('should swap with different ratio', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(400000000),
                    amount2: toNano(100000000),
                }
            });

            // force 80/20 ratio
            let data = await (setup.pool as SBCtrPool).getPoolData();

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2000),
                debugGraph: "swap_different_params",
                referral: alice
            });
        });

        it('should change base usd rate', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(400000000),
                    amount2: toNano(100000000),
                }
            });

            await setPoolParams({
                ...setup,
                baseUSDRate: 8000000000000000n,
                debugGraph: "set_pool_params"
            });
            let data = await (setup.pool as SBCtrPool).getPoolData();
            expect(data.baseUSDRate).toEqual(8000000000000000n);
        });

        it('should change base bonding curve fees', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(400000000),
                    amount2: toNano(100000000),
                }
            });

            await setPoolParams({
                ...setup,
                bclpFee: 10n,
                bcprotocolFee: 400n,
                debugGraph: "set_pool_params"
            });
            let data = await (setup.pool as SBCtrPool).getPoolData();
            expect(data.bclpFee).toEqual(10n);
            expect(data.bcprotocolFee).toEqual(400n);
        });
    });

    describe('Dex', () => {
        it('should deploy dex', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                    debugGraph: "lp"
                }
            });
            let data = await setup.router.getRouterData();
            expect(data.type).toEqual("bonding_curve");
            let poolData = await setup.pool?.getPoolType();
            expect(poolData).toEqual("bonding_curve");
        });

        it('should swap', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                    debugGraph: "init_setup"
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2000),
                debugGraph: "swap",
                referral: alice
            });
        });

        it('should provide lp', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(10000),
                    amount2: toNano(20000),
                }
            });

            await provideLp({
                ...setup,
                amount1: toNano(0),
                amount2: toNano(2000),
                debugGraph: "provide1",
                expectRefund2: true,
            });

            await provideLp({
                ...setup,
                amount1: toNano(1000),
                amount2: toNano(0),
                debugGraph: "provide2",
                bothPositive1: true,
                minLpOut: 1n,
                expectRefund1: true
            });
        });

        it('should burn liquidity', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(10000),
                    amount2: toNano(20000),
                }
            });

            let lpWalletAddress = await (setup.pool as SBCtrPool).getWalletAddress(deployer.address);
            let lpWallet = bc.openContract(LPWallet.createFromAddress(lpWalletAddress));

            let oldBalance = await getWalletBalance(lpWallet);

            let msgResult = await lpWallet.sendBurnExt(deployer.getSender(), {
                jettonAmount: oldBalance,
            }, toNano(1));
            createMdGraphWithPath({
                msgResult: msgResult,
                storageMap: storageMap,
                addressMap: addressMap,
                bracketMap: bracketMap,
                output: "burn"
            });
            expectNotBounced(msgResult.events);
        });

        it('should cross-swap on the same router', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                }
            });

            let jetton3 = await deployJetton({
                name: "Token3",
                router: setup.router,
                mintAmount: toNano(100000000)
            });
            let pool = await createPool({
                router: setup.router,
                token1: setup.token2,
                token2: jetton3,
                amount1: toNano(1000000),
                amount2: toNano(4000000),
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(1000),
                debugGraph: "cross_swap",
                customPayload: crossSwapPayload({
                    otherTokenWallet: (await getWalletContract(bc, jetton3, setup.router.address)).address,
                    receiver: deployer.address,
                    refAddress: alice.address,
                    refundAddress: deployer.address,
                    deadline: initTimestamp + HOUR_IN_SECONDS
                }),
                referral: alice
            });
        });

        it('should cross-swap on 2 routers', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                    name1: "Token1",
                    name2: "Token3",
                }
            });
            let setup2 = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(400000000),
                    name1: setup.name2,
                    name2: "Token2",
                },
                routerId: 2
            });

            await crossRouterSwap({
                router: setup.router,
                router2: setup2.router,
                tokenIn: setup.token1,
                tokenMid: setup.token2,
                tokenFinal: setup2.token2,
                amountIn: toNano(1000),
                debugGraph: "cross_swap_router",
                referral: alice,
                expectRefundMid: true
            });

            advanceFromCurrentTS(101);

            await crossRouterSwap({
                router: setup.router,
                router2: setup2.router,
                tokenIn: setup.token1,
                tokenMid: setup.token2,
                tokenFinal: setup2.token2,
                amountIn: toNano(1000),
                debugGraph: "cross_swap_router",
                referral: alice
            });
        });

        it('should swap with 0 ref fee', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(1000),
                debugGraph: "swap_0fee",
                referral: alice,
                refFee: 0n
            });
        });

        it('should swap with max ref fee', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(1000),
                debugGraph: "swap_max_fee",
                referral: alice,
                refFee: 100n
            });
        });
    });

    describe('Refund', () => {
        it('should refund partial liquidity', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                }
            });

            let pool = await provideLp({
                ...setup,
                amount1: toNano(20),
                amount2: 0n,
                minLpOut: 0n
            });

            let accAddress = await pool.getLPAccountAddress({ userAddress: deployer.address });
            let acc = bc.openContract(LPAccount.createFromAddress(accAddress));

            let wallet1 = await getWalletContract(bc, setup.token1, deployer);
            let oldBalance = await getWalletBalance(wallet1);
            let msgResult = await acc.sendRefundMe(deployer.getSender(), {}, toNano(1));
            createMdGraphWithPath({
                msgResult: msgResult,
                storageMap: storageMap,
                addressMap: addressMap,
                bracketMap: bracketMap,
                output: "refundLP",
                chartType: "LR",
                displayDeploy: true
            });
            expectNotBounced(msgResult.events);
            let balance = await getWalletBalance(wallet1);
            expect(balance).toEqual(oldBalance + toNano(20));

        });

        it('should refund swap', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2),
                debugGraph: "swap_refund",
                minAmountOut: toNano(1000),
                expectRefund: true,
            });
        });

        it('should refund cross-swap on the same router', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                }
            });

            let jetton3 = await deployJetton({
                name: "Token3",
                router: setup.router,
                mintAmount: toNano(100000)
            });
            let pool = await createPool({
                router: setup.router,
                token1: setup.token2,
                token2: jetton3,
                amount1: toNano(1000),
                amount2: toNano(4000),
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(10),
                debugGraph: "cross_swap_refund",
                customPayload: crossSwapPayload({
                    otherTokenWallet: (await getWalletContract(bc, jetton3, setup.router.address)).address,
                    receiver: deployer.address,
                    minOut: toNano(1000),
                    refundAddress: deployer.address,
                    deadline: initTimestamp + HOUR_IN_SECONDS
                }),
                expectRefund: true
            });
        });

        it('should refund swap if pool locked', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2),
                debugGraph: "swap_refund_locked",
                minAmountOut: toNano(1000),
                expectRefund: true,
            });
        });

        it('should refund swap if fee more than max', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2),
                debugGraph: "swap_fee_refund",
                referral: alice,
                refFee: 150n,
                expectRefund: true
            });
        });

        // see should cross-swap on 2 routers
        it('should refund cross-swap on 2 routers (in)', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                    name1: "Token1",
                    name2: "Token3",
                }
            });
            let setup2 = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(4000),
                    name1: setup.name2,
                    name2: "Token2",
                },
                routerId: 2
            });

            await crossRouterSwap({
                router: setup.router,
                router2: setup2.router,
                tokenIn: setup.token1,
                tokenMid: setup.token2,
                tokenFinal: setup2.token2,
                amountIn: toNano(1),
                debugGraph: "cross_swap_router_refund_in",
                expectRefundIn: true,
                minAmountOut1: toNano(100),
                referral: alice
            });
        });

        // see should cross-swap on 2 routers
        it('should refund cross-swap on 2 routers (mid)', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(100000000),
                    amount2: toNano(200000000),
                    name1: "Token1",
                    name2: "Token3",
                }
            });
            let setup2 = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(4000),
                    name1: setup.name2,
                    name2: "Token2",
                },
                routerId: 2
            });

            await crossRouterSwap({
                router: setup.router,
                router2: setup2.router,
                tokenIn: setup.token1,
                tokenMid: setup.token2,
                tokenFinal: setup2.token2,
                amountIn: toNano(100),
                debugGraph: "cross_swap_router_refund_mid",
                expectRefundMid: true,
                minAmountOut2: toNano(100),
                referral: alice
            });
        });
    });

    describe('Bounce', () => {
        it('should bounce set fees if not admin', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });

            let data = await (setup.pool as SBCtrPool).getPoolData();
            await setFees({
                ...setup,
                sender: alice,
                newLPFee: data.lpFee,
                newProtocolFee: data.protocolFee,
                newProtocolFeeAddress: alice.address,
                expectBounce: true
            });
        });

        it('should bounce collect fees if no fee', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000000),
                    amount2: toNano(2000000),
                }
            });

            let data = await (setup.pool as SBCtrPool).getPoolData();
            await setFees({
                ...setup,
                newLPFee: data.lpFee,
                newProtocolFee: data.protocolFee,
                newProtocolFeeAddress: alice.address,
            });

            await collectFees({
                ...setup,
                expectBounce: true
            });
        });
    });
});

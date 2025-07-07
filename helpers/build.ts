import 'dotenv/config';
import { compileX } from "../libs/";
import { POOL_TYPES, preprocBuildContractsLocal } from "./helpers";
import { defaultBCLPFee, defaultBCProtocolFee, defaultACoeff, defaultBCoeff, defaultBaseUSDRate, defautlCurveT } from "../wrappers/Pool"

(async () => {
    let autocleanup = undefined;
    if (process.env.DEBUG != undefined)
        autocleanup = false;

    for (let tp of POOL_TYPES) {
        console.log(`Building for pool type: ${tp}`);
        const ops = {
            dexType: tp,
            defaultProtocolFee: null,
            defaultIsLocked: null,
            defaultLPFee: null,
            autocleanup: autocleanup,
            defaultBCLPFee: tp == "bonding_curve" ? defaultBCLPFee : undefined,
            defaultBCProtocolFee: tp == "bonding_curve" ? defaultBCProtocolFee : undefined,
            defaultExpACoeff: tp == "bonding_curve" ? defaultACoeff : undefined,
            defaultExpBCoeff: tp == "bonding_curve" ? defaultBCoeff : undefined,
            defaultBaseUSDRate: tp == "bonding_curve" ? defaultBaseUSDRate : undefined,
            defaultCTokenForCurve: tp == "bonding_curve" ? defautlCurveT : undefined,
            defaultSwapAddress: tp == "bonding_curve" ? "0, 0" : undefined,
        };
        preprocBuildContractsLocal(ops);

        console.log("\tCompiling Router...");
        await compileX('Router', {
            cells: true,
            base64: true,
        });

        console.log("\tCompiling Pool...");
        await compileX('Pool', {
            cells: true,
            base64: true,
        });

        console.log("\tCompiling LPAccount...");
        await compileX('LPAccount', {
            cells: true,
            base64: true,
        });

        console.log("\tCompiling LPWallet...");
        await compileX('LPWallet', {
            cells: true,
            base64: true,
        });

        console.log("\tCompiling Vault...");
        await compileX('Vault', {
            cells: true,
            base64: true,
        });
    }
    console.log(`Building common`);
    console.log("\tCompiling Pool Dummy...");
    await compileX('PoolDummy', {
        cells: true,
        base64: true,
    });

})();

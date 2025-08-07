import 'dotenv/config';
import { compileX } from "../libs/";
import { POOL_TYPES, preprocBuildContractsLocal } from "./helpers";
import { defaultACoeff, defaultBCoeff, defautlCurveT } from "../wrappers/Pool"

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
            defaultExpACoeff: tp == "bonding_curve" ? defaultACoeff : undefined,
            defaultExpBCoeff: tp == "bonding_curve" ? defaultBCoeff : undefined,
            defaultCTokenForCurve: tp == "bonding_curve" ? defautlCurveT : undefined,
            defaultSwapAddress: tp == "bonding_curve" ? "0, 0" : undefined,
            defaultSwapAddressExpirationTime: tp == "bonding_curve" ? 60000n : undefined,
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

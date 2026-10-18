// Install the already-built app in the Roku's development slot, without changing registry data.
const path = require('node:path');
const fs = require('node:fs');
const rokuDeploy = require('roku-deploy');
const config = require('./get-env-vars')(['ROKU_DEV_TARGET', 'ROKU_DEVPASSWORD']);

(async () => {
    const outDir = path.resolve(__dirname, '../dist');
    const outFile = 'playlet-app.zip';
    if (!fs.existsSync(path.join(outDir, outFile))) throw new Error('Build playlet-app before deploying');
    await rokuDeploy.publish({
        host: config.ROKU_DEV_TARGET,
        password: config.ROKU_DEVPASSWORD,
        packagePort: config.ROKU_DEV_TARGET_PORT || 80,
        outDir,
        outFile,
        failOnCompileError: true
    });
    console.log('Updated development app installed');
})().catch(error => { console.error(error); process.exitCode = 1; });

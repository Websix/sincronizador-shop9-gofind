import { autoUpdater } from "electron-updater";
import log from "electron-log";

autoUpdater.logger = log;

if (process.env.AUTO_UPDATER_GITHUB_TOKEN) {
    autoUpdater.addAuthHeader(`Bearer ${ process.env.AUTO_UPDATER_GITHUB_TOKEN }`)
}

const updater = autoUpdater

export {
    updater
}
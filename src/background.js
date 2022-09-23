"use strict";

import {
  app,
  protocol,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  nativeTheme
} from "electron";
import { createProtocol } from "vue-cli-plugin-electron-builder/lib";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";
import log from "electron-log";
import replaceAll from "string.prototype.replaceall";

import path from "path";
import cron from "./cron";
import dbMessageHandler from "./db-message-handler";
const isDevelopment = process.env.NODE_ENV !== "production";
const appName = app.getName();

log.catchErrors({ showDialog: false });
replaceAll.shim();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let tray;

let iconPath = () => {
  return path.join(
    !isDevelopment ? __dirname : __static,
    "../src/assets/",
    nativeTheme.shouldUseDarkColors ? "tray-icon-light.png" : "tray-icon.png"
  );
};

app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath("exe")
});

nativeTheme.on("updated", function theThemeHasChanged() {
  if (tray) {
    tray.setImage(iconPath());
  }
});

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);

function createWindow() {
  // Create the browser window.
  let win = new BrowserWindow({
    // frame: false,
    width: 640,
    height: 860,
    // transparent: true,
    resizable: false,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION
    },
    autoHideMenuBar: true,
    center: true,
    thickFrame: true
  });

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    win.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) win.webContents.openDevTools();
  } else {
    createProtocol("app");
    // Load the index.html when not in development
    win.loadURL("app://./index.html");
  }

  tray = null;

  win.on("closed", event => {
    mainWindow = null;
  });

  win.on("minimize", sendToTray);

  win.on("restore", restoreFromTray);

  win.on("close", function(event) {
    if (!app.isQuiting) {
      sendToTray(event);
    }
    return false;
  });
  return win;
}

function sendToTray(event) {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.setSkipTaskbar(true);
    mainWindow.hide();
    // mainWindow = null;
  }
  tray = createTray();
  if (process.platform === "darwin") {
    app.dock.hide();
  }
}

function restoreFromTray(event) {
  tray.destroy();
  if (!mainWindow) {
    mainWindow = createWindow();
  }
  mainWindow.show();
  mainWindow.setSkipTaskbar(false);
  if (process.platform === "darwin") {
    app.dock.show();
  }
}

function createTray() {
  let tray = new Tray(iconPath());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir",
      click: restoreFromTray
    },
    {
      label: "Encerrar",
      click: function() {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.on("double-click", restoreFromTray);
  tray.setToolTip(`${app.getName()} - ${app.getVersion()}`);
  tray.setContextMenu(contextMenu);
  return tray;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    mainWindow = createWindow();
  }
});

app.on("before-quit", function() {
  app.isQuiting = true;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS_DEVTOOLS);
    } catch (e) {
      console.error("Vue Devtools failed to install:", e.toString());
    }
  }
  // mainWindow = createWindow();
  tray = createTray();
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", data => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}

ipcMain.on("database-query", dbMessageHandler);
ipcMain.on("trigger-app-relaunch", () => {
  app.relaunch();
  app.quit();
});

cron.events.on("cron_status", status => {
  if (mainWindow) {
    mainWindow.send("cron_status", status);
  }
});

cron.events.on("cron_finished", () => {
  if (mainWindow) {
    mainWindow.send("cron_finished");
  }
});

cron.run();

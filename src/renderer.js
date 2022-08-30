const electron = window.require("electron");
const { ipcRenderer } = electron;

export function send(message) {
  return new Promise((resolve, reject) => {
    ipcRenderer.once("database-reply", (_, res) => {
      if (res instanceof Error) {
        reject(res);
        return;
      }
      resolve(res);
    });
    ipcRenderer.send("database-query", message);
  });
}

export function dispatch(eventName, params) {
  return new Promise((resolve, reject) => {
    ipcRenderer.once(`${eventName}-reply`, (_, res) => {
      if (res instanceof Error) {
        reject(res);
        return;
      }
      resolve(res);
    });
    ipcRenderer.send(eventName, params);
  });
}

// Secure bridge: only allow the web page to list printers and print, nothing else.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("hbPrint", {
  getPrinters: () => ipcRenderer.invoke("hb:get-printers"),
  print: (o) => ipcRenderer.invoke("hb:print", o),
});

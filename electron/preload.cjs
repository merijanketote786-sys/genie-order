// Secure bridge: web page ko sirf printer list aur print ki ijazat, aur kuch nahi.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("hbPrint", {
  getPrinters: () => ipcRenderer.invoke("hb:get-printers"),
  print: (o) => ipcRenderer.invoke("hb:print", o),
});

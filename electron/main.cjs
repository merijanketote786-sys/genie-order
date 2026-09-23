// HB Chemicals Pakistan Workspace — offline desktop app.
// Static build (dist-offline) ko ek local server se serve karta hai taake router aur
// printing browser jaisi hi chalein. Koi internet ki zaroorat nahi.
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "dist-offline");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function send(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const target = path.join(ROOT, urlPath);
      if (target.startsWith(ROOT) && fs.existsSync(target) && fs.statSync(target).isFile()) {
        return send(res, target);
      }
      return send(res, path.join(ROOT, "index.html"));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

async function createWindow() {
  const base = await startServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b1220",
    title: "HB Chemicals Pakistan Workspace",
    icon: path.join(ROOT, "app-icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.cjs") },
  });

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          { role: "reload", label: "Refresh workspace" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "quit", label: "Band karein" },
        ],
      },
      {
        label: "Print",
        submenu: [{ role: "print", label: "Print…", accelerator: "CmdOrCtrl+P" }],
      },
      {
        label: "Edit",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }],
      },
    ]),
  );

  // WhatsApp jaise bahar ke links default browser me khulen.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(base)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.loadURL(base);
}

// ---- Printer bridge (Windows printers list + silent print) ----
ipcMain.handle("hb:get-printers", async (e) => {
  const list = await e.sender.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, description: p.description || "", isDefault: !!p.isDefault, status: p.status || 0 }));
});

ipcMain.handle("hb:print", async (_e, o) => {
  if (!o || typeof o.html !== "string" || o.html.length > 5_000_000) return { ok: false, error: "Invalid print job" };
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(o.html));
    await new Promise((r) => setTimeout(r, 300));
    const widthUm = Math.round(Number(o.widthMm || 80) * 1000);
    const heightUm = Math.round(Number(o.heightMm || 297) * 1000);
    return await new Promise((resolve) => {
      w.webContents.print(
        {
          silent: !!o.silent && !!o.deviceName,
          deviceName: o.deviceName || undefined,
          copies: Math.min(10, Math.max(1, Number(o.copies) || 1)),
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: { width: widthUm, height: heightUm },
        },
        (ok, reason) => resolve(ok ? { ok: true } : { ok: false, error: reason || "Print cancel/failed" }),
      );
    });
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 1500);
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

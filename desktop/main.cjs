const { app, BrowserWindow, dialog, session } = require("electron");
const { mkdirSync } = require("node:fs");
const path = require("node:path");
const { startCabinet } = require("./runtime.cjs");

const dataOption = process.argv.find((argument) => argument.startsWith("--offline-data="))?.slice("--offline-data=".length);
if (!dataOption || !path.isAbsolute(dataOption)) {
  dialog.showErrorBox("AutoRemHub СТО", "Запустите офлайн-кабинет через ярлык, созданный программой установки.");
  app.exit(1);
} else {
  run(path.join(dataOption, "AutoRemHub-Cabinet"));
}

function run(dataDirectory) {
  const directory = path.dirname(__dirname);
  const profile = path.join(dataDirectory, "profile");
  // Electron needs a profile before app.ready. The launcher later restricts the parent to the current account.
  mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
    return;
  }

  let window, startup, stopping = false;
  app.on("second-instance", () => {
    if (!window?.isDestroyed()) {
      window?.restore();
      window?.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!startup || stopping) return;
    event.preventDefault();
    stopping = true;
    startup.then((instance) => instance.stop()).catch(() => {}).finally(() => app.quit());
  });

  app.whenReady().then(async () => {
    window = new BrowserWindow({
      title: "AutoRemHub СТО",
      width: 1366,
      height: 900,
      minWidth: 850,
      minHeight: 620,
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await window.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
      '<meta charset="utf-8"><title>AutoRemHub СТО</title><body style="font:18px Segoe UI,sans-serif;padding:2rem">Запускаем офлайн-кабинет…</body>',
    ));
    if (window.isDestroyed()) return;
    startup = startCabinet({ directory, dataDirectory });
    const instance = await startup;
    if (stopping) return;
    const trusted = (url) => {
      try { return new URL(url).origin === instance.origin; } catch { return false; }
    };
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const secureNavigation = (contents) => {
      contents.on("will-navigate", (event, url) => { if (!trusted(url)) event.preventDefault(); });
      contents.setWindowOpenHandler(({ url }) => trusted(url) ? { action: "allow" } : { action: "deny" });
    };
    secureNavigation(window.webContents);
    app.on("web-contents-created", (_event, contents) => secureNavigation(contents));
    await window.loadURL(instance.loginUrl);
  }).catch((error) => {
    dialog.showErrorBox("AutoRemHub СТО", `${error.message}\n\nЖурнал запуска: ${path.join(dataDirectory, "startup.log")}`);
    app.quit();
  });
}

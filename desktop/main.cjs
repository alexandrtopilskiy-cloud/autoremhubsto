const { app, BrowserWindow, dialog, Menu, session } = require("electron");
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

  let window, startup, pollTimer, stopping = false;
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
    clearTimeout(pollTimer);
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
    const cloud = "https://sto.autoremhub.ru";
    const trusted = (url) => {
      try { return [instance.origin, cloud].includes(new URL(url).origin); } catch { return false; }
    };
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const secureNavigation = (contents) => {
      const guard = (event, url) => { if (!trusted(url)) event.preventDefault(); };
      contents.on("will-navigate", guard);
      contents.on("will-redirect", guard);
      contents.setWindowOpenHandler(({ url }) => trusted(url) ? { action: "allow" } : { action: "deny" });
    };
    secureNavigation(window.webContents);
    app.on("web-contents-created", (_event, contents) => secureNavigation(contents));
    let mode;
    let problem;
    let localRequested = false;
    const atCloud = () => window.webContents.getURL().startsWith(cloud + "/");
    const open = async url => {
      if (!window.isDestroyed()) await window.loadURL(url).catch(() => {});
    };
    const menu = () => WindowMenu(mode, problem, async () => {
      localRequested = false;
      await open(cloud + "/");
    }, async () => {
      localRequested = true;
      if (atCloud()) await open(instance.loginUrl);
      else if (!window.webContents.getURL().startsWith(instance.origin + "/")) await open(instance.loginUrl);
    });
    const poll = async () => {
      if (stopping || window.isDestroyed()) return;
      const result = await fetch(instance.origin + "/api/local/sync", {
        method: "POST", headers: { "x-sto-desktop": instance.accessKey }, signal: AbortSignal.timeout(300_000),
      }).then(async response => {
        if (!response.ok) throw new Error("Локальный кабинет не ответил.");
        return response.json();
      }).catch(error => ({ mode: "error", error: error.message }));
      if (stopping || window.isDestroyed()) return;
      const previous = mode;
      mode = result.mode;
      problem = result.error;
      if (!previous || (mode === "offline" && atCloud())) {
        await open(mode === "online" ? cloud + "/" : instance.loginUrl);
      } else if (mode === "online" && previous !== "online" && !localRequested && !atCloud()) {
        await open(cloud + "/");
      } else if (mode !== previous && !atCloud() && window.webContents.getURL().startsWith(instance.origin + "/app")) {
        window.webContents.reload();
      }
      if (stopping || window.isDestroyed()) return;
      menu();
      pollTimer = setTimeout(poll, 12_000);
    };
    // Show setup or the cached cabinet immediately, even if port 443 is unreachable.
    await open(instance.loginUrl);
    menu();
    void poll();
  }).catch((error) => {
    dialog.showErrorBox("AutoRemHub СТО", `${error.message}\n\nЖурнал запуска: ${path.join(dataDirectory, "startup.log")}`);
    app.quit();
  });
}

function WindowMenu(mode, problem, openCloud, openLocal) {
  const labels = {
    online: "Онлайн · синхронизация завершена",
    offline: "Офлайн · запись на этом ПК",
    setup: "Требуется настройка резерва",
    waiting: "Ожидаем восстановления связи",
    error: "Синхронизация приостановлена",
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: "Режим работы",
    submenu: [
      { label: labels[mode] ?? "Проверяем связь с сервером", enabled: false },
      { label: "Открыть онлайн-кабинет", click: openCloud },
      { label: "Открыть локальный кабинет", click: openLocal },
      { label: "Состояние синхронизации", click: () => dialog.showMessageBox({
        title: "AutoRemHub СТО", message: labels[mode] ?? "Проверяем связь с сервером",
        detail: problem || "",
      }) },
    ],
  }]));
}

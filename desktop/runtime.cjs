const { spawn, execFile } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { createWriteStream } = require("node:fs");
const { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const { promisify } = require("node:util");

const exec = promisify(execFile);
const loopback = "127.0.0.1";
const windows = process.platform === "win32";
const suffix = windows ? ".exe" : "";

async function secureUserDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!windows) return;
  const system = path.join(process.env.SystemRoot, "System32");
  const { stdout } = await exec(path.join(system, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
  const sid = stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error("Не удалось определить профиль пользователя Windows.");
  await exec(path.join(system, "icacls.exe"), [directory, "/grant:r", `*${sid}:(OI)(CI)F`, "/inheritance:r"], { windowsHide: true });
}

function port() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, loopback, () => {
      const value = socket.address().port;
      socket.close((error) => error ? reject(error) : resolve(value));
    });
  });
}

async function existingFile(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return false;
  }
}

function startChild(executable, args, options, log) {
  const child = spawn(executable, args, { ...options, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const result = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });
  // Consumers wait for startup or completion and report the error with the relevant step.
  result.catch(() => {});
  return { child, result };
}

async function waitReady(check, running, description, timeout = 120_000) {
  const terminated = running.result.then(() => { throw new Error(description + " завершилось до запуска."); });
  const ready = async () => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (running.child.exitCode !== null || running.child.signalCode !== null) return terminated;
      if (await check()) return;
      await sleep(400);
    }
    throw new Error(description + " не успело запуститься.");
  };
  await Promise.race([ready(), terminated]);
}

async function requireSuccess(running, description) {
  if (await running.result !== 0) throw new Error(description);
}

async function prepareCluster(dataDirectory, postgres, env, log) {
  const cluster = path.join(dataDirectory, "postgres");
  const passwordPath = path.join(dataDirectory, "postgres-password");
  let password;
  try {
    password = (await readFile(passwordPath, "utf8")).trim();
  } catch (error) {
    if (error.code !== "ENOENT" || await existingFile(cluster)) throw error;
    password = randomBytes(32).toString("base64url");
    await writeFile(passwordPath, password + "\n", { flag: "wx", mode: 0o600 });
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("Повреждены параметры локальной базы.");
  if (!await existingFile(cluster)) {
    const staging = await mkdtemp(path.join(dataDirectory, "initializing-"));
    try {
      const args = ["-D", staging, "-U", "sto", "-A", "scram-sha-256", "--pwfile=" + passwordPath,
        "--encoding=UTF8", "--locale=C", "--locale-provider=icu", "--icu-locale=ru-RU"];
      await requireSuccess(startChild(postgres("initdb"), args, { env }, log), "Не удалось создать базу PostgreSQL.");
      await rename(staging, cluster);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  return { cluster, password };
}

async function startCabinet({ directory, dataDirectory, node = process.execPath, nodeEnv = { ELECTRON_RUN_AS_NODE: "1" } }) {
  await secureUserDirectory(dataDirectory);
  const log = createWriteStream(path.join(dataDirectory, "startup.log"), { flags: "w", mode: 0o600 });
  log.on("error", () => {});
  const bundle = path.join(directory, "app");
  const postgresBin = path.join(directory, "postgres", "bin");
  const postgres = (name) => path.join(postgresBin, name + suffix);
  const env = { ...process.env, PATH: postgresBin + path.delimiter + process.env.PATH, TZ: "Europe/Moscow" };
  // The installed app always uses its own database URL and device-scoped loopback access.
  const nodeOptions = { cwd: bundle, env: { ...env, ...nodeEnv, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" } };
  let web, cluster, dbStarted = false;
  let stopping;
  const stop = () => stopping ??= (async () => {
    if (web) {
      web.child.kill();
      await web.result.catch(() => {});
    }
    if (dbStarted) {
      try {
        await exec(postgres("pg_ctl"), ["-D", cluster, "-m", "fast", "-w", "-t", "25", "stop"],
          { env, windowsHide: true, timeout: 30_000 });
      } catch (error) {
        log.write(String(error) + "\n");
      }
    }
    log.end();
  })();

  try {
    const dbPort = await port();
    const webPort = await port();
    const accessKey = randomBytes(32).toString("hex");
    const local = await prepareCluster(dataDirectory, postgres, env, log);
    cluster = local.cluster;
    const startArgs = ["-D", cluster, "-l", path.join(dataDirectory, "postgres.log"), "-w", "-t", "60",
      "-o", `-h ${loopback} -p ${dbPort} -c unix_socket_directories=`, "start"];
    await requireSuccess(startChild(postgres("pg_ctl"), startArgs, { env }, log), "Не удалось запустить локальную базу.");
    dbStarted = true;

    const host = `${loopback}:${webPort}`;
    const origin = `http://${host}`;
    Object.assign(nodeOptions.env, {
      DATABASE_URL: `postgresql://sto:${local.password}@${loopback}:${dbPort}/postgres?schema=public`,
      STO_LOCAL_RUNTIME: "1",
      STO_LOCAL_HOST: host,
      STO_LOCAL_ACCESS: accessKey,
    });
    await requireSuccess(
      startChild(node, [path.join("node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], nodeOptions, log),
      "Не удалось обновить схему локальной базы.",
    );
    web = startChild(node, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-H", loopback, "-p", String(webPort)], nodeOptions, log);
    // No session or snapshot is needed to check that the local server and its access guard are running.
    await waitReady(async () => {
      try {
        const response = await fetch(origin + "/api/local/open", { signal: AbortSignal.timeout(1500) });
        return response.status === 403;
      } catch {
        return false;
      }
    }, web, "Офлайн-кабинет");
    return { origin, loginUrl: origin + "/api/local/open?key=" + accessKey, stop };
  } catch (error) {
    log.write(String(error) + "\n");
    await stop();
    throw error;
  }
}

module.exports = { secureUserDirectory, startCabinet };

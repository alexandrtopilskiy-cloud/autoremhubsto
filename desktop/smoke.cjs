const assert = require("node:assert/strict");
const { startCabinet } = require("./runtime.cjs");

async function main() {
  const [, , directory, dataDirectory] = process.argv;
  for (let launch = 0; launch < 2; launch++) {
    const cabinet = await startCabinet({ directory, dataDirectory, nodeEnv: process.platform === "win32" ? { ELECTRON_RUN_AS_NODE: "1" } : {} });
    try {
      assert.equal((await fetch(cabinet.origin + "/login")).status, 403);
      const open = await fetch(cabinet.loginUrl, { redirect: "manual" });
      assert.equal(open.status, 303);
      const cookie = open.headers.get("set-cookie").split(";")[0];
      const login = await fetch(cabinet.origin + "/login", { headers: { Cookie: cookie } });
      assert.equal(login.status, 200);
      assert.match(await login.text(), /Настроить офлайн-кабинет/);
      const setup = await fetch(cabinet.origin + "/local-setup", { headers: { Cookie: cookie } });
      assert.equal(setup.status, 200);
      assert.match(await setup.text(), /Загрузить снимок/);
    } finally {
      await cabinet.stop();
    }
  }
  console.log("Local database, protected login and setup reopened with the same data directory.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

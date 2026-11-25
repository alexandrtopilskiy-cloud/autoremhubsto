export function isLocalRuntime() {
  return process.env.STO_LOCAL_RUNTIME === "1";
}

export const LOCAL_ACCESS_COOKIE = "sto_local_access";

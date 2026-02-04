const { spawn } = require("node:child_process");
const waitOn = require("wait-on");

const electronBinary = require("electron");
const env = { ...process.env };

if (env.ELECTRON_RUN_AS_NODE) {
  delete env.ELECTRON_RUN_AS_NODE;
}

const port = Number.parseInt(env.VITE_PORT || "5173", 10);

async function start() {
  try {
    await waitOn({
      resources: [`tcp:${port}`, "dist/main/main.js"],
      timeout: 120000,
      interval: 250,
      window: 1000,
    });
  } catch (err) {
    console.error("wait-on failed:", err?.message || err);
    process.exit(1);
  }

  const child = spawn(electronBinary, ["."], {
    stdio: "inherit",
    env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

start();

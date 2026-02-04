const { execSync, spawn } = require("child_process");
const path = require("path");

const port = Number.parseInt(process.env.VITE_PORT || "5173", 10);
const rootDir = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const tscBin = path.join(rootDir, "node_modules", "typescript", "lib", "tsc.js");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const isWindows = process.platform === "win32";

function sleep(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function getPortPids(targetPort) {
  if (!Number.isFinite(targetPort)) return [];

  if (isWindows) {
    try {
      const output = execSync(
        `powershell -NoProfile -Command \"(Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess) -join ' '\"`,
        { stdio: ["ignore", "pipe", "ignore"] }
      )
        .toString()
        .trim();

      if (output) {
        return output.split(/\s+/).filter(Boolean);
      }
    } catch (_err) {
      // Fall back to netstat below.
    }

    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${targetPort}`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString();

      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[4];
          if (pid && pid !== "0" && pid !== String(process.pid)) {
            pids.add(pid);
          }
        }
      }

      return Array.from(pids);
    } catch (_err) {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -ti tcp:${targetPort}`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
    return output.split(/\s+/).filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function killPort(targetPort) {
  if (!Number.isFinite(targetPort)) return;

  const pids = getPortPids(targetPort);
  if (pids.length === 0) return;

  if (isWindows) {
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      } catch (_err) {
        // Ignore and retry in ensurePortFree.
      }
    }
    return;
  }

  for (const pid of pids) {
    if (pid !== String(process.pid)) {
      try {
        execSync(`kill -9 ${pid}`, { stdio: "ignore" });
      } catch (_err) {
        // Ignore and retry in ensurePortFree.
      }
    }
  }
}


async function ensurePortFree(targetPort) {
  let wasInUse = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const pids = getPortPids(targetPort);
    if (pids.length === 0) {
      return { ready: true, wasInUse };
    }
    wasInUse = true;
    killPort(targetPort);
    sleep(300);
  }

  const remaining = getPortPids(targetPort);
  return {
    ready: false,
    wasInUse,
    remaining
  };
}

async function main() {
  const portStatus = await ensurePortFree(port);
  if (!portStatus.ready) {
    const remaining = portStatus.remaining ?? [];
    if (remaining.length > 0) {
      console.error(
        `\n[dev] Port ${port} status: in-use (PID${remaining.length > 1 ? "s" : ""}: ${remaining.join(", ")}).\n`
      );
    } else {
      console.error(`\n[dev] Port ${port} status: in-use.\n`);
    }
    console.error("[dev] Close those processes or run as Administrator.");
    process.exit(1);
  }

  const statusSuffix = portStatus.wasInUse ? "free (after cleanup)" : "free";
  const portStatusMessage = `[dev] Port ${port} status: ${statusSuffix}`;
  console.log(`\n${portStatusMessage}\n`);

  const env = { ...process.env, VITE_PORT: String(port) };
  const tsc = spawn(nodeBin, [tscBin, "-w", "-p", "tsconfig.main.json"], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  const vite = spawn(nodeBin, [viteBin, "--strictPort", "--port", String(port)], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });

  let portStatusReprinted = false;
  const maybeReprintStatus = (chunk) => {
    if (portStatusReprinted) return;
    const text = chunk.toString();
    if (/ready in/i.test(text) || /vite v/i.test(text)) {
      portStatusReprinted = true;
      process.stdout.write(`\n${portStatusMessage} (post-vite)\n\n`);
    }
  };

  if (vite.stdout) {
    vite.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      maybeReprintStatus(chunk);
    });
  }

  if (vite.stderr) {
    vite.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      maybeReprintStatus(chunk);
    });
  }

  const electron = spawn(process.execPath, [path.join(__dirname, "run-electron.js")], {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  const children = [tsc, vite, electron];

  const shutdown = (code) => {
    for (const child of children) {
      if (child && !child.killed) {
        child.kill("SIGTERM");
      }
    }
    killPort(port);
    process.exit(code);
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  children.forEach((child) => {
    if (!child) return;
    child.on("exit", (code) => {
      if (typeof code === "number" && code !== 0) {
        shutdown(code);
        return;
      }
      if (child === electron) {
        shutdown(0);
      }
    });
  });
}

main().catch((err) => {
  console.error("Dev launcher failed:", err?.message || err);
  process.exit(1);
});

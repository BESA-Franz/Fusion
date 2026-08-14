import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/*
FNXC:WindowsTestWorkers 2026-08-14-11:41:
Engine tests run headless in disposable worker threads. Importing pi-coding-agent there must not load
the native clipboard addon because forced worker teardown can unload its Win32 binding with an access
violation. The real addon remains covered in a separate, gracefully exiting process below so product
clipboard support is not silently replaced by the headless test boundary.
*/
async function countNativeClipboardRequestsDuringPiImport(): Promise<number> {
  const piEntry = new URL(
    "../../node_modules/@earendil-works/pi-coding-agent/dist/index.js",
    import.meta.url,
  ).href;

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(
      `
        const Module = require("node:module");
        const { parentPort, workerData } = require("node:worker_threads");

        const originalLoad = Module._load;
        let nativeClipboardRequests = 0;
        Module._load = function(request, parent, isMain) {
          if (request === "@mariozechner/clipboard") {
            nativeClipboardRequests += 1;
            throw new Error("native clipboard load blocked by boundary probe");
          }
          return originalLoad.call(this, request, parent, isMain);
        };

        import(workerData.piEntry)
          .then(() => {
            parentPort.postMessage({ nativeClipboardRequests });
            setInterval(() => {}, 1_000);
          })
          .catch((error) => parentPort.postMessage({ error: String(error) }));
      `,
      { eval: true, workerData: { piEntry } },
    );

    worker.once("error", error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    worker.once("exit", code => {
      if (settled) return;
      settled = true;
      reject(new Error(`clipboard boundary worker exited before reporting: ${code}`));
    });
    worker.once("message", async (message: { nativeClipboardRequests?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      await worker.terminate();
      if (message.error) {
        reject(new Error(message.error));
        return;
      }
      resolve(message.nativeClipboardRequests ?? -1);
    });
  });
}

describe("pi native clipboard boundary", () => {
  it.skipIf(process.platform !== "win32")(
    "keeps the native clipboard addon out of disposable engine test workers",
    async () => {
      expect(await countNativeClipboardRequestsDuringPiImport()).toBe(0);
    },
  );

  it.skipIf(process.platform !== "win32")(
    "retains a process-isolated smoke check for the real native clipboard addon",
    async () => {
      const clipboardEntry = require.resolve("@mariozechner/clipboard");
      const nativeEnv = { ...process.env };
      delete nativeEnv.TERMUX_VERSION;
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          "-e",
          `const clipboard = require(process.argv.at(-1));
           if (typeof clipboard.getText !== "function") process.exit(2);
           process.stdout.write("native-clipboard-loaded");`,
          clipboardEntry,
        ],
        { env: nativeEnv, timeout: 10_000, windowsHide: true },
      );

      expect(stdout).toBe("native-clipboard-loaded");
    },
  );
});

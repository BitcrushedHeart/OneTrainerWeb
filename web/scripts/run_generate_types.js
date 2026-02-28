/**
 * Finds the venv Python and runs generate_types.py.
 * Used by npm scripts and the Electron build pipeline.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectRoot = path.resolve(__dirname, "..", "..");
const isWindows = process.platform === "win32";

const venvPaths = isWindows
  ? [
      path.join(projectRoot, "venv", "Scripts", "python.exe"),
      path.join(projectRoot, ".venv", "Scripts", "python.exe"),
    ]
  : [
      path.join(projectRoot, "venv", "bin", "python"),
      path.join(projectRoot, ".venv", "bin", "python"),
    ];

const python =
  venvPaths.find((p) => fs.existsSync(p)) ||
  (isWindows ? "python" : "python3");

console.log(`[generate-types] Using Python: ${python}`);
console.log(`[generate-types] Project root: ${projectRoot}`);

try {
  execSync(`"${python}" -m web.scripts.generate_types`, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  console.log("[generate-types] Complete.");
} catch (err) {
  console.error("[generate-types] Failed:", err.message);
  process.exit(1);
}

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const source = join(root, "python", "dist", "blink_detector.exe");
const targetDir = join(root, "electron", "resources");
const target = join(targetDir, "blink_detector.exe");

function getPythonUserSite(command) {
	const result = spawnSync(command, ["-m", "site", "--user-site"], {
		encoding: "utf8",
		shell: false,
	});

	return result.status === 0 ? result.stdout.trim() : "";
}

function run(command, args, cwd) {
	const pythonUserSite = getPythonUserSite(command);
	const pythonPath = [pythonUserSite, process.env.PYTHONPATH]
		.filter(Boolean)
		.join(";");
	const result = spawnSync(command, args, {
		cwd,
		env: {
			...process.env,
			...(pythonPath ? { PYTHONPATH: pythonPath } : {}),
		},
		stdio: "inherit",
		shell: false,
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

if (!existsSync(source)) {
	console.log("blink_detector.exe not found; building it with PyInstaller...");
	run("python", ["build_binary.py"], join(root, "python"));
}

if (!existsSync(source)) {
	console.error(`Expected Python binary was not created: ${source}`);
	process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`Prepared Python detector: ${target}`);

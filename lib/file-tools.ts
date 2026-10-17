
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PathGuard } from "../mcp-server/security/path-guard";
import { evaluateCommand } from "../mcp-server/security/command-guard";
const execFileAsync = promisify(execFile);

const ROOT = process.cwd();

function safe(p: string) {
  return new PathGuard(ROOT).resolveAndValidate(p);
}

export function getRoot() { return ROOT; }

export function listFiles(p: string) {
  const dir = safe(p);
  return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(dir, entry.name);
    const stat = fs.statSync(entryPath);
    return { name: entry.name, isDir: entry.isDirectory(), size: stat.size, path: path.relative(ROOT, entryPath).split(path.sep).join("/") || "." };
  });
}

export function readFileContent(p: string) {
  return fs.readFileSync(safe(p), "utf-8");
}

export function writeFileContent(p: string, content: string) {
  if (typeof content !== "string") throw new Error("content must be a string");
  const file = safe(p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Revalidate after parent creation so symlink changes cannot redirect the write.
  const validated = safe(p);
  fs.writeFileSync(validated, content, "utf-8");
  return { path: path.relative(ROOT, validated).split(path.sep).join("/"), bytes: Buffer.byteLength(content, "utf8") };
}

export async function executeTool(name: string, args: any) {
  if (name === "list_files") {
    const dir = safe(args.path || "app");
    if (!fs.existsSync(dir)) return `目录不存在: ${args.path}`;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const lines = entries.map(e => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n");
    return `📁 ${args.path}:\n${lines || "(空)"}`;
  }
  if (name === "read_file") {
    const file = safe(args.path);
    if (!fs.existsSync(file)) throw new Error(`文件不存在: ${args.path}`);
    const content = fs.readFileSync(file, "utf-8");
    return content.slice(0, 15000) + (content.length > 15000 ? "\n...截断" : "");
  }
  if (name === "write_file") {
    const file = safe(args.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, args.content, "utf-8");
    return `✅ 已写入 ${args.path} (${args.content.length} 字符)`;
  }
  if (name === "run_command") {
    if (typeof args.command !== "string" || !args.command.trim()) throw new Error("command is required");
    const [binary, ...commandArgs] = args.command.trim().split(/\s+/);
    const decision = evaluateCommand(binary, commandArgs, ROOT);
    if (decision.decision !== "ALLOW" || !decision.absoluteBin) {
      const prefix = decision.decision === "REVIEW" ? "Command needs approval" : "Command denied";
      throw new Error(`${prefix}: ${decision.reason || binary}`);
    }
    const { stdout, stderr } = await execFileAsync(decision.absoluteBin, commandArgs, {
      cwd: ROOT,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH || "", HOME: process.env.HOME || "", NODE_ENV: process.env.NODE_ENV || "production" },
    });
    return `⚡ ${args.command}\nSTDOUT:\n${stdout.slice(0,8000)}\nSTDERR:\n${stderr.slice(0,8000)}`.trim();
  }
  throw new Error(`未知工具: ${name}`);
}

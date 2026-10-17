import path from "path";
import { realpathSync } from "fs";
import fs from "fs/promises";

export class PathGuardError extends Error {
  constructor(m: string){ super(m); this.name="PATH_TRAVERSAL"; }
}

export class PathGuard {
  realRoot: string;
  root: string;
  rootExists: boolean;
  constructor(rootDir: string){
    this.root = path.resolve(rootDir);
    try { 
      this.realRoot = realpathSync(this.root); 
      this.rootExists = true;
    } catch { 
      this.realRoot = this.root; 
      this.rootExists = false;
    }
  }

  isSameOrSubPath(target: string): boolean {
    const resolved = path.resolve(target);
    if(resolved===this.realRoot || resolved===this.root) return true;

    // 11:42 FINAL FIX: 当 root 本身不存在（如 Windows 上的 /srv/app），直接用相对路径判断
    // 这样可防前缀攻击，且不会因走到 C:\ 误判
    if(!this.rootExists){
      const rel = path.relative(this.realRoot, resolved);
      if(rel==="") return true;
      return !(rel.startsWith("..") || path.isAbsolute(rel));
    }

    // root 存在，执行 symlink 防御
    let cur = resolved;
    let restParts: string[] = [];
    let realAncestor = "";
    while(true){
      try {
        realAncestor = realpathSync(cur);
        break;
      } catch {
        const parent = path.dirname(cur);
        if(parent===cur) break;
        restParts.unshift(path.basename(cur));
        cur = parent;
      }
    }
    if(realAncestor){
      const rel = path.relative(this.realRoot, realAncestor);
      if(rel.startsWith("..") || path.isAbsolute(rel)){
        if(realAncestor!==this.realRoot) return false;
      }
      if(restParts.length){
        const rest = path.join(...restParts);
        const norm = path.normalize(rest);
        if(norm.startsWith("..") || path.isAbsolute(norm)) return false;
      }
      return true;
    } else {
      const rel = path.relative(this.realRoot, resolved);
      if(rel==="") return true;
      return !(rel.startsWith("..") || path.isAbsolute(rel));
    }
  }

  resolveAndValidate(unsafe: string): string {
    if(unsafe.includes("\0")) throw new PathGuardError("NULL_BYTE");
    const resolved = path.resolve(this.realRoot, unsafe);
    if(!this.isSameOrSubPath(resolved)) throw new PathGuardError("PATH_TRAVERSAL: "+unsafe);
    return resolved;
  }
}

export function getAppRoot(): string {
  return path.resolve(process.env.APP_ROOT || process.cwd());
}

export function resolveAndValidatePath(unsafe: string, root = getAppRoot()): string {
  return new PathGuard(root).resolveAndValidate(unsafe);
}

export function isSameOrSubPath(root: string, target: string): boolean {
  return new PathGuard(root).isSameOrSubPath(target);
}

export function isSubPath(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedRoot === resolvedTarget) return false;
  return new PathGuard(root).isSameOrSubPath(target);
}

export async function atomicWriteFile(unsafe: string, content: string, root = getAppRoot()): Promise<void> {
  const destination = resolveAndValidatePath(unsafe, root);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}


import { TaskManager, Task } from "../task-core.js";

export class SARAServer {
  private tm: TaskManager;
  constructor(appRoot = process.cwd()) { this.tm = new TaskManager(appRoot); }
  async init(){ await this.tm.init(); }
  async createAndStart(req: any): Promise<Task> {
    const t = await this.tm.createTask({ sessionId: req.sessionId, title: req.title, type: req.type||'general', description: req.description, risk: req.risk||'low' });
    return this.tm.start(t.id, req.sessionId);
  }
  async list(sid: string){ return this.tm.listBySession(sid); }
  async get(id: string, sid: string){ return this.tm.getTask(id, sid); }
  async complete(id: string, sid: string, r?: any){ return this.tm.complete(id, sid, r); }
  async fail(id: string, sid: string, e: string){ return this.tm.fail(id, sid, e); }
  async requestApproval(id: string, sid: string, a: any){ return this.tm.requestApproval(id, sid, a); }
  async approve(id: string, sid: string, ok: boolean){ return this.tm.approve(id, sid, ok); }
  async cancel(id: string, sid: string){ return this.tm.cancel(id, sid); }
  async counts(sid: string){ return this.tm.countBySession(sid); }
  async handleFileTask(sid: string, fp: string, content: string){
    return this.createAndStart({ sessionId: sid, title: `Write file: ${fp}`, type: 'file', description: `SARA file task`, risk: 'medium' });
  }
  async handleCommandTask(sid: string, cmd: string, args: string[]){
    const binary = cmd.split(' ')[0];
    const isHigh = ['rm','sudo','chmod','chown'].includes(binary);
    const t = await this.createAndStart({ sessionId: sid, title: `Run: ${cmd} ${args.join(' ')}`, type: 'command', description: `SARA command`, risk: isHigh?'high':'medium' });
    if(isHigh){
      await this.tm.requestApproval(t.id, sid, { command: cmd, args, binary, risk: 'high', reason: `High-risk: ${cmd}` });
      return this.tm.getTask(t.id, sid);
    }
    return t;
  }
}

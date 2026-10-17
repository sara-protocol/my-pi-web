
import { executeTool } from "./file-tools";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
const TOOLS = [
  { type: "function", function: { name: "list_files", description: "列出目录", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "read_file", description: "读取文件", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "写入文件", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path","content"] } } },
  { type: "function", function: { name: "run_command", description: "执行命令", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
];
const SYSTEM = `你是 my-pi-web v1.3 本地离线编程助手。
工具：list_files(path), read_file(path), write_file(path,content), run_command(command)
重要规则：列出或读取文件后，必须用自然语言总结结果，不要重复调用同一个工具！`;
function extractToolFromContent(content: string): {name:string, arguments:any} | null {
  try {
    const m = content.match(/\{\s*"?name"?\s*:\s*"([^"]+)"\s*,\s*"?arguments"?\s*:\s*(\{[\s\S]*\})/);
    if (m) return { name: m[1], arguments: JSON.parse(m[2]) };
    const obj = JSON.parse(content.trim());
    if (obj.name && obj.arguments) return { name: obj.name, arguments: obj.arguments };
  } catch {}
  return null;
}
export async function runLocalAgent(userMessage: string, sessionId: string, onEvent?: (event: any) => void) {
  const messages: any[] = [{ role: "system", content: SYSTEM }, { role: "user", content: userMessage }];
  const collected: any[] = [];
  const seen = new Set<string>();
  let loops = 0;
  while (loops < 3) {
    loops++;
    const res = await fetch(`${OLLAMA_URL}/api/chat`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ model: OLLAMA_MODEL, messages, tools: TOOLS, stream: false }) });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Ollama ${res.status}: ${txt.slice(0,800)}`); }
    const data = await res.json();
    const msg = data.message;
    if (!msg) throw new Error("Ollama 无返回");
    let toolCalls: any[] = msg.tool_calls || [];
    if (toolCalls.length === 0 && msg.content) {
      const extracted = extractToolFromContent(msg.content);
      if (extracted) toolCalls = [{ function: extracted }];
    }
    if (toolCalls.length > 0) {
      let didNew = false;
      for (const tc of toolCalls) {
        const fn = tc.function;
        const key = fn.name + JSON.stringify(fn.arguments);
        if (seen.has(key)) continue;
        seen.add(key);
        didNew = true;
        collected.push({ tool_call: { name: fn.name, arguments: fn.arguments } });
        onEvent?.({ type: "tool_call", name: fn.name, arguments: fn.arguments });
        try {
          const result = await executeTool(fn.name, fn.arguments);
          const toolResultMsg = { role: "tool", content: typeof result === "string" ? result : JSON.stringify(result).slice(0,12000) };
          messages.push(toolResultMsg);
          collected.push({ tool_result: toolResultMsg.content, tool_name: fn.name });
          onEvent?.({ type: "tool_result", name: fn.name, content: toolResultMsg.content });
        } catch (e:any) {
          const err = e?.message || String(e);
          messages.push({ role: "tool", content: `Error: ${err}` });
          collected.push({ tool_result: `Error: ${err}`, tool_name: fn.name, is_error: true });
          onEvent?.({ type: "tool_result", name: fn.name, content: `Error: ${err}`, is_error: true });
        }
      }
      if (!didNew) {
        collected.push({ content: "✅ 已完成 " + userMessage + "，结果见上方工具输出。" });
        break;
      }
      continue;
    } else {
      collected.push({ content: msg.content || "✅ 完成" });
      onEvent?.({ type: "text", text: msg.content || "✅ 完成" });
      break;
    }
  }
  return { messages: collected };
}

'use client';
import Link from "next/link";
const cards = [
  { href: "/chat", icon: "💬", title: "对话", desc: "AI 编程助手 v1.3", color: "from-zinc-800 to-zinc-900" },
  { href: "/login", icon: "🔐", title: "登录界面预览", desc: "演示界面，尚未接入认证", color: "from-violet-600 to-fuchsia-500" },
  { href: "/calc", icon: "🧮", title: "计算器", desc: "渐变玻璃 + 动画", color: "from-violet-600 to-cyan-400" },
  { href: "/todo", icon: "✅", title: "待办", desc: "本地存储", color: "from-emerald-400 to-blue-600" },
  { href: "/weather", icon: "⛅", title: "天气", desc: "5天预报 mock", color: "from-sky-500 to-violet-600" },
  { href: "/manual", icon: "📖", title: "手册", desc: "v1.3 操作指南", color: "from-fuchsia-500 to-orange-400" },
];
export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-[1000px] mx-auto p-6">
        <div className="mt-8 mb-10">
          <div className="inline-flex gap-2 flex-wrap">
            <div className="px-3 py-1 rounded-full bg-white/10 text-xs tracking-widest">MY-PI-WEB • Ollama 本地助手原型</div>
            <div className="px-3 py-1 rounded-full bg-amber-400 text-black text-xs font-bold">认证与远程访问尚未就绪</div>
          </div>
          <h1 className="text-5xl font-black tracking-tight mt-4">本地 AI<br/>编程助手</h1>
          <p className="opacity-60 mt-3 max-w-[500px]">面向本地 Ollama 的编程助手原型，提供项目文件浏览、聊天和工具调用。登录页为演示界面；Web API 尚未接入用户认证，请仅在可信的本地环境中运行。</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {cards.map(c=>(
            <Link key={c.href} href={c.href} className={`rounded-[24px] p-5 bg-gradient-to-br ${c.color} relative overflow-hidden group hover:scale-[1.02] transition`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_50%)] opacity-60" />
              <div className="relative"><div className="text-3xl">{c.icon}</div><div className="font-bold mt-2">{c.title}</div><div className="text-xs opacity-80 mt-1">{c.desc}</div><div className="text-[10px] opacity-60 mt-3 font-mono">{c.href}</div></div>
            </Link>
          ))}
        </div>
        <div className="text-center mt-12 opacity-30 text-[11px]">MY-PI-WEB • <a href="/chat" className="underline font-bold">打开对话 💬</a> • <a href="/login" className="underline">查看登录界面预览 🔐</a></div>
      </div>
    </div>
  );
}

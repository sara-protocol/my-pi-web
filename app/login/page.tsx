'use client';
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [show, setShow] = useState(false);
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6 relative overflow-hidden">
      {/* 背景渐变光球 */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-600 rounded-full blur-[120px] opacity-50 animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] bg-cyan-500 rounded-full blur-[130px] opacity-40 animate-pulse" style={{animationDelay:'1s'}} />
        <div className="absolute top-[40%] left-[50%] w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[100px] opacity-30" />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <div className="mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-400 flex items-center justify-center text-xl font-black">π</div>
            <h1 className="text-3xl font-black tracking-tight mt-4">欢迎回来</h1>
            <p className="text-sm opacity-60 mt-2">界面预览 • 认证功能尚未接入</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] tracking-widest opacity-50">USERNAME</label>
              <input value={user} onChange={e=>setUser(e.target.value)} placeholder="输入用户名" className="mt-1 w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-violet-500 focus:bg-white/[0.08] transition text-sm" />
            </div>
            <div>
              <label className="text-[11px] tracking-widest opacity-50">PASSWORD</label>
              <div className="relative mt-1">
                <input type={show ? 'text' : 'password'} value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="••••••••" className="w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 pr-12 outline-none focus:border-violet-500 transition text-sm" />
                <button onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-60 hover:opacity-100">{show ? '🙈' : '👁️'}</button>
              </div>
            </div>

            <button disabled className="w-full mt-2 bg-white/50 text-black/60 rounded-xl py-3 font-bold text-sm cursor-not-allowed">
              登录功能尚未接入
            </button>

            <div className="flex justify-between text-[11px] opacity-50 mt-3">
              <span className="opacity-50">忘记密码功能未接入</span>
              <Link href="/" className="hover:opacity-100 hover:underline">← 返回首页</Link>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 flex gap-2">
            <div className="flex-1 bg-white/5 rounded-xl p-3 text-[10px]"><div className="opacity-50">STATUS</div><div className="text-amber-300 font-bold">未检测</div></div>
            <div className="flex-1 bg-white/5 rounded-xl p-3 text-[10px]"><div className="opacity-50">默认模型</div><div className="font-bold">qwen2.5-coder:7b</div></div>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] opacity-30">
          登录界面演示 • 不提供认证或访问控制
        </div>
      </div>
    </div>
  );
}

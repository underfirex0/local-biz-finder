import React, { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

type Props = { onAuthed: () => void };

export const AuthBox: React.FC<Props> = ({ onAuthed }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) onAuthed();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onAuthed();
    });

    return () => sub.subscription.unsubscribe();
  }, [onAuthed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return setMsg(error.message);
      setMsg("Account created. Switch to Login.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setMsg(error.message);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-sm">
        <div className="text-center mb-5">
          <div className="font-black text-2xl text-slate-900">MarqGrowth CRM</div>
          <div className="text-sm text-slate-500">Login to see shared leads</div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />

          {msg && <div className="text-sm text-red-600 font-bold">{msg}</div>}

          <button className="w-full bg-slate-900 text-white rounded-lg py-2 font-bold">
            {mode === "login" ? "Login" : "Create account"}
          </button>

          <button
            type="button"
            className="w-full text-sm text-blue-600 font-bold"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AuthPage() {
  const router = useRouter();
  const [screen, setScreen] = useState('welcome'); // welcome | login | setup
  const [hasAdmin, setHasAdmin] = useState(null);
  const [form, setForm] = useState({ name:'', password:'', confirm:'' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If already logged in, redirect
    fetch('/api/auth/me').then(r => { if (r.ok) router.replace('/dashboard'); });
    fetch('/api/auth/check').then(r => r.json()).then(d => setHasAdmin(d.hasAdmin));
  }, []);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    const endpoint = screen === 'login' ? '/api/auth/login' : '/api/auth/setup';
    if (screen === 'setup' && form.password !== form.confirm) {
      setErr('Passwords do not match'); setLoading(false); return;
    }
    const r = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ name: form.name, password: form.password }),
    });
    const d = await r.json();
    setLoading(false);
    if (!r.ok) { setErr(d.error || 'Error'); return; }
    router.replace('/dashboard');
  }

  if (screen === 'welcome') return (
    <div className="auth-center">
      <div className="auth-box" style={{ textAlign:'center' }}>
        <div style={{ fontSize:42, marginBottom:16 }}>📋</div>
        <h1 style={{ fontSize:24, fontWeight:700, marginBottom:8, lineHeight:1.3 }}>
          Welcome to<br/>Team Task OS
        </h1>
        <p style={{ fontSize:13, color:'var(--t2)', marginBottom:28, lineHeight:1.6 }}>
          Manage tasks and teams, all in one place.
        </p>
        <button className="btn btn-p" style={{ width:'100%', padding:11, fontSize:14, marginBottom:10 }}
          onClick={() => { setErr(''); setScreen('login'); }}>Login</button>
        <button className="btn" style={{ width:'100%', padding:11, fontSize:14 }}
          onClick={() => { setErr(''); setScreen('setup'); }}>Create New Admin Account</button>
      </div>
    </div>
  );

  const isSetup = screen === 'setup';
  return (
    <div className="auth-center">
      <div className="auth-box">
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <button className="btn btn-sm" style={{ border:'none', fontSize:18, color:'var(--t2)', padding:'2px 8px' }}
            onClick={() => { setErr(''); setScreen('welcome'); }}>←</button>
          <h1 style={{ fontSize:18, fontWeight:600 }}>{isSetup ? 'Create Admin Account' : 'Sign In'}</h1>
        </div>
        {isSetup && <p style={{ fontSize:12, color:'var(--t2)', marginBottom:14, lineHeight:1.5 }}>
          This will be the administrator account for your Team Task OS.
        </p>}
        <form onSubmit={submit}>
          <div className="fi">
            <label>Name</label>
            <input className="inp" value={form.name} onChange={set('name')} placeholder="Your name" required />
          </div>
          <div className="fi">
            <label>Password</label>
            <input className="inp" type="password" value={form.password} onChange={set('password')} placeholder="Password" required />
          </div>
          {isSetup && <div className="fi">
            <label>Confirm Password</label>
            <input className="inp" type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required />
          </div>}
          {err && <p style={{ color:'#e05555', fontSize:12, marginBottom:8 }}>⚠ {err}</p>}
          <button className="btn btn-p" style={{ width:'100%', padding:9 }} disabled={loading}>
            {loading ? 'Please wait…' : isSetup ? 'Create Admin Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import useSWR, { mutate as globalMutate } from 'swr';

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS = ['#7F77DD','#1D9E75','#D85A30','#D4537E','#378ADD','#639922','#BA7517','#888780'];
const UCOLS  = ['#7F77DD','#378ADD','#1D9E75','#D85A30','#D4537E','#BA7517','#639922','#9B59B6'];
const PRI = {
  ui:  { l:'Urgent & Important',    s:'U+I',  cls:'t-ui' },
  uni: { l:'Urgent, Not Important', s:'U,!I', cls:'t-uni' },
  niu: { l:'Important, Not Urgent', s:'I,!U', cls:'t-niu' },
};
const ST_CLS = { assigned:'t-sass', scheduled:'t-ssched', inprogress:'t-sinp', done:'t-sdone' };
const ST_LBL = { assigned:'Assigned', scheduled:'Scheduled', inprogress:'In Progress', done:'Completed' };
const APR_CLS = { assigned:'t-apr-asgn', in_review:'t-apr-rev', approved:'t-apr-ok', comments_issued:'t-apr-cmt' };
const APR_LBL = { assigned:'Approval: Assigned', in_review:'In Review', approved:'Approved', comments_issued:'Comments Issued' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const fetcher = url => fetch(url).then(r => { if(!r.ok) throw new Error(); return r.json(); });
const api = async (url, method='GET', body) => {
  const r = await fetch(url, {
    method, headers: body ? {'Content-Type':'application/json'} : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  // Next returns HTML (not JSON) for 413 / 500 etc. — parse defensively.
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }
  if (!r.ok) {
    const msg = (data && data.error)
      || (r.status === 413 ? 'File too large — total request exceeded server limit.' : null)
      || `Request failed (${r.status})`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return data;
};

function isoToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
function dLeft(dl) {
  if (!dl) return null;
  const n = new Date(); n.setHours(0,0,0,0);
  const d = new Date(dl); d.setHours(0,0,0,0);
  return Math.round((d-n)/86400000);
}
function dInfo(dl) {
  if (!dl) return null;
  const d = dLeft(dl);
  const dt = new Date(dl+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  if (d < 0)  return { l:`Overdue · ${dt}`,   c:'t-dov' };
  if (d === 0) return { l:`Today · ${dt}`,     c:'t-du' };
  if (d === 1) return { l:`Tomorrow · ${dt}`,  c:'t-dw' };
  if (d <= 3)  return { l:`${d}d · ${dt}`,     c:'t-dw' };
  return         { l:`${d}d · ${dt}`,           c:'t-dok' };
}
function normSt(s) { return s === 'todo' ? 'scheduled' : s || 'assigned'; }
function pOrd(p) { return p==='ui'?0:p==='uni'?1:p==='niu'?2:3; }
function sortT(arr) {
  return [...arr].sort((a,b) => {
    const p = pOrd(a.priority) - pOrd(b.priority); if (p) return p;
    return (a.deadline?dLeft(a.deadline):9999) - (b.deadline?dLeft(b.deadline):9999);
  });
}
function uCol(id, users) {
  const i = users.findIndex(u => (u.id||u._id?.toString()) === id?.toString());
  return i >= 0 ? UCOLS[i % UCOLS.length] : '#666';
}
function ini(n) { return n ? n[0].toUpperCase() : '?'; }
function fmtSize(b) { return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB'; }

function RoleBadge({ role }) {
  const cls = { admin:'rb-admin', manager:'rb-manager', user:'rb-user' }[role] || 'rb-user';
  return <span className={`rb ${cls}`}>{role}</span>;
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ taskId, rating, editable, onRate }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="stars">
      {[1,2,3,4,5].map(i => (
        <span key={i}
          className={`star ${i <= (hover || rating || 0) ? 'filled' : ''} ${!editable ? 'ro' : ''}`}
          onMouseEnter={() => editable && setHover(i)}
          onMouseLeave={() => editable && setHover(0)}
          onClick={e => { e.stopPropagation(); editable && onRate(taskId, i === rating ? 0 : i); }}
          title={editable ? `${i} star${i>1?'s':''}` : ''}
        >★</span>
      ))}
    </span>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, num, users, companies, canRate, onRate, onClick }) {
  const subs = task.subtasks || [];
  const sd = subs.filter(s => s.done).length;
  const sp = subs.length ? Math.round(sd/subs.length*100) : 0;
  const st = normSt(task.status);
  const dd = dInfo(task.deadline);
  const links = task.links || [], atts = task.attachments || [];
  const co = companies?.find(c => (c.id||c._id?.toString()) === task.companyId?.toString());
  const au = users?.find(u => (u.id||u._id?.toString()) === task.assignedTo?.toString());
  const uc = au ? uCol(au.id||au._id?.toString(), users) : '#666';

  return (
    <div className={`card ${st==='done'?'done':''}`} onClick={onClick}>
      <div className="cn">#{num}</div>
      <div className="cb">
        <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:4 }}>
          <span className={`ct ${st==='done'?'done':''}`} style={{ flex:1 }}>{task.title}</span>
          {task.priority && PRI[task.priority] && (
            <span className={`tag ${PRI[task.priority].cls}`} title={PRI[task.priority].l}>
              {PRI[task.priority].s}
            </span>
          )}
        </div>
        {task.description && <div className="cd">{task.description}</div>}
        {task.notes && <div style={{ fontSize:12, color:'#666', fontStyle:'italic', lineHeight:1.4, marginBottom:4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{task.notes}</div>}
        <div className="tags">
          <span className={`tag ${ST_CLS[st]||'t-stodo'}`}>{ST_LBL[st]||st}</span>
          {dd && <span className={`tag ${dd.c}`}>{dd.l}</span>}
          {au && <span style={{ display:'inline-flex', alignItems:'center', gap:3, background:'rgba(127,119,221,.15)', color:'#a0a0e8', fontSize:11, padding:'2px 7px', borderRadius:5, fontWeight:500 }}>
            <span style={{ width:12, height:12, borderRadius:'50%', background:uc, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff' }}>{ini(au.name)}</span>
            {au.name}
          </span>}
          {subs.length > 0 && <span style={{ fontSize:11, color:'var(--t3)' }}>✓ {sd}/{subs.length}</span>}
          {task.approvalStatus && (
            <span className={`tag ${APR_CLS[task.approvalStatus]||''}`}>
              🔍 {APR_LBL[task.approvalStatus]||task.approvalStatus}
            </span>
          )}
          {links.map(l => (
            <a key={l.id} className="lnkbdg" href={l.url} target="_blank" rel="noopener"
               onClick={e => e.stopPropagation()}>↗ {l.label || l.url.replace(/^https?:\/\//,'').split('/')[0]}</a>
          ))}
          {atts.map(a => (
            <button key={a.id} className="attbdg" onClick={e => { e.stopPropagation(); dlAtt(a); }}>
              ⇩ {a.name} <span style={{ opacity:.6 }}>({fmtSize(a.size)})</span>
            </button>
          ))}
        </div>
        {st === 'done' && (() => {
          const end   = task.completedAt || task.updatedAt;
          const start = task.createdAt;
          let daysLbl = null;
          if (end && start) {
            const ms = new Date(end) - new Date(start);
            const days = Math.max(0, Math.round(ms / 86400000));
            daysLbl = days === 0 ? 'same day' : days === 1 ? '1 day' : `${days} days`;
          }
          return (
            <div className="rating-row">
              <span style={{ fontSize:11, color:'var(--t3)' }}>Rating:</span>
              <Stars taskId={task.id||task._id?.toString()} rating={task.rating||0} editable={canRate} onRate={onRate} />
              {task.rating
                ? <span style={{ fontSize:12, color:'#f0a030', fontWeight:600 }}>{task.rating}/5</span>
                : <span style={{ fontSize:11, color:'var(--t3)' }}>{canRate ? 'not yet rated' : '—'}</span>
              }
              {daysLbl && (
                <span style={{ fontSize:11, color:'var(--t3)' }}>
                  · ⏱ completed in {daysLbl}
                </span>
              )}
            </div>
          );
        })()}
        {subs.length > 0 && (
          <div className="prog"><div className={`progf ${sp===100?'full':''}`} style={{ width:`${sp}%` }} /></div>
        )}
      </div>
    </div>
  );
}

function dlAtt(a) {
  const link = document.createElement('a');
  link.href = a.data; link.download = a.name;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// ── Task Modal ────────────────────────────────────────────────────────────────
function TaskModal({ task, users, companies, me, onSave, onDelete, onClose }) {
  const isNew = !task._id && !task.id;
  const meId  = me.id || me._id?.toString();
  // Approval permission flags (based on original task data, not live form)
  const isAssignee  = (task.assignedTo?.toString() || '') === meId;
  const isApprover  = !!(task.approvalRequestedTo) && task.approvalRequestedTo?.toString() === meId;
  const isAdminUser = me.role === 'admin';
  const canRequest  = isAssignee || isAdminUser;   // can submit / cancel
  const canReview   = isApprover || isAdminUser;   // can change status / add comments

  const [form, setForm] = useState({
    title: task.title||'', description: task.description||'',
    notes: task.notes||'', companyId: task.companyId||'',
    assignedTo: task.assignedTo||'', priority: task.priority||'',
    status: normSt(task.status), deadline: task.deadline||'',
    approvalRequestedTo: task.approvalRequestedTo?.toString() || '',
    approvalStatus:      task.approvalStatus || '',
    approvalComments:    task.approvalComments || '',
  });
  const [subs, setSubs] = useState(task.subtasks ? [...task.subtasks] : []);
  const [links, setLinks] = useState(task.links ? [...task.links] : []);
  const [atts, setAtts]   = useState(task.attachments ? [...task.attachments] : []);
  const [newSub, setNewSub] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function addSub() {
    const t = newSub.trim(); if (!t) return;
    setSubs(s => [...s, { id: uid(), text:t, done:false }]); setNewSub('');
  }
  function addLink() {
    let url = newLinkUrl.trim(); if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    setLinks(l => [...l, { id:uid(), url, label:newLinkLabel.trim() }]);
    setNewLinkUrl(''); setNewLinkLabel('');
  }
  function addAtt(e) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2*1024*1024) { alert('Max 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setAtts(a => [...a, { id:uid(), name:f.name, type:f.type||'', size:f.size, data:ev.target.result }]);
    reader.readAsDataURL(f);
    e.target.value = '';
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaveErr('');
    setSaving(true);
    try {
      await onSave({ ...form, subtasks:subs, links, attachments:atts });
    } catch (e) {
      setSaveErr(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const canPickDate = () => { try { document.getElementById('mDl')?.showPicker(); } catch(e) {} };

  return (
    <div className="ov" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mh">
          <h2 style={{ fontSize:15, fontWeight:500 }}>{isNew ? 'New task' : 'Edit task'}</h2>
          <button className="btn btn-sm" style={{ border:'none', fontSize:17, padding:'0 4px' }} onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <div className="fi"><label>Title *</label>
            <input className="inp" value={form.title} onChange={set('title')} placeholder="What needs to be done?" />
          </div>
          <div className="fi"><label>Description</label>
            <textarea className="ta" value={form.description} onChange={set('description')} placeholder="Add details…" />
          </div>
          <div className="r2">
            <div className="fi"><label>Company</label>
              <select className="sel" value={form.companyId} onChange={set('companyId')}>
                <option value="">— None —</option>
                {companies?.map(c => <option key={c.id||c._id} value={c.id||c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="fi"><label>Assign to</label>
              <select className="sel" value={form.assignedTo} onChange={set('assignedTo')}>
                <option value="">— Unassigned —</option>
                {(me.role === 'admin' ? users : users?.filter(u => u.role !== 'admin'))
                  ?.map(u => <option key={u.id||u._id} value={u.id||u._id}>{u.name} ({u.role})</option>)}
              </select>
              {!isNew && (
                <p style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                  Changing this hands the task off — it will appear in the new assignee's list instead of yours.
                </p>
              )}
            </div>
          </div>
          <div className="r2">
            <div className="fi"><label>Priority</label>
              <select className="sel" value={form.priority} onChange={set('priority')}>
                <option value="">— None —</option>
                <option value="ui">Urgent &amp; Important</option>
                <option value="uni">Urgent, Not Important</option>
                <option value="niu">Important, Not Urgent</option>
              </select>
            </div>
            <div className="fi"><label>Status</label>
              <select className="sel" value={form.status} onChange={set('status')}>
                <option value="assigned">Assigned</option>
                <option value="scheduled">Scheduled</option>
                <option value="inprogress">In Progress</option>
                <option value="done">Completed</option>
              </select>
            </div>
          </div>
          <div className="fi">
            <label>Deadline</label>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input id="mDl" className="inp" type="date" value={form.deadline} onChange={set('deadline')} style={{ flex:1 }} />
              <button className="btn" onClick={canPickDate} style={{ padding:'6px 12px', flexShrink:0 }}>📅 Pick</button>
            </div>
          </div>
          <div className="fi"><label>Notes</label>
            <textarea className="ta" value={form.notes} onChange={set('notes')} placeholder="Additional notes…" />
          </div>

          {/* Subtasks */}
          <div className="fi"><label>Subtasks</label>
            {subs.length === 0 && <p style={{ fontSize:12, color:'var(--t3)', fontStyle:'italic', padding:'3px 0' }}>No subtasks yet</p>}
            {subs.map((s,i) => (
              <div key={s.id} className="sub-row">
                <input type="checkbox" checked={s.done} style={{ width:14, height:14, accentColor:'#e8e8e8', cursor:'pointer' }}
                  onChange={() => setSubs(ss => ss.map((x,j) => j===i ? {...x, done:!x.done} : x))} />
                <span style={{ flex:1, fontSize:13, textDecoration:s.done?'line-through':undefined, color:s.done?'var(--t3)':undefined }}>{s.text}</span>
                <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', fontSize:15, padding:'0 4px' }}
                  onClick={() => setSubs(ss => ss.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <input className="inp" value={newSub} onChange={e=>setNewSub(e.target.value)} placeholder="Add subtask…" style={{ flex:1 }}
                onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addSub())} />
              <button className="btn btn-sm" onClick={addSub}>Add</button>
            </div>
          </div>

          {/* Links */}
          <div className="fi"><label>Links</label>
            {links.map((l,i) => (
              <div key={l.id} className="lrow">
                <span style={{ color:'#378ADD' }}>↗</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="lrow-name">{l.label || '(no label)'}</div>
                  <div className="lrow-url">{l.url}</div>
                </div>
                <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', fontSize:15, padding:'0 4px' }}
                  onClick={() => setLinks(ll=>ll.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
            <div style={{ display:'flex', gap:6 }}>
              <input className="inp" value={newLinkUrl} onChange={e=>setNewLinkUrl(e.target.value)} type="url" placeholder="https://…" style={{ flex:2 }}
                onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addLink())} />
              <input className="inp" value={newLinkLabel} onChange={e=>setNewLinkLabel(e.target.value)} placeholder="Label" style={{ flex:1 }}
                onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addLink())} />
              <button className="btn btn-sm" onClick={addLink}>Add</button>
            </div>
          </div>

          {/* Attachments */}
          <div className="fi">
            <label>Attachments <span style={{ color:'var(--t3)', fontWeight:'normal' }}>(max 2 MB each)</span></label>
            {atts.map((a,i) => (
              <div key={a.id} className="lrow">
                <span style={{ color:'var(--t2)' }}>⇩</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="lrow-name">{a.name}</div>
                  <div className="lrow-url">{fmtSize(a.size)}{a.type ? ` · ${a.type}` : ''}</div>
                </div>
                <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--t3)', fontSize:15, padding:'0 4px' }}
                  onClick={() => setAtts(aa=>aa.filter((_,j)=>j!==i))}>×</button>
              </div>
            ))}
            <input type="file" onChange={addAtt} />
            <div className="status-note">
              <strong>Note:</strong><br/>
              <strong>Assigned</strong> — the task has not yet been accepted or scheduled.<br/>
              <strong>Scheduled</strong> — the user has seen and scheduled it for execution.<br/>
              <strong>In Progress</strong> — the user has started working on the task.<br/>
              <strong>Completed</strong> — the user has finished the task.
            </div>
          </div>

          {/* ── Approval ─────────────────────────────────────────────── */}
          {!isNew && (canRequest || canReview || form.approvalRequestedTo) && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--b)' }}>
              <div style={{ fontSize:12, color:'var(--t2)', fontWeight:600, marginBottom:8, letterSpacing:'.02em' }}>
                🔍 Approval
              </div>

              {/* No approver selected yet — assignee / admin can pick one */}
              {!form.approvalRequestedTo && canRequest && (
                <div className="fi">
                  <label>Submit for Approval — select approver</label>
                  <select className="sel" value=""
                    onChange={e => { if (e.target.value) setForm(f => ({ ...f, approvalRequestedTo: e.target.value, approvalStatus: 'assigned' })); }}>
                    <option value="">— Select approver —</option>
                    {users?.filter(u => (u.id||u._id?.toString()) !== form.assignedTo)
                      .map(u => <option key={u.id||u._id} value={u.id||u._id}>{u.name} ({u.role})</option>)}
                  </select>
                  <p style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                    Selecting an approver submits the request when you save.
                  </p>
                </div>
              )}

              {/* Approver selected — show status + controls */}
              {form.approvalRequestedTo && (() => {
                const approverName = users?.find(u=>(u.id||u._id?.toString())===form.approvalRequestedTo)?.name || '—';
                return (
                  <>
                    {/* Info row */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap', padding:'8px 10px', background:'#151515', borderRadius:6, border:'1px solid var(--b)' }}>
                      <span style={{ fontSize:12, color:'var(--t2)' }}>Approver:</span>
                      <span style={{ fontSize:13, fontWeight:500 }}>{approverName}</span>
                      {form.approvalStatus && (
                        <span className={`tag ${APR_CLS[form.approvalStatus]||''}`}>
                          {APR_LBL[form.approvalStatus]||form.approvalStatus}
                        </span>
                      )}
                    </div>

                    {/* Approver / admin: update status */}
                    {canReview && (
                      <div className="fi">
                        <label>Approval Status</label>
                        <select className="sel" value={form.approvalStatus} onChange={set('approvalStatus')}>
                          <option value="assigned">Assigned</option>
                          <option value="in_review">In Review</option>
                          <option value="approved">Approved</option>
                          <option value="comments_issued">Comments Issued</option>
                        </select>
                      </div>
                    )}

                    {/* Approver / admin: forward (re-assign) approval to someone else */}
                    {canReview && form.approvalStatus !== 'approved' && (
                      <div className="fi">
                        <label>Forward approval to another person</label>
                        <select className="sel" value=""
                          onChange={e => {
                            if (!e.target.value) return;
                            const u = users?.find(x => (x.id||x._id?.toString()) === e.target.value);
                            const name = u?.name || 'someone else';
                            if (!confirm(`Forward this approval request to ${name}? You'll no longer be the approver.`)) {
                              e.target.value = ''; return;
                            }
                            setForm(f => ({ ...f, approvalRequestedTo: e.target.value, approvalStatus: 'assigned' }));
                          }}>
                          <option value="">— Keep with me —</option>
                          {users
                            ?.filter(u => {
                              const uid2 = u.id||u._id?.toString();
                              return uid2 !== form.approvalRequestedTo && uid2 !== form.assignedTo;
                            })
                            .map(u => <option key={u.id||u._id} value={u.id||u._id}>{u.name} ({u.role})</option>)}
                        </select>
                        <p style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                          Forwarding transfers the approval request and resets the status to <em>Assigned</em>. Existing comments are kept for context.
                        </p>
                      </div>
                    )}

                    {/* Comments: editable for approver/admin, read-only otherwise */}
                    {canReview ? (
                      <div className="fi">
                        <label>Comments</label>
                        <textarea className="ta" value={form.approvalComments} onChange={set('approvalComments')}
                          placeholder="Add review comments…" />
                      </div>
                    ) : form.approvalComments ? (
                      <div style={{ background:'#151515', border:'1px solid var(--b)', borderRadius:6, padding:'10px 12px', fontSize:13, color:'var(--t2)', lineHeight:1.6, marginBottom:8 }}>
                        <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>Comments from approver:</div>
                        {form.approvalComments}
                      </div>
                    ) : null}

                    {/* Cancel — assignee / admin only, locked once approved */}
                    {canRequest && form.approvalStatus !== 'approved' && (
                      <button className="btn btn-sm btn-d" style={{ marginTop:4 }}
                        onClick={() => setForm(f => ({ ...f, approvalRequestedTo:'', approvalStatus:'', approvalComments:'' }))}>
                        Cancel Approval Request
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        {saveErr && (
          <div style={{ padding:'8px 16px', background:'rgba(220,60,60,.12)', borderTop:'1px solid rgba(220,60,60,.3)', color:'#e05555', fontSize:12 }}>
            ⚠ {saveErr}
          </div>
        )}
        <div className="mf">
          <div>{!isNew && <button className="btn btn-sm btn-d" onClick={onDelete}>Delete</button>}</div>
          <div style={{ display:'flex', gap:7 }}>
            <button className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-p btn-sm" onClick={save} disabled={saving||!form.title.trim()}>
              {isNew ? 'Create task' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Company Modal ─────────────────────────────────────────────────────────────
function CoModal({ co, onSave, onDelete, onClose }) {
  const isNew = !co._id && !co.id;
  const [name, setName] = useState(co.name||'');
  const [color, setColor] = useState(co.color||COLORS[0]);
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:300 }}>
        <div className="mh">
          <h2 style={{ fontSize:15, fontWeight:500 }}>{isNew?'Add company':'Edit company'}</h2>
          <button className="btn btn-sm" style={{ border:'none', fontSize:17, padding:'0 4px' }} onClick={onClose}>×</button>
        </div>
        <div className="mb">
          <div className="fi"><label>Name *</label>
            <input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Acme Ltd" />
          </div>
          <div className="fi"><label>Colour</label>
            <div className="swrow">
              {COLORS.map(c => (
                <span key={c} className={`sw ${c===color?'sel':''}`} style={{ background:c }}
                  onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="mf">
          <div>{!isNew && <button className="btn btn-sm btn-d" onClick={onDelete}>Delete</button>}</div>
          <div style={{ display:'flex', gap:7 }}>
            <button className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-p btn-sm" onClick={()=>name.trim()&&onSave({name:name.trim(),color})} disabled={!name.trim()}>
              {isNew?'Add':'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Users Modal ───────────────────────────────────────────────────────────────
function UsersModal({ users, me, onEdit, onDelete, onAdd, onClose }) {
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{ maxWidth:440 }}>
        <div className="mh">
          <h2 style={{ fontSize:15, fontWeight:500 }}>👥 Team Members</h2>
          <button className="btn btn-sm" style={{ border:'none', fontSize:17, padding:'0 4px' }} onClick={onClose}>×</button>
        </div>
        <div className="mb">
          {users.length === 0 && <p style={{ color:'var(--t3)', fontStyle:'italic', padding:'8px 0', textAlign:'center' }}>No users yet</p>}
          {users.map((u,i) => {
            const col = UCOLS[i%UCOLS.length];
            const mgr = users.find(x=>(x.id||x._id?.toString())===u.managerId?.toString());
            const sup = users.find(x=>(x.id||x._id?.toString())===u.supervisorId?.toString());
            const team = users.filter(x=>x.managerId?.toString()===(u.id||u._id?.toString())).map(x=>x.name).join(', ');
            return (
              <div key={u.id||u._id} className="urow">
                <div className="uav" style={{ background:col }}>{ini(u.name)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>{u.name}</span>
                    <RoleBadge role={u.role} />
                  </div>
                  {mgr && <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>Manager: {mgr.name}</div>}
                  {sup && <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>Supervisor: {sup.name}</div>}
                  {team && <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>Team: {team}</div>}
                </div>
                <button className="btn btn-sm" onClick={()=>onEdit(u)}>Edit</button>
                {(u.id||u._id?.toString()) !== me.id &&
                  <button className="btn btn-sm btn-d" onClick={()=>onDelete(u.id||u._id?.toString())}>Remove</button>}
              </div>
            );
          })}
        </div>
        <div className="mf">
          <div />
          <div style={{ display:'flex', gap:7 }}>
            <button className="btn btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-p btn-sm" onClick={onAdd}>+ Add User</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── User Form Modal ───────────────────────────────────────────────────────────
function UserFormModal({ user, users, me, onSave, onDelete, onBack }) {
  const isNew = !user.id && !user._id;
  const [form, setForm] = useState({
    name: user.name||'', password:'', role: user.role||'user',
    managerId: user.managerId||'', supervisorId: user.supervisorId||'',
  });
  const [subIds, setSubIds] = useState(
    users.filter(u=>u.managerId?.toString()===(user.id||user._id?.toString())).map(u=>(u.id||u._id?.toString()))
  );
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));

  async function save() {
    if (!form.name.trim()) return;
    const pass = form.password.trim() || (isNew ? form.name.trim() : undefined);
    await onSave({ ...form, password:pass, subIds });
  }

  const managers = users.filter(u=>u.role==='manager'&&(u.id||u._id?.toString())!==(user.id||user._id?.toString()));
  const allOther = users.filter(u=>(u.id||u._id?.toString())!==(user.id||user._id?.toString())&&u.role!=='admin');

  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onBack()}>
      <div className="modal" style={{ maxWidth:400 }}>
        <div className="mh">
          <h2 style={{ fontSize:15, fontWeight:500 }}>{isNew?'Add User':'Edit User'}</h2>
          <button className="btn btn-sm" style={{ border:'none', fontSize:17, padding:'0 4px' }} onClick={onBack}>×</button>
        </div>
        <div className="mb">
          <div className="fi"><label>Full Name *</label>
            <input className="inp" value={form.name} onChange={set('name')} placeholder="Full name" />
          </div>
          <div className="r2">
            <div className="fi">
              <label>Password{isNew ? ' (default = name)' : ''}</label>
              <input className="inp" value={form.password} onChange={set('password')}
                placeholder={isNew ? 'Leave blank = use name' : 'New password (blank = keep)'} />
            </div>
            <div className="fi"><label>Role</label>
              <select className="sel" value={form.role} onChange={set('role')}>
                <option value="user">User</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {form.role === 'user' && (
            <div className="fi"><label>Reports to (Manager)</label>
              <select className="sel" value={form.managerId} onChange={set('managerId')}>
                <option value="">— None —</option>
                {managers.map(m=><option key={m.id||m._id} value={m.id||m._id}>{m.name}</option>)}
              </select>
            </div>
          )}
          {form.role === 'manager' && (<>
            <div className="fi"><label>Supervised by (Senior Manager)</label>
              <select className="sel" value={form.supervisorId} onChange={set('supervisorId')}>
                <option value="">— None —</option>
                {managers.map(m=><option key={m.id||m._id} value={m.id||m._id}>{m.name}</option>)}
              </select>
            </div>
            <div className="fi">
              <label>Team Members <span style={{ color:'var(--t3)', fontWeight:'normal', fontSize:11 }}>(direct reports)</span></label>
              <div style={{ background:'#151515', border:'1px solid var(--b)', borderRadius:'var(--r)', padding:'8px 10px', maxHeight:140, overflowY:'auto' }}>
                {allOther.length === 0 && <p style={{ fontSize:12, color:'var(--t3)', fontStyle:'italic' }}>No other users</p>}
                {allOther.map(u => {
                  const uid2 = u.id||u._id?.toString();
                  return (
                    <label key={uid2} style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 0', fontSize:13, cursor:'pointer' }}>
                      <input type="checkbox" style={{ width:14, height:14, accentColor:'#7F77DD' }}
                        checked={subIds.includes(uid2)}
                        onChange={() => setSubIds(s => s.includes(uid2) ? s.filter(x=>x!==uid2) : [...s,uid2])} />
                      {u.name} <RoleBadge role={u.role} />
                    </label>
                  );
                })}
              </div>
            </div>
          </>)}
        </div>
        <div className="mf">
          <div>
            {!isNew && (user.id||user._id?.toString()) !== me.id &&
              <button className="btn btn-sm btn-d" onClick={()=>onDelete(user.id||user._id?.toString())}>Delete</button>}
          </div>
          <div style={{ display:'flex', gap:7 }}>
            <button className="btn btn-sm" onClick={onBack}>Back</button>
            <button className="btn btn-p btn-sm" onClick={save} disabled={!form.name.trim()}>
              {isNew ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────
function CalendarView({ tasks, users, companies, canRate, onRate, onTaskClick, onDayClick, selectedDay }) {
  const [yr, setYr] = useState(new Date().getFullYear());
  const [mo, setMo] = useState(new Date().getMonth());
  const today = isoToday();

  function prevMo() { if (mo === 0) { setMo(11); setYr(y=>y-1); } else setMo(m=>m-1); }
  function nextMo() { if (mo === 11) { setMo(0); setYr(y=>y+1); } else setMo(m=>m+1); }

  const startDow = (new Date(yr,mo,1).getDay()+6)%7;
  const totalDays = new Date(yr,mo+1,0).getDate();
  const cells = [];
  for (let i=0;i<startDow;i++) cells.push(null);
  for (let d=1;d<=totalDays;d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function iso(d) {
    return `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  const dayTasks = selectedDay ? tasks.filter(t=>t.deadline===selectedDay) : [];

  return (
    <div>
      <div className="cal-nav">
        <button className="btn btn-sm" onClick={prevMo}>‹ Prev</button>
        <h2 style={{ fontSize:16, fontWeight:600 }}>{MONTHS[mo]} {yr}</h2>
        <button className="btn btn-sm" onClick={nextMo}>Next ›</button>
      </div>
      <div className="cal-grid">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {cells.map((d,i) => {
          if (!d) return <div key={`e${i}`} className="cal-day empty" />;
          const isoD = iso(d);
          const dt = tasks.filter(t=>t.deadline===isoD);
          const cls = `cal-day${isoD===today?' today':''}${isoD===selectedDay?' selected':''}`;
          return (
            <div key={d} className={cls} onClick={()=>onDayClick(isoD===selectedDay?null:isoD)}>
              <div className="cal-dn">{d}</div>
              {dt.length>0 && (
                <div className="cal-dots">
                  {dt.slice(0,6).map(t=>{
                    const co=companies?.find(c=>(c.id||c._id?.toString())===t.companyId?.toString());
                    return <div key={t.id||t._id} className="cal-dot" style={{ background:co?co.color:'#666' }} />;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{ background:'var(--s)', borderRadius:'var(--r)', padding:14 }}>
          <h3 style={{ fontSize:14, fontWeight:500, marginBottom:10 }}>
            {new Date(selectedDay+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </h3>
          {dayTasks.length > 0
            ? sortT(dayTasks).map((t,i) => <TaskCard key={t.id||t._id} task={t} num={i+1} users={users} companies={companies} canRate={canRate} onRate={onRate} onClick={()=>onTaskClick(t)} />)
            : <p style={{ textAlign:'center', padding:16, color:'var(--t3)', fontSize:13 }}>No tasks scheduled.</p>
          }
        </div>
      )}
    </div>
  );
}

// ── Average Rating Bar ────────────────────────────────────────────────────────
function AvgRatingBar({ tasks, users }) {
  const done = tasks.filter(t=>t.status==='done');
  if (done.length === 0) return null;

  // Group by assignedTo
  const byUser = {};
  done.forEach(t => {
    const key = t.assignedTo?.toString() || 'unassigned';
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(t.rating || 0);
  });

  const allRated = done.filter(t=>t.rating>0);
  const overallAvg = allRated.length
    ? (allRated.reduce((s,t)=>s+(t.rating||0),0) / allRated.length).toFixed(1)
    : null;

  return (
    <div style={{ marginTop:24, padding:'16px', background:'var(--s)', borderRadius:'var(--r)', border:'1px solid var(--b)' }}>
      <div style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'var(--t)' }}>📊 Average Ratings</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:12 }}>
        {Object.entries(byUser).map(([uid2, ratings]) => {
          const u = users?.find(x=>(x.id||x._id?.toString())===uid2);
          const rated = ratings.filter(r=>r>0);
          const avg = rated.length ? (rated.reduce((s,r)=>s+r,0)/rated.length).toFixed(1) : null;
          const col = u ? uCol(uid2, users) : '#666';
          return (
            <div key={uid2} style={{ display:'flex', alignItems:'center', gap:8, background:'var(--b)', borderRadius:8, padding:'8px 12px' }}>
              <span style={{ width:28, height:28, borderRadius:'50%', background:col, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>
                {u ? ini(u.name) : '?'}
              </span>
              <div>
                <div style={{ fontSize:12, fontWeight:500 }}>{u?.name || 'Unassigned'}</div>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                  {avg
                    ? <><span className="stars">{[1,2,3,4,5].map(i=><span key={i} className={`star ro ${i<=Math.round(avg)?'filled':''}`}>★</span>)}</span>
                       <span style={{ fontSize:12, color:'#f0a030', fontWeight:600 }}>{avg}/5</span>
                       <span style={{ fontSize:11, color:'var(--t3)' }}>({rated.length} rated)</span></>
                    : <span style={{ fontSize:11, color:'var(--t3)' }}>{ratings.length} task{ratings.length>1?'s':''} · not yet rated</span>
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {overallAvg && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--b)', fontSize:12, color:'var(--t2)' }}>
          Overall average: <strong style={{ color:'#f0a030' }}>{overallAvg}/5</strong> across {allRated.length} rated task{allRated.length>1?'s':''}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const { data: me, error: meErr } = useSWR('/api/auth/me', fetcher, { refreshInterval:5000 });
  const { data: allTasks=[], mutate: mutateTasks } = useSWR('/api/tasks', fetcher, { refreshInterval:5000 });
  const { data: allUsers=[], mutate: mutateUsers } = useSWR('/api/users', fetcher, { refreshInterval:5000 });
  const { data: allCos=[],   mutate: mutateCos   } = useSWR('/api/companies', fetcher, { refreshInterval:5000 });

  const [view, setView] = useState('all');
  const [managerMode, setManagerMode] = useState(true); // true = team, false = personal
  const [fPri, setFPri] = useState('all');
  const [fSt,  setFSt]  = useState('all');
  const [fUser, setFUser] = useState('all');
  const [calDay, setCalDay] = useState(null);
  const [modal, setModal] = useState(null); // {type, data}

  // Redirect if not logged in
  if (meErr) { router.replace('/'); return null; }
  if (!me) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t2)' }}>Loading…</div>;

  const meId = me.id || me._id?.toString();
  const canRate = me.role === 'admin' || me.role === 'manager';

  // ── Visibility ─────────────────────────────────────────────────────────────
  // Admins are a separate level above managers — managers never see admin tasks.
  const adminIds = new Set(allUsers.filter(u=>u.role==='admin').map(u=>u.id||u._id?.toString()));

  function getVisibleIds() {
    if (me.role === 'admin' && managerMode) return allUsers.map(u=>u.id||u._id?.toString());
    if (me.role === 'admin' && !managerMode) return [meId];
    if (me.role === 'manager' && managerMode) {
      const ids = new Set([meId]);
      // direct reports — exclude admins (separate level)
      allUsers
        .filter(u=>u.managerId?.toString()===meId && u.role !== 'admin')
        .forEach(u=>ids.add(u.id||u._id?.toString()));
      // supervised managers + their reports — exclude admins
      const supMgrs = allUsers.filter(u=>u.supervisorId?.toString()===meId&&u.role==='manager');
      supMgrs.forEach(m=>{
        const mid=m.id||m._id?.toString(); ids.add(mid);
        allUsers
          .filter(u=>u.managerId?.toString()===mid && u.role !== 'admin')
          .forEach(u=>ids.add(u.id||u._id?.toString()));
      });
      return [...ids];
    }
    return [meId];
  }

  const visibleIds = getVisibleIds();
  const visibleTasks = allTasks.filter(t => {
    const aid  = t.assignedTo?.toString();
    const artId = t.approvalRequestedTo?.toString();
    // Always show tasks where I am the designated approver
    if (artId && artId === meId) return true;
    // Non-admins can never see tasks assigned to an admin
    if (aid && me.role !== 'admin' && adminIds.has(aid)) return false;
    return !t.assignedTo || visibleIds.includes(aid);
  });
  const visibleCos = me.role === 'admin' ? allCos : allCos.filter(c => {
    const cid = c.id||c._id?.toString();
    return visibleTasks.some(t=>t.companyId?.toString()===cid);
  });

  const iso = isoToday();
  function filterTasks(base) {
    if (fUser !== 'all') base = base.filter(t=>t.assignedTo?.toString()===fUser);
    if (fPri !== 'all') base = base.filter(t=>t.priority===fPri);
    if (fSt !== 'all')  base = base.filter(t=>normSt(t.status)===fSt);
    return base;
  }

  let displayTasks;
  switch(view) {
    case 'today':     displayTasks = visibleTasks.filter(t=>t.status!=='done'&&t.deadline===iso); break;
    case 'overdue':   displayTasks = visibleTasks.filter(t=>t.status!=='done'&&t.deadline&&dLeft(t.deadline)<0); break;
    case 'briefing':  displayTasks = visibleTasks.filter(t=>t.status!=='done'); break;
    case 'completed': displayTasks = visibleTasks.filter(t=>t.status==='done'); break;
    case 'calendar':  displayTasks = visibleTasks; break;
    default:
      displayTasks = view==='all' ? visibleTasks : visibleTasks.filter(t=>t.companyId?.toString()===view);
      displayTasks = filterTasks(displayTasks);
  }

  const tCnt = visibleTasks.filter(t=>t.status!=='done'&&t.deadline===iso).length;
  const oCnt = visibleTasks.filter(t=>t.status!=='done'&&t.deadline&&dLeft(t.deadline)<0).length;
  const dCnt = visibleTasks.filter(t=>t.status==='done').length;

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function logout() {
    await fetch('/api/auth/logout', {method:'POST'});
    router.replace('/');
  }

  async function saveTask(data) {
    const id = modal?.data?.id || modal?.data?._id?.toString();
    if (id) {
      await api(`/api/tasks/${id}`, 'PUT', data);
    } else {
      await api('/api/tasks', 'POST', data);
    }
    mutateTasks(); setModal(null);
  }

  async function deleteTask() {
    const id = modal?.data?.id || modal?.data?._id?.toString();
    if (!confirm('Delete this task?')) return;
    await api(`/api/tasks/${id}`, 'DELETE');
    mutateTasks(); setModal(null);
  }

  async function rateTask(taskId, stars) {
    await api(`/api/tasks/${taskId}`, 'PUT', { rating: stars });
    mutateTasks();
  }

  async function saveCo(data) {
    const id = modal?.data?.id || modal?.data?._id?.toString();
    if (id) await api(`/api/companies/${id}`, 'PUT', data);
    else await api('/api/companies', 'POST', data);
    mutateCos(); setModal(null);
  }

  async function deleteCo() {
    const id = modal?.data?.id || modal?.data?._id?.toString();
    if (!confirm('Delete company?')) return;
    await api(`/api/companies/${id}`, 'DELETE');
    mutateCos(); if (view===id) setView('all'); setModal(null);
  }

  async function saveUser(data) {
    const uid2 = modal?.data?.id || modal?.data?._id?.toString();
    const { subIds, ...rest } = data;
    if (uid2) {
      await api(`/api/users/${uid2}`, 'PUT', rest);
      // update subordinates
      if (data.role === 'manager' && subIds) {
        for (const u of allUsers.filter(x=>(x.id||x._id?.toString())!==uid2)) {
          const xid = u.id||u._id?.toString();
          const shouldBeSub = subIds.includes(xid);
          const isSub = u.managerId?.toString() === uid2;
          if (shouldBeSub !== isSub) {
            await api(`/api/users/${xid}`, 'PUT', { ...u, managerId: shouldBeSub ? uid2 : null });
          }
        }
      }
    } else {
      const created = await api('/api/users', 'POST', rest);
      const newId = created.id || created._id?.toString();
      if (data.role === 'manager' && subIds) {
        for (const xid of subIds) {
          const u = allUsers.find(x=>(x.id||x._id?.toString())===xid);
          if (u) await api(`/api/users/${xid}`, 'PUT', { ...u, managerId: newId });
        }
      }
    }
    mutateUsers(); setModal({type:'users'});
  }

  async function deleteUser(uid2) {
    if (!confirm('Remove user? Their tasks become unassigned.')) return;
    await api(`/api/users/${uid2}`, 'DELETE');
    mutateUsers(); setModal({type:'users'});
  }

  // ── Render groups ────────────────────────────────────────────────────────────
  function renderGroups(tasks) {
    const g = {};
    visibleCos.forEach(c=>{const cid=c.id||c._id?.toString();g[cid]={co:c,tasks:[]};});
    g['_'] = { co:{id:'',name:'No company',color:'#666'}, tasks:[] };
    tasks.forEach(t=>{
      const cid=t.companyId?.toString();
      const k = cid && g[cid] ? cid : '_';
      g[k].tasks.push(t);
    });
    return Object.entries(g).map(([k,{co,tasks:ts}])=>{
      if (!ts.length) return null;
      const cid = co.id||co._id?.toString()||'';
      return (
        <div key={k} className="grp">
          <div className="gh" style={{'--gc':co.color}}>
            <span className="dot" style={{background:co.color}} />
            <span className="gn">{co.name}</span>
            <span style={{fontSize:11,color:'var(--t3)'}}>{ts.length} task{ts.length!==1?'s':''}</span>
            {cid && me.role==='admin' && <span className="ge" onClick={()=>setModal({type:'co',data:co})}>edit</span>}
          </div>
          {sortT(ts).map((t,i)=>(
            <TaskCard key={t.id||t._id} task={t} num={i+1} users={allUsers} companies={allCos}
              canRate={canRate} onRate={rateTask} onClick={()=>setModal({type:'task',data:t})} />
          ))}
        </div>
      );
    });
  }

  const col = uCol(meId, allUsers) || '#666';

  return (
    <div className="wrap">
      {/* Header */}
      <div className="hdr">
        <div style={{display:'flex',alignItems:'center',gap:9}}>
          <span className="ttl">Team Task OS</span>
          {oCnt>0 && <span className="tag t-dov">{oCnt} overdue</span>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          {(me.role==='admin' || me.role==='manager') && (
            <div className="mode-toggle">
              <button className={`mode-btn ${managerMode?'on':''}`} onClick={()=>setManagerMode(true)}>👥 Team</button>
              <button className={`mode-btn ${!managerMode?'on':''}`} onClick={()=>setManagerMode(false)}>👤 My Tasks</button>
            </div>
          )}
          <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'var(--s)',border:'1px solid var(--b2)',borderRadius:20,padding:'4px 10px 4px 5px'}}>
            <span style={{width:22,height:22,borderRadius:'50%',background:col,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff'}}>{ini(me.name)}</span>
            <span style={{fontSize:12}}>{me.name}</span> <RoleBadge role={me.role} />
          </div>
          {me.role==='admin' && <button className="btn btn-sm" onClick={()=>setModal({type:'users'})}>👥 Users</button>}
          <button className="btn btn-p btn-sm" onClick={()=>setModal({type:'task',data:{status:'assigned',assignedTo:me.role==='user'?meId:'',companyId:view!=='all'&&view!=='briefing'&&view!=='overdue'&&view!=='today'&&view!=='completed'&&view!=='calendar'?view:''}})}>+ Task</button>
          <button className="btn btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>

      {/* Tabs row 1 */}
      <div className="tabs">
        {[
          {id:'all',      lb:'All tasks',    st:''},
          {id:'overdue',  lb:'Overdue',      st:'red',   cnt:oCnt},
          {id:'today',    lb:'Today',        st:'blue',  cnt:tCnt},
          {id:'briefing', lb:"Tomorrow",     st:''},
          {id:'completed',lb:'✓ Completed',  st:'green', cnt:dCnt},
          {id:'calendar', lb:'📅 Calendar',  st:''},
        ].map(({id,lb,st,cnt})=>{
          const act=view===id;
          const cls=`tab ${act?(st?`act-${st}`:'act'):''}`;
          return <button key={id} className={cls} onClick={()=>setView(id)}>{lb}
            {cnt>0 && <span className="cnt">{cnt}</span>}
          </button>;
        })}
      </div>

      {/* Tabs row 2 — companies */}
      <div className="tabs-co">
        {visibleCos.map(c=>{
          const cid=c.id||c._id?.toString();
          const cnt=visibleTasks.filter(t=>t.companyId?.toString()===cid&&t.status!=='done').length;
          return (
            <div key={cid} style={{display:'inline-flex',alignItems:'center',gap:0}}>
              <button className={`tab ${view===cid?'act':''}`}
                style={me.role==='admin'?{borderTopRightRadius:0,borderBottomRightRadius:0,borderRight:'none'}:{}}
                onClick={()=>setView(cid)}>
                <span className="dot" style={{background:c.color}} />{c.name}<span className="cnt">{cnt}</span>
              </button>
              {me.role==='admin' && (
                <button
                  title="Edit / delete company"
                  onClick={()=>setModal({type:'co',data:c})}
                  style={{
                    padding:'5px 7px', fontSize:11, lineHeight:1, cursor:'pointer',
                    background:'transparent', border:'1px solid var(--b2)',
                    borderLeft:'none', borderTopRightRadius:20, borderBottomRightRadius:20,
                    color:'var(--t3)', fontFamily:'inherit',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.color='var(--t)';e.currentTarget.style.background='var(--b2)';}}
                  onMouseLeave={e=>{e.currentTarget.style.color='var(--t3)';e.currentTarget.style.background='transparent';}}
                >✎</button>
              )}
            </div>
          );
        })}
        {me.role==='admin' && <button className="tab tab-dashed" onClick={()=>setModal({type:'co',data:{}})}>+ Company</button>}
      </div>

      {/* Filter bar */}
      {!['briefing','overdue','today','completed','calendar'].includes(view) && (
        <div className="fbar">
          <span className="fbar-lbl">Filter</span>
          <select value={fPri} onChange={e=>setFPri(e.target.value)}>
            <option value="all">All priorities</option>
            <option value="ui">Urgent &amp; Important</option>
            <option value="uni">Urgent, Not Important</option>
            <option value="niu">Important, Not Urgent</option>
          </select>
          <select value={fSt} onChange={e=>setFSt(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="scheduled">Scheduled</option>
            <option value="inprogress">In Progress</option>
            <option value="done">Completed</option>
          </select>
          {(me.role==='admin'||(me.role==='manager'&&managerMode)) && (
            <select value={fUser} onChange={e=>setFUser(e.target.value)}>
              <option value="all">All members</option>
              {(me.role==='admin'?allUsers:allUsers.filter(u=>visibleIds.includes(u.id||u._id?.toString())))
                .map(u=><option key={u.id||u._id} value={u.id||u._id?.toString()}>{u.name}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Content */}
      {view === 'calendar' ? (
        <CalendarView tasks={visibleTasks} users={allUsers} companies={allCos}
          canRate={canRate} onRate={rateTask}
          onTaskClick={t=>setModal({type:'task',data:t})}
          onDayClick={d=>setCalDay(d)} selectedDay={calDay} />
      ) : (
        <div>
          {/* Stats (not on special views) */}
          {!['today','overdue','briefing','completed'].includes(view) && (
            <div className="stats">
              <div className="sc"><div className="lbl">Total</div><div className="val">{visibleTasks.length}</div></div>
              <div className="sc"><div className="lbl">Active</div><div className="val">{visibleTasks.filter(t=>t.status!=='done').length}</div></div>
              <div className="sc"><div className="lbl">Completed</div><div className="val">{dCnt}</div></div>
              <div className={`sc ${oCnt>0?'red':''}`}><div className="lbl">Overdue</div><div className="val">{oCnt}</div></div>
            </div>
          )}

          {/* View header */}
          {view === 'today' && (
            <div style={{paddingBottom:10,borderBottom:'1px solid var(--b)',marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:500,color:'#378ADD'}}>☀ Today — {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
              <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{displayTasks.length} task{displayTasks.length!==1?'s':''} due today</div>
            </div>
          )}
          {view === 'overdue' && (
            <div style={{paddingBottom:10,borderBottom:'1px solid var(--b)',marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:500,color:'#e05555'}}>⚠ Overdue Tasks</div>
              <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{displayTasks.length} task{displayTasks.length!==1?'s':''} past deadline</div>
            </div>
          )}
          {view === 'briefing' && (
            <div style={{paddingBottom:10,borderBottom:'1px solid var(--b)',marginBottom:12}}>
              <div style={{fontSize:16,fontWeight:500}}>Ready for {new Date(Date.now()+86400000).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
              <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{displayTasks.length} active task{displayTasks.length!==1?'s':''}</div>
            </div>
          )}
          {view === 'completed' && (
            <div style={{paddingBottom:10,borderBottom:'1px solid var(--b)',marginBottom:12,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:16,fontWeight:500,color:'#1D9E75'}}>✓ Completed Tasks</div>
                <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>{displayTasks.length} task{displayTasks.length!==1?'s':''} completed</div>
              </div>
              {canRate && <span style={{fontSize:12,color:'var(--t2)'}}>Click ★ stars to rate</span>}
            </div>
          )}

          {/* Task groups */}
          {displayTasks.length === 0
            ? <div className="empty">{view==='completed'?'No completed tasks yet.':'No tasks match the current filter.'}</div>
            : renderGroups(displayTasks)}

          {/* Average rating bar (completed view) */}
          {view === 'completed' && displayTasks.length > 0 && (
            <AvgRatingBar tasks={displayTasks} users={allUsers} />
          )}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'task' && (
        <TaskModal task={modal.data||{}} users={allUsers} companies={allCos} me={me}
          onSave={saveTask} onDelete={deleteTask} onClose={()=>setModal(null)} />
      )}
      {modal?.type === 'co' && (
        <CoModal co={modal.data||{}} onSave={saveCo} onDelete={deleteCo} onClose={()=>setModal(null)} />
      )}
      {modal?.type === 'users' && (
        <UsersModal users={allUsers} me={me}
          onEdit={u=>setModal({type:'userForm',data:u})}
          onDelete={deleteUser}
          onAdd={()=>setModal({type:'userForm',data:{}})}
          onClose={()=>setModal(null)} />
      )}
      {modal?.type === 'userForm' && (
        <UserFormModal user={modal.data||{}} users={allUsers} me={me}
          onSave={saveUser} onDelete={deleteUser}
          onBack={()=>setModal({type:'users'})} />
      )}
    </div>
  );
}
interface ShareData {
  session: {
    id: string;
    name?: string;
    status: string;
    startedAt: number;
    endedAt?: number;
    tags?: string[];
    nodeCount: number;
    eventCount: number;
  };
  nodes: Array<{
    id: string;
    type: string;
    domain: string;
    status: string;
    createdAt: number;
  }>;
  events: Array<{
    id: string;
    type: string;
    sourceNodeId: string;
    occurredAt: number;
    severity: string;
    payload?: Record<string, unknown>;
  }>;
  exportedAt: number;
}

export function generateShareHtml(data: ShareData): string {
  const json = JSON.stringify(data);
  const sessionName = data.session.name ?? data.session.id;
  const startTime = new Date(data.session.startedAt).toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Observer OS — ${escHtml(sessionName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#060e1a;color:#e2e8f0;font-family:'Courier New',monospace;font-size:13px;line-height:1.5}
.header{background:#0a1628;border-bottom:1px solid #1e293b;padding:16px 24px;display:flex;align-items:center;gap:16px}
.header h1{font-size:15px;font-weight:bold;color:#f1f5f9}
.badge{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold}
.badge-active{background:#166534;color:#86efac}
.badge-completed{background:#1e3a5f;color:#93c5fd}
.badge-failed{background:#7f1d1d;color:#fca5a5}
.badge-paused{background:#451a03;color:#fdba74}
.meta{color:#64748b;font-size:11px}
.container{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#1e293b;height:calc(100vh - 57px)}
.panel{background:#060e1a;overflow:hidden;display:flex;flex-direction:column}
.panel-header{background:#0a1628;border-bottom:1px solid #1e293b;padding:8px 16px;display:flex;align-items:center;justify-content:space-between}
.panel-title{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em}
.panel-count{color:#475569;font-size:10px}
.panel-body{overflow-y:auto;flex:1}
.node-row{padding:8px 16px;border-bottom:1px solid #0f1f38;display:flex;align-items:center;gap:8px;cursor:pointer;transition:background 0.1s}
.node-row:hover{background:#0a1628}
.node-row.selected{background:#0f2040;border-left:2px solid #3b82f6}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-ok{background:#22c55e}
.dot-failed{background:#ef4444}
.dot-degraded{background:#f59e0b}
.dot-pending{background:#475569}
.node-type{color:#94a3b8;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.node-domain{color:#475569;font-size:10px}
.event-row{padding:6px 16px;border-bottom:1px solid #0a1628;display:flex;align-items:flex-start;gap:8px}
.event-row:hover{background:#0a1628}
.event-time{color:#475569;font-size:10px;flex-shrink:0;min-width:80px}
.event-type{color:#93c5fd;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sev-debug{color:#475569}
.sev-info{color:#94a3b8}
.sev-warn{color:#f59e0b}
.sev-error{color:#ef4444}
.sev-fatal{color:#dc2626;font-weight:bold}
.detail-panel{background:#0a1628;border-top:1px solid #1e293b;padding:16px;overflow-y:auto;max-height:250px;font-size:11px;color:#94a3b8}
.detail-panel pre{white-space:pre-wrap;word-break:break-all;color:#64748b;font-size:10px}
.kv{display:flex;gap:8px;margin-bottom:4px}
.kv-key{color:#475569;flex-shrink:0;min-width:80px}
.kv-val{color:#94a3b8}
.empty{padding:24px;color:#334155;text-align:center;font-size:11px}
.tabs{display:flex;border-bottom:1px solid #1e293b}
.tab{padding:6px 12px;font-size:10px;color:#475569;cursor:pointer;border-bottom:2px solid transparent;font-family:monospace}
.tab.active{color:#e2e8f0;border-bottom-color:#3b82f6}
.watermark{position:fixed;bottom:8px;right:12px;color:#1e293b;font-size:10px}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>${escHtml(sessionName)}</h1>
    <div class="meta">${escHtml(startTime)} &nbsp;·&nbsp; ${data.nodes.length} nodes &nbsp;·&nbsp; ${data.events.length} events</div>
  </div>
  <span class="badge badge-${getStatusClass(data.session.status)}">${escHtml(data.session.status)}</span>
</div>
<div class="container">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Nodes</span>
      <span class="panel-count" id="node-count">${data.nodes.length}</span>
    </div>
    <div class="panel-body" id="node-list"></div>
  </div>
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Events</span>
      <span class="panel-count" id="event-count">${data.events.length}</span>
    </div>
    <div class="tabs">
      <div class="tab active" onclick="filterEvents('all')">all</div>
      <div class="tab" onclick="filterEvents('error')">errors</div>
      <div class="tab" onclick="filterEvents('warn')">warnings</div>
    </div>
    <div class="panel-body" id="event-list"></div>
  </div>
</div>
<div class="detail-panel" id="detail-panel" style="display:none"></div>
<div class="watermark">Observer OS</div>
<script>
const DATA = ${json};
let selectedNodeId = null;
let eventFilter = 'all';

function statusDot(s){
  if(s==='FAILED')return 'dot-failed';
  if(s==='DEGRADED')return 'dot-degraded';
  if(s==='ACTIVE'||s==='COMPLETED')return 'dot-ok';
  return 'dot-pending';
}

function sevClass(s){
  return 'sev-'+(s||'info').toLowerCase();
}

function fmt(ts){
  return new Date(ts).toISOString().replace('T',' ').slice(0,19);
}

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderNodes(){
  const el = document.getElementById('node-list');
  if(DATA.nodes.length===0){el.innerHTML='<div class="empty">no nodes</div>';return;}
  el.innerHTML = DATA.nodes.map(n=>\`
    <div class="node-row\${selectedNodeId===n.id?' selected':''}" onclick="selectNode('\${esc(n.id)}')">
      <div class="dot \${statusDot(n.status)}"></div>
      <div style="flex:1;min-width:0">
        <div class="node-type">\${esc(n.type)}</div>
        <div class="node-domain">\${esc(n.domain)}</div>
      </div>
    </div>
  \`).join('');
}

function renderEvents(){
  const el = document.getElementById('event-list');
  let evts = DATA.events;
  if(eventFilter==='error') evts=evts.filter(e=>e.severity==='ERROR'||e.severity==='FATAL');
  if(eventFilter==='warn') evts=evts.filter(e=>e.severity==='WARN');
  if(selectedNodeId) evts=evts.filter(e=>e.sourceNodeId===selectedNodeId);
  if(evts.length===0){el.innerHTML='<div class="empty">no events</div>';return;}
  el.innerHTML = evts.map(e=>\`
    <div class="event-row" onclick="showEventDetail('\${esc(e.id)}')">
      <div class="event-time">\${fmt(e.occurredAt)}</div>
      <div class="event-type \${sevClass(e.severity)}">\${esc(e.type)}</div>
    </div>
  \`).join('');
}

function selectNode(id){
  selectedNodeId = selectedNodeId===id ? null : id;
  renderNodes();
  renderEvents();
  if(selectedNodeId){
    const n = DATA.nodes.find(x=>x.id===id);
    if(n) showNodeDetail(n);
  } else {
    document.getElementById('detail-panel').style.display='none';
  }
}

function showNodeDetail(n){
  const dp = document.getElementById('detail-panel');
  dp.style.display='block';
  const nodeEvents = DATA.events.filter(e=>e.sourceNodeId===n.id);
  dp.innerHTML=\`
    <div class="kv"><span class="kv-key">id</span><span class="kv-val">\${esc(n.id)}</span></div>
    <div class="kv"><span class="kv-key">type</span><span class="kv-val">\${esc(n.type)}</span></div>
    <div class="kv"><span class="kv-key">domain</span><span class="kv-val">\${esc(n.domain)}</span></div>
    <div class="kv"><span class="kv-key">status</span><span class="kv-val">\${esc(n.status)}</span></div>
    <div class="kv"><span class="kv-key">events</span><span class="kv-val">\${nodeEvents.length}</span></div>
  \`;
}

function showEventDetail(id){
  const e = DATA.events.find(x=>x.id===id);
  if(!e) return;
  const dp = document.getElementById('detail-panel');
  dp.style.display='block';
  dp.innerHTML=\`
    <div class="kv"><span class="kv-key">type</span><span class="kv-val \${sevClass(e.severity)}">\${esc(e.type)}</span></div>
    <div class="kv"><span class="kv-key">time</span><span class="kv-val">\${fmt(e.occurredAt)}</span></div>
    <div class="kv"><span class="kv-key">severity</span><span class="kv-val \${sevClass(e.severity)}">\${esc(e.severity||'INFO')}</span></div>
    <div class="kv"><span class="kv-key">node</span><span class="kv-val">\${esc(e.sourceNodeId)}</span></div>
    \${e.payload?'<div style="margin-top:8px;color:#475569;font-size:10px">payload</div><pre>'+esc(JSON.stringify(e.payload,null,2))+'</pre>':''}
  \`;
}

function filterEvents(f){
  eventFilter=f;
  document.querySelectorAll('.tab').forEach((t,i)=>{
    t.classList.toggle('active',['all','error','warn'][i]===f);
  });
  renderEvents();
}

renderNodes();
renderEvents();
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getStatusClass(status: string): string {
  if (status === 'ACTIVE') return 'active';
  if (status === 'COMPLETED' || status === 'ARCHIVED') return 'completed';
  if (status === 'FAILED') return 'failed';
  return 'paused';
}

export type { ShareData };

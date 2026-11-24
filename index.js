// language: Node.js
// Flat structure. Works on Vercel with /tmp persistence (best-effort) + long-poll.

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const QUEUE_DIR = '/tmp/smsq';
try { fs.mkdirSync(QUEUE_DIR, { recursive: true }); } catch {}

function qpath(key) {
  return path.join(QUEUE_DIR, Buffer.from(key).toString('hex') + '.json');
}

function readQ(key) {
  try { return JSON.parse(fs.readFileSync(qpath(key), 'utf8')); } catch { return []; }
}

function writeQ(key, arr) {
  fs.writeFileSync(qpath(key), JSON.stringify(arr));
}

app.get('/api/poll', (req, res) => {
  const key = (req.query.key || '').trim();
  if (!key) return res.status(400).json({ error: 'key required' });

  const start = Date.now();
  const check = () => {
    const q = readQ(key);
    if (q.length) {
      writeQ(key, []);
      return res.json(q);
    }
    if (Date.now() - start > 20000) return res.json([]);
    setTimeout(check, 800);
  };
  check();
});

app.post('/api/send', (req, res) => {
  const key = (req.body.key || '').trim();
  const sender = (req.body.sender || '').trim();
  const body = (req.body.body || '').trim();
  if (!key || !sender || !body) return res.status(400).json({ error: 'key, sender, body required' });

  const msg = {
    id: crypto.randomUUID(),
    sender: sender.slice(0, 32),
    body: body.slice(0, 1000),
    ts: Date.now()
  };

  const q = readQ(key);
  q.push(msg);
  writeQ(key, q);
  res.json({ ok: true, id: msg.id });
});

app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SMS Injector</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:#0b0b0b;color:#eee;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#161616;padding:28px;border-radius:16px;width:100%;max-width:420px}
h1{margin:0 0 6px;font-size:22px}.sub{color:#888;font-size:13px;margin-bottom:20px}
label{display:block;font-size:12px;color:#aaa;margin:12px 0 4px}
input,textarea{width:100%;padding:12px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:8px;color:#fff;font-size:15px}
textarea{resize:vertical;min-height:90px}
button{width:100%;margin-top:18px;padding:14px;background:#0a7;color:#fff;border:0;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
#out{margin-top:16px;padding:12px;background:#0f0f0f;border-radius:8px;font-size:13px;white-space:pre-wrap;display:none}
.ok{color:#4caf50}.err{color:#f44}
</style></head>
<body><div class="card">
<h1>SMS Injector</h1>
<div class="sub">Jo key phone pe set ki hai wahi yahan daalo</div>
<label>Key</label><input id="k" placeholder="mera-password-123">
<label>Sender</label><input id="s" placeholder="+919876543210">
<label>Message</label><textarea id="b" placeholder="Your OTP is 482913"></textarea>
<button id="btn" onclick="send()">Inject SMS</button>
<div id="out"></div>
</div>
<script>
async function send(){
  const btn=document.getElementById('btn'),out=document.getElementById('out');
  const key=document.getElementById('k').value.trim();
  const sender=document.getElementById('s').value.trim();
  const body=document.getElementById('b').value.trim();
  if(!key||!sender||!body){out.style.display='block';out.className='err';out.textContent='Sab fields bharo';return;}
  btn.disabled=true;btn.textContent='Sending...';out.style.display='none';
  try{
    const r=await fetch('/api/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,sender,body})});
    const j=await r.json();
    out.style.display='block';
    if(j.ok){out.className='ok';out.textContent='Queued\\nID: '+j.id;}
    else{out.className='err';out.textContent=JSON.stringify(j);}
  }catch(e){out.style.display='block';out.className='err';out.textContent=e.message;}
  btn.disabled=false;btn.textContent='Inject SMS';
}
</script></body></html>`);
});

module.exports = app;

// ponytail: inline HTML string, not a static file — keeps it a zero-build,
// zero-extra-dependency single module that works the same on Vercel and locally.
export const statusPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIMPUL // STATUS</title>
<style>
  :root { --ink:#000; --paper:#fff; --up:#7fff6b; --down:#ff4b4b; --pending:#ffe600; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100dvh; background: var(--paper); color: var(--ink);
    font-family: "Courier New", ui-monospace, monospace;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  main { width: 100%; max-width: 560px; }
  h1 {
    font-size: clamp(28px, 6vw, 44px); text-transform: uppercase; margin: 0 0 24px;
    font-weight: 900; letter-spacing: -0.5px; line-height: 1;
    border: 4px solid var(--ink); padding: 16px; background: var(--paper);
    box-shadow: 8px 8px 0 var(--ink);
  }
  .card {
    border: 4px solid var(--ink); padding: 20px; margin-bottom: 16px;
    box-shadow: 8px 8px 0 var(--ink); background: var(--paper);
  }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 2px solid var(--ink); }
  .row:last-child { border-bottom: none; }
  .label { font-weight: 700; text-transform: uppercase; font-size: 14px; }
  .value { font-weight: 700; font-size: 14px; }
  .badge {
    display: inline-block; padding: 4px 12px; border: 3px solid var(--ink);
    text-transform: uppercase; font-weight: 900; font-size: 14px;
  }
  .badge.up { background: var(--up); }
  .badge.down { background: var(--down); }
  .badge.pending { background: var(--pending); }
  button {
    width: 100%; padding: 16px; font-size: 16px; font-weight: 900; text-transform: uppercase;
    font-family: inherit; background: var(--ink); color: var(--paper); border: 4px solid var(--ink);
    cursor: pointer; box-shadow: 8px 8px 0 #888;
  }
  button:active { box-shadow: 2px 2px 0 #888; transform: translate(6px, 6px); }
  .meta { font-size: 12px; margin-top: 12px; text-align: center; }
</style>
</head>
<body>
<main>
  <h1>SIMPUL // API STATUS</h1>
  <div class="card">
    <div class="row"><span class="label">API</span><span class="value"><span id="apiBadge" class="badge pending">CHECKING</span></span></div>
    <div class="row"><span class="label">Database</span><span class="value"><span id="dbBadge" class="badge pending">CHECKING</span></span></div>
    <div class="row"><span class="label">Platform</span><span class="value">Vercel Serverless</span></div>
    <div class="row"><span class="label">Last checked</span><span class="value" id="checked">—</span></div>
  </div>
  <button id="pingBtn" type="button">Ping now</button>
  <p class="meta">Auto-refreshes every 5s · GET /health</p>
</main>
<script>
  function badge(el, state) {
    el.className = "badge " + state;
    el.textContent = state === "up" ? "UP" : state === "down" ? "DOWN" : "CHECKING";
  }
  async function check() {
    const apiBadge = document.getElementById("apiBadge");
    const dbBadge = document.getElementById("dbBadge");
    badge(apiBadge, "pending"); badge(dbBadge, "pending");
    try {
      const res = await fetch("/health");
      const data = await res.json();
      badge(apiBadge, res.ok ? "up" : "down");
      badge(dbBadge, data.db === "up" ? "up" : "down");
    } catch {
      badge(apiBadge, "down"); badge(dbBadge, "down");
    }
    document.getElementById("checked").textContent = new Date().toLocaleTimeString();
  }
  document.getElementById("pingBtn").addEventListener("click", check);
  check();
  setInterval(check, 5000);
</script>
</body>
</html>`;

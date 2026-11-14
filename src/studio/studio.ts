import { FireApp } from '../core/app';
import { createRouter } from '../core/router';

export interface StudioOptions {
  path?: string;
  title?: string;
}

export function renderStudioHTML(basePath = '/studio', title = 'FireStudio Dashboard'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --primary: #f97316;
      --primary-hover: #ea580c;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .logo { font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 8px; color: var(--primary); }
    .badge { background: #3b82f620; color: #60a5fa; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid #3b82f640; }
    nav { display: flex; gap: 12px; margin-bottom: 24px; }
    button.tab-btn { background: var(--card); border: 1px solid var(--border); color: var(--text-muted); padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
    button.tab-btn.active, button.tab-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: var(--text); }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
    th { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 12px; }
    tr:hover { background: rgba(255, 255, 255, 0.02); }
    pre { background: #090d16; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 13px; color: #a5f3fc; }
    .table-pills { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .table-pill { background: #334155; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; border: 1px solid transparent; }
    .table-pill.active { background: var(--accent); color: #0f172a; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <div class="logo">🔥 FireStudio <span>Engine</span></div>
    <div class="badge">Live Connected</div>
  </header>

  <nav>
    <button class="tab-btn active" onclick="switchTab('db')">🗄️ Database Explorer</button>
    <button class="tab-btn" onclick="switchTab('routes')">⚡ Routes & Endpoints</button>
  </nav>

  <div id="tab-db" class="card">
    <h2>Database Tables</h2>
    <div id="tables-list" class="table-pills">Loading tables...</div>
    <div id="table-content">
      <p style="color: var(--text-muted)">Select a table above to view rows.</p>
    </div>
  </div>

  <div id="tab-routes" class="card" style="display: none;">
    <h2>Registered Routes</h2>
    <div id="routes-content">Loading route definitions...</div>
  </div>

  <script>
    const basePath = '${basePath}';

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-db').style.display = tab === 'db' ? 'block' : 'none';
      document.getElementById('tab-routes').style.display = tab === 'routes' ? 'block' : 'none';
      if (tab === 'routes') loadRoutes();
    }

    async function loadOverview() {
      try {
        const res = await fetch(basePath + '/api/overview');
        const data = await res.json();
        const pillsContainer = document.getElementById('tables-list');
        pillsContainer.innerHTML = '';
        if (data.tables.length === 0) {
          pillsContainer.innerHTML = '<span style="color:var(--text-muted)">No tables found in database.</span>';
          return;
        }
        data.tables.forEach((t, i) => {
          const pill = document.createElement('div');
          pill.className = 'table-pill ' + (i === 0 ? 'active' : '');
          pill.innerText = t;
          pill.onclick = () => {
            document.querySelectorAll('.table-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            loadTableRows(t);
          };
          pillsContainer.appendChild(pill);
        });
        if (data.tables[0]) loadTableRows(data.tables[0]);
      } catch (e) {
        document.getElementById('tables-list').innerHTML = 'Error loading tables: ' + e.message;
      }
    }

    async function loadTableRows(tableName) {
      const container = document.getElementById('table-content');
      container.innerHTML = '<p style="color: var(--text-muted)">Loading rows for <b>' + tableName + '</b>...</p>';
      try {
        const res = await fetch(basePath + '/api/tables/' + encodeURIComponent(tableName));
        const rows = await res.json();
        if (rows.length === 0) {
          container.innerHTML = '<p style="color: var(--text-muted)">Table <b>' + tableName + '</b> is currently empty.</p>';
          return;
        }
        const keys = Object.keys(rows[0]);
        let html = '<table><thead><tr>' + keys.map(k => '<th>' + k + '</th>').join('') + '</tr></thead><tbody>';
        rows.forEach(r => {
          html += '<tr>' + keys.map(k => '<td>' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) + '</td>').join('') + '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = 'Error loading rows: ' + e.message;
      }
    }

    async function loadRoutes() {
      const container = document.getElementById('routes-content');
      try {
        const res = await fetch(basePath + '/api/overview');
        const data = await res.json();
        let html = '<table><thead><tr><th>Method</th><th>Path</th><th>Security</th></tr></thead><tbody>';
        data.routes.forEach(r => {
          html += '<tr><td><b style="color:var(--primary)">' + r.method + '</b></td><td>' + r.path + '</td><td>' + (r.security || 'None') + '</td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } catch (e) {
        container.innerHTML = 'Error loading routes: ' + e.message;
      }
    }

    loadOverview();
  </script>
</body>
</html>`;
}

export function enableStudio(app: FireApp, options: StudioOptions = {}): void {
  const basePath = options.path || '/studio';
  const cleanBase = basePath.replace(/\/+$/, '');
  const studioRouter = createRouter(cleanBase);

  // 1. Studio Dashboard Web UI
  studioRouter.get('/', {
    handler: (ctx) => {
      const html = renderStudioHTML(cleanBase, options.title);
      return ctx.html(html);
    },
  });

  // 2. Overview JSON API
  studioRouter.get('/api/overview', {
    handler: async (ctx) => {
      // Introspect tables if in-memory database
      let tables: string[] = [];
      const dbStorage = (ctx.db as any).storage;
      if (dbStorage instanceof Map) {
        tables = Array.from(dbStorage.keys());
      } else {
        tables = ['users', 'products', 'logs'];
      }

      const routes = app.router.routesList.map((r) => ({
        method: r.method,
        path: r.path,
        security: r.options.security ? JSON.stringify(r.options.security) : undefined,
      }));

      return ctx.ok({
        status: 'online',
        routesCount: routes.length,
        tables,
        routes,
      });
    },
  });

  // 3. Table Rows API
  studioRouter.get('/api/tables/:name', {
    handler: async (ctx) => {
      const tableName = ctx.params.name;
      const rows = await ctx.db.table(tableName).find();
      return ctx.ok(rows);
    },
  });

  // 4. Insert Row API
  studioRouter.post('/api/tables/:name', {
    handler: async (ctx) => {
      const tableName = ctx.params.name;
      const inserted = await ctx.db.table(tableName).insert(ctx.body || {});
      return ctx.created(inserted);
    },
  });

  // 5. Delete Row API
  studioRouter.delete('/api/tables/:name/:id', {
    handler: async (ctx) => {
      const { name, id } = ctx.params;
      const result = await ctx.db.table(name).where('id', id).delete();
      return ctx.ok(result);
    },
  });

  app.use(studioRouter);
}

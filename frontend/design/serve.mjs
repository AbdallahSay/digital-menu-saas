import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Default root to showcase index
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Menu SaaS — Local Showcase Hub</title>
  <link rel="stylesheet" href="/tokens.css">
  <style>
    body {
      font-family: var(--font-family-current, system-ui, sans-serif);
      background: #0b1329;
      color: #f8fafc;
      margin: 0;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .container {
      max-width: 800px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 28px;
      margin-bottom: 8px;
      color: #f8fafc;
    }
    .header p {
      color: #94a3b8;
      font-size: 16px;
    }
    .badge {
      display: inline-block;
      background: #0284c7;
      color: #ffffff;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.2s, border-color 0.2s;
      text-decoration: none;
      color: inherit;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: #d97706;
    }
    .card-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .card h2 {
      font-size: 20px;
      margin: 0 0 8px 0;
      color: #ffffff;
    }
    .card p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 16px 0;
      flex: 1;
    }
    .btn {
      display: inline-block;
      background: #d97706;
      color: #ffffff;
      text-align: center;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
    }
    .btn.secondary {
      background: #334155;
      color: #cbd5e1;
    }
    .btn:hover {
      filter: brightness(1.1);
    }
    .status-box {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }
    .dot-live {
      width: 10px;
      height: 10px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 8px #10b981;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Digital Menu SaaS — Local Dev Server</div>
      <h1>بوابة المعاينة والتشغيل المحلي</h1>
      <p>Local Interactive Prototypes & Backend Services Hub</p>
    </div>

    <div class="grid">
      <!-- Admin Prototype -->
      <a class="card" href="/admin-prototype.html">
        <div>
          <div class="card-icon">⚙️</div>
          <h2>لوحة التحكم والإدارة (Admin Experience)</h2>
          <p>النموذج الأولي التفاعلي الكامل لتجربة صاحب المطعم (Dashboard, Categories CRUD, Items Catalog, Branding, QR Studio) ومدير المنصة (Platform Portal).</p>
        </div>
        <span class="btn">تشغيل لوحة التحكم (Admin Prototype) &larr;</span>
      </a>

      <!-- Customer Menu Prototype -->
      <a class="card" href="/preview.html">
        <div>
          <div class="card-icon">📱</div>
          <h2>قائمة الطعام للزبائن (Customer Menu)</h2>
          <p>النموذج الأولي المتجاوب لقائمة الزبائن عبر رمز QR مع دعم كامل للعربية والانجليزية (RTL/LTR)، والبحث، وتفاصيل الأطباق.</p>
        </div>
        <span class="btn secondary">معاينة قائمة الزبائن (Customer Menu) &larr;</span>
      </a>
    </div>

    <div class="status-box">
      <div class="status-indicator">
        <div class="dot-live"></div>
        <span><strong>خادم الـ Backend (.NET 10 API):</strong> يعمل محلياً على المنفذ <code>5260</code></span>
      </div>
      <div>
        <a class="btn secondary" href="http://localhost:5260/api/health/live" target="_blank" style="padding: 6px 12px; font-size: 13px;">فحص الصحة (Live Health)</a>
      </div>
    </div>
  </div>
</body>
</html>`);
    return;
  }

  const filePath = path.join(__dirname, pathname);

  // Security check: ensure path is within __dirname
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${pathname}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Digital Menu Showcase Server running at http://localhost:${PORT}`);
  console.log(`- Admin Experience Prototype: http://localhost:${PORT}/admin-prototype.html`);
  console.log(`- Customer Menu Prototype: http://localhost:${PORT}/preview.html`);
});

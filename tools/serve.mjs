import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function isInsideRoot(filename) {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\0')) throw new URIError('Invalid pathname');
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  try {
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    // Check both the resolved path and symlink target before reading a file.
    if (!isInsideRoot(filename) || !isInsideRoot(await realpath(filename)) || !(await stat(filename)).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const data = await readFile(filename);
    res.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    // Missing and unreadable files fail independently of the server process.
    res.writeHead(404).end('Not found');
  }
});

server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => {
  console.log(`Unicorn Hunt: http://127.0.0.1:${server.address().port}`);
});

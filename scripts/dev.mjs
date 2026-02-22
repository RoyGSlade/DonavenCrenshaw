import chokidar from 'chokidar';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.resolve('public');
const PORT = 3000;

function serveStatic(req, res) {
    // Strip query strings and fragment
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // Auto-resolve index.html for root or directory paths
    if (pathname === '/') pathname = '/index.html';

    // Remove leading slash to prevent absolute path resolution on Windows path.join
    const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    let filePath = path.join(PUBLIC_DIR, relativePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
        case '.jpg': contentType = 'image/jpg'; break;
        case '.svg': contentType = 'image/svg+xml'; break;
        case '.webmanifest': contentType = 'application/manifest+json'; break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

const server = http.createServer(serveStatic);

function runBuild() {
    return new Promise((resolve) => {
        console.log('\n[WAITING] Running build...');
        const build = spawn('node', ['scripts/build.mjs'], { stdio: 'inherit' });
        build.on('close', (code) => {
            if (code === 0) console.log('[SUCCESS] Build finished.');
            else console.log(`[ERROR] Build exited with code ${code}`);
            resolve();
        });
    });
}

async function start() {
    await runBuild();

    server.listen(PORT, () => {
        console.log(`[SERVER] Running at http://localhost:${PORT}/`);
    });

    const watcher = chokidar.watch(['src/**/*', 'content/**/*'], {
        ignored: /(^|[\/\\])\../,
        persistent: true
    });

    let isBuilding = false;
    let buildQueued = false;

    watcher.on('change', async (path) => {
        console.log(`[FILE CHANGED] ${path}`);
        if (isBuilding) {
            buildQueued = true;
            return;
        }

        isBuilding = true;
        await runBuild();
        isBuilding = false;

        if (buildQueued) {
            buildQueued = false;
            isBuilding = true;
            await runBuild();
            isBuilding = false;
        }
    });
}

start();

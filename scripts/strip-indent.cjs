const fs = require('fs');
const path = require('path');

const targetFiles = [
    'content/index.md',
    'content/treasury.md',
    'content/games.md',
    'content/financial.md',
    'content/productivity.md',
    'content/roadmap.md'
];

targetFiles.forEach(file => {
    const fullPath = path.resolve(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
        let lines = fs.readFileSync(fullPath, 'utf8').split('\n');
        // Strip all leading whitespace from every line to prevent marked.js 
        // from treating deeply nested HTML wrappers as <pre><code> blocks
        let out = lines.map(line => line.trimStart());
        fs.writeFileSync(fullPath, out.join('\n'));
        console.log(`[STRIPPED] ${file}`);
    }
});

const fs = require('fs');
const path = require('path');

const targetFiles = [
    'content/treasury.md',
    'content/games.md',
    'content/financial.md',
    'content/productivity.md',
    'content/roadmap.md'
];

targetFiles.forEach(file => {
    const fullPath = path.resolve(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
        let text = fs.readFileSync(fullPath, 'utf8');
        let parts = text.split('<!-- Modal / Dossier -->');
        if (parts.length > 1) {
            fs.writeFileSync(fullPath, parts[0].trimEnd() + '\n');
            console.log(`[STRIPPED MODAL] ${file}`);
        } else {
            let parts2 = text.split('<!-- SHARED MODAL -->');
            if (parts2.length > 1) {
                fs.writeFileSync(fullPath, parts2[0].trimEnd() + '\n');
                console.log(`[STRIPPED MODAL] ${file}`);
            }
        }
    }
});

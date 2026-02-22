import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

function loadJSON(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`[ERROR] Missing file: ${filename}`);
        process.exit(1);
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`[ERROR] Invalid JSON in ${filename}: ${e.message}`);
        process.exit(1);
    }
}

function validateProjects(projects) {
    console.log(`[CHECK] Validating ${projects.length} projects...`);
    const seenIds = new Set();
    let errors = 0;

    projects.forEach((p, i) => {
        if (!p.id) {
            console.error(`  [${i}] Missing 'id'`);
            errors += 1;
        }
        if (seenIds.has(p.id)) {
            console.error(`  [${i}] Duplicate id: ${p.id}`);
            errors += 1;
        }
        seenIds.add(p.id);

        if (!p.realName) {
            console.error(`  [${p.id || i}] Missing 'realName'`);
            errors += 1;
        }
        if (!p.status) {
            console.error(`  [${p.id || i}] Missing 'status'`);
            errors += 1;
        }
        if (typeof p.featured !== 'boolean') {
            console.error(`  [${p.id || i}] 'featured' must be boolean`);
            errors += 1;
        }
    });

    return { errors, ids: seenIds };
}

function validatePosts(posts, projectIds) {
    console.log(`[CHECK] Validating ${posts.length} posts...`);
    let errors = 0;

    posts.forEach((p, i) => {
        if (!p.id) {
            console.error(`  [${i}] Missing 'id'`);
            errors += 1;
        }
        if (!p.title) {
            console.error(`  [${p.id || i}] Missing 'title'`);
            errors += 1;
        }
        if (!p.url) {
            console.error(`  [${p.id || i}] Missing 'url'`);
            errors += 1;
        }

        if (p.projectId && !projectIds.has(p.projectId)) {
            console.warn(`  [${p.id}] Warning: projectId '${p.projectId}' not found in projects.json`);
        }
    });

    return errors;
}

function validateFunding(funding) {
    console.log('[CHECK] Validating funding...');
    let errors = 0;

    if (!funding.buckets || !Array.isArray(funding.buckets)) {
        console.error(`  Missing 'buckets' array`);
        return 1;
    }

    funding.buckets.forEach((b, i) => {
        if (!b.id) {
            console.error(`  Bucket [${i}] missing 'id'`);
            errors += 1;
        }
        if (!b.title) {
            console.error(`  Bucket [${b.id || i}] missing 'title'`);
            errors += 1;
        }
        if (typeof b.goalUSD !== 'number') {
            console.error(`  Bucket [${b.id || i}] 'goalUSD' is failing type check`);
            errors += 1;
        }
    });

    return errors;
}

console.log('--- STARTING VALIDATION ---');
const projects = loadJSON('projects.json');
const posts = loadJSON('posts.json');
const funding = loadJSON('funding.json');

const projResult = validateProjects(projects);
const postErrors = validatePosts(posts, projResult.ids);
const fundErrors = validateFunding(funding);

const totalErrors = projResult.errors + postErrors + fundErrors;

if (totalErrors > 0) {
    console.error(`\n[FAIL] Validation failed with ${totalErrors} errors.`);
    process.exit(1);
}

console.log('\n[OK] All data files valid.');
process.exit(0);

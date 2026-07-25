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

// The roadmap references projects by id in three places and nothing checked
// them, so a stale id (`pdf-editor` for `pdf-manager`) shipped and rendered a
// raw slug on the roadmap card instead of a project name.
//
// getProjectName() in scripts/roadmap.js resolves against roadmap.json's own
// `projects` map and falls back to the raw id, so a roadmap-only project such
// as `voicesource` (which has a content page but no project card) is valid.
// The real failure is an id that resolves in NEITHER source.
function validateRoadmap(roadmap, projectIds) {
    console.log('[CHECK] Validating roadmap...');
    let errors = 0;
    const roadmapProjects = roadmap.projects || {};

    const check = (id, where) => {
        if (!id) {
            console.error(`  ${where}: entry missing 'projectId'`);
            errors += 1;
        } else if (!roadmapProjects[id] && !projectIds.has(id)) {
            console.error(`  ${where}: '${id}' is in neither roadmap.projects nor projects.json; it would render as a raw slug`);
            errors += 1;
        }
    };

    (roadmap.carouselOrder || []).forEach((id, i) => check(id, `carouselOrder[${i}]`));
    (roadmap.nextFocusQueue || []).forEach((item, i) => check(item.projectId, `nextFocusQueue[${i}]`));
    (roadmap.recentlyShippedFeed || []).forEach((item, i) => check(item.projectId, `recentlyShippedFeed[${i}]`));

    // The carousel renders focus/updatePlans straight off roadmap.projects, so
    // a carousel entry without that block breaks the page rather than degrading.
    (roadmap.carouselOrder || []).forEach((id) => {
        if (id && !roadmapProjects[id]) {
            console.error(`  carouselOrder: '${id}' has no entry under 'projects'`);
            errors += 1;
        }
    });

    return errors;
}

console.log('--- STARTING VALIDATION ---');
const projects = loadJSON('projects.json');
const posts = loadJSON('posts.json');
const funding = loadJSON('funding.json');
const roadmap = loadJSON('roadmap.json');

const projResult = validateProjects(projects);
const postErrors = validatePosts(posts, projResult.ids);
const fundErrors = validateFunding(funding);
const roadmapErrors = validateRoadmap(roadmap, projResult.ids);

const totalErrors = projResult.errors + postErrors + fundErrors + roadmapErrors;

if (totalErrors > 0) {
    console.error(`\n[FAIL] Validation failed with ${totalErrors} errors.`);
    process.exit(1);
}

console.log('\n[OK] All data files valid.');
process.exit(0);

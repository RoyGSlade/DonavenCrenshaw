import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const PUBLICATION_STATUSES = new Set(['draft', 'published', 'archived']);
const PRODUCT_STATUSES = new Set([
    'concept',
    'prototype',
    'private-alpha',
    'public-alpha',
    'beta',
    'stable',
    'maintenance',
    'archived'
]);
const BRANCH_STATUSES = new Set(['active', 'retired', 'archived']);
const REDIRECT_STATUSES = new Set(['draft', 'published', 'archived']);
const FAKE_URL_PARTS = ['example.com', 'example.org', 'example.net', 'placeholder', 'coming-soon', 'todo', 'tbd', 'your-domain'];

function loadJSON(filename) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`[ERROR] Missing file: ${filename}`);
        process.exit(1);
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`[ERROR] Invalid JSON in ${filename}: ${error.message}`);
        process.exit(1);
    }
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
}

function validateOwnerDate(record, label) {
    let errors = 0;
    if (!record.owner || typeof record.owner !== 'string') {
        console.error(`  ${label} missing 'owner'`);
        errors += 1;
    }
    if (!isDate(record.reviewedAt)) {
        console.error(`  ${label} has invalid or missing 'reviewedAt'`);
        errors += 1;
    }
    return errors;
}

function validateStatus(value, allowed, label) {
    if (!allowed.has(value)) {
        console.error(`  ${label} has invalid status '${value}'`);
        return 1;
    }
    return 0;
}

function validateUrl(value, label, { allowNull = true } = {}) {
    if (value === null && allowNull) return 0;
    if (typeof value !== 'string' || value.trim() === '') {
        console.error(`  ${label} must be a non-empty URL or null`);
        return 1;
    }
    const lowered = value.toLowerCase();
    if (FAKE_URL_PARTS.some((part) => lowered.includes(part)) || value.includes('#') || /[<>[\]]/.test(value)) {
        console.error(`  ${label} uses an unsupported placeholder URL: ${value}`);
        return 1;
    }
    if (value.startsWith('/')) {
        if (value.startsWith('//') || /[\s\u0000-\u001f]/.test(value)) {
            console.error(`  ${label} is an unsafe local URL: ${value}`);
            return 1;
        }
        return 0;
    }
    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            console.error(`  ${label} uses an unsafe URL scheme: ${value}`);
            return 1;
        }
    } catch {
        console.error(`  ${label} is not a valid URL: ${value}`);
        return 1;
    }
    return 0;
}

function validateLinks(links, label) {
    if (!isObject(links)) {
        console.error(`  ${label} must be an object`);
        return 1;
    }
    let errors = 0;
    for (const [key, value] of Object.entries(links)) {
        errors += validateUrl(value, `${label}.${key}`);
    }
    return errors;
}

function validateSite(site) {
    console.log('[CHECK] Validating site identity...');
    let errors = validateOwnerDate(site, 'site');
    errors += validateStatus(site.publicationStatus, PUBLICATION_STATUSES, 'site.publicationStatus');
    errors += validateUrl(site.domain, 'site.domain', { allowNull: false });
    if (site.voice !== 'I') {
        console.error("  site.voice must be 'I' until a real team exists");
        errors += 1;
    }
    errors += validateUrl(site.social?.github, 'site.social.github', { allowNull: false });
    if (site.contact?.businessEmail !== 'dcworks@donavencrenshaw.com') {
        console.error('  site.contact.businessEmail does not match the authoritative business contact');
        errors += 1;
    }
    return errors;
}

function validateBranches(branches, productIds) {
    console.log(`[CHECK] Validating ${branches.length} branches...`);
    const ids = new Set();
    let errors = 0;
    branches.forEach((branch, index) => {
        const label = `branch '${branch.id || index}'`;
        if (!branch.id || ids.has(branch.id)) {
            console.error(`  ${label} has a missing or duplicate id`);
            errors += 1;
        }
        ids.add(branch.id);
        errors += validateOwnerDate(branch, label);
        errors += validateStatus(branch.status, BRANCH_STATUSES, `${label}.status`);
        errors += validateStatus(branch.publicationStatus, PUBLICATION_STATUSES, `${label}.publicationStatus`);
        errors += validateUrl(branch.route, `${label}.route`, { allowNull: false });
        errors += validateLinks(branch.links, `${label}.links`);
        if (Array.isArray(branch.products)) {
            branch.products.forEach((productId) => {
                if (!productIds.has(productId)) {
                    console.error(`  ${label} references unknown product '${productId}'`);
                    errors += 1;
                }
            });
        }
    });
    return { errors, ids };
}

function validateProducts(products, branchIds, supportIds) {
    console.log(`[CHECK] Validating ${products.length} products...`);
    const ids = new Set();
    let errors = 0;
    products.forEach((product, index) => {
        const label = `product '${product.id || index}'`;
        if (!product.id || ids.has(product.id)) {
            console.error(`  ${label} has a missing or duplicate id`);
            errors += 1;
        }
        ids.add(product.id);
        errors += validateOwnerDate(product, label);
        errors += validateStatus(product.status, PRODUCT_STATUSES, `${label}.status`);
        const expectedStatusLabel = product.status
            .split('-')
            .map((word, wordIndex) => wordIndex === 0 ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word)
            .join(' ');
        if (product.statusLabel !== expectedStatusLabel) {
            console.error(`  ${label}.statusLabel must match the shared vocabulary label '${expectedStatusLabel}'`);
            errors += 1;
        }
        errors += validateStatus(product.publicationStatus, PUBLICATION_STATUSES, `${label}.publicationStatus`);
        if (!branchIds.has(product.branchId)) {
            console.error(`  ${label} references unknown branch '${product.branchId}'`);
            errors += 1;
        }
        if (!isDate(product.statusAsOf)) {
            console.error(`  ${label} has invalid or missing 'statusAsOf'`);
            errors += 1;
        }
        if (!isObject(product.nextProof) || !product.nextProof.owner || !Object.hasOwn(product.nextProof, 'dueAt')) {
            console.error(`  ${label} must include nextProof ownership and dueAt (null is allowed)`);
            errors += 1;
        }
        errors += validateLinks(product.links, `${label}.links`);
        if (!Array.isArray(product.limitations) || product.limitations.length === 0) {
            console.error(`  ${label} must state at least one limitation`);
            errors += 1;
        }
        if (!Array.isArray(product.hashes)) {
            console.error(`  ${label}.hashes must be an array; use [] when no hash is verified`);
            errors += 1;
        }
        (product.supportChannelIds || []).forEach((supportId) => {
            if (!supportIds.has(supportId)) {
                console.error(`  ${label} references unknown support channel '${supportId}'`);
                errors += 1;
            }
        });
    });
    return { errors, ids };
}

function validateUpdates(updates) {
    console.log('[CHECK] Validating updates...');
    let errors = validateOwnerDate(updates, 'updates');
    for (const [collectionName, collection] of [['items', updates.items], ['drafts', updates.drafts]]) {
        if (!Array.isArray(collection)) {
            console.error(`  updates.${collectionName} must be an array`);
            errors += 1;
            continue;
        }
        collection.forEach((item, index) => {
            const label = `update '${item.id || index}'`;
            errors += validateOwnerDate(item, label);
            errors += validateStatus(item.publicationStatus, PUBLICATION_STATUSES, `${label}.publicationStatus`);
            if (!isDate(item.date)) {
                console.error(`  ${label} has invalid or missing 'date'`);
                errors += 1;
            }
        });
    }
    if (updates.lastPublishedId !== null && !updates.items.some((item) => item.id === updates.lastPublishedId)) {
        console.error(`  updates.lastPublishedId '${updates.lastPublishedId}' is not a published item`);
        errors += 1;
    }
    return errors;
}

function validateSupport(support) {
    console.log('[CHECK] Validating support channels, tiers, and goals...');
    let errors = validateOwnerDate(support, 'support');
    errors += validateStatus(support.publicationStatus, PUBLICATION_STATUSES, 'support.publicationStatus');
    const channelIds = new Set();
    for (const [collectionName, collection] of [['channels', support.channels], ['tiers', support.tiers], ['goals', support.goals]]) {
        if (!Array.isArray(collection)) {
            console.error(`  support.${collectionName} must be an array`);
            errors += 1;
            continue;
        }
        collection.forEach((item, index) => {
            const label = `support ${collectionName} '${item.id || index}'`;
            if (!item.id || (collectionName === 'channels' && channelIds.has(item.id))) {
                console.error(`  ${label} has a missing or duplicate id`);
                errors += 1;
            }
            if (collectionName === 'channels') channelIds.add(item.id);
            errors += validateOwnerDate(item, label);
            errors += validateStatus(item.publicationStatus, PUBLICATION_STATUSES, `${label}.publicationStatus`);
            if (collectionName === 'channels') errors += validateUrl(item.url, `${label}.url`);
            if (collectionName === 'tiers' && (typeof item.amountUSD !== 'number' || item.amountUSD <= 0)) {
                console.error(`  ${label}.amountUSD must be a positive number`);
                errors += 1;
            }
        });
    }
    return { errors, channelIds };
}

function validateRedirects(redirects) {
    console.log(`[CHECK] Validating ${redirects.length} redirects...`);
    const sources = new Set();
    let errors = 0;
    redirects.forEach((redirect, index) => {
        const label = `redirect '${redirect.source || index}'`;
        if (!redirect.source || sources.has(redirect.source)) {
            console.error(`  ${label} has a missing or duplicate source`);
            errors += 1;
        }
        sources.add(redirect.source);
        errors += validateOwnerDate(redirect, label);
        errors += validateStatus(redirect.status, REDIRECT_STATUSES, `${label}.status`);
        errors += validateUrl(redirect.source, `${label}.source`, { allowNull: false });
        errors += validateUrl(redirect.target, `${label}.target`, { allowNull: false });
        if (redirect.source === redirect.target) {
            console.error(`  ${label} cannot redirect to itself`);
            errors += 1;
        }
    });
    return errors;
}

console.log('--- STARTING VALIDATION ---');
const site = loadJSON('site.json');
const branches = loadJSON('branches.json');
const products = loadJSON('products.json');
const updates = loadJSON('updates.json');
const support = loadJSON('support.json');
const redirects = loadJSON('redirects.json');

const siteErrors = validateSite(site);
const supportResult = validateSupport(support);
const productResult = validateProducts(products, new Set(branches.map((branch) => branch.id)), supportResult.channelIds);
const branchResult = validateBranches(branches, productResult.ids);
const updateErrors = validateUpdates(updates);
const redirectErrors = validateRedirects(redirects);

const totalErrors = siteErrors + supportResult.errors + productResult.errors + branchResult.errors + updateErrors + redirectErrors;
if (totalErrors > 0) {
    console.error(`\n[FAIL] Validation failed with ${totalErrors} errors.`);
    process.exit(1);
}

console.log(`\n[OK] All data files valid. ${products.length} products, ${branches.length} branches, ${redirects.length} redirects.`);

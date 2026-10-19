import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pkg } from './helpers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function jsFilesUnder(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return jsFilesUnder(path);
		return path.endsWith('.js') ? [path] : [];
	});
}

test('the package is an n8n community node package', () => {
	assert.match(pkg.name, /^n8n-nodes-[a-z0-9-]+$/);
	assert.ok(pkg.keywords.includes('n8n-community-node-package'));
	assert.equal(pkg.license, 'MIT');
	assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
	assert.deepEqual(pkg.files, ['dist']);
	assert.equal(pkg.n8n.n8nNodesApiVersion, 1);
	assert.ok(pkg.description.length > 0);
	assert.ok(pkg.author.name && pkg.author.email);
});

test('the license file is MIT', () => {
	const text = readFileSync(join(root, 'LICENSE.md'), 'utf8');
	assert.match(text, /^MIT License/);
	assert.match(text, /Permission is hereby granted, free of charge/);
});

test('every credential and node the n8n block lists is built and loads', () => {
	assert.equal(pkg.n8n.credentials.length, 1);
	assert.equal(pkg.n8n.nodes.length, 1);
	for (const file of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
		assert.equal(existsSync(join(root, file)), true, `${file} is built`);
		const exported = Object.values(require(join(root, file)));
		assert.equal(exported.length, 1, `${file} exports one class`);
		assert.equal(typeof exported[0], 'function');
	}
	assert.equal(
		new (Object.values(require(join(root, pkg.n8n.nodes[0])))[0])().description.name,
		'superbot',
	);
	assert.equal(
		new (Object.values(require(join(root, pkg.n8n.credentials[0])))[0])().name,
		'superbotApi',
	);
});

test('the node ships its codex file and both icons', () => {
	for (const file of ['Superbot.node.json', 'superbot.svg', 'superbot.dark.svg']) {
		assert.equal(existsSync(join(root, 'dist/nodes/Superbot', file)), true, file);
	}
	const codex = JSON.parse(
		readFileSync(join(root, 'dist/nodes/Superbot/Superbot.node.json'), 'utf8'),
	);
	assert.equal(codex.node, pkg.name);
});

test('zero runtime dependencies: no dependencies field, one peer, and n8n-workflow is the only package the build imports', () => {
	assert.equal(pkg.dependencies, undefined);
	assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
	assert.equal(pkg.optionalDependencies, undefined);
	assert.equal(pkg.overrides, undefined);
	const imported = new Set();
	for (const file of jsFilesUnder(join(root, 'dist'))) {
		for (const match of readFileSync(file, 'utf8').matchAll(/require\("([^"]+)"\)/g)) {
			if (!match[1].startsWith('.')) imported.add(match[1]);
		}
	}
	assert.deepEqual([...imported], ['n8n-workflow']);
});

test('the build tools are pinned to exact versions', () => {
	for (const [name, version] of Object.entries(pkg.devDependencies)) {
		assert.match(version, /^\d+\.\d+\.\d+$/, name);
	}
	for (const name of [
		'@n8n/node-cli',
		'eslint',
		'n8n-workflow',
		'prettier',
		'release-it',
		'typescript',
	]) {
		assert.ok(pkg.devDependencies[name], name);
	}
});

test('the package runs no lifecycle script on install', () => {
	for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
		assert.equal(pkg.scripts[name], undefined, name);
	}
});

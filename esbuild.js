const esbuild = require("esbuild");
const { copyFile } = require('node:fs/promises');
const { join } = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const pdfWorkerSource = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd(async (result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			if (result.errors.length === 0) {
				await copyFile(pdfWorkerSource, join('dist', 'pdf.worker.mjs'));
			}
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts',
			'src/mcp-server.ts',
			'src/pdf-extractor-worker.ts',
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outdir: 'dist',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});

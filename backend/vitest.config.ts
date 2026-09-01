import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		// Allow Vitest to resolve extensionless TS imports (Bundler-mode style)
		extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'],
	},
	test: {
		environment: 'node',
		globals: true,
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		setupFiles: ['./tests/helpers/setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'tests/**'],
		},
	},
});

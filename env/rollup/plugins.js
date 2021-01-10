/* eslint-disable object-curly-newline,prefer-template,no-process-env */
const path = require('path')
const {terser} = require('rollup-plugin-terser')
const istanbul = require('rollup-plugin-istanbul')
const globals = require('rollup-plugin-node-globals')
const builtins = require('rollup-plugin-node-builtins')
const polyfills = require('rollup-plugin-node-polyfills')
const resolve  = require('@rollup/plugin-node-resolve').default
const commonjs = require('@rollup/plugin-commonjs')
const nycrc  = require('../../nyc.config')
const replace = require('rollup-plugin-replace')
const alias = require('@rollup/plugin-alias')
const {fileExtensions} = require('../common/constants')
const metric = require('./metric')
const babel = require('./babel')
const svelte = require('./svelte')
const postcss = require('./postcss')
const dedupe = importee => /^(svelte|@babel|core-js[^\\/]*|regenerator-runtime)([\\/]|$)/.test(importee)
const json = require('@rollup/plugin-json')

if (!process.env.APP_CONFIG) {
	console.error('Environment variable APP_CONFIG is not defined', __filename)
	throw new Error('Environment variable APP_CONFIG is not defined')
}

const appConfig = require(`../../configs/${process.env.APP_CONFIG}`)
const mode = process.env.NODE_ENV

const plugins = {
	svelte  : svelte.rollup,
	postCss : postcss.rollup,
	babel   : babel.rollup,
	istanbul: (options = {}) => istanbul({
		...nycrc,
		...options,
	}),
	json: (options = {}) => json({
		...options,
	}),
	alias: (options = {}) => alias({
		entries: [
			{ find: 'path', replacement: 'path-browserify' },
		],
		...options,
	}),
	globals  : (options = {}) => globals(options),
	builtins : (options = {}) => builtins(options),
	polyfills: (options = {}) => polyfills(options),
	// resolve: (options = {}) => resolve({
	// 	extensions: [...fileExtensions.js],
	// 	// preferBuiltins      : true,
	// 	// customResolveOptions: {
	// 	// 	moduleDirectory: 'node_modules',
	// 	// 	basedir        : process.cwd(),
	// 	// },
	// 	...options
	// }),
	replace  : (options = {}) => replace({
		APP_CONFIG_PATH       : require.resolve('../../configs/' + process.env.APP_CONFIG).replace(/\\/g, '/'),
		SAPPER_MODULE         : `@sapper/${appConfig.sapper.devServer ? 'debug' : appConfig.type}`,
		'process.env.NODE_ENV': JSON.stringify(mode),
		...options,
	}),
	resolve: (options = {}) => resolve({
		extensions    : [...fileExtensions.js, ...fileExtensions.ts],
		dedupe,
		preferBuiltins: false,
		// customResolveOptions: {
		// 	// moduleDirectory: 'node_modules',
		// 	// preserveSymlinks: false,
		// 	paths          : [path.resolve(process.cwd(), 'node_modules')],
		// 	pathFilter(pkg, path, relativePath) {
		//
		// 		return relativePath
		// 	}
		// },
		...options,
	}),
	resolveTs: (options = {}) => resolve({
		extensions: [...fileExtensions.ts],
		dedupe,
		...options,
	}),
	// svelte: (options = {}) => resolve({
	// 	dedupe,
	// 	browser: true,
	// 	...options,
	// }),
	commonjs: (options = {}) => commonjs({
		extensions: [...fileExtensions.js, ...fileExtensions.ts],
		// namedExports: {
		// 	'node_modules/chai/index.js': ['assert', 'expect']
		// }
		// include   : 'node_modules/**',
		...options,
	}),
	terser: (options = {}) => terser({
		mangle: false,
		module: false,
		ecma  : 5,
		output: {
			max_line_len: 50,
		},
		...options,
	}),
	metricStart: metric.metricStart,
	metricEnd  : metric.metricEnd,
}

plugins.resolveExternal = (options = {}) => plugins.resolve({
	resolveOnly: [
		// 'util',
		// 'webrain',
		// /@flemist\/web-logger(\/(browser|node)\/.*)?$/
	],
	// preferBuiltins: false,
	...options,
})

// noinspection PointlessBooleanExpressionJS
module.exports = {
	plugins,
	karma({dev = false, legacy = true, coverage = false}) {
		return [
			plugins.babel.minimal(),
			plugins.replace(),
			plugins.json(),
			plugins.svelte.client(),
			coverage && plugins.istanbul(),
			plugins.alias(),
			plugins.resolveExternal(),
			plugins.resolve({
				browser: true,
			}),
			plugins.commonjs(),
			legacy && plugins.babel.browserModule(),
			!dev && plugins.terser(),
		]
	},
	watch({dev = false, legacy = true, coverage = false, getFileCodePlugins = []}) {
		return [
			plugins.babel.minimal(),
			plugins.replace(),
			plugins.json(),
			plugins.svelte.client(),
			coverage && plugins.istanbul(),
			plugins.alias(),
			plugins.resolveExternal(),
			plugins.resolve({
				browser: true,
			}),
			plugins.commonjs(),
			legacy && plugins.babel.browserModule(),
			...getFileCodePlugins,
			!dev && plugins.terser(),
		]
	},
	libs({dev = false, legacy = true}) {
		return [
			plugins.babel.minimal({
				compact: true,
			}),
			// plugins.replace(),
			plugins.json(),
			plugins.postCss.common(),
			plugins.alias(),
			plugins.resolve({
				browser: true,
			}),
			plugins.commonjs(),
			legacy && plugins.babel.webapp({
				compact: true,
			}),
			!dev && plugins.terser(),
		]
	},
	components({dev = false, legacy = true}) {
		return [
			plugins.babel.minimal(),
			plugins.replace(),
			plugins.json(),
			plugins.svelte.client({
				emitCss: false,
			}),
			plugins.alias(),
			plugins.builtins(),
			plugins.resolveExternal(),
			plugins.resolve({
				browser: true,
			}),
			plugins.commonjs(),
			legacy && plugins.babel.browserModule(),
		]
	},
	client({dev = false, legacy = true}) {
		return [
			plugins.metricStart('client'),
			plugins.babel.minimal(),
			plugins.replace({
				'process.browser': true,
			}),
			plugins.json(),
			plugins.postCss.sapper({
				extract: 'styles.css',
			}),
			plugins.svelte.client(),
			plugins.alias(),
			plugins.builtins(),
			plugins.resolveExternal(),
			plugins.resolve({
				browser: true,
			}),
			plugins.commonjs(),
			legacy && plugins.babel.webapp(),
			!dev && plugins.terser({
				module: true,
			}),
			plugins.metricEnd(),
		]
	},
	server({dev = false, legacy = true}) {
		return [
			plugins.metricStart('server'),
			plugins.babel.minimal(),
			plugins.replace({
				'process.browser': false,
			}),
			plugins.json(),
			plugins.svelte.server(),
			plugins.alias(),
			plugins.builtins(),
			plugins.resolveExternal(),
			plugins.resolve(),
			plugins.commonjs(),
			legacy && plugins.babel.node(),
			plugins.metricEnd(),
		]
	},
	serviceworker({dev = false, legacy = true}) {
		return [
			plugins.metricStart('serviceworker'),
			plugins.babel.minimal(),
			plugins.alias(),
			plugins.builtins(),
			plugins.resolveExternal(),
			plugins.resolve(),
			plugins.replace({
				'process.browser': true,
			}),
			plugins.json(),
			plugins.commonjs(),
			legacy && plugins.babel.browserModule(),
			!dev && plugins.terser(),
			plugins.metricEnd(),
		]
	},
	electron({dev = false, legacy = true}) {
		return [
			plugins.babel.minimal(),
			plugins.replace({
				'process.browser': true,
			}),
			plugins.json(),
			// replace this custom plugin with resolve() below after this issue fixed: https://github.com/rollup/plugins/issues/581
			{
				name: 'custom',
				resolveId(source, importer) {
					// console.log('resolveId', source, importer)
					if (/^(@flemist|@babel|core-js[^\\/]*|regenerator-runtime)([\\/]|$)/.test(source)) {
						const resolved = require.resolve(source, {
							paths: importer && [path.dirname(importer)],
						})
						// console.log('resolved', resolved)
						return resolved
					}

					return null
				},
			},
			// resolve({
			// 	resolveOnly: [
			// 		/^(@babel|core-js[^\\/]*|regenerator-runtime)([\\/]|$)/
			// 	],
			// }),
			plugins.commonjs(),
			legacy && plugins.babel.electron(),
		]
	},
}

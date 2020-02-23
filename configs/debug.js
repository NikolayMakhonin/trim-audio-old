/* tslint:disable:no-var-requires */
const base = require('./base')

module.exports = {
	// base
	appId      : `${base.appId}.debug`,
	packageName: `${base.packageName}-debug`,
	appName    : `${base.appName} Debug`,
	appVersion : `${base.appVersion}`,
	logUrl     : base.logUrl,
	installer  : base.installer,

	type  : 'debug',
	dev   : {
		devTools: {
			openAtStart: true,
		},
	},
	tests: {
		intern: {
			serverIp  : base.tests.intern.serverIp,
			staticPort: 3010,
			serverPort: 3020,
			socketPort: 3030,
		},
	},
	sapper: {
		buildMode: 'development',
		port     : base.sapper.devServer ? 3000 : 3000,
		devServer: base.sapper.devServer,
	},
}
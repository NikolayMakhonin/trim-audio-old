const {run, singleCall} = require('../helpers/helpers')

const clean = singleCall(() => run('shx rm -rf {*.log,__sapper__}'))
const npmCheck = singleCall(() => run('depcheck --ignores="*,@babel/*,@types/*,@metahub/karma-rollup-preprocessor,karma-*,@sapper/*,rdtsc,tslint-eslint-rules,electron,APP_CONFIG_PATH,SAPPER_MODULE,caniuse-lite,browserslist" --ignore-dirs=__sapper__,_trash,dist,docs,static,tmp'))
const lint = singleCall(() => Promise.all([
	npmCheck(),
	// run('eslint --plugin markdown --ext js,md . '),
]))

module.exports = {
	npmCheck,
	lint,
	clean,
}

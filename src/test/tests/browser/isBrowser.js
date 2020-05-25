/* eslint-disable no-new-func */
import {assert} from 'webrain/src/main/common/test/Assert'
import {describe, it} from 'webrain/src/main/common/test/Mocha'

describe('browser', function () {
	it('isBrowser', function () {
		// see: https://stackoverflow.com/a/31090240/5221762
		const isBrowser = new Function('try {return this===window;}catch(e){ return false;}')
		// console.log(`${new Date()} isBrowser = ${isBrowser()};`)
		assert.strictEqual(isBrowser(), true)
	})
})

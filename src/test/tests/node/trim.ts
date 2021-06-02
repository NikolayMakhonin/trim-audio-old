/* eslint-disable no-shadow */
import path from 'path'
import {trimAudioFile, trimAudioFiles} from '../../../main/node/trim'

describe('node > trim', function () {
	this.timeout(60000000)

	it('base', async function () {
		await trimAudioFile({
			inputFilePath : path.join(__dirname, 'assets/test.ogg'),
			outputFilePath: './tmp/test/base.mp3',
		})
	})
})

import globby from 'globby'
import fse from 'fs-extra'
import path from 'path'
import prism from 'prism-media'
import lamejs from 'lamejs'

// // from https://gist.github.com/smashah/fb7bd9a57dd2181d4142886888f99b92
//
// // "audio-buffer-utils": "^5.1.2",
// // "audio-decode": "^1.4.0",
// // "audiobuffer-to-wav": "^1.0.0",
// // "node-lame": "^1.2.0",
// // "ogg.js": "^0.1.0",
// // "opus.js": "^0.1.1",
//
// const fs = require('fs')
// const Lame = require('node-lame').Lame
// export const toWav = require('audiobuffer-to-wav')
// const testFileName = './test.ogg'
// import { create, trim, concat } from 'audio-buffer-utils'
// import { min, max, mean, chunk, flattenDeep} from 'lodash'
// const decode = require('audio-decode')
// require('opus.js')
// require('ogg.js')
//
// export const toBuffer = (ab: any) => {
//     const buf = Buffer.alloc(ab.byteLength)
//     const view = new Uint8Array(ab)
//     for (let i = 0; i < buf.length; ++i) {
//         buf[i] = view[i]
//     }
//     return buf
// }
//
// function load(file: string) {
//     return new Promise(function (done, reject) {
//         fs.readFile(file, function (err: any, file: any) {
//             err ? reject(err) : done(file)
//         })
//     })
// }
//
// // This function returns an AudioBuffer that has all 'silences' below the threshold removed
// // please note this is only working on the first channel
// const removeSilenceFromAudioData = async (soundfile: any, threshold: any) => {
//     const inputAudioBuffer = await decode(soundfile)
//     const no_silences =
//     await silenceRemovalAlgorithm(inputAudioBuffer
//         .getChannelData(0))
//     const output = create(no_silences, {
//         channels  : inputAudioBuffer.numberOfChannels,
//         length    : inputAudioBuffer.length,
//         sampleRate: inputAudioBuffer.sampleRate,
//     })
//     return output
// }
//
// export const silenceRemovalAlgorithm = async (channelData:any) => {
//     // split this into seperate chunks of a certain amount of samples
//     const step = 160
//     const threshold = 0.4
//     const output:any = []
//     let _silenceCounter = 0
//     // now chunk channelData into
//     chunk(channelData, step).map((frame:any) => {
//         // square every value in the frame
//         const squaredFrame = frame.map((x:number) => x ** 2)
//         const _min : number = min(squaredFrame) || 0
//         const _max : number = max(squaredFrame) || 0
//         const _ptp = _max - _min
// const _avg = mean(squaredFrame)
//         const thd = (_min + _ptp) * threshold
// if (_avg <= thd) {
//                 _silenceCounter++
//             } else {
//                 _silenceCounter = 0
//             }
//         // if there are 20 or more consecutive 'silent' frames then ignore these frames, do not return
//             if (_silenceCounter >= 20) {
//                 // dont append to the output
//             }
//             else {
//                 // append to the output
//                 output.push([...frame])
//             }
//     })
//     console.log('TCL: result -> result', flattenDeep(output).length)
//     return flattenDeep(output)
// }
//
// // This function returns an AudioBuffer that has all 'silences' below the threshold removed
// // please note this is only working on the first channel
// export const removeSilenceFromAudio = async (filename: any, threshold: any) => {
//     const soundfile = await load(filename)
//     return removeSilenceFromAudioData(soundfile, threshold)
// }
//
// export const removePausesAndAddPadding = async (audioData: any, silenceLevel: number) => {
//     const clean_audio = await removeSilenceFromAudio(audioData, silenceLevel)
//     const rate = clean_audio.sampleRate
//     const padding = create(2 * rate, 1, rate)
//     const all = concat(padding, clean_audio, padding)
//     return all
// }

const SILENCE_LEVEL_DEFAULT = 0.1

export function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const bufs = []
        stream
            .on('error', err => {
              reject(err)
            })
            .on('end', () => {
              const buf = Buffer.concat(bufs)
              resolve(buf)
            })
            .on('data', o => bufs.push(o))
    })
}

export async function readOggFile(filePath): Promise<Int16Array> {
    const stream = fse.createReadStream(filePath)
        .pipe(new prism.opus.OggDemuxer())
        .pipe(new prism.opus.Decoder({ rate: 16000, channels: 1, frameSize: 960 }))

    const buffer = await streamToBuffer(stream)

    return new Int16Array(buffer.buffer)
}

export function saveToMp3File(filePath, samples: Int16Array) {
    const mp3Encoder = new lamejs.Mp3Encoder(1, 16000, 128)
    const mp3Buffer1 = Buffer.from(mp3Encoder.encodeBuffer(samples))
    const mp3Buffer2 = Buffer.from(mp3Encoder.flush())
    const mp3Buffer = Buffer.concat([mp3Buffer1, mp3Buffer2])

    return fse.writeFile(filePath, mp3Buffer)
}

export function normalize(samples: Int16Array, coef: number) {
    let max = 0
    let min = 1 << 15
    for (let i = 0, len = samples.length; i < len; i++) {
        const value = samples[i]
        if (value > max) {
            max = value
        }
        if (value < min) {
            min = value
        }
    }

    const offset = -(max + min) / 2
    const mult = coef * (1 << 15) / (max + offset)
    for (let i = 0, len = samples.length; i < len; i++) {
        samples[i] = (samples[i] + offset) * mult
    }
}

export function trimSamples({
    samples,
    silenceLevel,
    minSilenceSamples,
}: {
    samples: Int16Array,
    silenceLevel: number,
    minSilenceSamples: number,
}) {
    const silenceLevelInt16 = silenceLevel * (1 << 15)
    const minDispersion = silenceLevelInt16 * silenceLevelInt16
    let len = samples.length

    function searchContent(backward: boolean) {
        let sum = 0
        let sumSqr = 0

        for (let i = 0; i < len; i++) {
            const value = samples[
                backward
                    ? len - i - 1
                    : i
            ]

            sum += value
            sumSqr += value * value
            if (i >= minSilenceSamples) {
                const prevValue = samples[i - minSilenceSamples]
                sum -= prevValue
                sumSqr -= prevValue * prevValue

                const avg = sum / minSilenceSamples
                const sqrAvg = sumSqr / minSilenceSamples
                const dispersion = sqrAvg - avg * avg

                if (dispersion > minDispersion) {
                    return backward
                        ? len - (i - minSilenceSamples) - 1
                        : i - minSilenceSamples
                }
            }
        }

        return null
    }

    const from = searchContent(false)
    if (from == null) {
        throw new Error('Audio is empty')
    }

    const to = searchContent(true)

    samples = samples.slice(from || 0, to || len)
    len = samples.length

    // Amplify
    if (from != null) {
        for (let i = 0; i < minSilenceSamples; i++) {
            samples[i] *= (i / minSilenceSamples)
        }
    }
    if (to != null) {
        for (let i = 0; i < minSilenceSamples; i++) {
            samples[len - i - 1] *= (i / minSilenceSamples)
        }
    }

    return samples
}

export async function trimAudioFile({
    inputFilePath,
    outputFilePath,
    silenceLevel = SILENCE_LEVEL_DEFAULT,
}: {
    inputFilePath: string,
    outputFilePath: string,
    silenceLevel?: number,
}) {
    inputFilePath = path.resolve(inputFilePath)
    outputFilePath = path.resolve(outputFilePath)

    let samples = await readOggFile(inputFilePath)

    const dir = path.dirname(outputFilePath)
    if (!fse.existsSync(dir)) {
        await fse.mkdirp(dir)
    }
    if (fse.existsSync(outputFilePath)) {
        await fse.unlink(outputFilePath)
    }

    normalize(samples, 0.95)
    samples = await trimSamples({
        samples,
        silenceLevel,
        minSilenceSamples: Math.round(40 / 1000 * 16000), // 40 ms
    })

    await saveToMp3File(outputFilePath, samples)

    // await new Lame({
    //     output : outputFilePath,
    //     bitrate: 128,
    // })
    //     .setBuffer(buffer)
    //     .encode()

    // .pipe(new prism.FFmpeg({
    //   args: [
    //     '-analyzeduration', '0',
    //     '-loglevel', 'debug',
    //     '-f', 's16le',
    //     '-acodec', 'pcm_s16le',
    //     '-ar', '16000',
    //     '-ac', '1',
    //   ],
    // }))
    // .pipe(fse.createWriteStream(outputFilePath))

    // const writeStream = fse.createWriteStream(outputFilePath)
    // stream
    //     .pipe(writeStream)
        // .on('finish', () => {
        //     // stream.unpipe(writeStream)
        // })

    // const output = await removePausesAndAddPadding(inputFilePath, silenceLevel)
    // const outputBuffer = toBuffer(toWav(output))
    // const encoder = new Lame({
    //     output : outputFilePath,
    //     bitrate: 320,
    // }).setBuffer(outputBuffer)
    // encoder.encode()
}

export async function trimAudioFiles({
    inputFilesGlobs,
    getOutputFilePath,
    silenceLevel = SILENCE_LEVEL_DEFAULT,
}: {
    inputFilesGlobs: string[],
    getOutputFilePath: (inputFilePath: string) => string,
    silenceLevel: number,
}) {
    const inputFilesPaths = await globby(inputFilesGlobs)

    await Promise.all(inputFilesPaths.map(async (inputFilePath) => {
        const outputFilePath = getOutputFilePath(inputFilePath)

        if (fs.existsSync(outputFilePath)) {
            return
        }

        try {
            await trimAudioFile({
                inputFilePath,
                outputFilePath,
                silenceLevel,
            })
            console.log('OK: ' + outputFilePath)
        } catch (err) {
            console.log('ERROR: ' + inputFilePath + '\r\n' + (err.stack || err.message || err))
        }
    }))

    console.log('Completed!')
}

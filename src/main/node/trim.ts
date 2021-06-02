import globby from 'globby'
import fse from 'fs-extra'
import path from 'path'
import prism from 'prism-media'
import lamejs from 'lamejs'

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

        if (fse.existsSync(outputFilePath)) {
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

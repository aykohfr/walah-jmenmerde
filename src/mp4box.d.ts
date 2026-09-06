declare module 'mp4box' {
  export interface MP4Sample {
    cts: number
    dts: number
    duration: number
    is_sync: boolean
    timescale: number
    data: Uint8Array
  }

  export interface MP4VideoTrack {
    id: number
    codec: string
    duration: number
    timescale: number
    nb_samples: number
    video: {
      width: number
      height: number
    }
  }

  export interface MP4Info {
    duration: number
    timescale: number
    videoTracks: MP4VideoTrack[]
  }

  export interface MP4File {
    onReady: ((info: MP4Info) => void) | null
    onSamples: ((id: number, user: unknown, samples: MP4Sample[]) => void) | null
    onError: ((error: string) => void) | null
    appendBuffer(buffer: ArrayBuffer & { fileStart?: number }): number
    flush(): void
    start(): void
    setExtractionOptions(trackId: number, user: unknown, options: { nbSamples: number }): void
    getTrackById(trackId: number): any
  }

  export class DataStream {
    static BIG_ENDIAN: boolean
    constructor(buffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean)
    buffer: ArrayBuffer
  }

  const MP4Box: {
    createFile(): MP4File
  }

  export default MP4Box
}

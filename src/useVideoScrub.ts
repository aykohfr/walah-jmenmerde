import { RefObject, useEffect, useRef, useState } from 'react'
import MP4Box, { DataStream, type MP4File, type MP4Info, type MP4Sample, type MP4VideoTrack } from 'mp4box'

const LERP_TAU = 8
const SNAP = 0.002
const LRU_MAX = 24
const LEAD = 24
const WATCHDOG = 60_000

type FrameBankItem = {
  ts: number
  blob: Blob
}

type DecoderAcceleration = 'prefer-hardware' | 'prefer-software'

type HookResult = {
  containerRef: RefObject<HTMLDivElement>
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  scrollProgress: number
  canvasLive: boolean
}

function waitFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function getDescription(file: MP4File, track: MP4VideoTrack) {
  const trak = file.getTrackById(track.id)
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C
    if (!box) continue

    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN)
    box.write(stream)
    return new Uint8Array(stream.buffer, 8)
  }

  throw new Error('Aucune description de codec vidéo compatible trouvée.')
}

function parseMp4(source: ArrayBuffer) {
  return new Promise<{
    track: MP4VideoTrack
    samples: MP4Sample[]
    description: Uint8Array
    duration: number
  }>((resolve, reject) => {
    const file = MP4Box.createFile()
    let track: MP4VideoTrack | null = null
    let description: Uint8Array | null = null
    const samples: MP4Sample[] = []
    let settled = false

    const finish = () => {
      if (settled || !track || !description) return
      if (track.nb_samples > 0 && samples.length < track.nb_samples) return
      settled = true
      resolve({
        track,
        samples,
        description,
        duration: track.duration / track.timescale,
      })
    }

    file.onError = (error) => {
      if (settled) return
      settled = true
      reject(new Error(String(error)))
    }

    file.onReady = (info: MP4Info) => {
      track = info.videoTracks[0] ?? null
      if (!track) {
        settled = true
        reject(new Error('Aucune piste vidéo trouvée.'))
        return
      }

      try {
        description = getDescription(file, track)
      } catch (error) {
        settled = true
        reject(error)
        return
      }

      file.setExtractionOptions(track.id, null, { nbSamples: Infinity })
      file.start()
    }

    file.onSamples = (_id, _user, extracted) => {
      samples.push(...extracted)
      finish()
    }

    const buffer = source.slice(0) as ArrayBuffer & { fileStart?: number }
    buffer.fileStart = 0
    file.appendBuffer(buffer)
    file.flush()

    window.setTimeout(() => {
      if (!settled && track && description && samples.length > 0) {
        settled = true
        resolve({
          track,
          samples,
          description,
          duration: track.duration / track.timescale,
        })
      }
    }, 250)
  })
}

async function frameToWebp(frame: VideoFrame) {
  const width = frame.codedWidth || frame.displayWidth
  const height = frame.codedHeight || frame.displayHeight
  const surface = new OffscreenCanvas(width, height)
  const context = surface.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible.')

  context.drawImage(frame, 0, 0, width, height)
  return surface.convertToBlob({ type: 'image/webp', quality: 0.82 })
}

async function decodeSamples(
  track: MP4VideoTrack,
  samples: MP4Sample[],
  description: Uint8Array,
  hardwareAcceleration: DecoderAcceleration,
) {
  const bank: FrameBankItem[] = []
  const pending = new Set<Promise<void>>()
  let decoderError: Error | null = null

  const codec = track.codec.startsWith('vp08') ? 'vp8' : track.codec
  const config: VideoDecoderConfig = {
    codec,
    codedWidth: track.video.width,
    codedHeight: track.video.height,
    description,
    hardwareAcceleration,
    optimizeForLatency: true,
  }

  const support = await VideoDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`Codec WebCodecs non pris en charge: ${codec}`)

  const decoder = new VideoDecoder({
    output: (frame) => {
      const ts = frame.timestamp
      const job = frameToWebp(frame)
        .then((blob) => {
          bank.push({ ts, blob })
        })
        .finally(() => {
          frame.close()
          pending.delete(job)
        })
      pending.add(job)
    },
    error: (error) => {
      decoderError = error instanceof Error ? error : new Error(String(error))
    },
  })

  decoder.configure(support.config)

  try {
    for (const sample of samples) {
      while (decoder.decodeQueueSize + pending.size >= LEAD) {
        if (decoderError) throw decoderError
        await waitFrame()
      }

      if (decoderError) throw decoderError

      decoder.decode(
        new EncodedVideoChunk({
          type: sample.is_sync ? 'key' : 'delta',
          timestamp: (1e6 * sample.cts) / sample.timescale,
          duration: (1e6 * sample.duration) / sample.timescale,
          data: sample.data,
        }),
      )
    }

    await decoder.flush()
    await Promise.all([...pending])
    if (decoderError) throw decoderError
  } finally {
    if (decoder.state !== 'closed') decoder.close()
  }

  bank.sort((a, b) => a.ts - b.ts)
  if (!bank.length) throw new Error('Aucune image décodée.')
  return bank
}

function nearestIndex(bank: FrameBankItem[], time: number) {
  const target = time * 1e6
  let low = 0
  let high = bank.length - 1

  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (bank[mid].ts < target) low = mid + 1
    else high = mid
  }

  if (low === 0) return 0
  const previous = low - 1
  return Math.abs(bank[low].ts - target) < Math.abs(bank[previous].ts - target) ? low : previous
}

function drawBitmapCover(context: CanvasRenderingContext2D, bitmap: ImageBitmap, width: number, height: number) {
  const sourceRatio = bitmap.width / bitmap.height
  const targetRatio = width / height

  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height

  if (sourceRatio > targetRatio) {
    sw = bitmap.height * targetRatio
    sx = (bitmap.width - sw) / 2
  } else {
    sh = bitmap.width / targetRatio
    sy = (bitmap.height - sh) / 2
  }

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height)
}

export function useVideoScrub(videoSrc: string): HookResult {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spanRef = useRef(1)
  const durRef = useRef(0)
  const currentRef = useRef(0)
  const targetRef = useRef(0)
  const readyRef = useRef(false)
  const revertedRef = useRef(false)
  const paintedRef = useRef(false)
  const buildingRef = useRef(false)
  const bankRef = useRef<FrameBankItem[]>([])
  const lruRef = useRef<Map<number, ImageBitmap | null>>(new Map())
  const requestedIndexRef = useRef(-1)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [canvasLive, setCanvasLive] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) durRef.current = video.duration
    }

    updateDuration()
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('durationchange', updateDuration)

    return () => {
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('durationchange', updateDuration)
    }
  }, [])

  useEffect(() => {
    const recomputeSpan = () => {
      const container = containerRef.current
      if (!container) return
      spanRef.current = Math.max(1, container.offsetHeight - window.innerHeight)
    }

    recomputeSpan()
    window.addEventListener('resize', recomputeSpan)
    window.addEventListener('orientationchange', recomputeSpan)

    return () => {
      window.removeEventListener('resize', recomputeSpan)
      window.removeEventListener('orientationchange', recomputeSpan)
    }
  }, [])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = performance.now()
    let disposed = false

    const getProgress = () => Math.min(1, Math.max(0, window.scrollY / spanRef.current))

    const touchLRU = (index: number, bitmap: ImageBitmap | null) => {
      const lru = lruRef.current
      lru.delete(index)
      lru.set(index, bitmap)
      while (lru.size > LRU_MAX) {
        const oldest = lru.keys().next().value as number | undefined
        if (oldest === undefined) break
        const stale = lru.get(oldest)
        if (stale) stale.close()
        lru.delete(oldest)
      }
    }

    const loadBitmap = async (index: number) => {
      const bank = bankRef.current
      const existing = lruRef.current.get(index)
      if (existing) {
        touchLRU(index, existing)
        return existing
      }
      if (existing === null || !bank[index]) return null

      touchLRU(index, null)
      try {
        const bitmap = await createImageBitmap(bank[index].blob)
        if (disposed || revertedRef.current) {
          bitmap.close()
          return null
        }
        touchLRU(index, bitmap)
        return bitmap
      } catch {
        lruRef.current.delete(index)
        return null
      }
    }

    const paint = async (index: number) => {
      if (requestedIndexRef.current === index && paintedRef.current) return
      requestedIndexRef.current = index

      const bitmap = await loadBitmap(index)
      if (!bitmap || requestedIndexRef.current !== index || revertedRef.current) return

      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return

      drawBitmapCover(context, bitmap, canvas.width, canvas.height)
      paintedRef.current = true
      if (!canvasLive) setCanvasLive(true)

      for (const warmIndex of [index - 1, index + 1, index + 2]) {
        if (warmIndex >= 0 && warmIndex < bankRef.current.length) void loadBitmap(warmIndex)
      }
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      const progress = getProgress()
      setScrollProgress(progress)

      const duration = durRef.current
      if (duration > 0) {
        targetRef.current = progress * duration

        if (reducedMotion.matches) {
          currentRef.current = targetRef.current
        } else {
          currentRef.current +=
            (targetRef.current - currentRef.current) * (1 - Math.exp(-dt * LERP_TAU))
          if (Math.abs(targetRef.current - currentRef.current) < SNAP) {
            currentRef.current = targetRef.current
          }
        }

        if (readyRef.current && bankRef.current.length) {
          void paint(nearestIndex(bankRef.current, currentRef.current))
        } else {
          const video = videoRef.current
          if (
            video &&
            video.readyState >= 1 &&
            !video.seeking &&
            Math.abs(video.currentTime - currentRef.current) > 0.01
          ) {
            video.currentTime = Math.min(Math.max(0, currentRef.current), Math.max(0, duration - 0.001))
          }
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      for (const bitmap of lruRef.current.values()) bitmap?.close()
      lruRef.current.clear()
    }
  }, [canvasLive])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') return

    let cancelled = false
    let watchdog = 0

    const revert = () => {
      revertedRef.current = true
      readyRef.current = false
      setCanvasLive(false)
    }

    const build = async () => {
      if (buildingRef.current) return
      buildingRef.current = true
      revertedRef.current = false

      watchdog = window.setTimeout(() => {
        if (!cancelled) revert()
      }, WATCHDOG)

      try {
        const response = await fetch(videoSrc, { mode: 'cors' })
        if (!response.ok) throw new Error(`Échec du chargement vidéo (${response.status}).`)
        const source = await response.arrayBuffer()
        if (cancelled || revertedRef.current) return

        const { track, samples, description, duration } = await parseMp4(source)
        if (duration > 0) durRef.current = duration

        let bank: FrameBankItem[]
        try {
          bank = await decodeSamples(track, samples, description, 'prefer-hardware')
        } catch {
          if (cancelled || revertedRef.current) return
          bank = await decodeSamples(track, samples, description, 'prefer-software')
        }

        if (cancelled || revertedRef.current) return
        bankRef.current = bank
        readyRef.current = true
        window.clearTimeout(watchdog)
      } catch {
        if (!cancelled) revert()
      } finally {
        buildingRef.current = false
      }
    }

    const start = () => void build()
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })

    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
      window.removeEventListener('load', start)
    }
  }, [videoSrc])

  return { containerRef, videoRef, canvasRef, scrollProgress, canvasLive }
}

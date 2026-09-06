import { CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ChevronUp, Info, X } from 'lucide-react'
import { useVideoScrub } from '@/useVideoScrub'

const DARK = '#1D3045'
const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4'

const NAV_LINKS = ['VECTRUS ENERGY', 'VECTRUS UPSTREAM', 'VECTRUS MARKETS', 'VECTRUS SYSTEMS', 'VECTRUS+']

function clampOpacity(value: number) {
  return Math.min(1, Math.max(0, value))
}

function Stagger({
  visible,
  delay,
  children,
  className = '',
  style,
}: {
  visible: boolean
  delay: number
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transitionProperty: 'opacity, transform',
        transitionDuration: '0.8s',
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

function App() {
  const { containerRef, videoRef, canvasRef, scrollProgress, canvasLive } = useVideoScrub(VIDEO_SRC)
  const [menuOpen, setMenuOpen] = useState(false)
  const [navEntered, setNavEntered] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setNavEntered(true), 200)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = menuOpen ? 'hidden' : previous
    return () => {
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  const s1Opacity = useMemo(() => {
    if (scrollProgress < 0.2) return 1
    return clampOpacity(1 - (scrollProgress - 0.2) / 0.08)
  }, [scrollProgress])

  const s2Opacity = useMemo(() => {
    if (scrollProgress < 0.32) return 0
    if (scrollProgress < 0.4) return clampOpacity((scrollProgress - 0.32) / 0.08)
    if (scrollProgress < 0.55) return 1
    return clampOpacity(1 - (scrollProgress - 0.55) / 0.08)
  }, [scrollProgress])

  const s3Opacity = useMemo(() => {
    if (scrollProgress < 0.67) return 0
    if (scrollProgress < 0.75) return clampOpacity((scrollProgress - 0.67) / 0.08)
    return 1
  }, [scrollProgress])

  const navIsWhite = scrollProgress > 0.55
  const navColor = navIsWhite ? '#FFFFFF' : DARK
  const navEntrance = (delay: number): CSSProperties => ({
    opacity: navEntered ? 1 : 0,
    transform: navEntered ? 'translateY(0)' : 'translateY(-12px)',
    transitionProperty: 'opacity, transform',
    transitionDuration: '0.6s',
    transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
    transitionDelay: `${delay}ms`,
  })

  return (
    <main ref={containerRef} id="scene" className="relative h-[500vh]">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            canvasLive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        <div className="pointer-events-none absolute inset-0">
          <nav
            className="pointer-events-auto absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-6 pb-6 pt-8 sm:px-8 sm:pt-12 md:px-12"
            style={{ color: navColor, transition: 'color 0.5s ease' }}
          >
            <button
              type="button"
              aria-label="Ouvrir le menu"
              onClick={() => setMenuOpen(true)}
              className="flex flex-col gap-[5px] lg:hidden"
              style={navEntrance(100)}
            >
              <span className="h-[2px] w-6 bg-current" />
              <span className="h-[2px] w-6 bg-current" />
              <span className="h-[2px] w-4 bg-current" />
            </button>

            <div className="hidden items-center gap-8 lg:flex xl:gap-10">
              {NAV_LINKS.map((label, index) => (
                <a
                  key={label}
                  href="#scene"
                  className={`relative text-xs font-medium uppercase tracking-[0.15em] transition-opacity hover:opacity-70 ${
                    index === 0 ? 'after:absolute after:-bottom-3 after:left-0 after:h-[2px] after:w-full after:bg-current' : ''
                  }`}
                  style={navEntrance(index * 80 + 100)}
                >
                  {label}
                </a>
              ))}
            </div>

            <div
              className="hidden items-center gap-8 sm:flex"
              style={{ ...navEntrance(500), transitionProperty: 'opacity, transform' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.2em]">ACTUALITÉS</span>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: navColor, transition: 'background-color 0.5s ease' }}
                >
                  <Info size={10} style={{ color: navIsWhite ? DARK : '#FFFFFF' }} />
                </span>
              </div>

              <span className="hidden text-xs font-medium uppercase tracking-[0.2em] lg:inline">MENU</span>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="text-xs font-medium uppercase tracking-[0.2em] lg:hidden"
              >
                MENU
              </button>
            </div>
          </nav>

          <section
            className="absolute inset-0 flex items-center px-6 sm:px-8 md:px-20 lg:px-32"
            style={{ opacity: s1Opacity, transition: 'opacity 0.1s ease-out' }}
          >
            <div className="max-w-[1100px]">
              <Stagger visible={s1Opacity > 0.3} delay={0}>
                <h1
                  className="font-light uppercase leading-[1.2]"
                  style={{ color: DARK, fontSize: 'clamp(2rem,5vw,5rem)' }}
                >
                  Faire progresser les ressources pour un avenir plus propre
                </h1>
              </Stagger>

              <Stagger visible={s1Opacity > 0.3} delay={150}>
                <p className="mt-6 text-sm uppercase tracking-[0.3em]" style={{ color: `${DARK}90` }}>
                  Une énergie durable au service d’un objectif
                </p>
              </Stagger>
            </div>

            <Stagger
              visible={s1Opacity > 0.3}
              delay={300}
              className="pointer-events-auto absolute bottom-12 right-6 sm:right-8 md:right-12"
            >
              <button
                type="button"
                aria-label="Suivant"
                className="flex h-12 w-12 items-center justify-center rounded-full border transition-opacity hover:opacity-70"
                style={{ borderColor: `${DARK}80`, color: DARK }}
              >
                <ArrowRight size={18} />
              </button>
            </Stagger>
          </section>

          <section
            className="absolute inset-0 flex items-center justify-center px-6 sm:px-8"
            style={{ opacity: s2Opacity, transition: 'opacity 0.1s ease-out' }}
          >
            <div className="w-full max-w-[900px]">
              <Stagger visible={s2Opacity > 0.3} delay={0}>
                <h2
                  className="text-center font-extralight uppercase leading-[1.3] tracking-wide"
                  style={{ color: DARK, fontSize: 'clamp(1.5rem,4.5vw,4.5rem)' }}
                >
                  Nous bâtissons des partenariats durables avec vision{' '}
                  <span style={{ color: `${DARK}CC` }}>et précision</span>{' '}
                  <span style={{ color: `${DARK}80` }}>à travers chaque frontière</span>
                </h2>
              </Stagger>
            </div>

            <div className="absolute bottom-16 right-6 flex flex-col items-center gap-4 sm:right-8 md:right-12">
              <Stagger visible={s2Opacity > 0.3} delay={200} className="pointer-events-auto">
                <button
                  type="button"
                  aria-label="Descendre"
                  className="flex h-12 w-12 items-center justify-center rounded-full border"
                  style={{ borderColor: `${DARK}66`, color: DARK }}
                >
                  <ArrowDown size={18} />
                </button>
              </Stagger>

              <Stagger visible={s2Opacity > 0.3} delay={350} className="mt-4">
                <div className="flex flex-col items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DARK }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `${DARK}66` }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `${DARK}66` }} />
                </div>
              </Stagger>

              <Stagger visible={s2Opacity > 0.3} delay={500} className="pointer-events-auto mt-2">
                <button
                  type="button"
                  aria-label="Remonter"
                  className="flex h-10 w-10 items-center justify-center rounded-full border"
                  style={{ borderColor: `${DARK}4D`, color: `${DARK}CC` }}
                >
                  <ChevronUp size={16} />
                </button>
              </Stagger>
            </div>
          </section>

          <section
            className="absolute inset-0 flex items-center justify-end px-6 sm:px-8 md:px-20 lg:px-32"
            style={{ opacity: s3Opacity, transition: 'opacity 0.1s ease-out' }}
          >
            <div className="w-full max-w-2xl text-left">
              <Stagger visible={s3Opacity > 0.3} delay={0}>
                <p className="mb-4 text-lg tracking-wide text-white/60">Halder | Nordvik</p>
              </Stagger>

              <Stagger visible={s3Opacity > 0.3} delay={150}>
                <h2
                  className="mb-8 font-light uppercase leading-[1.2] tracking-wide text-white"
                  style={{ fontSize: 'clamp(2rem,4vw,4rem)' }}
                >
                  Alimenter l’ambition,
                  <br />
                  façonner demain.
                </h2>
              </Stagger>

              <Stagger visible={s3Opacity > 0.3} delay={300}>
                <div className="pointer-events-auto flex items-center gap-4">
                  <span className="text-sm uppercase tracking-[0.3em] text-white/80">Contacter Nordvik</span>
                  <button
                    type="button"
                    aria-label="Contacter Nordvik"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 transition-transform duration-300 hover:scale-110"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Stagger>
            </div>
          </section>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[100] bg-[#1D3045] transition-all duration-500 ${
          menuOpen ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1)' }}
        aria-hidden={!menuOpen}
      >
        <div
          className={`flex h-full flex-col transition-transform duration-500 ${menuOpen ? 'translate-y-0' : '-translate-y-8'}`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1)' }}
        >
          <div className="flex justify-end px-6 pt-8 sm:px-8 sm:pt-12">
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-8 sm:px-12">
            {NAV_LINKS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setMenuOpen(false)}
                className={`py-3 text-2xl font-light uppercase tracking-wide transition-all duration-500 sm:text-3xl ${
                  index === 0 ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
                style={{
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? 'translateY(0)' : 'translateY(20px)',
                  transitionDelay: `${index * 60}ms`,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-8 pb-10 text-xs font-medium uppercase tracking-[0.2em] text-white/60 sm:px-12">
            <span>ACTUALITÉS</span>
            <span>CONTACT</span>
          </div>
        </div>
      </div>
    </main>
  )
}

export default App

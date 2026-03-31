'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import RewardContent from '@/components/RewardContent'
import { getRewardLabel } from '@/lib/types'

export default function RewardReveal({ reward, proName }: { reward: any; proName: string }) {
  const [phase, setPhase] = useState<'sealed' | 'opening' | 'revealed'>('sealed')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparklesRef = useRef<HTMLDivElement>(null)

  const animateGlowCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const W = 400, H = 420
    canvas.width = W
    canvas.height = H
    canvas.style.opacity = '1'

    let frame = 0
    const maxFrames = 80
    const cx = W / 2, cy = H * 0.50

    function draw() {
      if (frame > maxFrames) {
        if (canvas) {
          canvas.style.transition = 'opacity 1.5s ease'
          canvas.style.opacity = '0'
        }
        return
      }
      ctx!.clearRect(0, 0, W, H)
      const progress = frame / maxFrames
      const radius = 30 + progress * 200
      const alpha = Math.sin(progress * Math.PI) * 0.6

      const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0, `rgba(255,250,230,${alpha})`)
      grad.addColorStop(0.2, `rgba(255,215,0,${alpha * 0.7})`)
      grad.addColorStop(0.5, `rgba(196,163,90,${alpha * 0.35})`)
      grad.addColorStop(1, 'rgba(196,163,90,0)')
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, W, H)

      frame++
      requestAnimationFrame(draw)
    }
    draw()
  }, [])

  const createParticles = useCallback(() => {
    const container = sparklesRef.current
    if (!container) return
    const colors = ['#FFD700', '#C4A35A', '#FFF8DC', '#E8D5A3', '#FFFACD', '#F5DEB3', '#FFE4B5', '#FFF', '#FFEFD5', '#FFE082']
    const cy = 130

    for (let i = 0; i < 150; i++) {
      const p = document.createElement('div')
      const angle = Math.random() * Math.PI * 2
      const dist = 30 + Math.random() * 160
      const size = 2 + Math.random() * 7
      const isGlow = Math.random() > 0.35
      const delay = Math.random() * 0.7
      const duration = 1.0 + Math.random() * 1.0

      p.style.cssText = `
        position:absolute;top:${cy}px;left:50%;
        width:${size}px;height:${size}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${isGlow ? '50%' : Math.random() > 0.5 ? '1px' : '50%'};
        ${isGlow ? 'box-shadow:0 0 ' + (3 + Math.random() * 10) + 'px ' + (1 + Math.random() * 4) + 'px rgba(255,215,0,0.45);' : ''}
        --tx:${Math.cos(angle) * dist}px;
        --ty:${Math.sin(angle) * dist}px;
        animation:particle-out ${duration}s ease-out ${delay}s forwards;
        opacity:0;
      `
      container.appendChild(p)
    }

    for (let i = 0; i < 40; i++) {
      const f = document.createElement('div')
      const tx = (Math.random() - 0.5) * 280
      const ty = -(60 + Math.random() * 140)
      const size = 1.5 + Math.random() * 4
      const delay = 0.2 + Math.random() * 1.0

      f.style.cssText = `
        position:absolute;top:${cy}px;left:50%;
        width:${size}px;height:${size}px;
        background:${Math.random() > 0.5 ? '#FFD700' : '#FFF8DC'};
        border-radius:50%;
        box-shadow:0 0 ${4 + Math.random() * 6}px ${2 + Math.random() * 3}px rgba(255,215,0,0.25);
        --tx:${tx}px;--ty:${ty}px;
        animation:float-drift ${2.5 + Math.random() * 1.5}s ease-out ${delay}s forwards;
        opacity:0;
      `
      container.appendChild(f)
    }

    setTimeout(() => { if (container) container.innerHTML = '' }, 5000)
  }, [])

  const handleOpen = useCallback(() => {
    if (phase !== 'sealed') return
    setPhase('opening')

    // Phase 1 (0ms): slit glow
    const slit = document.getElementById('slit-glow')
    if (slit) slit.style.animation = 'slit-pulse 1s ease-out forwards'

    // Phase 2 (400ms): flap opens
    setTimeout(() => {
      const flap = document.getElementById('env-flap')
      if (flap) {
        flap.style.transform = 'rotateX(180deg)'
        flap.style.zIndex = '0'
      }
    }, 400)

    // Phase 3 (700ms): light burst + particles
    setTimeout(() => {
      const lb = document.getElementById('light-burst')
      if (lb) {
        lb.style.transition = 'width 1.5s cubic-bezier(0.16,1,0.3,1), height 1.5s cubic-bezier(0.16,1,0.3,1), opacity 0.8s ease'
        lb.style.width = '500px'
        lb.style.height = '500px'
        lb.style.opacity = '1'
      }
      const r = document.getElementById('env-rays')
      if (r) {
        r.style.transition = 'opacity 1s ease'
        r.style.opacity = '1'
      }
      animateGlowCanvas()
      createParticles()
    }, 700)

    // Phase 4 (2200ms): light fades
    setTimeout(() => {
      const lb = document.getElementById('light-burst')
      if (lb) {
        lb.style.transition = 'opacity 2s ease'
        lb.style.opacity = '0'
      }
      const r = document.getElementById('env-rays')
      if (r) {
        r.style.transition = 'opacity 2.5s ease'
        r.style.opacity = '0'
      }
    }, 2200)

    // Phase 5 (2800ms): envelope fades out
    setTimeout(() => {
      const eg = document.getElementById('envelope-group')
      if (eg) {
        eg.style.opacity = '0'
        eg.style.transform = 'scale(0.9)'
      }
    }, 2800)

    // Phase 6 (3800ms): letter appears
    setTimeout(() => {
      const eg = document.getElementById('envelope-group')
      if (eg) eg.style.display = 'none'
      setPhase('revealed')
    }, 3800)
  }, [phase, animateGlowCanvas, createParticles])

  // Generate ray lines on mount
  useEffect(() => {
    const rayGroup = document.getElementById('ray-group')
    if (!rayGroup || rayGroup.children.length > 0) return
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * 360
      const len = 150 + Math.random() * 90
      const w = 0.6 + Math.random() * 1.5
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', '0')
      line.setAttribute('y1', '0')
      const rad = angle * Math.PI / 180
      line.setAttribute('x2', String(Math.cos(rad) * len))
      line.setAttribute('y2', String(Math.sin(rad) * len))
      line.setAttribute('stroke', i % 3 === 0 ? 'url(#rg1)' : 'url(#rg2)')
      line.setAttribute('stroke-width', String(w))
      line.setAttribute('opacity', String(0.15 + Math.random() * 0.5))
      rayGroup.appendChild(line)
    }
  }, [])

  const isOrgApp = reward?.reward_type === 'org_app' || reward?.reward_type === 'fnt_neuro_app'
  const rewardTypeLabel = isOrgApp ? 'アプリ' : (getRewardLabel(reward?.reward_type) || reward?.title || reward?.reward_type || 'リワード')

  return (
    <>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.97)}}
        @keyframes bounce-hint{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-8px)}}
        @keyframes particle-out{0%{transform:translate(0,0) scale(.2);opacity:0}12%{opacity:1;transform:scale(1.1)}100%{transform:translate(var(--tx),var(--ty)) scale(0);opacity:0}}
        @keyframes float-drift{0%{transform:translate(0,0);opacity:0}8%{opacity:.9}70%{opacity:.3}100%{transform:translate(var(--tx),var(--ty));opacity:0}}
        @keyframes slit-pulse{0%{opacity:0;height:4px}40%{opacity:1;height:6px}100%{opacity:0;height:8px}}
        @keyframes letter-appear{0%{opacity:0;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
      `}</style>

      <div style={{ position: 'relative', width: 300, minHeight: 260, margin: '0 auto', overflow: 'visible' }}>

        {/* Light burst */}
        <div id="light-burst" style={{
          position: 'absolute', top: '50%', left: '50%', width: 0, height: 0,
          transform: 'translate(-50%,-50%)', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,248,220,0.95) 0%, rgba(255,215,0,0.5) 25%, rgba(196,163,90,0.2) 50%, transparent 75%)',
          zIndex: 5, opacity: 0, pointerEvents: 'none',
        }} />

        {/* Rays */}
        <div id="env-rays" style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 520, height: 520, zIndex: 4, opacity: 0, pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 520 520" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="rg1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFD700" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#C4A35A" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFF8DC" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#C4A35A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <g transform="translate(260,260)" id="ray-group" />
          </svg>
        </div>

        {/* Glow canvas */}
        <canvas ref={canvasRef} style={{
          position: 'absolute', top: -80, left: -50, width: 400, height: 420,
          zIndex: 6, pointerEvents: 'none', opacity: 0,
        }} />

        {/* Sparkles container */}
        <div ref={sparklesRef} style={{
          position: 'absolute', top: 0, left: 0, width: 300, height: 260,
          overflow: 'visible', pointerEvents: 'none', zIndex: 10,
        }} />

        {/* Envelope (fades out) */}
        <div id="envelope-group" style={{
          position: 'absolute', top: 0, left: 0, width: 300, height: 260,
          maxHeight: 320,
          transition: 'opacity 1.2s ease, transform 1.2s ease',
        }}>
          <div
            onClick={handleOpen}
            style={{
              perspective: 900, cursor: phase === 'sealed' ? 'pointer' : 'default',
              position: 'absolute', top: 20, left: 0, width: 300, height: 220, zIndex: 3,
            }}
          >
            {/* Envelope body */}
            <svg viewBox="0 0 300 170" style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '100%', maxHeight: 240, zIndex: 2, pointerEvents: 'none' }}>
              <defs>
                <pattern id="damask" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                  <rect width="30" height="30" fill="none" />
                  <path d="M15,2 C18,6 22,8 22,12 C22,16 18,18 15,22 C12,18 8,16 8,12 C8,8 12,6 15,2Z" fill="#C4A35A" opacity="0.12" />
                  <circle cx="15" cy="12" r="1.5" fill="#C4A35A" opacity="0.08" />
                  <path d="M0,0 Q7,5 0,10 Q7,15 0,20 Q7,25 0,30" fill="none" stroke="#C4A35A" strokeWidth="0.3" opacity="0.12" />
                  <path d="M30,0 Q23,5 30,10 Q23,15 30,20 Q23,25 30,30" fill="none" stroke="#C4A35A" strokeWidth="0.3" opacity="0.12" />
                </pattern>
                <linearGradient id="envGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EDE0C0" />
                  <stop offset="50%" stopColor="#D9C48B" />
                  <stop offset="100%" stopColor="#CFBA7A" />
                </linearGradient>
                <linearGradient id="envShine" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="45%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
                  <stop offset="55%" stopColor="rgba(255,255,255,0)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <rect x="1" y="1" width="298" height="168" rx="10" fill="url(#envGrad)" stroke="#B8993D" strokeWidth="1.5" />
              <rect x="1" y="1" width="298" height="168" rx="10" fill="url(#damask)" />
              <rect x="1" y="1" width="298" height="168" rx="10" fill="url(#envShine)" />
              <rect x="10" y="10" width="280" height="150" rx="6" fill="none" stroke="#C4A35A" strokeWidth="0.5" opacity="0.3" />
              <line x1="20" y1="155" x2="280" y2="155" stroke="#C4A35A" strokeWidth="0.3" opacity="0.25" />
            </svg>

            {/* Flap */}
            <div id="env-flap" style={{
              position: 'absolute', top: 50, left: 0, right: 0, height: 120,
              transformOrigin: 'top center', transform: 'rotateX(0deg)',
              transition: 'transform 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              zIndex: 3,
            }}>
              <svg viewBox="0 0 300 120" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="flapGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D9C48B" />
                    <stop offset="100%" stopColor="#CFBA7A" />
                  </linearGradient>
                </defs>
                <path d="M1,0 L150,110 L299,0" fill="url(#flapGrad)" stroke="#B8993D" strokeWidth="1.5" />
                <path d="M1,0 L150,110 L299,0" fill="url(#damask)" />
                <path d="M50,20 L150,90 L250,20" fill="none" stroke="#C4A35A" strokeWidth="0.3" opacity="0.3" />
              </svg>
            </div>

            {/* Slit glow */}
            <div id="slit-glow" style={{
              position: 'absolute', top: 48, left: 10, right: 10, height: 4,
              background: 'radial-gradient(ellipse at center, rgba(255,215,0,0.9) 0%, rgba(196,163,90,0.3) 50%, transparent 100%)',
              zIndex: 4, opacity: 0, filter: 'blur(3px)', pointerEvents: 'none',
            }} />
          </div>

          {/* Tap hint finger animation */}
          {phase === 'sealed' && (
            <div style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              animation: 'bounce-hint 1.5s ease-in-out infinite',
              fontSize: 28,
              pointerEvents: 'none',
              zIndex: 11,
            }}>
              👆
            </div>
          )}
        </div>

        {/* Letter (appears after envelope fades) */}
        {phase === 'revealed' && (
          <div style={{
            position: 'relative', marginTop: 10, marginLeft: 16, marginRight: 16,
            background: '#FAFAF7', borderRadius: 12,
            border: '1px solid #E5E2D9', padding: '22px 18px',
            zIndex: 2,
            animation: 'letter-appear 1s cubic-bezier(0.22, 1, 0.36, 1) forwards',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 32, height: 1, background: '#C4A35A', margin: '0 auto 12px', opacity: 0.5 }} />
              <div style={{ fontSize: 13, color: '#C4A35A', fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>
                {rewardTypeLabel}
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 14 }}>
                {proName}さんからのおすすめ
              </div>
              {isOrgApp ? (
                <>
                  {reward?.title && (
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>
                      {reward.title}
                    </div>
                  )}
                  {reward?.content && (
                    <div style={{
                      background: '#F0F4FF', borderLeft: '3px solid #3B82F6',
                      borderRadius: 8, padding: '12px 14px', marginBottom: 12,
                      textAlign: 'left', fontSize: 13, color: '#4B5563',
                      wordBreak: 'break-word', overflowWrap: 'break-word',
                    }}>
                      {reward.content}
                    </div>
                  )}
                  {reward?.url && (
                    <a
                      href={reward.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: 6, width: '100%', padding: '12px 16px', borderRadius: 10,
                        background: '#EFF6FF', border: '1px solid #BFDBFE',
                        color: '#1D4ED8', fontSize: 15, fontWeight: 700,
                        textDecoration: 'none', transition: 'background 0.2s',
                      }}
                    >
                      アプリを開く →
                    </a>
                  )}
                </>
              ) : (
                <div style={{ background: '#F5F0E5', border: '1px dashed #C4A35A', borderRadius: 8, padding: 16, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  <RewardContent content={reward?.content || ''} />
                </div>
              )}
              <div style={{ width: 32, height: 1, background: '#C4A35A', margin: '14px auto 0', opacity: 0.5 }} />
            </div>
          </div>
        )}
      </div>

      {/* Tap hint (before open) */}
      {phase === 'sealed' && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <span style={{ fontSize: 14, color: '#C4A35A', fontWeight: 600, animation: 'pulse 2s infinite' }}>
            開封する
          </span>
        </div>
      )}
    </>
  )
}

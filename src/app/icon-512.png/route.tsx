import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  const s = 512
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg,#0a1a16,#0f2b28)',
        }}
      >
        <svg width={s * 0.75} height={s * 0.75} viewBox="0 0 56 56">
          <path d="M6 38h7l3-11 4 14 3-9 3 6" fill="none" stroke="#4ADE80" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <rect x="30" y="30" width="4.5" height="8" rx="1" fill="#4ADE80" />
          <rect x="37" y="24" width="4.5" height="14" rx="1" fill="#5EEAD4" />
          <rect x="44" y="16" width="4.5" height="22" rx="1" fill="#5EEAD4" />
        </svg>
      </div>
    ),
    { width: s, height: s }
  )
}

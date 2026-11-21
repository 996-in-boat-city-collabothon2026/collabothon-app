// A whole standing agent: the head from web/public/avatars/<hat>-cut.png on top of a drawn body.
// Calm motion only: breathing + slight sway; `speaking` adds a nod. Turned off for prefers-reduced-motion.
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { useT } from '../i18n';
import { avatarSrc } from './ui';

// Shirt and skin colours sampled from each picture, so the body matches the head.
const LOOK: Record<string, { shirt: string; skin: string }> = {
  white: { shirt: '#676f48', skin: '#c98a5a' },
  black: { shirt: '#dd8a37', skin: '#b5693b' },
  green: { shirt: '#1d3557', skin: '#bb7647' },
  red: { shirt: '#8a8e18', skin: '#c07a40' },
  yellow: { shirt: '#30775e', skin: '#9d5f35' },
};

export default function StandingAgent({ cfo, height = 180, speaking = false }: { cfo: CfoId; height?: number; speaking?: boolean }) {
  const { lang } = useT();
  const c = CFOS[cfo];
  const look = LOOK[c.hat] ?? LOOK.yellow;
  const head = avatarSrc(c.hat).replace('-hat.png', '-cut.png');
  const label = `${c.name} – ${lang === 'pl' ? c.rolePl : c.role} · ${lang === 'pl' ? HATS[c.hat].labelPl : HATS[c.hat].label}`;
  return (
    <svg viewBox="0 0 256 560" height={height} width={(height * 256) / 560} role="img" aria-label={label}
      className={`standing-agent ${speaking ? 'is-speaking' : ''}`}>
      <title>{label}</title>
      <ellipse cx="128" cy="548" rx="78" ry="9" fill="#000" fillOpacity="0.08" />
      <g className="sa-sway">
        {/* legs + shoes */}
        <rect x="84" y="384" width="40" height="146" rx="18" fill="#334155" />
        <rect x="132" y="384" width="40" height="146" rx="18" fill="#334155" />
        <ellipse cx="100" cy="532" rx="30" ry="12" fill="#18181b" />
        <ellipse cx="156" cy="532" rx="30" ry="12" fill="#18181b" />
        <g className="sa-upper">
          {/* arms (sleeves + hands) */}
          <rect x="22" y="236" width="34" height="150" rx="17" fill={look.shirt} />
          <rect x="200" y="236" width="34" height="150" rx="17" fill={look.shirt} />
          <circle cx="39" cy="392" r="16" fill={look.skin} />
          <circle cx="217" cy="392" r="16" fill={look.skin} />
          {/* head (the original picture) */}
          <g className="sa-head">
            <image href={head} x="0" y="0" width="256" height="256" />
          </g>
          {/* torso in front, covering the picture's shoulders */}
          <path d="M60 222 Q128 206 196 222 Q224 232 226 262 L212 404 L44 404 L30 262 Q32 232 60 222Z" fill={look.shirt} />
          <path d="M104 214 L128 250 L152 214" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="44" y="392" width="168" height="16" rx="6" fill="#000" fillOpacity="0.18" />
        </g>
      </g>
    </svg>
  );
}

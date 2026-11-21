// "AI network" picture: a pulsing lightning core in the middle, the 4 CFO agents and 3 data sources around it,
// thin lines between them with small dots travelling along. Pure SVG + CSS, decorative except for the labels.
// Animations stop when the user prefers reduced motion (see index.css).
import { CFOS, HATS, type CfoId } from '@cfo/shared';
import { useT } from '../i18n';
import { avatarSrc } from './ui';

const AGENTS: CfoId[] = ['anna', 'tomasz', 'kasia', 'marek'];
const SOURCES = ['KSeF', 'Bank', 'NBP'];

export default function AgentHub({ className = '' }: { className?: string }) {
  const { lang } = useT();
  const W = 600, H = 420, cx = W / 2, cy = H / 2;
  // Agents on the inner ring (left/right), sources on the outer edges (top/bottom)
  const agentPos = [[cx - 190, cy - 85], [cx + 190, cy - 85], [cx - 190, cy + 60], [cx + 190, cy + 60]];
  const sourcePos = [[cx, 30], [cx - 80, H - 26], [cx + 80, H - 26]];
  const nodes = [...agentPos, ...sourcePos];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-auto w-full ${className}`} role="img"
      aria-label={AGENTS.map((a) => `${CFOS[a].name} – ${lang === 'pl' ? CFOS[a].rolePl : CFOS[a].role}`).join(', ')}>
      <defs>
        <radialGradient id="hubGlow">
          <stop offset="0%" stopColor="#EE0000" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#EE0000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint concentric rings */}
      {[70, 125, 180].map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#000" strokeOpacity="0.06" />)}
      <circle cx={cx} cy={cy} r="110" fill="url(#hubGlow)" />

      {/* connectors with travelling dots */}
      {nodes.map(([x, y], i) => {
        const d = `M${cx},${cy} L${x},${y}`;
        return (
          <g key={i}>
            <path d={d} stroke="#EE0000" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
            <circle r="3.5" fill="#EE0000" className="hub-dot">
              <animateMotion dur={`${2.4 + (i % 3) * 0.6}s`} repeatCount="indefinite" path={d} keyPoints={i % 2 ? '1;0' : '0;1'} keyTimes="0;1" />
            </circle>
          </g>
        );
      })}

      {/* sources */}
      {SOURCES.map((s, i) => {
        const [x, y] = sourcePos[i];
        return (
          <g key={s}>
            <rect x={x - 34} y={y - 17} width="68" height="34" rx="17" fill="#fff" stroke="#000" strokeOpacity="0.12" />
            <text x={x} y={y + 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#1d1d1f">{s}</text>
          </g>
        );
      })}

      {/* agents: coloured circle + hat colour ring + name */}
      {AGENTS.map((a, i) => {
        const [x, y] = agentPos[i];
        const c = CFOS[a];
        const right = x > cx;
        return (
          <g key={a}>
            <circle cx={x} cy={y} r="24" fill={c.color} stroke={HATS[c.hat].color === '#f8fafc' ? '#d4d4d8' : HATS[c.hat].color} strokeWidth="4" />
            <text x={x} y={y + 7} textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff">{c.name[0]}</text>
            {/* full-colour picture inside the circle; the same picture without background above it (hat breaks out) */}
            <clipPath id={`clip-${a}`}><circle cx={x} cy={y} r="30" /></clipPath>
            <clipPath id={`top-${a}`}><rect x={x - 50} y={y - 80} width="100" height="80" /></clipPath>
            <g className="avatar-hat">
              <image href={`${avatarSrc(c.hat).replace('-hat.png', '')}-full.png`} x={x - 40} y={y - 46} width="80" height="80" clipPath={`url(#clip-${a})`} />
              <circle cx={x} cy={y} r="30" fill="none" stroke={HATS[c.hat].color === '#f8fafc' ? '#a1a1aa' : HATS[c.hat].color} strokeWidth="3" />
              <image href={`${avatarSrc(c.hat).replace('-hat.png', '')}-cut.png`} x={x - 40} y={y - 46} width="80" height="80" clipPath={`url(#top-${a})`} />
            </g>
            <text x={x} y={y + 54} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1d1d1f">{c.name}</text>
            <text x={x} y={y + 76} textAnchor="middle" fontSize="18" fill="#3f3f46">{lang === 'pl' ? c.rolePl : c.role}</text>
          </g>
        );
      })}

      {/* the core */}
      <circle cx={cx} cy={cy} r="38" fill="#EE0000" fillOpacity="0.18" className="hub-pulse" style={{ transformOrigin: `${cx}px ${cy}px` }} />
      <circle cx={cx} cy={cy} r="28" fill="#EE0000" />
      <path d={`M${cx + 3},${cy - 15} L${cx - 9},${cy + 3} L${cx - 1},${cy + 3} L${cx - 3},${cy + 15} L${cx + 9},${cy - 3} L${cx + 1},${cy - 3} Z`} fill="#fff" />
    </svg>
  );
}

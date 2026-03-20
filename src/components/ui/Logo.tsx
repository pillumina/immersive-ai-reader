interface LogoProps {
  size?: number;
  variant?: 'light' | 'dark';
}

// Immersive AI Reader logo — open document with AI spark
export function Logo({ size = 20, variant = 'light' }: LogoProps) {
  const stroke = variant === 'dark' ? '#FFFFFF' : '#c2410c';
  const pageFill = variant === 'dark' ? 'rgba(255,255,255,0.12)' : '#FFFFFF';
  const pageFillRight = variant === 'dark' ? 'rgba(255,255,255,0.08)' : '#FFF5F5';
  const lineColor = variant === 'dark' ? 'rgba(255,255,255,0.25)' : '#FECACA';
  const circleFill = variant === 'dark' ? '#FFFFFF' : '#c2410c';
  const circleStroke = variant === 'dark' ? 'rgba(255,255,255,0.4)' : '#c2410c';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="18" fill={variant === 'dark' ? 'rgba(255,255,255,0.12)' : '#FEF2F2'} />
      {/* Left page */}
      <path
        d="M10 12 L20 12 L20 32 L10 32 C8.9 32 8 31.1 8 30 L8 14 C8 12.9 8.9 12 10 12Z"
        fill={pageFill}
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Right page */}
      <path
        d="M30 12 L20 12 L20 32 L30 32 C31.1 32 32 31.1 32 30 L32 14 C32 12.9 31.1 12 30 12Z"
        fill={pageFillRight}
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Spine */}
      <line x1="20" y1="12" x2="20" y2="32" stroke={stroke} strokeWidth="1.8" />
      {/* Text lines on left */}
      <line x1="11" y1="17" x2="17" y2="17" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="21" x2="17" y2="21" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="25" x2="15" y2="25" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" />
      {/* AI spark on right */}
      <circle cx="25" cy="18" r="2.5" fill={circleFill} />
      <circle cx="25" cy="18" r="5" stroke={circleStroke} strokeWidth="1" strokeOpacity="0.5" fill="none" />
    </svg>
  );
}

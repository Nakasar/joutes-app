export function IcyStalagmites({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 320"
      className={className}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillOpacity="0.8"
        d="M0,0 L0,100 L40,40 L80,120 L120,30 L160,140 L200,50 L240,110 L280,20 L320,130 L360,40 L400,100 L440,10 L480,150 L520,60 L560,120 L600,30 L640,140 L680,50 L720,110 L760,20 L800,130 L840,40 L880,100 L920,10 L960,150 L1000,60 L1040,120 L1080,30 L1120,140 L1160,50 L1200,110 L1240,20 L1280,130 L1320,40 L1360,100 L1400,10 L1440,150 L1440,0 Z"
      />
    </svg>
  );
}

export function SnowPile({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 320"
      className={className}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        fillOpacity="0.9"
        d="M0,320L48,288C96,256,192,192,288,197.3C384,203,480,277,576,288C672,299,768,245,864,218.7C960,192,1056,192,1152,208C1248,224,1344,256,1392,272L1440,288L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
      />
    </svg>
  );
}

export function Garland({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 100"
      className={className}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        d="M0,0 Q120,80 240,0 T480,0 T720,0 T960,0 T1200,0 T1440,0"
      />
      {/* Decorations on the garland */}
      <circle cx="120" cy="40" r="8" fill="#d32f2f" />
      <circle cx="360" cy="40" r="8" fill="#388e3c" />
      <circle cx="600" cy="40" r="8" fill="#fbc02d" />
      <circle cx="840" cy="40" r="8" fill="#d32f2f" />
      <circle cx="1080" cy="40" r="8" fill="#388e3c" />
      <circle cx="1320" cy="40" r="8" fill="#fbc02d" />
    </svg>
  );
}

export function LightGarland({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 100"
      className={className}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="none"
        stroke="#555"
        strokeWidth="2"
        d="M0,0 Q120,100 240,0 T480,0 T720,0 T960,0 T1200,0 T1440,0"
      />
      {/* Lights */}
      <g className="animate-pulse">
        <circle cx="60" cy="35" r="6" fill="#ffeb3b" className="light-glow-yellow" />
        <circle cx="180" cy="35" r="6" fill="#f44336" className="light-glow-red" />
        <circle cx="300" cy="35" r="6" fill="#2196f3" className="light-glow-blue" />
        <circle cx="420" cy="35" r="6" fill="#4caf50" className="light-glow-green" />
        <circle cx="540" cy="35" r="6" fill="#ffeb3b" className="light-glow-yellow" />
        <circle cx="660" cy="35" r="6" fill="#f44336" className="light-glow-red" />
        <circle cx="780" cy="35" r="6" fill="#2196f3" className="light-glow-blue" />
        <circle cx="900" cy="35" r="6" fill="#4caf50" className="light-glow-green" />
        <circle cx="1020" cy="35" r="6" fill="#ffeb3b" className="light-glow-yellow" />
        <circle cx="1140" cy="35" r="6" fill="#f44336" className="light-glow-red" />
        <circle cx="1260" cy="35" r="6" fill="#2196f3" className="light-glow-blue" />
        <circle cx="1380" cy="35" r="6" fill="#4caf50" className="light-glow-green" />
      </g>
    </svg>
  );
}


'use client';

import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  animationDuration: number;
  animationDelay: number;
  fontSize: number;
  opacity: number;
}

export default function WinterDecorations() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Vérifier la préférence de mouvement réduit
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    // Créer moins de flocons sur mobile, aucun si mouvement réduit
    const isMobile = window.innerWidth < 768;
    const snowflakeCount = prefersReducedMotion ? 0 : (isMobile ? 20 : 50);

    const flakes: Snowflake[] = [];
    for (let i = 0; i < snowflakeCount; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        animationDuration: 10 + Math.random() * 20, // 10-30s
        animationDelay: Math.random() * 5, // 0-5s
        fontSize: 10 + Math.random() * 20, // 10-30px
        opacity: 0.3 + Math.random() * 0.7, // 0.3-1
      });
    }
    setSnowflakes(flakes);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [prefersReducedMotion]);

  return (
    <>
      {/* Flocons de neige tombants */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
        {snowflakes.map((flake) => (
          <div
            key={flake.id}
            className="absolute animate-snow"
            style={{
              left: `${flake.left}%`,
              animationDuration: `${flake.animationDuration}s`,
              animationDelay: `${flake.animationDelay}s`,
              fontSize: `${flake.fontSize}px`,
              opacity: flake.opacity,
              top: '-5%',
            }}
          >
            ❄️
          </div>
        ))}
      </div>

      {/* Décorations de Noël dans les coins */}
      <div className="fixed top-4 left-4 pointer-events-none z-40 hidden md:block">
        <div className="text-4xl winter-sparkle">🎄</div>
      </div>

      <div className="fixed top-4 right-4 pointer-events-none z-40 hidden md:block">
        <div className="text-4xl winter-sparkle" style={{ animationDelay: '0.5s' }}>⭐</div>
      </div>

      <div className="fixed bottom-20 left-4 pointer-events-none z-40 hidden md:block">
        <div className="text-3xl winter-sparkle" style={{ animationDelay: '1s' }}>🎁</div>
      </div>

      <div className="fixed bottom-20 right-4 pointer-events-none z-40 hidden md:block">
        <div className="text-3xl winter-sparkle" style={{ animationDelay: '1.5s' }}>🔔</div>
      </div>

      {/* Guirlande en haut de la page */}
      <div className="fixed top-0 left-0 right-0 pointer-events-none z-40 hidden lg:block">
        <div className="flex justify-around text-2xl py-2 bg-gradient-to-b from-background/80 to-transparent">
          <span className="winter-sparkle">🎄</span>
          <span className="winter-sparkle" style={{ animationDelay: '0.3s' }}>⭐</span>
          <span className="winter-sparkle" style={{ animationDelay: '0.6s' }}>🎁</span>
          <span className="winter-sparkle" style={{ animationDelay: '0.9s' }}>🔔</span>
          <span className="winter-sparkle" style={{ animationDelay: '1.2s' }}>❄️</span>
          <span className="winter-sparkle" style={{ animationDelay: '1.5s' }}>🎅</span>
          <span className="winter-sparkle" style={{ animationDelay: '1.8s' }}>⛄</span>
          <span className="winter-sparkle" style={{ animationDelay: '2.1s' }}>🎄</span>
        </div>
      </div>

      {/* Styles pour l'animation de chute de neige */}
      <style jsx>{`
        @keyframes snow {
          0% {
            transform: translateY(-5vh) translateX(0) rotate(0deg);
          }
          100% {
            transform: translateY(105vh) translateX(100px) rotate(360deg);
          }
        }
        
        .animate-snow {
          animation-name: snow;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
        }
      `}</style>
    </>
  );
}


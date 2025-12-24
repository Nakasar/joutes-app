'use client';

import { useEffect, useState } from 'react';
import "@/app/winter-theme.css";
import { IcyStalagmites, SnowPile, LightGarland, Garland } from './WinterSVGs';

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
      {/* Icy Stalagmites at the top */}
      <div className="fixed top-0 left-0 right-0 pointer-events-none z-30 opacity-80 text-blue-300/80">
        <IcyStalagmites className="w-full h-24 md:h-32 lg:h-40" />
      </div>

      {/* Light Garland at the top */}
      <div className="fixed top-0 left-0 right-0 pointer-events-none z-40">
        <LightGarland className="w-full h-20 md:h-24" />
      </div>

      {/* Regular Garland slightly lower */}
      <div className="fixed top-12 left-0 right-0 pointer-events-none z-30 opacity-90 hidden lg:block">
        <Garland className="w-full h-16 md:h-20 text-green-800" />
      </div>

      {/* Snow Piles at the bottom */}
      <div className="fixed bottom-0 left-0 right-0 pointer-events-none z-30 text-white/80">
        <SnowPile className="w-full h-16 md:h-24 lg:h-32" />
      </div>

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
      <div className="fixed top-24 left-4 pointer-events-none z-40 hidden md:block">
        <div className="text-4xl winter-sparkle">🎄</div>
      </div>

      <div className="fixed top-24 right-4 pointer-events-none z-40 hidden md:block">
        <div className="text-4xl winter-sparkle" style={{ animationDelay: '0.5s' }}>⭐</div>
      </div>

      <div className="fixed bottom-24 left-4 pointer-events-none z-40 hidden md:block">
        <div className="text-3xl winter-sparkle" style={{ animationDelay: '1s' }}>🎁</div>
      </div>

      <div className="fixed bottom-24 right-4 pointer-events-none z-40 hidden md:block">
        <div className="text-3xl winter-sparkle" style={{ animationDelay: '1.5s' }}>🔔</div>
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


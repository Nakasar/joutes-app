import Link from 'next/link';
import { Snowflake, Gift, TreePine, Star, Bell } from 'lucide-react';

export default function WinterThemeDemoPage() {
  return (
    <div className="container mx-auto px-4 py-12 space-y-12">
      {/* En-tête */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold winter-sparkle">
          ❄️ Démo Thème Hivernal ❄️
        </h1>
        <p className="text-xl text-muted-foreground">
          Découvrez tous les éléments du thème festif de Joutes
        </p>
      </div>

      {/* Section Palette de couleurs */}
      <section className="frost-effect p-8 rounded-2xl space-y-6">
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <Snowflake className="winter-sparkle" />
          Palette de couleurs
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <div className="h-24 rounded-lg bg-primary"></div>
            <p className="text-sm text-center">Primary</p>
          </div>
          <div className="space-y-2">
            <div className="h-24 rounded-lg bg-secondary"></div>
            <p className="text-sm text-center">Secondary</p>
          </div>
          <div className="space-y-2">
            <div className="h-24 rounded-lg bg-accent"></div>
            <p className="text-sm text-center">Accent</p>
          </div>
          <div className="space-y-2">
            <div className="h-24 rounded-lg bg-muted"></div>
            <p className="text-sm text-center">Muted</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <div
              className="h-16 rounded-lg"
              style={{ backgroundColor: 'var(--christmas-red)' }}
            ></div>
            <p className="text-sm text-center">Rouge Noël</p>
          </div>
          <div className="space-y-2">
            <div
              className="h-16 rounded-lg"
              style={{ backgroundColor: 'var(--christmas-green)' }}
            ></div>
            <p className="text-sm text-center">Vert Noël</p>
          </div>
          <div className="space-y-2">
            <div
              className="h-16 rounded-lg"
              style={{ backgroundColor: 'var(--christmas-gold)' }}
            ></div>
            <p className="text-sm text-center">Or Noël</p>
          </div>
        </div>
      </section>

      {/* Section Cartes */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <TreePine className="winter-sparkle" />
          Cartes avec effets
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="frost-effect p-6 rounded-xl winter-hover space-y-2">
            <Gift className="w-8 h-8 mb-2" style={{ color: 'var(--christmas-red)' }} />
            <h3 className="text-xl font-semibold">Événements</h3>
            <p className="text-muted-foreground">
              Découvrez les événements festifs près de chez vous
            </p>
          </div>

          <div className="frost-effect p-6 rounded-xl winter-hover space-y-2">
            <Star className="w-8 h-8 mb-2 winter-sparkle" style={{ color: 'var(--christmas-gold)' }} />
            <h3 className="text-xl font-semibold">Ligues</h3>
            <p className="text-muted-foreground">
              Rejoignez une ligue et défiez d'autres joueurs
            </p>
          </div>

          <div className="frost-effect p-6 rounded-xl winter-hover space-y-2">
            <Bell className="w-8 h-8 mb-2 winter-sparkle" style={{ color: 'var(--christmas-green)' }} />
            <h3 className="text-xl font-semibold">Lairs</h3>
            <p className="text-muted-foreground">
              Trouvez un lieu de jeu accueillant
            </p>
          </div>
        </div>
      </section>

      {/* Section Boutons */}
      <section className="frost-effect p-8 rounded-2xl space-y-6">
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <Gift className="winter-sparkle" />
          Boutons et interactions
        </h2>

        <div className="flex flex-wrap gap-4">
          <button className="bg-primary text-primary-foreground px-6 py-3 rounded-lg winter-hover">
            Bouton Primary
          </button>

          <button className="bg-secondary text-secondary-foreground px-6 py-3 rounded-lg winter-hover">
            Bouton Secondary
          </button>

          <button
            className="px-6 py-3 rounded-lg winter-sparkle winter-hover"
            style={{
              backgroundColor: 'var(--christmas-red)',
              color: 'white'
            }}
          >
            🎄 Bouton Festif
          </button>

          <button className="bg-accent text-accent-foreground px-6 py-3 rounded-lg winter-hover">
            Bouton Accent
          </button>
        </div>
      </section>

      {/* Section Badges */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold flex items-center gap-2">
          <Star className="winter-sparkle" />
          Badges et étiquettes
        </h2>

        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-primary text-primary-foreground winter-sparkle">
            ❄️ Nouveau
          </span>

          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm winter-sparkle"
            style={{ backgroundColor: 'var(--christmas-red)', color: 'white' }}
          >
            🎁 Événement spécial
          </span>

          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm winter-sparkle"
            style={{ backgroundColor: 'var(--christmas-green)', color: 'white' }}
          >
            🎄 Saison festive
          </span>

          <span
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm winter-sparkle"
            style={{ backgroundColor: 'var(--christmas-gold)', color: 'white' }}
          >
            ⭐ Premium
          </span>
        </div>
      </section>

      {/* Section Liste */}
      <section className="frost-effect p-8 rounded-2xl space-y-6">
        <h2 className="text-3xl font-bold">Liste d'éléments</h2>

        <div className="space-y-3">
          {[
            { icon: '🎄', title: 'Tournoi de Noël', date: '24 décembre' },
            { icon: '⛄', title: 'Soirée jeux d\'hiver', date: '26 décembre' },
            { icon: '🎁', title: 'Championnat festif', date: '31 décembre' },
            { icon: '⭐', title: 'Nouvelle année gaming', date: '1 janvier' },
          ].map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/50 winter-hover"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl winter-sparkle">{item.icon}</span>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.date}</p>
                </div>
              </div>
              <button className="text-primary hover:text-primary/80">
                Voir →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section Retour */}
      <div className="text-center pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-primary hover:text-primary/80 text-lg"
        >
          ← Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}


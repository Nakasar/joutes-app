import { cn } from '@/lib/utils';
import { winterClasses, isWinterTheme, type WinterThemeProps } from '@/lib/utils/winter-theme';

interface WinterCardProps extends WinterThemeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Carte avec effets hivernaux automatiques si le thème est activé
 */
export function WinterCard({
  children,
  className,
  frost = true,
  sparkle = false,
  winterHover = true,
}: WinterCardProps) {
  const winterEnabled = isWinterTheme();

  return (
    <div
      className={cn(
        'rounded-xl p-6',
        winterEnabled && frost && winterClasses.frost,
        winterEnabled && sparkle && winterClasses.sparkle,
        winterEnabled && winterHover && winterClasses.hover,
        className
      )}
    >
      {children}
    </div>
  );
}

interface WinterButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, WinterThemeProps {
  variant?: 'primary' | 'secondary' | 'festive';
  children: React.ReactNode;
}

/**
 * Bouton avec effets hivernaux
 */
export function WinterButton({
  variant = 'primary',
  children,
  className,
  winterHover = true,
  sparkle = false,
  ...props
}: WinterButtonProps) {
  const winterEnabled = isWinterTheme();

  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg transition-all',
        variant === 'primary' && 'bg-primary text-primary-foreground',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground',
        winterEnabled && winterHover && winterClasses.hover,
        winterEnabled && sparkle && winterClasses.sparkle,
        className
      )}
      style={
        winterEnabled && variant === 'festive'
          ? { backgroundColor: 'var(--christmas-red)', color: 'white' }
          : undefined
      }
      {...props}
    >
      {children}
    </button>
  );
}

interface WinterBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'christmas-red' | 'christmas-green' | 'christmas-gold';
  className?: string;
}

/**
 * Badge avec couleurs festives
 */
export function WinterBadge({
  children,
  variant = 'default',
  className
}: WinterBadgeProps) {
  const winterEnabled = isWinterTheme();

  const getVariantStyle = () => {
    if (!winterEnabled || variant === 'default') {
      return 'bg-primary text-primary-foreground';
    }
    return '';
  };

  const getCustomStyle = () => {
    if (!winterEnabled || variant === 'default') return undefined;

    switch (variant) {
      case 'christmas-red':
        return { backgroundColor: 'var(--christmas-red)', color: 'white' };
      case 'christmas-green':
        return { backgroundColor: 'var(--christmas-green)', color: 'white' };
      case 'christmas-gold':
        return { backgroundColor: 'var(--christmas-gold)', color: 'white' };
      default:
        return undefined;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm',
        winterEnabled && winterClasses.sparkle,
        getVariantStyle(),
        className
      )}
      style={getCustomStyle()}
    >
      {children}
    </span>
  );
}

interface WinterHeadingProps {
  children: React.ReactNode;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  emoji?: string;
  className?: string;
}

/**
 * Titre avec emoji hivernal optionnel
 */
export function WinterHeading({
  children,
  level = 1,
  emoji,
  className
}: WinterHeadingProps) {
  const winterEnabled = isWinterTheme();

  const baseClasses = cn(
    'font-bold',
    winterEnabled && winterClasses.sparkle,
    className
  );

  const content = (
    <>
      {winterEnabled && emoji && <span>{emoji} </span>}
      {children}
    </>
  );

  switch (level) {
    case 1:
      return <h1 className={cn('text-4xl', baseClasses)}>{content}</h1>;
    case 2:
      return <h2 className={cn('text-3xl', baseClasses)}>{content}</h2>;
    case 3:
      return <h3 className={cn('text-2xl', baseClasses)}>{content}</h3>;
    case 4:
      return <h4 className={cn('text-xl', baseClasses)}>{content}</h4>;
    case 5:
      return <h5 className={cn('text-lg', baseClasses)}>{content}</h5>;
    case 6:
      return <h6 className={cn('text-base', baseClasses)}>{content}</h6>;
    default:
      return <h1 className={cn('text-4xl', baseClasses)}>{content}</h1>;
  }
}

interface WinterSectionProps {
  children: React.ReactNode;
  title?: string;
  titleEmoji?: string;
  className?: string;
}

/**
 * Section complète avec effets hivernaux
 */
export function WinterSection({
  children,
  title,
  titleEmoji = '❄️',
  className
}: WinterSectionProps) {
  const winterEnabled = isWinterTheme();

  return (
    <section
      className={cn(
        'p-8 rounded-2xl',
        winterEnabled && winterClasses.frost,
        className
      )}
    >
      {title && (
        <WinterHeading level={2} emoji={titleEmoji} className="mb-6">
          {title}
        </WinterHeading>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </section>
  );
}


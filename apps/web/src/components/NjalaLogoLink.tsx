import { Link } from 'react-router-dom';

interface NjalaLogoLinkProps {
  to?: string;
  compact?: boolean;
  className?: string;
}

export function NjalaLogoLink({ to = '/', compact = false, className = '' }: NjalaLogoLinkProps): JSX.Element {
  return (
    <Link
      to={to}
      aria-label="Njala Past Papers home"
      className={`inline-flex min-w-0 items-center gap-2 rounded-md text-lg font-bold text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600 ${className}`}
    >
      <img
        src="/njala-logo.png"
        width="32"
        height="32"
        alt="Njala University crest"
        className="h-8 w-8 shrink-0 object-contain"
      />
      <span className={`${compact ? 'hidden min-[390px]:inline' : 'inline'} truncate`}>
        Njala Past Papers
      </span>
    </Link>
  );
}

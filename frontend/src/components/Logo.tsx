/** The Crawlspace mark: a miniature of the app's own site-structure tree — a root page on the left,
 *  branches curving out to the pages it links to. Two leaves are found pages (solid); the hollow one
 *  is the gap a crawl exists to catch. Colours come from the theme, so it follows the palette.
 *  (public/favicon.svg is the same drawing with the palette's hex values baked in.) */
export default function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`logo ${className}`} width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Crawlspace">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <g fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round">
        <path d="M11.6 16H21" />
        <path d="M11.6 16C16 16 16.4 8.5 21 8.5" />
        <path d="M11.6 16C16 16 16.4 23.5 21 23.5" />
        <circle cx="9" cy="16" r="2.6" />
        <circle cx="23" cy="23.5" r="1.9" strokeWidth="1.6" />
      </g>
      <g fill="var(--on-accent)">
        <circle cx="23" cy="8.5" r="1.9" />
        <circle cx="23" cy="16" r="1.9" />
      </g>
    </svg>
  );
}

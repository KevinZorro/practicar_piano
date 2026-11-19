import { STAGE_COLORS } from '../render/notePalette';

/**
 * The mark: the C, E and G of the first chord falling onto the hit line, in their note colours.
 * The same drawing is the favicon (public/favicon.svg).
 */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#18120f" />
      <rect x="6" y="9" width="5.5" height="14" rx="1.8" fill={STAGE_COLORS.C} />
      <rect x="13.25" y="13" width="5.5" height="7.5" rx="1.8" fill={STAGE_COLORS.E} />
      <rect x="20.5" y="4.5" width="5.5" height="11" rx="1.8" fill={STAGE_COLORS.G} />
      <rect x="4.5" y="24.5" width="23" height="2.5" rx="1.25" fill="#f1e7d2" />
    </svg>
  );
}

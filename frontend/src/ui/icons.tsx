import type { ReactNode } from 'react';

/** One drawn icon set: 24 px grid, 1.75 stroke, round joins. Media icons are solid. */
function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon>
    <path
      d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7Z"
      fill="currentColor"
    />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" />
  </Icon>
);

export const RestartIcon = () => (
  <Icon>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
    <path d="M4.5 4.5v4h4" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M14.5 6 8.5 12l6 6" />
  </Icon>
);

export const BookIcon = () => (
  <Icon>
    <path d="M12 7.2c-1.7-1.4-4.2-2-7.5-1.7v12.8c3.3-.3 5.8.3 7.5 1.7 1.7-1.4 4.2-2 7.5-1.7V5.5c-3.3-.3-5.8.3-7.5 1.7Z" />
    <path d="M12 7.2V20" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5.5v13M5.5 12h13" />
  </Icon>
);

export const MinusIcon = () => (
  <Icon>
    <path d="M5.5 12h13" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M14.8 5.6 18.4 9.2M5 19l1-4.2 9.9-9.9a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L9.2 18Z" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M5 7h14M10 7V5.5h4V7M7 7l.8 11.2a1.5 1.5 0 0 0 1.5 1.3h5.4a1.5 1.5 0 0 0 1.5-1.3L17 7" />
  </Icon>
);

export const KeysIcon = () => (
  <Icon>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
    <path d="M9.2 18.5v-5M14.8 18.5v-5" />
    <path d="M7.4 5.5v8h3.6v-8M13 5.5v8h3.6v-8" fill="currentColor" />
  </Icon>
);

export const MicIcon = () => (
  <Icon>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.8 11.5a6.2 6.2 0 0 0 12.4 0M12 17.7v2.8" />
  </Icon>
);

export const InfoIcon = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.2M12 7.8v.1" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon size={18}>
    <path d="M12 4.5 20 19H4Z" />
    <path d="M12 10v4M12 16.6v.1" />
  </Icon>
);

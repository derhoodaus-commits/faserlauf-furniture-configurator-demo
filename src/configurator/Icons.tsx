// Line icons drawn for this project in a "workshop drawing" style (1.5 px strokes, no fills).
import type { EdgeProfile, LegStyle, ProductId } from '../lib/types.ts';

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

export function ProductIcon({ id, size = 40, className }: IconProps & { id: ProductId }) {
  const p = { ...base(size), className };
  switch (id) {
    case 'dining-table':
      return (
        <svg {...p}>
          <path d="M5 18h38v3H5z" />
          <path d="M9 21l1 19M39 21l-1 19M10 21h28v4H10" />
        </svg>
      );
    case 'coffee-table':
      return (
        <svg {...p}>
          <path d="M6 24h36v3H6z" />
          <path d="M10 27v12M38 27v12M10 34h28" />
        </svg>
      );
    case 'bookcase':
      return (
        <svg {...p}>
          <path d="M12 6h24v36H12z" />
          <path d="M12 14h24M12 22h24M12 30h24M14 42v-3h20v3" />
          <path d="M16 13V9M18.5 13V8.5M21 13V10" />
        </svg>
      );
    case 'bench':
      return (
        <svg {...p}>
          <path d="M5 26h38v4H5z" />
          <path d="M9 30l1 10M39 30l-1 10M10 30h28v3H10" />
        </svg>
      );
    case 'desk':
      return (
        <svg {...p}>
          <path d="M5 18h38v3H5z" />
          <path d="M8 21v19M40 21v19M8 21h32v7H8" />
          <path d="M28 21v7M32 24.5h4" />
        </svg>
      );
  }
}

export function LegIcon({ id, size = 36, className }: IconProps & { id: LegStyle }) {
  const p = { ...base(size), className };
  switch (id) {
    case 'tapered':
      return (
        <svg {...p}>
          <path d="M5 14h38v3H5zM9 17h30v4H9" />
          <path d="M8 17l2 23h2l1-23M40 17l-2 23h-2l-1-23" />
        </svg>
      );
    case 'square':
      return (
        <svg {...p}>
          <path d="M5 14h38v3H5zM9 17h30v4H9" />
          <path d="M8 17h4v23H8zM36 17h4v23h-4z" />
        </svg>
      );
    case 'trestle':
      return (
        <svg {...p}>
          <path d="M5 14h38v3H5z" />
          <path d="M11 17h6M31 17h6M13 17v21M15 17v21M33 17v21M35 17v21M9 38h10M29 38h10M15 28h18" />
        </svg>
      );
    case 'panel':
      return (
        <svg {...p}>
          <path d="M5 14h38v3H5z" />
          <path d="M9 17h4v23H9zM35 17h4v23h-4zM13 19h22" />
        </svg>
      );
    case 'plinth':
      return (
        <svg {...p}>
          <path d="M12 6h24v32H12zM12 14h24M12 22h24M12 30h24" />
          <path d="M15 38v4h18v-4" />
        </svg>
      );
    case 'feet':
      return (
        <svg {...p}>
          <path d="M12 6h24v30H12zM12 14h24M12 22h24M12 29h24" />
          <path d="M13 36l1 6h1.5l1-6M35 36l-1 6h-1.5l-1-6" />
        </svg>
      );
  }
}

/** Edge profiles shown as cross-sections of the board edge. */
export function EdgeIcon({ id, size = 36, className }: IconProps & { id: EdgeProfile }) {
  const p = { ...base(size), className };
  const paths: Record<EdgeProfile, string> = {
    eased: 'M4 17h31l1 1v12l-1 1H4',
    rounded: 'M4 17h26a8 8 0 0 1 8 8v5l-1 1H4',
    chamfer: 'M4 17h28l6 6v7l-1 1H4',
    undercut: 'M4 17h33l1 1v5L24 31H4',
  };
  return (
    <svg {...p}>
      <path d={paths[id]} />
      <path d="M4 17v14" strokeDasharray="2 3" opacity="0.5" />
    </svg>
  );
}

const ui: Record<string, string> = {
  rotateLeft: 'M14 20a12 12 0 1 1 3 13M14 11v9h9',
  rotateRight: 'M34 20a12 12 0 1 0-3 13M34 11v9h-9',
  zoomIn: 'M21 33a12 12 0 1 0 0-24 12 12 0 0 0 0 24zM30 30l10 10M15 21h12M21 15v12',
  zoomOut: 'M21 33a12 12 0 1 0 0-24 12 12 0 0 0 0 24zM30 30l10 10M15 21h12',
  reset: 'M24 8v6M24 34v6M8 24h6M34 24h6M24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  ruler: 'M6 30L30 6l12 12-24 24zM12 24l4 4M17 19l3 3M22 14l4 4M27 9l3 3',
  person: 'M24 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 19h14l-2 12h-3l-1 11h-2l-1-11h-3z',
  room: 'M6 40V12l14-6v34M20 6h22v28H20M6 40l14-6M20 34h22',
  camera: 'M8 16h8l3-5h10l3 5h8v22H8zM24 33a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  link: 'M21 27a7 7 0 0 0 10 0l6-6a7 7 0 0 0-10-10l-2 2M27 21a7 7 0 0 0-10 0l-6 6a7 7 0 0 0 10 10l2-2',
  pdf: 'M12 6h17l9 9v27H12zM29 6v9h9M17 26h14M17 32h14M17 20h6',
  cube: 'M24 6l16 9v18l-16 9-16-9V15zM8 15l16 9 16-9M24 24v18',
  compare: 'M6 12h15v26H6zM27 12h15v26H27zM21 25h6',
  close: 'M12 12l24 24M36 12L12 36',
  check: 'M10 25l9 9 19-20',
  warning: 'M24 7l19 33H5zM24 19v10M24 34v1',
  info: 'M24 42a18 18 0 1 0 0-36 18 18 0 0 0 0 36zM24 21v12M24 15v1',
  arrowRight: 'M8 24h30M28 14l10 10-10 10',
  swap: 'M8 16h30l-7-7M40 32H10l7 7',
  views: 'M24 10l14 8-14 8-14-8zM10 26l14 8 14-8M10 32l14 8 14-8',
};

export function UiIcon({ name, size = 22, className }: IconProps & { name: keyof typeof ui }) {
  return (
    <svg {...base(size)} strokeWidth={2.6} className={className}>
      <path d={ui[name]} />
    </svg>
  );
}

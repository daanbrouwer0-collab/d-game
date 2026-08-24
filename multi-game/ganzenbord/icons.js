/**
 * Small inline SVG icons for special board squares.
 * @param {string} id
 * @returns {string}
 */
export function squareIconSvg(id) {
  const common =
    'class="goose-icon-svg" viewBox="0 0 24 24" aria-hidden="true" width="100%" height="100%"';
  switch (id) {
    case "bankje":
      // Park bench
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14h16"/>
        <path d="M5 14v4M19 14v4"/>
        <path d="M3 10h18v4H3z"/>
        <path d="M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>
      </svg>`;
    case "bridge":
      // Arch bridge + down cue
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 14c2-4 4-6 9-6s7 2 9 6"/>
        <path d="M3 14h18"/>
        <path d="M7 14v3M12 14v3M17 14v3"/>
        <path d="M12 18v3M10 19.5l2 1.5 2-1.5"/>
      </svg>`;
    case "deka":
      // Folded blanket / duvet
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 8h14v10H5z"/>
        <path d="M5 12h14"/>
        <path d="M8 8V6.5A1.5 1.5 0 0 1 9.5 5h5A1.5 1.5 0 0 1 16 6.5V8"/>
        <path d="M9 15h6"/>
      </svg>`;
    case "sloot":
      // Water ditch with waves
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8h18"/>
        <path d="M4 8v8M20 8v8"/>
        <path d="M3 16h18"/>
        <path d="M6 11c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0"/>
        <path d="M6 13.5c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0"/>
      </svg>`;
    case "park":
      // Tree
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20v-6"/>
        <path d="M8 20h8"/>
        <path d="M12 4c-3.2 0-5.5 2.4-5.5 5.2 0 1.6.7 3 1.8 3.9H7.5C6.1 13.1 5 14.3 5 15.8 5 17.5 6.4 19 8.2 19h7.6c1.8 0 3.2-1.5 3.2-3.2 0-1.5-1.1-2.7-2.5-2.7h-.8c1.1-.9 1.8-2.3 1.8-3.9C17.5 6.4 15.2 4 12 4z"/>
      </svg>`;
    case "prison":
      // Jail bars
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="1.5"/>
        <path d="M9 4v16M15 4v16"/>
        <path d="M4 9h16M4 15h16"/>
      </svg>`;
    case "knockout":
      // Star burst / KO
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>
        <path d="M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M16.3 5.6l2.1-2.1M5.6 18.4l2.1-2.1"/>
        <circle cx="12" cy="12" r="3.5"/>
      </svg>`;
    case "start":
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 19V6l10 2v9"/>
        <path d="M5 19h4"/>
        <circle cx="16.5" cy="17.5" r="2.5"/>
      </svg>`;
    case "finish":
      return `<svg ${common} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 20V5"/>
        <path d="M5 5h11l-2 3 2 3H5"/>
        <path d="M14 20l2-4 2 4h-4z"/>
      </svg>`;
    default:
      return "";
  }
}

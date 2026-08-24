/** Gedeelde SVG-icoontjes voor upgrades (statusbalk + uitleg). */
const UpgradeIcons = {
  get(upgradeId) {
    const common = 'viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    switch (upgradeId) {
      case 'rearLaser':
        return `<svg ${common} stroke-width="2"><path d="M9 7 L15 12 L9 17 Z" fill="currentColor" stroke="none"/><path d="M9 12 H3"/><path d="M3 12 L5.5 9.5 M3 12 L5.5 14.5"/></svg>`;
      case 'doubleLaser':
        return `<svg ${common} stroke-width="2"><path d="M3 7 H17 M14 4.5 L18 7 L14 9.5"/><path d="M3 17 H17 M14 14.5 L18 17 L14 19.5"/></svg>`;
      case 'deflectorShield':
        return `<svg ${common} stroke-width="2"><path d="M12 3 L19 6 V12 C19 16.5 15.5 19.5 12 21 C8.5 19.5 5 16.5 5 12 V6 Z" fill="currentColor" fill-opacity="0.2"/><path d="M2 10 H7 M7 10 L5 7.5 M7 10 L5 12.5"/><path d="M14 9 L17 12 L14 15" stroke-width="2.2"/></svg>`;
      case 'ablativeArmor':
        return `<svg ${common} stroke-width="2"><rect x="8" y="4" width="8" height="16" rx="1.5" fill="currentColor" fill-opacity="0.25"/><path d="M8 4 V20 M16 4 V20" stroke-width="2.4"/><path d="M2 12 H8"/><circle cx="3.5" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`;
      case 'memoryBank':
        return `<svg ${common} stroke-width="2"><rect x="5" y="4" width="10" height="14" rx="1.5" fill="currentColor" fill-opacity="0.15"/><rect x="8" y="6" width="10" height="14" rx="1.5"/><path d="M11 11 H15 M13 9 V13" stroke-width="2.2"/></svg>`;
      case 'repairKit':
        return `<svg ${common} stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" fill-opacity="0.15"/><path d="M12 6 V18 M6 12 H18" stroke-width="3"/></svg>`;
      case 'conveyorClaws':
        return `<svg ${common} stroke-width="2"><path d="M2 11 H14"/><path d="M4 11 L6 8 M8 11 L10 8 M12 11 L14 8"/><path d="M15 7 L21 11 L15 15 Z" fill="currentColor" stroke="none"/><path d="M4 17 H12" stroke-width="2.2"/><path d="M6 15 L4 17 L6 19"/></svg>`;
      case 'gyroStabilizer':
        return `<svg ${common} stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 5 A7 7 0 0 1 19 12"/><path d="M17.2 9.2 L19.5 7.8 L19.8 10.8"/><path d="M5 19 L19 5" stroke-width="2.4"/></svg>`;
      case 'reinforcedHull':
        return `<svg ${common} stroke-width="2.4"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" fill-opacity="0.18"/><rect x="8" y="8" width="8" height="8" rx="1.5"/></svg>`;
      case 'softLanding':
        return `<svg ${common} stroke-width="2"><path d="M12 3 C7 3 4 7 4 10 C4 10 8 9 12 9 C16 9 20 10 20 10 C20 7 17 3 12 3 Z" fill="currentColor" fill-opacity="0.2"/><path d="M12 9 V16"/><path d="M8 20 H16"/><path d="M9 16 L12 20 L15 16"/></svg>`;
      case 'fourthGear':
        return `<svg ${common} stroke-width="2.2"><path d="M2 12 H16"/><path d="M12 7 L18 12 L12 17"/><path d="M2 8 V16" opacity="0.45"/><path d="M5 8 V16" opacity="0.45"/><path d="M8 8 V16" opacity="0.45"/></svg>`;
      case 'crabWalk':
        return `<svg ${common} stroke-width="2"><path d="M12 7 V17"/><path d="M4 12 H9 M6.5 9.5 L4 12 L6.5 14.5"/><path d="M15 12 H20 M17.5 9.5 L20 12 L17.5 14.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/></svg>`;
      case 'reverseThruster':
        return `<svg ${common} stroke-width="2"><path d="M12 3 V13"/><path d="M8 9 L12 14 L16 9"/><path d="M8 14 L12 19 L16 14"/></svg>`;
      case 'ghost':
        return `<svg ${common} stroke-width="2"><path d="M10 3 V21 M14 3 V21" opacity="0.55"/><path d="M10 7 H14 M10 12 H14 M10 17 H14" opacity="0.55"/><ellipse cx="12" cy="9" rx="4" ry="3.6" fill="currentColor" fill-opacity="0.25"/><path d="M8 9 C8 14 9.5 17 12 17 C14.5 17 16 14 16 9"/><circle cx="10.3" cy="8.5" r="1" fill="currentColor" stroke="none"/><circle cx="13.7" cy="8.5" r="1" fill="currentColor" stroke="none"/></svg>`;
      default:
        return `<svg ${common} stroke-width="2"><circle cx="12" cy="12" r="7"/></svg>`;
    }
  }
};

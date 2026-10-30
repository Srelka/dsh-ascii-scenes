const SCENE_ID = "claude-night";
const SCENE_IDS = [SCENE_ID, "cloud-drift", "honu-lagoon", "koi-pond", "jellyfish", "paper-boats", "fireflies", "moonlit"];
const STORAGE_KEY = "dsh-ascii-scenes:v1";
const DEFAULT_STATE = Object.freeze({ scene: "native", motion: true, previous: "system" });

function normalizeState(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE };
  return {
    scene: SCENE_IDS.includes(value.scene) ? value.scene : "native",
    motion: value.motion !== false,
    previous: ["light", "dark", "system"].includes(value.previous) ? value.previous : "system",
  };
}

const WARM_TOKENS = {
  "--dsw-alias-bg-base": "#171512",
  "--dsw-alias-bg-layer-1": "#24201c",
  "--dsw-alias-bg-layer-2": "#2c2723",
  "--dsw-alias-bg-layer-3": "#34302b",
  "--dsw-alias-bg-module-platform": "#27231f",
  "--dsw-alias-bg-overlay": "#27231f",
  "--dsw-alias-bg-skeleton": "#2c2723",
  "--dsw-specific-sidebar-fill": "#1d1916",
  "--dsw-specific-bubble": "#2c2620",
  "--dsw-specific-selector": "#302820",
  "--dsw-specific-menu": "#28231f",
  "--dsw-menu-surface-fill": "rgba(38,33,29,.97)",
  "--dsw-menu-backdrop-filter": "blur(20px)",
  "--dsw-alias-menu-group-header-fill": "#28231f",
  "--dsw-alias-settings-card-fill": "#24201c",
  "--dsw-alias-label-primary": "#eee9e1",
  "--dsw-alias-label-primary-bluish": "#eee9e1",
  "--dsw-alias-label-primary-dimmed": "#ddd5ca",
  "--dsw-alias-label-primary-foreground": "#fff5ea",
  "--dsw-alias-label-primary-inverted": "#1c1511",
  "--dsw-alias-label-secondary": "#c3b9ac",
  "--dsw-alias-label-tertiary": "#b4a698",
  "--dsw-alias-label-caption": "#a99b8e",
  "--dsw-alias-label-dimmed": "#8e8175",
  "--dsw-alias-label-deep-diving": "#d0a68b",
  "--dsw-alias-label-deep-diving-shimmer": "#f0c8ac",
  "--dsw-alias-menu-icon": "#c3b9ac",
  "--dsw-alias-brand-primary": "#dc9576",
  "--dsw-alias-brand-text": "#e2a083",
  "--dsw-alias-state-business-primary": "#dfa081",
  "--dsw-alias-state-business-tertiary": "#3b2b23",
  "--dsw-alias-border-l1": "#3c342c",
  "--dsw-alias-border-l2": "#463c33",
  "--dsw-alias-border-l3": "#4e4237",
  "--dsw-alias-border-l4": "#635244",
  "--dsw-alias-interactive-bg-hover": "rgba(228,183,146,.08)",
  "--dsw-alias-interactive-bg-hover-solid": "#302821",
  "--dsw-alias-interactive-bg-active": "#3a3028",
  "--dsw-alias-interactive-bg-hover-accent": "#3b2b23",
  "--dsw-alias-button-primary-fill": "#cd8768",
  "--dsw-alias-button-info-fill": "#bd7658",
  "--dsw-alias-button-info-hover": "#cf8b6b",
  "--dsw-alias-button-elevated-fill": "#302821",
  "--dsw-alias-button-floating-fill": "#302821",
  "--dsw-alias-button-tool-bar-fill": "#29231e",
  "--dsw-alias-button-contrast-fill": "#eee1cf",
  "--dsw-alias-markdown-code-block": "#201d19",
  "--dsw-alias-markdown-code-block-banner": "#2a241e",
  "--dsw-alias-markdown-inline-code": "#342a22",
  "--dsw-alias-scrollbar-bg-l1": "#56483b",
  "--dsw-alias-scrollbar-bg-l2": "#76604d",
  "--dsw-alias-toast-bg": "#342b23",
  "--dsw-alias-toast-label": "#f4e6d5",
};

// Source silhouette for the reference's irregular rays. The scene inverse-samples
// this mask onto a fixed character grid as the silhouette turns and flexes.
const STAR_ROWS = [
  "...........##....#........",
  "...........##...##........",
  ".##...###..##..###........",
  ".####..##..##.###.........",
  "...####.##.##.##..........",
  ".....##########..####....",
  ".......###########.......",
  "#########################",
  "###################......",
  ".......###########.......",
  "....###########..####....",
  "...###..##.##.##....####.",
  ".......##..##.##......#..",
  "......##...##..##........",
  "...........##...##.......",
  "...........#.............",
];
const STAR_CELL_ASPECT = 1.375;
const CLAWD_ROWS = [
  "..############..",
  "..#.########.#..",
  "..#.########.#..",
  "..############..",
  "################",
  "################",
  "..############..",
  "..############..",
  "..#.#......#.#..",
];

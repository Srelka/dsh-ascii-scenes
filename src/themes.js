function makeSceneTokens(c) {
  const tokens={};
  const alias=(names,value)=>{for(const name of names.split(' '))tokens['--dsw-alias-'+name]=value;};
  alias('bg-base',c.base);
  alias('bg-layer-1 bg-module-platform bg-overlay menu-group-header-fill settings-card-fill',c.surface);
  alias('bg-layer-2 bg-skeleton',c.raised);alias('bg-layer-3',c.selected);
  tokens['--dsw-specific-sidebar-fill']=c.sidebar;
  tokens['--dsw-specific-bubble']=c.raised;tokens['--dsw-specific-selector']=c.selected;
  tokens['--dsw-specific-menu']=c.surface;tokens['--dsw-menu-surface-fill']=c.surface;
  tokens['--dsw-menu-backdrop-filter']='blur(20px)';
  alias('label-primary label-primary-bluish',c.text);alias('label-primary-dimmed',c.secondary);
  alias('label-primary-foreground','#ffffff');alias('label-primary-inverted',c.base);
  alias('label-secondary menu-icon',c.secondary);alias('label-tertiary label-caption',c.tertiary);
  alias('label-dimmed',c.tertiary);alias('label-deep-diving',c.brandText);alias('label-deep-diving-shimmer',c.text);
  alias('brand-primary state-business-primary',c.brand);alias('brand-text',c.brandText);
  alias('state-business-tertiary interactive-bg-hover-accent',c.selected);
  alias('border-l1 border-l2 border-l3',c.border);alias('border-l4',c.secondary);
  alias('interactive-bg-hover interactive-bg-hover-solid',c.hover);alias('interactive-bg-active',c.selected);
  alias('button-primary-fill button-info-fill',c.brand);alias('button-info-hover',c.brandText);
  alias('button-elevated-fill button-floating-fill button-tool-bar-fill',c.raised);
  alias('button-contrast-fill',c.text);alias('markdown-code-block',c.code);
  alias('markdown-code-block-banner markdown-inline-code',c.raised);
  alias('scrollbar-bg-l1',c.border);alias('scrollbar-bg-l2',c.tertiary);
  alias('toast-bg',c.surface);alias('toast-label',c.text);
  return tokens;
}
const CLOUD_TOKENS=makeSceneTokens({
  "base": "#c6e7f6",
  "surface": "#edf8fc",
  "raised": "#dfeff7",
  "selected": "#c8e2ef",
  "sidebar": "#e9f8ff",
  "text": "#183449",
  "secondary": "#2c4d63",
  "tertiary": "#36566b",
  "brand": "#237799",
  "brandText": "#165c7a",
  "border": "#a1c7d9",
  "hover": "#d6eaf4",
  "code": "#e8f3f9"
});
const LAGOON_TOKENS=makeSceneTokens({
  "base": "#124b5a",
  "surface": "#123e50",
  "raised": "#1a5060",
  "selected": "#245b66",
  "sidebar": "#0c3744",
  "text": "#edf8ef",
  "secondary": "#c8e6df",
  "tertiary": "#c2e0d9",
  "brand": "#408c8c",
  "brandText": "#a4e1cc",
  "border": "#477981",
  "hover": "#235965",
  "code": "#103847"
});
const KOI_TOKENS=makeSceneTokens({
  "base": "#17483f",
  "surface": "#173e35",
  "raised": "#1e4c40",
  "selected": "#285b49",
  "sidebar": "#17463b",
  "text": "#edf4df",
  "secondary": "#c9dfc2",
  "tertiary": "#b6d1b0",
  "brand": "#599878",
  "brandText": "#c8e7ae",
  "border": "#547d60",
  "hover": "#2b5a46",
  "code": "#143a31"
});
const JELLYFISH_TOKENS=makeSceneTokens({
  "base": "#081b2d",
  "surface": "#102b40",
  "raised": "#183c54",
  "selected": "#24465f",
  "sidebar": "#081b2d",
  "text": "#e8f1f8",
  "secondary": "#bfd3e3",
  "tertiary": "#a5bed1",
  "brand": "#755188",
  "brandText": "#e6c1ef",
  "border": "#355770",
  "hover": "#20465f",
  "code": "#0b2032"
});
const PAPER_TOKENS=makeSceneTokens({
  "base": "#244f59",
  "surface": "#1d414b",
  "raised": "#2b5661",
  "selected": "#2b5661",
  "sidebar": "#13353f",
  "text": "#edf3e7",
  "secondary": "#d4e5de",
  "tertiary": "#c2dbd4",
  "brand": "#72b6af",
  "brandText": "#c4e8d6",
  "border": "#507b81",
  "hover": "#35636e",
  "code": "#183d47"
});
const FIREFLIES_TOKENS=makeSceneTokens({
  "base": "#081b1b",
  "surface": "#102820",
  "raised": "#183127",
  "selected": "#243c2b",
  "sidebar": "#081917",
  "text": "#dce7d9",
  "secondary": "#b9cbb8",
  "tertiary": "#a6bba2",
  "brand": "#637b42",
  "brandText": "#d3e477",
  "border": "#365143",
  "hover": "#243c2b",
  "code": "#0a1e19"
});
const MOON_TOKENS=makeSceneTokens({
  "base": "#0b1229",
  "surface": "#111930",
  "raised": "#1b2542",
  "selected": "#2a3658",
  "sidebar": "#0d142a",
  "text": "#e6eafa",
  "secondary": "#bfc9e3",
  "tertiary": "#a8b5d1",
  "brand": "#566da6",
  "brandText": "#cbd6fa",
  "border": "#3d4b70",
  "hover": "#243151",
  "code": "#0b1224"
});
const SCENES=[
  {id:SCENE_ID,label:'Claude · 暖夜',mode:'dark',tokens:WARM_TOKENS,renderer:createNightScene,companion:createClawd},
  {id:'cloud-drift',label:'蓝天 · 浮云',mode:'light',tokens:CLOUD_TOKENS,renderer:createCloudScene,companion:null},
  {id:'honu-lagoon',label:'海龟 · 潟湖',mode:'dark',tokens:LAGOON_TOKENS,renderer:createLagoonScene,companion:null},
  {id:'koi-pond',label:'池塘 · 锦鲤',mode:'dark',tokens:KOI_TOKENS,renderer:createKoiScene,companion:null},
  {id:'jellyfish',label:'深海 · 水母',mode:'dark',tokens:JELLYFISH_TOKENS,renderer:createJellyfishScene,companion:null},
  {id:'paper-boats',label:'水面 · 纸船',mode:'dark',tokens:PAPER_TOKENS,renderer:createPaperScene,companion:null},
  {id:'fireflies',label:'夏夜 · 萤火',mode:'dark',tokens:FIREFLIES_TOKENS,renderer:createFirefliesScene,companion:null},
  {id:'moonlit',label:'夜空 · 月色',mode:'dark',tokens:MOON_TOKENS,renderer:createMoonScene,companion:null},
];
function getScene(id) { return SCENES.find(scene=>scene.id===id); }

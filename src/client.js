const { useEffect, useRef, useState } = React;
const h = React.createElement;

function apply(ctx) {
  let state;
  try { state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { state = { ...DEFAULT_STATE }; }
  const listeners = new Set(), crabs = new Map();
  let backdrop = null;
  let tokenDispose = null, alive = true, changing = false, scanQueued = false;
  let activeTransition = null, pendingSelection = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const style = document.createElement("style"); style.dataset.plugin = "dsh-ascii-scenes"; style.textContent = STYLES; document.head.append(style);

  function persistState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (error) { console.warn("ASCII scenes: settings could not be saved", error); }
    scan();
    for (const listener of listeners) listener({ ...state });
  }
  function useSceneState() { const [value, setValue] = useState(() => ({ ...state })); useEffect(() => { listeners.add(setValue); return () => listeners.delete(setValue); }, []); return value; }

  function applyPalette() {
    changing = true;
    tokenDispose?.(); tokenDispose = null;
    const scene = getScene(state.scene);
    if (scene) {
      ctx.theme.setTheme(scene.mode);
      const tokens = Object.fromEntries(Object.entries(scene.tokens).map(([key, value]) => [key, { light: value, dark: value }]));
      tokenDispose = ctx.theme.overrideTokens("dsh-ascii-scenes", tokens);
      document.body.dataset.asciiScene = scene.id;
    } else delete document.body.dataset.asciiScene;
    changing = false;
  }

  function applySelection(scene) {
    if (!alive || scene === state.scene) return;
    const leaving = !!getScene(state.scene);
    if (!leaving && getScene(scene)) {
      const pref = ctx.theme.getTheme().preference;
      state.previous = ["light", "dark", "system"].includes(pref) ? pref : "system";
    }
    state.scene = getScene(scene) ? scene : "native";
    applyPalette();
    if (leaving && state.scene === "native") { changing = true; ctx.theme.setTheme(state.previous); changing = false; }
    persistState();
  }

  function clearTransition() {
    pendingSelection = null;
    const previous = activeTransition; activeTransition = null;
    previous?.animation?.cancel(); previous?.view?.skipTransition();
    delete document.documentElement.dataset.asciiTransition;
  }
  function finishTransition(current) {
    current.animation?.cancel();
    if (activeTransition !== current) return;
    activeTransition = null; delete document.documentElement.dataset.asciiTransition;
    const next = pendingSelection; pendingSelection = null;
    if (alive && next) select(next.scene, next.origin);
  }
  function select(scene, origin) {
    if (!alive) return;
    // Finish the current reveal before starting another snapshot. During a burst
    // retain only the latest request, including a click back on the current theme.
    if (activeTransition) { pendingSelection = {scene, origin}; return; }
    if (scene === state.scene) return;
    if (!state.motion || reduced.matches || document.hidden || !document.startViewTransition) {
      applySelection(scene); return;
    }
    const current = {view:null, animation:null}; activeTransition = current;
    document.documentElement.dataset.asciiTransition = "";
    try {
      current.view = document.startViewTransition(() => {
        if (alive && activeTransition === current) applySelection(scene);
      });
    } catch (error) {
      activeTransition = null; delete document.documentElement.dataset.asciiTransition;
      applySelection(scene); return;
    }
    current.view.ready.then(() => {
      if (!alive || activeTransition !== current) return;
      const x = origin?.x ?? innerWidth * .75, y = origin?.y ?? innerHeight * .75;
      const radius = Math.hypot(Math.max(x, innerWidth-x), Math.max(y, innerHeight-y));
      current.animation = document.documentElement.animate({clipPath:[
        `circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`,
      ]}, {duration:720, easing:"cubic-bezier(.2,.65,.15,1)", fill:"both", pseudoElement:"::view-transition-new(root)"});
    }).catch(() => {}); // Hidden documents and skipped transitions reject ready.
    current.view.finished.then(() => finishTransition(current), () => finishTransition(current));
  }
  function reduceTransition() { if (reduced.matches) activeTransition?.view?.skipTransition(); }
  reduced.addEventListener("change", reduceTransition);
  function toggleMotion() { state.motion = !state.motion; if(!state.motion)activeTransition?.view?.skipTransition(); persistState(); }

  function scan() {
    scanQueued = false; if (!alive) return;
    const selected = getScene(state.scene), enabled = !!selected;
    const shell = enabled ? findSceneShell() : null;
    if (backdrop && (!enabled || backdrop.scene !== state.scene || backdrop.frame !== shell)) { backdrop.dispose(); backdrop = null; }
    for (const [element, item] of crabs) {
      if (!selected?.companion || item.scene !== state.scene || !element.isConnected) { item.controller.dispose(); crabs.delete(element); }
    }
    if (!enabled) return;
    if (!backdrop && shell) backdrop = createSceneBackdrop(shell, selected, state.motion);
    else backdrop?.refresh(state.motion);
    // A companion belongs to its scene. Future scenes must opt into their own
    // renderer rather than inheriting Claude's Clawd automatically.
    const companion = selected.companion;
    if (!companion) return;
    for (const element of document.querySelectorAll('[data-composer-card]')) {
      let item = crabs.get(element);
      if (!item) {
        const stage = document.createElement("div"); stage.className = "ascii-clawd-stage";
        const territory=element.closest('[data-conversation-content]');if(!territory)continue;
        territory.append(stage);
        item = { scene:state.scene, controller: companion(stage, element, state.motion), motion: state.motion }; crabs.set(element, item);
      } else if (item.motion !== state.motion) { item.controller.update(state.motion); item.motion = state.motion; }
      item.controller.layout();
    }
  }
  const observer = new MutationObserver(records => {
    if (records.every(r => r.target instanceof Element && r.target.closest('.ascii-scene-layer,.ascii-clawd-stage,.ascii-picker,.ascii-transition'))) return;
    if (!scanQueued) { scanQueued = true; queueMicrotask(scan); }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-content-phase"] });

  function Preview({scene}) {
    const ref = useRef(null);
    useEffect(() => { const renderer = scene.renderer(ref.current, { motion: false, preview: true }); return () => renderer.dispose(); }, [scene.id]);
    return h("canvas", { ref, "aria-hidden": true });
  }
  function Picker() {
    const value = useSceneState();
    return h("div", { className: "ascii-picker" },
      h("div", { className: "ascii-themes" },
        ...[{ id: "native", label: "原生外观" }, ...SCENES].map(item => h("button", {
          type: "button", key: item.id, className: "ascii-theme-card", "aria-pressed": value.scene === item.id,
          onClick: event => select(item.id, {x:event.clientX,y:event.clientY}),
        }, h("div", { className: `ascii-thumb${item.id === "native" ? " ascii-thumb-native" : ""}` }, item.renderer ? h(Preview,{scene:item}) : null),
        h("span", { className: "ascii-theme-name" }, item.label, h("span", { className: "ascii-theme-check", "aria-hidden": true }, value.scene === item.id ? "✓" : ""))))),
      h("div", { className: "ascii-motion" }, h("span", null, "场景动画"), h("button", { type: "button", role: "switch", "aria-label": "场景动画", "aria-checked": value.motion, onClick: toggleMotion })),
    );
  }
  function SettingsRow() { return h("section", { className: "ascii-settings" }, h("div", { className: "ascii-settings-title" }, "场景主题"), h(Picker)); }
  function ThemeButton() {
    const ref = useRef(null), trigger = useRef(null);
    const [open, setOpen] = useState(false);
    useEffect(() => () => { ref.current?.close(); }, []);
    return h("div", {className:"ascii-footer"},
      h("button", { ref: trigger, type: "button", className: "ascii-switch", "aria-label": "场景主题", title: "场景主题", onClick: () => { setOpen(true); ref.current.showModal(); } },
        h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true }, h("path", { d: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2 1.8 1.8 0 0 1 1.5-2.8H18a4 4 0 0 0 4-4c0-4.4-4.5-8-10-8Z" }), h("circle", { cx: 7, cy: 10, r: 1 }), h("circle", { cx: 11, cy: 7, r: 1 }), h("circle", { cx: 16, cy: 8, r: 1 })), h("span", null, "主题")),
      h("dialog", { ref, className: "ascii-dialog", "aria-label": "场景主题", onClick: event => { if (event.target === ref.current) { const b = ref.current.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) ref.current.close(); } }, onClose: () => { setOpen(false); trigger.current?.focus(); } },
        h("div", { className: "ascii-dialog-head" }, h("span", null, "场景主题"), h("button", { type: "button", className: "ascii-dialog-close", "aria-label": "关闭主题选择", onClick: () => ref.current.close() }, "×")), open ? h(Picker) : null),
    );
  }

  const onTheme = snapshot => {
    if (changing || state.scene === "native") return;
    if (snapshot.preference !== getScene(state.scene)?.mode) { clearTransition(); state.scene = "native"; applyPalette(); persistState(); }
  };
  const offTheme = ctx.on("theme/change", onTheme);
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({ name: "settings.general.item", id: "ascii-scenes", order: 12 }, SettingsRow));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "ascii-scenes", order: 80 }, ThemeButton));
  applyPalette(); scan();
  ctx.effect(() => () => {
    alive = false; observer.disconnect(); offTheme(); clearTransition(); reduced.removeEventListener("change", reduceTransition);
    backdrop?.dispose(); backdrop = null;
    for (const item of crabs.values()) item.controller.dispose();
    crabs.clear(); listeners.clear(); tokenDispose?.();
    delete document.body.dataset.asciiScene; style.remove();
    if (getScene(state.scene)) ctx.theme.setTheme(state.previous);
  }, "ASCII scenes: release renderers, observers, palette and stylesheet");
}

// One background for the whole app shell. The sidebar is a translucent surface
// above this canvas, so objects continue behind the conversation list.
function findSceneShell() {
  // Do not insert into #root while the host still owns its loading placeholder.
  return document.querySelector('[data-shell-overlay]')?.parentElement || null;
}

function createSceneBackdrop(frame, scene, initialMotion) {
  const layer = document.createElement('div');
  layer.className = 'ascii-scene-layer ascii-shell-scene';
  layer.setAttribute('aria-hidden', 'true');
  const canvas = document.createElement('canvas'); layer.append(canvas); frame.prepend(layer);
  const marks = new Map();
  let alive = true, controller = null, content = null, resizeFrame = 0;
  let motion = initialMotion, quiet = false, bounds = null;
  function mark(node, name) {
    if (!node || node.hasAttribute(name)) return;
    node.setAttribute(name, '');
    if (!marks.has(node)) marks.set(node, new Set());
    marks.get(node).add(name);
  }
  function measure() {
    const shellBox = frame.getBoundingClientRect();
    const box = content?.getBoundingClientRect();
    bounds = box && box.width > 0 && box.height > 0
      ? {x:box.left-shellBox.left,y:box.top-shellBox.top,width:box.width,height:box.height}
      : {x:0,y:0,width:Math.max(1,shellBox.width),height:Math.max(1,shellBox.height)};
  }
  const resize = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0; if (!alive) return;
      measure(); controller?.layout?.();
    });
  });
  function bindContent() {
    const right = frame.querySelector('[data-rightbar-col]');
    const center = right?.previousElementSibling;
    const sidebar = center?.previousElementSibling;
    mark(frame, 'data-ascii-shell');
    mark(center, 'data-ascii-center');
    mark(sidebar, 'data-ascii-sidebar');
    mark(sidebar?.firstElementChild, 'data-ascii-sidebar-content');
    // Slot/context wrappers can sit between the column and the sidebar root.
    // Follow semantic anchors through those wrappers instead of relying on a hash-named class.
    for (const anchor of sidebar?.querySelectorAll('nav,[role="tree"]') || []) {
      for (let node = anchor; node && node !== sidebar; node = node.parentElement) mark(node, 'data-ascii-sidebar-content');
    }
    const next = (center || frame).querySelector('[data-conversation-content]');
    if (next !== content) {
      if (content) resize.unobserve(content);
      content = next;
      if (content) resize.observe(content);
      for (let node = content; node && node !== frame; node = node.parentElement) mark(node, 'data-ascii-content-surface');
      measure(); controller?.layout?.();
    }
    for (const node of marks.keys()) if (!node.isConnected) marks.delete(node);
    return content?.getAttribute('data-content-phase') === 'active';
  }
  quiet = bindContent(); measure();
  controller = scene.renderer(canvas, {motion, quiet, interactionRoot:frame, getContentBounds:() => bounds});
  resize.observe(frame);
  return {
    frame, scene:scene.id, canvas,
    refresh(nextMotion) {
      const nextQuiet = bindContent();
      if (nextMotion !== motion || nextQuiet !== quiet) {
        motion = nextMotion; quiet = nextQuiet; controller.update({motion, quiet});
      }
    },
    dispose() {
      alive = false; resize.disconnect(); cancelAnimationFrame(resizeFrame);
      controller.dispose(); layer.remove();
      for (const [node, names] of marks) for (const name of names) node.removeAttribute(name);
      marks.clear();
    },
  };
}

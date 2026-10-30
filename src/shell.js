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

// Dissolve only the previous background. The host UI and the new scene remain
// live throughout the change; no whole-page snapshot interrupts typing.
function createSceneDissolve(backdrop, origin, onFinish) {
  const {frame,canvas:source}=backdrop,box=frame.getBoundingClientRect();
  const layer=document.createElement('div');layer.className='ascii-scene-layer ascii-transition';
  layer.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  layer.append(canvas);
  const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
  const w=Math.max(1,box.width),h=Math.max(1,box.height),cell=clamp(h/65,9,16),stepY=cell*1.18;
  const x=clamp((origin?.x??box.left+w*.72)-box.left,0,w),y=clamp((origin?.y??box.top+h*.65)-box.top,0,h);
  const reach=Math.max(Math.hypot(x,y),Math.hypot(w-x,y),Math.hypot(x,h-y),Math.hypot(w-x,h-y));
  const tiles=[];
  for(let row=0;row<h/stepY;row++)for(let col=0;col<w/cell;col++)tiles.push({
    x:col*cell,y:row*stepY,alpha:0,
    delay:Math.hypot((col+.5)*cell-x,(row+.5)*stepY-y)/reach*.54+noise(col*17+row*43)*.045,
  });
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
  ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
  let raf=0,started=0,alive=true;
  function tick(now) {
    if(!alive)return;
    const progress=(now-started)/820;
    if(progress>=1){onFinish();return;}
    for(const tile of tiles) {
      if(tile.alpha===1)continue;
      const p=clamp((progress-tile.delay)/.34,0,1),alpha=p*p*(3-2*p);
      if(alpha<=tile.alpha)continue;
      if(alpha===1)ctx.clearRect(tile.x,tile.y,cell,stepY);
      else {
        // Remove only the incremental coverage. This avoids redrawing a full
        // screenshot and keeps the dissolving cells continuous between frames.
        ctx.globalAlpha=(alpha-tile.alpha)/(1-tile.alpha);
        ctx.fillRect(tile.x,tile.y,cell,stepY);
      }
      tile.alpha=alpha;
    }
    raf=requestAnimationFrame(tick);
  }
  const hidden=()=>{if(document.hidden)onFinish();};
  // Establish the old palette before applySelection changes its CSS variables.
  getComputedStyle(frame).color;
  return {
    start(){frame.append(layer);started=performance.now();raf=requestAnimationFrame(tick);document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',onFinish);},
    dispose(){if(!alive)return;alive=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',onFinish);layer.remove();canvas.width=1;canvas.height=1;},
  };
}

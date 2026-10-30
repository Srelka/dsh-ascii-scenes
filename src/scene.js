function noise(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }

function starCoverage(x, y, t) {
  // The reference changes its silhouette on the character lattice, not just its
  // letters. A continuous turn plus a small travelling bend drives that motion.
  const angle = t * .105 + Math.sin(t * .85) * .035;
  const scale = 1 + .035 * Math.sin(t * 1.35);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  let sx = (x * cosine + y * sine) / scale;
  const sy = (-x * sine + y * cosine) / scale;
  sx += Math.sin(sy * .38 - t * 1.9) * .3;
  let coverage = 0;
  for (const dx of [-.28, .28]) for (const dy of [-.28, .28]) {
    const row = STAR_ROWS[Math.round((sy + dy) / STAR_CELL_ASPECT + 7.5)];
    if (row?.[Math.round(sx + dx + 12)] === "#") coverage += .25;
  }
  return coverage;
}

function isAsciiBackgroundTarget(target) {
  return target instanceof Element && !target.closest('button,a,input,textarea,select,[contenteditable],[role="button"],[role="dialog"],[role="treeitem"],[role="menuitem"],[role="tab"],[role="option"],[role="switch"],dialog,pre,code,p,li,table,h1,h2,h3,[data-composer-card],[data-chat-flow-key],[data-turn-process],[data-shell-overlay],.ascii-clawd-stage');
}

function listenForBackgroundClicks(root, onClick) {
  let pointerDown = null;
  function down(event) {
    pointerDown = event.button === 0 && isAsciiBackgroundTarget(event.target)
      ? {x:event.clientX,y:event.clientY,id:event.pointerId,at:performance.now()} : null;
  }
  function up(event) {
    const start = pointerDown; pointerDown = null;
    if (!start || event.pointerId !== start.id || event.button !== 0 || performance.now()-start.at > 650 ||
      Math.hypot(event.clientX-start.x,event.clientY-start.y) > 6 || !isAsciiBackgroundTarget(event.target) ||
      !getSelection()?.isCollapsed) return;
    onClick(event);
  }
  root?.addEventListener('pointerdown', down, {passive:true});
  root?.addEventListener('pointerup', up, {passive:true});
  return () => {
    root?.removeEventListener('pointerdown', down);
    root?.removeEventListener('pointerup', up);
  };
}

// Only empty background space responds. Hovering text, dragging, or leaving the
// window releases the field without taking focus or capturing pointer input.
function createScenePointer(canvas, root) {
  let target = null;
  const pointer = {x:0,y:0,strength:0};
  function clear() { target = null; }
  function move(event) {
    if (event.pointerType === 'touch' || event.buttons || !isAsciiBackgroundTarget(event.target) || !getSelection()?.isCollapsed) { clear(); return; }
    const box = canvas.getBoundingClientRect();
    target = {x:event.clientX-box.left,y:event.clientY-box.top};
    if (pointer.strength < .001) { pointer.x=target.x; pointer.y=target.y; }
  }
  root?.addEventListener('pointermove',move,{passive:true});
  root?.addEventListener('pointerleave',clear,{passive:true});
  root?.addEventListener('pointerdown',clear,{passive:true});
  window.addEventListener('blur',clear);
  return {
    pointer,
    step(dt, enabled) {
      if (!enabled) { clear(); pointer.strength=0; return; }
      const blend=1-Math.exp(-dt*5);
      pointer.strength+=((target?1:0)-pointer.strength)*blend;
      if(target){pointer.x+=(target.x-pointer.x)*blend;pointer.y+=(target.y-pointer.y)*blend;}
    },
    dispose() {
      root?.removeEventListener('pointermove',move);root?.removeEventListener('pointerleave',clear);
      root?.removeEventListener('pointerdown',clear);window.removeEventListener('blur',clear);
    },
  };
}

function createNightScene(canvas, { motion = true, quiet = false, preview = false, interactionRoot = null, getContentBounds = null } = {}) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let w = 1, h = 1, dpr = 1, time = 0, last = 0, raf = 0, alive = true, visible = true;
  let moving = motion, reading = quiet, calm = quiet ? 1 : 0, grid = null;
  const hover = createScenePointer(canvas, interactionRoot);
  let worldWidth = 1, worldHeight = 1, originX = 0, originY = 0, resizeFrame = 0;
  const bursts=[];
  const stats = { frames: 0, drawMs: 0, longestDrawMs: 0, lastFrameMs: 0 };
  const dust = Array.from({ length: preview ? 28 : 110 }, (_, i) => ({
    x: noise(i + 7), y: noise(i + 49), depth: .25 + noise(i + 23) * .75,
    phase: noise(i + 87) * Math.PI * 2, glyph: ".·:+*~{}<>/$"[Math.floor(noise(i + 101) * 12)],
  }));

  function resize() {
    if (!alive) return;
    const box = canvas.getBoundingClientRect();
    worldWidth = Math.max(1, box.width); worldHeight = Math.max(1, box.height);
    const content = getContentBounds?.();
    w = content?.width || worldWidth; h = content?.height || worldHeight;
    originX = content?.x || 0; originY = content?.y || 0;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(worldWidth * dpr), pixelHeight = Math.round(worldHeight * dpr);
    if (!grid || canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth; canvas.height = pixelHeight;
      if (grid) { grid.width = 1; grid.height = 1; }
      buildGrid(worldWidth, worldHeight);
    }
    draw();
  }

  function buildGrid(w, h) {
    grid = document.createElement("canvas"); grid.width = canvas.width; grid.height = canvas.height;
    const g = grid.getContext("2d"); g.scale(dpr, dpr);
    g.fillStyle = "#14120f"; g.fillRect(0, 0, w, h);
    const glow = g.createLinearGradient(0, 0, w, 0);
    glow.addColorStop(0, "#28221c"); glow.addColorStop(.22, "#181410");
    glow.addColorStop(.5, "#15120f"); glow.addColorStop(.76, "#1d1612"); glow.addColorStop(1, "#30221c");
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    const cell = preview ? 7 : clamp(h / 66, 9, 16);
    for (let x = 0; x < w; x += cell) {
      const edge = .12 + .88 * Math.pow(Math.abs(x / w - .5) * 2, 1.6);
      g.strokeStyle = `rgba(206,169,139,${.075 * edge})`; g.lineWidth = .55;
      g.beginPath(); g.moveTo(Math.round(x) + .5, 0); g.lineTo(Math.round(x) + .5, h); g.stroke();
    }
    for (let y = 0; y < h; y += cell) {
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "rgba(206,169,139,.07)"); grad.addColorStop(.45, "rgba(206,169,139,.012)"); grad.addColorStop(1, "rgba(206,169,139,.065)");
      g.strokeStyle = grad; g.beginPath(); g.moveTo(0, Math.round(y) + .5); g.lineTo(w, Math.round(y) + .5); g.stroke();
    }
    // Fine character grains are fixed to the grid. They are not an image texture.
    g.font = `${preview ? 5 : 7}px Consolas, monospace`;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      const v = noise(x * .17 + y * .31);
      if (v > .79) { g.fillStyle = `rgba(190,158,129,${.055 + v * .028})`; g.fillText(v > .94 ? "~" : "·", x + 2, y + cell * .72); }
    }
    const vignette = g.createRadialGradient(w * .49, h * .42, 0, w * .49, h * .42, w * .62);
    vignette.addColorStop(0, "rgba(10,9,8,.4)"); vignette.addColorStop(.5, "rgba(10,9,8,.1)"); vignette.addColorStop(1, "rgba(10,9,8,0)");
    g.fillStyle = vignette; g.fillRect(0, 0, w, h);
  }

  function drawStar(t) {
    const cell = preview ? Math.min(w / 45, h / 29) : clamp(h / 63, 9, 17);
    const sw = 30 * cell;
    const cx = w - sw * .5 - (preview ? w * .025 : clamp(w * .025, 18, 52));
    const cy = preview ? h * .46 : sw * .5 + clamp(h * .025, 12, 32);
    const alpha = .98 - calm*.28;
    const halo = ctx.createRadialGradient(cx + cell * 2, cy, 4, cx + cell * 2, cy, sw * .74);
    halo.addColorStop(0, `rgba(210,110,74,${.12-calm*.065})`); halo.addColorStop(1, "rgba(197,100,68,0)");
    ctx.fillStyle = halo; ctx.fillRect(cx - sw, cy - sw, sw * 2, sw * 2);
    const cellHeight = cell * STAR_CELL_ASPECT;
    ctx.font = `${Math.max(5, cell * 1.04)}px Consolas, 'Courier New', monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let row = -11; row <= 11; row++) for (let col = -15; col <= 15; col++) {
      const coverage = starCoverage(col, row * STAR_CELL_ASPECT, t);
      if (!coverage) continue;
      const n = noise(col * 15 + row * 39);
      const wave = .5 + .5 * Math.sin(col * .32 + row * .2 - t * 2.3);
      const light = .57 + .38 * ((col + 15) / 30) + n * .12 + wave * .12;
      const x = Math.round(cx + (col - .5) * cell), y = Math.round(cy + (row - .5) * cellHeight);
      const core = Math.exp(-(col * col + (row * STAR_CELL_ASPECT) ** 2) / 18);
      if (coverage >= .5) {
        ctx.fillStyle = `rgba(${Math.round(222 * light + core * 8)},${Math.round(139 * light + core * 34)},${Math.round(106 * light + core * 41)},${alpha * (.65 + coverage * .35)})`;
        ctx.fillRect(x, y, cell - 1, cellHeight - 1.2);
      }
      const epoch = Math.floor(t * 5.5 + n * 7);
      const glyph = coverage < .5 ? ".:o;"[epoch % 4] : "st%$+x"[Math.floor(noise(col * 23 + row * 19 + epoch) * 6)];
      ctx.fillStyle = coverage < .5 ? `rgba(200,135,104,${alpha * .62})` : `rgba(30,20,14,${.8 * alpha})`;
      ctx.fillText(glyph, x + cell / 2 - .5, y + cellHeight / 2);
    }
  }

  function draw() {
    if (!grid) return;
    const start = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(grid, 0, 0, worldWidth, worldHeight);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      let x = ((p.x * worldWidth + Math.sin(time * .35 + p.phase) * 24 + time * (p.depth - .4) * 11) % worldWidth + worldWidth) % worldWidth;
      let y = ((p.y * worldHeight - time * (7 + p.depth * 15)) % worldHeight + worldHeight) % worldHeight;
      const dx=x-hover.pointer.x,dy=y-hover.pointer.y,distance=Math.hypot(dx,dy);
      const touch=Math.max(0,1-distance/150)**2*hover.pointer.strength*(1-calm*.7);
      x+=dx*touch*.1*p.depth;y+=dy*touch*.1*p.depth;
      const safe = .25 + .75 * Math.pow(Math.abs(x / worldWidth - .47) * 1.8, .7);
      const border=clamp(Math.min(x,y,worldWidth-x,worldHeight-y)/28,0,1);
      const alpha = ((.18 + p.depth * .19) * safe + touch*.16) * (.65 + .35 * Math.sin(time * .8 + p.phase) ** 2) * (1-calm*.25)*border;
      ctx.font = `${preview ? 6 : 9 + p.depth * 4}px Consolas, monospace`;
      ctx.fillStyle = i % 7 === 0 ? `rgba(225,135,104,${alpha})` : `rgba(194,173,152,${alpha * .7})`;
      ctx.fillText(p.glyph, x, y);
    }
    // Independent foreground feedback in the background plane. The original
    // sun is drawn afterwards, so clicking never displaces or repaints it.
    for(let index=bursts.length-1;index>=0;index--){
      const burst=bursts[index],age=time-burst.at;
      if(age>1){bursts.splice(index,1);continue;}
      ctx.font='12px Consolas,monospace';
      // A short upward fan of fixed glyphs. No ring, dot trail, random glyph
      // replacement or snapped positions: each symbol has one continuous arc.
      for(let n=0;n<5;n++){
        const elapsed=age-(n%3)*.012,variation=noise(n*17+burst.seed);
        const duration=.72+variation*.16;
        if(elapsed<0||elapsed>=duration)continue;
        const p=elapsed/duration;
        const vx=(n-2)*22*(.85+variation*.3),vy=-(98+noise(n*31+burst.seed)*24);
        const x=burst.x+(n-2)*2+vx*elapsed*(1-.2*p);
        const y=burst.y-2+vy*elapsed+75*elapsed*elapsed;
        const fade=clamp((duration-elapsed)/.34,0,1);
        const opacity=(.3+.7*clamp(elapsed/.045,0,1))*fade*fade*.82;
        ctx.fillStyle=`rgba(228,168,128,${opacity})`;
        ctx.fillText('{}+*/'[(n+Math.floor(burst.seed))%5],x,y);
      }
    }
    ctx.save(); ctx.translate(originX, originY);
    drawStar(time);
    ctx.restore();
    if (calm) {
      ctx.save(); ctx.translate(originX, originY);
      const veil = ctx.createLinearGradient(0, 0, w, 0);
      veil.addColorStop(0, "rgba(20,18,15,0)"); veil.addColorStop(.2, `rgba(20,18,15,${calm*.68})`);
      veil.addColorStop(.7, `rgba(20,18,15,${calm*.68})`); veil.addColorStop(1, `rgba(20,18,15,${calm*.1})`);
      ctx.fillStyle = veil; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    const cost = performance.now() - start;
    stats.drawMs = stats.drawMs * .95 + cost * .05;
    stats.longestDrawMs = Math.max(stats.longestDrawMs, cost); stats.frames++;
  }

  function tick(now) {
    raf = 0;
    if (!alive || !moving || reduced.matches || document.hidden || !visible) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0; last = now;
    time += dt; calm+=((reading?1:0)-calm)*(1-Math.exp(-dt*3.6));
    hover.step(dt,true);stats.lastFrameMs = dt * 1000; draw(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    if (alive && moving && !reduced.matches && !document.hidden && visible) raf = requestAnimationFrame(tick);
    else { calm=reading?1:0;hover.step(0,false);draw(); }
  }
  const resizeObserver = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
  }); resizeObserver.observe(canvas);
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; schedule(); }); intersection.observe(canvas);
  document.addEventListener("visibilitychange", schedule); reduced.addEventListener("change", schedule);
  const stopClicks=listenForBackgroundClicks(interactionRoot,event=>{
    if(!moving||reduced.matches)return;
    const box=canvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
    bursts.push({x,y,at:time,seed:noise(x+y)*6});if(bursts.length>6)bursts.shift();
    draw();
  });
  resize(); schedule();
  return {
    stats,
    layout: resize,
    update(options) { moving = options.motion; reading = options.quiet; if(!moving)bursts.length=0; draw(); schedule(); },
    dispose() { alive = false; cancelAnimationFrame(raf); cancelAnimationFrame(resizeFrame); resizeObserver.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", schedule); reduced.removeEventListener("change", schedule); stopClicks(); hover.dispose();bursts.length=0; if(grid){grid.width=1;grid.height=1;} grid = null; canvas.width=1;canvas.height=1; },
  };
}


// Claude's reference silhouette, with occasional short horizontal walks.
// Body pixels never stretch or rotate. Feet are the only walking sprite changes.
const CLAWD_WIDTH = 108, CLAWD_HEIGHT = 70;
const CLAWD_ANCHOR_X = 54, CLAWD_ANCHOR_Y = 61;

// Swept radius of the unchanged sun, including its maximum scale, travelling
// bend and coverage samples. Empty corners of its old bounding box are usable.
const CLAWD_SUN_RADIUS = Math.max(...STAR_ROWS.flatMap((row,r) => [...row].flatMap((value,c) =>
  value === '#' ? [Math.hypot(Math.abs(c-12)+.8,(Math.abs(r-7.5)+.5)*STAR_CELL_ASPECT)*1.035+.4] : [])));
function clawdSunBounds(width, height, top = -Infinity, bottom = Infinity) {
  const cell = clamp(height / 63, 9, 17), sw = 30 * cell;
  const cx = width - sw * .5 - clamp(width * .025, 18, 52);
  const cy = sw * .5 + clamp(height * .025, 12, 32);
  const radius = CLAWD_SUN_RADIUS * cell;
  const distance = Math.abs(clamp(cy,top-cell*STAR_CELL_ASPECT/2-1,bottom+cell*STAR_CELL_ASPECT/2+1)-cy);
  const halfWidth = distance > radius ? -Infinity : Math.sqrt(radius*radius-distance*distance)+cell/2+1;
  return {left:cx-halfWidth,right:cx+halfWidth,top:cy-radius-cell,bottom:cy+radius+cell};
}

function createClawd(stage, card, motion) {
  const territory = card.closest('[data-conversation-content]') || card.parentElement;
  const canvas = document.createElement('canvas');
  canvas.className = 'ascii-clawd';
  canvas.width = CLAWD_WIDTH; canvas.height = CLAWD_HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  const hit = document.createElement('button');
  hit.className = 'ascii-clawd-hit'; hit.type = 'button';
  hit.setAttribute('aria-label', '小蟹：点击眨眼回应');
  hit.title = '点击回应';
  stage.append(canvas, hit);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Three foot poses x two expressions. Cache the complete integer-pixel sprite
  // so movement cannot change individual tile widths, gaps, or torso alignment.
  const sprites = new Map();
  function sprite(feet, closed) {
    const key = `${feet}:${closed}`;
    if (sprites.has(key)) return sprites.get(key);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = CLAWD_WIDTH; frameCanvas.height = CLAWD_HEIGHT;
    const ctx = frameCanvas.getContext('2d');
    // Feet tuck behind the shell; raised feet must never repaint its bottom row.
    for (const row of [8, 0, 1, 2, 3, 4, 5, 6, 7]) {
      for (let col = 0; col < 16; col++) {
        const eye = (row === 1 || row === 2) && [3, 12].includes(col);
        if (CLAWD_ROWS[row][col] !== '#' && !(closed && eye)) continue;
        // A uniform six-pixel lattice: every tile is 5x5, every gap is 1px.
        // Never round each 5.4px cell independently or scale individual tiles.
        ctx.fillStyle = '#df9272';
        const left = 6 + col * 6, top = 8 + row * 6;
        const alternate = col === 2 || col === 11;
        const lift = row === 8 && ((feet === 1 && alternate) || (feet === 2 && !alternate)) ? 2 : 0;
        ctx.fillRect(left, top - lift, 5, 5);
      }
    }
    if (closed) {
      ctx.fillStyle = '#211912';
      for (const col of [3, 12]) ctx.fillRect(6 + col * 6, 22, 5, 2);
    }
    sprites.set(key, frameCanvas);
    return frameCanvas;
  }

  let alive = true, moving = motion, visible = true, hovered = false, focused = false;
  let frame = 0, last = 0, time = 0, distanceWalked = 0, replyUntil = 0, replyTimer = 0;
  let geometry = null, x = 0, target = 0, velocity = 0, lastLayout = -Infinity;
  let nextDecision = 6,paintedPose='',paintedPosition='',paintedAction='';

  function layout(force = false) {
    if (!alive || !territory.isConnected) return;
    if (!force && geometry && performance.now() - lastLayout < 120) return;
    lastLayout = performance.now();
    const region = territory.getBoundingClientRect(), box = card.getBoundingClientRect();
    const r = { left: box.left - region.left, right: box.right - region.left,
      top: box.top - region.top, bottom: box.bottom - region.top };
    const hero = territory.getAttribute('data-content-phase') === 'hero';
    let minimum = r.left + 60, maximum = r.right - 60, y = r.top - 3;
    if (hero) {
      const preset = territory.querySelector('[data-slot="conversation.hero.agentPreset"]');
      const edge = preset ? preset.getBoundingClientRect().right - region.left : r.left + 220;
      minimum = Math.max(minimum, edge + 62);
      // The host's preset slot may cover only its label. Include the actual
      // buttons and dropdown arrow when reserving the row above the composer.
      for (const control of territory.querySelectorAll('button,a,[role="button"]')) {
        if (stage.contains(control)) continue;
        const b = control.getBoundingClientRect();
        if (b.width && b.bottom - region.top > y - 52 && b.top - region.top < y + 4) {
          minimum = Math.max(minimum, b.right - region.left + 60);
        }
      }
    }
    // Fit the stepped sprite against the sun's swept contour, not against a
    // large square. The top rows are narrower than the claws further down.
    for (let row=0;row<CLAWD_ROWS.length;row++) {
      const right = 6 + CLAWD_ROWS[row].lastIndexOf('#')*6 + 5 - CLAWD_ANCHOR_X;
      const top = y-CLAWD_ANCHOR_Y+8+row*6;
      const sun = clawdSunBounds(region.width,region.height,top-(row===8?2:0),top+5);
      maximum = Math.min(maximum,sun.left-right-6);
    }
    minimum = Math.max(minimum, maximum - 80);
    const available = maximum >= minimum;
    const next = { minimum, maximum: Math.max(minimum, maximum), home: Math.max(minimum, maximum), y, available };
    const changed = !geometry || Math.abs(geometry.minimum - minimum) > 1 ||
      Math.abs(geometry.maximum - next.maximum) > 1 || Math.abs(geometry.y - y) > 1;
    geometry = next;
    if (changed) {
      x = next.home; target = x; velocity = 0;
      nextDecision = time + 6 + Math.random() * 6;
      paint();
    }
    stage.hidden = !available;
  }

  function paint() {
    if (!geometry || !alive) return;
    const walking = Math.abs(velocity) > .75;
    const replying = replyUntil > time;
    const phase = distanceWalked % 28;
    const feet = walking ? (phase < 6 || phase >= 20 ? 0 : phase < 13 ? 1 : phase < 14 ? 0 : 2) : 0;
    const replyElapsed = .65 - (replyUntil - time);
    const closed = replying ? replyElapsed < .16 || (replyElapsed > .3 && replyElapsed < .44)
      : moving && !reduced.matches && time % 7.1 > 6.94;
    const replyingMotion=replying&&moving&&!reduced.matches,pose=`${feet}:${closed}:${replyingMotion?replyElapsed:0}`;
    if(pose!==paintedPose){
      paintedPose=pose;
      context.clearRect(0, 0, CLAWD_WIDTH, CLAWD_HEIGHT);
      context.drawImage(sprite(feet, closed), 0, 0);
      if (replyingMotion) {
        const fade = Math.sin(Math.PI * clamp(replyElapsed / .65, 0, 1));
        context.fillStyle = `rgba(231,177,135,${fade * .75})`;
        for (const sx of [4, 101]) {
          context.fillRect(sx, 17, 3, 1); context.fillRect(sx + 1, 16, 1, 3);
        }
      }
    }
    // Translate the whole sprite at integer pixels, preserving every internal edge.
    const left = Math.round(x - CLAWD_ANCHOR_X), top = Math.round(geometry.y - CLAWD_ANCHOR_Y);
    const position=`${left}:${top}`,action=replying?'reply':walking?'walk':'rest';
    if(position!==paintedPosition){
      paintedPosition=position;canvas.style.transform = `translate(${left}px,${top}px)`;
      hit.style.transform = `translate(${left + 4}px,${top + 6}px)`;
      hit.style.width = '100px'; hit.style.height = '58px';
    }
    if(action!==paintedAction){paintedAction=action;stage.dataset.clawdAction=action;}
  }

  function tick(now) {
    frame = 0;
    if (!alive || !moving || reduced.matches || document.hidden || !visible) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now; time += dt;
    const paused = hovered || focused || replyUntil > time;
    if (paused) velocity = 0;
    else if (geometry.available) {
      if (Math.abs(target - x) < .6 && Math.abs(velocity) < 1 && time >= nextDecision) {
        nextDecision = time + 6 + Math.random() * 6;
        if (Math.abs(x - geometry.home) > .6) target = geometry.home;
        else if (Math.random() < .4) target = Math.max(geometry.minimum, geometry.home - 18 - Math.random() * 18);
      }
      const remaining = target - x;
      const desired = clamp(remaining * 2.8, -24, 24);
      velocity += clamp(desired - velocity, -80 * dt, 80 * dt);
      const previous = x;
      x = clamp(x + velocity * dt, geometry.minimum, geometry.maximum);
      if (Math.abs(remaining) < .6 && Math.abs(velocity) < 1.7) {
        x = target; velocity = 0;
        if (Math.abs(previous - target) > 0) planNextMove();
      }
      distanceWalked += Math.abs(x - previous);
    }
    paint(); frame = requestAnimationFrame(tick);
  }

  function schedule() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (geometry && (!moving || reduced.matches)) { x = geometry.home; target = x; velocity = 0; }
    paint();
    if (alive && moving && !reduced.matches && !document.hidden && visible) frame = requestAnimationFrame(tick);
  }
  function planNextMove(extraDelay = 0) {
    // An outing always ends at home; randomness only decides when to leave.
    const away = Math.abs(x - geometry.home) > .6;
    nextDecision = time + extraDelay + (away ? .65 : 7 + Math.random() * 7);
  }
  function respond(event) {
    event.stopPropagation();
    velocity = 0; target = x; replyUntil = time + .65;
    planNextMove(.65);
    clearTimeout(replyTimer);
    if (!moving || reduced.matches) {
      paint();
      replyTimer = setTimeout(() => { replyUntil = 0; paint(); }, 300);
    } else schedule();
  }
  function retainEditorFocus(event) { if (event.button === 0) event.preventDefault(); }
  function hoverIn() { hovered = true; target = x; velocity = 0; paint(); }
  function hoverOut() { hovered = false; planNextMove(); }
  function focusIn() { focused = true; target = x; velocity = 0; paint(); }
  function focusOut() { focused = false; planNextMove(); }
  const resize = new ResizeObserver(() => { layout(true); schedule(); });
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; schedule(); });
  hit.addEventListener('pointerdown', retainEditorFocus);
  hit.addEventListener('click', respond);
  hit.addEventListener('pointerenter', hoverIn); hit.addEventListener('pointerleave', hoverOut);
  hit.addEventListener('focus', focusIn); hit.addEventListener('blur', focusOut);
  document.addEventListener('visibilitychange', schedule); reduced.addEventListener('change', schedule);
  resize.observe(territory); resize.observe(card); intersection.observe(territory);
  layout(true); schedule();
  return {
    layout,
    update(value) { moving = value; velocity = 0; replyUntil = 0; schedule(); },
    dispose() {
      alive = false; cancelAnimationFrame(frame); clearTimeout(replyTimer);
      resize.disconnect(); intersection.disconnect(); sprites.clear();
      document.removeEventListener('visibilitychange', schedule); reduced.removeEventListener('change', schedule);
      hit.removeEventListener('pointerdown', retainEditorFocus); hit.removeEventListener('click', respond);
      hit.removeEventListener('pointerenter', hoverIn); hit.removeEventListener('pointerleave', hoverOut);
      hit.removeEventListener('focus', focusIn); hit.removeEventListener('blur', focusOut);
      stage.remove();
    },
  };
}

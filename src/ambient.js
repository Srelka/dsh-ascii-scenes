// Shared lifecycle for the new scenes. Claude keeps its original renderer.
function createAmbientScene(canvas, options, render) {
  const ctx = canvas.getContext('2d', {alpha:false});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let width=1, height=1, ratio=1, time=0, last=0, frame=0, resizeFrame=0;
  let alive=true, visible=true, moving=options.motion!==false, quiet=!!options.quiet;
  const clicks=[], stats={frames:0,drawMs:0,longestDrawMs:0};
  function draw() {
    if(!alive)return;
    const started=performance.now();
    ctx.setTransform(ratio,0,0,ratio,0,0);
    while(clicks.length && time-clicks[0].at>1.6)clicks.shift();
    render(ctx,{width,height,time,quiet,preview:!!options.preview,clicks});
    const elapsed=performance.now()-started;
    stats.drawMs=stats.drawMs*.95+elapsed*.05;
    stats.longestDrawMs=Math.max(stats.longestDrawMs,elapsed);stats.frames++;
  }
  function tick(now) {
    frame=0;
    if(!alive||!moving||reduced.matches||document.hidden||!visible)return;
    time+=last?Math.min((now-last)/1000,.05):0;last=now;
    draw();frame=requestAnimationFrame(tick);
  }
  function schedule() {
    cancelAnimationFrame(frame);frame=0;last=0;draw();
    if(alive&&moving&&!reduced.matches&&!document.hidden&&visible)frame=requestAnimationFrame(tick);
  }
  function resize() {
    if(!alive)return;
    const box=canvas.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);
    ratio=Math.min(devicePixelRatio||1,2);
    const pixelWidth=Math.round(width*ratio),pixelHeight=Math.round(height*ratio);
    if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
    draw();
  }
  const resizeObserver=new ResizeObserver(()=>{
    if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;resize();});
  });resizeObserver.observe(canvas);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;schedule();});intersection.observe(canvas);
  document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',schedule);
  const stopClicks=listenForBackgroundClicks(options.interactionRoot,event=>{
    if(!moving||reduced.matches)return;
    const box=canvas.getBoundingClientRect();
    clicks.push({x:event.clientX-box.left,y:event.clientY-box.top,at:time});
    if(clicks.length>6)clicks.shift();draw();
  });
  resize();schedule();
  return {
    stats,
    update(value){moving=value.motion;quiet=value.quiet;if(!moving)clicks.length=0;schedule();},
    dispose(){alive=false;cancelAnimationFrame(frame);cancelAnimationFrame(resizeFrame);resizeObserver.disconnect();intersection.disconnect();
      document.removeEventListener('visibilitychange',schedule);reduced.removeEventListener('change',schedule);
      stopClicks();clicks.length=0;canvas.width=1;canvas.height=1;},
  };
}

function drawAmbientGrid(ctx,width,height,cell,color) {
  ctx.fillStyle=color;
  for(let x=0;x<width;x+=cell)ctx.fillRect(Math.round(x),0,1,height);
  for(let y=0;y<height;y+=cell)ctx.fillRect(0,Math.round(y),width,1);
}

function drawCharacterField(ctx,{x,y,columns,rows,cell,aspect=1.33,time,seed=0,fill,ink,glyphs,coverage}) {
  const stepY=Math.round(cell*aspect);
  ctx.font=`${Math.max(1.5,cell*.91)}px Consolas,monospace`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const u=(col-(columns-1)/2)/(columns/2),v=(row-(rows-1)/2)/(rows/2);
    const amount=coverage(u,v,col,row);if(amount<=0)continue;
    const n=noise(seed+col*17+row*43);
    const px=Math.round(x+(col-columns/2)*cell),py=Math.round(y+(row-rows/2)*stepY);
    const gap=cell<4?cell*.1:1;
    if(amount>=.5){ctx.fillStyle=fill(u,v,n,amount);ctx.fillRect(px,py,cell-gap,stepY-gap);}
    const index=Math.floor(time*4+n*11);
    const char=amount<.5?'.:o'[index%3]:glyphs[Math.floor(noise(seed+col*23+row*7+index)*glyphs.length)];
    ctx.fillStyle=ink(u,v,n,amount);ctx.fillText(char,px+cell/2,py+stepY/2);
  }
}

function createMoonScene(canvas, options={}) {
  // Keep the character texture attached to each cloud as it drifts.
  // Re-randomising characters every frame makes this quiet scene shimmer.
  const clouds=[
    {x:.19,y:.22,size:1.02,speed:6.2,seed:17,depth:.82},
    {x:.86,y:.41,size:1.03,speed:9.4,seed:43,depth:1},
    {x:.52,y:.67,size:.92,speed:4.1,seed:89,depth:.52},
    {x:-.09,y:.52,size:.65,speed:3.3,seed:131,depth:.34},
  ];
  const stars=Array.from({length:88},(_,i)=>({
    x:noise(i*7+207),y:noise(i*11+419),phase:noise(i*13+37)*Math.PI*2,
    light:.22+noise(i*31+11)*.4,cross:i%19===0,
  }));
  let layout=null;

  function makeCloud(cell,size,seed) {
    const columns=Math.round(30*size),rows=6,stepY=cell*1.34,cells=[],bands=[];
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
      const u=(col+.5)/columns*2-1,v=(row+.5)/rows*2-1;
      const inside=(x,y)=>((u-x)/.55)**2+((v-y)/.65)**2<1;
      if(!inside(-.43,.24)&&!inside(.09,-.08)&&!inside(.48,.25))continue;
      const n=noise(seed+col*17+row*43);
      cells.push({x:col*cell,y:row*stepY,n,edge:row===5||col<2||col>columns-3,
        char:'sSt%:x'[Math.floor(n*6)]});
      if(!bands[row])bands[row]={x:col*cell,y:row*stepY,width:cell,height:stepY};
      else bands[row].width=(col+1)*cell-bands[row].x;
    }
    return {cells,bands:bands.filter(Boolean),width:columns*cell,height:rows*stepY};
  }

  function makeMoon(cell,radius) {
    const stepY=cell*1.34,cells=[];
    const columns=Math.ceil(radius*2/cell)+2,rows=Math.ceil(radius*2/stepY)+2;
    const crescent=(x,y)=>x*x+y*y<1 && (x-.43)**2+(y+.32)**2>1;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
      const x=(col-columns/2)*cell,y=(row-rows/2)*stepY;
      let hits=0;
      for(const dx of [.2,.8])for(const dy of [.2,.8]) {
        if(crescent((x+cell*dx)/radius,(y+stepY*dy)/radius))hits++;
      }
      if(!hits)continue;
      const n=noise(col*19+row*41+571);
      cells.push({x,y,n,edge:hits<2,char:':t%;'[Math.floor(n*4)]});
    }
    return cells;
  }

  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    if(!layout||layout.w!==w||layout.h!==h||layout.preview!==preview) {
      const cell=preview?Math.max(1.2,Math.min(w/112,h/65)):clamp(Math.min(h/65,w/110),6,16);
      const radius=Math.min(h*.123,w*.112);
      const sky=ctx.createLinearGradient(0,0,0,h);
      sky.addColorStop(0,'#070c19');sky.addColorStop(.55,'#0b1229');sky.addColorStop(1,'#131e40');
      const edges=[.025,.985].map(x=>{
        const glow=ctx.createRadialGradient(w*x,h*.93,0,w*x,h*.74,Math.min(Math.max(w*.29,h*.59),w*.5));
        glow.addColorStop(0,'rgba(60,85,164,.46)');
        glow.addColorStop(.5,'rgba(36,58,128,.23)');glow.addColorStop(1,'rgba(20,35,80,0)');
        return glow;
      });
      layout={w,h,preview,cell,sky,edges,
        moon:makeMoon(cell,radius),clouds:clouds.map(c=>makeCloud(cell,c.size,c.seed))};
    }
    const {cell}=layout,stepY=cell*1.34,gap=cell<4?cell*.12:1;
    const moonX=w*.81,moonY=h*.205;
    const cloudFrames=clouds.map((cloud,i)=>{
      const sprite=layout.clouds[i],span=w+sprite.width*2;
      const x=((cloud.x*w+t*cloud.speed*(cell/12)+sprite.width)%span+span)%span-sprite.width-sprite.width/2;
      const y=cloud.y*h+Math.sin(t*.18+cloud.seed)*cell*.15-sprite.height/2;
      return {cloud,sprite,x,y};
    });
    // Cloud glyphs are translucent, but the cloud itself must occlude the sky.
    // Use its continuous row silhouette so stars cannot shine through cell gaps.
    const cover=cloudFrames.flatMap(({sprite,x,y})=>sprite.bands.map(b=>({
      x:x+b.x,y:y+b.y,width:b.width,height:b.height,
    })));
    for(const p of layout.moon)cover.push({x:moonX+p.x,y:moonY+p.y,width:cell,height:stepY});
    function visibility(x,y,radius) {
      let amount=1;
      for(const box of cover) {
        const dx=Math.max(box.x-x,0,x-box.x-box.width),dy=Math.max(box.y-y,0,y-box.y-box.height);
        if(dx>radius+cell*.35||dy>radius+cell*.35)continue;
        amount=Math.min(amount,clamp((Math.hypot(dx,dy)-radius)/(cell*.35),0,1));
        if(amount===0)break;
      }
      return amount;
    }
    ctx.fillStyle=layout.sky;ctx.fillRect(0,0,w,h);
    for(const glow of layout.edges){ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);}
    drawAmbientGrid(ctx,w,h,cell,'rgba(127,153,222,.022)');

    ctx.textAlign='center';ctx.textBaseline='middle';
    for(const star of stars) {
      const x=star.x*w,y=star.y*h;
      const central=x>w*.24&&x<w*.78&&y>h*.25&&y<h*.9;
      const size=preview?Math.max(.55,cell*.11):Math.max(1,cell*.13);
      const alpha=(star.light+Math.sin(t*.6+star.phase)*.1)*(central?.4:1)*(quiet?.55:1)*visibility(x,y,size*2);
      ctx.fillStyle=`rgba(192,207,251,${alpha})`;
      if(star.cross) {
        // Non-overlapping arms avoid compositing the star centre three times.
        ctx.fillRect(x-size,y,size*3,size);
        ctx.fillRect(x,y-size,size,size);ctx.fillRect(x,y+size,size,size);
      } else ctx.fillRect(x,y,size,size);
    }

    // A click wakes a sparse field across the sky, independent of pointer position.
    // Only the latest click contributes, keeping repeated clicks from piling up.
    const click=clicks[clicks.length-1];
    if(click)for(let i=0;i<18;i++) {
      const seed=Math.floor(click.at*1000)+i*97+701;
      const delay=noise(seed+11)*.26,duration=1.05+noise(seed+23)*.27;
      const p=(t-click.at-delay)/duration;if(p<=0||p>=1)continue;
      const x=(i%6+.18+noise(seed+31)*.64)/6*w;
      const y=(Math.floor(i/6)+.12+noise(seed+47)*.76)/3*h;
      const size=preview?Math.max(.45,cell*.1):clamp(cell*.1,.8,1.4);
      const arm=size*(1.2+noise(seed+59)*.8);
      const central=x>w*.24&&x<w*.78&&y>h*.25&&y<h*.9;
      const alpha=Math.sin(p*Math.PI)**2*(.48+noise(seed+67)*.17)*visibility(x,y,arm+size)*(central?.35:1)*(quiet?.4:1);
      if(alpha<=0)continue;
      ctx.fillStyle=`rgba(205,220,255,${alpha})`;
      ctx.fillRect(x-arm,y-size/2,arm*2+size,size);
      ctx.fillRect(x-size/2,y-arm,size,arm-size/2);
      ctx.fillRect(x-size/2,y+size/2,size,arm-size/2);
    }

    // An offset circular cutout opens the crescent towards the upper right.
    ctx.save();ctx.translate(moonX,moonY);
    ctx.globalAlpha=quiet?.5:1;
    ctx.font=`${cell*.93}px Consolas,monospace`;
    for(const pixel of layout.moon) {
      if(!pixel.edge) {
        ctx.fillStyle=`rgba(214,207,160,${.54+pixel.n*.22})`;
        ctx.fillRect(pixel.x,pixel.y,cell-gap,stepY-gap);
        ctx.fillStyle='rgba(47,45,40,.85)';
      } else ctx.fillStyle='rgba(207,204,165,.35)';
      ctx.fillText(pixel.char,pixel.x+cell*.46,pixel.y+stepY*.48);
    }
    ctx.restore();

    for(const {cloud,sprite,x,y} of cloudFrames) {
      ctx.save();ctx.translate(x,y);
      ctx.font=`${cell*.94}px Consolas,monospace`;
      for(const pixel of sprite.cells) {
        const worldX=x+pixel.x;
        const edge=clamp((Math.abs(worldX/w-.5)-.27)/.18,0,1);
        const reading=.3+.7*edge*edge*(3-2*edge);
        ctx.globalAlpha=cloud.depth*reading*(quiet?.33:1);
        const shade=.25+pixel.n*.23;
        ctx.fillStyle=`rgba(96,118,182,${pixel.edge?shade*.65:shade})`;
        ctx.fillRect(pixel.x,pixel.y,cell-gap,stepY-gap);
        ctx.fillStyle=`rgba(169,185,231,${.34+pixel.n*.24})`;
        ctx.fillText(pixel.char,pixel.x+cell*.46,pixel.y+stepY*.48);
      }
      ctx.restore();
    }

    // A workspace-wide veil preserves the shared sky under a translucent sidebar.
    if(quiet) {ctx.fillStyle='rgba(7,12,25,.3)';ctx.fillRect(0,0,w,h);}
  });
}

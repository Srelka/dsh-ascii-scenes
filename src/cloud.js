function createCloudScene(canvas, options={}) {
  // Positions use the whole workspace, including the translucent sidebar.
  const seed=Number.isFinite(options.seed)?options.seed:Math.floor(Math.random()*1000000);
  const clouds=[
    {x:.09,y:.09,size:.75,speed:5.5,depth:.7},
    {x:.43,y:.20,size:1.25,speed:8.5,depth:1},
    {x:.75,y:.10,size:.85,speed:6,depth:.7},
    {x:.68,y:.49,size:.78,speed:6.8,depth:.82},
    {x:.31,y:.72,size:1.08,speed:9.5,depth:.95},
    {x:.87,y:.86,size:1.1,speed:10.5,depth:1},
    {x:.075,y:.61,size:.56,speed:4.5,depth:.6},
  ];
  // Generate once per scene. A continuous belly connects irregular, overlapping
  // crowns; the four proportions keep randomness recognisable as clouds.
  const families=[{width:1,height:1,crowns:3},{width:1.2,height:.72,crowns:4},
    {width:.94,height:1.15,crowns:3},{width:1.12,height:.88,crowns:2}];
  const firstFamily=Math.floor(noise(seed+71)*families.length);
  clouds.forEach((cloud,index)=>{
    cloud.seed=seed+index*997;
    const random=n=>noise(cloud.seed+n*31);
    const family=families[index===1?(random(40)>.5?0:2):(firstFamily+index)%families.length];
    cloud.columns=Math.round(17*cloud.size*family.width);
    cloud.rows=Math.max(4,Math.round(7*cloud.size*family.height));
    cloud.wind=0;cloud.gust=null;
    const lobes=[[0,.3,.89,.39],[-.62,.22,.32,.31],[.62,.22,.32,.31]];
    const tallest=family.crowns===2?Math.floor(random(39)*2):1;
    for(let i=0;i<family.crowns;i++){
      const spread=family.crowns===2?.28:.52;
      const cx=-spread+i*2*spread/(family.crowns-1)+(random(i+3)-.5)*.12;
      const ry=Math.min(.65,.31+(1-Math.abs(cx))*(.15+random(i+9)*.16)+(i===tallest?.1:0));
      const rx=(family.crowns===2?.44:.31)+random(i+16)*.1;
      lobes.push([cx,.34-ry,rx,ry]);
    }
    cloud.cells=[];
    for(let row=0;row<cloud.rows;row++)for(let col=0;col<cloud.columns;col++) {
      const u=(col-(cloud.columns-1)/2)/(cloud.columns/2),v=(row-(cloud.rows-1)/2)/(cloud.rows/2);
      let hits=0;
      for(const du of [-.45/cloud.columns,.45/cloud.columns])for(const dv of [-.45/cloud.rows,.45/cloud.rows]){
        if(lobes.some(([cx,cy,rx,ry])=>((u+du-cx)/rx)**2+((v+dv-cy)/ry)**2<1))hits++;
      }
      if(!hits)continue;
      const n=noise(cloud.seed+col*17+row*43),shade=clamp((v+.05)/.8,0,1);
      cloud.cells.push({col,row,v,hits,n,
        glyph:(shade>.65?'::;t':'t%;:')[Math.floor(n*4)],alternate:';t:%'[Math.floor(random(col+row*7)*4)],
        fill:`rgba(${Math.round(254-shade*13)},${Math.round(255-shade*6)},253,${(.86+n*.09)*(.88+cloud.depth*.12)*(.65+hits*.0875)})`,
        ink:`rgba(74,107,125,${.24+n*.12+shade*.06})`});
    }
  });
  let lastClick=null;
  const gustProgress=p=>p-Math.sin(p*Math.PI*2)/(Math.PI*2);
  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    const cell=preview?Math.max(.8,Math.min(w/100,h/63)):Math.max(3,Math.min(w/92,clamp(h/63,7,17)));
    const stepY=cell*1.33,scale=cell/12;
    // A gust adds lasting travel, then returns to the normal speed. Superseding
    // a gust starts from its current position, including rapid repeated clicks.
    const positions=clouds.map(cloud=>{
      let offset=cloud.wind,p=1;
      if(cloud.gust){
        p=clamp((t-cloud.gust.at)/1.45,0,1);
        offset+=cloud.gust.amount*gustProgress(p);
        if(p===1){cloud.wind=offset;cloud.gust=null;}
      }
      const span=cloud.columns*cell,period=w+2*span;
      return {offset,p,span,x:((cloud.x*w+t*cloud.speed*scale+offset*cell+span)%period)-span,
        y:cloud.y*h+Math.sin(t*.23+cloud.seed)*1.3*scale};
    });
    const click=clicks.at(-1);
    if(click&&click!==lastClick&&t-click.at<1.45){
      lastClick=click;
      const distances=positions.map((pos,i)=>Math.hypot(
        Math.max(0,Math.abs(pos.x-click.x)-pos.span*.43)/w,
        Math.max(0,Math.abs(pos.y-click.y)-clouds[i].rows*stepY*.4)/h));
      const nearest=Math.min(...distances);
      clouds.forEach((cloud,i)=>{
        const weight=Math.exp(-(((distances[i]-nearest)/.12)**2))*(distances[i]===nearest?1:.45);
        cloud.wind=positions[i].offset;
        cloud.gust={at:t,amount:(2.2+cloud.size*.7)*weight};
        positions[i].p=0;
      });
    }
    const sky=ctx.createLinearGradient(0,0,w,0);
    for(const [at,color] of [[0,'#70bef0'],[.12,'#6ebcf0'],[.31,'#b4dcf0'],[.75,'#bce0f2'],[.94,'#72bef0'],[1,'#7bc3f1']])sky.addColorStop(at,color);
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const depth=ctx.createLinearGradient(0,0,0,h);
    depth.addColorStop(0,'rgba(255,255,255,0)');depth.addColorStop(1,'rgba(244,252,255,.24)');
    ctx.fillStyle=depth;ctx.fillRect(0,0,w,h);
    drawAmbientGrid(ctx,w,h,cell,'rgba(246,253,255,.025)');
    ctx.font=`${Math.max(1.2,cell*.91)}px Consolas,monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    clouds.forEach((cloud,index)=>{
      const {columns,rows}=cloud;
      const {span,x,y,p}=positions[index],breeze=cloud.gust?Math.sin(Math.PI*p)*cloud.gust.amount/3:0;
      if(x+span*.55<0||x-span*.55>w)return;
      for(const dot of cloud.cells) {
        const stretch=1+breeze*.045;
        const shear=breeze*(.35-dot.v)*cell*.38;
        const px=x+(dot.col-columns/2)*cell*stretch+shear,py=y+(dot.row-rows/2)*stepY-breeze*cell*.13;
        const gap=Math.min(1,cell*.09);
        if(dot.hits>=2) {
          ctx.fillStyle=dot.fill;ctx.fillRect(px,py,cell*stretch-gap,stepY-gap);
        }
        // Stagger individual letter changes so the entire cloud never flashes.
        const change=(t*(.16+dot.n*.09)+dot.n*7)%1>.87;
        ctx.fillStyle=dot.hits<2?'rgba(248,255,255,.4)':dot.ink;
        ctx.fillText(dot.hits<2?(dot.n>.5?':':'.'):(change?dot.alternate:dot.glyph),px+cell*stretch/2,py+stepY/2);
      }
    });
    ctx.font=`${Math.max(1.2,cell*.82)}px Consolas,monospace`;ctx.fillStyle='rgba(58,105,132,.33)';
    const flockSpan=64*scale,flockX=((w*.35+t*13*scale+flockSpan)%(w+2*flockSpan))-flockSpan;
    for(let i=0;i<5;i++) {
      const x=flockX+(i-2)*16*scale;
      const y=h*.38+Math.abs(i-2)*10*scale+Math.sin(t*1.1+i*.7)*2*scale;
      const wing=Math.sin(t*4.3+i*1.13);
      ctx.fillText(wing>.28?'v':wing<-.28?'^':'~',x,y);
    }
    if(quiet) {
      const veil=ctx.createLinearGradient(0,0,w,0);
      veil.addColorStop(0,'rgba(230,246,252,.05)');veil.addColorStop(.2,'rgba(232,246,252,.77)');
      veil.addColorStop(.78,'rgba(232,246,252,.77)');veil.addColorStop(1,'rgba(230,246,252,.1)');
      ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
    }
  });
}

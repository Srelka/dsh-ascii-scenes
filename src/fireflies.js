function createFirefliesScene(canvas, options={}) {
  const anchors=[
    [.07,.27],[.17,.43],[.25,.19],[.09,.68],[.29,.75],
    [.42,.32],[.54,.69],[.64,.45],[.74,.20],[.85,.38],
    [.94,.61],[.79,.75],[.93,.14],[.36,.58],
  ];
  const flies=anchors.map(([x,y],i)=>({x,y,seed:i*19+37,depth:.72+noise(i+4)*.28}));
  for(let i=0;i<10;i++)flies.push({x:.05+noise(i+61)*.9,y:.18+noise(i+91)*.64,seed:i*23+311,depth:.35+noise(i+17)*.18});
  let bankKey='',bank=[];
  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    const cell=preview?Math.max(1.4,Math.min(w/100,h/63)):clamp(h/63,8,16);
    const scale=cell/13;
    const sky=ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'#07131d');sky.addColorStop(.5,'#081b1b');sky.addColorStop(1,'#0b211b');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    // Continuous night air across the workspace, including behind the sidebar.
    for(const [x,y,r,color]of[[.02,.25,.43,'25,77,90'],[.97,.2,.4,'21,63,85'],[.1,.86,.38,'32,84,54'],[.93,.88,.32,'32,73,50']]) {
      const glow=ctx.createRadialGradient(w*x,h*y,0,w*x,h*y,Math.max(w*.55,h)*r);
      glow.addColorStop(0,`rgba(${color},.28)`);glow.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    }
    drawAmbientGrid(ctx,w,h,cell,'rgba(103,160,144,.022)');
    // Cache the rooted character meadow. Only the tips sway; glyphs do not shuffle.
    const key=`${w}:${h}:${cell}`;
    if(key!==bankKey) {
      bankKey=key;bank=[];
      for(let layer=0;layer<2;layer++) {
        const unit=cell*(layer?.94:.76),rowsY=unit*1.35;
        for(let col=0;col<=Math.ceil(w/unit);col++) {
          const x=col*unit,u=x/w,n=noise(col*13+layer*131);
          const edges=Math.exp(-(((u-.07)/.19)**2))+Math.exp(-(((u-.92)/.17)**2));
          const height=h*(.015+edges*(.045+n*.09))*(layer?1:.72);
          const rows=Math.max(1,Math.round(height/rowsY));
          for(let row=0;row<rows;row++) {
            const rnd=noise(col*41+row*17+layer*233);
            if(row>0&&rnd<.16)continue;
            bank.push({x,y:h-(row+.5)*rowsY,unit,row,rows,n,rnd,layer,
              glyph:'stx%:;'[Math.floor(rnd*6)]});
          }
        }
      }
    }
    // Low distant hummocks keep depth without adding a competing horizon line.
    ctx.font=`${cell*.68}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(67,109,80,.2)';
    for(let i=0;i<w/cell;i++) {
      const x=i*cell,y=h*(.965-.018*Math.sin(i*.13)-.012*noise(i+71));
      ctx.fillText(i%3?':':'.',x,y);
    }
    for(const blade of bank) {
      const {unit,row,rows,n,rnd,layer}=blade;
      const tip=(row+1)/rows;
      const sway=Math.sin(t*.7+blade.x/w*7+n*.7)*unit*.15*tip*tip;
      const x=blade.x+sway,y=blade.y;
      ctx.fillStyle=layer?`rgba(52,108,79,${.11+rnd*.14})`:'rgba(35,68,52,.2)';
      ctx.fillRect(x-unit*.45,y-unit*.61,unit*.86,unit*1.19);
      ctx.font=`${Math.max(1.2,unit*.94)}px Consolas,monospace`;
      ctx.fillStyle=layer?`rgba(117,178,135,${.32+rnd*.32})`:`rgba(64,112,85,${.25+rnd*.2})`;
      ctx.fillText(blade.glyph,x,y);
    }
    for(const fly of flies) {
      const {seed,depth}=fly,phase=noise(seed)*Math.PI*2;
      // Smooth bounded flight continues through dark intervals; no wrapping/teleports.
      const travel=Math.min(w*.055,62*scale)*depth;
      let x=fly.x*w+travel*(Math.sin(t*(.27+noise(seed+1)*.12)+phase)+.3*Math.sin(t*.73+phase*2));
      let y=fly.y*h+Math.min(h*.065,52*scale)*depth*(Math.sin(t*.34+phase*1.7)+.25*Math.sin(t*.87+phase));
      const cycle=(t/(3.1+noise(seed+2)*3.4)+noise(seed+3))%1;
      const flash=cycle<.43?Math.sin(Math.PI*cycle/.43)**2:0;
      let light=flash;
      for(const click of clicks) {
        const age=t-click.at;if(age<0||age>1.6)continue;
        const dx=x-click.x,dy=y-click.y,distance=Math.hypot(dx,dy);
        const influence=Math.exp(-((distance/(120*scale))**2));
        const lift=Math.sin(age/1.6*Math.PI)*influence*23*scale;
        x+=dx/(distance+1)*lift;y+=dy/(distance+1)*lift-lift*.3;
        light=Math.max(light,influence*.55*Math.exp(-age*2));
      }
      const center=Math.exp(-(((x/w-.51)/.25)**4))*Math.exp(-(((y/h-.48)/.4)**4));
      const alpha=(.075+light*.925)*(depth<.6?.5:1)*(1-center*.5);
      const size=cell*depth*.7;
      if(light>.012) {
        const radius=cell*(3.2+depth*2.5),glow=ctx.createRadialGradient(x,y,0,x,y,radius);
        glow.addColorStop(0,`rgba(190,207,88,${light*.24*depth})`);
        glow.addColorStop(.32,`rgba(137,169,64,${light*.12*depth})`);glow.addColorStop(1,'rgba(111,150,51,0)');
        ctx.fillStyle=glow;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
      }
      // Tiny character cells, wing beat and abdomen share the same moving position.
      ctx.fillStyle=`rgba(211,228,119,${alpha})`;
      ctx.fillRect(x-size*.46,y-size*.62,size*.92,size*1.24);
      ctx.font=`${Math.max(1,size*.95)}px Consolas,monospace`;
      ctx.fillStyle=`rgba(36,62,29,${alpha*.9})`;ctx.fillText(depth>.8?'%':';',x,y);
      const beat=(Math.sin(t*7+phase)+1)*.5;
      ctx.font=`${Math.max(1.2,size*.82)}px Consolas,monospace`;
      ctx.fillStyle=`rgba(172,194,117,${alpha*.4})`;
      ctx.fillText(beat>.5?':':'.',x-size*(.85+beat*.4),y-size*.25);
      ctx.fillText(beat>.5?'.':':',x+size*(.85+beat*.4),y+size*.15);
      if(depth>.85) {
        ctx.fillStyle=`rgba(185,210,105,${alpha*.65})`;
        ctx.fillRect(x-size*.28,y+size*.82,size*.56,size*.55);
      }
    }
    const veil=ctx.createLinearGradient(0,0,w,0),alpha=quiet?.76:.19;
    veil.addColorStop(0,`rgba(5,17,19,${quiet?.2:0})`);
    veil.addColorStop(.31,`rgba(5,17,19,${alpha})`);veil.addColorStop(.69,`rgba(5,17,19,${alpha})`);
    veil.addColorStop(1,`rgba(5,17,19,${quiet?.2:0})`);
    ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
  });
}

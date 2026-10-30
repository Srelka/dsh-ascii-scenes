function createJellyfishScene(canvas, options={}) {
  const jellyfish=[
    {x:.39,y:.15,size:1.05,phase:1.4,period:4.4,seed:19,color:[157,127,190],light:[217,190,243]},
    {x:.865,y:.43,size:.86,phase:3.8,period:3.55,seed:57,color:[214,153,111],light:[255,215,179]},
    {x:.13,y:.74,size:1.16,phase:.2,period:4.9,seed:91,color:[222,144,202],light:[255,210,239]},
    {x:.65,y:.13,size:.36,phase:2.2,period:6.2,seed:137,color:[103,154,175],light:[151,199,210],far:true,opacity:.35},
    {x:.26,y:.43,size:.28,phase:4.1,period:5.8,seed:163,color:[106,137,175],light:[155,174,205],far:true,opacity:.25},
    {x:.74,y:.79,size:.24,phase:1.2,period:6.9,seed:193,color:[104,153,176],light:[155,200,207],far:true,opacity:.28},
  ].map(jelly=>({...jelly,ox:0,oy:0,vx:0,vy:0,burst:-100,px:0,py:0}));
  const layers=[...jellyfish].sort((a,b)=>a.size-b.size);
  const seenClicks=new WeakSet(),events=[];
  const pulse=(time,jelly)=>(.5+.5*Math.sin(time*Math.PI*2/jelly.period+jelly.phase))**3;
  const burst=age=>age<0?0:(1-Math.exp(-age*26))*Math.exp(-age*2.3);
  let previousTime=null;
  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,clicks}=view;
    const cell=Math.max(1.5,Math.min(w/108,h/66,16));
    const dt=previousTime===null?0:clamp(t-previousTime,0,.05);previousTime=t;
    function position(jelly) {
      const unit=cell*jelly.size;
      jelly.px=w*jelly.x+Math.sin(t*.17+jelly.phase)*unit*2.1+jelly.ox*cell;
      jelly.py=Math.max(cell*5.4,h*jelly.y+Math.sin(t*.12+jelly.phase)*h*.025
        +Math.sin(t*.27+jelly.phase)*unit*.55-Math.sin(t*Math.PI*2/jelly.period+jelly.phase)*unit*.95+jelly.oy*cell);
    }
    for(const jelly of jellyfish)position(jelly);
    // Consume shared lifecycle clicks once. Reactions outlive its 1.6-second
    // click buffer, but use the same animation clock, so pause also freezes them.
    for(const click of clicks) {
      if(seenClicks.has(click))continue;seenClicks.add(click);
      if(t-click.at>1.6)continue;
      let target=null,nearest=1;
      for(const jelly of jellyfish) {
        if(jelly.far)continue;
        const unit=cell*jelly.size;
        const distance=((click.x-jelly.px)/(unit*8.5))**2+((click.y-jelly.py-unit*8)/(unit*13))**2;
        if(distance<nearest){target=jelly;nearest=distance;}
      }
      if(target) {
        target.burst=t;
        const direction=Math.abs(click.x-target.px)<cell?Math.cos(target.phase):Math.sign(target.px-click.x);
        target.vx=clamp(target.vx+direction*11*1.15,-22,22);
        target.vy=clamp(target.vy-17*1.15,-26,16);
        events.push({kind:'jet',x:target.px/w,y:(target.py+cell*target.size*7)/h,at:t,color:target.light});
      }else events.push({kind:'flow',x:click.x/w,y:click.y/h,at:click.at});
      if(events.length>7)events.shift();
    }
    for(let i=events.length-1;i>=0;i--)if(t-events[i].at>(events[i].kind==='flow'?2.7:1.3))events.splice(i,1);
    const currents=events.filter(event=>event.kind==='flow');
    function flowAt(x,y) {
      let dx=0,dy=0;
      for(const event of currents) {
        const ex=event.x*w,ey=event.y*h,age=t-event.at,distance=Math.hypot(x-ex,y-ey);
        const front=12+age*cell*19,band=cell*3.2;
        const force=Math.exp(-(((distance-front)/band)**2))*Math.max(0,1-age/2.7)*1.15;
        dx+=(x-ex)/Math.max(distance,1)*force;dy+=(y-ey)/Math.max(distance,1)*force;
      }
      return {dx,dy};
    }
    for(const jelly of jellyfish) {
      const flow=flowAt(jelly.px,jelly.py+cell*jelly.size*2),weight=jelly.far?.35:1;
      // Offsets and velocities are in cell units; resize preserves the response.
      jelly.vx+=(flow.dx*35*weight-jelly.ox*1.65-jelly.vx*1.8)*dt;
      jelly.vy+=(flow.dy*26*weight-jelly.oy*1.45-jelly.vy*1.65)*dt;
      jelly.ox=clamp(jelly.ox+jelly.vx*dt,-8,8);jelly.oy=clamp(jelly.oy+jelly.vy*dt,-9,7);
      position(jelly);
    }
    const sea=ctx.createLinearGradient(0,0,0,h);
    sea.addColorStop(0,'#0b3042');sea.addColorStop(.52,'#091d30');sea.addColorStop(1,'#061022');
    ctx.fillStyle=sea;ctx.fillRect(0,0,w,h);
    // The light and grid continue across the whole workspace, including the sidebar.
    const water=ctx.createLinearGradient(0,0,w,0);
    for(const [at,color] of [[0,'#124d718f'],[.16,'#1c69959c'],[.35,'#0f3e5c00'],
      [.73,'#0f3e5c00'],[.93,'#15578b91'],[1,'#14508770']])water.addColorStop(at,color);
    ctx.fillStyle=water;ctx.fillRect(0,0,w,h);
    for(let i=0;i<3;i++) {
      const x=w*(.14+i*.37)+Math.sin(t*.065+i*1.8)*w*.025;
      ctx.save();ctx.translate(x,0);ctx.rotate(.13+i*.035);
      const ray=ctx.createLinearGradient(-w*.055,0,w*.055,0);
      ray.addColorStop(0,'#7bc7dd00');ray.addColorStop(.5,'#7bc7dd08');ray.addColorStop(1,'#7bc7dd00');
      ctx.fillStyle=ray;ctx.fillRect(-w*.055,-h*.1,w*.11,h*1.25);ctx.restore();
    }
    drawAmbientGrid(ctx,w,h,cell,'rgba(133,192,216,.014)');
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`${Math.max(2,cell*.85)}px Consolas,monospace`;
    for(let i=0;i<94;i++) {
      const depth=i%4===0?1:.55;
      let x=noise(i*13+71)*w+Math.sin(t*.16+i)*cell*1.5;
      let y=((noise(i*7+43)*h-t*(1.2+noise(i)*2.1)*cell/10)%h+h)%h;
      if(currents.length){const flow=flowAt(x,y);x+=flow.dx*cell*3.2*depth;y+=flow.dy*cell*3.2*depth;}
      ctx.fillStyle=`rgba(168,213,228,${(.055+noise(i+9)*.13)*depth})`;ctx.fillText(i%9===0?':':'.',x,y);
    }
    for(const jelly of layers) {
      const unit=cell*jelly.size,step=unit*1.34,phase=jelly.phase,hit=burst(t-jelly.burst);
      const squeeze=clamp(pulse(t,jelly)+hit*1.48,0,1.6),wide=1-squeeze*.19,tall=1+squeeze*.16;
      const rim=step*4.9*tall,opacity=jelly.opacity||1;
      const angle=clamp(jelly.vx/42,-.24,.24)+Math.sin(t*.24+phase)*.035;
      ctx.save();ctx.translate(jelly.px,jelly.py);ctx.rotate(angle);
      const ink=(mix,alpha=1)=>{
        const amount=clamp(mix+hit*.35,0,1),rgb=jelly.color.map((v,i)=>Math.round(v+(jelly.light[i]-v)*amount));
        return `rgba(${rgb.join(',')},${alpha*opacity})`;
      };
      if(!jelly.far) {
        const glow=ctx.createRadialGradient(0,rim*.4,unit,0,rim*.4,unit*12);
        glow.addColorStop(0,ink(.65,.055+hit*.17));glow.addColorStop(1,ink(.5,0));
        ctx.fillStyle=glow;ctx.fillRect(-unit*12,-unit*9,unit*24,unit*27);
      }
      function tile(px,py,mix,alpha,glyph,scaleX=1,scaleY=1) {
        const tw=unit*scaleX,th=step*scaleY,gap=Math.max(.24,unit*.09);
        ctx.fillStyle=ink(mix,alpha);ctx.fillRect(px-tw/2,py-th/2,Math.max(.5,tw-gap),Math.max(.5,th-gap));
        if(unit>=2.6) {
          ctx.font=`${unit*.91}px Consolas,monospace`;ctx.fillStyle=`rgba(24,31,54,${alpha*.8*opacity})`;
          ctx.fillText(glyph,px-gap/2,py-gap/2);
        }
      }
      for(let strand=0;strand<7;strand++) {
        const root=(strand-3)*1.7,length=13+Math.round(noise(jelly.seed+strand*17)*5);
        for(let segment=0;segment<length;segment++) {
          const f=segment/(length-1),lag=f*1.12;
          const delayed=clamp(pulse(t-lag,jelly)+burst(t-jelly.burst-f*.55)*1.48,0,1.6);
          const wave=Math.sin(t*1.65+phase+strand*.53-f*5.2),bend=Math.sin(t*.58+phase-f*2.8);
          let px=root*unit*(1-delayed*.19)+unit*(wave*(.12+f*.85)+bend*f*.5);
          let py=rim+step*(segment+.85)*(1-.085*delayed)+Math.sin(t*1.65+phase-f*4+strand*.4)*unit*f*.24;
          if(currents.length) {
            const flow=flowAt(jelly.px+px,jelly.py+py);px+=flow.dx*unit*(.25+f*2.4);py+=flow.dy*unit*f*1.7;
          }
          px-=jelly.vx*cell*f*f*.055;py-=jelly.vy*cell*f*f*.065;
          const n=noise(jelly.seed+strand*73+segment*11),alpha=(.69-f*.17)*(strand===3?.83:1);
          if(segment>1&&n>.72) {
            ctx.font=`${unit*.82}px Consolas,monospace`;ctx.fillStyle=ink(.3,alpha*.54);ctx.fillText(n>.9?'o':':',px,py);
          }else tile(px,py,.17+n*.46,alpha,'t:%s'[Math.floor(n*4)],.74,.91);
        }
      }
      for(let row=0;row<5;row++)for(let col=-7;col<=7;col++) {
        const u=col/7.35,v=(row-4.5)/4.85;if(u*u+v*v>1)continue;
        const n=noise(jelly.seed+col*23+row*41),edge=Math.abs(u)>.73||row===0;
        tile(col*unit*wide,row*step*tall,.26+u*.22+(1-row/6)*.25+n*.17,edge?.69:.83,'t%:;s'[Math.floor(n*5)],wide,tall);
      }
      for(let col=-6;col<=6;col++)tile(col*unit*wide,rim+Math.cos(col*Math.PI*.67)*unit*.16,.49,.84,col%2?'t':'%',wide,.66);
      ctx.font=`${unit*.86}px Consolas,monospace`;ctx.fillStyle=ink(.45,.22);
      for(const side of[-1,1])for(let i=0;i<3;i++)ctx.fillText(i%2?':':'o',side*(6.8+i*.35)*unit*wide,step*(3+i*.9)*tall);
      ctx.restore();
    }
    // Water clicks only move particles and nearby tentacles. No ring is drawn.
    ctx.font=`${Math.max(3,cell*.94)}px Consolas,monospace`;
    for(const event of events) {
      if(event.kind!=='jet')continue;
      const p=clamp((t-event.at)/1.3,0,1);ctx.fillStyle=`rgba(${event.color.join(',')},${(1-p)*.6})`;
      for(let i=0;i<9;i++)ctx.fillText(i%3?'.':'o',event.x*w+(noise(i+23)-.5)*cell*(3+p*4),event.y*h+p*cell*(4+noise(i)*6));
    }
    if(quiet) {
      const veil=ctx.createLinearGradient(0,0,w,0);
      for(const [at,alpha]of[[0,.25],[.27,.59],[.76,.59],[1,.25]])veil.addColorStop(at,`rgba(6,17,32,${alpha})`);
      ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
    }
  });
}

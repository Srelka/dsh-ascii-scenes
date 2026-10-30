function createLagoonScene(canvas, options={}) {
  const seenClicks=new WeakSet(),responses=[null,null];
  function responseAt(id,time) {
    const r=responses[id];if(!r)return {x:0,y:0,angle:0,stroke:0};
    const p=clamp((time-r.at)/2.55,0,1),ease=p*p*(3-2*p);
    return {x:r.x+r.glideX*ease,y:r.y+r.glideY*ease,
      angle:r.angle*(1-ease)+r.turn*Math.sin(Math.PI*ease),stroke:r.stroke+Math.PI*2*ease};
  }
  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    const cell=preview?Math.max(1,Math.min(w/110,h/68)):clamp(Math.min(h/68,w/92),4,16);
    // Extra screen-edge margin accommodates the short glide after a response.
    const reach=cell*23,track=w+reach*2,heading=Math.atan2(-h*.32,track);
    function posesAt(time) {
      const progress=((w*.76+reach+time*cell*.9)%track)/track;
      return [
        {x:progress*track-reach,y:h*.28-(progress-(w*.76+reach)/track)*h*.32+Math.sin(time*.2)*cell*.55,size:1,angle:heading+Math.sin(time*.2)*.035,phase:1.4},
        {x:w*.085+Math.sin(time*.09)*w*.055,y:h*.76+Math.sin(time*.12)*h*.07,size:.49,angle:2.2+Math.sin(time*.14)*.12,phase:4.8},
      ];
    }
    // The shared click list expires after 1.6 s; each turtle owns its full stroke.
    for(const click of clicks) {
      if(seenClicks.has(click))continue;seenClicks.add(click);
      const poses=posesAt(click.at);let nearest=null;
      for(let id=0;id<poses.length;id++) {
        const pose=poses[id],r=responseAt(id,click.at);
        const x=pose.x+r.x*cell,y=pose.y+r.y*cell,distance=Math.hypot(click.x-x,click.y-y);
        if(distance<cell*pose.size*18.2&&(!nearest||distance<nearest.distance))nearest={id,pose,r,x,y,distance};
      }
      if(!nearest)continue;
      const {id,pose,r,x,y}=nearest,angle=pose.angle+r.angle;
      const direction=Math.atan2(click.y-y,click.x-x);
      const turn=clamp(Math.atan2(Math.sin(direction-angle),Math.cos(direction-angle)),-.4,.4);
      const glide=id===0?2.8:1.4;
      responses[id]={at:click.at,x:r.x,y:r.y,angle:r.angle,stroke:r.stroke%(Math.PI*2),turn,
        glideX:clamp(r.x+Math.cos(angle+turn*.35)*glide,-4,4)-r.x,
        glideY:clamp(r.y+Math.sin(angle+turn*.35)*glide,-4,4)-r.y};
    }
    const sea=ctx.createLinearGradient(0,0,w,h*.16);
    for(const[at,color]of[[0,'#43babe'],[.13,'#42c3c5'],[.32,'#206b76'],[.69,'#18586a'],[.9,'#239eb8'],[1,'#218cae']])sea.addColorStop(at,color);
    ctx.fillStyle=sea;ctx.fillRect(0,0,w,h);
    const depth=ctx.createLinearGradient(0,0,0,h);
    depth.addColorStop(0,'rgba(116,239,214,.1)');depth.addColorStop(1,'rgba(3,44,66,.34)');
    ctx.fillStyle=depth;ctx.fillRect(0,0,w,h);
    drawAmbientGrid(ctx,w,h,cell,'rgba(154,238,218,.026)');

    // Slanting shafts and sparse caustics continue underneath the host sidebar.
    for(let i=0;i<4;i++) {
      const x=w*(i*.32-.08)+Math.sin(t*.095+i*1.7)*w*.025;
      ctx.save();ctx.transform(1,0,.13,1,0,0);
      const ray=ctx.createLinearGradient(x-w*.055,0,x+w*.055,0);
      ray.addColorStop(0,'rgba(158,255,231,0)');ray.addColorStop(.5,'rgba(158,255,231,.055)');ray.addColorStop(1,'rgba(158,255,231,0)');
      ctx.fillStyle=ray;ctx.fillRect(x-w*.055,0,w*.11,h);ctx.restore();
    }
    const waterStep=cell*2.2;
    ctx.font=`${cell*.78}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let row=0;row<h/waterStep;row++)for(let col=0;col<w/waterStep;col++) {
      const x=(col+.5)*waterStep,y=(row+.5)*waterStep;
      const wave=Math.sin(col*.47+row*.24-t*.31)+Math.sin(row*.61-col*.19+t*.22);
      if(wave<1.45)continue;
      const edge=.28+.72*Math.abs(x/w-.5)*2;
      ctx.fillStyle=`rgba(171,241,218,${(wave-1.45)*.19*edge})`;
      ctx.fillText(col%4?'~':':',x,y);
    }

    // Fixed glyphs belong to each animal; swimming changes geometry, not letters.
    function turtle(x,y,size,angle,phase,far=false,extraStroke=0) {
      const unit=cell*size,cos=Math.cos(angle),sin=Math.sin(angle);
      const stroke=t*1.34+phase+extraStroke,polygons=[];
      for(const side of[-1,1]) {
        const sweep=Math.sin(stroke+side*.14);
        const a=side*(1.91+sweep*.52),ca=Math.cos(a),sa=Math.sin(a);
        const bend=Math.sin(stroke-.48+side*.14)*.5;
        polygons.push([[-.8,-.9],[1.8,-1.35],[5.4,-.9],[8.6,bend],[6.8,.65+bend],[2,1.25],[-.8,1]].map(([u,v])=>[
          3.35+u*ca-v*sa,side*3.15+u*sa+v*ca,
        ]));
        const steer=Math.sin(stroke-.8+side*.24)*.42;
        polygons.push([[-4.7,side*2.9],[-5.4,side*4.3],[-8.8+steer,side*(6+steer)],[-9,side*4.65],[-6.6,side*2.6]]);
      }
      function inside(px,py,points) {
        let hit=false;
        for(let i=0,j=points.length-1;i<points.length;j=i++) {
          const [ax,ay]=points[i],[bx,by]=points[j];
          if((ay>py)!==(by>py)&&px<(bx-ax)*(py-ay)/(by-ay)+ax)hit=!hit;
        }
        return hit;
      }
      function part(px,py) {
        const shell=(px/7.25)**2+(py/5.05)**2;
        if(shell<1) {
          if(shell>.8)return 'rim';
          // Five vertebral scutes, flanked by staggered costal plates.
          const seam=Math.abs(py),rib=1.65+.27*Math.cos(px*1.28);
          if(Math.abs(seam-rib)<.23)return 'seam';
          const divider=seam<rib?Math.abs(Math.sin((px+.15)*1.28)):Math.abs(Math.sin(px*.93+seam*.35));
          return divider<.13?'seam':'shell';
        }
        if(((px-8.45)/2.45)**2+(py/1.7)**2<1) {
          if(px>9.1&&px<10.1&&Math.abs(py)>.72&&Math.abs(py)<1.25)return 'eye';
          return 'head';
        }
        if(px< -6.7&&px> -9.7&&Math.abs(py)<(px+9.7)*.24)return 'tail';
        for(const poly of polygons)if(inside(px,py,poly))return 'fin';
        return '';
      }
      ctx.save();ctx.globalAlpha=far?.66:1;
      ctx.font=`${unit*.88}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
      const glyphs='t%:s+';
      for(let row=-16;row<=16;row++)for(let col=-17;col<=17;col++) {
        const sx=col*.8,sy=row*.8,px=sx*cos+sy*sin,py=-sx*sin+sy*cos;
        const p=part(px,py);if(!p)continue;
        const n=noise(phase*31+col*17+row*43);
        const gx=Math.round(x+col*unit),gy=Math.round(y+row*unit);
        const light=clamp((3-py)/8,0,1);
        if(p==='shell')ctx.fillStyle=`rgb(${32+Math.round(light*13+n*8)},${96+Math.round(light*22+n*8)},${99+Math.round(light*13)})`;
        else if(p==='eye')ctx.fillStyle='#183f43';
        else if(p==='seam')ctx.fillStyle='#6c956c';
        else if(p==='rim')ctx.fillStyle=py<0?'#b6aa55':'#908848';
        else ctx.fillStyle=py<0?'#b0b16a':'#929c57';
        const gap=unit<4?unit*.13:1;
        ctx.fillRect(gx,gy,unit-gap,unit-gap);
        ctx.fillStyle=p==='shell'?'rgba(155,196,148,.38)':p==='eye'?'#d3dc94':'rgba(30,68,54,.66)';
        ctx.fillText(p==='eye'?'.':glyphs[Math.floor(n*glyphs.length)],gx+unit/2,gy+unit/2);
      }
      ctx.restore();
    }
    // The heading follows the diagonal path; the slow roll never rotates the lattice.
    const poses=posesAt(t);
    for(const id of[1,0]) {
      const pose=poses[id],r=responseAt(id,t);
      turtle(pose.x+r.x*cell,pose.y+r.y*cell,pose.size,pose.angle+r.angle,pose.phase,id===1,r.stroke);
    }

    // Five overlapping hibiscus petals, with a distinct golden stamen.
    const fx=w*.67+Math.sin(t*.13)*cell*1.8,fy=h*.67+Math.sin(t*.17+.7)*cell;
    drawCharacterField(ctx,{x:fx,y:fy,columns:13,rows:13,cell:cell*.64,aspect:1,time:0,seed:73,glyphs:'s%:+',
      coverage:(u,v)=>{for(let i=0;i<5;i++){const a=i*Math.PI*2/5+t*.035;if((u-Math.cos(a)*.34)**2+(v-Math.sin(a)*.34)**2<.19)return 1;}return 0;},
      fill:(u,v)=>Math.hypot(u,v)<.18?'#d6ae64':v<0?'#b64b69':'#923d60',ink:()=> 'rgba(64,31,56,.65)',
    });
    ctx.fillStyle='#dbbd73';ctx.fillRect(fx+cell*.2,fy-cell*.9,Math.max(1,cell*.24),cell*1.15);
    ctx.fillRect(fx,fy-cell*1.13,cell*.65,Math.max(1,cell*.25));

    // Pale reef fans sit at the bottom edges; the central reading area stays open.
    for(const side of[0,1]) {
      drawCharacterField(ctx,{x:side?w*.97:w*.035,y:h*.96,columns:17,rows:15,cell:cell*.75,aspect:1.15,time:0,seed:side+90,glyphs:'t%:;',
        coverage:(u,v)=>{
          const sway=Math.sin(t*.6+v*2+side)*.055*(1-v),stem=Math.abs(u-sway);
          return stem<.1||Math.abs(v+.35-Math.abs(u-sway)*1.5)<.1||Math.abs(v-.22-Math.abs(u-sway)*1.15)<.09?1:0;
        },
        fill:(_u,v)=>v>.35?'#829a7d':'#b9d4bb',ink:()=> 'rgba(39,91,86,.6)',
      });
    }
    ctx.font=`${cell*.85}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='rgba(210,252,230,.32)';
    for(let i=0;i<30;i++) {
      const x=noise(i+21)*w+Math.sin(t*.4+i)*cell*.7;
      const y=((noise(i+41)*h-t*cell*(.45+noise(i)*.8))%h+h)%h;
      ctx.fillText(i%6?'·':'o',x,y);
    }
    if(quiet) {
      const veil=ctx.createLinearGradient(0,0,w,0);
      veil.addColorStop(0,'rgba(12,53,66,.12)');veil.addColorStop(.28,'rgba(12,53,66,.72)');
      veil.addColorStop(.78,'rgba(12,53,66,.72)');veil.addColorStop(1,'rgba(12,53,66,.12)');
      ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
    }
  });
}

function createKoiScene(canvas, options={}) {
  // Geometry and markings use fish coordinates; characters never flicker at random.
  const fish=[
    {x:.86,y:.25,length:.24,angle:1.02,phase:.4,speed:.041,kind:'gold',depth:.94},
    {x:.81,y:.62,length:.27,angle:-2.03,phase:3.2,speed:.035,kind:'ochre',depth:.64},
    {x:.16,y:.72,length:.35,angle:.76,phase:5.3,speed:.031,kind:'white',depth:.96},
  ];
  const leaves=[
    {x:.93,y:.13,r:.062,angle:1.6,seed:13},
    {x:.91,y:.52,r:.044,angle:2.3,seed:31},
    {x:.96,y:.89,r:.064,angle:.4,seed:53},
    {x:.075,y:.35,r:.035,angle:-.5,seed:71},
    {x:.24,y:.95,r:.043,angle:-1.9,seed:97},
    {x:.65,y:.055,r:.026,angle:.9,seed:111},
  ];
  const petalGroups=[
    {x:.29,y:.19,angle:.3,size:1,phase:0},
    {x:.77,y:.13,angle:-.7,size:.8,phase:2},
    {x:.93,y:.40,angle:1.2,size:1,phase:3},
    {x:.92,y:.72,angle:-.5,size:.95,phase:4},
    {x:.35,y:.76,angle:.8,size:.9,phase:6},
  ];
  const petalMask=['..aa..','.abba.','abbbbc','abbbcc','.bbcc.','..cc..','..d...'];
  const petalColors={a:'#ebc3b7',b:'#dca4a4',c:'#bf7e89',d:'#946675'};
  const glyphs='st%:s;';
  let waterGrid=null,waterWidth=0,waterHeight=0,waterCell=0,waterTime=0;
  const handledClicks=new WeakSet();
  return createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    const scale=Math.min(w/1280,h/820);
    const cell=preview?Math.max(1.25,Math.min(w/119,h/76)):clamp(10*scale,5,14);
    const stepY=cell*1.12;
    if(!waterGrid||waterWidth!==w||waterHeight!==h||waterCell!==cell){
      waterGrid=createKoiWaterGrid(w,h,cell);waterWidth=w;waterHeight=h;waterCell=cell;waterTime=t;
    }
    waterGrid.step(Math.max(0,t-waterTime));waterTime=t;
    // Shared clicks remain in the view for 1.6 seconds; each press is applied once.
    for(const click of clicks)if(!handledClicks.has(click)){
      handledClicks.add(click);waterGrid.impact(click.x,click.y);
    }
    const water=ctx.createLinearGradient(0,0,w,0);
    for(const [at,color] of [[0,'#429d8b'],[.12,'#58b3a0'],[.32,'#204f48'],[.70,'#1c4942'],[.91,'#318b79'],[1,'#3f9c86']])water.addColorStop(at,color);
    ctx.fillStyle=water;ctx.fillRect(0,0,w,h);
    const depth=ctx.createLinearGradient(0,0,0,h);
    depth.addColorStop(0,'rgba(134,210,178,.10)');depth.addColorStop(1,'rgba(4,46,41,.24)');
    ctx.fillStyle=depth;ctx.fillRect(0,0,w,h);
    waterGrid.draw(ctx);

    // Low-frequency reflections move through the whole workspace, including the sidebar.
    for(let i=0;i<3;i++) {
      const x=w*(.10+i*.42)+Math.sin(t*.10+i*2)*w*.025;
      const light=ctx.createLinearGradient(x-w*.09,0,x+w*.09,0);
      light.addColorStop(0,'rgba(170,245,203,0)');light.addColorStop(.5,'rgba(170,245,203,.035)');light.addColorStop(1,'rgba(170,245,203,0)');
      ctx.fillStyle=light;ctx.fillRect(x-w*.09,0,w*.18,h);
    }
    ctx.font=`${cell*.78}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let row=0;row<h/stepY;row+=2)for(let col=0;col<w/cell;col+=2) {
      const n=noise(col*19+row*37);
      if(n<.57)continue;
      const ox=(col+.5)*cell,oy=(row+.5)*stepY,wave=waterGrid.sample(ox,oy);
      const x=ox+wave.x,y=oy+wave.y;
      const edge=.22+.78*Math.abs(x/w-.5)*2;
      const alpha=Math.min(.38,(.025+.055*(.5+.5*Math.sin(col*.18+row*.31+t*.30)))*edge+Math.abs(wave.light)*.28);
      ctx.fillStyle=`rgba(181,227,185,${alpha})`;
      ctx.fillText(n>.88?'~':n>.72?':':'·',x,y);
    }

    function koi(spec) {
      const {phase,kind}=spec;
      // A slow closed route has no wrap jump, and points in the direction of travel.
      const a=spec.angle+t*spec.speed;
      const length=Math.min(w*.48,h*spec.length*1.16);
      const rx=w*(kind==='white'?.055:.045),ry=h*.105;
      const x=w*spec.x+rx*(Math.sin(a)-Math.sin(spec.angle));
      const y=h*spec.y-ry*(Math.cos(a)-Math.cos(spec.angle));
      const angle=Math.atan2(ry*Math.sin(a),rx*Math.cos(a));
      const cos=Math.cos(angle),sin=Math.sin(angle);
      const beat=t*(kind==='white'?1.62:1.83)+phase;
      const bend=u=>{
        const tail=clamp((.48-u)/1.05,0,1.34);
        return Math.sin(beat-tail*3.2)*tail*tail*.073;
      };
      const bodyWidth=u=>{
        const s=(u+.57)/1.13;
        return s>0&&s<1?.163*Math.pow(Math.sin(Math.PI*s),.65)*(.42+.78*s):0;
      };
      const fins=[-1,1].map(side=>{
        const sweep=Math.sin(beat+.6+side*.45);
        return {cx:.095-sweep*.018,cy:side*(.158+sweep*.025),angle:side*(.62+sweep*.18)};
      });
      function part(u,v) {
        const b=v-bend(u),radius=bodyWidth(u);
        if(radius&&Math.abs(b)<radius)return {type:'body',b,radius};
        // The tail grows from a narrow peduncle into two flexible lobes.
        const q=(-u-.47)/.36;
        if(q>0&&q<1) {
          const mid=bend(-.47)+(bend(-.83)-bend(-.47))*q;
          const distance=Math.abs(v-mid),fan=.024+q*.17;
          if(distance<fan&&!(q>.70&&distance<(q-.70)*.30))return {type:'tail',b:v-mid};
        }
        for(const fin of fins) {
          const fx=u-fin.cx,fy=v-bend(fin.cx)-fin.cy,c=Math.cos(fin.angle),s=Math.sin(fin.angle);
          const along=fx*c+fy*s,across=-fx*s+fy*c;
          if((along/.14)**2+(across/.056)**2<1)return {type:'fin',b:across};
        }
        for(const side of [-1,1]) {
          const fx=u+.30,fy=b-side*.085;
          if((fx/.092)**2+(fy/.042)**2<1)return {type:'fin',b:fy};
        }
        return null;
      }
      const palettes={
        white:{base:'#dddcc1',light:'#f0ecd6',edge:'#adbea3',red:'#ba6850',redLight:'#d78262',fin:'#b9cbb1',ink:'#3d6654'},
        gold:{base:'#bc9750',light:'#d6b665',edge:'#91894b',red:'#bd7d42',redLight:'#d59a50',fin:'#ad9a50',ink:'#405a37'},
        ochre:{base:'#aa8743',light:'#c29a4d',edge:'#7f7840',red:'#996b3c',redLight:'#b88542',fin:'#8b8747',ink:'#3b5436'},
      };
      const palette=palettes[kind];
      // Sample a tight world-space box to keep all characters upright on the water grid.
      const halfX=length*(Math.abs(cos)*.85+Math.abs(sin)*.34);
      const halfY=length*(Math.abs(sin)*.85+Math.abs(cos)*.34);
      const startX=Math.floor((x-halfX)/cell),endX=Math.ceil((x+halfX)/cell);
      const startY=Math.floor((y-halfY)/stepY),endY=Math.ceil((y+halfY)/stepY);
      const tiles=[];
      for(let row=startY;row<=endY;row++)for(let col=startX;col<=endX;col++) {
        const px=(col+.5)*cell,py=(row+.5)*stepY;
        if(px< -cell||px>w+cell||py< -stepY||py>h+stepY)continue;
        const dx=(px-x)/length,dy=(py-y)/length;
        const u=dx*cos+dy*sin,v=-dx*sin+dy*cos,p=part(u,v);
        if(!p)continue;
        const n=noise(Math.floor(u*34)*29+Math.floor(p.b*58)*13+phase*17);
        let color=palette.fin,char=glyphs[Math.floor(n*glyphs.length)],alpha=.76;
        if(p.type==='body') {
          const edge=Math.abs(p.b)/p.radius;
          const patch=((u-.30)/.13)**2+((p.b+.025)/.11)**2<1||
            ((u+.08)/.16)**2+((p.b-.048)/.092)**2<1||
            ((u+.39)/.075)**2+((p.b+.012)/.05)**2<1;
          color=patch?(n>.58?palette.redLight:palette.red):edge>.79?palette.edge:n>.52?palette.light:palette.base;
          alpha=1;
          if(u>.39&&u<.48&&Math.abs(p.b)>.045&&Math.abs(p.b)<.079){color='#254a3d';char='·';}
          else if(u>.50){char=':';}
        } else if(p.type==='tail') {
          color=Math.abs(p.b)>.07?palette.light:palette.fin;
          alpha=.70;char=n>.5?'/':':';
        } else char=n>.5?'/':'·';
        tiles.push({px,py,color,char,alpha});
      }
      ctx.globalAlpha=spec.depth*.16;ctx.fillStyle='#123f37';
      for(const tile of tiles)ctx.fillRect(tile.px-cell*.25+5*scale,tile.py-stepY*.2+10*scale,cell,stepY);
      ctx.font=`${cell*.92}px Consolas,monospace`;
      for(const tile of tiles) {
        ctx.globalAlpha=spec.depth*tile.alpha;ctx.fillStyle=tile.color;
        ctx.fillRect(tile.px-cell*.5,tile.py-stepY*.5,cell*.90,stepY*.90);
        ctx.globalAlpha=spec.depth*tile.alpha*.80;ctx.fillStyle=palette.ink;
        ctx.fillText(tile.char,tile.px,tile.py);
      }
      ctx.globalAlpha=1;
      // A short, soft wake trails the tail; it is never a rigid fish outline.
      ctx.font=`${cell*.72}px Consolas,monospace`;
      for(let i=0;i<6;i++) {
        const u=-.88-i*.055,v=bend(-.83)+Math.sin(beat-i*.7)*.025;
        ctx.fillStyle=`rgba(172,218,178,${(.12-i*.017)*spec.depth})`;
        ctx.fillText('·',x+(u*cos-v*sin)*length,y+(u*sin+v*cos)*length);
      }
    }
    // Deeper fish first, then surface fish, then pads floating above both.
    koi(fish[1]);koi(fish[0]);koi(fish[2]);

    for(const leaf of leaves) {
      const radius=Math.min(w,h)*leaf.r;
      const x=w*leaf.x+Math.sin(t*.13+leaf.seed)*scale*5;
      const y=h*leaf.y+Math.cos(t*.11+leaf.seed)*scale*4;
      const angle=leaf.angle+Math.sin(t*.12+leaf.seed)*.07;
      const cols=Math.ceil(radius*2/cell)+2,rows=Math.ceil(radius*2/stepY)+2;
      ctx.font=`${cell*.9}px Consolas,monospace`;
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
        const px=Math.floor((x-radius)/cell+col)*cell,py=Math.floor((y-radius)/stepY+row)*stepY;
        const u=(px+cell/2-x)/radius,v=(py+stepY/2-y)/radius;
        const a=Math.atan2(v,u),r=Math.hypot(u,v);
        const notch=Math.atan2(Math.sin(a-angle),Math.cos(a-angle));
        if(r>1+.045*Math.sin(a*5+leaf.seed)||Math.abs(notch)<.27&&r>.15)continue;
        const n=noise(col*19+row*23+leaf.seed);
        const vein=Math.abs(Math.sin((a-angle)*4))<.13&&r>.22;
        ctx.fillStyle='rgba(10,65,48,.20)';ctx.fillRect(px+3*scale,py+5*scale,cell,stepY);
        ctx.fillStyle=r>.82?'#628c43':vein?'#83a652':n>.65?'#86af53':'#759e49';
        ctx.fillRect(px,py,cell*.90,stepY*.90);
        ctx.fillStyle='rgba(28,79,43,.72)';ctx.fillText(glyphs[Math.floor(n*glyphs.length)],px+cell/2,py+stepY/2);
      }
    }
    // Three tapered petals per cluster; sample the rotation while keeping pixels upright.
    function petal(x,y,unit,angle,alpha) {
      const cos=Math.cos(angle),sin=Math.sin(angle);
      const radius=Math.ceil(Math.hypot(6,7)/2);
      ctx.globalAlpha=alpha;
      for(let row=-radius;row<=radius;row++)for(let col=-radius;col<=radius;col++) {
        const dx=col*unit,dy=row*unit;
        const ix=Math.floor((dx*cos+dy*sin)/unit+3),iy=Math.floor((-dx*sin+dy*cos)/unit+3.5);
        const color=petalColors[petalMask[iy]?.[ix]];
        if(!color)continue;
        ctx.fillStyle='#103c3340';ctx.fillRect(x+dx+unit*.35,y+dy+unit*.65,unit*.93,unit*.93);
        ctx.fillStyle=color;ctx.fillRect(x+dx,y+dy,unit*.93,unit*.93);
      }
      ctx.globalAlpha=1;
    }
    const petalScale=preview?Math.max(.12,scale):Math.max(.73,scale);
    for(const group of petalGroups) {
      const size=petalScale*group.size;
      const x=w*group.x+Math.sin(t*.12+group.phase)*9*petalScale;
      const y=h*group.y+Math.cos(t*.1+group.phase)*5*petalScale;
      const angle=group.angle*.25+Math.sin(t*.09+group.phase)*.14;
      petal(x-11*size,y+3*size,3.1*size,-.65+angle,.83);
      petal(x+11*size,y-6*size,2.7*size,.90+angle,.83*.94);
      petal(x+26*size,y+12*size,2.3*size,2.40+angle,.83*.79);
    }
    // Reading mode dims the whole scene gently, with more shelter behind the text.
    if(quiet){ctx.fillStyle='rgba(13,47,40,.27)';ctx.fillRect(0,0,w,h);}
    const veil=ctx.createLinearGradient(0,0,w,0),alpha=quiet?.53:.07;
    veil.addColorStop(0,'rgba(15,48,41,0)');veil.addColorStop(.29,`rgba(15,48,41,${alpha})`);
    veil.addColorStop(.73,`rgba(15,48,41,${alpha})`);veil.addColorStop(1,'rgba(15,48,41,0)');
    ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
  });
}

function createKoiWaterGrid(width,height,cell) {
  const columns=Math.ceil(width/cell)+1,rows=Math.ceil(height/cell)+1,size=columns*rows;
  let current=new Float32Array(size),previous=new Float32Array(size),next=new Float32Array(size);
  const offsetX=new Float32Array(size),offsetY=new Float32Array(size),light=new Float32Array(size);
  const dynamic=new Uint8Array(size);
  let elapsed=0,accumulator=0,lastImpact=-100,energy=0,tailGain=1;
  function impact(x,y) {
    const cx=x/cell,cy=y/cell;
    for(let row=Math.max(1,Math.floor(cy-7));row<=Math.min(rows-2,Math.ceil(cy+7));row++) {
      for(let col=Math.max(1,Math.floor(cx-7));col<=Math.min(columns-2,Math.ceil(cx+7));col++) {
        const dx=col-cx,dy=(row-cy)/.78,d2=dx*dx+dy*dy;
        const press=-2.8*Math.exp(-d2/5.0)+.42*Math.exp(-d2/19);
        const index=row*columns+col;
        current[index]=clamp(current[index]+press,-4,4);
        previous[index]=clamp(previous[index]+press*.78,-4,4);
      }
    }
    // The old wave has already faded in its stored state, so a new press cannot revive it.
    lastImpact=elapsed;tailGain=1;
    derive();
  }
  function derive() {
    energy=0;
    for(let row=1;row<rows-1;row++)for(let col=1;col<columns-1;col++){
      const i=row*columns+col,h=current[i];
      const gx=(current[i+1]-current[i-1])*.5,gy=(current[i+columns]-current[i-columns])*.5;
      offsetX[i]=Math.tanh(gx*4.2)*cell*.35;
      offsetY[i]=clamp(Math.tanh(gy*4.2)*cell*.35-h*.75,-cell*.38,cell*.38);
      light[i]=clamp(-gx*1.85-gy*2.45+h*.055,-1,1);
      dynamic[i]=Math.abs(offsetX[i])+Math.abs(offsetY[i])>.005?1:0;
      energy=Math.max(energy,Math.abs(h),Math.abs(gx),Math.abs(gy));
    }
  }
  function step(dt) {
    if(dt<=0)return;
    elapsed+=dt;
    if(!energy){accumulator=0;return;}
    // Preserve propagation, then ease the whole wave state to zero over its final 1.2 seconds.
    const tail=clamp((elapsed-lastImpact-2.6)/1.2,0,1);
    const gain=(1-tail)*(1-tail)*(1+2*tail);
    const attenuation=gain/tailGain;tailGain=gain;
    if(!gain){
      current.fill(0);previous.fill(0);next.fill(0);offsetX.fill(0);offsetY.fill(0);light.fill(0);dynamic.fill(0);energy=0;
      accumulator=0;return;
    }
    accumulator+=Math.min(dt,.08);
    while(accumulator>=1/60){
      accumulator-=1/60;
      for(let row=1;row<rows-1;row++)for(let col=1;col<columns-1;col++){
        const i=row*columns+col;
        const lap=(current[i-1]+current[i+1]-2*current[i])*.17+(current[i-columns]+current[i+columns]-2*current[i])*.12;
        next[i]=clamp((current[i]*2-previous[i]+lap)*.985,-4,4);
      }
      const old=previous;previous=current;current=next;next=old;
    }
    if(attenuation<1)for(let i=0;i<size;i++){
      current[i]*=attenuation;previous[i]*=attenuation;
    }
    derive();
  }
  function sample(x,y) {
    if(!energy)return {x:0,y:0,light:0};
    const fx=clamp(x/cell,0,columns-1.001),fy=clamp(y/cell,0,rows-1.001);
    const col=Math.floor(fx),row=Math.floor(fy),tx=fx-col,ty=fy-row,i=row*columns+col;
    const blend=array=>array[i]*(1-tx)*(1-ty)+array[i+1]*tx*(1-ty)+array[i+columns]*(1-tx)*ty+array[i+columns+1]*tx*ty;
    return {x:blend(offsetX),y:blend(offsetY),light:blend(light),height:blend(current)};
  }
  function draw(ctx) {
    const point=i=>({x:(i%columns)*cell+offsetX[i],y:Math.floor(i/columns)*cell+offsetY[i]});
    ctx.beginPath();
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const i=row*columns+col,x=col*cell+offsetX[i],y=row*cell+offsetY[i];
      if(col>0&&col<columns-1&&!dynamic[i]&&!dynamic[i-1]&&!dynamic[i+1])continue;
      if(col===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    for(let col=0;col<columns;col++)for(let row=0;row<rows;row++){
      const i=row*columns+col,x=col*cell+offsetX[i],y=row*cell+offsetY[i];
      if(row>0&&row<rows-1&&!dynamic[i]&&!dynamic[i-columns]&&!dynamic[i+columns])continue;
      if(row===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.strokeStyle='rgba(176,230,182,.034)';ctx.lineWidth=.8;ctx.stroke();
    for(let row=1;row<rows-2;row++)for(let col=1;col<columns-2;col++){
      const i=row*columns+col;
      let shade=(light[i]+light[i+1]+light[i+columns]+light[i+columns+1])*.25;
      if(Math.abs(shade)<.001)continue;
      // Weak reflections fade through the old drawing threshold instead of popping off.
      const reflection=clamp(Math.abs(shade)/.018,0,1);
      shade*=reflection*reflection*(3-2*reflection);
      const a=point(i),b=point(i+1),c=point(i+columns+1),d=point(i+columns);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();
      ctx.fillStyle=shade>0?`rgba(187,220,173,${shade*.25})`:`rgba(3,37,30,${-shade*.32})`;ctx.fill();
      // Only the grid edges facing the light catch it; no separate circular outline is drawn.
      ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(a.x,a.y);ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=shade>0?`rgba(207,232,190,${shade*.48})`:`rgba(4,34,28,${-shade*.45})`;ctx.lineWidth=.9;ctx.stroke();
    }
  }
  return {impact,step,sample,draw,get energy(){return energy;}};
}

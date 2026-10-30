function createPaperScene(canvas, options={}) {
  const boats=[
    {x:.075,y:.27,size:.86,angle:.48,phase:.8,seed:11,depth:1},
    {x:.79,y:.23,size:1.02,angle:-1.37,phase:0,seed:37,depth:.9},
    {x:.47,y:.49,size:.73,angle:1.04,phase:2.1,seed:71,depth:.62},
    {x:.17,y:.79,size:.9,angle:1.01,phase:3.3,seed:107,depth:1},
    {x:.925,y:.73,size:.88,angle:-.51,phase:4.5,seed:139,depth:1},
  ];
  let cachedCell=0,cachedRatio=0,papers=[];
  const touches=[],touchDuration=2.6;

  // Sample the folds on an upright character lattice. The paper's texture is
  // fixed to its hull, so the letters travel with it instead of flickering.
  function buildBoat(boat,cell,ratio) {
    const half=cell*12.5*boat.size,stepY=cell*1.3;
    const cos=Math.cos(boat.angle),sin=Math.sin(boat.angle),result=[];
    const reachX=half*(Math.abs(cos)+.44*Math.abs(sin));
    const reachY=half*(Math.abs(sin)+.44*Math.abs(cos));
    for(let row=-Math.ceil(reachY/stepY);row<=Math.ceil(reachY/stepY);row++) {
      for(let col=-Math.ceil(reachX/cell);col<=Math.ceil(reachX/cell);col++) {
        const x=col*cell,y=row*stepY;
        const u=(x*cos+y*sin)/half,v=(-x*sin+y*cos)/half;
        if(Math.abs(u)+Math.abs(v)/.44>1)continue;
        const n=noise(boat.seed+col*17+row*43);
        const seam=.025-u*.035;
        let fill=v<seam?'#edf0df':'#bccfca';
        if(u<-.2)fill=v<seam?'#d7e3d7':'#97b6b5';
        // A recessed triangular pocket and a bright diagonal ridge make a
        // folded sheet, rather than an undifferentiated white lozenge.
        if(u>-.65&&u<.37&&v<seam&&v>seam-(1-Math.abs((u+.14)/.51))*.19)fill='#72999a';
        if(Math.abs(v-seam)<.035)fill='#f4f1dc';
        if(v>seam&&Math.abs(v-(u+.65)*.28)<.04)fill='#dae4d5';
        const glyph='t%;:t:;'[Math.floor(n*7)];
        result.push({x,y,fill,glyph,ink:n>.6?'rgba(36,77,79,.65)':'rgba(36,77,79,.48)'});
      }
    }
    const left=-(Math.ceil(reachX/cell)+1)*cell;
    const top=-(Math.ceil(reachY/stepY)+1)*stepY;
    const bitmap=new OffscreenCanvas(Math.ceil(-left*2*ratio),Math.ceil(-top*2*ratio));
    const ink=bitmap.getContext('2d'),gap=cell<4?cell*.12:1.2;
    ink.setTransform(ratio,0,0,ratio,-left*ratio,-top*ratio);
    ink.textAlign='center';ink.textBaseline='middle';ink.font=`${cell*.98}px Consolas,monospace`;
    ink.fillStyle='rgba(13,60,68,.2)';
    for(const tile of result)ink.fillRect(tile.x-cell/2+cell*.2,tile.y-cell*.65+cell*.45,cell-gap,cell*1.3-gap);
    for(const tile of result) {
      ink.fillStyle=tile.fill;ink.fillRect(tile.x-cell/2,tile.y-cell*.65,cell-gap,cell*1.3-gap);
      ink.fillStyle=tile.ink;ink.fillText(tile.glyph,tile.x-gap/2,tile.y-gap/2);
    }
    return {bitmap,left,top,width:bitmap.width/ratio,height:bitmap.height/ratio};
  }

  const controller=createAmbientScene(canvas,options,(ctx,view)=>{
    const {width:w,height:h,time:t,quiet,preview,clicks}=view;
    const cell=preview?Math.max(.8,Math.min(w/120,h/72)):clamp(Math.min(w/120,h/72),5,14);
    const ratio=Math.min(devicePixelRatio||1,2);
    if(cell!==cachedCell||ratio!==cachedRatio){papers=boats.map(boat=>buildBoat(boat,cell,ratio));cachedCell=cell;cachedRatio=ratio;}
    // The shared click list expires at 1.6 s. Retain at most four touches so
    // the selected water response can finish its 2.6 s decay without a cut.
    while(touches.length&&t-touches[0].at>=touchDuration)touches.shift();
    for(const click of clicks.slice(-4)) {
      if(t-click.at<touchDuration&&!touches.some(touch=>touch.at===click.at&&touch.x===click.x&&touch.y===click.y))touches.push(click);
    }
    if(touches.length>4)touches.splice(0,touches.length-4);
    const waves=touches.filter(click=>t>click.at).map(click=>{
      const age=t-click.at;
      return {x:click.x,y:click.y,front:age*125,fade:Math.sin(Math.PI*age/touchDuration)**.65*(quiet?.55:1),phase:noise(click.x+click.y)*Math.PI*2};
    });
    function deformation(x,y) {
      let shiftX=0,shiftY=0,light=0;
      for(const wave of waves) {
        const dx=x-wave.x,dy=(y-wave.y)*1.55,r=Math.hypot(dx,dy),d=(r-wave.front)/44;
        if(Math.abs(d)>2.8)continue;
        const ripple=Math.sin(d*Math.PI)*Math.exp(-d*d*.8)*wave.fade;
        const amount=ripple*5.5*(1+.12*Math.sin(Math.atan2(dy,dx)*3+wave.phase));
        shiftX+=dx/Math.max(r,1)*amount;shiftY+=dy/Math.max(r,1)*amount/1.55;
        light+=Math.abs(ripple)*.38;
      }
      return {x:shiftX,y:shiftY,light};
    }
    const water=ctx.createLinearGradient(0,0,w,0);
    for(const[at,color]of[[0,'#579da5'],[.12,'#70b5b8'],[.31,'#2b5c63'],[.63,'#244f59'],[.81,'#285d68'],[1,'#3e8c9d']])water.addColorStop(at,color);
    ctx.fillStyle=water;ctx.fillRect(0,0,w,h);
    const depth=ctx.createLinearGradient(0,0,0,h);
    depth.addColorStop(0,'rgba(174,215,204,.07)');depth.addColorStop(1,'rgba(9,53,66,.16)');
    ctx.fillStyle=depth;ctx.fillRect(0,0,w,h);
    if(cell>=2) {
      const step=Math.max(10,cell*2);
      ctx.strokeStyle='rgba(186,229,218,.035)';ctx.lineWidth=1;
      // Use the same lattice paths before, during and after a touch so the
      // untouched water does not change brightness when the wave starts.
      ctx.beginPath();
      for(let x=0;x<w;x+=cell)for(let y=0;y<h+step;y+=step) {
        const px=Math.round(x)+.5,py=Math.min(y,h),q=deformation(px,py);
        if(y===0)ctx.moveTo(px+q.x,py+q.y);else ctx.lineTo(px+q.x,py+q.y);
      }
      ctx.stroke();ctx.beginPath();
      for(let y=0;y<h;y+=cell)for(let x=0;x<w+step;x+=step) {
        const px=Math.min(x,w),py=Math.round(y)+.5,q=deformation(px,py);
        if(x===0)ctx.moveTo(px+q.x,py+q.y);else ctx.lineTo(px+q.x,py+q.y);
      }
      ctx.stroke();
    }

    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`${cell*.8}px Consolas,monospace`;
    // Short current bands advect independently across the whole workspace,
    // including the sidebar. The broad water lighting stays still.
    for(let i=0;i<58;i++) {
      const length=3+Math.floor(noise(i+211)*7),span=length*cell*1.5;
      const x=((noise(i+7)*w+t*cell*(.32+noise(i+53)*.3)+span)%(w+2*span))-span;
      const y=noise(i+31)*h+Math.sin(t*.38+i)*cell*.35;
      for(let j=0;j<length;j++) {
        const px=x+j*cell*1.5,py=y+Math.sin(j*.65+t*.65+i)*cell*.22,q=deformation(px,py);
        ctx.fillStyle=`rgba(167,222,217,${(.035+.065*Math.sin((j+1)/(length+1)*Math.PI))*(quiet?.55:1)+q.light})`;
        ctx.fillText(j%4===0?'·':'~',px+q.x,py+q.y);
      }
    }

    function wake(x,y,half,angle,phase,opacity) {
      const cos=Math.cos(angle),sin=Math.sin(angle);
      ctx.font=`${cell*.79}px Consolas,monospace`;
      // Expanding broken rings remain attached to the hull and travel aft.
      for(let ring=0;ring<3;ring++) {
        const p=((t*.23+phase+ring/3)%1+1)%1;
        const length=half*(1.03+p*.22),beam=half*(.42+p*.32);
        ctx.fillStyle=`rgba(186,233,223,${(1-p)*.23*opacity})`;
        for(let k=0;k<28;k++) {
          const a=k*Math.PI/14;
          if(k%7===0||noise(k+ring*31+phase*11)<.19)continue;
          const u=Math.cos(a)*length-p*cell*1.8,v=Math.sin(a)*beam;
          const px=x+u*cos-v*sin,py=y+u*sin+v*cos,q=deformation(px,py);
          ctx.fillText(k%3?'·':'o',px+q.x,py+q.y);
        }
      }
    }

    for(let i=0;i<boats.length;i++) {
      const boat=boats[i],half=cell*12.5*boat.size;
      const drift=t*(.037+i*.002);
      const x=w*boat.x+Math.sin(drift+boat.phase)*w*.055;
      const y=h*boat.y+Math.sin(t*.029+boat.phase)*h*.022+Math.sin(t*.91+boat.phase)*cell*.14;
      const q=deformation(x,y),px=x+q.x*.35,py=y+q.y*.35;
      const rocking=Math.sin(t*.64+boat.phase)*.023+Math.sin(t*.27+boat.phase)*.011+q.y*.004;
      const opacity=boat.depth*(quiet?.52:1);
      wake(px,py,half,boat.angle+rocking,boat.phase,opacity);
      ctx.save();ctx.translate(px,py);ctx.rotate(rocking);ctx.globalAlpha=opacity;
      const paper=papers[i];
      ctx.drawImage(paper.bitmap,paper.left,paper.top,paper.width,paper.height);
      ctx.restore();
    }

    // A few ochre leaves provide the warm punctuation visible in the source.
    for(let i=0;i<4;i++) {
      const x=w*[.27,.57,.34,.86][i]+Math.sin(t*.044+i*1.3)*w*.027;
      const y=h*[.09,.35,.73,.94][i]+Math.cos(t*.065+i)*cell*1.5;
      const q=deformation(x,y);
      ctx.save();ctx.translate(x+q.x*.5,y+q.y*.5);ctx.rotate(Math.sin(t*.23+i)*.12);
      ctx.globalAlpha=quiet?.25:.7;ctx.font=`${cell*.9}px Consolas,monospace`;
      for(let j=0;j<3;j++) {
        const dx=(j===2?1:0)*cell,dy=(j===1?1:0)*cell*1.3;
        ctx.fillStyle=i%2?'#a98b42':'#af9b52';ctx.fillRect(dx,dy,cell*.86,cell*1.16);
        ctx.fillStyle='#556754';ctx.fillText('t%;'[j],dx+cell*.43,dy+cell*.58);
      }
      ctx.restore();
    }

    if(quiet) {
      const veil=ctx.createLinearGradient(0,0,w,0);
      veil.addColorStop(0,'rgba(24,64,72,.06)');veil.addColorStop(.3,'rgba(24,64,72,.55)');
      veil.addColorStop(.75,'rgba(24,64,72,.55)');veil.addColorStop(1,'rgba(24,64,72,.1)');
      ctx.fillStyle=veil;ctx.fillRect(0,0,w,h);
    }
  });
  const update=controller.update;
  controller.update=value=>{if(!value.motion)touches.length=0;update(value);};
  return controller;
}

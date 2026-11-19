'use strict';
(() => {
  // «Урод»: лёгкий Canvas-движок без библиотек и внешних ресурсов.
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { document.body.innerHTML = '<p style="padding:2rem;color:white">Браузер не поддерживает Canvas 2D.</p>'; return; }

  const CFG = {
    maxSpeed: 50, acceleration: 19, braking: 42, friction: 6.5,
    worldPixelsPerKmh: 10.0, carGapMin: 1050, carGapMax: 1380,
    jumpVelocity: 810, gravity: 1550, wheelieMax: 80,
    wheelieRise: 43, wheelieFall: 66, crashDelay: 1.75,
    suspensionSpring: 115, suspensionDamping: 19, wheelRadius: 18, landingKick: 145,
    dprLimit: 1.25, maxParticles: 18
  };
  const skins = [
    {id:'classic',name:'Классика',price:0,shirt:'#e9e7dc',helmet:'#d83e35',bike:'#df3b31',bag:'#293b50'},
    {id:'neon',name:'Неон',price:20,shirt:'#c9f24a',helmet:'#ef55c5',bike:'#22c6d4',bag:'#593b85'},
    {id:'camo',name:'Камуфляж',price:40,shirt:'#87915a',helmet:'#b8a56c',bike:'#53643b',bag:'#39462c'},
    {id:'fire',name:'Огонь',price:60,shirt:'#f17a2b',helmet:'#ffd24b',bike:'#c92d25',bag:'#57231c'},
    {id:'space',name:'Космос',price:100,shirt:'#776bd1',helmet:'#65d8ee',bike:'#343b91',bag:'#27224f'}
  ];
  const get=(k,d)=>{try{const v=localStorage.getItem('urod_'+k);return v===null?d:JSON.parse(v);}catch(_){return d;}};
  const put=(k,v)=>{try{localStorage.setItem('urod_'+k,JSON.stringify(v));}catch(_){}};
  let best=get('best',0), wallet=get('wallet',0), owned=get('owned',['classic']);
  let selected=get('selected','classic'), soundOn=get('sound',false);
  if(!Array.isArray(owned)) owned=['classic'];
  if(!skins.some(s=>s.id===selected)) selected='classic';

  let W=innerWidth,H=innerHeight,DPR=1, state='menu', shopReturn='menu', raf=0, last=0, audio=null;
  let input={gas:false,brake:false,wheelie:false}, world=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const choose=a=>a[(Math.random()*a.length)|0];
  const currentSkin=()=>skins.find(s=>s.id===selected)||skins[0];
  const ui={hud:$('hud'),controls:$('controls'),speedBox:$('speedometer'),menu:$('menu'),over:$('gameover'),shop:$('shop'),score:$('score'),best:$('best'),wallet:$('wallet'),speed:$('speed'),meter:$('meter-fill'),gauge:$('wheelie-gauge'),gaugeFill:$('wheelie-fill'),gaugeValue:$('wheelie-value')};

  function resize(){
    W=Math.max(280,window.innerWidth||360); H=Math.max(320,window.innerHeight||640);
    DPR=Math.min(CFG.dprLimit,window.devicePixelRatio||1);
    canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR);
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if(world){world.roadY=H*.755;world.playerX=W*.23;world.groundY=H*.775-18*clamp(W/420,.78,1.05);if(!world.air)world.y=world.groundY;}
    render(0);
  }
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(resize,120),{passive:true});

  function audioInit(){
    if(!soundOn)return;
    try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){audio=audio||new AC();if(audio.state==='suspended')audio.resume();}}catch(_){audio=null;}
  }
  function beep(freq=620,duration=.08){
    if(!soundOn)return;audioInit();if(!audio)return;
    try{const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch(_){}
  }
  function setScreen(name){
    state=name;
    ui.menu.classList.toggle('hidden',name!=='menu');ui.over.classList.toggle('hidden',name!=='over');ui.shop.classList.toggle('hidden',name!=='shop');$('settings').classList.toggle('hidden',name!=='settings');
    const playing=name==='playing';
    [ui.hud,ui.controls,ui.speedBox,ui.gauge].forEach(el=>el.classList.toggle('hidden',!playing));
  }
  function updateStats(){
    ui.best.textContent=best;ui.wallet.textContent=wallet;
    $('menu-best').textContent=best;$('menu-wallet').textContent=wallet;$('settings-sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ');$('sound').classList.toggle('off',!soundOn);
  }
  function makeWorld(){
    const cars=[], bottles=[], scenery=[];
    let x=rnd(850,1050);
    for(let i=0;i<65;i++){
      cars.push({x,color:choose(['#e5e0d1','#c9b99b','#49684b','#792f3b','#7396a7','#858b8b','#d4d0c5'])});
      x+=rnd(CFG.carGapMin,CFG.carGapMax);
    }
    x=300;
    for(let i=0;i<180;i++){
      const type=(Math.random()*3)|0, count=type===0?1:type===1?3:4;
      for(let j=0;j<count;j++)bottles.push({x:x+j*(type===1?45:55),height:type===2?Math.sin(j/(count-1)*Math.PI)*75:rnd(0,7),got:false,phase:rnd(0,6)});
      x+=rnd(270,430);
    }
    x=0;
    for(let i=0;i<180;i++){
      scenery.push({x,kind:choose(['house','house','shed','birch','tree','fence','pole','shop','junk']),wall:choose(['#b7a187','#c5bba4','#8d9d91','#c6b6a1','#9caaa3']),roof:choose(['#55443c','#3d454b','#71443c','#424b4b']),fence:choose(['#66734c','#77604b','#596b70','#465d48']),seed:Math.random()});
      x+=rnd(150,245);
    }
    const roadY=H*.755, groundY=H*.775-18*clamp(W/420,.78,1.05);
    world={camera:0,roadY,groundY,playerX:W*.23,speed:0,distance:0,score:0,time:0,
      y:groundY,vy:0,air:false,wheelie:0,angle:0,angleVelocity:0,
      suspension:0,suspensionVelocity:0,landing:0,wheelPhase:0,riderBob:0,
      cars,bottles,scenery,particles:[],crash:0,shake:0,roadOffset:0};
    input={gas:false,brake:false,wheelie:false};
    ui.gaugeFill.style.width='0%';ui.gaugeValue.textContent='0°';ui.gauge.dataset.level='safe';
    updateStats();setScreen('playing');last=0;
  }
  function finish(){
    if(state!=='playing')return;
    input={gas:false,brake:false,wheelie:false};
    best=Math.max(best,Math.floor(world.score));put('best',best);put('wallet',wallet);
    $('final-score').textContent=Math.floor(world.score);$('final-best').textContent=best;updateStats();setScreen('over');
  }
  function particles(x,y,color,n=7){
    for(let i=0;i<n&&world.particles.length<CFG.maxParticles;i++)world.particles.push({x,y,vx:rnd(-85,85),vy:rnd(-130,10),life:rnd(.22,.48),color});
  }

  // Пасмурная деревня. Все постройки привязаны к одной линии грунта:
  // нижняя кромка стен, стволы и заборы всегда стоят на земле.
  function drawBackground(){
    const ground=H*.765;
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#77838a');sky.addColorStop(.48,'#a3aaab');sky.addColorStop(1,'#c0bdb3');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Тяжёлые низкие облака
    for(let i=0;i<7;i++){
      const x=((i*173-world.camera*.035)%(W+240)+W+240)%(W+240)-100;
      const y=H*(.10+(i%3)*.065);
      ctx.fillStyle=i%2?'#c0c5c4':'#aeb7b9';
      ctx.beginPath();ctx.ellipse(x,y,78,17,0,0,Math.PI*2);ctx.ellipse(x+43,y-7,58,19,0,0,Math.PI*2);ctx.ellipse(x-38,y-4,48,15,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#d0d2ce';ctx.beginPath();ctx.ellipse(x+4,y+7,64,8,0,0,Math.PI*2);ctx.fill();
    }
    // Дальняя полоса леса и силуэты многоэтажек
    ctx.fillStyle='#68766f';ctx.beginPath();ctx.moveTo(0,H*.48);
    for(let x=0;x<=W+24;x+=24)ctx.lineTo(x,H*.47+Math.sin((x+world.camera*.045)*.009)*10);
    ctx.lineTo(W,ground);ctx.lineTo(0,ground);ctx.fill();
    for(let i=0;i<5;i++){
      const x=((i*205-world.camera*.12)%(W+260)+W+260)%(W+260)-100;
      ctx.fillStyle='#707a7b';ctx.fillRect(x,H*.39-(i%2)*12,42,ground-H*.39);
      ctx.fillStyle='#aeb7b4';for(let yy=H*.405;yy<ground-8;yy+=13)for(let xx=x+7;xx<x+37;xx+=11)ctx.fillRect(xx,yy,5,6);
    }
    // Дома и дворы. Каждый дом рисуется целиком до линии грунта.
    for(let i=0;i<7;i++){
      const span=W+310,x=((i*219-world.camera*.29)%(span)+span)%span-125;
      const bw=112+(i%3)*13,bh=84+(i%4)*13,base=ground;
      const wall=['#8f9691','#a29c8e','#858f8c','#a39a8d','#858783'][i%5];
      const roof=['#484d4d','#5b514a','#555b5c','#62534d'][i%4];
      // тень и фундамент
      ctx.fillStyle='#343b39';ctx.fillRect(x+5,base-5,bw+8,7);
      ctx.fillStyle=wall;ctx.fillRect(x+9,base-bh,bw-14,bh-5);
      // крыша
      ctx.fillStyle=roof;ctx.beginPath();ctx.moveTo(x,base-bh+5);ctx.lineTo(x+bw*.49,base-bh-31-(i%2)*8);ctx.lineTo(x+bw,base-bh+5);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#77766e';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+5,base-bh+4);ctx.lineTo(x+bw*.49,base-bh-27);ctx.lineTo(x+bw-4,base-bh+4);ctx.stroke();
      // окна с мутными стёклами и рамами
      for(const wx of [x+22,x+bw-45]){ctx.fillStyle='#343f43';ctx.fillRect(wx,base-bh+25,25,28);ctx.fillStyle='#84999b';ctx.fillRect(wx+3,base-bh+28,19,22);ctx.strokeStyle='#c1b9a9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(wx+12,base-bh+28);ctx.lineTo(wx+12,base-bh+50);ctx.moveTo(wx+3,base-bh+39);ctx.lineTo(wx+22,base-bh+39);ctx.stroke();}
      // дверь, труба, спутниковая тарелка
      ctx.fillStyle='#51483e';ctx.fillRect(x+bw*.48,base-42,19,37);ctx.fillStyle='#93836d';ctx.beginPath();ctx.arc(x+bw*.48+14,base-24,1.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#555b5a';ctx.fillRect(x+bw-28,base-bh-47,9,22);ctx.fillStyle='#777b78';ctx.fillRect(x+bw-30,base-bh-49,13,3);
      ctx.strokeStyle='#bfc1ba';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+17,base-bh-8,9,-1.1,1.1);ctx.stroke();ctx.beginPath();ctx.moveTo(x+17,base-bh-8);ctx.lineTo(x+25,base-bh-14);ctx.stroke();
      // забор: секции стоят на земле, с разными просевшими досками
      const fence=['#5c625a','#6a6258','#596366'][i%3];ctx.fillStyle='#3e4541';ctx.fillRect(x-17,base-24,bw+48,4);ctx.fillRect(x-17,base-8,bw+48,4);
      ctx.fillStyle=fence;for(let k=0;k<Math.ceil((bw+40)/10);k++){const fx=x-14+k*10;ctx.fillRect(fx,base-34+(k%4===0?4:0),7,29-(k%4===0?4:0));}
      // дворный хлам: дрова, бочка, старые шины
      ctx.fillStyle='#655342';for(let k=0;k<4;k++)ctx.fillRect(x+bw-2,base-13-k*4,22,3);
      ctx.fillStyle='#6b6e68';ctx.fillRect(x-34,base-26,17,25);ctx.fillStyle='#424746';ctx.beginPath();ctx.arc(x-9,base-9,10,0,Math.PI*2);ctx.stroke();
      // маленький гараж у каждого второго дома
      if(i%2===0){ctx.fillStyle='#737a78';ctx.fillRect(x+bw+31,base-58,65,58);ctx.fillStyle='#4b5151';ctx.beginPath();ctx.moveTo(x+bw+24,base-58);ctx.lineTo(x+bw+63,base-79);ctx.lineTo(x+bw+103,base-58);ctx.fill();ctx.fillStyle='#555d5e';ctx.fillRect(x+bw+39,base-48,48,48);ctx.strokeStyle='#a4a69e';ctx.lineWidth=2;ctx.strokeRect(x+bw+39,base-48,48,48);ctx.fillStyle='#8c918c';ctx.fillRect(x+bw+62,base-47,2,46);}
    }
    // Деревья и столбы: стволы заканчиваются точно на грунте
    for(let i=0;i<9;i++){
      const x=((i*151-world.camera*.46)%(W+190)+W+190)%(W+190)-75;
      if(i%3!==1){
        const sway=Math.sin(world.time*1.1+i)*2.2;
        ctx.fillStyle='#d0ccc0';ctx.fillRect(x-4+sway,ground-112,9,112);
        ctx.strokeStyle='#555a55';ctx.lineWidth=2;for(let yy=ground-96;yy<ground-8;yy+=18){ctx.beginPath();ctx.moveTo(x-4+sway,yy);ctx.lineTo(x+5+sway,yy+3);ctx.stroke();}
        ctx.fillStyle=i%3===0?'#53665b':'#626c60';ctx.beginPath();ctx.arc(x+sway,ground-126,25,0,Math.PI*2);ctx.arc(x-19+sway,ground-111,21,0,Math.PI*2);ctx.arc(x+18+sway,ground-109,22,0,Math.PI*2);ctx.fill();
      }else{
        ctx.fillStyle='#4d514f';ctx.fillRect(x-2,ground-151,5,151);ctx.fillRect(x-17,ground-143,34,4);ctx.fillRect(x-12,ground-132,24,3);
        ctx.strokeStyle='#41494a';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-110,ground-138);ctx.quadraticCurveTo(x,ground-119,x+110,ground-140);ctx.stroke();
      }
    }
    // Обочина и грунт закрывают нижнюю кромку дворов
    ctx.fillStyle='#77796c';ctx.fillRect(0,ground,W,H*.035);
    ctx.fillStyle='#5e6259';ctx.fillRect(0,ground+H*.025,W,H*.025);
    for(let i=0;i<Math.ceil(W/24)+1;i++){
      const x=((i*37-world.roadOffset*.9)%(W+50)+W+50)%(W+50);
      ctx.fillStyle=i%2?'#8a8978':'#4e554d';ctx.fillRect(x,ground+5+(i%3)*5,12+(i%4)*5,3);
      ctx.strokeStyle='#555d4e';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x+4,ground+2);ctx.lineTo(x+1,ground-7-(i%3)*3);ctx.stroke();
    }
    // Асфальт: мокрый, серый, с латками и разметкой
    const roadTop=H*.775;ctx.fillStyle='#454a4c';ctx.fillRect(0,roadTop,W,H-roadTop);
    ctx.fillStyle='#aaa99f';ctx.fillRect(0,roadTop,W,3);
    const off=world.roadOffset%190;
    for(let x=-off;x<W+190;x+=190){
      ctx.fillStyle='#55595a';ctx.beginPath();ctx.ellipse(x+45,roadTop+H*.055,25,7,-.08,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#303638';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x+105,roadTop+H*.15);ctx.lineTo(x+115,roadTop+H*.135);ctx.lineTo(x+112,roadTop+H*.12);ctx.stroke();
      ctx.fillStyle='#777c7b';ctx.fillRect(x+136,roadTop+8,6,2);
    }
    ctx.fillStyle='#c0bfb5';for(let x=-(world.roadOffset%118);x<W+118;x+=118)ctx.fillRect(x,roadTop+H*.09,52,4);
    // мокрые блики и скоростные полосы
    ctx.fillStyle='#73797a';for(let i=0;i<8;i++){const x=((i*97-world.roadOffset*1.1)%(W+90)+W+90)%(W+90);ctx.fillRect(x,roadTop+H*(.03+(i%4)*.045),20+(i%3)*13,1.5);}
    if(world.speed>20){ctx.strokeStyle='#c5c9c5';ctx.globalAlpha=.2;ctx.lineWidth=1;for(let i=0;i<9;i++){const x=((i*83-world.roadOffset*2.1)%(W+80)+W+80)%(W+80);const y=roadTop+H*.03+(i%5)*H*.035;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-18-world.speed*.8,y);ctx.stroke();}ctx.globalAlpha=1;}
  }

  function drawCar(car){
    const x=car.x-world.camera,y=world.roadY-13,s=clamp(W/420,.78,1.05);if(x<-100||x>W+100)return;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle='#0004';ctx.beginPath();ctx.ellipse(0,27,62,7,0,0,Math.PI*2);ctx.fill();
    // Кузов ВАЗ-2106, вид сбоку
    ctx.fillStyle=car.color;ctx.beginPath();ctx.moveTo(-60,8);ctx.lineTo(-57,-7);ctx.lineTo(-43,-11);ctx.lineTo(-28,-31);ctx.lineTo(22,-31);ctx.lineTo(39,-12);ctx.lineTo(55,-8);ctx.lineTo(61,8);ctx.lineTo(58,18);ctx.lineTo(-58,18);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ffffff24';ctx.fillRect(-53,-5,105,3);ctx.fillStyle='#282d30';ctx.fillRect(-24,-34,49,4);
    ctx.fillStyle='#9abac3';ctx.beginPath();ctx.moveTo(-24,-28);ctx.lineTo(18,-28);ctx.lineTo(33,-12);ctx.lineTo(-36,-12);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d9d5c8';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#5a686b';ctx.fillRect(-4,-28,3,16);
    // Хромированная решётка и четыре круглые фары
    ctx.fillStyle='#c7c5b9';ctx.fillRect(42,-3,14,11);ctx.fillRect(-58,-2,8,10);ctx.fillStyle='#31383a';ctx.fillRect(44,-1,10,7);
    ctx.strokeStyle='#d0cec1';ctx.lineWidth=1;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(45+i*2.2,-1);ctx.lineTo(45+i*2.2,6);ctx.stroke();}
    ctx.fillStyle='#f4e8c5';for(const hx of [47,54]){ctx.beginPath();ctx.arc(hx,1,3.1,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#9d342d';ctx.fillRect(-57,1,6,8);ctx.fillStyle='#c4c4bb';ctx.fillRect(-61,13,122,4);
    ctx.fillStyle='#24292c';for(const wx of [-37,38]){ctx.beginPath();ctx.arc(wx,16,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#aeb2ad';ctx.beginPath();ctx.arc(wx,16,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#555';ctx.beginPath();ctx.arc(wx,16,2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#24292c';}
    ctx.restore();
  }
  function drawBottle(b){
    const x=b.x-world.camera,y=world.roadY-30-b.height+Math.sin(world.time*3+b.phase)*2;if(x<-20||x>W+20)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(-.16);ctx.fillStyle='#174b36';ctx.fillRect(-6,-13,12,26);ctx.fillStyle='#d7d8ce';ctx.fillRect(-3,-17,6,5);ctx.fillStyle='#c92f39';ctx.fillRect(-6,-5,12,9);ctx.fillStyle='#fff';ctx.font='italic bold 4px sans-serif';ctx.textAlign='center';ctx.fillText('ГАЗЯВА',0,1);ctx.restore();
  }
  function drawBike(){
    const skin=currentSkin(),x=world.playerX,y=world.y,scale=clamp(W/420,.78,1.05);
    const speed01=world.speed/CFG.maxSpeed;
    const bob=world.riderBob;
    // Заднее колесо остаётся опорной точкой при вили — мотоцикл не вращается вокруг центра.
    ctx.save();ctx.translate(x,y);ctx.rotate(-world.angle*Math.PI/180);ctx.translate(36,-12);ctx.scale(scale,scale);
    const suspension=world.suspension;
    // Контактная тень становится уже при прыжке.
    ctx.fillStyle='#171c1d55';ctx.beginPath();ctx.ellipse(-1,25,54,5,0,0,Math.PI*2);ctx.fill();
    // Колёса: вращение рассчитывается из пройденного расстояния и радиуса колеса.
    for(const wx of [-36,37]){
      ctx.fillStyle='#202426';ctx.beginPath();ctx.arc(wx,12,18,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#596064';ctx.lineWidth=2;ctx.beginPath();ctx.arc(wx,12,15.5,0,Math.PI*2);ctx.stroke();
      ctx.save();ctx.translate(wx,12);ctx.rotate(world.wheelPhase);
      // Направленные шашки протектора и спицы.
      ctx.fillStyle='#343a3b';for(let k=0;k<16;k++){ctx.save();ctx.rotate(k*Math.PI/8);ctx.fillRect(-2,-19,4,4);ctx.restore();}
      ctx.strokeStyle='#aeb5b3';ctx.lineWidth=1.1;
      for(let k=0;k<8;k++){ctx.save();ctx.rotate(k*Math.PI/4);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-11);ctx.stroke();ctx.restore();}
      ctx.fillStyle='#b8bfbb';ctx.beginPath();ctx.arc(0,0,3.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#52595a';ctx.beginPath();ctx.arc(0,0,1.2,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    // Маятник, цепь и рама.
    ctx.strokeStyle='#aeb8b7';ctx.lineWidth=4;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-36,12);ctx.lineTo(-9,-9);ctx.lineTo(37,12);ctx.lineTo(8,15);ctx.closePath();ctx.stroke();
    ctx.strokeStyle='#333b3d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-32,11);ctx.lineTo(6,9);ctx.stroke();
    // Задний амортизатор с реальным сжатием/отбоем.
    const shockTop=-10+suspension*.55, shockBottom=8+suspension;
    ctx.strokeStyle='#d1d4cd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-23,shockBottom);ctx.lineTo(-9,shockTop);ctx.stroke();
    ctx.strokeStyle='#5b6465';ctx.lineWidth=1.7;ctx.beginPath();
    for(let i=0;i<=7;i++){const q=i/7;const xx=-23+14*q+(i%2?2.2:-2.2);const yy=shockBottom+(shockTop-shockBottom)*q; if(!i)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}ctx.stroke();
    // Двигатель, картер, ребра охлаждения и выхлоп.
    ctx.fillStyle='#555d5e';ctx.beginPath();ctx.moveTo(-7,-7);ctx.lineTo(15,-7);ctx.lineTo(21,12);ctx.lineTo(-2,15);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#9ca4a1';ctx.lineWidth=1;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-3,-3+i*4);ctx.lineTo(13,-3+i*4);ctx.stroke();}
    ctx.fillStyle='#89918f';ctx.fillRect(0,-3,12,5);ctx.strokeStyle='#c0c3bc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-27,11);ctx.lineTo(7,9);ctx.stroke();
    ctx.strokeStyle='#9ba3a0';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(15,7);ctx.lineTo(34,-24);ctx.lineTo(40,-25);ctx.stroke();
    ctx.fillStyle='#454b4d';ctx.fillRect(31,-28,13,5);
    // Бак, седло и пластик.
    ctx.fillStyle=skin.bike;ctx.beginPath();ctx.moveTo(-18,-19);ctx.lineTo(9,-23);ctx.lineTo(24,-10);ctx.lineTo(8,-3);ctx.lineTo(-17,-7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#262c2e';ctx.beginPath();ctx.moveTo(-23,-25);ctx.lineTo(7,-27);ctx.lineTo(13,-22);ctx.lineTo(-19,-20);ctx.closePath();ctx.fill();
    ctx.strokeStyle=skin.bike;ctx.lineWidth=5;ctx.beginPath();ctx.arc(-36,12,22,Math.PI*1.12,Math.PI*1.88);ctx.stroke();ctx.beginPath();ctx.arc(37,12,22,Math.PI*1.12,Math.PI*1.88);ctx.stroke();
    ctx.fillStyle='#e0dfd5';ctx.beginPath();ctx.moveTo(28,-28);ctx.lineTo(44,-32);ctx.lineTo(43,-19);ctx.lineTo(30,-17);ctx.closePath();ctx.fill();
    // Передняя вилка с небольшим ходом при неровностях.
    ctx.strokeStyle='#c4c9c4';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(37,10);ctx.lineTo(26,-27+suspension*.45);ctx.lineTo(31,-37+suspension*.45);ctx.stroke();
    ctx.strokeStyle='#343b3d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(22,-36+suspension*.45);ctx.lineTo(39,-38+suspension*.45);ctx.stroke();
    // Водитель немного переносит вес назад при вили и сгибает ноги на кочках.
    ctx.save();ctx.translate(-2,-2-bob);ctx.rotate(world.angle*Math.PI/180*.12);
    ctx.fillStyle=skin.bag;ctx.fillRect(-20,-55,17,27);
    ctx.fillStyle=skin.shirt;ctx.beginPath();ctx.moveTo(-8,-55);ctx.lineTo(10,-53);ctx.lineTo(17,-31);ctx.lineTo(-4,-27);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d0a17f';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(8,-49);ctx.lineTo(22,-37);ctx.lineTo(34,-35);ctx.stroke();
    // Ноги с небольшим сгибанием коленей, заметным на разгоне и приземлении.
    const knee=clamp(suspension*.16,-3,3)+speed01*1.5;
    ctx.strokeStyle='#30383c';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-5,-30);ctx.lineTo(5,-19+knee);ctx.lineTo(18,-15);ctx.stroke();
    ctx.strokeStyle='#22292c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(14,-15);ctx.lineTo(23,-15);ctx.stroke();
    ctx.fillStyle='#d0a17f';ctx.beginPath();ctx.arc(0,-66,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=skin.helmet;ctx.beginPath();ctx.arc(0,-68,13,Math.PI,Math.PI*2);ctx.lineTo(14,-62);ctx.lineTo(-12,-61);ctx.closePath();ctx.fill();
    ctx.fillStyle='#b9d4d7';ctx.beginPath();ctx.moveTo(3,-68);ctx.lineTo(13,-66);ctx.lineTo(11,-62);ctx.lineTo(3,-63);ctx.closePath();ctx.fill();
    ctx.restore();ctx.restore();
  }

  function drawCrash(){
    const t=world.crash, k=clamp(t/CFG.crashDelay,0,1), ground=world.groundY;
    // Байк заваливается и скользит по дороге
    ctx.save();ctx.translate(world.playerX+Math.min(58,t*52),ground+8);ctx.rotate(Math.min(1.25,t*1.7));ctx.scale(clamp(W/420,.78,1.05),clamp(W/420,.78,1.05));
    ctx.fillStyle='#202426';for(const wx of [-36,37]){ctx.beginPath();ctx.arc(wx,12,18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#aeb5b3';ctx.lineWidth=2;ctx.beginPath();ctx.arc(wx,12,11,0,Math.PI*2);ctx.stroke();}
    ctx.strokeStyle='#aeb8b7';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-36,12);ctx.lineTo(-9,-9);ctx.lineTo(37,12);ctx.stroke();
    ctx.fillStyle=currentSkin().bike;ctx.fillRect(-18,-21,43,12);ctx.restore();
    // Байкер отделяется от сиденья, летит и падает на спину
    const flight=Math.min(1,t/.55),rx=world.playerX-8+flight*40,ry=ground-62+flight*58+Math.max(0,t-.55)*90;
    ctx.save();ctx.translate(rx,ry);ctx.rotate(Math.min(1.65,t*1.55));ctx.fillStyle=currentSkin().shirt;ctx.fillRect(-9,-15,20,26);ctx.strokeStyle='#252d32';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-12,24);ctx.moveTo(7,8);ctx.lineTo(20,20);ctx.stroke();ctx.fillStyle=currentSkin().helmet;ctx.beginPath();ctx.arc(0,-23,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b9d4d7';ctx.fillRect(3,-27,8,4);ctx.restore();
  }

  function drawParticles(dt){
    for(let i=world.particles.length-1;i>=0;i--){const p=world.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=280*dt;p.life-=dt;ctx.globalAlpha=clamp(p.life*2.4,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-world.camera,p.y,2.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;if(p.life<=0)world.particles.splice(i,1);}
  }
  function update(dt){
    if(state!=='playing'||!world)return;
    const p=world;p.time+=dt;
    if(p.crash){p.crash+=dt;if(p.crash>CFG.crashDelay)finish();return;}

    // Разгон и торможение с инерцией, без мгновенного изменения скорости.
    const throttle=input.gas?1:0, brake=input.brake?1:0;
    const drive=CFG.acceleration*throttle*(1-p.speed/CFG.maxSpeed*.32);
    p.speed+=drive*dt;
    p.speed-=((brake?CFG.braking:CFG.friction)+(p.speed*.055))*dt;
    p.speed=clamp(p.speed,0,CFG.maxSpeed);

    const scroll=p.speed*CFG.worldPixelsPerKmh;
    p.distance+=p.speed/3.6*dt;p.camera+=scroll*dt;p.roadOffset+=scroll*dt;
    p.wheelPhase=p.camera/CFG.wheelRadius;

    // Вили с инерцией: угол плавно набирается и плавно возвращается, как перенос веса.
    const targetAngle=input.wheelie&&!p.air?CFG.wheelieMax:0;
    const rate=targetAngle>p.angle?CFG.wheelieRise:CFG.wheelieFall;
    p.angleVelocity=clamp((targetAngle-p.angle)*4.2,-rate,rate);
    p.angle=clamp(p.angle+p.angleVelocity*dt,0,CFG.wheelieMax);
    if(input.wheelie&&!p.air&&p.angle>=CFG.wheelieMax-.15){p.crash=.001;}

    // Подвеска — пружина с демпфированием. Дорожные неровности дают короткие импульсы.
    const bump=Math.sin(p.distance*3.1)*1.35+Math.sin(p.distance*7.7)*.55;
    const roughness=p.speed>5?bump*(p.speed/CFG.maxSpeed):0;
    const suspensionForce=(-p.suspension*CFG.suspensionSpring)-p.suspensionVelocity*CFG.suspensionDamping+roughness*CFG.suspensionSpring*.55;
    p.suspensionVelocity+=suspensionForce*dt;p.suspension+=p.suspensionVelocity*dt;
    p.suspension=clamp(p.suspension,-5,7);
    p.riderBob+=(Math.sin(p.time*9)*.7+Math.sin(p.time*17)*.25)*Math.min(1,p.speed/22)*dt*7;
    p.riderBob=clamp(p.riderBob,-2.5,2.5);

    // Баллистический прыжок и отдельный импульс сжатия подвески при посадке.
    if(p.air){
      p.vy+=CFG.gravity*dt;p.y+=p.vy*dt;
      if(p.y>=p.groundY){p.y=p.groundY;p.vy=0;p.air=false;p.landing=.22;p.suspensionVelocity+=CFG.landingKick;particles(p.playerX,p.roadY-8,'#77766d',4);}
    }
    if(p.landing>0){p.landing=Math.max(0,p.landing-dt);}

    // Строгая AABB-коллизия: касание границ считается столкновением.
    const sc=clamp(W/420,.78,1.05);
    const a=-p.angle*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
    const corners=[[-19,-80],[91,-80],[91,30],[-19,30]].map(([lx,ly])=>({x:p.playerX+(lx*ca+ly*sa)*sc,y:p.y+(-lx*sa+ly*ca)*sc}));
    const bike={l:Math.min(...corners.map(q=>q.x)),r:Math.max(...corners.map(q=>q.x)),t:Math.min(...corners.map(q=>q.y)),b:Math.max(...corners.map(q=>q.y))};
    for(const car of p.cars){
      const cx=car.x-p.camera;if(cx<-100||cx>W+100||p.crash)continue;
      const box={l:cx-64*sc,r:cx+64*sc,t:p.roadY-47*sc,b:p.roadY+19*sc};
      if(bike.l<=box.r&&bike.r>=box.l&&bike.t<=box.b&&bike.b>=box.t){p.crash=.001;p.shake=.3;particles(p.playerX,p.y,'#d8d0c0',10);beep(115,.18);}
    }
    for(const b of p.bottles){if(b.got)continue;const bx=b.x-p.camera,by=p.roadY-30-b.height;if(Math.abs(bx-p.playerX)<25*sc&&Math.abs(by-(p.y-10))<34*sc){b.got=true;p.score+=10;wallet++;put('wallet',wallet);ui.wallet.textContent=wallet;particles(p.playerX,p.y-10,'#ffd04d',6);beep(760,.07);}}
    p.score+=p.speed/3.6*dt*.9;if(p.angle>8&&!p.air)p.score+=p.speed/3.6*dt*.45;
    if(p.shake>0)p.shake=Math.max(0,p.shake-dt);
    ui.score.textContent=Math.floor(p.score);ui.speed.textContent=Math.round(p.speed);ui.meter.style.width=(p.speed/CFG.maxSpeed*100)+'%';
    ui.gaugeFill.style.width=(p.angle/CFG.wheelieMax*100)+'%';ui.gaugeValue.textContent=Math.round(p.angle)+'°';
    ui.gauge.dataset.level=p.angle>=65?'danger':p.angle>=42?'warn':'safe';
  }

  function render(dt){
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if(world&&world.shake>0)ctx.translate(rnd(-2,2)*world.shake*8,rnd(-2,2)*world.shake*8);
    if(!world){ctx.fillStyle='#83b9d1';ctx.fillRect(0,0,W,H);return;}
    drawBackground();for(const car of world.cars)drawCar(car);for(const bottle of world.bottles)if(!bottle.got)drawBottle(bottle);if(world.crash)drawCrash();else drawBike();drawParticles(dt);
    if(world.crash){ctx.fillStyle='#d9d7ce';ctx.globalAlpha=clamp(world.crash*.12,0,.14);ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
  }
  function frame(t){raf=requestAnimationFrame(frame);if(!last)last=t;const dt=Math.min(.032,Math.max(0,(t-last)/1000));last=t;update(dt);render(dt);}
  function jump(){if(state==='playing'&&world&&!world.air&&!world.crash){world.air=true;world.vy=-CFG.jumpVelocity;world.suspensionVelocity-=42;world.angle=Math.min(world.angle,8);beep(300,.05);}}

  // Pointer Events + touch-action:none: одинаковое управление в Safari iOS и Chrome Android.
  document.querySelectorAll('[data-hold]').forEach(button=>{
    const key=button.dataset.hold;
    const down=e=>{e.preventDefault();audioInit();input[key]=true;button.classList.add('active');try{button.setPointerCapture(e.pointerId);}catch(_){}};
    const up=e=>{e.preventDefault();input[key]=false;button.classList.remove('active');};
    button.addEventListener('pointerdown',down,{passive:false});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>button.addEventListener(type,up,{passive:false}));
  });
  const jumpButton=document.querySelector('[data-tap="jump"]');
  jumpButton.addEventListener('pointerdown',e=>{e.preventDefault();audioInit();jump();},{passive:false});
  window.addEventListener('keydown',e=>{if(e.code==='ArrowRight')input.gas=true;if(e.code==='ArrowLeft')input.brake=true;if(e.code==='ArrowUp'||e.code==='KeyW')input.wheelie=true;if(e.code==='Space'){e.preventDefault();jump();}});
  window.addEventListener('keyup',e=>{if(e.code==='ArrowRight')input.gas=false;if(e.code==='ArrowLeft')input.brake=false;if(e.code==='ArrowUp'||e.code==='KeyW')input.wheelie=false;});
  window.addEventListener('blur',()=>{input={gas:false,brake:false,wheelie:false};});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){input={gas:false,brake:false,wheelie:false};last=0;}});

  function renderShop(){
    $('shop-wallet').textContent=wallet;const list=$('skin-list');list.textContent='';
    for(const s of skins){
      const row=document.createElement('div'),sw=document.createElement('div'),info=document.createElement('div'),name=document.createElement('div'),price=document.createElement('div'),button=document.createElement('button');
      row.className='skin-row';sw.className='skin-swatch';sw.style.background=`linear-gradient(135deg,${s.shirt},${s.bike})`;name.className='skin-name';name.textContent=s.name;price.className='skin-price';price.textContent=s.price?'ГАЗЯВА: '+s.price:'Бесплатно';info.append(name,price);
      const has=owned.includes(s.id),active=selected===s.id;button.textContent=active?'Выбрано':has?'Выбрать':'Купить';button.disabled=active||(!has&&wallet<s.price);
      button.addEventListener('click',()=>{if(!owned.includes(s.id)){if(wallet<s.price)return;wallet-=s.price;owned.push(s.id);put('wallet',wallet);put('owned',owned);}selected=s.id;put('selected',selected);renderShop();updateStats();});
      row.append(sw,info,button);list.append(row);
    }
  }
  $('restart').addEventListener('click',()=>makeWorld());
  $('gameover-shop').addEventListener('click',()=>{shopReturn='over';renderShop();setScreen('shop');});
  $('close-shop').addEventListener('click',()=>setScreen(shopReturn));
  $('sound').classList.toggle('off',!soundOn);$('settings-sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ');
  $('sound').addEventListener('click',()=>{soundOn=!soundOn;put('sound',soundOn);$('sound').classList.toggle('off',!soundOn);$('settings-sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ');audioInit();});
  $('settings-sound').addEventListener('click',()=>{soundOn=!soundOn;put('sound',soundOn);$('sound').classList.toggle('off',!soundOn);$('settings-sound').textContent='ЗВУК: '+(soundOn?'ВКЛ':'ВЫКЛ');audioInit();});
  $('tab-play').addEventListener('click',()=>{audioInit();makeWorld();});
  $('tab-shop').addEventListener('click',()=>{shopReturn='menu';renderShop();setScreen('shop');});
  $('tab-settings').addEventListener('click',()=>setScreen('settings'));
  $('settings-back').addEventListener('click',()=>setScreen('menu'));

  resize();updateStats();setScreen('menu');
  raf=requestAnimationFrame(frame);
})();

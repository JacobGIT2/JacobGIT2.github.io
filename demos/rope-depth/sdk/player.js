import {decodePcd2} from './pcd2.js';
import * as THREE from './three.module.js';
const $=id=>document.getElementById(id), clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const state={manifest:null,presentation:null,frameOverlay:null,frame:0,displayedFrame:-1,stride:4,playing:false,speed:1,loading:false,points:0,error:null,bytes:0,locked:false,lookMode:'ready',renderCount:0,displayed:[],floatPrecision:'float32 metres'};
const tailHold=()=>state.presentation?.final_hold_s??state.manifest.final_hold_s;
const countFrames=()=>state.manifest?.frames.length||0,lastFrame=()=>Math.max(0,countFrames()-1);
const cache=new Map(), pending=new Map(), keys=new Set();
const frameAxes=new Map(), frameLabels=[];
let robotOverlay=null;
let renderer,scene,camera,cloud,material,requestId=0,timer=null,seekTimer=null,lockTimer=null,nextDeadline=0,lastTime=performance.now(),dirty=true,raf=null;
const UP=new THREE.Vector3(0,-1,0),FWD=new THREE.Vector3(),RIGHT=new THREE.Vector3();
const cam={pos:new THREE.Vector3(0,0,0),yaw:0,pitch:0,speed:.35};
function forward(){const cp=Math.cos(cam.pitch);return FWD.set(Math.sin(cam.yaw)*cp,-Math.sin(cam.pitch),Math.cos(cam.yaw)*cp);}
function applyCam(broadcast=true){camera.position.copy(cam.pos);camera.up.copy(UP);camera.lookAt(cam.pos.clone().add(forward()));camera.updateMatrixWorld();dirty=true;schedule();if(broadcast&&parent!==window)parent.postMessage({type:"pcd:camera",camera:{position:cam.pos.toArray(),yaw:cam.yaw,pitch:cam.pitch}},location.origin);}
function setLook(pos,target){cam.pos.fromArray(pos);const d=new THREE.Vector3(...target).sub(cam.pos);cam.yaw=Math.atan2(d.x,d.z);cam.pitch=Math.atan2(-d.y,Math.hypot(d.x,d.z));applyCam();}
function setLookMode(mode){state.lookMode=mode;const locked=mode==='locked';$('cross').classList.toggle('on',locked);$('hint').classList.toggle('hide',locked);$('lookStatus').textContent=locked?'鼠标：锁定环视 · Esc 释放':mode==='fallback'?'鼠标：按住左键拖动环视（当前未锁定）':mode==='released'?'鼠标已释放 · 左键拖动或点击重新锁定':'鼠标：点击锁定／左键拖动';$('hint').textContent=mode==='fallback'?'本浏览器请按住左键拖动环视，WASD 移动 · Q/E 下/上':mode==='released'?'鼠标已释放：按住左键拖动环视，或点击重新锁定 · WASD 移动':'点击画面锁定鼠标，或按住左键拖动环视 · WASD 移动 · Q/E 下/上 · Esc 释放';}
function reset(){setLook([0,0,0],[0,0,1]);}
function side(){setLook([.7,-.18,.25],[0,.12,.85]);}
function gripperClose(){const box=robotOverlay?.bounds();if(!box)return;const sphere=box.getBoundingSphere(new THREE.Sphere());const halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=sphere.radius/Math.sin(halfFov)*1.3;setLook(sphere.center.clone().add(new THREE.Vector3(.2,-.12,-1).normalize().multiplyScalar(distance)).toArray(),sphere.center.toArray());}
async function setupRobotOverlay(){
 if(!state.manifest.robot_overlay)return;
 const {createRobotOverlay}=await import('./robot_overlay.js?v=robot-full-uf850-141');
 robotOverlay=await createRobotOverlay({scene,manifest:state.manifest,frameOverlay:state.frameOverlay,config:state.manifest.robot_overlay,onChange:()=>{dirty=true;schedule();}});
 $('robotPanel').hidden=false;$('gripperClose').hidden=false;$('robotFull').hidden=false;document.body.classList.add('has-robot-overlay');
 $('robotArm').checked=state.manifest.robot_overlay.default_show_arm===true;
 if(Number.isFinite(state.manifest.robot_overlay.default_opacity))$('robotOpacity').value=clamp(state.manifest.robot_overlay.default_opacity,.1,1);
 const visibility=()=>robotOverlay.setVisibility({showGripper:$('robotGripper').checked,showArm:$('robotArm').checked,showPoints:$('robotPoints').checked});
 for(const id of ['robotGripper','robotArm','robotPoints'])$(id).onchange=visibility;
 $('robotOpacity').oninput=()=>robotOverlay.setOpacity(Number($('robotOpacity').value));
 $('gripperClose').onclick=gripperClose;$('robotFull').onclick=()=>{$('robotArm').checked=true;$('robotGripper').checked=true;visibility();overview();};visibility();robotOverlay.setOpacity(Number($('robotOpacity').value));
}
function overview(){
 const box=new THREE.Box3();
 // Frame the requested coordinate systems; isolated depth outliers must not
 // push this inspection view far away. This changes only the virtual camera.
 for(const entry of frameLabels)box.expandByPoint(entry.point);
 if(robotOverlay)box.union(robotOverlay.trajectoryBounds({includeArm:$('robotArm').checked}));
 const center=box.getCenter(new THREE.Vector3()),radius=Math.max(.35,box.getSize(new THREE.Vector3()).length()*.5);
 const halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
 const distance=radius/Math.sin(halfFov)*1.02;
 const eye=new THREE.Vector3(.85,-.5,-.7).normalize().multiplyScalar(distance).add(center);
 setLook(eye.toArray(),center.toArray());
}
function createFrameAxes(){
 const overlay=state.frameOverlay,length=overlay.axis_length_m;
 const names={Cz:'Cz · ZED',W:'W · 世界',B:'B · 基座'};
 const accents={Cz:'#83d9ff',W:'#ffd183',B:'#d3adff'};
 const directions=[[1,0,0],[0,1,0],[0,0,1]],colors=[0xff7474,0x6aeba4,0x7bbaff];
 for(const frame of overlay.frames){
  const rows=frame.T_scene_from_frame;
  if(!names[frame.id]||rows.length!==4||rows.some(row=>row.length!==4||row.some(v=>!Number.isFinite(v))))throw Error('坐标轴矩阵格式不符');
  // Matrix4.set accepts rows; fromArray alone would transpose our JSON layout.
  const matrix=new THREE.Matrix4().set(...rows.flat());
  const group=new THREE.Group();group.matrix.copy(matrix);group.matrixAutoUpdate=false;scene.add(group);
  const origin=new THREE.Vector3().applyMatrix4(matrix);
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(.006,10,8),new THREE.MeshBasicMaterial({color:accents[frame.id],depthTest:false,depthWrite:false}));sphere.renderOrder=12;group.add(sphere);
  const addLabel=(local,text,kind,color)=>{
   const point=new THREE.Vector3(...local).applyMatrix4(matrix),node=document.createElement('span');
   node.className='frame-label'+(kind==='origin'?'':' axis-tip');node.textContent=text;node.dataset.frame=frame.id;node.dataset.kind=kind;node.dataset.scenePoint=JSON.stringify(point.toArray());node.style.color=color;node.style.borderColor=accents[frame.id];node.title=`${text}：(${point.toArray().map(x=>x.toFixed(4)).join(', ')}) m · ZED 光学系`;
   $('frameLabels').append(node);frameLabels.push({node,point,group,kind});
  };
  addLabel([0,0,0],names[frame.id],'origin',accents[frame.id]);
  directions.forEach((direction,index)=>{
   const axis=new THREE.Vector3(...direction),head=.025,shaftLength=length-head;
   const paint=new THREE.MeshBasicMaterial({color:colors[index],depthTest:false,depthWrite:false});
   const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.0035,.0035,shaftLength,8),paint);
   const cone=new THREE.Mesh(new THREE.ConeGeometry(.012,head,10),paint);
   const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis);
   shaft.quaternion.copy(rotation);cone.quaternion.copy(rotation);
   shaft.position.copy(axis).multiplyScalar(shaftLength/2);cone.position.copy(axis).multiplyScalar(length-head/2);
   shaft.renderOrder=cone.renderOrder=11;group.add(shaft,cone);const endpoint=direction.map(v=>v*length);
   const actual=new THREE.Vector3(...endpoint).applyMatrix4(matrix).toArray(),declared=frame.axis_endpoints_m[['x','y','z'][index]];
   if(actual.some((v,i)=>Math.abs(v-declared[i])>1e-9))throw Error('坐标轴端点与矩阵方向不一致');
   addLabel(endpoint,`${'XYZ'[index]}_${frame.id}`,'xyz'[index],new THREE.Color(colors[index]).getStyle());
  });
  if(origin.toArray().some((v,i)=>Math.abs(v-frame.origin_m[i])>1e-9))throw Error('坐标轴原点与矩阵不一致');
  frameAxes.set(frame.id,group);
  $(`frame-${frame.id}`).onchange=()=>{group.visible=$(`frame-${frame.id}`).checked;dirty=true;schedule();};
 }
 if(frameAxes.size!==3)throw Error('需要 ZED、W、B 三个坐标系');
}
function updateFrameLabels(){
 const rect=$('stage').getBoundingClientRect();
 for(const entry of frameLabels){
  const view=entry.point.clone().applyMatrix4(camera.matrixWorldInverse),projected=entry.point.clone().project(camera);
  const visible=entry.group.visible&&view.z<0&&Math.abs(projected.x)<1.04&&Math.abs(projected.y)<1.04&&projected.z>-1&&projected.z<1;
  entry.node.hidden=!visible;if(!visible)continue;
  const offset=entry.kind==='origin'?{Cz:[-25,-14],W:[46,-10],B:[30,-20]}[entry.node.dataset.frame]:[0,5];
  entry.node.style.left=`${(projected.x*.5+.5)*rect.width+offset[0]}px`;
  entry.node.style.top=`${(-projected.y*.5+.5)*rect.height+offset[1]}px`;
 }
}
function fail(error){state.error=String(error?.message||error);$('error').textContent=state.error;$('error').hidden=false;pause();console.error(error);}
function pause(){const wasPlaying=state.playing;state.playing=false;clearTimeout(timer);timer=null;$('play').classList.remove('active');$('play').innerHTML='播放 <kbd>空格</kbd>';if(wasPlaying&&parent!==window)parent.postMessage({type:'pcd:play-state',playing:false},location.origin);}
function evict(){while(cache.size>8){const key=cache.keys().next().value;if(key===`${state.stride}:${state.displayedFrame}`){const data=cache.get(key);cache.delete(key);cache.set(key,data);}else cache.delete(key);}}
async function load(index,stride=state.stride){
 const key=`${stride}:${index}`;if(cache.has(key)){const data=cache.get(key);cache.delete(key);cache.set(key,data);return data;}if(pending.has(key))return pending.get(key).promise;
 const controller=new AbortController();
 const task=(async()=>{const frame=state.manifest.frames[index],level=frame.levels[stride];const response=await fetch(level.path,{signal:controller.signal});if(!response.ok)throw Error(`点云 ${frame.source_index}: HTTP ${response.status}`);const zipped=await response.arrayBuffer();state.bytes+=zipped.byteLength;
  const bytes=new Uint8Array(zipped);
  let binary=zipped;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
   if(!globalThis.DecompressionStream)throw Error('此浏览器不支持解压，请使用新版 Chrome、Safari 或 Edge。');
   const stream=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
   binary=await new Response(stream).arrayBuffer();
  }
  if(controller.signal.aborted)throw new DOMException('Obsolete frame','AbortError');
  const data=decodePcd2(binary,{count:level.count,source_index:frame.source_index,stride,width:state.manifest.shape_hw[1],height:state.manifest.shape_hw[0]});
  cache.set(key,data);evict();return data;})();pending.set(key,{promise:task,controller});try{return await task;}finally{pending.delete(key);}
}
function prune(index,stride){const keep=new Set([index,index+1,index+2].map(i=>`${stride}:${i}`));for(const [key,item] of pending)if(!keep.has(key))item.controller.abort();}
function prefetch(index){for(let j=index+1;j<=Math.min(index+2,lastFrame());j++)load(j).catch(()=>{});}
async function show(index,{fromPlayback=false,silentSync=false}={}){
 index=clamp(Math.round(index),0,lastFrame());const id=++requestId;state.frame=index;prune(index,state.stride);state.loading=true;$('loading').hidden=false;$('loading').textContent=`读取帧 ${index+1} / ${countFrames()}…`;if(parent!==window)parent.postMessage({type:'pcd:loading',index,displayed_index:state.displayedFrame},location.origin);
 try{const data=await load(index);if(id!==requestId)return false;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3,true));const frame=state.manifest.frames[index];robotOverlay?.apply(frame);const old=cloud.geometry;cloud.geometry=geometry;old.dispose();cloud.visible=true;state.displayedFrame=index;state.points=data.count;state.loading=false;state.error=null;$('error').hidden=true;$('loading').hidden=true;$('timeline').value=index;
 const total=state.manifest.span_s+tailHold();
 if(robotOverlay)$('robotStatus').textContent=`夹爪源帧 ${frame.source_index} · 与当前点云共同显示 · UI 89 固定`;
 $('time').textContent=`${frame.time_s.toFixed(3)} / ${total.toFixed(3)} s`;$('frame').textContent=`原始帧 ${frame.source_index} · ${index+1} / ${countFrames()} · 原片 ${frame.original_time_s.toFixed(3)} s`;
 $('points').textContent=`${data.count.toLocaleString()} / ${frame.native_mask_count.toLocaleString()} 点 · ${state.stride===1?'全部原生点':`每 ${state.stride} 像素采样`} · ${countFrames()} 时刻未抽帧`;
 $('buffer').textContent=`已传输 ${(state.bytes/1048576).toFixed(1)} MB`;state.displayed.push(index);if(state.displayed.length>2000)state.displayed.shift();dirty=true;schedule();prefetch(index);if(parent!==window){parent.postMessage({type:'pcd:displayed',index,time_s:frame.time_s,source_index:frame.source_index},location.origin);if(!silentSync)parent.postMessage({type:"pcd:frame",index,time_s:frame.time_s},location.origin);}return true;
 }catch(error){if(id===requestId){state.loading=false;$('loading').hidden=true;if(parent!==window)parent.postMessage({type:'pcd:load-error',index,message:String(error?.message||error),displayed_index:state.displayedFrame},location.origin);fail(error);}return false;}
}
async function playStep(){if(!state.playing)return;const index=state.displayedFrame;if(index>=lastFrame()){timer=setTimeout(pause,tailHold()*1000/state.speed);return;}const next=index+1;const dt=(state.manifest.frames[next].time_s-state.manifest.frames[index].time_s)*1000/state.speed;
 nextDeadline+=dt;timer=setTimeout(async()=>{if(!state.playing)return;const started=performance.now();const ok=await show(next,{fromPlayback:true});if(ok&&state.playing){const loadingDelay=performance.now()-started;if(performance.now()>nextDeadline+50){nextDeadline=performance.now();$('buffer').textContent+=' · 等待读取，保留逐帧';}playStep();}},Math.max(0,nextDeadline-performance.now()));}
function togglePlay(){if(state.playing){pause();return;}if(state.loading||!state.manifest)return;const go=()=>{nextDeadline=performance.now();state.playing=true;if(parent!==window)parent.postMessage({type:'pcd:play-state',playing:true},location.origin);$('play').classList.add('active');$('play').textContent='暂停';playStep();};if(state.displayedFrame>=lastFrame())show(0).then(ok=>{if(ok)go();});else go();}
function flyStep(dt){if(!keys.size)return false;const boost=keys.has('shift')?4:(keys.has('control')?.2:1),step=cam.speed*boost*dt;forward();RIGHT.crossVectors(FWD,UP).normalize();let moved=false;const go=(v,s)=>{cam.pos.addScaledVector(v,s*step);moved=true;};if(keys.has('w'))go(FWD,1);if(keys.has('s'))go(FWD,-1);if(keys.has('a'))go(RIGHT,-1);if(keys.has('d'))go(RIGHT,1);if(keys.has('q'))go(UP,-1);if(keys.has('e'))go(UP,1);if(moved)applyCam();return moved;}
function schedule(){if(!raf)raf=requestAnimationFrame(animate);}
function animate(now){raf=null;const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;flyStep(dt);if(dirty){renderer.render(scene,camera);updateFrameLabels();dirty=false;state.renderCount++;}if(keys.size)schedule();}
function resize(){if(!renderer)return;const rect=$('stage').getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();dirty=true;schedule();}
function setup(){
 renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.domElement.tabIndex=0;$('stage').append(renderer.domElement);scene=new THREE.Scene();scene.background=new THREE.Color(0x0a0f16);camera=new THREE.PerspectiveCamera(60,1,.005,100);material=new THREE.ShaderMaterial({vertexColors:true,uniforms:{size:{value:2*renderer.getPixelRatio()}},vertexShader:'varying vec3 vColor; uniform float size; void main(){vColor=color; gl_PointSize=size; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vColor; void main(){vec2 p=gl_PointCoord-.5;if(dot(p,p)>.25)discard;gl_FragColor=vec4(vColor,1.0);}',depthTest:true,depthWrite:true});cloud=new THREE.Points(new THREE.BufferGeometry(),material);cloud.frustumCulled=false;cloud.visible=false;scene.add(cloud);createFrameAxes();
 const view=renderer.domElement;const lockFailed=()=>{if(document.pointerLockElement!==view)setLookMode('fallback');};view.addEventListener('pointerdown',e=>{if(e.button!==0||state.locked)return;view.focus();clearTimeout(lockTimer);try{if(!view.requestPointerLock){lockFailed();return;}const promise=view.requestPointerLock();promise?.catch?.(lockFailed);lockTimer=setTimeout(lockFailed,450);}catch{lockFailed();}});document.addEventListener('pointerlockerror',lockFailed);document.addEventListener('pointerlockchange',()=>{clearTimeout(lockTimer);const wasLocked=state.locked;state.locked=document.pointerLockElement===view;if(state.locked)setLookMode('locked');else if(wasLocked)setLookMode('released');else lockFailed();if(!state.locked)keys.clear();});addEventListener('mousemove',e=>{if(!state.locked&&!(e.buttons&1&&e.target===view))return;cam.yaw+=e.movementX*.0025;cam.pitch=clamp(cam.pitch-e.movementY*.0025,-1.535,1.535);applyCam();});view.addEventListener('wheel',e=>{e.preventDefault();cam.pos.addScaledVector(forward(),-Math.sign(e.deltaY)*.055);applyCam();},{passive:false});
 addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;const key=e.key.toLowerCase();if(['w','a','s','d','q','e','shift','control'].includes(key)){keys.add(key);e.preventDefault();lastTime=performance.now();schedule();}if(e.repeat)return;if(key===' '){e.preventDefault();togglePlay();}if(key==='v')reset();if(key==='arrowleft'||key==='arrowright'){e.preventDefault();pause();show(state.displayedFrame+(key==='arrowright'?1:-1));}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden)pause();});
 $('play').onclick=togglePlay;$('prev').onclick=()=>{pause();show(state.displayedFrame-1);};$('next').onclick=()=>{pause();show(state.displayedFrame+1);};$('overview').onclick=overview;$('reset').onclick=reset;$('side').onclick=side;$('timeline').oninput=()=>{pause();clearTimeout(seekTimer);seekTimer=setTimeout(()=>show(+$('timeline').value),80);};$('quality').onchange=()=>{pause();state.stride=+$('quality').value;show(state.displayedFrame);};$('rate').onchange=()=>{state.speed=+$('rate').value;if(state.playing){clearTimeout(timer);nextDeadline=performance.now();playStep();}};$('pointSize').oninput=()=>{material.uniforms.size.value=+$('pointSize').value*renderer.getPixelRatio();dirty=true;schedule();};$('helpToggle').onclick=()=>{$('help').hidden=!$('help').hidden;$('helpToggle').setAttribute('aria-expanded',String(!$('help').hidden));};new ResizeObserver(resize).observe($('stage'));reset();resize();
}
window.__pcdPlayer={setCamera:value=>{if(!Array.isArray(value?.position)||value.position.length!==3||![...value.position,value.yaw,value.pitch].every(Number.isFinite))throw Error('Invalid camera');cam.pos.fromArray(value.position);cam.yaw=value.yaw;cam.pitch=clamp(value.pitch,-1.535,1.535);applyCam(false);},getState:()=>({...state,robot:robotOverlay?.getState()??null,source_index:state.manifest?.frames[state.displayedFrame]?.source_index,time_s:state.manifest?.frames[state.displayedFrame]?.time_s,original_time_s:state.manifest?.frames[state.displayedFrame]?.original_time_s,native_mask_count:state.manifest?.frames[state.displayedFrame]?.native_mask_count,manifest:state.manifest?{status:state.manifest.status,source_range:state.manifest.source_range,selected_frame_count:state.manifest.selected_frame_count}:null,camera:{position:cam.pos.toArray(),yaw:cam.yaw,pitch:cam.pitch},cacheEntries:cache.size,pendingRequests:pending.size,geometryVertexCount:cloud?.geometry.attributes.position?.count||0}),seek:async index=>{pause();return show(index);},setQuality:async stride=>{pause();if(![1,2,4].includes(stride))throw Error('Bad stride');state.stride=stride;$('quality').value=stride;return show(Math.max(0,state.displayedFrame));},togglePlay,reset,side};
try{const responses=await Promise.all([fetch('./manifest.json'),fetch('./frame_overlay.json'),fetch('./playback.json')]);if(responses.some(r=>!r.ok))throw Error('点云清单或坐标轴来源读取失败');[state.manifest,state.frameOverlay,state.presentation]=await Promise.all(responses.map(r=>r.json()));if(state.manifest.status!=='complete'||!state.manifest.frames.length||state.manifest.frames.length!==state.manifest.selected_frame_count)throw Error('点云交互资产仍在准备，请稍后刷新。');if(state.frameOverlay.schema!=='native-pcd-frame-overlay.v1'||state.frameOverlay.scene_frame!=='zed_left_optical'||state.frameOverlay.source_trial!==state.manifest.raw_source.split('/').pop())throw Error('坐标轴与本段点云来源不匹配');const label=state.manifest.source_label||(state.manifest.depth_source_kind==='sdk'||state.manifest.source_kind==='sdk'?'ZED SDK 深度':'Fast-FoundationStereo 深度');document.title=label+' · 4D 点云';$('sequenceTitle').textContent=label+' · 4D 点云';$('sequenceInfo').textContent=`${countFrames()} 个真实采集时刻 · ${state.manifest.span_s.toFixed(3)} 秒 · ${label}`;$('timeline').max=lastFrame();state.stride=state.presentation?.default_stride||4;$('quality').value=state.stride;setup();await setupRobotOverlay();await show(+(new URLSearchParams(location.search).get('frame')||0));overview();$('play').disabled=false;if(parent!==window)parent.postMessage({type:'pcd:ready',count:countFrames()},location.origin);}catch(error){fail(error);}

addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||!state.manifest)return;const data=event.data;if(data?.type==='pcd:seek'&&Number.isInteger(data.index)){pause();show(data.index,{silentSync:true});}else if(data?.type==='pcd:camera')window.__pcdPlayer.setCamera(data.camera);else if(data?.type==='pcd:play')togglePlay();else if(data?.type==='pcd:pause')pause();});

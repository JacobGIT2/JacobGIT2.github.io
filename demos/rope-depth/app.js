const $=id=>document.getElementById(id);
let single=null,pairReady=false,cameraLeader=null,playbackLeader=null,frame=0;
const cameras=new Map(),displays=new Map(),requests=new Map(),loadErrors=new Map();
const compareFrames=()=>[$('sdkCompare'),$('foundationCompare')];
const displayId=source=>source===$('sdkCompare')?'sdkDisplay':'foundationDisplay';
const displayName=source=>source===$('sdkCompare')?'SDK':'模型';
function makeFrame(kind){const element=document.createElement('iframe');element.src=`./${kind}/index.html?v=clip-40-47-141&frame=${frame}`;element.title=kind==='sdk'?'SDK 深度4D点云':'Fast-FoundationStereo 深度4D点云';element.allow='fullscreen';return element;}
function updateDisplayStatus(){
 for(const source of compareFrames()){
  const displayed=displays.get(source),requested=requests.get(source),error=loadErrors.get(source);
  const actual=displayed?`当前帧 ${displayed.index} · ${Number(displayed.time_s).toFixed(3)} s`:'尚未显示点云';
  const loading=requested!==undefined?` · 正在读取帧 ${requested}`:'';
  $(displayId(source)).textContent=`${displayName(source)}：${actual}${error?` · 读取失败：${error}`:loading}`;
  $(displayId(source)).dataset.state=error?'error':requested!==undefined?'loading':'displayed';
 }
 const aligned=compareFrames().every(source=>displays.get(source)?.index===frame&&!requests.has(source)&&!loadErrors.has(source));
 $('syncStatus').textContent=aligned?`两侧已对齐：帧 ${frame}`:'两侧尚未对齐；请等两侧帧号一致后比较。播放时较慢一侧可能延迟显示。';
 $('syncStatus').dataset.aligned=String(aligned);
}
function send(target,data){target?.contentWindow?.postMessage(data,location.origin);}
function requestSeek(target,index){requests.set(target,index);loadErrors.delete(target);send(target,{type:'pcd:seek',index});}
function pauseBoth(){for(const source of compareFrames())send(source,{type:'pcd:pause'});playbackLeader=null;$('comparePlay').textContent='播放';}
function select(view){
 for(const button of document.querySelectorAll('nav button'))button.classList.toggle('active',button.dataset.view===view);
 $('rgb').hidden=view!=='rgb';$('cloud').hidden=!['sdk','foundation'].includes(view);$('compare').hidden=view!=='compare';
 if(view!=='rgb')$('rgbVideo').pause();
 if(['sdk','foundation'].includes(view)){
  single?.remove();single=makeFrame(view);$('singleContainer').append(single);
  $('cloudTitle').textContent=view==='sdk'?'相机 SDK 深度 → 彩色4D点云':'Fast-FoundationStereo 深度 → 彩色4D点云';
  $('cloudInfo').textContent=view==='sdk'?'1920 × 1080 原始深度 · 完整 141 时刻':'960 × 540 双目模型深度 · 完整 141 时刻';
  $('openCloud').href=`./${view}/index.html?v=clip-40-47-141&frame=${frame}`;
 }else if(single){single.remove();single=null;}
 if(view==='compare'&&!pairReady){
  displays.clear();requests.clear();loadErrors.clear();
  for(const [source,kind] of [[$('sdkCompare'),'sdk'],[$('foundationCompare'),'foundation']]){requests.set(source,frame);source.src=`./${kind}/index.html?v=clip-40-47-141&frame=${frame}`;}
  pairReady=true;updateDisplayStatus();
 }
 if(view!=='compare'&&pairReady){for(const source of compareFrames())source.removeAttribute('src');pairReady=false;cameraLeader=null;playbackLeader=null;cameras.clear();displays.clear();requests.clear();loadErrors.clear();}
 history.replaceState(null,'',`#${view}`);
}
for(const button of document.querySelectorAll('nav button'))button.onclick=()=>select(button.dataset.view);
$('compareTimeline').oninput=()=>{frame=+$('compareTimeline').value;pauseBoth();for(const source of compareFrames())requestSeek(source,frame);$('compareTime').textContent=`目标帧 ${frame}`;updateDisplayStatus();};
$('comparePlay').onclick=()=>send(playbackLeader||$('sdkCompare'),{type:playbackLeader?'pcd:pause':'pcd:play'});
$('syncViews').onchange=()=>{
 if(!$('syncViews').checked)return;
 pauseBoth();
 const reference=cameraLeader&&cameras.get(cameraLeader);
 for(const source of compareFrames()){requestSeek(source,frame);if(reference)send(source,{type:'pcd:camera',camera:reference});}
 updateDisplayStatus();
};
addEventListener('message',event=>{
 if(event.origin!==location.origin||!event.data)return;
 const source=compareFrames().find(iframe=>iframe.contentWindow===event.source);
 if(!source)return;
 const other=source===$('sdkCompare')?$('foundationCompare'):$('sdkCompare');
 const data=event.data;
 if(data.type==='pcd:camera'){
  cameras.set(source,data.camera);cameraLeader=source;if($('syncViews').checked)send(other,data);
 }else if(data.type==='pcd:loading'&&Number.isInteger(data.index)){
  requests.set(source,data.index);loadErrors.delete(source);updateDisplayStatus();
 }else if(data.type==='pcd:displayed'&&Number.isInteger(data.index)){
  displays.set(source,{index:data.index,time_s:data.time_s});
  if(requests.get(source)===data.index)requests.delete(source);
  loadErrors.delete(source);updateDisplayStatus();
 }else if(data.type==='pcd:load-error'){
  requests.delete(source);loadErrors.set(source,String(data.message||'未知错误'));updateDisplayStatus();
 }else if(data.type==='pcd:frame'&&Number.isInteger(data.index)){
  frame=data.index;$('compareTimeline').value=frame;$('compareTime').textContent=`目标 ${Number(data.time_s).toFixed(3)} s · 帧 ${frame}`;
  if($('syncViews').checked)requestSeek(other,frame);updateDisplayStatus();
 }else if(data.type==='pcd:play-state'){
  if(data.playing){playbackLeader=source;send(other,{type:'pcd:pause'});}
  else if(playbackLeader===source)playbackLeader=null;
  $('comparePlay').textContent=playbackLeader?'暂停':'播放';
 }else if(data.type==='pcd:ready'&&$('syncViews').checked){
  requestSeek(source,frame);if(cameraLeader&&cameras.has(cameraLeader))send(source,{type:'pcd:camera',camera:cameras.get(cameraLeader)});updateDisplayStatus();
 }
});
const requested=location.hash.slice(1);select(['sdk','foundation','compare'].includes(requested)?requested:'rgb');

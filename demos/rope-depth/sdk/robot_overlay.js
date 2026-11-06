import * as THREE from './three.module.js';

// Geometry is in the same rectified LEFT optical metre frame as the clouds.
// This component deliberately has no playback clock: show() commits both.
export function validateRobotOverlay(data, manifest, frameOverlay) {
 if(data.schema!=='robot_mesh_preview.v1'||data.units!=='metre'||!data.frame.startsWith('ZED rectified LEFT optical'))throw Error('机器人网格坐标或单位不匹配');
 if(data.frames.length!==manifest.frames.length||data.point_ids.length!==30||new Set(data.point_ids).size!==30)throw Error('机器人网格帧数或候选点身份不匹配');
 const rows=new Map();
 for(let i=0;i<manifest.frames.length;i++){
  const frame=manifest.frames[i],record=data.frames[i];
  if(record.source_index!==frame.source_index||rows.has(record.source_index)||Math.abs(record.time_s-frame.time_s)>1e-9)throw Error('机器人网格源帧或显示时间不匹配');
  // Integers above 2^53 must reach the browser as strings, not rounded Numbers.
  if(typeof frame.image_timestamp_ns!=='string'||frame.image_timestamp_ns!==record.image_timestamp_ns)throw Error('机器人/点云 IMAGE 纳秒时间不匹配');
  if(record.points_m.length!==30||record.points_m.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('候选点数组格式不符');
  for(const part of data.parts){
   const matrix=record.T_zed_from_mesh[part.mesh_index];
   if(!matrix||matrix.length!==16||matrix.some(v=>!Number.isFinite(v)))throw Error('机器人网格位姿无效');
  }
  rows.set(record.source_index,record);
 }
 for(const [id,matrix] of [['B',data.T_zed_from_base],['W',data.T_zed_from_world]]){
  const expected=frameOverlay.frames.find(f=>f.id===id)?.T_scene_from_frame?.flat();
  if(!expected||expected.length!==16||matrix.length!==16||matrix.some((v,i)=>Math.abs(v-expected[i])>1e-9))throw Error('机器人与点云坐标轴外参不匹配');
 }
 return rows;
}

export async function createRobotOverlay({scene,manifest,frameOverlay,config,onChange}) {
 const dataURL=new URL(config.data_url,location.href);
 const checkedFetch=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`机器人网格读取失败 HTTP ${r.status}`);return r;};
 const data=await (await checkedFetch(dataURL)).json();
 const rows=validateRobotOverlay(data,manifest,frameOverlay);
 const arm=new THREE.Group(),gripper=new THREE.Group();
 scene.add(arm,gripper);arm.visible=false;gripper.visible=false;
 scene.add(new THREE.HemisphereLight(0xe3f1ff,0x465465,1.8));
 const light=new THREE.DirectionalLight(0xffffff,2.0);light.position.set(-1,-2,-1);scene.add(light);
 const parts=await Promise.all(data.parts.map(async part=>{
  const binary=await (await checkedFetch(new URL(part.geometry_path,dataURL))).arrayBuffer();
  if(binary.byteLength!==part.vertex_count*12)throw Error(`网格大小不匹配：${part.link_name}`);
  const vertices=new Float32Array(binary);
  if(vertices.some(v=>!Number.isFinite(v)))throw Error('网格顶点包含无效数值');
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.computeVertexNormals();geometry.computeBoundingBox();
  const color=part.group==='arm'?0x9baec4:part.link_name.endsWith('_finger')?0xffbc65:0x8dd7ee;
  const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.65,metalness:.1,transparent:true,opacity:.6,depthTest:true,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;
  (part.group==='arm'?arm:gripper).add(mesh);
  return {...part,mesh};
 }));
 // Fit all recorded poses, so an unchanged inspection camera still contains
 // every robot link while the timeline plays; depth outliers do not set it.
 const fullTrajectory=new THREE.Box3(),gripperTrajectory=new THREE.Box3();
 for(const part of parts){
  const local=part.mesh.geometry.boundingBox,corners=[];
  for(const x of [local.min.x,local.max.x])for(const y of [local.min.y,local.max.y])for(const z of [local.min.z,local.max.z])corners.push(new THREE.Vector3(x,y,z));
  for(const record of data.frames){const matrix=new THREE.Matrix4().set(...record.T_zed_from_mesh[part.mesh_index]);for(const corner of corners){const point=corner.clone().applyMatrix4(matrix);fullTrajectory.expandByPoint(point);if(part.group==='gripper')gripperTrajectory.expandByPoint(point);}}
 }
 const pointGeometry=new THREE.BufferGeometry();pointGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(90),3));
 const points=new THREE.Points(pointGeometry,new THREE.PointsMaterial({color:0xffa838,size:.005,depthTest:true,depthWrite:false}));
 points.frustumCulled=false;points.visible=false;scene.add(points);
 let sourceIndex=null,intent={showGripper:true,showArm:false,showPoints:false};
 const visibility=()=>{const ready=sourceIndex!==null;gripper.visible=ready&&intent.showGripper;arm.visible=ready&&intent.showArm;points.visible=ready&&intent.showPoints;};
 return {
  apply(frame){
   const record=rows.get(frame.source_index);
   if(!record)throw Error('当前点云没有对应的机器人网格');
   for(const part of parts)part.mesh.matrix.set(...record.T_zed_from_mesh[part.mesh_index]);
   pointGeometry.attributes.position.array.set(record.points_m.flat());pointGeometry.attributes.position.needsUpdate=true;
   sourceIndex=record.source_index;visibility();
  },
  setVisibility(value){intent={...value};visibility();onChange();},
  setOpacity(value){for(const part of parts)part.mesh.material.opacity=value;onChange();},
  centre(){const p=rows.get(sourceIndex)?.points_m;if(!p)return null;const c=new THREE.Vector3();for(const point of p)c.add(new THREE.Vector3(...point));return c.divideScalar(p.length);},
  bounds(){if(sourceIndex===null)return null;gripper.updateMatrixWorld(true);return new THREE.Box3().setFromObject(gripper);},
  trajectoryBounds({includeArm=false}={}){return (includeArm?fullTrajectory:gripperTrajectory).clone();},
  getState(){return {source_index:sourceIndex,gripper_visible:gripper.visible,arm_visible:arm.visible,points_visible:points.visible,mesh_count:parts.length,point_count:30,drive_joint_rad:.761,clock:'pointcloud displayed-frame commit'};},
 };
}

/* Linear-light forward shading. WebGL 1 / GLSL ES 1.00, eight fragment samplers. */
(function(root){
'use strict';
// Byte textures store n/255, while radix-256 packing produces n/256.
const depthPacking=Object.freeze({encodeScale:256/255,decodeScale:255/256});
const common = `
const vec3 SUN = vec3(-0.6000,0.6600,0.4500);
vec3 displayColor(vec3 x){
  x=max(x,vec3(0.0));
  x=(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14);
  return pow(clamp(x,0.0,1.0),vec3(1.0/2.2));
}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float valueNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
vec3 skyRadiance(vec3 ray,float night,float time){
  float h=max(ray.y,0.0),sunDot=max(dot(ray,normalize(SUN)),0.0);
  vec3 day=mix(vec3(.73,.83,.90),vec3(.085,.27,.53),pow(h,.40));
  day+=vec3(.65,.31,.11)*pow(sunDot,9.0)*(1.0-h)*.22;
  day+=vec3(5.0,3.9,2.5)*smoothstep(.99955,.99988,sunDot);
  if(ray.y>.045){
    vec2 uv=ray.xz/(ray.y+.18)*1.7+vec2(time*.003,0.0);
    float n=valueNoise(uv)*.56+valueNoise(uv*2.1)*.28+valueNoise(uv*4.3)*.16;
    float cloud=smoothstep(.58,.79,n)*smoothstep(.045,.15,ray.y)*(1.0-smoothstep(.64,.98,ray.y));
    day=mix(day,vec3(.85,.83,.80),cloud*.64);
  }
  vec3 dark=mix(vec3(.015,.029,.055),vec3(.002,.008,.023),pow(h,.42));
  dark+=vec3(.5,.65,.9)*smoothstep(.99965,.9999,sunDot)*.34;
  vec2 stars=floor(ray.xz/(ray.y+.3)*270.0);
  float star=step(.9984,hash21(stars))*pow(max(ray.y,0.0),.5);
  dark+=star*vec3(.11,.13,.16);
  return mix(day,dark,night);
}
`;
const vertex=`
precision highp float;
attribute vec3 a_position;attribute vec3 a_normal;attribute vec3 a_color;
uniform mat4 u_vp;uniform mat4 u_model;uniform mat4 u_light_matrix;
uniform vec3 u_eye;
varying vec3 v_color;varying vec3 v_normal;varying vec3 v_world;varying vec3 v_local;
varying vec4 v_shadow;varying float v_distance;
void main(){
 vec4 world=u_model*vec4(a_position,1.0);
 mat3 m=mat3(u_model);
 vec3 c0=cross(m[1],m[2]),c1=cross(m[2],m[0]),c2=cross(m[0],m[1]);
 float determinant=dot(m[0],c0);
 vec3 n=normalize(mat3(c0,c1,c2)*a_normal*(determinant<0.0?-1.0:1.0));
 v_normal=n;v_world=world.xyz;v_local=a_position;v_color=a_color;v_distance=distance(world.xyz,u_eye);
 v_shadow=u_light_matrix*vec4(world.xyz+n*.035,1.0);
 gl_Position=u_vp*world;
}`;
const fragment=`
precision highp float;
uniform vec3 u_eye;uniform vec3 u_fog;uniform float u_night;uniform float u_time;
uniform float u_emission;uniform float u_material;uniform float u_alpha;
uniform float u_asset_roughness;uniform float u_asset_metallic;uniform vec3 u_asset_emissive;uniform vec3 u_asset_tint;
uniform vec3 u_headlight_left;uniform vec3 u_headlight_right;uniform vec3 u_headlight_dir;
uniform sampler2D u_ground_texture;uniform sampler2D u_road_texture;uniform sampler2D u_architecture_texture;
uniform sampler2D u_hardscape_texture;uniform sampler2D u_nature_texture;uniform sampler2D u_vehicle_atlas;uniform sampler2D u_paint_texture;
uniform sampler2D u_shadow_map;uniform vec2 u_shadow_texel;uniform float u_shadow_enabled;
varying vec3 v_color;varying vec3 v_normal;varying vec3 v_world;varying vec3 v_local;varying vec4 v_shadow;varying float v_distance;
${common}
vec2 atlasUV(vec2 uv,float tile){return vec2(mod(tile,2.0),1.0-floor(tile*.5))*.5+vec2(.012)+fract(uv)*.476;}
vec3 detailTint(vec3 tex,float strength){float l=dot(tex,vec3(.2126,.7152,.0722));return mix(vec3(1.0),clamp(vec3(.72)+tex*.60,vec3(.64),vec3(1.22)),strength)*(1.0+(l-.5)*strength*.17);}
float shadowVisibility(vec3 n){
 if(u_shadow_enabled<.5)return 1.0;
 vec3 q=v_shadow.xyz/v_shadow.w*.5+.5;
 if(q.z<=0.0||q.z>=1.0||q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0)return 1.0;
 float bias=.000055+.00014*(1.0-max(dot(n,normalize(SUN)),0.0)),visibility=0.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec4 packedDepth=texture2D(u_shadow_map,q.xy+vec2(float(x),float(y))*u_shadow_texel);
  float depth=dot(packedDepth,vec4(1.0/16777216.0,1.0/65536.0,1.0/256.0,1.0))*${depthPacking.decodeScale};
  visibility+=step(q.z-bias,depth);
 }
 float edge=min(min(q.x,1.0-q.x),min(q.y,1.0-q.y));
 return mix(1.0,visibility/9.0,smoothstep(.0,.075,edge));
}
float headlight(vec3 source,vec3 n){
 vec3 ray=v_world-source;float d=length(ray);vec3 direction=ray/max(d,.001);
 float cone=smoothstep(.90,.977,dot(direction,normalize(u_headlight_dir)));
 return cone*(1.0-smoothstep(12.0,43.0,d))*(.08+.92*max(dot(n,-direction),0.0));
}
void main(){
 vec3 n=normalize(v_normal),view=normalize(u_eye-v_world),sun=normalize(SUN);
 vec3 albedo=pow(clamp(v_color,vec3(.005),vec3(1.0)),vec3(2.2)),emissive=vec3(0.0);
 float maximum=max(v_color.r,max(v_color.g,v_color.b)),minimum=min(v_color.r,min(v_color.g,v_color.b)),chroma=maximum-minimum;
 float roughness=.82,metallic=0.0,coat=0.0,water=0.0,foliage=0.0;
 if(u_material<.5){
  float up=step(.76,n.y),low=1.0-smoothstep(.20,1.55,v_world.y);
  foliage=step(v_color.r*1.13,v_color.g)*step(v_color.b*1.13,v_color.g)*step(.18,maximum);
  float asphalt=up*low*(1.0-smoothstep(.27,.43,maximum));
  vec2 wallUV=abs(n.x)>abs(n.z)?v_world.zy:v_world.xy;
  if(asphalt>.5){albedo*=detailTint(texture2D(u_road_texture,v_world.xz*.115).rgb,.70);roughness=.94;}
  else if(up>.5&&low>.5&&foliage<.5&&maximum>.48&&chroma<.32){albedo*=detailTint(texture2D(u_hardscape_texture,atlasUV(v_world.xz*.13,0.0)).rgb,.6);}
  else if(foliage>.5){
   vec3 ground=texture2D(u_ground_texture,v_world.xz*.105).rgb;
   vec3 leaf=texture2D(u_nature_texture,atlasUV(wallUV*.35,1.0)).rgb;
   albedo*=detailTint(mix(leaf,ground,up),.6);roughness=.88;
  }else if(abs(n.y)<.35&&v_world.y>1.9&&maximum>.40){
   float tile=v_color.r>v_color.g*1.08?1.0:0.0;
   vec3 tex=texture2D(u_architecture_texture,atlasUV(wallUV*.23,tile)).rgb;
   albedo*=detailTint(tex,.48);
   // Dampen broad wall repetition without high-frequency procedural speckle.
   albedo*=.98+.04*valueNoise(wallUV*.14);
  }
  float glass=step(v_color.r*1.12,v_color.b)*step(v_color.r*1.10,v_color.g)*(1.0-step(.54,v_color.r))*(1.0-up)*step(1.4,v_world.y)*(1.0-foliage);
  if(glass>.5){roughness=.16;metallic=.20;coat=.55;}
  float litWindow=1.0-smoothstep(.035,.09,length(v_color-vec3(.882,.718,.486)));
  emissive+=albedo*litWindow*u_night*1.35*(1.0-up);
  float sand=up*low*step(.60,v_color.r)*step(.06,v_color.r-v_color.b)*(1.0-asphalt);
  if(sand>.5)albedo*=detailTint(texture2D(u_nature_texture,atlasUV(v_world.xz*.1,3.0)).rgb,.30);
 }else if(u_material<1.5){
  roughness=.28;metallic=.24;coat=1.0;
  vec2 uv=abs(n.y)>.6?v_local.xz:abs(n.x)>abs(n.z)?v_local.zy:v_local.xy;
  float paint=dot(texture2D(u_paint_texture,uv*1.5).rgb,vec3(.333));
  albedo*=.97+.06*paint;
 }else if(u_material<3.5){
  float rubber=1.0-smoothstep(.19,.31,maximum);
  float glass=(1.0-rubber)*step(v_color.r*1.08,v_color.b)*step(v_color.g*1.025,v_color.b);
  float metal=(1.0-rubber)*(1.0-glass)*(1.0-smoothstep(.14,.28,chroma));
  roughness=mix(.30,.88,rubber);roughness=mix(roughness,.10,glass);
  metallic=metal*.78;coat=glass*.9;
  vec2 uv=abs(n.y)>.6?v_local.xz:abs(n.x)>abs(n.z)?v_local.zy:v_local.xy;
  float tile=rubber>.5?2.0:glass>.5?1.0:3.0;
  albedo*=detailTint(texture2D(u_vehicle_atlas,atlasUV(uv*.8,tile)).rgb,.12);
 }else if(u_material>4.5&&u_material<5.5){
  albedo*=u_asset_tint;roughness=clamp(u_asset_roughness,.07,1.0);metallic=clamp(u_asset_metallic,0.0,1.0);
  emissive+=u_asset_emissive*(.3+u_night*1.6);coat=metallic*.35;
 }
 if(u_material>5.5&&u_material<6.5){
  water=1.0;
  float a=v_world.x*.16+v_world.z*.11+u_time*.70,b=v_world.z*.34-v_world.x*.21+u_time*1.1;
  n=normalize(vec3(-.045*cos(a)-.023*cos(b),1.0,-.032*cos(a)+.034*cos(b)));
  albedo=vec3(.012,.070,.086);roughness=.14;metallic=.05;coat=1.0;
 }
 float noV=max(dot(n,view),.001),noL=max(dot(n,sun),0.0);
 vec3 halfVector=normalize(view+sun);float noH=max(dot(n,halfVector),0.0),voH=max(dot(view,halfVector),0.0);
 vec3 f0=mix(vec3(.04),albedo,metallic),fresnel=f0+(1.0-f0)*pow(1.0-voH,5.0);
 float a=roughness*roughness,a2=a*a,denominator=noH*noH*(a2-1.0)+1.0;
 float distribution=a2/max(3.14159265*denominator*denominator,.00001);
 float k=(roughness+1.0)*(roughness+1.0)/8.0;
 float geometry=(noV/(noV*(1.0-k)+k))*(noL/(noL*(1.0-k)+k));
 vec3 specular=distribution*geometry*fresnel/max(4.0*noV*noL,.001);
 float visibility=shadowVisibility(n);
 vec3 sunColor=mix(vec3(2.85,2.45,1.93),vec3(.035,.055,.095),u_night);
 vec3 direct=((1.0-fresnel)*(1.0-metallic)*albedo/3.14159265+specular)*sunColor*noL*visibility;
 float skyWeight=clamp(n.y*.5+.5,0.0,1.0);
 vec3 ambient=mix(vec3(.17,.145,.12),vec3(.39,.50,.62),skyWeight);
 ambient*=mix(1.0,.09,u_night);
 float localAO=mix(.78,1.0,smoothstep(-.05,.75,n.y));
 vec3 color=direct+albedo*(1.0-metallic*.65)*ambient*localAO;
 vec3 reflection=reflect(-view,n);
 vec3 reflected=skyRadiance(reflection,u_night,u_time);
 reflected=mix(reflected,skyRadiance(vec3(0,1,0),u_night,u_time),roughness*.7);
 if(reflection.y<0.0)reflected=mix(vec3(.12,.115,.10)*mix(1.0,.05,u_night),reflected,exp(reflection.y*5.0));
 vec3 envF=f0+(1.0-f0)*pow(1.0-noV,5.0);
 color+=reflected*envF*(1.0-roughness*.76);
 color+=reflected*(.025+.15*pow(1.0-noV,5.0))*coat;
 color+=vec3(.16,.21,.07)*albedo*foliage*max(dot(-n,sun),0.0)*visibility*(1.0-u_night);
 if(water>.5){float fres=.025+.975*pow(1.0-noV,5.0);color=mix(color,reflected*.88,fres);}
 if(u_night>.5&&v_distance<60.0)color+=albedo*(headlight(u_headlight_left,n)+headlight(u_headlight_right,n))*vec3(2.7,2.05,1.3);
 color+=albedo*u_emission*2.6+emissive;
 vec3 ray=normalize(v_world-u_eye);float haze=1.0-exp(-v_distance*mix(.00072,.00048,u_night));
 haze=max(haze,smoothstep(1080.0,1470.0,v_distance));
 vec3 fog=skyRadiance(vec3(ray.x,max(ray.y,.018),ray.z),u_night,u_time);
 gl_FragColor=vec4(displayColor(mix(color,fog,haze)),u_alpha);
}`;
const skyVertex=`attribute vec2 a_position;varying vec2 v_uv;void main(){v_uv=a_position;gl_Position=vec4(a_position,1.0,1.0);}`;
const skyFragment=`precision highp float;varying vec2 v_uv;uniform vec3 u_forward;uniform vec3 u_right;uniform vec3 u_up;uniform float u_aspect;uniform float u_night;uniform float u_time;${common}
void main(){vec3 ray=normalize(u_forward+u_right*v_uv.x*u_aspect*.554309+u_up*v_uv.y*.554309);gl_FragColor=vec4(displayColor(skyRadiance(ray,u_night,u_time)),1.0);}`;
const shadowVertex=`attribute vec3 a_position;uniform mat4 u_model;uniform mat4 u_light_matrix;void main(){gl_Position=u_light_matrix*u_model*vec4(a_position,1.0);}`;
const shadowFragment=`precision highp float;void main(){vec4 d=fract(min(gl_FragCoord.z,.999999)*vec4(16777216.0,65536.0,256.0,1.0));d-=d.xxyz*vec4(0.0,1.0/256.0,1.0/256.0,1.0/256.0);gl_FragColor=d*${depthPacking.encodeScale};}`;
const api={depthPacking,vertex,fragment,skyVertex,skyFragment,shadowVertex,shadowFragment};
root.NeonCoastShaders=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

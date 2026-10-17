/* Raymarch kit: HDR scene pass (user fragment code) -> bloom -> filmic tonemap + grade + grain.
   Reel.RM(stage, { scene: glslString, bloom, exposure, ... }) -> { render(t, uniforms), set(), setArr() }
   The scene code must define:  vec3 render(vec2 fc)   (fc = pixel coord incl. sub-pixel jitter)
   Common GLSL helpers (noise, SDF primitives, smin, rotations, camera) are prepended. */
(function () {
  const COMMON = `
#define PI 3.14159265359
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash13(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3=fract(p3*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y), f.z); }
float vnoise2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),f.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),f.x), f.y); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
float fbm2(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vnoise2(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
float smin(float a, float b, float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float smax(float a, float b, float k){ return -smin(-a,-b,k); }
float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
float sdRoundBox(vec3 p, vec3 b, float r){ vec3 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r; }
float sdEllipsoid(vec3 p, vec3 r){ float k0=length(p/r), k1=length(p/(r*r)); return k0*(k0-1.)/k1; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){ vec3 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); return length(pa-ba*h)-r; }
float sdTorus(vec3 p, vec2 t){ vec2 q=vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
float sdCylinder(vec3 p, float h, float r){ vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h); return min(max(d.x,d.y),0.)+length(max(d,0.)); }
float sdRoundCylinder(vec3 p, float ra, float rb, float h){ vec2 d=vec2(length(p.xz)-2.0*ra+rb, abs(p.y)-h); return min(max(d.x,d.y),0.0)+length(max(d,0.0))-rb; }
float sdTri2(vec2 p, float r){ const float k=1.7320508; p.x=abs(p.x)-r; p.y=p.y+r/k; if(p.x+k*p.y>0.) p=vec2(p.x-k*p.y,-k*p.x-p.y)/2.; p.x-=clamp(p.x,-2.*r,0.); return -length(p)*sign(p.y); }
float extrude(float d2, float z, float h){ vec2 w=vec2(d2, abs(z)-h); return min(max(w.x,w.y),0.)+length(max(w,0.)); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
mat3 camMat(vec3 ro, vec3 ta, float roll){ vec3 w=normalize(ta-ro), u=normalize(cross(w, vec3(sin(roll),cos(roll),0.))), v=cross(u,w); return mat3(u,v,w); }
float schlick(float cosT, float f0){ return f0+(1.-f0)*pow(clamp(1.-cosT,0.,1.),5.); }
vec3 thinFilm(float c){ return .5+.5*cos(6.28318*(vec3(0.,.33,.67)+c)); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
`;

  function RM(stage, o) {
    const RS = Reel.RS;
    const W = Math.round(Reel.W * RS), H = Math.round(Reel.H * RS);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px';
    stage.appendChild(cv);
    const G = Reel.GL(cv);
    const gl = G.gl;
    const hdr = G.target(W, H, { float: true });
    const dw = W / 4 | 0, dh = H / 4 | 0;
    const A = G.target(dw, dh, { float: true }), B = G.target(dw, dh, { float: true });
    const A2 = G.target(dw / 2 | 0, dh / 2 | 0, { float: true }), B2 = G.target(dw / 2 | 0, dh / 2 | 0, { float: true });
    const head = `#version 300 es
precision highp float; precision highp int; in vec2 uv; out vec4 o;
uniform vec2 uRes; uniform float uTime; uniform vec2 uJit;
`;
    const scene = G.program(head + COMMON + 'float gDepth = 1e4;\n' + (o.uniforms || '') + '\n' + o.scene + `
void main(){ vec3 c = render(gl_FragCoord.xy + uJit); o = vec4(max(c, 0.), gDepth); }`);
    const bright = G.program(head + `uniform sampler2D s; uniform float th; uniform vec2 px;
void main(){ vec3 c=vec3(0.); for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++) c+=texture(s,uv+vec2(i,j)*px).rgb; c/=9.;
  float l=max(c.r,max(c.g,c.b)); o=vec4(c*smoothstep(th,th*2.+.5,l)/max(l,1e-3)*min(l,8.),1.); }`);
    const blur = G.program(head + `uniform sampler2D s; uniform vec2 dir;
void main(){ vec3 c=texture(s,uv).rgb*.2270270270;
  c+=texture(s,uv+dir*1.3846153846).rgb*.3162162162; c+=texture(s,uv-dir*1.3846153846).rgb*.3162162162;
  c+=texture(s,uv+dir*3.2307692308).rgb*.0702702703; c+=texture(s,uv-dir*3.2307692308).rgb*.0702702703; o=vec4(c,1.); }`);
    const dofP = G.program(head + COMMON + `uniform sampler2D s; uniform float focus, aperture, maxCoc;
float coc(float z){ return clamp(abs(1./focus - 1./max(z, 1e-3)) * aperture, 0., maxCoc); }
void main(){
  vec4 c0 = texture(s, uv); float cc = coc(c0.a);
  vec3 acc = c0.rgb; float w = 1.;
  for (int i=0;i<48;i++){
    float fi = float(i) + .5; float r = sqrt(fi / 48.) * maxCoc; float a = fi * 2.39996323;
    vec4 sm = texture(s, uv + vec2(cos(a), sin(a)) * r / uRes);
    float sc = coc(sm.a); if (sm.a > c0.a) sc = min(sc, cc * 1.6 + .5);
    float wg = clamp(sc - r + 1., 0., 1.); acc += sm.rgb * wg; w += wg;
  }
  o = vec4(acc / w, c0.a);
}`);
    const dofT = G.target(W, H, { float: true });
    const comp = G.program(head + COMMON + `uniform sampler2D s; uniform sampler2D b1; uniform sampler2D b2;
uniform float bloom, expo, vig, grain, ca, contrast, sat, frame; uniform vec3 lift, gain;
void main(){
  vec2 d = uv - .5;
  vec3 c;
  float k = ca / uRes.x;
  c.r = texture(s, uv - d*k*2.).r; c.g = texture(s, uv).g; c.b = texture(s, uv + d*k*2.).b;
  c += (texture(b1, uv).rgb*.55 + texture(b2, uv).rgb*.8) * bloom;
  c *= expo;
  c = aces(c);
  c = pow(c, vec3(1./2.2));
  c = (c - .5) * contrast + .5;
  float g = dot(c, vec3(.2126,.7152,.0722)); c = mix(vec3(g), c, sat);
  c = c * gain + lift * (1. - c);
  c *= 1. - vig * smoothstep(.3, 1.05, length(d * vec2(1.3, 1.)));
  c += (hash12(gl_FragCoord.xy + frame * 17.31) - .5) * grain;
  c += (hash12(gl_FragCoord.xy * 1.7 + 3.1) - .5) / 255.;
  o = vec4(clamp(c, 0., 1.), 1.);
}`);
    const P = Object.assign({ bloom: 0.6, th: 1.0, expo: 1.0, vig: 0.35, grain: 0.035, ca: 0.6, contrast: 1.0, sat: 1.0, lift: [0, 0, 0], gain: [1, 1, 1], bands: 6, focus: 5, aperture: 0, maxCoc: 0 }, o);
    const uni = {};
    const locs = {};
    function setArr(name, arr) { uni[name] = arr; }
    function applyUniforms() {
      for (const k in uni) {
        const v = uni[k];
        let l = locs[k]; if (l === undefined) l = locs[k] = gl.getUniformLocation(scene.pr, k);
        if (l === null) continue;
        if (typeof v === 'number') gl.uniform1f(l, v);
        else if (v.__ints) gl.uniform1i(l, v.v);
        else if (v instanceof Float32Array) { if (v.__vec === 3) gl.uniform3fv(l, v); else gl.uniform4fv(l, v); }
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else if (v.length === 4) gl.uniform4fv(l, v);
      }
    }
    return {
      canvas: cv, W, H,
      set(name, v) { uni[name] = v; return this; },
      setArr,
      render(t, ov = {}) {
        const p = Object.assign({}, P, ov);
        const jit = Reel.jit || [0, 0];
        // scene pass in horizontal bands (keeps each software-GL draw call short)
        scene.use();
        gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fb);
        gl.viewport(0, 0, W, H);
        gl.uniform2f(gl.getUniformLocation(scene.pr, 'uRes'), W, H);
        gl.uniform1f(gl.getUniformLocation(scene.pr, 'uTime'), t);
        gl.uniform2f(gl.getUniformLocation(scene.pr, 'uJit'), jit[0], -jit[1]);
        applyUniforms();
        gl.enable(gl.SCISSOR_TEST);
        const bh = Math.ceil(H / p.bands);
        for (let b = 0; b < p.bands; b++) {
          gl.scissor(0, b * bh, W, bh);
          scene.draw(hdr);
          gl.finish();
        }
        gl.disable(gl.SCISSOR_TEST);
        let src = hdr;
        if (p.maxCoc > 0.5) {
          dofP.use().set('s', { tex: hdr.tex, unit: 0 }).set('focus', p.focus).set('aperture', p.aperture * W / 1216).set('maxCoc', p.maxCoc * W / 1216).set('uRes', [W, H]).draw(dofT);
          src = dofT;
        }
        bright.use().set('s', { tex: src.tex, unit: 0 }).set('th', p.th).set('px', [1 / W, 1 / H]).draw(A);
        blur.use().set('s', { tex: A.tex, unit: 0 }).set('dir', [1 / dw, 0]).draw(B);
        blur.use().set('s', { tex: B.tex, unit: 0 }).set('dir', [0, 1 / dh]).draw(A);
        blur.use().set('s', { tex: A.tex, unit: 0 }).set('dir', [1 / (dw / 2), 0]).draw(B2);
        blur.use().set('s', { tex: B2.tex, unit: 0 }).set('dir', [0, 1 / (dh / 2)]).draw(A2);
        blur.use().set('s', { tex: A2.tex, unit: 0 }).set('dir', [2 / (dw / 2), 0]).draw(B2);
        blur.use().set('s', { tex: B2.tex, unit: 0 }).set('dir', [0, 2 / (dh / 2)]).draw(A2);
        comp.use().set('s', { tex: src.tex, unit: 0 }).set('b1', { tex: A.tex, unit: 1 }).set('b2', { tex: A2.tex, unit: 2 })
          .set('bloom', p.bloom).set('expo', p.expo).set('vig', p.vig).set('grain', p.grain).set('ca', p.ca)
          .set('contrast', p.contrast).set('sat', p.sat).set('lift', p.lift).set('gain', p.gain)
          .set('frame', Math.floor(t * 30)).set('uRes', [W, H]).draw(null);
        gl.finish();
      },
    };
  }
  Reel.RM = RM;
  Reel.RM_COMMON = COMMON;
})();

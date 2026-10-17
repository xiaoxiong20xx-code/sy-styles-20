/* Minimal WebGL2 helpers + cinematic post stack (bloom, chromatic aberration, scanlines, grain, vignette). */
(function () {
  const VS = `#version 300 es
  in vec2 p; out vec2 uv; void main(){ uv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

  function GL(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false, alpha: opts.alpha || false });
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const progs = [];
    function program(fs) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); console.error(e, src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n')); throw e; } return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw gl.getProgramInfoLog(pr);
      const loc = {};
      const P = {
        pr,
        use() { gl.useProgram(pr); return P; },
        set(name, v) {
          let l = loc[name]; if (l === undefined) l = loc[name] = gl.getUniformLocation(pr, name);
          if (l === null) return P;
          if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.tex !== undefined) { gl.activeTexture(gl.TEXTURE0 + v.unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(l, v.unit); }
          else if (v.length === 2) gl.uniform2fv(l, v);
          else if (v.length === 3) gl.uniform3fv(l, v);
          else if (v.length === 4) gl.uniform4fv(l, v);
          return P;
        },
        draw(target, w, h) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
          gl.viewport(0, 0, w || (target ? target.w : canvas.width), h || (target ? target.h : canvas.height));
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          return P;
        },
      };
      progs.push(P);
      return P;
    }
    function texture(w, h, { float = false, filter = gl.LINEAR } = {}) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { tex, w, h };
    }
    function target(w, h, o) {
      const t = texture(w, h, o);
      t.fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      return t;
    }
    function upload(t, source) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
    gl.getExtension('EXT_color_buffer_float');
    return { gl, program, texture, target, upload, canvas };
  }

  /* Post stack. src = a canvas (2D or GL) to treat as the scene image. */
  function Post(stage, src, o = {}) {
    const W = Math.round(Reel.W * Reel.RS), H = Math.round(Reel.H * Reel.RS);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px';
    stage.appendChild(cv);
    const G = GL(cv);
    const scene = G.texture(W, H);
    const dw = W / 4 | 0, dh = H / 4 | 0;
    const A = G.target(dw, dh, { float: true }), B = G.target(dw, dh, { float: true });
    const A2 = G.target(dw / 2 | 0, dh / 2 | 0, { float: true }), B2 = G.target(dw / 2 | 0, dh / 2 | 0, { float: true });
    const head = `#version 300 es
    precision highp float; in vec2 uv; out vec4 o;`;
    const bright = G.program(head + `uniform sampler2D s; uniform float th; uniform vec2 px;
      void main(){ vec3 c=vec3(0.);
        for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++) c+=texture(s,uv+vec2(i,j)*px).rgb;
        c/=9.; float l=max(c.r,max(c.g,c.b)); o=vec4(c*smoothstep(th,th+.25,l),1.); }`);
    const blur = G.program(head + `uniform sampler2D s; uniform vec2 dir;
      void main(){ vec3 c=texture(s,uv).rgb*.2270270270;
        c+=texture(s,uv+dir*1.3846153846).rgb*.3162162162; c+=texture(s,uv-dir*1.3846153846).rgb*.3162162162;
        c+=texture(s,uv+dir*3.2307692308).rgb*.0702702703; c+=texture(s,uv-dir*3.2307692308).rgb*.0702702703;
        o=vec4(c,1.); }`);
    const comp = G.program(head + `uniform sampler2D s; uniform sampler2D b1; uniform sampler2D b2;
      uniform float bloom, ca, scan, vig, grain, time, flick, glitch, sat, lift; uniform vec3 tint; uniform vec2 res;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 q = uv;
        // glitch: horizontal slice displacement
        if (glitch > 0.) {
          float band = floor(q.y * 36. + floor(time*24.)*7.);
          float r = h(vec2(band, floor(time*24.)));
          if (r > 1. - glitch*0.5) q.x += (h(vec2(band, 3.)) - .5) * .08 * glitch;
        }
        vec2 d = (q - .5);
        float k = ca / 1920.;
        vec3 c;
        c.r = texture(s, q - d * k * 2.).r;  // k in 1080p pixels
        c.g = texture(s, q).g;
        c.b = texture(s, q + d * k * 2.).b;
        vec3 bl = texture(b1, q).rgb * .6 + texture(b2, q).rgb * .9;
        c += bl * bloom * tint;
        float gray = dot(c, vec3(.299,.587,.114)); c = mix(vec3(gray), c, sat);
        c += lift;
        float sl = .5 + .5 * sin(q.y * res.y * 6.28318 / 3.);
        c *= 1. - scan * (1.-sl);
        c *= 1. - vig * smoothstep(.35, 1.0, length(d * vec2(1.25, 1.)));
        c *= flick;
        c += (h(q * 1000. + time) - .5) * grain;
        o = vec4(c, 1.);
      }`);
    const P = Object.assign({ bloom: 1, th: .45, ca: 1.5, scan: .08, vig: .35, grain: .04, flick: 1, glitch: 0, tint: [1, 1, 1], sat: 1, lift: 0 }, o);
    return {
      canvas: cv,
      render(t, ov = {}) {
        const p = Object.assign({}, P, ov);
        G.upload(scene, src);
        bright.use().set('s', { tex: scene.tex, unit: 0 }).set('th', p.th).set('px', [1 / W, 1 / H]).draw(A);
        blur.use().set('s', { tex: A.tex, unit: 0 }).set('dir', [1 / dw, 0]).draw(B);
        blur.use().set('s', { tex: B.tex, unit: 0 }).set('dir', [0, 1 / dh]).draw(A);
        blur.use().set('s', { tex: A.tex, unit: 0 }).set('dir', [1 / (dw / 2), 0]).draw(B2);
        blur.use().set('s', { tex: B2.tex, unit: 0 }).set('dir', [0, 1 / (dh / 2)]).draw(A2);
        blur.use().set('s', { tex: A2.tex, unit: 0 }).set('dir', [2 / (dw / 2), 0]).draw(B2);
        blur.use().set('s', { tex: B2.tex, unit: 0 }).set('dir', [0, 2 / (dh / 2)]).draw(A2);
        comp.use().set('s', { tex: scene.tex, unit: 0 }).set('b1', { tex: A.tex, unit: 1 }).set('b2', { tex: A2.tex, unit: 2 })
          .set('bloom', p.bloom).set('ca', p.ca).set('scan', p.scan).set('vig', p.vig).set('grain', p.grain)
          .set('time', t).set('res', [W, H]).set('flick', p.flick).set('glitch', p.glitch).set('tint', p.tint).set('sat', p.sat).set('lift', p.lift).draw(null);
      },
    };
  }
  Reel.GL = GL; Reel.Post = Post;
})();

/**
 * FluidCursorSim —— 指针拖尾「真·流体模拟」引擎（纯 WebGL2，零依赖，不经 three）。
 *
 * 算法：经典 GPU Stable Fluids（半拉格朗日平流 + Jacobi 压力投影 + 涡度补强），
 * 参考 Pavel Dobryakov 的 WebGL-Fluid-Simulation（MIT）精简而来。
 * 指针划过把「力 + 染料」泼入场中，染料随速度场卷成涡旋并按耗散指数衰退。
 *
 * 性能/能耗防御（与 AmbientFluid 同一哲学，但策略不同——本层是事件驱动的瞬态特效）：
 *  - 速度场 128px / 染料场 480px 低分辨率模拟，display 阶段才放大到全屏；
 *  - 活动驱动：最后一次泼墨 4.5s 后（染料已衰减到不可见）整个 rAF 循环停摆，GPU 归零；
 *    指针再动才唤醒。切 Tab / 失焦同样冻结。
 *  - 要求 WebGL2 + EXT_color_buffer_float（16F 渲染目标）；不满足则 create() 返回 null，
 *    上层静默不挂载（渐进增强，绝不报错）。
 *
 * 混色约定（由上层 CSS mix-blend-mode 完成，本层只管输出）：
 *  - dark：输出 染料色 on 黑底，配 screen 混合 → 霓虹辉光；
 *  - light：输出 (1 - 染料色) on 白底，配 multiply 混合 → 彩墨入水。
 *  切换走 uInvert uniform，不重建管线。
 */

const SIM_RES = 128;
const DYE_RES = 480;
const PRESSURE_ITERATIONS = 20;
const PRESSURE_DAMPING = 0.8;
const CURL_STRENGTH = 26;
const DENSITY_DISSIPATION = 1.3;
const VELOCITY_DISSIPATION = 1.9;
const SPLAT_RADIUS = 0.0028;
const SPLAT_FORCE = 5200;
const IDLE_TIMEOUT_MS = 4500; // 末次泼墨后染料衰减殆尽所需时长，到点停 rAF
const MAX_DPR = 1.25;

// ── Shaders（GLSL ES 1.00，WebGL2 兼容） ─────────────────────────────

const VERT = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform vec2 texelSize;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAG_SPLAT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;
  void main () {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`;

const FRAG_ADVECTION = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;
  void main () {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = texture2D(uSource, coord) / decay;
  }
`;

const FRAG_DIVERGENCE = `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

const FRAG_CURL = `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
`;

const FRAG_VORTICITY = `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float curl;
  uniform float dt;
  void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = clamp(velocity, -1000.0, 1000.0);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const FRAG_PRESSURE = `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`;

const FRAG_GRADIENT_SUBTRACT = `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const FRAG_CLEAR = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float value;
  void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
  }
`;

const FRAG_DISPLAY = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uInvert; // 0=暗色(黑底霓虹, screen) 1=亮色(白底彩墨, multiply)
  void main () {
    vec3 c = texture2D(uTexture, vUv).rgb;
    // 软限幅：高能量处往白过渡而非生硬削顶
    float a = max(c.r, max(c.g, c.b));
    c = mix(c, vec3(1.0), smoothstep(0.9, 1.6, a) * 0.35);
    c = clamp(c, 0.0, 1.0);
    gl_FragColor = vec4(mix(c, 1.0 - c, uInvert), 1.0);
  }
`;

// ── WebGL 小工具 ─────────────────────────────────────────────

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
  texelSizeX: number;
  texelSizeY: number;
  attach: (id: number) => number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap: () => void;
  texelSizeX: number;
  texelSizeY: number;
}

class Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext, vs: WebGLShader, fsSource: string) {
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
    }
    this.program = program;
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i)!.name;
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
  }
  return shader;
}

/** 指针一次泼墨的暂存（rAF 循环里消费） */
interface SplatRequest {
  x: number; y: number; dx: number; dy: number; color: [number, number, number];
}

/** 品牌域随机泼墨色（靛/紫/品红/青），HSV→RGB，能量系数压低避免瞬间过曝。 */
function brandColor(): [number, number, number] {
  const hues = [0.62, 0.68, 0.74, 0.82, 0.5];
  const h = hues[(Math.random() * hues.length) | 0] + (Math.random() - 0.5) * 0.04;
  const s = 0.85, v = 1.0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [r * 0.22, g * 0.22, b * 0.22];
}

export class FluidCursorSim {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private programs: {
    splat: Program; advection: Program; divergence: Program; curl: Program;
    vorticity: Program; pressure: Program; gradient: Program; clear: Program; display: Program;
  };
  private quadVao: WebGLVertexArrayObject;
  private velocity!: DoubleFBO;
  private dye!: DoubleFBO;
  private divergenceFbo!: FBO;
  private curlFbo!: FBO;
  private pressureFbo!: DoubleFBO;

  private splats: SplatRequest[] = [];
  private invert = 0;
  private rafId = 0;
  private running = false;
  private disposed = false;
  private lastTickMs = 0;
  private lastActivityMs = 0;

  /** WebGL2 / 浮点渲染目标不可用时返回 null，上层静默放弃（渐进增强）。 */
  static create(canvas: HTMLCanvasElement): FluidCursorSim | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false, depth: false, stencil: false, antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    if (!gl.getExtension('EXT_color_buffer_float')) return null;
    try {
      return new FluidCursorSim(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;

    // 满屏四边形
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.quadVao = vao;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
    this.programs = {
      splat: new Program(gl, vs, FRAG_SPLAT),
      advection: new Program(gl, vs, FRAG_ADVECTION),
      divergence: new Program(gl, vs, FRAG_DIVERGENCE),
      curl: new Program(gl, vs, FRAG_CURL),
      vorticity: new Program(gl, vs, FRAG_VORTICITY),
      pressure: new Program(gl, vs, FRAG_PRESSURE),
      gradient: new Program(gl, vs, FRAG_GRADIENT_SUBTRACT),
      clear: new Program(gl, vs, FRAG_CLEAR),
      display: new Program(gl, vs, FRAG_DISPLAY),
    };

    this.resize();
    this.initFramebuffers();
  }

  // ── Framebuffer 管理 ──────────────────────────────────────

  private createFBO(w: number, h: number, internalFormat: number, format: number, filter: number): FBO {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.HALF_FLOAT, null);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach: (id: number) => {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  private createDoubleFBO(w: number, h: number, internalFormat: number, format: number, filter: number): DoubleFBO {
    let fbo1 = this.createFBO(w, h, internalFormat, format, filter);
    let fbo2 = this.createFBO(w, h, internalFormat, format, filter);
    return {
      get read() { return fbo1; },
      get write() { return fbo2; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
      texelSizeX: 1 / w,
      texelSizeY: 1 / h,
    } as DoubleFBO;
  }

  /** 按基准分辨率 + 画布纵横比换算模拟场尺寸（短边=基准）。 */
  private fieldSize(base: number): [number, number] {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    return aspect >= 1
      ? [Math.round(base * aspect), base]
      : [base, Math.round(base / aspect)];
  }

  private initFramebuffers() {
    const gl = this.gl;
    const [sw, sh] = this.fieldSize(SIM_RES);
    const [dw, dh] = this.fieldSize(DYE_RES);
    this.velocity = this.createDoubleFBO(sw, sh, gl.RG16F, gl.RG, gl.LINEAR);
    this.dye = this.createDoubleFBO(dw, dh, gl.RGBA16F, gl.RGBA, gl.LINEAR);
    this.divergenceFbo = this.createFBO(sw, sh, gl.R16F, gl.RED, gl.NEAREST);
    this.curlFbo = this.createFBO(sw, sh, gl.R16F, gl.RED, gl.NEAREST);
    this.pressureFbo = this.createDoubleFBO(sw, sh, gl.R16F, gl.RED, gl.NEAREST);
  }

  private blit(target: FBO | null) {
    const gl = this.gl;
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // ── 对外 API ─────────────────────────────────────────────

  /** 指针拖动泼墨：x/y ∈ [0,1]（y 向上），dx/dy 为帧间位移（同空间）。 */
  pointerSplat(x: number, y: number, dx: number, dy: number, color?: [number, number, number]) {
    this.splats.push({ x, y, dx: dx * SPLAT_FORCE, dy: dy * SPLAT_FORCE, color: color ?? brandColor() });
    this.wake();
  }

  /** 随机多点泼墨（进场彩蛋 / 点击烟花）。 */
  burst(count: number) {
    for (let i = 0; i < count; i++) {
      const color = brandColor();
      const boosted: [number, number, number] = [color[0] * 6, color[1] * 6, color[2] * 6];
      this.splats.push({
        x: Math.random(), y: Math.random(),
        dx: (Math.random() - 0.5) * 1600,
        dy: (Math.random() - 0.5) * 1600,
        color: boosted,
      });
    }
    this.wake();
  }

  /** 亮/暗主题切换输出模式（0=screen 霓虹，1=multiply 彩墨）。 */
  setInvert(invert: boolean) {
    this.invert = invert ? 1 : 0;
    this.wake(); // 重绘一阵，让残留染料立即按新模式呈现
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.velocity) this.initFramebuffers(); // 旧 FBO 交给 GC + 上下文销毁回收；resize 极少发生
  }

  /** 冻结（切 Tab / 失焦）。 */
  freeze() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** 唤醒 rAF 循环（有泼墨/恢复可见时）。 */
  wake() {
    this.lastActivityMs = performance.now();
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.disposed = true;
    this.freeze();
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  // ── 主循环 ───────────────────────────────────────────────

  private tick = (nowMs: number) => {
    if (!this.running || this.disposed) return;

    // 染料衰减殆尽且无新泼墨 → 熄火（最后画一帧全黑清场）
    if (nowMs - this.lastActivityMs > IDLE_TIMEOUT_MS && this.splats.length === 0) {
      this.running = false;
      this.render();
      return;
    }
    this.rafId = requestAnimationFrame(this.tick);

    const dt = Math.min((nowMs - this.lastTickMs) / 1000, 1 / 30);
    this.lastTickMs = nowMs;
    if (dt <= 0) return;

    this.applySplats();
    this.step(dt);
    this.render();
  };

  private applySplats() {
    const gl = this.gl;
    const { splat } = this.programs;
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    gl.bindVertexArray(this.quadVao);
    gl.useProgram(splat.program);
    gl.uniform1f(splat.uniforms.aspectRatio, aspect);

    for (const s of this.splats.splice(0)) {
      // 力 → 速度场
      gl.uniform1i(splat.uniforms.uTarget, this.velocity.read.attach(0));
      gl.uniform2f(splat.uniforms.point, s.x, s.y);
      gl.uniform3f(splat.uniforms.color, s.dx, s.dy, 0);
      gl.uniform1f(splat.uniforms.radius, SPLAT_RADIUS);
      this.blit(this.velocity.write);
      this.velocity.swap();

      // 染料 → 染料场
      gl.uniform1i(splat.uniforms.uTarget, this.dye.read.attach(0));
      gl.uniform3f(splat.uniforms.color, s.color[0], s.color[1], s.color[2]);
      this.blit(this.dye.write);
      this.dye.swap();
    }
  }

  private step(dt: number) {
    const gl = this.gl;
    const p = this.programs;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVao);
    const simTexelX = this.velocity.read.texelSizeX;
    const simTexelY = this.velocity.read.texelSizeY;

    // 涡度补强：先取 curl，再按 |∇ω| 推回速度场，让涡旋长久卷曲不糊掉
    gl.useProgram(p.curl.program);
    gl.uniform2f(p.curl.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.curl.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.curlFbo);

    gl.useProgram(p.vorticity.program);
    gl.uniform2f(p.vorticity.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.vorticity.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.vorticity.uniforms.uCurl, this.curlFbo.attach(1));
    gl.uniform1f(p.vorticity.uniforms.curl, CURL_STRENGTH);
    gl.uniform1f(p.vorticity.uniforms.dt, dt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 压力投影：散度 → Jacobi 迭代 → 减压力梯度，保证不可压缩（流体感的来源）
    gl.useProgram(p.divergence.program);
    gl.uniform2f(p.divergence.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.divergence.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.divergenceFbo);

    gl.useProgram(p.clear.program);
    gl.uniform1i(p.clear.uniforms.uTexture, this.pressureFbo.read.attach(0));
    gl.uniform1f(p.clear.uniforms.value, PRESSURE_DAMPING);
    this.blit(this.pressureFbo.write);
    this.pressureFbo.swap();

    gl.useProgram(p.pressure.program);
    gl.uniform2f(p.pressure.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.pressure.uniforms.uDivergence, this.divergenceFbo.attach(0));
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(p.pressure.uniforms.uPressure, this.pressureFbo.read.attach(1));
      this.blit(this.pressureFbo.write);
      this.pressureFbo.swap();
    }

    gl.useProgram(p.gradient.program);
    gl.uniform2f(p.gradient.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.gradient.uniforms.uPressure, this.pressureFbo.read.attach(0));
    gl.uniform1i(p.gradient.uniforms.uVelocity, this.velocity.read.attach(1));
    this.blit(this.velocity.write);
    this.velocity.swap();

    // 平流：速度场自携带，染料随场漂移，各按耗散衰减
    gl.useProgram(p.advection.program);
    gl.uniform2f(p.advection.uniforms.texelSize, simTexelX, simTexelY);
    gl.uniform1i(p.advection.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.advection.uniforms.uSource, this.velocity.read.attach(0));
    gl.uniform1f(p.advection.uniforms.dt, dt);
    gl.uniform1f(p.advection.uniforms.dissipation, VELOCITY_DISSIPATION);
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(p.advection.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(p.advection.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(p.advection.uniforms.dissipation, DENSITY_DISSIPATION);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  private render() {
    const gl = this.gl;
    const { display } = this.programs;
    gl.bindVertexArray(this.quadVao);
    gl.useProgram(display.program);
    gl.uniform1i(display.uniforms.uTexture, this.dye.read.attach(0));
    gl.uniform1f(display.uniforms.uInvert, this.invert);
    this.blit(null);
  }
}

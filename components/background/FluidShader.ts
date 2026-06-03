/**
 * FluidShader.ts —— 「呼吸态流体光晕」的 Raw GLSL（GLSL ES 1.00 / WebGL2 兼容）
 *
 * 设计要点：
 *  - 顶点着色器「相机无关」：配合 PlaneGeometry(2,2) 直接把 position.xy 当作裁剪空间坐标
 *    输出满屏四边形，无需任何相机/光照系统。
 *  - 片元着色器用 Ashima 2D Simplex 噪声叠 fbm + domain warping 生成极缓的流体涌动，
 *    在 uColor1/2/3 三主色调间 mix，输出「接近底色」的极淡微光，绝不抢前景 LaTeX。
 *  - uMouse(NDC) 以高斯衰减对采样坐标加极小振幅扰动，鼠标邻域几乎不可察地呼吸。
 *
 * 颜色直出：由 AmbientFluid 关闭 three 的 ColorManagement + Canvas `linear flat`，
 * 故此处写入 gl_FragColor 的即为「所见即所得」的 sRGB 值。
 */

export const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    // 相机无关满屏：position 已是 [-1,1] 的 PlaneGeometry(2,2)
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2  uMouse;        // 鼠标 NDC [-1, 1]
  uniform vec2  uResolution;   // 画布 draw buffer 尺寸（用于宽高比校正）
  uniform vec3  uColor1;
  uniform vec3  uColor2;
  uniform vec3  uColor3;
  uniform float uSpeed;        // 流体运动快慢

  // ── Ashima simplex noise 2D（MIT/CC0，业界标准实现）────────────────────
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // 4 octave fractal brownian motion
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * snoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // 以画布中心为原点 + 宽高比校正，避免横向拉伸
    vec2 p = vUv - 0.5;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    p.x *= aspect;

    float t = uTime * uSpeed;

    // 鼠标：同样换算到「中心 + 宽高比」空间，做紧致高斯衰减
    vec2 m = uMouse * 0.5;
    m.x *= aspect;
    float md = distance(p, m);
    float influence = exp(-md * md * 6.0);

    // ── domain warping：两层 fbm 偏移采样坐标，得到流体/旋度感 ─────────
    vec2 q = vec2(
      fbm(p * 1.2 + vec2(0.0, t * 0.10)),
      fbm(p * 1.2 + vec2(5.2, t * 0.12))
    );
    vec2 r = vec2(
      fbm(p * 1.2 + q + vec2(1.7, 9.2) + t * 0.08),
      fbm(p * 1.2 + q + vec2(8.3, 2.8) + t * 0.06)
    );

    // 鼠标对 warp 场加极小扰动（仅光标邻域、几乎不可察）
    r += influence * 0.06 * vec2(snoise(p * 3.0 + t), snoise(p * 3.0 - t));

    float f = fbm(p * 1.1 + r);
    f = f * 0.5 + 0.5; // 粗略归一化到 [0,1]

    // 三主色调两段 mix：靛 → 紫 → 青，整体对比度压到极低
    vec3 col = mix(uColor1, uColor2, smoothstep(0.2, 0.8, f));
    col = mix(col, uColor3, smoothstep(0.35, 0.95, length(q) * 0.5 + 0.25));

    // 光标处极其微弱的提亮，营造「呼吸」触感
    col += influence * 0.015;

    gl_FragColor = vec4(col, 1.0);
  }
`;

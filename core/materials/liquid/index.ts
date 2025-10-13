import {
  Color,
  ShaderMaterial,
  type ColorRepresentation,
  type ShaderMaterialParameters,
  Vector2,
} from "three";

type LiquidShaderMaterial = ShaderMaterial & {
  uniforms: ShaderMaterial["uniforms"] & {
    time: { value: number };
  };
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform float time;

  float wave(float value, float offset, float speed, float amplitude) {
    return sin(value + time * speed + offset) * amplitude;
  }

  void main() {
    vUv = uv;
    vec3 transformed = position;

    float surfaceRipple = wave(position.x * 3.5, 0.0, 1.3, 0.02);
    surfaceRipple += wave(position.z * 4.2, 1.2, 1.6, 0.018);
    surfaceRipple += wave(position.x * 2.1 + position.z * 1.4, 2.4, 0.9, 0.012);

    transformed.y += surfaceRipple;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2 vUv;
  uniform float time;
  uniform vec3 baseColor;
  uniform vec3 secondaryColor;
  uniform vec3 highlightColor;
  uniform vec2 flowDirection;
  uniform float opacity;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec2 wrapPeriod(vec2 cell, vec2 period) {
    return mod(mod(cell, period) + period, period);
  }

  float periodicNoise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    vec2 wrap = wrapPeriod(i, period);
    vec2 wrap1 = wrapPeriod(i + 1.0, period);

    float a = hash(wrap);
    float b = hash(vec2(wrap1.x, wrap.y));
    float c = hash(vec2(wrap.x, wrap1.y));
    float d = hash(wrap1);

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  float fbm(vec2 p, vec2 period) {
    float value = 0.0;
    float amplitude = 0.5;
    vec2 shift = vec2(37.0, 17.0);

    for (int i = 0; i < 6; i++) {
      value += amplitude * periodicNoise(p, period);
      p = p * 2.02 + shift;
      period *= 2.02;
      amplitude *= 0.5;
    }

    return value;
  }

  vec2 domainWarp(vec2 p, vec2 flow, float t, vec2 period) {
    vec2 warp = vec2(
      fbm(p + flow * t, period),
      fbm(p + rotate2d(1.256) * flow * t, period)
    );
    warp *= 0.7;
    vec2 doubledPeriod = period * 2.0;
    warp += vec2(
      fbm(p * 2.0 - flow.yx * t * 1.3, doubledPeriod),
      fbm(p * 2.3 + flow.xy * t * 1.1, doubledPeriod * 1.15)
    ) * 0.45;
    return p + warp;
  }

  void main() {
    vec2 uv = vUv;
    vec2 tiledUv = uv * 4.0;
    vec2 flow = normalize(flowDirection + 0.0001);
    float t = time * 0.8;
    vec2 basePeriod = vec2(4.0);

    vec2 warpedUv = domainWarp(tiledUv, flow, t, basePeriod);
    vec2 secondaryWarp = domainWarp(warpedUv * 1.6, flow.yx, t * 1.35, basePeriod * 1.6);

    float primaryLayer = fbm(warpedUv + flow * t * 1.4, basePeriod);
    float secondaryLayer = fbm(secondaryWarp - flow.yx * t * 0.9, basePeriod * 1.6);
    float swirl = fbm(rotate2d(t * 0.3) * (uv * 2.4 + flow.yx * 0.5), basePeriod * 2.4);

    float pattern = mix(primaryLayer, secondaryLayer, 0.55) + swirl * 0.35;
    float contrastPattern = smoothstep(0.25, 0.75, pattern);

    vec3 color = mix(baseColor, secondaryColor, contrastPattern);

    float highlightMask = smoothstep(
      0.65,
      0.92,
      pattern + fbm(warpedUv * 2.3 + t * 1.7, basePeriod * 2.3) * 0.35
    );
    float shimmer = fbm(secondaryWarp * 2.6 + t * 2.0, basePeriod * 2.6);

    color += highlightColor * shimmer * 0.25;
    color = mix(color, highlightColor, pow(highlightMask, 3.5) * 0.55);

    float animatedOpacity = clamp(opacity + shimmer * 0.08, 0.0, 1.0);

    gl_FragColor = vec4(color, animatedOpacity);
  }
`;

export type LiquidMaterialOptions = {
  baseColor?: ColorRepresentation;
  secondaryColor?: ColorRepresentation;
  highlightColor?: ColorRepresentation;
  flowDirection?: Vector2;
  opacity?: number;
  shaderParameters?: ShaderMaterialParameters;
};

/**
 * Создаёт шейдерный материал переливающейся жидкости с плавными переходами цвета.
 * @param {LiquidMaterialOptions} [options] Параметры настройки цветовой палитры и прозрачности.
 * @returns {ShaderMaterial} Экземпляр материала, готовый к применению к мешу.
 */
export const createLiquidMaterial = (
  options: LiquidMaterialOptions = {}
): LiquidShaderMaterial => {
  const {
    baseColor = new Color(0x1f4fc9),
    secondaryColor = new Color(0x29f1d1),
    highlightColor = new Color(0xffffff),
    flowDirection = new Vector2(1, 0),
    opacity = 0.82,
    shaderParameters,
  } = options;

  const material = new ShaderMaterial({
    transparent: true,
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new Color(baseColor) },
      secondaryColor: { value: new Color(secondaryColor) },
      highlightColor: { value: new Color(highlightColor) },
      flowDirection: { value: flowDirection.clone().normalize() },
      opacity: { value: opacity },
    },
    vertexShader,
    fragmentShader,
    ...shaderParameters,
  }) as LiquidShaderMaterial;

  material.extensions = { ...material.extensions, derivatives: true };
  material.userData.renderOrder = 10;
  material.depthWrite = true;
  material.depthTest = true;

  const getNow = () =>
    (typeof performance !== "undefined" ? performance.now() : Date.now()) *
    0.001;

  let lastTimestamp = getNow();
  let animationFrameId: number | null = null;

  const autoUpdate = () => {
    const currentTimestamp = getNow();
    material.uniforms.time.value += currentTimestamp - lastTimestamp;
    lastTimestamp = currentTimestamp;

    if (typeof requestAnimationFrame === "function") {
      animationFrameId = requestAnimationFrame(autoUpdate);
    }
  };

  if (typeof requestAnimationFrame === "function") {
    animationFrameId = requestAnimationFrame(autoUpdate);

    const originalDispose = material.dispose.bind(material);
    material.dispose = () => {
      if (typeof cancelAnimationFrame === "function" && animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = null;
      originalDispose();
    };
  }

  return material;
};

/**
 * Увеличивает uniform времени материала «liquid», позволяя управлять анимацией вручную.
 * @param {ShaderMaterial} material Материал, созданный функцией createLiquidMaterial.
 * @param {number} deltaSeconds Изменение времени в секундах, которое нужно добавить к uniform.
 */
export const updateLiquidMaterialTime = (
  material: ShaderMaterial,
  deltaSeconds: number
): void => {
  const liquidMaterial = material as LiquidShaderMaterial;

  if (!liquidMaterial.uniforms?.time) {
    return;
  }

  liquidMaterial.uniforms.time.value += deltaSeconds;
};

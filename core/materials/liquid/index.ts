import {
  Color,
  ShaderMaterial,
  type ColorRepresentation,
  type ShaderMaterialParameters,
  Vector2,
} from "three";

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

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

    for (int i = 0; i < 6; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.05;
      amplitude *= 0.5;
    }

    return value;
  }

  vec2 domainWarp(vec2 p, vec2 flow, float t) {
    vec2 warp = vec2(fbm(p + flow * t), fbm(p + rotate2d(1.256) * flow * t));
    warp *= 0.7;
    warp += vec2(fbm(p * 2.0 - flow.yx * t * 1.3), fbm(p * 2.3 + flow.xy * t * 1.1)) * 0.45;
    return p + warp;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    vec2 flow = normalize(flowDirection + 0.0001);
    float t = time * 0.8;

    vec2 warpedUv = domainWarp(centeredUv * 3.2, flow, t);
    vec2 secondaryWarp = domainWarp(warpedUv * 1.8, flow.yx, t * 1.35);

    float primaryLayer = fbm(warpedUv + flow * t * 1.4);
    float secondaryLayer = fbm(secondaryWarp - flow.yx * t * 0.9);
    float swirl = fbm(rotate2d(t * 0.3) * (centeredUv * 2.4));

    float pattern = mix(primaryLayer, secondaryLayer, 0.55) + swirl * 0.35;
    float contrastPattern = smoothstep(0.25, 0.75, pattern);

    vec3 color = mix(baseColor, secondaryColor, contrastPattern);

    float highlightMask = smoothstep(0.65, 0.92, pattern + fbm(warpedUv * 2.8 + t * 1.7) * 0.35);
    float shimmer = fbm(secondaryWarp * 3.2 + t * 2.0);

    color += highlightColor * shimmer * 0.25;
    color = mix(color, highlightColor, pow(highlightMask, 3.5) * 0.55);

    float edgeFade = smoothstep(0.9, 0.2, length(centeredUv));
    float animatedOpacity = clamp(opacity * edgeFade + shimmer * 0.15, 0.0, 1.0);

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
): ShaderMaterial => {
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
  });

  material.extensions = { ...material.extensions, derivatives: true };

  return material;
};

/**
 * Обновляет значение uniform-переменной времени, создавая анимацию течения жидкости.
 * @param {ShaderMaterial} material Материал, созданный функцией createLiquidMaterial.
 * @param {number} elapsedTime Текущее время в секундах, используемое для анимации.
 * @returns {void}
 */
export const updateLiquidMaterialTime = (
  material: ShaderMaterial,
  elapsedTime: number
): void => {
  const uniform = material.uniforms?.time;
  if (!uniform) {
    return;
  }

  uniform.value = elapsedTime;
};

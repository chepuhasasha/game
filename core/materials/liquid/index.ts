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

  void main() {
    vUv = uv;
    vec3 transformed = position;

    float waveX = sin(position.x * 4.0 + time * 1.8) * 0.035;
    float waveZ = cos(position.z * 5.0 - time * 1.5) * 0.03;
    transformed.y += waveX + waveZ;

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

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.0;
      amplitude *= 0.5;
    }

    return value;
  }

  void main() {
    vec2 centeredUv = vUv - 0.5;
    vec2 flow = normalize(flowDirection);

    float swirl = fbm(centeredUv * 3.5 + flow * time * 0.6);
    vec2 warped = centeredUv;
    warped += vec2(fbm(centeredUv * 5.0 + time * 0.4), fbm(centeredUv * 5.0 - time * 0.35)) * 0.35;
    warped += flow.yx * fbm(centeredUv * 4.0 - flow * time * 0.5) * 0.2;

    float liquidPattern = fbm(warped * 6.0 + flow * time * 1.2);
    float highlightMask = smoothstep(0.4, 0.9, fbm(warped * 8.0 - flow.yx * time * 0.8));

    float blend = smoothstep(0.2, 0.8, liquidPattern + swirl * 0.6);
    vec3 color = mix(baseColor, secondaryColor, blend);

    float caustics = pow(highlightMask, 3.0);
    color = mix(color, highlightColor, caustics * 0.6);

    float edgeGlow = smoothstep(0.4, 0.9, length(centeredUv));
    float shimmer = fbm(warped * 10.0 + time * 1.5) * 0.3;
    color += highlightColor * shimmer * 0.2 * (1.0 - edgeGlow);

    float animatedOpacity = clamp(opacity + shimmer * 0.2, 0.0, 1.0);
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

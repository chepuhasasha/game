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

    float waveX = sin(position.x * 6.0 + time * 2.5) * 0.02;
    float waveZ = cos(position.z * 6.0 - time * 2.0) * 0.02;
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

  void main() {
    vec2 centeredUv = vUv - 0.5;
    float swirl = sin(dot(centeredUv, flowDirection) * 12.0 + time * 3.0);
    float radial = sin(length(centeredUv) * 18.0 - time * 2.5);
    float mixFactor = smoothstep(-1.0, 1.0, swirl + radial * 0.6);

    vec3 color = mix(baseColor, secondaryColor, mixFactor);

    float ripple = smoothstep(0.2, 0.6, sin(length(centeredUv) * 22.0 + time * 4.0));
    color = mix(color, highlightColor, ripple * 0.45);

    gl_FragColor = vec4(color, opacity + ripple * 0.15);
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
    baseColor = new Color(0x246bce),
    secondaryColor = new Color(0x27f5c8),
    highlightColor = new Color(0xffffff),
    flowDirection = new Vector2(1, 0),
    opacity = 0.85,
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

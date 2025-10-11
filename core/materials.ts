import { Color, DoubleSide, MeshStandardMaterial, ShaderMaterial } from "three";

const glassShaderMaterial = new ShaderMaterial({
  uniforms: {
    envColor: { value: new Color(0xf0f8ff) },
    tintColor: { value: new Color(0xb0e0ff) },
    fresnelPower: { value: 3.5 },
    baseOpacity: { value: 0.2 },
    refractiveIndex: { value: 1.1 },
    blurStrength: { value: 0.15 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 envColor;
    uniform vec3 tintColor;
    uniform float fresnelPower;
    uniform float baseOpacity;
    uniform float refractiveIndex;
    uniform float blurStrength;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    float pseudoNoise(vec3 p) {
      vec3 seed = vec3(12.9898, 78.233, 37.719);
      return fract(sin(dot(p, seed)) * 43758.5453);
    }

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);

      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), fresnelPower);
      vec3 refractDir = refract(-viewDir, normal, 1.0 / refractiveIndex);
      float refractAmount = clamp(dot(refractDir, normal) * 0.5 + 0.5, 0.0, 1.0);

      vec3 baseRefraction = mix(tintColor, envColor, refractAmount);

      float blur = 0.0;
      blur += pseudoNoise(refractDir * 1.3 + vWorldPosition * 0.1);
      blur += pseudoNoise(refractDir * 2.7 + vWorldPosition * 0.15 + 13.0);
      blur += pseudoNoise(refractDir * 4.1 + vWorldPosition * 0.07 + 29.0);
      blur /= 3.0;

      vec3 blurredRefraction = mix(baseRefraction, envColor, blur * blurStrength);
      vec3 refractionColor = mix(baseRefraction, blurredRefraction, 0.7);

      float highlight = pow(max(dot(normal, viewDir), 0.0), 24.0);
      vec3 color = refractionColor + vec3(highlight);

      float alpha = clamp(mix(baseOpacity, 1.0, fresnel), 0.0, 1.0);
      gl_FragColor = vec4(color, alpha);
    }
  `,
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
});

export default {
  standart: new MeshStandardMaterial({ color: 0xff0000 }),
  glass: glassShaderMaterial,
};

uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float pixelSize;
uniform float colorLevels;
uniform float ditherStrength;
uniform float gamma;

varying vec2 vUv;

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec3 applyDithering(vec2 sampleUv, vec3 color, float levels, float strength) {
    vec2 noiseBase = sampleUv * resolution;
    vec3 noise = vec3(
        random(noiseBase + vec2(12.34, 45.67)),
        random(noiseBase + vec2(89.01, 23.45)),
        random(noiseBase + vec2(67.89, 10.11))
    ) - 0.5;
    float scale = strength / levels;
    return clamp(color + noise * scale, 0.0, 1.0);
}

void main() {
    float safePixelSize = max(1.0, pixelSize);
    float levels = max(1.0, colorLevels);
    float safeGamma = max(0.01, gamma);

    vec2 pixelated = floor((vUv * resolution) / safePixelSize) * safePixelSize + safePixelSize * 0.5;
    vec2 sampleUv = pixelated / resolution;
    vec2 clampedUv = clamp(sampleUv, 0.001, 0.999);

    vec3 color = texture2D(tDiffuse, clampedUv).rgb;

    vec3 linearColor = pow(color, vec3(1.0 / safeGamma));
    vec3 dithered = applyDithering(sampleUv, linearColor, levels, ditherStrength);
    vec3 quantized = floor(dithered * levels + 0.0001) / levels;
    vec3 finalColor = pow(quantized, vec3(safeGamma));

    gl_FragColor = vec4(finalColor, 1.0);
}

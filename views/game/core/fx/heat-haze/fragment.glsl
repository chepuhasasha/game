uniform sampler2D tDiffuse;
uniform float time;
uniform float intensity;
uniform float distortion;
uniform float shimmer;
uniform float blurStrength;
uniform float speed;
uniform float noiseScale;
uniform float hotThreshold;
uniform float hotSoftness;

varying vec2 vUv;

vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
    return mod289(((x * 34.0) + 1.0) * x);
}

float snoise(vec2 v) {
    const vec4 C = vec4(
        0.211324865405187,
        0.366025403784439,
        -0.577350269189626,
        0.024390243902439
    );

    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(
        0.5 - vec3(
            dot(x0, x0),
            dot(x12.xy, x12.xy),
            dot(x12.zw, x12.zw)
        ),
        0.0
    );
    m *= m;
    m *= m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g);
}

void main() {
    float animatedTime = time * speed;
    vec2 flowUv = vUv * noiseScale + vec2(animatedTime * 0.35, animatedTime * 0.21);
    float baseNoise = snoise(flowUv);
    float heatMask = smoothstep(
        hotThreshold - hotSoftness,
        hotThreshold + hotSoftness,
        baseNoise
    );

    float detailNoise = snoise(flowUv * 2.5 + vec2(animatedTime * 1.7, animatedTime * 2.3));
    float detailMask = detailNoise * 0.5 + 0.5;

    float dx = snoise(flowUv + vec2(0.02, 0.0)) - baseNoise;
    float dy = snoise(flowUv + vec2(0.0, 0.02)) - baseNoise;
    vec2 refraction = vec2(dx, dy);

    float shimmerOffset = (detailMask - 0.5) * shimmer * 0.01;
    vec2 shimmerUv = vUv + vec2(shimmerOffset);

    vec2 distortedUv = vUv + refraction * distortion * intensity;
    distortedUv += (detailMask - 0.5) * distortion * 0.25 * intensity;
    distortedUv = mix(vUv, distortedUv, heatMask);

    vec3 refractedColor = texture2D(tDiffuse, distortedUv + shimmerUv * 0.1).rgb;

    vec2 blurDir1 = vec2(0.0015, 0.0015);
    vec2 blurDir2 = vec2(-0.0015, 0.0015);
    vec3 blurredColor = refractedColor * 0.4;
    blurredColor += texture2D(tDiffuse, distortedUv + blurDir1).rgb * 0.2;
    blurredColor += texture2D(tDiffuse, distortedUv - blurDir1).rgb * 0.2;
    blurredColor += texture2D(tDiffuse, distortedUv + blurDir2).rgb * 0.1;
    blurredColor += texture2D(tDiffuse, distortedUv - blurDir2).rgb * 0.1;

    float blurAmount = clamp(blurStrength * intensity, 0.0, 1.0) * heatMask;
    vec3 hazyColor = mix(refractedColor, blurredColor, blurAmount);

    float shimmerAmount = (detailMask - 0.5) * 0.15 * shimmer * intensity;
    hazyColor += shimmerAmount;

    vec3 originalColor = texture2D(tDiffuse, vUv).rgb;
    vec3 finalColor = mix(originalColor, hazyColor, heatMask * intensity);

    gl_FragColor = vec4(finalColor, 1.0);
}

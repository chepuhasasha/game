precision highp float;

uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform vec3 outlineColor;
uniform float thickness;
uniform float intensity;
uniform float threshold;
uniform float depthMultiplier;
uniform sampler2D tDepth;

varying vec2 vUv;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 texel = thickness / resolution;

    float tl = luminance(texture2D(tDiffuse, vUv + texel * vec2(-1.0, -1.0)).rgb);
    float tc = luminance(texture2D(tDiffuse, vUv + texel * vec2(0.0, -1.0)).rgb);
    float tr = luminance(texture2D(tDiffuse, vUv + texel * vec2(1.0, -1.0)).rgb);
    float ml = luminance(texture2D(tDiffuse, vUv + texel * vec2(-1.0, 0.0)).rgb);
    float mr = luminance(texture2D(tDiffuse, vUv + texel * vec2(1.0, 0.0)).rgb);
    float bl = luminance(texture2D(tDiffuse, vUv + texel * vec2(-1.0, 1.0)).rgb);
    float bc = luminance(texture2D(tDiffuse, vUv + texel * vec2(0.0, 1.0)).rgb);
    float br = luminance(texture2D(tDiffuse, vUv + texel * vec2(1.0, 1.0)).rgb);

    float gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;
    float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

    float dtl = texture2D(tDepth, vUv + texel * vec2(-1.0, -1.0)).r;
    float dtc = texture2D(tDepth, vUv + texel * vec2(0.0, -1.0)).r;
    float dtr = texture2D(tDepth, vUv + texel * vec2(1.0, -1.0)).r;
    float dml = texture2D(tDepth, vUv + texel * vec2(-1.0, 0.0)).r;
    float dmr = texture2D(tDepth, vUv + texel * vec2(1.0, 0.0)).r;
    float dbl = texture2D(tDepth, vUv + texel * vec2(-1.0, 1.0)).r;
    float dbc = texture2D(tDepth, vUv + texel * vec2(0.0, 1.0)).r;
    float dbr = texture2D(tDepth, vUv + texel * vec2(1.0, 1.0)).r;

    float depthGx = -dtl + dtr - 2.0 * dml + 2.0 * dmr - dbl + dbr;
    float depthGy = -dtl - 2.0 * dtc - dtr + dbl + 2.0 * dbc + dbr;

    float colorEdge = length(vec2(gx, gy));
    float depthEdge = length(vec2(depthGx, depthGy)) * depthMultiplier;

    float edgeStrength = max(colorEdge, depthEdge) * intensity;
    float outline = smoothstep(threshold, threshold + 1.0, edgeStrength);
    outline = clamp(outline, 0.0, 1.0);

    vec3 baseColor = texture2D(tDiffuse, vUv).rgb;
    vec3 color = mix(baseColor, outlineColor, outline);

    gl_FragColor = vec4(color, 1.0);
}

"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, Orbit } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import NisarSatellite from "@/components/nisar-satellite";

export function EarthGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;

    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uEarth;
      uniform vec2 uResolution;
      uniform float uRotation;

      float hash31(vec3 point) {
        point = fract(point * vec3(0.1031, 0.1030, 0.0973));
        point += dot(point, point.yxz + 33.33);
        return fract((point.x + point.y) * point.z);
      }

      float noise3(vec3 point) {
        vec3 cell = floor(point);
        vec3 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
        float lower = mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y);
        float upper = mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y);
        return mix(lower, upper, local.z);
      }

      float cloudNoise(vec3 point) {
        float clouds = 0.0;
        float weight = 0.5;
        for (int octave = 0; octave < 4; octave++) {
          clouds += noise3(point) * weight;
          point = point * 2.03 + vec3(7.1, 3.7, 5.3);
          weight *= 0.5;
        }
        return clouds;
      }

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        point.x *= uResolution.x / uResolution.y;
        float radiusSquared = dot(point, point);
        if (radiusSquared >= 1.0) discard;

        float z = sqrt(1.0 - radiusSquared);
        vec3 normal = normalize(vec3(point.x, point.y, z));
        float c = cos(uRotation);
        float s = sin(uRotation);
        vec3 globeNormal = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c);
        float latitudeTilt = 0.45;
        vec3 tiltAxis = vec3(c, 0.0, -s);
        globeNormal = globeNormal * cos(latitudeTilt)
          + cross(tiltAxis, globeNormal) * sin(latitudeTilt)
          + tiltAxis * dot(tiltAxis, globeNormal) * (1.0 - cos(latitudeTilt));
        float longitude = atan(globeNormal.x, globeNormal.z);
        float latitude = asin(clamp(globeNormal.y, -1.0, 1.0));
        vec2 mapUv = vec2(longitude / 6.28318530718 + 0.5, 0.5 - latitude / 3.14159265359);
        vec3 surface = texture2D(uEarth, mapUv).rgb;

        vec3 lightDirection = normalize(vec3(-0.38, 0.33, 0.86));
        float signedDaylight = dot(globeNormal, lightDirection);
        float daylight = max(signedDaylight, 0.0);
        float illumination = 0.17 + 0.98 * smoothstep(-0.28, 0.72, daylight);
        float atmosphere = pow(1.0 - z, 2.1);
        vec3 color = surface * illumination;
        float cloudBase = cloudNoise(globeNormal * 8.5 + vec3(4.2, 1.7, 8.1));
        float cloudDetail = cloudNoise(globeNormal * 18.0 + vec3(2.8, 6.1, 3.4));
        float cloudField = cloudBase * 0.77 + cloudDetail * 0.23;
        float cloudCover = smoothstep(0.53, 0.68, cloudField) * smoothstep(-0.12, 0.28, signedDaylight);
        color = mix(color, vec3(0.83, 0.89, 0.94), cloudCover * 0.38);
        float ocean = 1.0 - smoothstep(0.08, 0.24, max(surface.r, max(surface.g, surface.b)));
        float oceanGlint = pow(max(dot(reflect(-lightDirection, globeNormal), vec3(0.0, 0.0, 1.0)), 0.0), 36.0) * ocean * daylight * 0.14;
        color += vec3(0.55, 0.74, 0.82) * oceanGlint;
        color += vec3(0.12, 0.35, 0.52) * atmosphere * 0.42;
        color += vec3(0.15, 0.43, 0.58) * pow(1.0 - z, 7.0) * 0.75;
        float alpha = 1.0 - smoothstep(0.988, 1.0, radiusSquared);
        gl_FragColor = vec4(color, alpha);
      }
    `;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const vertices = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, "uEarth"), 0);
    const rotationUniform = gl.getUniformLocation(program, "uRotation");
    const resolutionUniform = gl.getUniformLocation(program, "uResolution");
    gl.clearColor(0, 0, 0, 0);

    let textureReady = false;
    let disposed = false;
    const earthImage = new window.Image();
    earthImage.onload = () => {
      if (!canvas.isConnected || disposed) return;
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = earthImage.naturalWidth;
      textureCanvas.height = earthImage.naturalHeight;
      const textureContext = textureCanvas.getContext("2d");
      if (!textureContext) return;
      textureContext.drawImage(earthImage, 0, 0);

      const uploadTexture = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, textureCanvas);
        textureReady = true;
        canvas.classList.add("earth-canvas-ready");
      };

      uploadTexture();
      fetch("/earth-country-borders.geojson")
        .then((response) => response.json())
        .then((geoJson: { features: Array<{ geometry?: { type: string; coordinates: unknown } }> }) => {
          if (disposed) return;
          textureContext.strokeStyle = "rgba(215, 230, 226, 0.38)";
          textureContext.lineWidth = Math.max(3, textureCanvas.width / 1350);
          const drawLine = (coordinates: number[][]) => {
            textureContext.beginPath();
            let previousX: number | undefined;
            for (const [longitude, latitude] of coordinates) {
              const x = ((longitude + 180) / 360) * textureCanvas.width;
              const y = ((90 - latitude) / 180) * textureCanvas.height;
              if (previousX !== undefined && Math.abs(x - previousX) > textureCanvas.width / 2) {
                textureContext.stroke();
                textureContext.beginPath();
              }
              if (previousX === undefined || Math.abs(x - previousX) > textureCanvas.width / 2) {
                textureContext.moveTo(x, y);
              } else {
                textureContext.lineTo(x, y);
              }
              previousX = x;
            }
            textureContext.stroke();
          };

          for (const feature of geoJson.features) {
            const geometry = feature.geometry;
            if (!geometry) continue;
            if (geometry.type === "LineString") {
              drawLine(geometry.coordinates as number[][]);
            } else if (geometry.type === "MultiLineString") {
              for (const line of geometry.coordinates as number[][][]) drawLine(line);
            }
          }
          uploadTexture();
        })
        .catch(() => undefined);
    };
    earthImage.src = "/earth-blue-marble.jpg";

    let frameId = 0;
    let lastTime = 0;
    let rotation = 0;
    const render = (time: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.uniform2f(resolutionUniform, width, height);
      if (lastTime) rotation += Math.min(time - lastTime, 50) * 0.00001;
      lastTime = time;
      gl.uniform1f(rotationUniform, rotation);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (textureReady) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frameId = window.requestAnimationFrame(render);
    };
    frameId = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      earthImage.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(vertices);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, []);

  return (
    <div className="earth-render" role="img" aria-label="La Tierra vista desde el espacio, con nubes, relieve satelital y rotación continua">
      <Image className="earth-fallback" src="/earth-blue-marble.jpg" alt="" width={720} height={720} unoptimized priority />
      <canvas ref={canvasRef} className="earth-canvas" aria-hidden="true" />
    </div>
  );
}

export default function EarthHero() {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["48vh", "0vh"]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.48, 0.78]);
  const rotate = useTransform(scrollYProgress, [0, 1], [-4, 0]);
  const animatedStyle = { y, scale, rotate };

  return (
    <section ref={section} className="earth-scroll" aria-label="Introducción al proyecto">
      <div className="earth-stage">
        <div className="starfield" aria-hidden="true" />
        <header className="hero-nav">
          <a className="brand brand-light" href="#inicio" aria-label="Tobaru, inicio">
            <span className="brand-mark"><Orbit size={17} strokeWidth={1.5} /></span>
            <span>TOBARU <i>WORKTEAM</i></span>
          </a>
          <a className="hero-nav-link" href="#explorador">ABRIR EXPLORADOR <span>↗</span></a>
        </header>
        <div className="hero-copy" id="inicio">
          <p className="eyebrow">OBSERVACIÓN TERRITORIAL · NISAR</p>
          <h1>La Tierra<br /><span>en movimiento.</span></h1>
          <p className="hero-description">Una nueva perspectiva para comprender los cambios de nuestro planeta.</p>
        </div>
        <motion.div className="earth-orbit" style={animatedStyle}>
          <div className="orbit-line orbit-line-one" />
          <div className="orbit-line orbit-line-two" />
          <NisarSatellite />
          <EarthGlobe />
        </motion.div>
        <a href="#explorador" className="scroll-cue">
          <span>DESLIZA PARA EXPLORAR</span><ArrowDown size={15} />
        </a>
        <div className="hero-coordinate" aria-hidden="true">7° 53′ 00″ N<br />72° 30′ 00″ W</div>
        <div className="hero-index" aria-hidden="true">01 / 03</div>
      </div>
    </section>
  );
}

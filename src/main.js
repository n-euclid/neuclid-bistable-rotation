import * as THREE from 'three';
import { createSphereMode, createHelixMode } from './extra-modes.js';

const REVOLUTION_SECONDS = 12;
const RADIUS = 3.25;
const BODY_HALF_HEIGHT = 0.43;
const HEAD_HALF_HEIGHT = 1.18;
const GAP_ANGLE = 0.5;
const HEAD_ANGLE = 0.94;

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createArrowParticles(renderer, direction, reverseColours) {
  const random = mulberry32(direction > 0 ? 93017 : 93029);
  const bodyCount = 18500;
  const headCount = 6500;
  const count = bodyCount + headCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const lowGapEdge = GAP_ANGLE * 0.5;
  const highGapEdge = Math.PI * 2 - GAP_ANGLE * 0.5;

  const setPoint = (index, angle, height, radiusOffset = 0) => {
    const radius = RADIUS + radiusOffset;
    positions[index * 3] = radius * Math.cos(angle);
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = radius * Math.sin(angle);
    seeds[index] = random();
  };

  if (direction > 0) {
    const tipAngle = highGapEdge;
    const headBaseAngle = tipAngle - HEAD_ANGLE;
    for (let index = 0; index < bodyCount; index += 1) {
      const angle = THREE.MathUtils.lerp(lowGapEdge, headBaseAngle, random());
      const height = THREE.MathUtils.lerp(-BODY_HALF_HEIGHT, BODY_HALF_HEIGHT, random());
      setPoint(index, angle, height, (random() - 0.5) * 0.035);
    }
    for (let index = 0; index < headCount; index += 1) {
      const progress = 1 - Math.sqrt(random());
      const angle = THREE.MathUtils.lerp(headBaseAngle, tipAngle, progress);
      const halfHeight = THREE.MathUtils.lerp(HEAD_HALF_HEIGHT, 0.018, progress);
      const height = THREE.MathUtils.lerp(-halfHeight, halfHeight, random());
      setPoint(bodyCount + index, angle, height, (random() - 0.5) * 0.035);
    }
  } else {
    const tipAngle = lowGapEdge;
    const headBaseAngle = tipAngle + HEAD_ANGLE;
    for (let index = 0; index < bodyCount; index += 1) {
      const angle = THREE.MathUtils.lerp(headBaseAngle, highGapEdge, random());
      const height = THREE.MathUtils.lerp(-BODY_HALF_HEIGHT, BODY_HALF_HEIGHT, random());
      setPoint(index, angle, height, (random() - 0.5) * 0.035);
    }
    for (let index = 0; index < headCount; index += 1) {
      const progress = 1 - Math.sqrt(random());
      const angle = THREE.MathUtils.lerp(headBaseAngle, tipAngle, progress);
      const halfHeight = THREE.MathUtils.lerp(HEAD_HALF_HEIGHT, 0.018, progress);
      const height = THREE.MathUtils.lerp(-halfHeight, halfHeight, random());
      setPoint(bodyCount + index, angle, height, (random() - 0.5) * 0.035);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTime: { value: 0 },
      uRadius: { value: RADIUS },
      uReverseColours: { value: reverseColours ? 1 : 0 },
      uGuidesVisible: { value: 0 },
    },
    vertexShader: `
      attribute float aSeed;
      varying float vSeed;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying float vPillarViewDepth;
      uniform float uPixelRatio;
      uniform float uGuidesVisible;

      void main() {
        vSeed = aSeed;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 viewPosition = viewMatrix * worldPosition;
        vec4 pillarViewPosition = viewMatrix * vec4(0.0, worldPosition.y, 0.0, 1.0);
        vViewPosition = viewPosition.xyz;
        vPillarViewDepth = pillarViewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
        float perspective = clamp(12.0 / -viewPosition.z, 0.72, 1.75);
        gl_PointSize = (1.05 + aSeed * 1.4) * uPixelRatio * perspective;
      }
    `,
    fragmentShader: `
      varying float vSeed;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying float vPillarViewDepth;
      uniform float uTime;
      uniform float uRadius;
      uniform float uReverseColours;
      uniform float uGuidesVisible;

      void main() {
        vec2 centred = gl_PointCoord - vec2(0.5);
        float distanceFromCentre = length(centred);
        if (distanceFromCentre > 0.5) discard;
        if (uGuidesVisible > 0.5 && abs(vViewPosition.x) < 0.105 && vViewPosition.z < vPillarViewDepth) discard;

        vec3 gold = vec3(1.0, 0.66, 0.22);
        vec3 orange = vec3(1.0, 0.24, 0.035);
        vec3 blue = vec3(0.025, 0.14, 1.0);
        float frontness = smoothstep(-uRadius * 0.72, uRadius * 0.72, vWorldPosition.z);
        frontness = mix(frontness, 1.0 - frontness, uReverseColours);
        vec3 colour = frontness < 0.5
          ? mix(gold, orange, frontness * 2.0)
          : mix(orange, blue, (frontness - 0.5) * 2.0);

        float grain = 0.79 + 0.31 * fract(vSeed * 37.731);
        float shimmer = 0.93 + 0.07 * sin(uTime * 1.7 + vSeed * 71.0);
        float alpha = smoothstep(0.5, 0.28, distanceFromCentre);
        gl_FragColor = vec4(colour * grain * shimmer, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function createRibbonOccluder(direction) {
  const positions = [];
  const indices = [];
  const radius = RADIUS;
  const bodyMaskHalfHeight = BODY_HALF_HEIGHT * 0.9;
  const headMaskHalfHeight = HEAD_HALF_HEIGHT * 0.9;
  const lowGapEdge = GAP_ANGLE * 0.5;
  const highGapEdge = Math.PI * 2 - GAP_ANGLE * 0.5;

  function addStrip(angleA, halfHeightA, angleB, halfHeightB) {
    const base = positions.length / 3;
    positions.push(
      radius * Math.cos(angleA), -halfHeightA, radius * Math.sin(angleA),
      radius * Math.cos(angleA), halfHeightA, radius * Math.sin(angleA),
      radius * Math.cos(angleB), -halfHeightB, radius * Math.sin(angleB),
      radius * Math.cos(angleB), halfHeightB, radius * Math.sin(angleB),
    );
    indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }

  const bodySegments = 180;
  const headSegments = 40;
  let bodyStart;
  let bodyEnd;
  let headBase;
  let headTip;

  if (direction > 0) {
    headTip = highGapEdge;
    headBase = headTip - HEAD_ANGLE;
    bodyStart = lowGapEdge;
    bodyEnd = headBase;
  } else {
    headTip = lowGapEdge;
    headBase = headTip + HEAD_ANGLE;
    bodyStart = highGapEdge;
    bodyEnd = headBase;
  }

  for (let index = 0; index < bodySegments; index += 1) {
    const angleA = THREE.MathUtils.lerp(bodyStart, bodyEnd, index / bodySegments);
    const angleB = THREE.MathUtils.lerp(bodyStart, bodyEnd, (index + 1) / bodySegments);
    addStrip(angleA, bodyMaskHalfHeight, angleB, bodyMaskHalfHeight);
  }

  for (let index = 0; index < headSegments; index += 1) {
    const progressA = index / headSegments;
    const progressB = (index + 1) / headSegments;
    const angleA = THREE.MathUtils.lerp(headBase, headTip, progressA);
    const angleB = THREE.MathUtils.lerp(headBase, headTip, progressB);
    const halfHeightA = THREE.MathUtils.lerp(headMaskHalfHeight, 0.012, progressA);
    const halfHeightB = THREE.MathUtils.lerp(headMaskHalfHeight, 0.012, progressB);
    addStrip(angleA, halfHeightA, angleB, halfHeightB);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const occluder = new THREE.Mesh(geometry, material);
  occluder.renderOrder = 1;
  occluder.visible = false;
  return occluder;
}

function createViewer(host, direction, initialPhase, reverseColours = false) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);

  const arrow = createArrowParticles(renderer, direction, reverseColours);
  arrow.renderOrder = 2;
  const ribbonOccluder = createRibbonOccluder(direction);
  const arrowGroup = new THREE.Group();
  arrowGroup.add(ribbonOccluder);
  arrowGroup.add(arrow);
  scene.add(arrowGroup);

  const guideGroup = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.065, 5.5, 28),
    new THREE.MeshBasicMaterial({ color: 0xff3f36 }),
  );
  pillar.position.y = -0.62;
  pillar.renderOrder = 0;
  guideGroup.add(pillar);
  guideGroup.visible = false;
  scene.add(guideGroup);

  const orbitDot = host.querySelector('.orbit-dot');
  const tipAngle = direction > 0
    ? Math.PI * 2 - GAP_ANGLE * 0.5
    : GAP_ANGLE * 0.5;

  let cameraYaw = 0;
  let cameraPitch = 0.31;
  let cameraDistance = 11.4;
  let phase = initialPhase;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function updateCamera() {
    const horizontalDistance = cameraDistance * Math.cos(cameraPitch);
    camera.position.set(
      horizontalDistance * Math.sin(cameraYaw),
      cameraDistance * Math.sin(cameraPitch),
      horizontalDistance * Math.cos(cameraYaw),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function defaultCameraDistance() {
    if (camera.aspect > 1.25) return 18.5;
    return Math.max(14.5, 15.5 / Math.max(camera.aspect, 0.58));
  }

  function frontView(resetPhase = false) {
    cameraYaw = 0;
    cameraPitch = 0.31;
    cameraDistance = defaultCameraDistance();
    if (resetPhase) phase = initialPhase;
    updateCamera();
  }

  host.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    host.setPointerCapture(event.pointerId);
  });

  host.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    cameraYaw -= (event.clientX - lastX) * 0.015;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch - (event.clientY - lastY) * 0.011, -1.49, 1.49);
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  });

  host.addEventListener('pointerup', () => { dragging = false; });
  host.addEventListener('pointercancel', () => { dragging = false; });
  host.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.001), 9, 34);
    updateCamera();
  }, { passive: false });

  resize();
  frontView(true);

  return {
    resize,
    setColourInverted(value) {
      arrow.material.uniforms.uReverseColours.value = Number(Boolean(reverseColours) !== Boolean(value));
    },
    setGuides(visible) {
      guideGroup.visible = visible;
      ribbonOccluder.visible = visible;
      arrow.material.depthTest = !visible;
      arrow.material.uniforms.uGuidesVisible.value = visible ? 1 : 0;
    },
    resetView() {
      frontView(false);
    },
    animate(delta, elapsed) {
      phase -= direction * delta * (Math.PI * 2 / REVOLUTION_SECONDS);
      arrowGroup.rotation.y = phase;
      arrow.material.uniforms.uTime.value = elapsed;
      const worldTipAngle = tipAngle - phase;
      orbitDot.setAttribute('cx', String(150 + Math.cos(worldTipAngle) * 115));
      orbitDot.setAttribute('cy', String(35 + Math.sin(worldTipAngle) * 22));
      renderer.render(scene, camera);
    },
  };
}

const viewers = [
  createViewer(document.querySelector('#clockwise'), 1, 2.43, false),
  createViewer(document.querySelector('#anticlockwise'), -1, 0.71, true),
];
const sphereViewer = createSphereMode(document.querySelector('#sphere-viewer'));
const helixViewers = [
  createHelixMode(document.querySelector('#helix-left'), { direction: 1 }),
  createHelixMode(document.querySelector('#helix-right'), { direction: -1 }),
];
const sceneElement = document.querySelector('#scene');
const colourButton = document.querySelector('#colour-toggle');
const modeButtons = {
  single: document.querySelector('#mode-single'),
  dual: document.querySelector('#mode-dual'),
  sphere: document.querySelector('#mode-sphere'),
  helix: document.querySelector('#mode-helix'),
};
const modeColourInverted = {
  single: false,
  dual: false,
  sphere: false,
  helix: false,
};
let activeMode = 'dual';
let guidesVisible = false;

function applyColourScheme(mode) {
  const inverted = modeColourInverted[mode];
  if (mode === 'single') viewers[0].setColourInverted(inverted);
  else if (mode === 'dual') viewers.forEach((viewer) => viewer.setColourInverted(inverted));
  else if (mode === 'sphere') sphereViewer.setColourInverted(inverted);
  else if (mode === 'helix') helixViewers.forEach((viewer) => viewer.setColourInverted(inverted));
  colourButton.setAttribute('aria-pressed', String(inverted));
  colourButton.setAttribute('aria-label', inverted ? 'Restore this mode colour direction' : 'Reverse this mode colour direction');
}

function setMode(mode) {
  activeMode = mode;
  sceneElement.classList.remove('mode-single', 'mode-dual', 'mode-sphere', 'mode-helix');
  sceneElement.classList.add(`mode-${mode}`);
  Object.entries(modeButtons).forEach(([name, button]) => button.setAttribute('aria-pressed', String(name === mode)));
  sphereViewer.setActive(mode === 'sphere');
  helixViewers.forEach((viewer) => {
    viewer.setActive(mode === 'helix');
    viewer.setGuides(guidesVisible);
  });
  applyColourScheme(mode);
  requestAnimationFrame(() => {
    if (mode === 'single') {
      viewers[0].resize();
      viewers[0].resetView();
    } else if (mode === 'dual') {
      viewers.forEach((viewer) => {
        viewer.resize();
        viewer.resetView();
      });
    }
    sphereViewer.resize();
    helixViewers.forEach((viewer) => viewer.resize());
  });
}

Object.entries(modeButtons).forEach(([mode, button]) => button.addEventListener('click', () => setMode(mode)));
colourButton.addEventListener('click', () => {
  modeColourInverted[activeMode] = !modeColourInverted[activeMode];
  applyColourScheme(activeMode);
});
setMode('dual');

document.querySelector('#reset-view').addEventListener('click', () => {
  viewers.forEach((viewer) => viewer.resetView());
  sphereViewer.reset();
  helixViewers.forEach((viewer) => viewer.reset());
});

document.querySelector('#guide-toggle').addEventListener('click', (event) => {
  guidesVisible = !guidesVisible;
  document.querySelector('#scene').classList.toggle('guides-on', guidesVisible);
  event.currentTarget.setAttribute('aria-pressed', String(guidesVisible));
  event.currentTarget.setAttribute('aria-label', guidesVisible ? 'Hide central pillars and orbit guides' : 'Show central pillars and orbit guides');
  viewers.forEach((viewer) => viewer.setGuides(guidesVisible));
  helixViewers.forEach((viewer) => viewer.setGuides(guidesVisible));
});

const fullscreenButton = document.querySelector('#fullscreen-toggle');
fullscreenButton.addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  fullscreenButton.setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Enter full screen');
});

const recordStartButton = document.querySelector('#record-start');
const recordPauseButton = document.querySelector('#record-pause');
const recordStopButton = document.querySelector('#record-stop');
const recordStatus = document.querySelector('#record-status');
const recordMessage = document.querySelector('#record-message');
let mediaRecorder = null;
let recordingStreams = [];
let recordingChunks = [];
let recordingStartedAt = 0;
let pauseStartedAt = 0;
let pausedDuration = 0;
let statusInterval = 0;
let messageTimeout = 0;

function showRecordingMessage(message) {
  window.clearTimeout(messageTimeout);
  recordMessage.textContent = message;
  recordMessage.classList.add('is-visible');
  messageTimeout = window.setTimeout(() => recordMessage.classList.remove('is-visible'), 4200);
}

function updateRecordingTime() {
  if (!recordingStartedAt) return;
  const pausedNow = pauseStartedAt ? Date.now() - pauseStartedAt : 0;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - recordingStartedAt - pausedDuration - pausedNow) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  recordStatus.textContent = `REC ${minutes}:${seconds}`;
}

function stopCapturedTracks() {
  recordingStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  recordingStreams = [];
}

function resetRecordingInterface() {
  window.clearInterval(statusInterval);
  statusInterval = 0;
  recordingStartedAt = 0;
  pauseStartedAt = 0;
  pausedDuration = 0;
  recordStatus.textContent = 'REC';
  recordPauseButton.classList.remove('is-paused');
  recordPauseButton.setAttribute('aria-label', 'Pause recording');
  document.body.classList.remove('recording', 'recording-paused');
  recordStartButton.disabled = false;
}

function downloadRecording(blob) {
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arrow-illusion-demo-${timestamp}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function startRecording() {
  if (mediaRecorder || recordStartButton.disabled) return;
  if (!navigator.mediaDevices?.getDisplayMedia || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showRecordingMessage('Screen recording is not supported in this browser. Open this page in Chrome.');
    return;
  }

  recordStartButton.disabled = true;
  let displayStream;
  let microphoneStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 } },
      audio: false,
      preferCurrentTab: true,
    });
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (error) {
    displayStream?.getTracks().forEach((track) => track.stop());
    microphoneStream?.getTracks().forEach((track) => track.stop());
    recordStartButton.disabled = false;
    if (error?.name !== 'NotAllowedError') showRecordingMessage(`Could not start recording. ${error?.message || ''}`.trim());
    return;
  }

  recordingStreams = [displayStream, microphoneStream];
  const combinedStream = new MediaStream([
    ...displayStream.getVideoTracks(),
    ...microphoneStream.getAudioTracks(),
  ]);
  const mimeTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
  const options = {
    videoBitsPerSecond: 12000000,
    audioBitsPerSecond: 192000,
    ...(mimeType ? { mimeType } : {}),
  };

  try {
    const activeRecorder = new MediaRecorder(combinedStream, options);
    mediaRecorder = activeRecorder;
    recordingChunks = [];
    activeRecorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) recordingChunks.push(event.data);
    });
    activeRecorder.addEventListener('stop', () => {
      const blob = new Blob(recordingChunks, { type: activeRecorder.mimeType || mimeType || 'video/webm' });
      if (blob.size) {
        downloadRecording(blob);
        showRecordingMessage('Recording saved to your Downloads folder.');
      }
      recordingChunks = [];
      stopCapturedTracks();
      if (mediaRecorder === activeRecorder) mediaRecorder = null;
      resetRecordingInterface();
    }, { once: true });
    displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
    }, { once: true });
    activeRecorder.start(1000);
    recordingStartedAt = Date.now();
    document.body.classList.add('recording');
    updateRecordingTime();
    statusInterval = window.setInterval(updateRecordingTime, 500);
  } catch (error) {
    stopCapturedTracks();
    mediaRecorder = null;
    resetRecordingInterface();
    showRecordingMessage(`Could not start recording. ${error?.message || ''}`.trim());
  }
}

recordStartButton.addEventListener('click', startRecording);
recordPauseButton.addEventListener('click', () => {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    pauseStartedAt = Date.now();
    recordPauseButton.classList.add('is-paused');
    recordPauseButton.setAttribute('aria-label', 'Resume recording');
    document.body.classList.add('recording-paused');
  } else if (mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    pausedDuration += Date.now() - pauseStartedAt;
    pauseStartedAt = 0;
    recordPauseButton.classList.remove('is-paused');
    recordPauseButton.setAttribute('aria-label', 'Pause recording');
    document.body.classList.remove('recording-paused');
  }
});

recordStopButton.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
});

window.addEventListener('resize', () => {
  viewers.forEach((viewer) => viewer.resize());
  sphereViewer.resize();
  helixViewers.forEach((viewer) => viewer.resize());
});

const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  viewers.forEach((viewer) => viewer.animate(delta, elapsed));
  sphereViewer.animate(delta, elapsed);
  helixViewers.forEach((viewer) => viewer.animate(delta, elapsed));
}

animate();

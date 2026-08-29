import * as THREE from 'three';

const TAU = Math.PI * 2;
const REVOLUTION_SECONDS = 12;

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticleMaterial(renderer, { radius = 3, reverseColours = false, depthTest = true, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uTime: { value: 0 },
      uRadius: { value: radius },
      uReverseColours: { value: reverseColours ? 1 : 0 },
      uOpacity: { value: opacity },
      uIntensity: { value: 1 },
      uGuideDepthColours: { value: 0 },
      uGuideDepthMask: { value: 0 },
      uPointScale: { value: 1 },
    },
    vertexShader: `
      attribute float aSeed;
      varying float vSeed;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying float vViewDepthFromPillar;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uGuideDepthMask;
      void main(){
        vSeed=aSeed;
        vec4 worldPosition=modelMatrix*vec4(position,1.0);
        vWorldPosition=worldPosition.xyz;
        vec4 viewPosition=viewMatrix*worldPosition;
        vViewPosition=viewPosition.xyz;
        vec4 pillarViewPosition=viewMatrix*vec4(0.0,worldPosition.y,0.0,1.0);
        vViewDepthFromPillar=viewPosition.z-pillarViewPosition.z;
        gl_Position=projectionMatrix*viewPosition;
        float perspective=clamp(12.0/-viewPosition.z,0.72,1.75);
        float pillarCoverage=uGuideDepthMask*step(0.0,vViewDepthFromPillar)*(1.0-smoothstep(0.045,0.15,abs(vViewPosition.x)));
        gl_PointSize=(1.02+aSeed*1.4)*uPixelRatio*perspective*uPointScale*mix(1.0,1.42,pillarCoverage);
      }
    `,
    fragmentShader: `
      varying float vSeed;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying float vViewDepthFromPillar;
      uniform float uTime;
      uniform float uRadius;
      uniform float uReverseColours;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uGuideDepthColours;
      uniform float uGuideDepthMask;
      void main(){
        vec2 centred=gl_PointCoord-vec2(0.5);
        float distanceFromCentre=length(centred);
        if(distanceFromCentre>0.5)discard;
        if(uGuideDepthMask>0.5&&abs(vViewPosition.x)<0.082&&vViewDepthFromPillar<0.0)discard;
        vec3 gold=vec3(1.0,0.66,0.22);
        vec3 orange=vec3(1.0,0.24,0.035);
        vec3 blue=vec3(0.025,0.14,1.0);
        float depthCoordinate=mix(vWorldPosition.z,vViewDepthFromPillar,uGuideDepthColours);
        float frontness=smoothstep(-uRadius*0.72,uRadius*0.72,depthCoordinate);
        frontness=mix(frontness,1.0-frontness,uReverseColours);
        vec3 colour=frontness<0.5?mix(gold,orange,frontness*2.0):mix(orange,blue,(frontness-0.5)*2.0);
        float grain=0.79+0.31*fract(vSeed*37.731);
        float shimmer=0.93+0.07*sin(uTime*1.7+vSeed*71.0);
        float alpha=smoothstep(0.5,0.28,distanceFromCentre)*uOpacity;
        gl_FragColor=vec4(colour*grain*shimmer*uIntensity,alpha);
      }
    `,
    transparent: true,
    depthTest,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createSpiralArrow(renderer, {
  seed,
  direction,
  reverseColours = false,
  radius = 2.75,
  pitch = 0.72,
} = {}) {
  const random = mulberry32(seed);
  const bodyCount = 10500;
  const headCount = 3800;
  const count = bodyCount + headCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const gapAngle = 0.5;
  const headAngle = 0.94;
  const lowGap = gapAngle * 0.5;
  const highGap = TAU - gapAngle * 0.5;
  const tipAngle = direction > 0 ? highGap : lowGap;
  const headBase = tipAngle - direction * headAngle;
  const bodyStart = direction > 0 ? lowGap : highGap;
  const bodyHalfHeight = 0.23;
  const headHalfHeight = 0.78;

  function setPoint(index, angle, localHeight, radiusOffset = 0) {
    const radial = radius + radiusOffset;
    const spiralHeight = pitch * ((angle - Math.PI) / Math.PI);
    positions[index * 3] = radial * Math.cos(angle);
    positions[index * 3 + 1] = localHeight + spiralHeight;
    positions[index * 3 + 2] = radial * Math.sin(angle);
    seeds[index] = random();
  }

  for (let index = 0; index < bodyCount; index += 1) {
    const angle = THREE.MathUtils.lerp(bodyStart, headBase, random());
    setPoint(index, angle, THREE.MathUtils.lerp(-bodyHalfHeight, bodyHalfHeight, random()), (random() - 0.5) * 0.035);
  }
  for (let index = 0; index < headCount; index += 1) {
    const progress = 1 - Math.sqrt(random());
    const angle = THREE.MathUtils.lerp(headBase, tipAngle, progress);
    const halfHeight = THREE.MathUtils.lerp(headHalfHeight, 0.018, progress);
    setPoint(bodyCount + index, angle, THREE.MathUtils.lerp(-halfHeight, halfHeight, random()), (random() - 0.5) * 0.035);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  const points = new THREE.Points(geometry, createParticleMaterial(renderer, { radius, reverseColours, opacity: 0.82 }));
  points.userData.direction = direction;
  points.userData.phase = 0;
  points.userData.reverseColours = reverseColours;
  return points;
}

function createHelixArrow(renderer, { seed, phaseOffset, reverseColours = false } = {}) {
  const random = mulberry32(seed);
  const bodyCount = 19000;
  const headCount = 6500;
  const count = bodyCount + headCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const bodyEnd = 0.88;
  const turns = 3.45;
  const bottomY = -3.35;
  const shoulderY = 2.0;
  const tipY = 3.0;
  const bodyTopRadius = 1.5;

  function radiusAt(progress) {
    return 0.2 + (bodyTopRadius - 0.2) * Math.pow(progress, 0.69);
  }

  function setPoint(index, angle, y, radius, widthOffset = 0) {
    const radial = radius + widthOffset;
    positions[index * 3] = radial * Math.cos(angle);
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = radial * Math.sin(angle);
    seeds[index] = random();
  }

  for (let index = 0; index < bodyCount; index += 1) {
    const progress = random();
    const angle = phaseOffset + turns * TAU * progress;
    const centreY = THREE.MathUtils.lerp(bottomY, shoulderY, progress);
    const halfWidth = THREE.MathUtils.lerp(0.07, 0.2, progress);
    setPoint(index, angle, centreY + THREE.MathUtils.lerp(-halfWidth, halfWidth, random()), radiusAt(progress), (random() - 0.5) * 0.035);
  }

  const headBaseAngle = phaseOffset + turns * TAU;
  for (let index = 0; index < headCount; index += 1) {
    const progress = 1 - Math.cbrt(random());
    const centreY = THREE.MathUtils.lerp(shoulderY, tipY, progress);
    const crossSectionRadius = THREE.MathUtils.lerp(0.52, 0.012, progress) * Math.sqrt(random());
    const crossSectionAngle = random() * TAU;
    const radialOffset = Math.cos(crossSectionAngle) * crossSectionRadius;
    const tangentOffset = Math.sin(crossSectionAngle) * crossSectionRadius;
    const centreRadius = THREE.MathUtils.lerp(bodyTopRadius, 1.62, progress);
    const cosine = Math.cos(headBaseAngle);
    const sine = Math.sin(headBaseAngle);
    positions[(bodyCount + index) * 3] = cosine * (centreRadius + radialOffset) - sine * tangentOffset;
    positions[(bodyCount + index) * 3 + 1] = centreY;
    positions[(bodyCount + index) * 3 + 2] = sine * (centreRadius + radialOffset) + cosine * tangentOffset;
    seeds[bodyCount + index] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  const points = new THREE.Points(geometry, createParticleMaterial(renderer, {
    radius: 1.65,
    reverseColours,
    depthTest: false,
    opacity: 0.64,
  }));
  points.userData.reverseColours = reverseColours;
  return points;
}

function createHelixOccluder(phaseOffset) {
  const turns = 3.45;
  const bottomY = -3.35;
  const shoulderY = 2.0;
  const tipY = 3.0;
  const bodyTopRadius = 1.5;
  const group = new THREE.Group();

  function radiusAt(progress) {
    return 0.2 + (bodyTopRadius - 0.2) * Math.pow(progress, 0.69);
  }

  const positions = [];
  const indices = [];
  const bodySegments = 260;

  for (let index = 0; index <= bodySegments; index += 1) {
    const progress = index / bodySegments;
    const angle = phaseOffset + turns * TAU * progress;
    const radius = radiusAt(progress);
    const centreY = THREE.MathUtils.lerp(bottomY, shoulderY, progress);
    const halfWidth = THREE.MathUtils.lerp(0.07, 0.2, progress) * 0.94;
    positions.push(
      radius * Math.cos(angle), centreY - halfWidth, radius * Math.sin(angle),
      radius * Math.cos(angle), centreY + halfWidth, radius * Math.sin(angle),
    );
    if (index < bodySegments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }

  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bodyGeometry.setIndex(indices);
  bodyGeometry.computeVertexNormals();
  const depthMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    colorWrite: false,
    depthTest: true,
    depthWrite: true,
  });
  const body = new THREE.Mesh(bodyGeometry, depthMaterial);
  body.renderOrder = 0;
  group.add(body);

  const headAngle = phaseOffset + turns * TAU;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.49, tipY - shoulderY, 32, 1, false),
    depthMaterial,
  );
  const headRadius = 1.56;
  head.position.set(
    headRadius * Math.cos(headAngle),
    (shoulderY + tipY) * 0.5,
    headRadius * Math.sin(headAngle),
  );
  head.renderOrder = 0;
  group.add(head);
  group.visible = false;
  return group;
}

function createInteractiveRenderer(host, {
  fov,
  yaw,
  pitch,
  distance,
  buildScene,
  animateScene,
  setColourScheme,
  setGuidesScene,
} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  let cameraYaw = yaw;
  let cameraPitch = pitch;
  let cameraDistance = distance;
  let active = false;
  const sceneState = buildScene(scene, renderer);

  function updateCamera() {
    const horizontal = cameraDistance * Math.cos(cameraPitch);
    camera.position.set(horizontal * Math.sin(cameraYaw), cameraDistance * Math.sin(cameraPitch), horizontal * Math.cos(cameraYaw));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }
  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    updateCamera();
  }
  function reset() {
    cameraYaw = yaw;
    cameraPitch = pitch;
    cameraDistance = distance;
    resize();
  }

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  host.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    cameraYaw -= (event.clientX - lastX) * 0.012;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch - (event.clientY - lastY) * 0.01, -1.46, 1.46);
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  });
  host.addEventListener('pointerup', () => { dragging = false; });
  host.addEventListener('pointercancel', () => { dragging = false; });
  host.addEventListener('wheel', (event) => {
    event.preventDefault();
    cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.001), 7.5, 30);
    updateCamera();
  }, { passive: false });
  updateCamera();

  return {
    resize,
    reset,
    setColourInverted(value) {
      setColourScheme?.(sceneState, value);
    },
    setGuides(value) {
      setGuidesScene?.(sceneState, value);
    },
    setActive(value) {
      active = value;
      if (active) requestAnimationFrame(resize);
    },
    animate(delta, elapsed) {
      if (!active) return;
      animateScene(sceneState, delta, elapsed);
      renderer.render(scene, camera);
    },
  };
}

export function createSphereMode(host) {
  return createInteractiveRenderer(host, {
    fov: 35,
    yaw: 0.58,
    pitch: 0.42,
    distance: 19.4,
    buildScene(scene, renderer) {
      const arrows = [];
      [
        { rotation: [0, 0, 0], direction: 1, phase: 0.2, seed: 141, reverse: false },
        { rotation: [0, 0, Math.PI / 2], direction: -1, phase: 2.1, seed: 271, reverse: true },
        { rotation: [Math.PI / 2, 0, 0], direction: 1, phase: 4.0, seed: 391, reverse: false },
      ].forEach((configuration) => {
        const axisGroup = new THREE.Group();
        axisGroup.rotation.set(...configuration.rotation);
        const arrow = createSpiralArrow(renderer, configuration);
        arrow.userData.phase = configuration.phase;
        axisGroup.add(arrow);
        scene.add(axisGroup);
        arrows.push(arrow);
      });
      return { arrows };
    },
    animateScene({ arrows }, delta, elapsed) {
      arrows.forEach((arrow, index) => {
        arrow.userData.phase -= arrow.userData.direction * delta * (TAU / (REVOLUTION_SECONDS + index * 1.7));
        arrow.rotation.y = arrow.userData.phase;
        arrow.material.uniforms.uTime.value = elapsed;
      });
    },
    setColourScheme({ arrows }, inverted) {
      arrows.forEach((arrow) => {
        arrow.material.uniforms.uReverseColours.value = Number(Boolean(arrow.userData.reverseColours) !== Boolean(inverted));
      });
    },
  });
}

export function createHelixMode(host, { direction = 1 } = {}) {
  const guideReverseColours = direction > 0;

  function applyColourScheme(state) {
    state.ribbons.forEach((ribbon) => {
      const baseReverseColours = state.guidesVisible
        ? guideReverseColours
        : Boolean(ribbon.userData.reverseColours);
      ribbon.material.uniforms.uReverseColours.value = Number(baseReverseColours !== state.colourInverted);
    });
  }

  return createInteractiveRenderer(host, {
    fov: 34,
    yaw: 0,
    pitch: 0.03,
    distance: 22.5,
    buildScene(scene, renderer) {
      const helixGroup = new THREE.Group();
      const first = createHelixArrow(renderer, { seed: 8871, phaseOffset: 0, reverseColours: false });
      const second = createHelixArrow(renderer, { seed: 9917, phaseOffset: Math.PI, reverseColours: false });
      const firstOccluder = createHelixOccluder(0);
      const secondOccluder = createHelixOccluder(Math.PI);
      helixGroup.add(firstOccluder, secondOccluder, first, second);
      scene.add(helixGroup);
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 7.7, 28),
        new THREE.MeshBasicMaterial({ color: 0xff3f36 }),
      );
      pillar.position.y = -0.15;
      pillar.renderOrder = 1;
      pillar.visible = false;
      scene.add(pillar);
      return {
        helixGroup,
        ribbons: [first, second],
        occluders: [firstOccluder, secondOccluder],
        pillar,
        phase: 0,
        guidesVisible: false,
        colourInverted: false,
      };
    },
    animateScene(state, delta, elapsed) {
      state.phase -= direction * delta * (TAU / 14.5);
      state.helixGroup.rotation.y = state.phase;
      state.ribbons.forEach((ribbon) => { ribbon.material.uniforms.uTime.value = elapsed; });
    },
    setColourScheme(state, inverted) {
      state.colourInverted = inverted;
      applyColourScheme(state);
    },
    setGuidesScene(state, visible) {
      state.guidesVisible = visible;
      state.pillar.visible = visible;
      state.occluders.forEach((occluder) => { occluder.visible = visible; });
      state.ribbons.forEach((ribbon) => {
        ribbon.material.uniforms.uIntensity.value = visible ? 1.32 : 1;
        ribbon.material.uniforms.uOpacity.value = visible ? 1 : 0.64;
        ribbon.material.uniforms.uGuideDepthColours.value = visible ? 1 : 0;
        ribbon.material.uniforms.uGuideDepthMask.value = visible ? 1 : 0;
        ribbon.material.uniforms.uPointScale.value = 1;
        ribbon.material.depthTest = false;
        ribbon.material.depthWrite = false;
        ribbon.material.blending = visible ? THREE.NormalBlending : THREE.AdditiveBlending;
        ribbon.material.needsUpdate = true;
      });
      applyColourScheme(state);
    },
  });
}

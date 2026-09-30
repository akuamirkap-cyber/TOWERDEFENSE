import * as THREE from "three";

interface FlamePuff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  width: number;
  height: number;
  roll: number;
  age: number;
  life: number;
}

const MAX_FLAMES = 900;
const FORWARD = new THREE.Vector3(0, 0, 1);
const AGE_TINTS = [0xffffff, 0xfff5d0, 0xffd4a0, 0xffaa70, 0xb37765].map((hex) => new THREE.Color(hex));

function createFlameTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext("2d")!;

  const body = new Path2D();
  body.moveTo(64, 191);
  body.bezierCurveTo(21, 167, 12, 134, 37, 96);
  body.bezierCurveTo(26, 70, 37, 48, 58, 38);
  body.bezierCurveTo(51, 21, 64, 11, 67, 3);
  body.bezierCurveTo(83, 28, 101, 48, 88, 79);
  body.bezierCurveTo(117, 112, 110, 161, 64, 191);
  body.closePath();

  const glow = ctx.createLinearGradient(0, 3, 0, 192);
  glow.addColorStop(0, "rgba(204,31,20,0)");
  glow.addColorStop(0.2, "rgba(221,61,23,0.35)");
  glow.addColorStop(0.47, "rgba(250,115,26,0.78)");
  glow.addColorStop(0.73, "rgba(255,187,50,0.96)");
  glow.addColorStop(0.87, "rgba(255,242,164,0.96)");
  glow.addColorStop(1, "rgba(255,224,110,0)");
  ctx.shadowColor = "rgba(255,91,15,0.88)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = glow;
  ctx.fill(body);
  ctx.shadowBlur = 0;
  ctx.fill(body);

  const core = ctx.createRadialGradient(62, 145, 5, 64, 147, 60);
  core.addColorStop(0, "rgba(255,255,239,0.96)");
  core.addColorStop(0.36, "rgba(255,233,121,0.78)");
  core.addColorStop(0.7, "rgba(255,172,41,0.16)");
  core.addColorStop(1, "rgba(255,95,20,0)");
  ctx.fillStyle = core;
  ctx.fill(body);

  const tongue = new Path2D();
  tongue.moveTo(63, 175);
  tongue.bezierCurveTo(49, 143, 67, 112, 60, 95);
  tongue.bezierCurveTo(82, 115, 86, 148, 63, 175);
  const tongueGradient = ctx.createLinearGradient(0, 90, 0, 177);
  tongueGradient.addColorStop(0, "rgba(255,251,185,0)");
  tongueGradient.addColorStop(0.7, "rgba(255,251,199,0.72)");
  tongueGradient.addColorStop(1, "rgba(255,251,199,0)");
  ctx.fillStyle = tongueGradient;
  ctx.fill(tongue);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export class FlameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private particles: FlamePuff[] = [];
  private mesh: THREE.InstancedMesh;
  private texture: THREE.CanvasTexture;
  private dummy = new THREE.Object3D();
  private rollQuaternion = new THREE.Quaternion();

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.texture = createFlameTexture();
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
      MAX_FLAMES,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, AGE_TINTS[0]);
    this.mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  emit(start: THREE.Vector3, end: THREE.Vector3) {
    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    const forwardX = Math.cos(angle);
    const forwardZ = Math.sin(angle);
    const sideX = -forwardZ;
    const sideZ = forwardX;
    const length = Math.min(6.2, Math.hypot(end.x - start.x, end.z - start.z) + 0.8);

    // Puffs start along the whole cone, so consecutive shots read as one continuous jet.
    for (let index = 0; index < 17 && this.particles.length < MAX_FLAMES; index++) {
      const progress = Math.min(0.98, (index + Math.random() * 0.8) / 17);
      const spread = (Math.random() - 0.5) * (0.13 + progress * 1.2);
      const drift = 3 + Math.random() * 4;
      this.particles.push({
        x: start.x + forwardX * length * progress + sideX * spread,
        y: start.y + (end.y - start.y) * progress + Math.sin(progress * Math.PI) * 0.24,
        z: start.z + forwardZ * length * progress + sideZ * spread,
        vx: forwardX * drift + sideX * (Math.random() - 0.5) * 1.7,
        vy: 0.2 + Math.random() * 1.15,
        vz: forwardZ * drift + sideZ * (Math.random() - 0.5) * 1.7,
        width: (0.6 + progress * 0.85) * (0.82 + Math.random() * 0.36),
        height: (1.4 + progress * 1.18) * (0.78 + Math.random() * 0.42),
        roll: (Math.random() - 0.5) * 0.48,
        age: Math.random() * 0.06,
        life: 0.27 + Math.random() * 0.18,
      });
    }
  }

  update(dt: number) {
    let rendered = 0;
    const originalCount = this.particles.length;
    for (let index = 0; index < originalCount; index++) {
      const particle = this.particles[index];
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      const drag = Math.exp(-dt * 3.4);
      particle.vx *= drag;
      particle.vz *= drag;
      particle.y = Math.max(0.45, particle.y);

      this.particles[rendered] = particle;
      const progress = particle.age / particle.life;
      const scale = (0.78 + 0.36 * Math.sin(Math.PI * progress)) * (1 - progress * 0.47);
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.rollQuaternion.setFromAxisAngle(FORWARD, particle.roll + Math.sin(progress * 10 + particle.roll) * 0.09);
      this.dummy.quaternion.copy(this.camera.quaternion).multiply(this.rollQuaternion);
      this.dummy.scale.set(particle.width * scale, particle.height * scale, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(rendered, this.dummy.matrix);
      const colorIndex = Math.min(4, Math.floor(progress * 5));
      this.mesh.setColorAt(rendered, AGE_TINTS[colorIndex]);
      rendered++;
    }
    this.particles.length = rendered;
    this.mesh.count = rendered;
    if (rendered) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  reset() {
    this.particles.length = 0;
    this.mesh.count = 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
    this.particles.length = 0;
  }
}
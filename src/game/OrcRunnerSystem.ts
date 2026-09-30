import * as THREE from "three";

export interface OrcRunPose {
  x: number;
  z: number;
  angle: number;
  scale: number;
  distance: number;
  wobble: number;
  lift: number;
  stagger: number;
  shockTime: number;
  lostParts: number;
  attackPulse: number;
}

const MAX_ORCS = 6500;

export function runCycle(pose: Pick<OrcRunPose, "distance" | "wobble"> & { scale?: number }) {
  // Stride frequency dynamically matched to physical orc scale so feet don't slide or pedal unnaturally
  const s = Math.max(0.4, pose.scale || 1);
  return (pose.distance / s) * 3.92 + (pose.wobble || 0) * 0.35;
}

export class OrcRunnerSystem {
  private scene: THREE.Scene;
  private legs: THREE.InstancedMesh;
  private boots: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private clubs: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const makeMesh = (geometry: THREE.BufferGeometry, color: number, count: number) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ color, flatShading: true }),
        count,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.legs = makeMesh(new THREE.BoxGeometry(0.24, 0.48, 0.24), 0x5b7034, MAX_ORCS * 2);
    this.boots = makeMesh(new THREE.BoxGeometry(0.36, 0.2, 0.28), 0x4c4931, MAX_ORCS * 2);
    this.arms = makeMesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), 0x789a40, MAX_ORCS * 2);
    this.clubs = makeMesh(new THREE.BoxGeometry(0.18, 0.72, 0.19), 0x694d32, MAX_ORCS);
  }

  private setPart(mesh: THREE.InstancedMesh, index: number, pose: OrcRunPose, forward: number, height: number, side: number, pitch = 0, roll = 0) {
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    this.dummy.position.set(
      pose.x + (cos * forward - sin * side) * pose.scale,
      pose.lift + height * pose.scale,
      pose.z + (sin * forward + cos * side) * pose.scale,
    );
    this.dummy.rotation.set(roll, -pose.angle, pitch);
    this.dummy.scale.setScalar(pose.scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  render(poses: readonly OrcRunPose[], cameraX: number, cameraZ: number, viewWidth: number, viewDepth: number) {
    let legs = 0;
    let boots = 0;
    let arms = 0;
    let clubs = 0;

    for (const pose of poses) {
      if (Math.abs(pose.x - cameraX) > viewWidth || Math.abs(pose.z - cameraZ) > viewDepth) continue;
      const phase = runCycle(pose);
      const running = pose.stagger > 0.1 ? 0.25 : pose.shockTime > 0 ? 0.45 : 1;

      const s = Math.max(0.6, pose.scale || 1);
      const damp = Math.min(1, 1.25 / Math.sqrt(s));

      // Stride curve, dampening bounce for giants to make footsteps feel heavy and anchored
      const waddle = Math.sin(phase) * 0.09 * running * damp;
      const hop = Math.abs(Math.sin(phase)) * 0.08 * running * damp;

      for (const side of [-1, 1]) {
        const rawWave = Math.sin(phase + (side > 0 ? Math.PI : 0));
        // Stride curve: boots swing forward and plant firmly
        const stride = Math.sign(rawWave) * Math.pow(Math.abs(rawWave), 0.78) * running;
        const footLift = Math.max(0, stride) * 0.22 * running;

        // Legs swinging naturally with step
        const legForward = stride * 0.26 - 0.08;
        const legHeight = 0.32 + hop + footLift * 0.38;
        const legPitch = stride * 0.78;
        this.setPart(this.legs, legs++, pose, legForward, legHeight, side * 0.2, legPitch, waddle * side);

        // Heavy boots planting down into the ground
        const bootForward = legForward + 0.11 + stride * 0.14;
        const bootHeight = 0.11 + hop + footLift * 0.82;
        this.setPart(this.boots, boots++, pose, bootForward, bootHeight, side * 0.2, stride * 0.40, waddle * side);

        const bit = side < 0 ? 2 : 4;
        if (pose.lostParts & bit) continue;

        // Pumping arms (alternating opposite to legs) + heavy smash attack
        const attack = pose.attackPulse > 0 ? Math.sin((1 - Math.min(1, pose.attackPulse / 0.32)) * Math.PI) : 0;
        const armForward = -stride * 0.26 + 0.12 + (side > 0 ? attack * 0.6 : 0);
        const armHeight = 0.78 + hop + (side > 0 ? attack * 0.45 : 0);
        const armPitch = -stride * 0.8 + (side > 0 ? attack * 1.15 : 0);
        this.setPart(this.arms, arms++, pose, armForward, armHeight, side * 0.44, armPitch, -waddle);

        // Club on right side: winds up high and smashes down violently
        if (side > 0) {
          const clubForward = armForward + 0.26 + attack * 0.3;
          const clubHeight = armHeight + 0.05 + attack * 0.35;
          const clubPitch = armPitch + 0.65 + attack * 1.25;
          this.setPart(this.clubs, clubs++, pose, clubForward, clubHeight, 0.52, clubPitch, -waddle);
        }
      }
    }

    this.legs.count = legs;
    this.boots.count = boots;
    this.arms.count = arms;
    this.clubs.count = clubs;
    if (legs) {
      this.legs.instanceMatrix.needsUpdate = true;
      this.boots.instanceMatrix.needsUpdate = true;
    }
    if (arms) this.arms.instanceMatrix.needsUpdate = true;
    if (clubs) this.clubs.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of [this.legs, this.boots, this.arms, this.clubs]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
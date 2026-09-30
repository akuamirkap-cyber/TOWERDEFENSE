import * as THREE from "three";

export interface RagdollAnchor {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  scale: number;
  lostParts?: number;
}

interface Joint {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
}

interface Ragdoll {
  body: RagdollAnchor;
  joints: [Joint, Joint, Joint, Joint, Joint, Joint, Joint];
  age: number;
}

const MAX_RAGDOLLS = 115;
const UP = new THREE.Vector3(0, 1, 0);

function keepDistance(a: Joint, b: Joint, length: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const distance = Math.max(0.0001, Math.hypot(dx, dy, dz));
  const correction = (distance - length) / distance * 0.5;
  a.x += dx * correction;
  a.y += dy * correction;
  a.z += dz * correction;
  b.x -= dx * correction;
  b.y -= dy * correction;
  b.z -= dz * correction;
}

export class RagdollSystem {
  private scene: THREE.Scene;
  private bodies: Ragdoll[] = [];
  private ids = new Set<number>();
  private dummy = new THREE.Object3D();
  private axis = new THREE.Vector3();
  private torso: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private limbs: THREE.InstancedMesh;
  private clubs: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const makeMesh = (geometry: THREE.BufferGeometry, color: number, count: number) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }),
        count,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.torso = makeMesh(new THREE.CylinderGeometry(0.94, 1.12, 1, 6), 0x536a2f, MAX_RAGDOLLS);
    this.head = makeMesh(new THREE.IcosahedronGeometry(1, 0), 0x86a64c, MAX_RAGDOLLS);
    this.limbs = makeMesh(new THREE.CylinderGeometry(1, 0.82, 1, 5), 0x6d8d3b, MAX_RAGDOLLS * 4);
    this.clubs = makeMesh(new THREE.CylinderGeometry(1, 1, 1, 5), 0x624329, MAX_RAGDOLLS);
  }

  has(id: number) {
    return this.ids.has(id);
  }

  spawn(body: RagdollAnchor) {
    if (this.bodies.length >= MAX_RAGDOLLS) return false;
    const s = body.scale;
    const fx = Math.cos(body.angle);
    const fz = Math.sin(body.angle);
    const sx = -fz;
    const sz = fx;
    const impulse = Math.min(20, Math.hypot(body.vx, body.vz));
    const makeJoint = (forward: number, height: number, side: number): Joint => {
      const x = body.x + fx * forward * s + sx * side * s;
      const z = body.z + fz * forward * s + sz * side * s;
      const y = height * s + Math.max(0, body.y) * 0.32;
      const kick = (Math.random() - 0.5) * (3 + impulse * 0.23);
      return {
        x, y, z,
        px: x - body.vx * 0.014 - sx * kick * 0.016,
        py: y - (body.vy + 1 + Math.random() * 3) * 0.014,
        pz: z - body.vz * 0.014 - sz * kick * 0.016,
      };
    };
    this.bodies.push({
      body,
      joints: [
        makeJoint(0, 0.67, 0),
        makeJoint(0.12, 1.24, 0),
        makeJoint(0.21, 1.73, 0),
        makeJoint(0.34, 0.87, -0.68),
        makeJoint(0.34, 0.87, 0.68),
        makeJoint(-0.3, 0.12, -0.34),
        makeJoint(-0.3, 0.12, 0.34),
      ],
      age: 0,
    });
    this.ids.add(body.id);
    return true;
  }

  update(dt: number) {
    for (let index = this.bodies.length - 1; index >= 0; index--) {
      const ragdoll = this.bodies[index];
      ragdoll.age += dt;
      if (ragdoll.age >= 2.3) {
        this.ids.delete(ragdoll.body.id);
        this.bodies.splice(index, 1);
        continue;
      }

      const { joints, body } = ragdoll;
      const gravity = 27 * dt * dt;
      for (let part = 0; part < joints.length; part++) {
        const node = joints[part];
        const vx = (node.x - node.px) * 0.985;
        const vy = (node.y - node.py) * 0.985;
        const vz = (node.z - node.pz) * 0.985;
        node.px = node.x;
        node.py = node.y;
        node.pz = node.z;
        node.x += vx;
        node.y += vy - gravity;
        node.z += vz;
      }

      // Verlet distance constraints let the torso, head, hands, and feet swing separately.
      for (let iteration = 0; iteration < 4; iteration++) {
        const length = body.scale;
        keepDistance(joints[0], joints[1], 0.61 * length);
        keepDistance(joints[1], joints[2], 0.51 * length);
        keepDistance(joints[1], joints[3], 0.82 * length);
        keepDistance(joints[1], joints[4], 0.82 * length);
        keepDistance(joints[0], joints[5], 0.82 * length);
        keepDistance(joints[0], joints[6], 0.82 * length);
        keepDistance(joints[3], joints[4], 1.42 * length);

        const hip = joints[0];
        hip.x += (body.x - hip.x) * 0.23;
        hip.z += (body.z - hip.z) * 0.23;
        hip.y += (0.23 + body.y * 0.45 - hip.y) * 0.075;

        for (let part = 0; part < joints.length; part++) {
          const node = joints[part];
          const floor = part === 2 ? 0.3 * length : part < 2 ? 0.16 * length : 0.085 * length;
          if (node.y >= floor) continue;
          const impact = node.py - node.y;
          node.y = floor;
          node.py = floor - Math.min(0.08, Math.max(0, impact) * 0.12);
          node.px += (node.x - node.px) * 0.28;
          node.pz += (node.z - node.pz) * 0.28;
        }
      }
    }
  }

  private between(
    mesh: THREE.InstancedMesh,
    index: number,
    a: Pick<Joint, "x" | "y" | "z">,
    b: Pick<Joint, "x" | "y" | "z">,
    thickness: number,
    shrink: number,
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.max(0.01, Math.hypot(dx, dy, dz));
    this.axis.set(dx / length, dy / length, dz / length);
    this.dummy.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    this.dummy.quaternion.setFromUnitVectors(UP, this.axis);
    this.dummy.scale.set(thickness * shrink, length * shrink, thickness * shrink);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  render() {
    let index = 0;
    let limbIndex = 0;
    for (const { joints, body, age } of this.bodies) {
      const fade = age > 1.85 ? Math.max(0.08, 1 - (age - 1.85) / 0.45) : 1;
      const size = body.scale * fade;
      this.between(this.torso, index, joints[0], joints[1], 0.27 * size, fade);
      this.dummy.position.set(joints[2].x, joints[2].y, joints[2].z);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(body.lostParts && body.lostParts & 1 ? 0.0001 : 0.32 * size);
      this.dummy.updateMatrix();
      this.head.setMatrixAt(index, this.dummy.matrix);
      this.between(this.limbs, limbIndex++, joints[1], joints[3], 0.105 * size, body.lostParts && body.lostParts & 2 ? 0.0001 : fade);
      this.between(this.limbs, limbIndex++, joints[1], joints[4], 0.105 * size, body.lostParts && body.lostParts & 4 ? 0.0001 : fade);
      this.between(this.limbs, limbIndex++, joints[0], joints[5], 0.14 * size, fade);
      this.between(this.limbs, limbIndex++, joints[0], joints[6], 0.14 * size, fade);
      const hand = joints[4];
      const end = { x: hand.x + (hand.x - joints[1].x) * 0.6, y: hand.y + 0.12, z: hand.z + (hand.z - joints[1].z) * 0.6 };
      this.between(this.clubs, index, hand, end, 0.085 * size, body.lostParts && body.lostParts & 4 ? 0.0001 : fade);
      index++;
    }
    this.torso.count = index;
    this.head.count = index;
    this.clubs.count = index;
    this.limbs.count = limbIndex;
    if (index) {
      this.torso.instanceMatrix.needsUpdate = true;
      this.head.instanceMatrix.needsUpdate = true;
      this.clubs.instanceMatrix.needsUpdate = true;
      this.limbs.instanceMatrix.needsUpdate = true;
    }
  }

  reset() {
    this.bodies.length = 0;
    this.ids.clear();
    this.render();
  }

  dispose() {
    for (const mesh of [this.torso, this.head, this.limbs, this.clubs]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.bodies.length = 0;
    this.ids.clear();
  }
}
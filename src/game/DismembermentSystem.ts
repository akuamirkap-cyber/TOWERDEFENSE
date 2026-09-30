import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type SeveredPart = "head" | "arm" | "upper" | "lower";

interface Fragment {
  part: SeveredPart;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  angularVelocity: number;
  scale: number;
  age: number;
}

const MAX_FRAGMENTS = 220;

function mergeParts(parts: THREE.BufferGeometry[]) {
  const geometries = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part.clone();
    part.dispose();
    return flat;
  });
  const result = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return result;
}

export class DismembermentSystem {
  private scene: THREE.Scene;
  private fragments: Fragment[] = [];
  private headMesh: THREE.InstancedMesh;
  private helmetMesh: THREE.InstancedMesh;
  private armMesh: THREE.InstancedMesh;
  private upperMesh: THREE.InstancedMesh;
  private lowerMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const makeMesh = (geometry: THREE.BufferGeometry, color: number) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide }),
        MAX_FRAGMENTS,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.headMesh = makeMesh(new THREE.IcosahedronGeometry(0.34, 0), 0x80a244);
    this.helmetMesh = makeMesh(new THREE.ConeGeometry(0.34, 0.32, 5), 0x675632);
    this.armMesh = makeMesh(new THREE.CylinderGeometry(0.12, 0.17, 0.64, 5), 0x72933b);

    const upperBody = new THREE.CylinderGeometry(0.3, 0.39, 0.64, 6);
    const upperHead = new THREE.IcosahedronGeometry(0.28, 0);
    upperHead.translate(0, 0.54, 0);
    const upperGeometry = mergeParts([upperBody, upperHead]);
    if (!upperGeometry) throw new Error("Could not build upper orc fragment");
    this.upperMesh = makeMesh(upperGeometry, 0x61853c);

    const lowerBody = new THREE.CylinderGeometry(0.37, 0.35, 0.36, 6);
    const legLeft = new THREE.BoxGeometry(0.19, 0.43, 0.23);
    const legRight = new THREE.BoxGeometry(0.19, 0.43, 0.23);
    legLeft.translate(-0.18, -0.38, 0);
    legRight.translate(0.18, -0.38, 0);
    const lowerGeometry = mergeParts([lowerBody, legLeft, legRight]);
    if (!lowerGeometry) throw new Error("Could not build lower orc fragment");
    this.lowerMesh = makeMesh(lowerGeometry, 0x536b35);
  }

  spawn(part: SeveredPart, x: number, y: number, z: number, vx: number, vz: number, scale: number) {
    if (this.fragments.length >= MAX_FRAGMENTS) this.fragments.shift();
    this.fragments.push({
      part,
      x, y: Math.max(0.38, y), z,
      vx: vx * 0.48 + (Math.random() - 0.5) * 3.4,
      vy: (part === "upper" ? 6 : 4.2) + Math.random() * 4.3,
      vz: vz * 0.48 + (Math.random() - 0.5) * 3.4,
      angle: Math.random() * Math.PI,
      angularVelocity: (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 9),
      scale,
      age: 0,
    });
  }

  update(dt: number) {
    let write = 0;
    for (let index = 0; index < this.fragments.length; index++) {
      const fragment = this.fragments[index];
      fragment.age += dt;
      if (fragment.age >= 2.4) continue;
      fragment.x += fragment.vx * dt;
      fragment.z += fragment.vz * dt;
      fragment.y += fragment.vy * dt;
      fragment.vy -= 22 * dt;
      fragment.angle += fragment.angularVelocity * dt;
      const drag = Math.exp(-dt * 1.3);
      fragment.vx *= drag;
      fragment.vz *= drag;
      fragment.angularVelocity *= Math.exp(-dt * 1.1);
      const floor = (fragment.part === "head" || fragment.part === "upper" ? 0.32 : fragment.part === "lower" ? 0.2 : 0.13) * fragment.scale;
      if (fragment.y <= floor) {
        fragment.y = floor;
        fragment.vy = fragment.vy < -1.3 ? -fragment.vy * 0.33 : 0;
        fragment.vx *= 0.78;
        fragment.vz *= 0.78;
      }
      this.fragments[write++] = fragment;
    }
    this.fragments.length = write;
  }

  render() {
    let heads = 0;
    let arms = 0;
    let uppers = 0;
    let lowers = 0;
    for (const fragment of this.fragments) {
      const shrink = fragment.age > 1.9 ? Math.max(0.01, (2.4 - fragment.age) / 0.5) : 1;
      this.dummy.position.set(fragment.x, fragment.y, fragment.z);
      this.dummy.rotation.set(fragment.angle * 0.64, fragment.angle * 0.38, fragment.angle);
      this.dummy.scale.setScalar(fragment.scale * shrink);
      this.dummy.updateMatrix();
      if (fragment.part === "head") {
        this.headMesh.setMatrixAt(heads, this.dummy.matrix);
        this.dummy.position.y += 0.33 * fragment.scale * shrink;
        this.dummy.scale.setScalar(fragment.scale * shrink);
        this.dummy.updateMatrix();
        this.helmetMesh.setMatrixAt(heads, this.dummy.matrix);
        heads++;
      } else if (fragment.part === "arm") {
        this.armMesh.setMatrixAt(arms++, this.dummy.matrix);
      } else if (fragment.part === "upper") {
        this.upperMesh.setMatrixAt(uppers++, this.dummy.matrix);
      } else {
        this.lowerMesh.setMatrixAt(lowers++, this.dummy.matrix);
      }
    }
    this.headMesh.count = heads;
    this.helmetMesh.count = heads;
    this.armMesh.count = arms;
    this.upperMesh.count = uppers;
    this.lowerMesh.count = lowers;
    if (heads) {
      this.headMesh.instanceMatrix.needsUpdate = true;
      this.helmetMesh.instanceMatrix.needsUpdate = true;
    }
    if (arms) this.armMesh.instanceMatrix.needsUpdate = true;
    if (uppers) this.upperMesh.instanceMatrix.needsUpdate = true;
    if (lowers) this.lowerMesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.fragments.length = 0;
    this.headMesh.count = 0;
    this.helmetMesh.count = 0;
    this.armMesh.count = 0;
    this.upperMesh.count = 0;
    this.lowerMesh.count = 0;
  }

  dispose() {
    for (const mesh of [this.headMesh, this.helmetMesh, this.armMesh, this.upperMesh, this.lowerMesh]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.fragments.length = 0;
  }
}
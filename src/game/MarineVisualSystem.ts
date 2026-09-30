import * as THREE from "three";

export type MarineAction = "idle" | "walk" | "shoot" | "slash" | "kick";

export interface MarinePose {
  x: number;
  z: number;
  angle: number;
  walkPhase: number;
  walkAmount: number;
  impactPulse: number;
  action: MarineAction;
  actionTime: number;
  actionDuration: number;
  swingVariant: number;
  hitTime: number;
  scale: number;
  lift?: number;
  tumble?: number;
}

const MAX_MARINES = 160;

type Part =
  | "body" | "chest" | "waist" | "helmet" | "faceplate" | "visor"
  | "shoulder" | "shoulderTrim" | "backpack" | "packGlow"
  | "upperLeg" | "boot" | "gauntlet" | "gun" | "barrel"
  | "sword" | "swordEdge" | "swordHilt";

const PARTS: Part[] = [
  "body", "chest", "waist", "helmet", "faceplate", "visor",
  "shoulder", "shoulderTrim", "backpack", "packGlow",
  "upperLeg", "boot", "gauntlet", "gun", "barrel",
  "sword", "swordEdge", "swordHilt",
];

export class MarineVisualSystem {
  private scene: THREE.Scene;
  private meshes: Record<Part, THREE.InstancedMesh>;
  private counts: Record<Part, number>;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const makeMesh = (geometry: THREE.BufferGeometry, color: number, doubled = false, glow = false) => {
      const material = glow
        ? new THREE.MeshBasicMaterial({ color, toneMapped: false })
        : new THREE.MeshLambertMaterial({ color, flatShading: true });
      const mesh = new THREE.InstancedMesh(geometry, material, MAX_MARINES * (doubled ? 2 : 1));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };

    this.meshes = {
      body: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x724031),
      chest: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xb54836),
      waist: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x535866),
      helmet: makeMesh(new THREE.DodecahedronGeometry(0.5, 0), 0xb64935),
      faceplate: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x4e5860),
      visor: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xf8db83, false, true),
      shoulder: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xbd4c38, true),
      shoulderTrim: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xd8b77a, true),
      backpack: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x5b5c63),
      packGlow: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xdce9b1, true, true),
      upperLeg: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x555b62, true),
      boot: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x343a43, true),
      gauntlet: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xb6503b, true),
      gun: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0x3b4149),
      barrel: makeMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), 0xe5c881),
      sword: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xc8d8d9),
      swordEdge: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xffdd99, false, true),
      swordHilt: makeMesh(new THREE.BoxGeometry(1, 1, 1), 0xe1b96b),
    };
    this.counts = Object.fromEntries(PARTS.map((part) => [part, 0])) as Record<Part, number>;
  }

  private part(
    name: Part,
    pose: MarinePose,
    localX: number,
    localY: number,
    localZ: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
    pitch = 0,
    roll = 0,
    yaw = 0,
  ) {
    const forwardX = Math.cos(pose.angle + yaw);
    const forwardZ = Math.sin(pose.angle + yaw);
    const sideX = -forwardZ;
    const sideZ = forwardX;
    const scale = pose.scale;
    const lift = pose.lift || 0;
    this.dummy.position.set(
      pose.x + (forwardX * localX + sideX * localZ) * scale,
      lift + localY * scale,
      pose.z + (forwardZ * localX + sideZ * localZ) * scale,
    );
    this.dummy.rotation.set(pitch + (pose.tumble || 0), -(pose.angle + yaw), roll);
    this.dummy.scale.set(sizeX * scale, sizeY * scale, sizeZ * scale);
    this.dummy.updateMatrix();
    this.meshes[name].setMatrixAt(this.counts[name]++, this.dummy.matrix);
  }

  render(poses: readonly MarinePose[]) {
    for (const name of PARTS) this.counts[name] = 0;
    for (let index = 0; index < poses.length && index < MAX_MARINES; index++) {
      const pose = poses[index];
      const walking = pose.walkAmount;
      const step = Math.sin(pose.walkPhase) * walking;
      const stepOther = -step;

      // Heavy Hulkbuster mech weight: deep hydraulic stomp compression on foot contact
      const footStrike = Math.abs(Math.cos(pose.walkPhase));
      const stompDip = walking * (footStrike * 0.12 + pose.impactPulse * 0.18);
      const bodyY = -stompDip;

      // Heavy mech swagger: side-to-side weight transfer roll and lateral shift
      const weightSway = Math.sin(pose.walkPhase) * walking * 0.14;
      const torsoRoll = Math.sin(pose.walkPhase) * walking * 0.13;
      const torsoYaw = -Math.sin(pose.walkPhase) * walking * 0.11;
      const forwardLean = walking * 0.15; // Aggressive forward armored stride

      const progress = pose.actionDuration > 0
        ? Math.max(0, Math.min(1, 1 - pose.actionTime / pose.actionDuration)) : 0;
      const slash = pose.action === "slash" ? Math.sin(progress * Math.PI) : 0;
      const kick = pose.action === "kick" ? Math.sin(progress * Math.PI) : 0;
      const shoot = pose.action === "shoot" ? Math.sin(progress * Math.PI) : 0;

      // Slashing variants: 0=Diagonal Down, 1=Rising Uppercut, 2=Wide Horizontal, 3=Overhead Slam, 4=Whirlwind Spin
      const variant = pose.swingVariant % 5;
      const isSpin = pose.action === "slash" && variant === 4;
      const spinAngle = isSpin ? slash * Math.PI * 2 : 0;

      const stagger = pose.hitTime > 0 ? Math.sin(pose.hitTime * 25) * 0.08 : 0;
      const totalPitch = forwardLean + (variant === 3 ? slash * 0.28 : slash * 0.1) - kick * 0.28;
      const totalRoll = torsoRoll + (variant === 0 ? -slash * 0.22 : variant === 1 ? slash * 0.25 : 0) + stagger;
      const totalYaw = torsoYaw + spinAngle;

      this.part("waist", pose, 0, 0.86 + bodyY, weightSway * 0.5, 0.72, 0.39, 0.72, totalPitch * 0.3, totalRoll * 0.4, totalYaw * 0.4);
      this.part("body", pose, 0, 1.48 + bodyY, weightSway * 0.75, 0.98, 0.94, 0.82, totalPitch, totalRoll, totalYaw);
      this.part("chest", pose, 0.3, 1.66 + bodyY, weightSway * 0.75, 0.48, 0.65, 0.88, totalPitch, totalRoll, totalYaw);
      // Head stays focused forward with counter-compensation for that locked-in mech look
      this.part("helmet", pose, 0.1, 2.25 + bodyY, weightSway * 0.3, 0.8, 0.74, 0.78, totalPitch * 0.35, totalRoll * 0.2, totalYaw * 0.2);
      this.part("faceplate", pose, 0.44, 2.16 + bodyY, weightSway * 0.3, 0.24, 0.36, 0.56, totalPitch * 0.35, totalRoll * 0.2, totalYaw * 0.2);
      this.part("visor", pose, 0.565, 2.27 + bodyY, weightSway * 0.3, 0.07, 0.12, 0.48, totalPitch * 0.35, totalRoll * 0.2, totalYaw * 0.2);
      this.part("backpack", pose, -0.62, 1.52 + bodyY, weightSway * 0.75, 0.5, 0.86, 0.68, totalPitch, totalRoll, totalYaw);
      this.part("packGlow", pose, -0.88, 1.53 + bodyY, weightSway * 0.75 - 0.18, 0.07, 0.44, 0.14, totalPitch, totalRoll, totalYaw);
      this.part("packGlow", pose, -0.88, 1.53 + bodyY, weightSway * 0.75 + 0.18, 0.07, 0.44, 0.14, totalPitch, totalRoll, totalYaw);

      for (const side of [-1, 1]) {
        const gait = side < 0 ? step : stepOther;
        // High mechanical knee lift and stomp
        const footLift = walking * Math.max(0, gait) * 0.28;
        // Wide Hulkbuster power stance
        const legBaseZ = side * (0.34 + Math.abs(weightSway) * 0.06);

        // Right leg does the massive power kick
        const isKickingLeg = side > 0 && kick > 0;
        const legX = gait * 0.32 + (isKickingLeg ? kick * 1.05 : 0);
        const bootY = 0.18 + footLift + (isKickingLeg ? kick * 0.78 : 0);
        const legY = 0.52 + bodyY * 0.45 + footLift * 0.5 + (isKickingLeg ? kick * 0.42 : 0);
        const legPitch = gait * 0.55 + (isKickingLeg ? -kick * 0.75 : 0);

        this.part("upperLeg", pose, legX * 0.6, legY, legBaseZ, 0.38, 0.78, 0.4, 0, legPitch);
        this.part("boot", pose, 0.2 + legX, bootY, legBaseZ, 0.58, 0.33, 0.5, 0, isKickingLeg ? kick * 0.35 : 0);
        this.part("shoulder", pose, 0.02, 1.94 + bodyY, side * 0.78, 0.68, 0.6, 0.68, totalPitch, totalRoll);
        this.part("shoulderTrim", pose, 0.25, 2.01 + bodyY, side * 0.8, 0.14, 0.36, 0.54, totalPitch, totalRoll);

        // Arm swing with heavy gauntlets swaying outward
        const armSwing = (side < 0 ? -step : step) * 0.36;
        let attackSwingX = 0;
        let attackSwingY = 0;
        let attackSwingZ = 0;
        let armRoll = armSwing * 0.75;

        if (side > 0) {
          // Weapon arm (right)
          if (pose.action === "slash") {
            if (variant === 0) { // Diagonal downward executioner cut
              attackSwingX = 0.35 + slash * 0.65;
              attackSwingY = 0.4 - slash * 0.65;
              attackSwingZ = -slash * 0.25;
              armRoll = -0.4 + slash * 1.4;
            } else if (variant === 1) { // Rising cleave
              attackSwingX = 0.25 + slash * 0.55;
              attackSwingY = -0.3 + slash * 0.75;
              attackSwingZ = slash * 0.25;
              armRoll = 0.7 - slash * 1.5;
            } else if (variant === 2) { // Wide horizontal cleave
              attackSwingX = 0.2 + slash * 0.72;
              attackSwingY = 0.15;
              attackSwingZ = 0.3 - slash * 0.6;
              armRoll = slash * 1.6;
            } else if (variant === 3) { // Overhead vertical slam
              attackSwingX = 0.3 + slash * 0.5;
              attackSwingY = 0.6 - slash * 0.9;
              armRoll = 0.2 + slash * 0.5;
            } else { // 360 spin
              attackSwingX = 0.45;
              attackSwingY = 0.2;
              armRoll = slash * Math.PI * 2;
            }
          } else if (pose.action === "kick") {
            // Power fist punches forward during kick
            attackSwingX = kick * 0.65;
            attackSwingY = kick * 0.15;
            armRoll = kick * 0.3;
          } else if (shoot > 0) {
            attackSwingX = shoot * 0.14;
            armRoll = -shoot * 0.25;
          }
        } else {
          // Offhand arm (left) swings back during kick for balance or helps hold blade during slam
          if (pose.action === "kick") {
            attackSwingX = -kick * 0.55;
            attackSwingY = -kick * 0.2;
            armRoll = -kick * 0.6;
          } else if (variant === 3 && pose.action === "slash") {
            // Both hands grip the hilt for overhead slam
            attackSwingX = 0.3 + slash * 0.45;
            attackSwingY = 0.55 - slash * 0.85;
            attackSwingZ = 0.35;
            armRoll = -0.2 - slash * 0.4;
          }
        }

        const armZ = side * 0.78 + attackSwingZ;
        const armX = 0.22 + armSwing + attackSwingX;
        const armY = 1.41 + bodyY + attackSwingY;
        this.part("gauntlet", pose, armX, armY, armZ, 0.4, 0.78, 0.45, 0, armRoll);
      }

      this.part("gun", pose, 0.8 + shoot * 0.12, 1.38 + bodyY - shoot * 0.04, -0.76, 1.22, 0.27, 0.3, 0, -shoot * 0.06);
      this.part("barrel", pose, 1.52 + shoot * 0.12, 1.39 + bodyY, -0.76, 0.2, 0.5, 0.2, 0, Math.PI / 2);

      // Sword poses customized for each slash direction:
      let swordX = 0.55;
      let swordY = 1.25 + bodyY;
      let swordZ = 0.86;
      let swordPitch = 0;
      let swordRoll = -0.22;

      if (pose.action === "slash") {
        if (variant === 0) {
          // Diagonal downward chop (Right shoulder down across to Left hip)
          swordX = 0.45 + slash * 0.85;
          swordY = 1.85 + bodyY - slash * 1.1;
          swordZ = 0.95 - slash * 0.55;
          swordPitch = -0.45 + slash * 1.2;
          swordRoll = 0.85 - slash * 1.95;
        } else if (variant === 1) {
          // Rising cleave (Low sweep launched upward)
          swordX = 0.4 + slash * 0.75;
          swordY = 0.65 + bodyY + slash * 1.25;
          swordZ = 0.65 + slash * 0.35;
          swordPitch = 0.65 - slash * 1.35;
          swordRoll = -1.1 + slash * 2.1;
        } else if (variant === 2) {
          // Wide horizontal sweep (Level 180 cut)
          const angleSweep = -1.25 + slash * 2.5;
          swordX = 0.65 + Math.cos(angleSweep) * 0.7;
          swordY = 1.35 + bodyY + Math.sin(slash * Math.PI) * 0.15;
          swordZ = 0.2 + Math.sin(angleSweep) * 0.8;
          swordPitch = 0.08;
          swordRoll = angleSweep;
        } else if (variant === 3) {
          // Overhead Two-Handed Slam straight into the floor
          swordX = 0.75 + slash * 0.65;
          swordY = 2.25 + bodyY - slash * 1.85;
          swordZ = 0.15;
          swordPitch = 1.25 - slash * 2.45;
          swordRoll = 0.05;
        } else {
          // Whirlwind 360 Spin Cleave
          const angleSpin = slash * Math.PI * 2;
          swordX = Math.cos(angleSpin) * 0.92;
          swordY = 1.38 + bodyY;
          swordZ = Math.sin(angleSpin) * 0.92;
          swordPitch = 0.12;
          swordRoll = angleSpin;
        }
      } else if (pose.action === "kick") {
        swordX = 0.35;
        swordY = 1.55 + bodyY;
        swordZ = 0.95;
        swordRoll = -0.7;
      }

      this.part("sword", pose, swordX, swordY, swordZ, 0.17, 1.35, 0.21, swordPitch, swordRoll);
      this.part("swordEdge", pose, swordX + 0.09, swordY + 0.15, swordZ, 0.065, 1.15, 0.15, swordPitch, swordRoll);
      this.part("swordHilt", pose, swordX, swordY - 0.6, swordZ, 0.44, 0.14, 0.36, swordPitch, swordRoll);
    }
    for (const name of PARTS) {
      const mesh = this.meshes[name];
      mesh.count = this.counts[name];
      if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const name of PARTS) {
      const mesh = this.meshes[name];
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
import * as THREE from "three";
import type { WeatherMode } from "./config";
import { VISUAL_HALF_X, VISUAL_HALF_Z } from "./TrackGenerator";

interface WeatherParticle {
  x: number;
  y: number;
  z: number;
  speed: number;
  drift: number;
  phase: number;
  size: number;
}

interface Ripple {
  x: number;
  z: number;
  age: number;
}

const STORAGE_KEY = "orc-problem-weather-v1";
const SNOW_COUNT = 600;
const RAIN_COUNT = 1100;
const RIPPLE_COUNT = 140;

function loadWeather(): WeatherMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "sunny" || stored === "snow" || stored === "rainyNight") return stored;
  } catch {
    // Weather remains usable without browser storage.
  }
  return "sunny";
}

export class WeatherSystem {
  public mode: WeatherMode = loadWeather();

  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private ambient: THREE.AmbientLight;
  private sun: THREE.DirectionalLight;
  private groundMaterial: THREE.MeshLambertMaterial;
  private snowOverlay: THREE.Mesh;
  private snowMesh: THREE.InstancedMesh;
  private rainMesh: THREE.InstancedMesh;
  private rippleMesh: THREE.InstancedMesh;
  private snow: WeatherParticle[] = [];
  private rain: WeatherParticle[] = [];
  private ripples: Ripple[] = [];
  private dummy = new THREE.Object3D();
  private clock = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    ambient: THREE.AmbientLight,
    sun: THREE.DirectionalLight,
    groundMaterial: THREE.MeshLambertMaterial,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.ambient = ambient;
    this.sun = sun;
    this.groundMaterial = groundMaterial;

    this.snowOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(VISUAL_HALF_X * 2, VISUAL_HALF_Z * 2),
      new THREE.MeshBasicMaterial({ color: 0xe6f2f3, transparent: true, opacity: 0.88, depthWrite: false }),
    );
    this.snowOverlay.rotation.x = -Math.PI / 2;
    this.snowOverlay.position.y = -0.078;
    scene.add(this.snowOverlay);

    this.snowMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.115, 7),
      new THREE.MeshBasicMaterial({ color: 0xf5ffff, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide }),
      SNOW_COUNT,
    );
    this.snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.snowMesh.frustumCulled = false;
    this.snowMesh.count = SNOW_COUNT;
    scene.add(this.snowMesh);

    this.rainMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.018, 0.018, 1, 3),
      new THREE.MeshBasicMaterial({ color: 0x9ac6ef, transparent: true, opacity: 0.58, depthWrite: false }),
      RAIN_COUNT,
    );
    this.rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.count = RAIN_COUNT;
    scene.add(this.rainMesh);

    const rippleGeometry = new THREE.RingGeometry(0.78, 1, 12);
    rippleGeometry.rotateX(-Math.PI / 2);
    this.rippleMesh = new THREE.InstancedMesh(
      rippleGeometry,
      new THREE.MeshBasicMaterial({ color: 0xb8d9ed, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
      RIPPLE_COUNT,
    );
    this.rippleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rippleMesh.frustumCulled = false;
    this.rippleMesh.count = 0;
    scene.add(this.rippleMesh);

    for (let index = 0; index < SNOW_COUNT; index++) {
      this.snow.push({
        x: (Math.random() - 0.5) * (VISUAL_HALF_X * 2 - 4),
        y: 0.7 + Math.random() * 23,
        z: (Math.random() - 0.5) * (VISUAL_HALF_Z * 2 - 4),
        speed: 1.4 + Math.random() * 2.7,
        drift: 0.22 + Math.random() * 0.76,
        phase: Math.random() * Math.PI * 2,
        size: 0.55 + Math.random() * 1.65,
      });
    }
    for (let index = 0; index < RAIN_COUNT; index++) {
      this.rain.push({
        x: (Math.random() - 0.5) * (VISUAL_HALF_X * 2 - 4),
        y: 0.4 + Math.random() * 24,
        z: (Math.random() - 0.5) * (VISUAL_HALF_Z * 2 - 4),
        speed: 26 + Math.random() * 17,
        drift: 2.2 + Math.random() * 1.7,
        phase: Math.random() * Math.PI * 2,
        size: 0.6 + Math.random() * 0.75,
      });
    }
    this.setMode(this.mode, false);
  }

  setMode(mode: WeatherMode, persist = true) {
    this.mode = mode;
    this.snowOverlay.visible = mode === "snow";
    this.snowMesh.visible = mode === "snow";
    this.rainMesh.visible = mode === "rainyNight";
    this.rippleMesh.visible = mode === "rainyNight";

    if (mode === "snow") {
      this.renderer.setClearColor(0xb8d1d7);
      this.ambient.color.setHex(0xe7f5ff);
      this.ambient.intensity = 2.13;
      this.sun.color.setHex(0xd6edff);
      this.sun.intensity = 1.17;
      this.groundMaterial.color.setHex(0xe5f3ec);
    } else if (mode === "rainyNight") {
      this.renderer.setClearColor(0x182c39);
      this.ambient.color.setHex(0x9ab8d9);
      this.ambient.intensity = 0.92;
      this.sun.color.setHex(0x8db6d6);
      this.sun.intensity = 0.65;
      this.groundMaterial.color.setHex(0x536b86);
    } else {
      this.renderer.setClearColor(0x57804a);
      this.ambient.color.setHex(0xfff3d2);
      this.ambient.intensity = 1.8;
      this.sun.color.setHex(0xffe4ad);
      this.sun.intensity = 1.55;
      this.groundMaterial.color.setHex(0xffffff);
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // A selected weather mode still works for the current session.
      }
    }
  }

  update(dt: number) {
    if (this.mode === "sunny") return;
    this.clock += dt;
    if (this.mode === "snow") {
      for (let index = 0; index < this.snow.length; index++) {
        const particle = this.snow[index];
        particle.y -= particle.speed * dt;
        particle.x += (particle.drift + Math.sin(this.clock * 0.7 + particle.phase) * 0.45) * dt;
        particle.z += Math.cos(this.clock * 0.5 + particle.phase) * dt * 0.28;
        if (particle.y < 0.15) {
          particle.y = 22 + Math.random() * 4;
          particle.x = (Math.random() - 0.5) * (VISUAL_HALF_X * 2 - 4);
          particle.z = (Math.random() - 0.5) * (VISUAL_HALF_Z * 2 - 4);
        }
        if (particle.x > VISUAL_HALF_X - 1) particle.x = -VISUAL_HALF_X + 1;
        this.dummy.position.set(particle.x, particle.y, particle.z);
        this.dummy.quaternion.copy(this.camera.quaternion);
        this.dummy.scale.setScalar(particle.size);
        this.dummy.updateMatrix();
        this.snowMesh.setMatrixAt(index, this.dummy.matrix);
      }
      this.snowMesh.instanceMatrix.needsUpdate = true;
      return;
    }

    for (let index = 0; index < this.rain.length; index++) {
      const particle = this.rain[index];
      particle.x += particle.drift * dt;
      particle.y -= particle.speed * dt;
      if (particle.y < 0.13) {
        if (this.ripples.length < RIPPLE_COUNT && index % 8 === 0) {
          this.ripples.push({ x: particle.x, z: particle.z, age: 0 });
        }
        particle.x = (Math.random() - 0.5) * (VISUAL_HALF_X * 2 - 4);
        particle.y = 21 + Math.random() * 8;
        particle.z = (Math.random() - 0.5) * (VISUAL_HALF_Z * 2 - 4);
      }
      if (particle.x > VISUAL_HALF_X - 1) particle.x = -VISUAL_HALF_X + 1;
      this.dummy.position.set(particle.x, particle.y, particle.z);
      this.dummy.rotation.set(0, 0, -0.12);
      this.dummy.scale.set(particle.size, particle.size, particle.size);
      this.dummy.updateMatrix();
      this.rainMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.rainMesh.instanceMatrix.needsUpdate = true;

    let visible = 0;
    for (const ripple of this.ripples) {
      ripple.age += dt;
      if (ripple.age >= 0.46) continue;
      this.ripples[visible] = ripple;
      this.dummy.position.set(ripple.x, 0.07, ripple.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.08 + ripple.age * 0.83);
      this.dummy.updateMatrix();
      this.rippleMesh.setMatrixAt(visible, this.dummy.matrix);
      visible++;
    }
    this.ripples.length = visible;
    this.rippleMesh.count = visible;
    if (visible) this.rippleMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of [this.snowOverlay, this.snowMesh, this.rainMesh, this.rippleMesh]) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.snow.length = 0;
    this.rain.length = 0;
    this.ripples.length = 0;
  }
}
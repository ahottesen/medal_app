import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildResult, ColorSlot, MedalElement } from '../model/types';

export type ViewPreset = 'angle' | 'top' | 'bottom' | 'side';

export interface ViewerHandle {
  setView: (v: ViewPreset) => void;
  screenshot: () => string;
}

interface Props {
  result: BuildResult | null;
  colors: ColorSlot[];
  elements: MedalElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  showPlate: boolean;
}

/** Delt uniform: [lav z, høy z] for høydeskyggelegging av relieffet. */
const reliefZ = { value: new THREE.Vector2(0, 4) };

function materialFor(c: ColorSlot | undefined): THREE.MeshStandardMaterial {
  const color = new THREE.Color(c?.hex ?? '#cccccc');
  const finish = c?.finish ?? 'matte';
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: finish === 'metal' ? 0.72 : finish === 'silk' ? 0.3 : 0.0,
    roughness: finish === 'metal' ? 0.36 : finish === 'silk' ? 0.3 : 0.68,
    envMapIntensity: finish === 'matte' ? 0.7 : 1.0,
  });
  // Gjør lavere flater litt mørkere, så relieffet er lett å lese (bare i visningen)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReliefZ = reliefZ;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vReliefZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReliefZ = (modelMatrix * vec4(transformed, 1.0)).z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vReliefZ;\nuniform vec2 uReliefZ;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat reliefT = clamp((vReliefZ - uReliefZ.x) / max(0.001, uReliefZ.y - uReliefZ.x), 0.0, 1.0);\ndiffuseColor.rgb *= mix(0.62, 1.0, reliefT);',
      );
  };
  return mat;
}

export const Viewer = forwardRef<ViewerHandle, Props>(function Viewer(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
    plate: THREE.Group;
    selBox: THREE.LineLoop;
    key: THREE.DirectionalLight;
    plateWanted: boolean;
    reliefRange: THREE.Vector2;
    radius: number;
    fitted: boolean;
    render: () => void;
  } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // oppsett
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1b1d22');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.42;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -110, 120);

    // lys fra skrått over venstre gir tydelig relieff (som et lys over skrivebordet)
    const key = new THREE.DirectionalLight('#fff6e8', 2.4);
    key.position.set(-80, 70, 62);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 2;
    scene.add(key);
    scene.add(key.target);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.55);
    fill.position.set(90, -70, 50);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 0.5);
    rim.position.set(0, 120, -40);
    scene.add(rim);
    scene.add(new THREE.AmbientLight('#ffffff', 0.12));
    // lys nedenfra, brukes bare når vi ser på baksiden
    const under = new THREE.DirectionalLight('#ffffff', 0);
    under.position.set(-60, 50, -120);
    scene.add(under);

    const group = new THREE.Group();
    scene.add(group);

    const plate = new THREE.Group();
    const grid = new THREE.GridHelper(200, 20, '#3a3f4b', '#2a2e37');
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.02;
    plate.add(grid);
    const fine = new THREE.GridHelper(200, 200, '#23262e', '#23262e');
    fine.rotation.x = Math.PI / 2;
    fine.position.z = -0.03;
    plate.add(fine);
    scene.add(plate);

    const selGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const selBox = new THREE.LineLoop(selGeom, new THREE.LineDashedMaterial({ color: '#4fc3ff', dashSize: 1.2, gapSize: 0.8, depthTest: false }));
    selBox.renderOrder = 10;
    selBox.visible = false;
    scene.add(selBox);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.target.set(0, 0, 2);
    controls.minDistance = 10;
    controls.maxDistance = 1200;

    let raf = 0;
    let needs = true;
    const render = () => {
      needs = true;
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const moved = controls.update();
      if (moved || needs) {
        const st = state.current;
        const below = camera.position.z < controls.target.z;
        if (st) {
          plate.visible = st.plateWanted && !below;
          if (below) reliefZ.value.set(-1000, -999);
          else reliefZ.value.copy(st.reliefRange);
        }
        under.intensity = below ? 1.6 : 0;
        renderer.render(scene, camera);
        needs = false;
      }
    };
    controls.addEventListener('change', render);
    loop();

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    state.current = {
      renderer,
      scene,
      camera,
      controls,
      group,
      plate,
      selBox,
      key,
      plateWanted: true,
      reliefRange: new THREE.Vector2(0, 4),
      radius: 40,
      fitted: false,
      render,
    };

    // --- dra elementer ---
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const planePoint = (ev: PointerEvent): THREE.Vector3 | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const z = propsRef.current.result?.faceZ ?? 0;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(plane, p) ? p : null;
    };
    let drag: { id: string; sx: number; sy: number; ex: number; ey: number; moved: boolean } | null = null;
    let down: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY };
      const p = planePoint(ev);
      const { result, elements } = propsRef.current;
      if (!p || !result) return;
      // bak-siden er speilet; vi tar bare forsideelementer når vi ser ovenfra
      const viewingTop = camera.position.z > (controls.target.z ?? 0);
      let best: { id: string; area: number } | null = null;
      for (const el of elements) {
        if (!el.visible) continue;
        if ((el.side === 'back') === viewingTop) continue;
        const b = result.elementBounds[el.id];
        if (!b) continue;
        if (p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3]) {
          const area = (b[2] - b[0]) * (b[3] - b[1]);
          if (!best || area < best.area) best = { id: el.id, area };
        }
      }
      if (best) {
        const el = elements.find((e) => e.id === best!.id)!;
        if (el.side === 'back') return; // bakside: bare valg, ikke dra
        drag = { id: el.id, sx: p.x, sy: p.y, ex: el.x, ey: el.y, moved: false };
        controls.enabled = false;
        renderer.domElement.setPointerCapture(ev.pointerId);
        propsRef.current.onSelect(el.id);
      }
    };
    const onMoveEv = (ev: PointerEvent) => {
      if (!drag) return;
      const p = planePoint(ev);
      if (!p) return;
      const dx = p.x - drag.sx;
      const dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 0.3) return;
      drag.moved = true;
      const snap = ev.shiftKey ? 1 : 0.1;
      const nx = Math.round((drag.ex + dx) / snap) * snap;
      const ny = Math.round((drag.ey + dy) / snap) * snap;
      propsRef.current.onMove(drag.id, +nx.toFixed(2), +ny.toFixed(2));
    };
    const onUp = (ev: PointerEvent) => {
      if (drag) {
        controls.enabled = true;
        try {
          renderer.domElement.releasePointerCapture(ev.pointerId);
        } catch {
          /* */
        }
        drag = null;
      } else if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) {
        // klikk i tomrom: velg element under (også bakside) eller fjern valg
        const p = planePoint(ev);
        const { result, elements } = propsRef.current;
        let hit: string | null = null;
        if (p && result) {
          let bestA = Infinity;
          for (const el of elements) {
            const b = result.elementBounds[el.id];
            if (!b || !el.visible) continue;
            if (p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3]) {
              const a = (b[2] - b[0]) * (b[3] - b[1]);
              if (a < bestA) {
                bestA = a;
                hit = el.id;
              }
            }
          }
        }
        propsRef.current.onSelect(hit);
      }
      down = null;
    };
    renderer.domElement.addEventListener('pointerdown', onDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onMoveEv);
    renderer.domElement.addEventListener('pointerup', onUp);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      pmrem.dispose();
      host.removeChild(renderer.domElement);
      state.current = null;
    };
  }, []);

  // oppdater meshes
  useEffect(() => {
    const s = state.current;
    if (!s || !props.result) return;
    const { group } = s;
    for (const child of [...group.children]) {
      group.remove(child);
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }
    const box = new THREE.Box3();
    for (const p of props.result.parts) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
      g.setIndex(new THREE.BufferAttribute(p.indices, 1));
      const creased = toCreasedNormals(g, (35 * Math.PI) / 180);
      g.dispose();
      const mesh = new THREE.Mesh(creased, materialFor(props.colors.find((c) => c.id === p.colorId)));
      mesh.userData.colorId = p.colorId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      creased.computeBoundingBox();
      box.union(creased.boundingBox!);
    }
    if (!box.isEmpty()) {
      s.reliefRange.set(props.result.faceZ - 1.2, Math.max(box.max.z, props.result.faceZ + 0.2));
      const size = box.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.y) / 2;
      const changed = Math.abs(r - s.radius) / s.radius > 0.35;
      s.radius = r;
      // tilpass skyggekameraet til modellen
      const c0 = box.getCenter(new THREE.Vector3());
      const sc = s.key.shadow.camera;
      const ext = r * 1.25 + 2;
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.near = 1;
      sc.far = 400;
      s.key.target.position.copy(c0);
      s.key.position.copy(c0).add(new THREE.Vector3(-80, 70, 62).normalize().multiplyScalar(150));
      sc.updateProjectionMatrix();
      if (!s.fitted || changed) {
        s.fitted = true;
        const center = box.getCenter(new THREE.Vector3());
        s.controls.target.set(center.x, center.y, 1);
        const dist = r * 3.4;
        s.camera.position.set(center.x, center.y - dist * 0.62, dist * 0.78);
        s.controls.update();
      }
    }
    s.render();
  }, [props.result]);

  // farger
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const child of s.group.children) {
      const m = child as THREE.Mesh;
      const c = props.colors.find((x) => x.id === m.userData.colorId);
      (m.material as THREE.Material).dispose();
      m.material = materialFor(c);
    }
    s.render();
  }, [props.colors]);

  // markering av valgt element
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const b = props.selectedId ? props.result?.elementBounds[props.selectedId] : undefined;
    if (!b || !props.result) {
      s.selBox.visible = false;
    } else {
      const z = props.result.size[2] + 0.3;
      const pad = 0.6;
      const pts = [
        new THREE.Vector3(b[0] - pad, b[1] - pad, z),
        new THREE.Vector3(b[2] + pad, b[1] - pad, z),
        new THREE.Vector3(b[2] + pad, b[3] + pad, z),
        new THREE.Vector3(b[0] - pad, b[3] + pad, z),
      ];
      s.selBox.geometry.setFromPoints(pts);
      s.selBox.computeLineDistances();
      s.selBox.visible = true;
    }
    s.render();
  }, [props.selectedId, props.result]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.plateWanted = props.showPlate;
    s.render();
  }, [props.showPlate]);

  useImperativeHandle(ref, () => ({
    setView(v) {
      const s = state.current;
      if (!s) return;
      const d = s.radius * 3.4;
      const t = s.controls.target;
      if (v === 'top') s.camera.position.set(t.x, t.y - 0.001, t.z + d);
      else if (v === 'bottom') s.camera.position.set(t.x, t.y + 0.001, t.z - d);
      else if (v === 'side') s.camera.position.set(t.x, t.y - d, t.z + d * 0.12);
      else s.camera.position.set(t.x, t.y - d * 0.62, t.z + d * 0.78);
      s.controls.update();
      s.render();
    },
    screenshot() {
      const s = state.current;
      if (!s) return '';
      const sel = s.selBox.visible;
      s.plate.visible = false;
      s.selBox.visible = false;
      s.renderer.render(s.scene, s.camera);
      const url = s.renderer.domElement.toDataURL('image/png');
      s.selBox.visible = sel;
      s.render();
      return url;
    },
  }));

  return <div className="viewer" ref={hostRef} />;
});

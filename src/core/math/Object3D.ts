import { Euler } from "./Euler.js";
import { EventDispatcher } from "./EventDispatcher.js";
import { Layers } from "./Layers.js";
import * as MathUtils from "./MathUtils.js";
import { Matrix3 } from "./Matrix3.js";
import { Matrix4 } from "./Matrix4.js";
import { Quaternion } from "./Quaternion.js";
import { Vector3 } from "./Vector3.js";

const DefaultUp = /*@__PURE__*/ new Vector3(0, 1, 0);
const DefaultMatrixAutoUpdate = true;
const DefaultMatrixWorldAutoUpdate = true;

let _object3DId = 0;
const _v1 = /*@__PURE__*/ new Vector3();
const _q1 = /*@__PURE__*/ new Quaternion();
const _m1 = /*@__PURE__*/ new Matrix4();
const _target = /*@__PURE__*/ new Vector3();

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _position = /*@__PURE__*/ new Vector3();
const _scale = /*@__PURE__*/ new Vector3();
const _quaternion = /*@__PURE__*/ new Quaternion();
const _xAxis = /*@__PURE__*/ new Vector3(1, 0, 0);
const _yAxis = /*@__PURE__*/ new Vector3(0, 1, 0);
const _zAxis = /*@__PURE__*/ new Vector3(0, 0, 1);
const _addedEvent = { type: "added" };
const _removedEvent = { type: "removed" };

class Object3D extends EventDispatcher {
  isObject3D = true;
  id: number;
  uuid: string;
  name: string;
  type: string;
  parent: Object3D | null;
  children: Object3D[];
  up: Vector3;
  position: Vector3;
  rotation: Euler;
  quaternion: Quaternion;
  scale: Vector3;
  modelViewMatrix: Matrix4;
  normalMatrix: Matrix3;
  matrix: Matrix4;
  matrixWorld: Matrix4;
  matrixAutoUpdate: boolean;
  matrixWorldNeedsUpdate: boolean;
  matrixWorldAutoUpdate: boolean;
  layers: Layers;
  visible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  frustumCulled: boolean;
  renderOrder: number;
  animations: any[];
  userData: any;
  instanceColor: any;
  isCamera: any;
  isLight: any;
  isInstancedMesh: any;
  count: any;
  instanceMatrix: any;
  isScene: any;
  background: any;
  environment: any;
  bindMode: any;
  bindMatrix: any;
  skeleton: undefined;

  constructor() {
    super();
    this.id = _object3DId++;
    this.uuid = MathUtils.generateUUID();
    this.name = "";
    this.type = "Object3D";
    this.parent = null;
    this.children = [];
    this.up = DefaultUp.clone();
    this.position = new Vector3();
    this.rotation = new Euler();
    this.quaternion = new Quaternion();
    this.scale = new Vector3(1, 1, 1);
    this.modelViewMatrix = new Matrix4();
    this.normalMatrix = new Matrix3();
    this.matrix = new Matrix4();
    this.matrixWorld = new Matrix4();
    this.matrixAutoUpdate = DefaultMatrixAutoUpdate;
    this.matrixWorldNeedsUpdate = false;
    this.matrixWorldAutoUpdate = DefaultMatrixWorldAutoUpdate;
    this.layers = new Layers();
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.animations = [];
    this.userData = {};
  }

  onBeforeRender /* renderer, scene, camera, geometry, material, group */() {}

  onAfterRender /* renderer, scene, camera, geometry, material, group */() {}

  applyMatrix4(matrix: Matrix4) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    this.matrix.premultiply(matrix);
    this.matrix.decompose(this.position, this.quaternion, this.scale);
  }

  applyQuaternion(q: Quaternion) {
    this.quaternion.premultiply(q);
    return this;
  }

  setRotationFromAxisAngle(axis: Vector3, angle: number) {
    // assumes axis is normalized
    this.quaternion.setFromAxisAngle(axis, angle);
  }

  setRotationFromEuler(euler: Euler) {
    this.quaternion.setFromEuler(euler, true);
  }

  setRotationFromMatrix(m: Matrix4) {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
    this.quaternion.setFromRotationMatrix(m);
  }

  setRotationFromQuaternion(q: Quaternion) {
    // assumes q is normalized
    this.quaternion.copy(q);
  }

  rotateOnAxis(axis: Vector3, angle: number) {
    // rotate object on axis in object space
    // axis is assumed to be normalized
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.multiply(_q1);
    return this;
  }

  rotateOnWorldAxis(axis: Vector3, angle: number) {
    // rotate object on axis in world space
    // axis is assumed to be normalized
    // method assumes no rotated parent
    _q1.setFromAxisAngle(axis, angle);
    this.quaternion.premultiply(_q1);
    return this;
  }

  rotateX(angle: number) {
    return this.rotateOnAxis(_xAxis, angle);
  }

  rotateY(angle: number) {
    return this.rotateOnAxis(_yAxis, angle);
  }

  rotateZ(angle: number) {
    return this.rotateOnAxis(_zAxis, angle);
  }

  translateOnAxis(axis: Vector3, distance: number) {
    // translate object by distance along axis in object space
    // axis is assumed to be normalized
    _v1.copy(axis).applyQuaternion(this.quaternion);
    this.position.add(_v1.multiplyScalar(distance));
    return this;
  }

  translateX(distance: number) {
    return this.translateOnAxis(_xAxis, distance);
  }

  translateY(distance: number) {
    return this.translateOnAxis(_yAxis, distance);
  }

  translateZ(distance: number) {
    return this.translateOnAxis(_zAxis, distance);
  }

  localToWorld(vector: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(this.matrixWorld);
  }

  worldToLocal(vector: Vector3): Vector3 {
    this.updateWorldMatrix(true, false);
    return vector.applyMatrix4(_m1.copy(this.matrixWorld).invert());
  }

  /**
   * Rotates to face a point in world space.
   */
  lookAt(target: Vector3) {
    const EPSILON = 1e-6;
    const z = _a.copy(this.position).sub(target);

    // eye and target are in the same position
    if (z.len() === 0) z.z = 1;
    else z.normalize();

    const x = _b.copy(this.up).cross(z);

    // up and z are parallel
    if (x.len() === 0) {
      const pup = _c.copy(this.up);

      if (pup.z) pup.x += EPSILON;
      else if (pup.y) pup.z += EPSILON;
      else pup.y += EPSILON;

      x.cross(pup);
    }
    x.normalize();

    const y = _c.copy(z).cross(x);

    const [sm11, sm12, sm13] = x;
    const [sm21, sm22, sm23] = y;
    const [sm31, sm32, sm33] = z;

    const trace = sm11 + sm22 + sm33;

    if (trace > 0) {
      const S = Math.sqrt(trace + 1) * 2;
      this.quaternion.set((sm23 - sm32) / S, (sm31 - sm13) / S, (sm12 - sm21) / S, S / 4);
    } else if (sm11 > sm22 && sm11 > sm33) {
      const S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
      this.quaternion.set(S / 4, (sm12 + sm21) / S, (sm31 + sm13) / S, (sm23 - sm32) / S);
    } else if (sm22 > sm33) {
      const S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
      this.quaternion.set((sm12 + sm21) / S, S / 4, (sm23 + sm32) / S, (sm31 - sm13) / S);
    } else {
      const S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
      this.quaternion.set((sm31 + sm13) / S, (sm23 + sm32) / S, S / 4, (sm12 - sm21) / S);
    }
  }

  add(object: Object3D | Object3D[]): this {
    if (Array.isArray(object)) {
      for (let i = 0; i < object.length; i++) {
        this.add(object[i]);
      }
      return this;
    }

    if (object === this) {
      console.error("THREE.Object3D.add: object can't be added as a child of itself.", object);
      return this;
    }

    if (object && object.isObject3D) {
      if (object.parent !== null) {
        object.parent.remove(object);
      }
      object.parent = this;
      this.children.push(object);
    } else {
      console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.", object);
    }

    return this;
  }
  dispatchEvent(_addedEvent: { type: string }) {
    throw new Error("Method not implemented.");
  }

  remove(object: Object3D | Object3D[]): this {
    if (Array.isArray(object)) {
      for (let i = 0; i < object.length; i++) {
        this.remove(object[i]);
      }
      return this;
    }

    const index = this.children.indexOf(object);

    if (index !== -1) {
      object.parent = null;
      this.children.splice(index, 1);
      object.dispatchEvent(_removedEvent);
    }

    return this;
  }

  removeFromParent(): this {
    const parent = this.parent;

    if (parent !== null) {
      parent.remove(this);
    }

    return this;
  }

  clear(): this {
    for (let i = 0; i < this.children.length; i++) {
      const object = this.children[i];

      object.parent = null;
      object.dispatchEvent(_removedEvent);
    }

    this.children.length = 0;

    return this;
  }

  attach(object: Object3D): this {
    this.updateWorldMatrix(true, false);
    _m1.copy(this.matrixWorld).invert();

    if (object.parent !== null) {
      object.parent.updateWorldMatrix(true, false);
      _m1.multiply(object.parent.matrixWorld);
    }

    object.applyMatrix4(_m1);
    this.add(object);
    object.updateWorldMatrix(false, true);

    return this;
  }

  getObjectById(id: number): Object3D | undefined {
    return this.getObjectByProperty("id", id);
  }

  getObjectByName(name: string): Object3D | undefined {
    return this.getObjectByProperty("name", name);
  }

  getObjectByProperty(name: string, value: any): Object3D | undefined {
    for (let i = 0, l = this.children.length; i < l; i++) {
      const child = this.children[i];
      const object = child.getObjectByProperty(name, value);

      if (object !== undefined) {
        return object;
      }
    }

    return undefined;
  }

  getObjectsByProperty(name: string, value: any): Object3D[] {
    let result: Object3D[] = [];

    for (let i = 0, l = this.children.length; i < l; i++) {
      const childResult = this.children[i].getObjectsByProperty(name, value);

      if (childResult.length > 0) {
        result = result.concat(childResult);
      }
    }

    return result;
  }

  getWorldPosition(target: any): any {
    this.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.matrixWorld);
  }

  getWorldQuaternion(target: any): any {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position, target, _scale);
    return target;
  }

  getWorldScale(target: any): any {
    this.updateWorldMatrix(true, false);
    this.matrixWorld.decompose(_position, _quaternion, target);
    return target;
  }

  getWorldDirection(target: any): any {
    this.updateWorldMatrix(true, false);
    const e = this.matrixWorld.elements;
    return target.set(e[8], e[9], e[10]).normalize();
  }

  raycast(/* raycaster, intersects */): void {}

  traverse(callback: any): void {
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverse(callback);
    }
  }

  traverseVisible(callback: any): void {
    if (this.visible === false) return;
    callback(this);
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      children[i].traverseVisible(callback);
    }
  }

  traverseAncestors(callback: any): void {
    const parent = this.parent;
    if (parent !== null) {
      callback(parent);
      parent.traverseAncestors(callback);
    }
  }

  updateMatrix(): void {
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.matrixWorldNeedsUpdate = true;
  }

  updateMatrixWorld(force: boolean = false): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    // update children
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (child.matrixWorldAutoUpdate === true || force === true) {
        child.updateMatrixWorld(force);
      }
    }
  }

  updateWorldMatrix(updateParents: boolean = false, updateChildren: boolean = false): void {
    const parent = this.parent;
    if (updateParents === true && parent !== null && parent.matrixWorldAutoUpdate === true) {
      parent.updateWorldMatrix(true, false);
    }
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.parent === null) {
      this.matrixWorld.copy(this.matrix);
    } else {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    // update children
    if (updateChildren === true) {
      const children = this.children;
      for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        if (child.matrixWorldAutoUpdate === true) {
          child.updateWorldMatrix(false, true);
        }
      }
    }
  }

  clone(recursive: boolean = false) {
    return new Object3D().copy(this, recursive);
  }

  copy(source: Object3D, recursive = true) {
    this.name = source.name;

    this.up.copy(source.up);

    this.position.copy(source.position);
    this.rotation.order = source.rotation.order;
    this.quaternion.copy(source.quaternion);
    this.scale.copy(source.scale);

    this.matrix.copy(source.matrix);
    this.matrixWorld.copy(source.matrixWorld);

    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;

    this.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;

    this.layers.mask = source.layers.mask;
    this.visible = source.visible;

    this.castShadow = source.castShadow;
    this.receiveShadow = source.receiveShadow;

    this.frustumCulled = source.frustumCulled;
    this.renderOrder = source.renderOrder;

    this.userData = JSON.parse(JSON.stringify(source.userData));

    if (recursive === true) {
      for (let i = 0; i < source.children.length; i++) {
        const child = source.children[i];
        this.add(child.clone());
      }
    }

    return this;
  }
}
export { Object3D };

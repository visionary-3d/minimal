import { Box3 } from "./Box3.js";
import { Matrix4 } from "./Matrix4.js";
import { Plane } from "./Plane.js";
import { Vector3 } from "./Vector3.js";

const _box: Box3 = /*@__PURE__*/ new Box3();
const _v1: Vector3 = /*@__PURE__*/ new Vector3();
const _v2: Vector3 = /*@__PURE__*/ new Vector3();

class Sphere {
  center: Vector3;
  radius: number;

  constructor(center: Vector3 = new Vector3(), radius: number = -1) {
    this.center = center;
    this.radius = radius;
  }

  set(center: Vector3, radius: number): Sphere {
    this.center.copy(center);
    this.radius = radius;

    return this;
  }

  setFromPoints(points: Vector3[], optionalCenter?: Vector3): Sphere {
    const center = this.center;

    if (optionalCenter !== undefined) {
      center.copy(optionalCenter);
    } else {
      _box.setFromPoints(points).getCenter(center);
    }

    let maxRadiusSq = 0;

    for (let i = 0, il = points.length; i < il; i++) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]));
    }

    this.radius = Math.sqrt(maxRadiusSq);

    return this;
  }

  copy(sphere: Sphere): Sphere {
    this.center.copy(sphere.center);
    this.radius = sphere.radius;

    return this;
  }

  isEmpty(): boolean {
    return this.radius < 0;
  }

  makeEmpty(): Sphere {
    this.center.set(0, 0, 0);
    this.radius = -1;

    return this;
  }

  containsPoint(point: Vector3): boolean {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  distanceToPoint(point: Vector3): number {
    return point.distanceTo(this.center) - this.radius;
  }

  intersectsSphere(sphere: Sphere): boolean {
    const radiusSum = this.radius + sphere.radius;

    return sphere.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsSphere(this);
  }

  intersectsPlane(plane: Plane): boolean {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }

  clampPoint(point: Vector3, target: Vector3): Vector3 {
    const deltaLengthSq = this.center.distanceToSquared(point);

    target.copy(point);

    if (deltaLengthSq > this.radius * this.radius) {
      target.sub(this.center).normalize();
      target.multiplyScalar(this.radius).add(this.center);
    }

    return target;
  }

  expandByScalar(scalar: number) {
    this.radius += scalar;
    return this;
  }

  getMaxScaleOnAxis() {
    return Math.max(Math.abs(this.center.x), Math.abs(this.center.y), Math.abs(this.center.z));
  }

  applyMatrix4(matrix: Matrix4) {
    this.center.applyMatrix4(matrix);
    this.radius *= this.getMaxScaleOnAxis();
    return this;
  }

  translate(offset: Vector3) {
    this.center.add(offset);
    return this;
  }

  expandByPoint(point: Vector3) {
    if (this.isEmpty()) {
      this.center.copy(point);
      this.radius = 0;
      return this;
    }

    const v1 = new Vector3();
    v1.subVectors(point, this.center);
    const lengthSq = v1.lengthSq();

    if (lengthSq > this.radius * this.radius) {
      const length = Math.sqrt(lengthSq);
      const delta = (length - this.radius) * 0.5;
      this.center.addScaledVector(v1, delta / length);
      this.radius += delta;
    }

    return this;
  }

  union(sphere: Sphere) {
    if (sphere.isEmpty()) {
      return this;
    }

    if (this.isEmpty()) {
      this.copy(sphere);
      return this;
    }

    const v1 = new Vector3();
    const v2 = new Vector3();
    if (this.center.equals(sphere.center)) {
      this.radius = Math.max(this.radius, sphere.radius);
    } else {
      v2.subVectors(sphere.center, this.center).setLength(sphere.radius);
      this.expandByPoint(v1.copy(sphere.center).add(v2));
      this.expandByPoint(v1.copy(sphere.center).sub(v2));
    }

    return this;
  }

  equals(sphere: { center: { equals: (arg0: Vector3) => any }; radius: number }) {
    return sphere.center.equals(this.center) && sphere.radius === this.radius;
  }

  clone() {
    return new Sphere().copy(this);
  }
}

export { Sphere };

import { Matrix4 } from "./Matrix4.js";
import { Object3D } from "./Object3D.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

class Box3 {
  public isBox3: boolean;
  public min: Vector3;
  public max: Vector3;

  constructor(
    min: Vector3 = new Vector3(+Infinity, +Infinity, +Infinity),
    max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity)
  ) {
    this.isBox3 = true;
    this.min = min;
    this.max = max;
  }

  public set(min: Vector3, max: Vector3): Box3 {
    this.min.copy(min);
    this.max.copy(max);
    return this;
  }

  public setFromArray(array: number[]): Box3 {
    let minX = +Infinity;
    let minY = +Infinity;
    let minZ = +Infinity;

    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0, l = array.length; i < l; i += 3) {
      const x = array[i];
      const y = array[i + 1];
      const z = array[i + 2];

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;

      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);

    return this;
  }

  public setFromBufferAttribute(attribute: any): Box3 {
    let minX = +Infinity;
    let minY = +Infinity;
    let minZ = +Infinity;

    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (let i = 0, l = attribute.count; i < l; i++) {
      const x = attribute.getX(i);
      const y = attribute.getY(i);
      const z = attribute.getZ(i);

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;

      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);

    return this;
  }

  public setFromPoints(points: Vector3[]): Box3 {
    this.makeEmpty();

    for (let i = 0, il = points.length; i < il; i++) {
      this.expandByPoint(points[i]);
    }

    return this;
  }

  public setFromCenterAndSize(center: Vector3, size: Vector3): Box3 {
    const halfSize = size.clone().multiplyScalar(0.5);

    this.min.copy(center).sub(halfSize);
    this.max.copy(center).add(halfSize);

    return this;
  }

  clone(): Box3 {
    return new Box3().copy(this);
  }

  copy(box: Box3): this {
    this.min.copy(box.min);
    this.max.copy(box.max);
    return this;
  }

  makeEmpty(): this {
    this.min.x = this.min.y = this.min.z = +Infinity;
    this.max.x = this.max.y = this.max.z = -Infinity;
    return this;
  }

  isEmpty(): boolean {
    return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
  }

  getCenter(target: Vector3): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
  }

  getSize(target: Vector3): Vector3 {
    return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
  }

  expandByPoint(point: Vector3): this {
    this.min.min(point);
    this.max.max(point);
    return this;
  }

  expandByVector(vector: Vector3): this {
    this.min.sub(vector);
    this.max.add(vector);
    return this;
  }

  expandByScalar(scalar: number): this {
    this.min.addScalar(-scalar);
    this.max.addScalar(scalar);
    return this;
  }

  containsPoint(point: Vector3): boolean {
    return point.x < this.min.x ||
      point.x > this.max.x ||
      point.y < this.min.y ||
      point.y > this.max.y ||
      point.z < this.min.z ||
      point.z > this.max.z
      ? false
      : true;
  }

  containsBox(box: Box3): boolean {
    return (
      this.min.x <= box.min.x &&
      box.max.x <= this.max.x &&
      this.min.y <= box.min.y &&
      box.max.y <= this.max.y &&
      this.min.z <= box.min.z &&
      box.max.z <= this.max.z
    );
  }

  getParameter(point: Vector3, target: Vector3): Vector3 {
    return target.set(
      (point.x - this.min.x) / (this.max.x - this.min.x),
      (point.y - this.min.y) / (this.max.y - this.min.y),
      (point.z - this.min.z) / (this.max.z - this.min.z)
    );
  }

  intersectsBox(box: Box3): boolean {
    return box.max.x < this.min.x ||
      box.min.x > this.max.x ||
      box.max.y < this.min.y ||
      box.min.y > this.max.y ||
      box.max.z < this.min.z ||
      box.min.z > this.max.z
      ? false
      : true;
  }

  intersectsSphere(sphere: Sphere): boolean {
    this.clampPoint(sphere.center, _vector);
    return _vector.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  intersectsPlane(plane: Plane): boolean {
    let min, max;
    if (plane.normal.x > 0) {
      min = plane.normal.x * this.min.x;
      max = plane.normal.x * this.max.x;
    } else {
      min = plane.normal.x * this.max.x;
      max = plane.normal.x * this.min.x;
    }
    if (plane.normal.y > 0) {
      min += plane.normal.y * this.min.y;
      max += plane.normal.y * this.max.y;
    } else {
      min += plane.normal.y * this.max.y;
      max += plane.normal.y * this.min.y;
    }
    if (plane.normal.z > 0) {
      min += plane.normal.z * this.min.z;
      max += plane.normal.z * this.max.z;
    } else {
      min += plane.normal.z * this.max.z;
      max += plane.normal.z * this.min.z;
    }
    return min <= -plane.constant && max >= -plane.constant;
  }

  clampPoint(point: Vector3, target: Vector3): Vector3 {
    return target.copy(point).clamp(this.min, this.max);
  }

  distanceToPoint(point: Vector3): number {
    const clampedPoint = _vector.copy(point).clamp(this.min, this.max);
    return clampedPoint.sub(point).len();
  }

  getBoundingSphere(target: Sphere): Sphere {
    this.getCenter(target.center);
    target.radius = this.getSize(_vector).len() * 0.5;
    return target;
  }

  intersect(box: Box3): Box3 {
    this.min.max(box.min);
    this.max.min(box.max);
    if (this.isEmpty()) this.makeEmpty();
    return this;
  }

  union(box: Box3): Box3 {
    this.min.min(box.min);
    this.max.max(box.max);
    return this;
  }

  applyMatrix4(matrix: Matrix4): Box3 {
    if (this.isEmpty()) return this;
    _points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix);
    _points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix);
    _points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix);
    _points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix);
    _points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix);
    this.setFromPoints(_points);
    return this;
  }

  translate(offset: Vector3): Box3 {
    this.min.add(offset);
    this.max.add(offset);
    return this;
  }

  equals(box: Box3): boolean {
    return box.min.equals(this.min) && box.max.equals(this.max);
  }
}

const _box = new Box3();

const _points = [
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
  new Vector3(),
];

const _vector = new Vector3();

export { Box3 };

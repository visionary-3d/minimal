import { Box3 } from "./Box3";
import { Line3 } from "./Line3";
import { Matrix3 } from "./Matrix3";
import { Matrix4 } from "./Matrix4";
import { Sphere } from "./Sphere";
import { Vector3 } from "./Vector3";

const _vector1: Vector3 = /*@__PURE__*/ new Vector3();
const _vector2: Vector3 = /*@__PURE__*/ new Vector3();
const _normalMatrix: Matrix3 = /*@__PURE__*/ new Matrix3();

class Plane {

	normal: Vector3;
	constant: number;

	constructor(normal: Vector3 = new Vector3(1, 0, 0), constant: number = 0) {

		// normal is assumed to be normalized

		this.normal = normal;
		this.constant = constant;

	}

	set(normal: Vector3, constant: number): Plane {

		this.normal.copy(normal);
		this.constant = constant;

		return this;

	}

	setComponents(x: number, y: number, z: number, w: number): Plane {

		this.normal.set(x, y, z);
		this.constant = w;

		return this;

	}

	setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): Plane {

		this.normal.copy(normal);
		this.constant = -point.dot(this.normal);

		return this;

	}

	setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): Plane {

		const normal: Vector3 = _vector1.subVectors(c, b).cross(_vector2.subVectors(a, b)).normalize();

		// Q: should an error be thrown if normal is zero (e.g. degenerate plane)?

		this.setFromNormalAndCoplanarPoint(normal, a);

		return this;

	}

	copy(plane: Plane): Plane {

		this.normal.copy(plane.normal);
		this.constant = plane.constant;

		return this;

	}

	normalize(): Plane {

		// Note: will lead to a divide by zero if the plane is invalid.

		const inverseNormalLength: number = 1.0 / this.normal.len();
		this.normal.multiplyScalar(inverseNormalLength);
		this.constant *= inverseNormalLength;

		return this;

	}

	negate(): Plane {

		this.constant *= -1;
		this.normal.negate();

		return this;

	}

	distanceToPoint(point: Vector3): number {

		return this.normal.dot(point) + this.constant;

	}

	distanceToSphere(sphere: Sphere): number {

		return this.distanceToPoint(sphere.center) - sphere.radius;

	}

	projectPoint(point: Vector3, target: Vector3): Vector3 {

		return target.copy(this.normal).multiplyScalar(-this.distanceToPoint(point)).add(point);

	}

	intersectLine(line: Line3, target: Vector3): Vector3 | null {

		const direction: Vector3 = line.delta(_vector1);

		const denominator: number = this.normal.dot(direction);

		if (denominator === 0) {

			// line is coplanar, return origin
			if (this.distanceToPoint(line.start) === 0) {

				return target.copy(line.start);

			}

			// Unsure if this is the correct method to handle this case.
			return null;

		}

		const t: number = -(line.start.dot(this.normal) + this.constant) / denominator;

		if (t < 0 || t > 1) {

			return null;

		}

		return target.copy(direction).multiplyScalar(t).add(line.start);

	}

	intersectsLine(line: Line3): boolean {

		// Note: this tests if a line intersects the plane, not whether it (or its end-points) are coplanar with it.

		const startSign: number = this.distanceToPoint(line.start);
		const endSign: number = this.distanceToPoint(line.end);

		return (startSign < 0 && endSign > 0) || (endSign < 0 && startSign > 0);

	}

	intersectsBox(box: Box3): boolean {

		return box.intersectsPlane(this);

	}

	intersectsSphere(sphere: Sphere): boolean {

		return sphere.intersectsPlane(this);

	}

	coplanarPoint(target: Vector3): Vector3 {

		return target.copy(this.normal).multiplyScalar(-this.constant);

	}

	applyMatrix4(matrix: Matrix4, optionalNormalMatrix?: Matrix3): Plane {

		const normalMatrix: Matrix3 = optionalNormalMatrix || _normalMatrix.getNormalMatrix(matrix);

		const referencePoint: Vector3 = this.coplanarPoint(_vector1).applyMatrix4(matrix);

		const normal: Vector3 = this.normal.applyMatrix3(normalMatrix).normalize();

		this.constant = -referencePoint.dot(normal);

		return this;

	}

	translate(offset: Vector3): Plane {

		this.constant -= offset.dot(this.normal);

		return this;

	}

	equals(plane: Plane): boolean {

		return plane.normal.equals(this.normal) && (plane.constant === this.constant);

	}

	clone(): Plane {

		return new Plane().copy(this);

	}

}

export { Plane };
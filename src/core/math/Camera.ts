import { Matrix4 } from "../../core/math/Matrix4";
import { Object3D } from "../../core/math/Object3D";

/**
 * Constructs a camera object. Can be extended to calculate projection matrices.
 */
export class Camera extends Object3D {
  /**
   * A projection matrix. Useful for projecting transforms.
   */
  readonly projectionMatrix = new Matrix4();
  /**
   * A view matrix. Useful for aligning transforms with the camera.
   */
  readonly viewMatrix = new Matrix4();

  /** Frustum aspect ratio. Default is `1` */
  public aspect = window.innerWidth / window.innerHeight;

  constructor() {
    super();
    this.matrixAutoUpdate = true;
  }

  equals(t: Camera) {
    return this.position.equals(t.position) && this.quaternion.equals(t.quaternion);
  }

  updateMatrix(): void {
    super.updateMatrix();
    if (this.matrixAutoUpdate) this.viewMatrix.copy(this.matrix).invert();
  }
}

/**
 * Constructs a camera with a perspective projection. Useful for 3D rendering.
 */
export class PerspectiveCamera extends Camera {
  constructor(
    /** Vertical field of view in degrees. Default is `75` */
    public fov = 75,
    /** Frustum aspect ratio. Default is `1` */
    public aspect = window.innerWidth / window.innerHeight,
    /** Frustum near plane (minimum). Default is `0.01` */
    public near = 0.01,
    /** Frustum far plane (maximum). Default is `1000` */
    public far = 1000
  ) {
    super();
  }

  updateMatrix(): void {
    super.updateMatrix();
    if (this.matrixAutoUpdate) this.projectionMatrix.perspective(this.fov, this.aspect, this.near, this.far);
  }

  clone() {
    return new PerspectiveCamera(this.fov, this.aspect, this.near, this.far);
  }
}

/**
 * Constructs a camera with an orthographic projection. Useful for 2D and isometric rendering.
 */
export class OrthographicCamera extends Camera {
  constructor(
    /** Frustum near plane (minimum). Default is `0.01` */
    public near = 0.01,
    /** Frustum far plane (maximum). Default is `1000` */
    public far = 1000,
    /** Frustum left plane. Default is `-1` */
    public left = -1,
    /** Frustum right plane. Default is `1` */
    public right = 1,
    /** Frustum bottom plane. Default is `-1` */
    public bottom = -1,
    /** Frustum top plane. Default is `1` */
    public top = 1,
    /** Frustum aspect ratio. Default is `1` */
    public aspect = window.innerWidth / window.innerHeight
  ) {
    super();
  }

  updateMatrix(): void {
    super.updateMatrix();
    if (this.matrixAutoUpdate)
      this.projectionMatrix.orthogonal(this.left, this.right, this.bottom, this.top, this.near, this.far, this.aspect);
  }

  clone() {
    return new OrthographicCamera(this.near, this.far, this.left, this.right, this.bottom, this.top, this.aspect);
  }
}

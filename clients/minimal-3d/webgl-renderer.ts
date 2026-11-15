/**
 * Milestone 72 — Minimal Native WebGL 3D Renderer
 *
 * Lightweight, dependency-free WebGL presentation layer rendering Scene3D.
 *
 * Invariants:
 * 1. Zero external 3D libraries (No Three.js, Babylon, Unity).
 * 2. Presentation-only: WebGL state never touches World Core.
 * 3. Renders simple unit primitives (box, cylinder, plane).
 */

import { Scene3D, Node3D } from './scene-3d.js';

// --- Pure Matrix Math Utilities (Column-Major 4x4) ---

export type Mat4 = Float32Array;

export function mat4Create(): Mat4 {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Perspective(
  out: Mat4,
  fovyRad: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = 2 * far * near * nf;
  out[15] = 0;
  return out;
}

export function mat4LookAt(
  out: Mat4,
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number]
): Mat4 {
  let z0 = eye[0] - center[0];
  let z1 = eye[1] - center[1];
  let z2 = eye[2] - center[2];
  let len = 1 / Math.hypot(z0, z1, z2);
  z0 *= len;
  z1 *= len;
  z2 *= len;

  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (!len) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len = 1 / len;
    x0 *= len;
    x1 *= len;
    x2 *= len;
  }

  let y0 = z1 * x2 - z2 * x1;
  let y1 = z2 * x0 - z0 * x2;
  let y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

export function mat4Multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}

export function mat4Model(
  out: Mat4,
  pos: { x: number; y: number; z: number },
  scale: { x: number; y: number; z: number }
): Mat4 {
  out[0] = scale.x; out[1] = 0;       out[2] = 0;       out[3] = 0;
  out[4] = 0;       out[5] = scale.y; out[6] = 0;       out[7] = 0;
  out[8] = 0;       out[9] = 0;       out[10] = scale.z;out[11] = 0;
  out[12] = pos.x;  out[13] = pos.y;  out[14] = pos.z;  out[15] = 1;
  return out;
}

// --- Primitive Mesh Generators ---

function createBoxVertices(): Float32Array {
  // 36 vertices with positions (3) and normals (3) -> 6 floats per vertex
  // Unit cube centered at origin with size 1x1x1 (-0.5 to 0.5)
  return new Float32Array([
    // Front face (Z+)
    -0.5, -0.5,  0.5,  0,  0,  1,
     0.5, -0.5,  0.5,  0,  0,  1,
     0.5,  0.5,  0.5,  0,  0,  1,
    -0.5, -0.5,  0.5,  0,  0,  1,
     0.5,  0.5,  0.5,  0,  0,  1,
    -0.5,  0.5,  0.5,  0,  0,  1,
    // Back face (Z-)
    -0.5, -0.5, -0.5,  0,  0, -1,
    -0.5,  0.5, -0.5,  0,  0, -1,
     0.5,  0.5, -0.5,  0,  0, -1,
    -0.5, -0.5, -0.5,  0,  0, -1,
     0.5,  0.5, -0.5,  0,  0, -1,
     0.5, -0.5, -0.5,  0,  0, -1,
    // Top face (Y+)
    -0.5,  0.5, -0.5,  0,  1,  0,
    -0.5,  0.5,  0.5,  0,  1,  0,
     0.5,  0.5,  0.5,  0,  1,  0,
    -0.5,  0.5, -0.5,  0,  1,  0,
     0.5,  0.5,  0.5,  0,  1,  0,
     0.5,  0.5, -0.5,  0,  1,  0,
    // Bottom face (Y-)
    -0.5, -0.5, -0.5,  0, -1,  0,
     0.5, -0.5, -0.5,  0, -1,  0,
     0.5, -0.5,  0.5,  0, -1,  0,
    -0.5, -0.5, -0.5,  0, -1,  0,
     0.5, -0.5,  0.5,  0, -1,  0,
    -0.5, -0.5,  0.5,  0, -1,  0,
    // Right face (X+)
     0.5, -0.5, -0.5,  1,  0,  0,
     0.5,  0.5, -0.5,  1,  0,  0,
     0.5,  0.5,  0.5,  1,  0,  0,
     0.5, -0.5, -0.5,  1,  0,  0,
     0.5,  0.5,  0.5,  1,  0,  0,
     0.5, -0.5,  0.5,  1,  0,  0,
    // Left face (X-)
    -0.5, -0.5, -0.5, -1,  0,  0,
    -0.5, -0.5,  0.5, -1,  0,  0,
    -0.5,  0.5,  0.5, -1,  0,  0,
    -0.5, -0.5, -0.5, -1,  0,  0,
    -0.5,  0.5,  0.5, -1,  0,  0,
    -0.5,  0.5, -0.5, -1,  0,  0,
  ]);
}

function createPlaneVertices(): Float32Array {
  // Horizontal plane on X-Z axis at Y=0, size 1x1 (-0.5 to 0.5)
  return new Float32Array([
    -0.5, 0, -0.5,  0, 1, 0,
    -0.5, 0,  0.5,  0, 1, 0,
     0.5, 0,  0.5,  0, 1, 0,
    -0.5, 0, -0.5,  0, 1, 0,
     0.5, 0,  0.5,  0, 1, 0,
     0.5, 0, -0.5,  0, 1, 0,
  ]);
}

function createCylinderVertices(segments = 16): Float32Array {
  // Cylinder aligned along Y axis (-0.5 to 0.5) with radius 0.5
  const data: number[] = [];
  const radius = 0.5;

  for (let i = 0; i < segments; i++) {
    const theta0 = (i / segments) * Math.PI * 2;
    const theta1 = ((i + 1) / segments) * Math.PI * 2;

    const x0 = Math.cos(theta0) * radius;
    const z0 = Math.sin(theta0) * radius;
    const x1 = Math.cos(theta1) * radius;
    const z1 = Math.sin(theta1) * radius;

    // Normal for side
    const nx0 = Math.cos(theta0);
    const nz0 = Math.sin(theta0);
    const nx1 = Math.cos(theta1);
    const nz1 = Math.sin(theta1);

    // Side quad (2 triangles)
    // Triangle 1
    data.push(x0, -0.5, z0, nx0, 0, nz0);
    data.push(x1, -0.5, z1, nx1, 0, nz1);
    data.push(x1,  0.5, z1, nx1, 0, nz1);
    // Triangle 2
    data.push(x0, -0.5, z0, nx0, 0, nz0);
    data.push(x1,  0.5, z1, nx1, 0, nz1);
    data.push(x0,  0.5, z0, nx0, 0, nz0);

    // Top cap triangle
    data.push(0, 0.5, 0, 0, 1, 0);
    data.push(x0, 0.5, z0, 0, 1, 0);
    data.push(x1, 0.5, z1, 0, 1, 0);

    // Bottom cap triangle
    data.push(0, -0.5, 0, 0, -1, 0);
    data.push(x1, -0.5, z1, 0, -1, 0);
    data.push(x0, -0.5, z0, 0, -1, 0);
  }

  return new Float32Array(data);
}

// --- WebGL Shaders ---

const VERTEX_SHADER_SRC = `
attribute vec3 aPosition;
attribute vec3 aNormal;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  gl_Position = uProjection * uView * worldPos;
}
`;

const FRAGMENT_SHADER_SRC = `
precision mediump float;

uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
  float diff = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.35;
  vec3 finalColor = uColor * (ambient + diff * 0.65);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

/**
 * Minimal WebGL 3D Renderer for Scene3D.
 */
export class WebGLRenderer {
  private readonly gl: WebGLRenderingContext;
  private program!: WebGLProgram;
  private boxBuffer!: WebGLBuffer;
  private planeBuffer!: WebGLBuffer;
  private cylinderBuffer!: WebGLBuffer;
  private cylinderVertexCount = 0;

  // Shader locations
  private aPositionLoc = 0;
  private aNormalLoc = 0;
  private uProjLoc!: WebGLUniformLocation;
  private uViewLoc!: WebGLUniformLocation;
  private uModelLoc!: WebGLUniformLocation;
  private uColorLoc!: WebGLUniformLocation;

  // Matrices
  private readonly projMatrix = mat4Create();
  private readonly viewMatrix = mat4Create();
  private readonly modelMatrix = mat4Create();

  // Camera settings
  public cameraEye: [number, number, number] = [0, 25, 35];
  public cameraCenter: [number, number, number] = [0, 3, 0];
  public cameraUp: [number, number, number] = [0, 1, 0];

  /**
   * Sets the camera position and target explicitly.
   */
  public setCamera(
    eye: [number, number, number],
    center: [number, number, number],
    up?: [number, number, number]
  ): void {
    this.cameraEye = eye;
    this.cameraCenter = center;
    if (up) this.cameraUp = up;
  }

  /**
   * Configures a third-person follow camera framing a target entity position.
   */
  public setThirdPersonCamera(
    target: { x: number; y: number; z: number },
    distance = 11.0,
    height = 4.5,
    pitchOffset = 1.6
  ): void {
    this.cameraCenter = [target.x, target.y + pitchOffset, target.z];
    this.cameraEye = [target.x, target.y + height, target.z + distance];
    this.cameraUp = [0, 1, 0];
  }

  /**
   * Configures a street-level human eye-height camera.
   */
  public setStreetLevelCamera(target: { x: number; y: number; z: number }): void {
    this.cameraCenter = [target.x, target.y + 1.6, target.z - 8.0];
    this.cameraEye = [target.x, target.y + 1.8, target.z + 1.5];
    this.cameraUp = [0, 1, 0];
  }

  /**
   * Configures an elevated isometric overview camera showing the full neighborhood block.
   */
  public setOverviewCamera(): void {
    this.cameraEye = [0, 24, 32];
    this.cameraCenter = [0, 3, 0];
    this.cameraUp = [0, 1, 0];
  }

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      throw new Error('WebGL not supported by this browser/canvas');
    }
    this.gl = gl;
    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;

    // Compile Shaders
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SRC);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, FRAGMENT_SHADER_SRC);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    this.program = program;

    // Attribute & Uniform locations
    this.aPositionLoc = gl.getAttribLocation(program, 'aPosition');
    this.aNormalLoc = gl.getAttribLocation(program, 'aNormal');
    this.uProjLoc = gl.getUniformLocation(program, 'uProjection')!;
    this.uViewLoc = gl.getUniformLocation(program, 'uView')!;
    this.uModelLoc = gl.getUniformLocation(program, 'uModel')!;
    this.uColorLoc = gl.getUniformLocation(program, 'uColor')!;

    // Create Primitive Buffers
    const boxData = createBoxVertices();
    this.boxBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.boxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, boxData, gl.STATIC_DRAW);

    const planeData = createPlaneVertices();
    this.planeBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.planeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planeData, gl.STATIC_DRAW);

    const cylinderData = createCylinderVertices(16);
    this.cylinderVertexCount = cylinderData.length / 6;
    this.cylinderBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cylinderBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cylinderData, gl.STATIC_DRAW);

    // State setup
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.88, 0.92, 0.95, 1.0); // Soft sky blue background
  }

  /**
   * Renders the given Scene3D to the WebGL canvas.
   */
  public render(scene: Scene3D): void {
    const gl = this.gl;
    const width = gl.canvas.width;
    const height = gl.canvas.height;

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);

    // Update Projection Matrix (FOV 45 deg)
    mat4Perspective(this.projMatrix, (45 * Math.PI) / 180, width / height, 0.1, 200.0);
    gl.uniformMatrix4fv(this.uProjLoc, false, this.projMatrix);

    // Update View Matrix
    mat4LookAt(this.viewMatrix, this.cameraEye, this.cameraCenter, this.cameraUp);
    gl.uniformMatrix4fv(this.uViewLoc, false, this.viewMatrix);

    // Render each visible node in scene
    for (const node of scene.getAllNodes()) {
      if (!node.visible || !node.primitive) continue;
      this.renderNode(node);
    }
  }

  private renderNode(node: Node3D): void {
    const gl = this.gl;

    // Calculate Model Matrix
    const worldPos = node.getWorldPosition();
    mat4Model(this.modelMatrix, worldPos, node.dimensions);
    gl.uniformMatrix4fv(this.uModelLoc, false, this.modelMatrix);

    // Set Color
    gl.uniform3fv(this.uColorLoc, node.color);

    // Select buffer & draw
    let buffer: WebGLBuffer;
    let vertexCount: number;

    if (node.primitive === 'box') {
      buffer = this.boxBuffer;
      vertexCount = 36;
    } else if (node.primitive === 'plane') {
      buffer = this.planeBuffer;
      vertexCount = 6;
    } else if (node.primitive === 'cylinder') {
      buffer = this.cylinderBuffer;
      vertexCount = this.cylinderVertexCount;
    } else {
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(this.aPositionLoc);
    gl.vertexAttribPointer(this.aPositionLoc, 3, gl.FLOAT, false, 24, 0);

    gl.enableVertexAttribArray(this.aNormalLoc);
    gl.vertexAttribPointer(this.aNormalLoc, 3, gl.FLOAT, false, 24, 12);

    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  }
}

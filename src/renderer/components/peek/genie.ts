// Draws a peek's card bending on its way, as a genie does (motion.ts), in a
// canvas over the box behind the peek. The page Chromium draws in a
// <wren-view> follows a CSS transform only as a rectangle, and a genie bends,
// so the card is drawn here, by a picture of its page, or its colour alone
// while its page has drawn nothing, on a fine mesh of rows, each placed
// where its spring has got to. Its corners are rounded, and its edge drawn,
// in the card's own space, so they bend with it.

/** Where a point of the card is drawn, in points from the box's top left: `u` across it and `v` down it, each from 0 to 1. */
export type Place = (u: number, v: number) => [x: number, y: number];

/** How the card looks in a frame: its corners' radius, in points of the card as it rests, its opacity, and its inner edge's opacity. */
export type Look = { corner: number; opacity: number; edge: number };

// The mesh: rows down the card, which bend it smoothly, and a few columns.
const ROWS = 48;
const COLUMNS = 4;

const VERTEX = `#version 300 es
in vec2 place;
in vec2 uv;
uniform vec2 box;
out vec2 at;
void main() {
  at = uv;
  gl_Position = vec4(place.x / box.x * 2.0 - 1.0, 1.0 - place.y / box.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 at;
uniform sampler2D picture;
uniform vec2 size;
uniform float corner;
uniform float opacity;
uniform float edge;
out vec4 colour;
void main() {
  // How far outside the card's rounded shape the point is, in its points.
  vec2 point = (at - 0.5) * size;
  vec2 q = abs(point) - (size * 0.5 - corner);
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  float pixel = max(fwidth(outside), 1e-4);
  float inside = clamp(0.5 - outside / pixel, 0.0, 1.0);
  float line = clamp(1.0 - abs(outside + 0.5 * pixel) / pixel, 0.0, 1.0) * edge;
  vec3 drawn = mix(texture(picture, at).rgb, vec3(1.0), line);
  float alpha = inside * opacity;
  colour = vec4(drawn * alpha, alpha);
}`;

/** A canvas a card can be drawn bending in. */
export class Genie {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly places: WebGLBuffer;
  private readonly picture: WebGLTexture;
  private readonly placed = new Float32Array((ROWS + 1) * (COLUMNS + 1) * 2);
  private readonly count: number;

  /** The genie of `canvas`, or null where it can't draw one. */
  static of(canvas: HTMLCanvasElement): Genie | null {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: true });
    if (!gl) return null;
    try {
      return new Genie(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.program);

    // Each point's place in the card, which never changes, and its place in
    // the box, which every frame does.
    const uvs = new Float32Array(this.placed.length);
    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column <= COLUMNS; column++) {
        const index = (row * (COLUMNS + 1) + column) * 2;
        uvs[index] = column / COLUMNS;
        uvs[index + 1] = row / ROWS;
      }
    }
    attribute(gl, this.program, "uv", uvs, gl.STATIC_DRAW);
    this.places = attribute(gl, this.program, "place", this.placed, gl.DYNAMIC_DRAW);

    const triangles: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const a = row * (COLUMNS + 1) + column;
        const b = a + COLUMNS + 1;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const indices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangles), gl.STATIC_DRAW);
    this.count = triangles.length;

    this.picture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Draws the card by `image`, a picture of its page, or by `colour` alone, any colour CSS takes. */
  show(image: HTMLImageElement | null, colour: string) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.picture);
    if (image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      // Smooth as it is drawn far smaller than it is.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba(colour));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  /**
   * Draws a frame: each point of the card where `place` puts it, in a box
   * `box` points wide and high, and the card `width` by `height` points as
   * it rests, looking as `look` says.
   */
  draw(box: { width: number; height: number }, card: { width: number; height: number }, place: Place, look: Look) {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const scale = window.devicePixelRatio || 1;
    const width = Math.round(box.width * scale);
    const height = Math.round(box.height * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column <= COLUMNS; column++) {
        const index = (row * (COLUMNS + 1) + column) * 2;
        const [x, y] = place(column / COLUMNS, row / ROWS);
        this.placed[index] = x;
        this.placed[index + 1] = y;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.places);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.placed);

    const uniform = (name: string) => gl.getUniformLocation(this.program, name);
    gl.uniform2f(uniform("box"), box.width, box.height);
    gl.uniform2f(uniform("size"), card.width, card.height);
    gl.uniform1f(uniform("corner"), Math.min(look.corner, card.width / 2, card.height / 2));
    gl.uniform1f(uniform("opacity"), look.opacity);
    gl.uniform1f(uniform("edge"), look.edge);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }

  /** Draws nothing. */
  clear() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
}

// The program of `vertex` and `fragment`, or why there is none.
function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment]
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "");
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "");
  return program;
}

// Feeds `values`, two to a point, to the program's attribute `name`.
function attribute(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  values: Float32Array,
  usage: number
): WebGLBuffer {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, usage);
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  return buffer;
}

// `colour`, any colour CSS takes, as one pixel's red, green, blue and alpha.
function rgba(colour: string): Uint8Array {
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext("2d")!;
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  return new Uint8Array(context.getImageData(0, 0, 1, 1).data);
}

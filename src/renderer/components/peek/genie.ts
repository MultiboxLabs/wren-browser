// Draws a peek's card bending on its way, as a genie does (motion.ts), in a
// canvas over the box behind the peek. The page Chromium draws in a
// <wren-view> follows a CSS transform only as a rectangle, and a genie bends,
// so the card is drawn here, by a picture of its page, or its colour alone
// while its page has drawn nothing, on a fine mesh of rows, each placed
// where its spring has got to. Its corners are rounded, and its edge and
// shadow drawn, in the card's own space, so they bend with it.

/** Where a point of the card is drawn, in points from the box's top left: `u` across it and `v` down it, each from 0 to 1. */
export type Place = (u: number, v: number) => Point;

/** Two numbers for a point: its place in the box, in points from its top left, or in the card, from 0 to 1 across it and down it. */
export type Point = [x: number, y: number];

/** A black shadow under the card, as CSS gives one: how far down it falls and how wide it blurs, in points of the card as it rests, and its opacity. */
export type Shadow = { drop: number; blur: number; alpha: number };

/**
 * How the card looks in a frame: the radius of its top and bottom corners,
 * in points of the card as it rests, its opacity, its inner edge's opacity,
 * and its shadow, if it is drawn here.
 */
export type Look = { corner: { top: number; bottom: number }; opacity: number; edge: number; shadow?: Shadow };

// The card's mesh: rows down the card, which bend it smoothly, and a few
// columns. Its shadow's is the same, with one more of each at every side,
// reaching out as far as the shadow does.
const ROWS = 48;
const COLUMNS = 4;

const VERTEX = `#version 300 es
layout(location = 0) in vec2 place;
layout(location = 1) in vec2 uv;
uniform vec2 box;
out vec2 at;
void main() {
  at = uv;
  gl_Position = vec4(place.x / box.x * 2.0 - 1.0, 1.0 - place.y / box.y * 2.0, 0.0, 1.0);
}`;

// How far outside the card's rounded shape a point of it is, in its points.
const SHAPE = `
uniform vec2 size;
uniform vec2 corners;
float outsideOf(vec2 point) {
  float corner = point.y < 0.0 ? corners.x : corners.y;
  vec2 q = abs(point) - (size * 0.5 - corner);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
}`;

const CARD = `#version 300 es
precision highp float;
in vec2 at;
uniform sampler2D picture;
uniform float opacity;
uniform float edge;
out vec4 colour;
${SHAPE}
void main() {
  float outside = outsideOf((at - 0.5) * size);
  float pixel = max(fwidth(outside), 1e-4);
  float inside = clamp(0.5 - outside / pixel, 0.0, 1.0);
  float line = clamp(1.0 - abs(outside + 0.5 * pixel) / pixel, 0.0, 1.0) * edge;
  vec3 drawn = mix(texture(picture, at).rgb, vec3(1.0), line);
  float alpha = inside * opacity;
  colour = vec4(drawn * alpha, alpha);
}`;

// The card's shadow, `shadow` its drop, blur and opacity (`Shadow`). A blur
// fades across about twice its radius, as CSS's does, half dark at the
// shape's edge.
const SHADOW = `#version 300 es
precision highp float;
in vec2 at;
uniform float opacity;
uniform vec3 shadow;
out vec4 colour;
${SHAPE}
void main() {
  float outside = outsideOf((at - 0.5) * size - vec2(0.0, shadow.x));
  float alpha = shadow.z * opacity * (1.0 - smoothstep(-shadow.y, shadow.y, outside));
  colour = vec4(0.0, 0.0, 0.0, alpha);
}`;

/** A canvas a card can be drawn bending in. */
export class Genie {
  private readonly gl: WebGL2RenderingContext;
  private readonly card: { program: WebGLProgram; mesh: Mesh };
  private readonly shadow: { program: WebGLProgram; mesh: Mesh };
  private readonly picture: WebGLTexture;
  private readonly uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

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
    this.card = { program: link(gl, VERTEX, CARD), mesh: new Mesh(gl, COLUMNS, ROWS) };
    this.shadow = { program: link(gl, VERTEX, SHADOW), mesh: new Mesh(gl, COLUMNS + 2, ROWS + 2) };
    // Each point's place in the card never changes; the shadow's depend on
    // how far it reaches, which each frame says.
    const { mesh } = this.card;
    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column <= COLUMNS; column++) mesh.map(column, row, [column / COLUMNS, row / ROWS]);
    }
    mesh.upload("uvs");

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
   * the size of `box`, the card the size of `card` as it rests, looking as
   * `look` says.
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

    const { mesh } = this.card;
    for (let row = 0; row <= ROWS; row++) {
      for (let column = 0; column <= COLUMNS; column++) mesh.place(column, row, place(column / COLUMNS, row / ROWS));
    }
    mesh.upload("places");

    const largest = Math.min(card.width, card.height) / 2;
    const shared = (program: WebGLProgram) => {
      gl.useProgram(program);
      gl.uniform2f(this.uniform(program, "box"), box.width, box.height);
      gl.uniform2f(this.uniform(program, "size"), card.width, card.height);
      gl.uniform2f(
        this.uniform(program, "corners"),
        Math.min(look.corner.top, largest),
        Math.min(look.corner.bottom, largest)
      );
      gl.uniform1f(this.uniform(program, "opacity"), look.opacity);
    };

    if (look.shadow && look.shadow.alpha > 0) {
      const { drop, blur, alpha } = look.shadow;
      // As far out as the shadow shows: where it drops to, and its blur's
      // fade past that (SHADOW).
      this.placeShadow(card, drop + blur + 1);
      shared(this.shadow.program);
      gl.uniform3f(this.uniform(this.shadow.program, "shadow"), drop, blur, alpha);
      this.shadow.mesh.draw();
    }

    shared(this.card.program);
    gl.uniform1f(this.uniform(this.card.program, "edge"), look.edge);
    mesh.draw();
  }

  /** Draws nothing. */
  clear() {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  // Places the shadow's mesh: the card's, as it is placed, with a ring round
  // it `reach` points of the card further out, each edge's rows and columns
  // carried straight on, so the ring is as wide, for how small the card is
  // drawn there, as the shadow.
  private placeShadow(card: { width: number; height: number }, reach: number) {
    const from = this.card.mesh;
    const to = this.shadow.mesh;
    const across = reach / card.width;
    const down = reach / card.height;
    // A point of the card's row `row`, or one carried on past its ends.
    const inRow = (column: number, row: number): Point => {
      if (column < 0) return past(from.placeOf(0, row), from.placeOf(COLUMNS, row), across);
      if (column > COLUMNS) return past(from.placeOf(COLUMNS, row), from.placeOf(0, row), across);
      return from.placeOf(column, row);
    };
    // Past the top and bottom rows, carried on by as many of the gaps
    // between the rows there as the reach is of the card's height.
    const at = (column: number, row: number): Point => {
      if (row < 0) return past(inRow(column, 0), inRow(column, 1), down * ROWS);
      if (row > ROWS) return past(inRow(column, ROWS), inRow(column, ROWS - 1), down * ROWS);
      return inRow(column, row);
    };
    const share = (index: number, count: number, beyond: number) =>
      index < 0 ? -beyond : index > count ? 1 + beyond : index / count;
    for (let row = -1; row <= ROWS + 1; row++) {
      for (let column = -1; column <= COLUMNS + 1; column++) {
        to.place(column + 1, row + 1, at(column, row));
        to.map(column + 1, row + 1, [share(column, COLUMNS, across), share(row, ROWS, down)]);
      }
    }
    to.upload("places");
    to.upload("uvs");
  }

  // The uniform `name` of `program`, looked up once.
  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let found = this.uniforms.get(program);
    if (!found) this.uniforms.set(program, (found = new Map()));
    if (!found.has(name)) found.set(name, this.gl.getUniformLocation(program, name));
    return found.get(name) ?? null;
  }
}

// A grid of points `columns` by `rows` cells, drawn as two triangles a
// cell. Each point has a place in the box and a place in the card, which
// reach the program once `upload`ed.
class Mesh {
  private readonly gl: WebGL2RenderingContext;
  private readonly columns: number;
  private readonly values: { places: Float32Array; uvs: Float32Array };
  private readonly buffers: { places: WebGLBuffer; uvs: WebGLBuffer };
  private readonly vertices: WebGLVertexArrayObject;
  private readonly count: number;

  constructor(gl: WebGL2RenderingContext, columns: number, rows: number) {
    this.gl = gl;
    this.columns = columns;
    const size = (rows + 1) * (columns + 1) * 2;
    this.values = { places: new Float32Array(size), uvs: new Float32Array(size) };
    this.vertices = gl.createVertexArray();
    gl.bindVertexArray(this.vertices);
    // At the locations the vertex shader gives them.
    this.buffers = { places: attribute(gl, 0, this.values.places), uvs: attribute(gl, 1, this.values.uvs) };
    const triangles: number[] = [];
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column;
        const b = a + columns + 1;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangles), gl.STATIC_DRAW);
    this.count = triangles.length;
    gl.bindVertexArray(null);
  }

  /** Where the point at `column` and `row` is placed in the box. */
  placeOf(column: number, row: number): Point {
    const index = this.indexOf(column, row);
    return [this.values.places[index], this.values.places[index + 1]];
  }

  /** Places the point at `column` and `row` at `point` in the box. */
  place(column: number, row: number, point: Point) {
    this.values.places.set(point, this.indexOf(column, row));
  }

  /** Maps the point at `column` and `row` to `uv` in the card, each from 0 to 1 across it and down it. */
  map(column: number, row: number, uv: Point) {
    this.values.uvs.set(uv, this.indexOf(column, row));
  }

  upload(values: "places" | "uvs") {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[values]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.values[values]);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vertices);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  private indexOf(column: number, row: number): number {
    return (row * (this.columns + 1) + column) * 2;
  }
}

// `a` carried on past itself, away from `b`, by `by` of the way between them.
function past(a: Point, b: Point, by: number): Point {
  return [a[0] + (a[0] - b[0]) * by, a[1] + (a[1] - b[1]) * by];
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

// A buffer of `values`, two to a point, fed to the attribute at `location`
// of the vertex array bound.
function attribute(gl: WebGL2RenderingContext, location: number, values: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.DYNAMIC_DRAW);
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

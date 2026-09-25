// Small static glTF 2.0 / GLB loader for authored, non-animated environment meshes.
// Intentionally keeps Neon Coast's renderer independent of a third-party engine.
(() => {
  'use strict';

  const GLB_MAGIC = 0x46546c67;
  const JSON_CHUNK = 0x4e4f534a;
  const BIN_CHUNK = 0x004e4942;
  const componentInfo = {
    5120: { bytes: 1, read: 'getInt8', signed: true },
    5121: { bytes: 1, read: 'getUint8' },
    5122: { bytes: 2, read: 'getInt16', signed: true },
    5123: { bytes: 2, read: 'getUint16' },
    5125: { bytes: 4, read: 'getUint32' },
    5126: { bytes: 4, read: 'getFloat32' },
  };
  const typeWidth = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  function identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        out[column * 4 + row] = a[row] * b[column * 4]
          + a[4 + row] * b[column * 4 + 1]
          + a[8 + row] * b[column * 4 + 2]
          + a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  }

  function nodeMatrix(node) {
    if (node.matrix) return new Float32Array(node.matrix);
    const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale || [1, 1, 1];
    const [tx, ty, tz] = node.translation || [0, 0, 0];
    const out = identity();
    out[0] = (1 - 2 * (y * y + z * z)) * sx;
    out[1] = (2 * (x * y + z * w)) * sx;
    out[2] = (2 * (x * z - y * w)) * sx;
    out[4] = (2 * (x * y - z * w)) * sy;
    out[5] = (1 - 2 * (x * x + z * z)) * sy;
    out[6] = (2 * (y * z + x * w)) * sy;
    out[8] = (2 * (x * z + y * w)) * sz;
    out[9] = (2 * (y * z - x * w)) * sz;
    out[10] = (1 - 2 * (x * x + y * y)) * sz;
    out[12] = tx;
    out[13] = ty;
    out[14] = tz;
    return out;
  }

  function point(matrix, value) {
    const [x, y, z] = value;
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ];
  }

  function normal(matrix, value) {
    const a = matrix[0], b = matrix[4], c = matrix[8];
    const d = matrix[1], e = matrix[5], f = matrix[9];
    const g = matrix[2], h = matrix[6], i = matrix[10];
    const c00 = e * i - f * h, c01 = f * g - d * i, c02 = d * h - e * g;
    const c10 = c * h - b * i, c11 = a * i - c * g, c12 = b * g - a * h;
    const c20 = b * f - c * e, c21 = c * d - a * f, c22 = a * e - b * d;
    const det = a * c00 + b * c01 + c * c02 || 1;
    let x = (c00 * value[0] + c01 * value[1] + c02 * value[2]) / det;
    let y = (c10 * value[0] + c11 * value[1] + c12 * value[2]) / det;
    let z = (c20 * value[0] + c21 * value[1] + c22 * value[2]) / det;
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length];
  }

  function linearToSrgb(value) {
    return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(Math.max(0, value), 1 / 2.4) - 0.055;
  }

  function parseGLB(buffer) {
    const bytes = new DataView(buffer);
    if (bytes.byteLength < 20 || bytes.getUint32(0, true) !== GLB_MAGIC) throw new Error('Not a GLB file.');
    if (bytes.getUint32(4, true) !== 2) throw new Error('Only glTF 2.0 GLB files are supported.');
    if (bytes.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB length header does not match the file.');

    let cursor = 12, document = null, binaryStart = -1, binaryLength = 0;
    while (cursor < bytes.byteLength) {
      if (cursor + 8 > bytes.byteLength) throw new Error('Truncated GLB chunk header.');
      const length = bytes.getUint32(cursor, true), type = bytes.getUint32(cursor + 4, true);
      cursor += 8;
      if (cursor + length > bytes.byteLength) throw new Error('GLB chunk extends beyond the file.');
      if (type === JSON_CHUNK) {
        const jsonText = new TextDecoder().decode(new Uint8Array(buffer, cursor, length)).replace(/\0+\s*$/, '');
        document = JSON.parse(jsonText);
      } else if (type === BIN_CHUNK) {
        binaryStart = cursor;
        binaryLength = length;
      }
      cursor += length;
    }
    if (!document || binaryStart < 0) throw new Error('GLB is missing its JSON or binary chunk.');
    if (document.buffers?.length !== 1 || (document.buffers[0].uri && document.buffers[0].uri.length)) {
      throw new Error('Only self-contained GLB buffers are supported.');
    }
    const rawMaterials = (document.materials || []).map((source, index) => {
      const pbr = source.pbrMetallicRoughness || {};
      const extension = source.extensions?.KHR_materials_emissive_strength;
      return {
        name: source.name || `Material_${index}`,
        baseColorFactor: pbr.baseColorFactor || [1, 1, 1, 1],
        metallicFactor: pbr.metallicFactor ?? 1,
        roughnessFactor: pbr.roughnessFactor ?? 1,
        emissiveFactor: (source.emissiveFactor || [0, 0, 0]).map(value => linearToSrgb(value * (extension?.emissiveStrength || 1))),
      };
    });

    function readAccessor(accessorIndex) {
      const accessor = document.accessors?.[accessorIndex];
      const view = accessor && document.bufferViews?.[accessor.bufferView];
      const info = accessor && componentInfo[accessor.componentType];
      const width = accessor && typeWidth[accessor.type];
      if (!accessor || !view || !info || !width || accessor.sparse) throw new Error('Unsupported or missing glTF accessor.');
      const stride = view.byteStride || info.bytes * width;
      const start = binaryStart + (view.byteOffset || 0) + (accessor.byteOffset || 0);
      if (stride < info.bytes * width || start + Math.max(0, accessor.count - 1) * stride + info.bytes * width > binaryStart + binaryLength) {
        throw new Error('glTF accessor is out of bounds.');
      }
      return index => {
        const value = [];
        for (let component = 0; component < width; component++) {
          let item = bytes[info.read](start + index * stride + component * info.bytes, true);
          if (accessor.normalized && info.signed) item = Math.max(-1, item / (2 ** (info.bytes * 8 - 1) - 1));
          else if (accessor.normalized) item /= 2 ** (info.bytes * 8) - 1;
          value.push(item);
        }
        return value;
      };
    }

    const models = Object.create(null), anchors = Object.create(null), visited = new Set();
    const scene = document.scenes?.[document.scene || 0];
    if (!scene) throw new Error('GLB has no active scene.');
    function visit(nodeIndex, parentMatrix) {
      if (visited.has(nodeIndex)) throw new Error('GLB node hierarchy contains a cycle or shared node.');
      const node = document.nodes?.[nodeIndex];
      if (!node) throw new Error('GLB scene references a missing node.');
      if (node.skin !== undefined || node.weights || node.extensions?.KHR_draco_mesh_compression) {
        throw new Error('Skinned, morphed, and Draco-compressed GLB meshes are outside this static loader.');
      }
      visited.add(nodeIndex);
      const world = multiply(parentMatrix, nodeMatrix(node));
      if (node.mesh !== undefined) {
        const sourceMesh = document.meshes?.[node.mesh];
        if (!sourceMesh) throw new Error(`GLB node ${node.name || nodeIndex} references a missing mesh.`);
        const primitives = [];
        for (const source of sourceMesh.primitives || []) {
          if (source.mode !== undefined && source.mode !== 4) throw new Error('Only triangle-list GLB primitives are supported.');
          const positionIndex = source.attributes?.POSITION, normalIndex = source.attributes?.NORMAL;
          if (positionIndex === undefined) throw new Error('GLB triangle primitive has no POSITION attribute.');
          const readPosition = readAccessor(positionIndex), positionAccessor = document.accessors[positionIndex];
          const readNormal = normalIndex === undefined ? null : readAccessor(normalIndex);
          const readColor = source.attributes?.COLOR_0 === undefined ? null : readAccessor(source.attributes.COLOR_0);
          const readIndex = source.indices === undefined ? null : readAccessor(source.indices);
          const indices = readIndex
            ? Array.from({ length: document.accessors[source.indices].count }, (_, index) => readIndex(index)[0])
            : Array.from({ length: positionAccessor.count }, (_, index) => index);
          if (indices.length % 3) throw new Error('GLB triangle primitive index count is not divisible by three.');
          const material = rawMaterials[source.material] || {
            name: 'Default', baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1, emissiveFactor: [0, 0, 0],
          };
          const positions = [], normals = [], colors = [];
          for (let triangle = 0; triangle < indices.length; triangle += 3) {
            const p = [0, 1, 2].map(corner => point(world, readPosition(indices[triangle + corner])));
            let faceNormal = null;
            if (!readNormal) {
              const u = p[1].map((value, axis) => value - p[0][axis]);
              const v = p[2].map((value, axis) => value - p[0][axis]);
              faceNormal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
              const length = Math.hypot(...faceNormal) || 1;
              faceNormal = faceNormal.map(value => value / length);
            }
            for (let corner = 0; corner < 3; corner++) {
              positions.push(...p[corner]);
              normals.push(...(readNormal ? normal(world, readNormal(indices[triangle + corner])) : faceNormal));
              const vertex = readColor ? readColor(indices[triangle + corner]) : [1, 1, 1];
              for (let channel = 0; channel < 3; channel++) {
                colors.push(linearToSrgb((material.baseColorFactor[channel] ?? 1) * (vertex[channel] ?? 1)));
              }
            }
          }
          primitives.push({
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            material,
          });
        }
        models[node.name || sourceMesh.name || `MeshNode_${nodeIndex}`] = { name: node.name || sourceMesh.name, primitives };
      }
      if (node.extras && node.name?.startsWith('ANCHOR_')) {
        anchors[node.name] = { position: point(world, [0, 0, 0]), extras: node.extras };
      }
      for (const child of node.children || []) visit(child, world);
    }
    for (const root of scene.nodes || []) visit(root, identity());
    return { models, anchors, materials: rawMaterials };
  }

  async function load(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GLB request failed: ${response.status} ${response.statusText}`);
    return parseGLB(await response.arrayBuffer());
  }

  window.NeonCoastAssetLoader = Object.freeze({ load, parseGLB });
})();

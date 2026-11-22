// Tiny stack VM for make.fun ISA v1: /input/<id>/{program,input}.bin
// -> /output/<id>/{stdout.bin, exit.txt}. 32-bit wrapping ints, 256-value
// stack, 64-deep call stack, 256 memory words, 1e6 steps, 65536 output
// bytes, traps 2..11 each with its own exit code. Deterministic.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode table: byte -> [immediate bytes, values popped, values pushed].
const T = {};
for (const s of '0,0,0,0;1,1,0,1;2,4,0,1;3,0,1,0;4,0,1,2;5,0,2,2;6,0,2,3;7,0,3,3;16,0,2,1;17,0,2,1;18,0,2,1;19,0,2,1;20,0,2,1;21,0,2,1;22,0,2,1;23,0,1,1;24,0,2,1;25,0,2,1;26,0,2,1;27,0,1,1;28,0,2,1;29,0,2,1;30,0,2,1;32,0,2,1;33,0,2,1;34,0,2,1;48,2,0,0;49,2,1,0;50,2,1,0;51,2,0,0;52,0,0,0;64,0,1,1;65,0,2,0;80,0,1,0;81,0,1,0;82,0,0,1;83,0,1,0'.split(';')) {
  const v = s.split(',').map(Number);
  T[v[0]] = [v[1], v[2], v[3]];
}

function run(p, inp) {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  const dig = new Uint8Array(12);
  let sp = 0, cp = 0, pc = 0, steps = 0, olen = 0, ip = 0;
  const fin = (code) => ({ out: out.slice(0, olen), code });
  for (;;) {
    if (steps === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const op = p[pc];
    const e = T[op];
    if (e === undefined) return fin(5);
    if (pc + e[0] >= n) return fin(9);
    steps++;
    const nx = pc + 1 + e[0];
    if (sp < e[1]) return fin(2);
    if (sp - e[1] + e[2] > 256) return fin(3);
    pc = nx;
    switch (op) {
      case 0: return fin(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 23: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 27: D[sp - 1] = ~D[sp - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (b === 0) return fin(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 20) { if (b === 0) return fin(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 21) { if (b === 0) return fin(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (b === 0) return fin(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
        break;
      }
      case 48: case 49: case 50: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) { const v = D[--sp]; take = op === 49 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 51:
        if (cp === 64) return fin(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 52:
        if (cp === 0) return fin(8);
        pc = C[--cp];
        break;
      case 64: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) return fin(6);
        D[sp - 1] = M[addr];
        break;
      }
      case 65: {
        const addr = D[sp - 1];
        if (addr < 0 || addr >= 256) return fin(6);
        const v = D[sp - 2];
        sp -= 2;
        M[addr] = v;
        break;
      }
      case 80: {
        let v = D[sp - 1], k = 0, neg = false;
        if (v < 0) { neg = true; v = -v; }
        if (v === 0) dig[k++] = 48;
        else while (v > 0) { dig[k++] = 48 + (v % 10); v = Math.floor(v / 10); }
        if (neg) dig[k++] = 45;
        if (olen + k > 65536) return fin(11);
        sp--;
        for (let i = k - 1; i >= 0; i--) out[olen++] = dig[i];
        break;
      }
      case 81:
        if (olen + 1 > 65536) return fin(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 82: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83: return fin(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const ent of readdirSync(I, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
  if (!ent.isDirectory()) continue;
  const id = ent.name;
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}

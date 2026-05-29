#!/usr/bin/env node
/**
 * WHISPR-101 codemod: rewrite relative imports that point into src/ to the
 * "@/..." path alias. Mechanical, idempotent, AST-free (regex over import/export
 * specifiers + jest.mock/require calls). Run from repo root: node scripts/codemod-relative-to-alias.js
 *
 * A relative specifier is only rewritten when it resolves to a path inside src/.
 *
 * KNOWN LIMITATION: virtual asset mocks `jest.mock("../x.png", () => 1, { virtual: true })`
 * must stay relative — the alias mapper would force physical resolution and fail.
 * After running, revert any such virtual-mock specifiers back to relative by hand.
 * Same-directory ("./x") and sibling imports are left untouched ONLY when the
 * resulting alias would not improve them; we still convert any "../" that escapes
 * the current dir, and convert "./" too so the whole tree is alias-based.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Recursively collect .ts/.tsx files under src/, excluding declaration files. */
function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Matches the specifier in: import ... from "X"; export ... from "X";
// import("X"); require("X"); jest.mock("X", ...). Captures the quote + path.
const SPEC_RE =
  /(\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bjest\.mock\s*\(\s*|\bjest\.requireActual\s*\(\s*|\bjest\.requireMock\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g;

function toAlias(fileAbsDir, spec) {
  const resolved = path.resolve(fileAbsDir, spec);
  // Only rewrite if it lands inside src/.
  if (resolved !== SRC && !resolved.startsWith(SRC + path.sep)) return null;
  let rel = path.relative(SRC, resolved).split(path.sep).join("/");
  if (rel === "") return null;
  return `@/${rel}`;
}

let filesChanged = 0;
let importsRewritten = 0;

for (const file of collect(SRC)) {
  const dir = path.dirname(file);
  const original = fs.readFileSync(file, "utf8");
  let localCount = 0;
  const updated = original.replace(SPEC_RE, (match, kw, quote, spec) => {
    const alias = toAlias(dir, spec);
    if (!alias) return match;
    localCount++;
    return `${kw}${quote}${alias}${quote}`;
  });
  if (localCount > 0 && updated !== original) {
    fs.writeFileSync(file, updated);
    filesChanged++;
    importsRewritten += localCount;
  }
}

console.log(
  `codemod done: ${importsRewritten} specifiers rewritten across ${filesChanged} files`,
);

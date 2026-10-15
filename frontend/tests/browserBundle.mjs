import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"

const frontend = path.resolve(import.meta.dirname, "..")

// Bundle the real installed CommonJS packages and TSX components in memory.
// No primitive, React implementation, DOM method or consumer is mocked.
export function browserBundle(entry) {
  const files = new Map()
  const modules = []
  function add(filename, supplied) {
    if (files.has(filename)) return files.get(filename)
    const id = modules.length
    files.set(filename, id)
    modules.push("")
    let source = supplied ?? readFileSync(filename, "utf8")
    if (/\.tsx?$/.test(filename)) {
      source = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      } }).outputText
    }
    const resolve = createRequire(filename)
    source = source.replace(/\brequire\(["']([^"']+)["']\)/g, (_match, name) => {
      let dependency
      if (name.startsWith("@/")) {
        const base = path.join(frontend, name.slice(2))
        dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(existsSync)
        assert.ok(dependency, `Cannot resolve ${name}`)
      } else {
        try { dependency = resolve.resolve(name === "jszip" ? "jszip/dist/jszip.min.js" : name) }
        catch (error) {
          const base = path.resolve(path.dirname(filename), name)
          dependency = [`${base}.ts`, `${base}.tsx`].find(existsSync)
          if (!dependency) throw error
        }
      }
      return `require(${add(dependency)})`
    })
    modules[id] = `function(module,exports,require){\n${source}\n}`
    return id
  }
  const entryId = add(path.join(frontend, "tests/components/fixture.tsx"), entry)
  return `globalThis.process={env:{NODE_ENV:"development"}};
    const factories=[${modules.join(",")}], cache={};
    function require(id){if(cache[id])return cache[id].exports;
      const module=cache[id]={exports:{}};factories[id](module,module.exports,require);return module.exports;}
    require(${entryId});`
}


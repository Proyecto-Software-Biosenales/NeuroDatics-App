import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

// projectErrors.ts reads the edition from "@/lib/appMode"; load it once per edition.
function load(isLocal) {
  const source = ts.transpileModule(readFileSync(new URL("./projectErrors.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  new Function("module", "exports", "require", source)(loaded, loaded.exports, (name) => {
    assert.equal(name, "@/lib/appMode")
    return { IS_LOCAL_MODE: isLocal }
  })
  return loaded.exports
}

const server = load(false)
const local = load(true)

test("the API wrapper around a failure is removed", () => {
  assert.equal(server.describeFailure(new Error("API 400: Ya existe un proyecto")).message, "Ya existe un proyecto")
  assert.equal(server.describeFailure(new Error("Error subiendo archivo: sin espacio")).message, "sin espacio")
})

test("the detail of a JSON failure is shown, not the JSON", () => {
  const error = new Error('API 422: {"detail":"El nombre es obligatorio"}')
  assert.equal(server.describeFailure(error).message, "El nombre es obligatorio")
})

test("a failure without a message uses the fallback given by the caller", () => {
  assert.equal(server.describeFailure("nada", "No se pudo procesar la carpeta.").message, "No se pudo procesar la carpeta.")
  assert.equal(server.describeFailure(undefined).message, "No se pudieron guardar los cambios del proyecto.")
})

test("cancelling is reported as a cancellation", () => {
  assert.equal(server.describeFailure(new Error("Subida cancelada.")).cancelled, true)
  assert.equal(server.describeFailure(new Error("The user aborted")).cancelled, true)
  assert.equal(server.describeFailure(new Error("API 500: fallo")).cancelled, false)
})

test("the server edition asks to renew the Google Drive connection", () => {
  const result = server.describeFailure(new Error("API 500: invalid_grant"))
  assert.equal(result.needsDriveRenewal, true)
  assert.match(result.message, /La conexión con Google Drive necesita renovarse/)
})

test("the student edition never mentions Google Drive", () => {
  const result = local.describeFailure(new Error("API 500: invalid_grant"))
  assert.equal(result.needsDriveRenewal, false)
  assert.equal(result.message, "invalid_grant")
})

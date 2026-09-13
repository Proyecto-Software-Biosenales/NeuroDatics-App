import { getFileRelativePath, toArchivePath } from "./folderStructure";

export const MAX_EXPERIMENT_ZIP_BYTES = 500 * 1024 * 1024;

export async function packageExperimentFolder(files: File[], signal: AbortSignal): Promise<File> {
  const assertActive = () => {
    if (signal.aborted) throw new Error("Subida cancelada por el usuario.");
  };
  assertActive();
  if (!files.length) throw new Error("Debes seleccionar una carpeta para continuar.");
  const JSZip = (await import("jszip")).default;
  assertActive();
  const zip = new JSZip();
  const folderName = getFileRelativePath(files[0]).replace(/\\/g, "/").split("/")[0];
  const paths = new Set<string>();
  for (const file of files) {
    const relativePath = toArchivePath(getFileRelativePath(file), folderName);
    if (!relativePath || paths.has(relativePath)) {
      throw new Error(`La carpeta contiene una ruta duplicada o vacía: ${relativePath}`);
    }
    paths.add(relativePath);
    zip.file(relativePath, file, { compression: "STORE" });
  }
  const blob = await zip.generateAsync({ type: "blob" }, assertActive);
  assertActive();
  // ZIP headers add bytes beyond the source-file total checked by the picker.
  if (blob.size > MAX_EXPERIMENT_ZIP_BYTES) {
    throw new Error("El ZIP generado supera el máximo de 500MB. Reduce el tamaño de la carpeta.");
  }
  return new File([blob], `${folderName}.zip`, { type: "application/zip" });
}

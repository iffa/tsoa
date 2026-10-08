import { extname } from 'path';
import { globSync } from 'node:fs';

/**
 * Loads all exported classes from the given directory.
 */
export function importClassesFromDirectories(directories: string[], formats = ['.ts']): string[] {
  const allFiles = directories.reduce((allDirs, dir) => {
    // therefore do not do any normalization of dir path
    return allDirs.concat(globSync(dir));
  }, [] as string[]);

  return allFiles.filter(file => {
    const dtsExtension = file.substring(file.length - 5, file.length);
    return formats.indexOf(extname(file)) !== -1 && dtsExtension !== '.d.ts';
  });
}

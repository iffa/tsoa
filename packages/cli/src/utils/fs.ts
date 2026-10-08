import * as fs from 'fs';
import { promisify } from 'util';

export const fsExists = promisify(fs.exists);
export const fsMkDir = promisify(fs.mkdir);
export const fsWriteFile = promisify(fs.writeFile);
export const fsReadFile = promisify(fs.readFile);

export async function fsWriteFileIfChanged(fileName: string, content: string): Promise<void> {
  try {
    if ((await fsReadFile(fileName, 'utf8')) === content) {
      return;
    }
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  await fsWriteFile(fileName, content, 'utf8');
}

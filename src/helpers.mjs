import fs from 'node:fs';
import path from 'node:path';

export function testFolderLocation(pathName) {
  const dir = path.dirname(pathName);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    } 
  } catch (err) {
    throw new Error(`Error creating database folder: ${JSON.stringify(err)}`);
  }
}